import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const WP = "https://admin.marine-aqua.io.vn";
const SOURCE = "https://marine-aqua.vn";
const ID = "home_00";
const TARGETS = [
  {filename:"slide-pro-reef.jpg",path:"/wp-content/uploads/2020/06/slide-pro-reef.jpg",title:"Tropic Marin Pro Reef"},
  {filename:"slide-marine-aqua-1.jpg",path:"/wp-content/uploads/2020/06/slide-marine-aqua-1.jpg",title:"Marine Aqua"},
];
const dir="home00-import-evidence"; await mkdir(dir,{recursive:true});
const report={table:ID,targetCount:TARGETS.length,steps:[],success:false};
const record=(name,details={})=>{report.steps.push({name,...details});console.log("BANNER_IMPORT_"+name+"="+JSON.stringify(details));};
const u=process.env.WP_ADMIN_USERNAME,p=process.env.WP_ADMIN_PASSWORD;
if(!u||!p)throw Error("CMS credentials unavailable");
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:950}});
  const api=async(path)=>{const r=await context.request.get(WP+path,{timeout:30000});if(!r.ok())throw Error("CMS API "+r.status()+" "+path);return r.json();};
  const read=async()=>{const t=await api("/wp-json/tablepress/v1/table/"+ID);
    if(t.id!==ID||t.title!=="Banner trang chủ"||
       ["title","image","link","mobile"].some((k,i)=>t.fields?.[i]?.key!==k))throw Error("Home_00 identity mismatch");
    return t;
  };
  const before=await read();
  const imageString=(row)=>String(typeof row?.image==="string"?row.image:row?.image?.src||"");
  if(!Array.isArray(before.items)||before.items.length<1||!imageString(before.items[0]).includes("banner1-1-690x336"))throw Error("Existing banner unknown; refuse modification");
  const already=TARGETS.filter(x=>before.items.some(row=>imageString(row).includes(x.filename)));
  if(already.length===TARGETS.length){record("ALREADY_DONE",{rows:before.items.length});report.success=true;}
  else {
    if(before.items.length!==1)throw Error("Unexpected partial/mixed Home_00; manual recovery required");
    const assets=[];
    for(const target of TARGETS) {
      const url=SOURCE+target.path;
      const res=await context.request.get(url,{timeout:35000,maxRedirects:1,failOnStatusCode:false});
      const bytes=await res.body();
      if(!res.ok()||!/^image\/(jpeg|jpg)$/i.test(String(res.headers()["content-type"]||"").split(";")[0])||
         bytes.length<5000||bytes.length>10000000||bytes[0]!==0xff||bytes[1]!==0xd8)
        throw Error("Source banner missing or invalid "+target.filename+" http="+res.status());
      assets.push({...target,bytes});
      record("SOURCE_VERIFIED",{filename:target.filename,bytes:bytes.length});
    }
    const page=await context.newPage();
    await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
    await page.locator("#user_login").fill(u);await page.locator("#user_pass").fill(p);await page.locator("#wp-submit").click();
    if(page.url().includes("wp-login.php"))throw Error("Admin login rejected");
    await page.goto(WP+"/wp-admin/media-new.php",{waitUntil:"domcontentloaded",timeout:45000});
    const nonceCandidates=await page.evaluate(()=>({
      api:window.wpApiSettings?.nonce||"",
      apiAlt:window.wp?.apiSettings?.nonce||"",
      uploader:window._wpPluploadSettings?.defaults?.multipart_params?._wpnonce||"",
      media:window.wp?.media?.view?.settings?.nonce?.sendToEditor||"",
      fileInputs:[...document.querySelectorAll('input[type="file"]')].map(x=>({id:x.id,name:x.name})),
    }));
    record("MEDIA_UPLOAD_CONTROLS",{api:!!nonceCandidates.api,apiAlt:!!nonceCandidates.apiAlt,
       uploader:!!nonceCandidates.uploader,media:!!nonceCandidates.media,inputs:nonceCandidates.fileInputs});
    const nonce=String(nonceCandidates.api||nonceCandidates.apiAlt||"");
    const existing=await api("/wp-json/wp/v2/media?per_page=100&_fields=id,slug,source_url");
    const ids=[];
    for(const asset of assets) {
      let media=existing.find(x=>String(x.source_url||"").split("/").pop()===asset.filename);
      if(!media) {
        if(nonce) {
          const res=await context.request.post(WP+"/wp-json/wp/v2/media",{
            headers:{"X-WP-Nonce":nonce,"Content-Type":"image/jpeg",
             "Content-Disposition":'attachment; filename="'+asset.filename+'"'},
            data:asset.bytes,timeout:60000,failOnStatusCode:false});
          if(!res.ok())throw Error("Media upload rejected "+asset.filename+" http="+res.status());
          media=await res.json();
        } else {
          const fileInput=page.locator('input[type="file"]').first();
          if(!await fileInput.count())throw Error("No native WordPress media uploader or REST nonce");
          await fileInput.setInputFiles({name:asset.filename,mimeType:"image/jpeg",buffer:asset.bytes});
          const submit=page.locator('#html-upload, input[name="html-upload"], input[type="submit"][value*="Upload"]').first();
          if(await submit.count()) await submit.click();
          for(let attempt=0;attempt<10;attempt++){
            await page.waitForTimeout(1200);
            const list=await api("/wp-json/wp/v2/media?per_page=100&_fields=id,slug,source_url");
            media=list.find(x=>String(x.source_url||"").split("/").pop()===asset.filename);
            if(media)break;
          }
          if(!media)throw Error("Native Media Library upload missing after readback: "+asset.filename);
        }
        record("MEDIA_UPLOADED",{name:asset.filename,id:media.id});
      } else record("MEDIA_REUSED",{name:asset.filename,id:media.id});
      if(!Number.isInteger(media.id)||media.id<1)throw Error("Invalid WordPress media ID");
      ids.push(media.id);
    }
    await page.goto(WP+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+ID,{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction(()=>Boolean(window.tp?.editor?.setValueFromCoords&&window.tp?.table?.data&&window.wp?.media?.editor?.send?.attachment),null,{timeout:25000});
    const grid=await page.evaluate(()=>window.tp.table.data);
    if(grid.length!==3 ||grid[0].join("|")!=="title|image|link|mobile" ||
       !String(grid[2][1]).includes("banner1-1-690x336") ||grid[1][0]!=="Tên banner")
      throw Error("Home_00 data changed since preflight");
    const imageMarkup=[];
    for(let i=0;i<ids.length;i++){
      const html=await page.evaluate(async ({id,title})=>{
        const attachment=window.wp.media.attachment(id);
        await new Promise((resolve,reject)=>attachment.fetch().done(resolve).fail(reject));
        return await new Promise((resolve,reject)=>window.wp.media.editor.send.attachment(
          {align:"none",size:"full",link:"none",alt:title},attachment.toJSON()).done(resolve).fail(reject));
      },{id:ids[i],title:assets[i].title});
      if(typeof html!=="string"||!html.includes("<img")||!html.includes("wp-image-"+ids[i]))
        throw Error("WordPress native image markup missing "+assets[i].filename);
      imageMarkup.push(html);
    }
    const beforeWrite=await read();
    if(beforeWrite.items.length!==1)throw Error("Concurrent table modification");
    record("WRITE_START",{oldRows:grid.length,newItems:2});
    for(let i=0;i<2;i++){
      const expectedRows=4+i;
      await page.evaluate(()=>{
        const input=document.querySelector("#rows-append-number");
        if(!input || input.value!=="1")throw Error("Native Add Row count differs");
        const button=document.evaluate('following::button[normalize-space(.)="Add"][1]',input,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;
        if(!(button instanceof HTMLButtonElement))throw Error("Missing native Add Rows button");
        button.click();
      });
      await page.waitForFunction(n=>window.tp?.table?.data?.length===n,expectedRows,{timeout:20000});
    }
    const rows=await page.evaluate(({assets,imageMarkup})=>{
      for(let i=0;i<2;i++){
        window.tp.editor.setValueFromCoords(0,3+i,assets[i].title);
        window.tp.editor.setValueFromCoords(1,3+i,imageMarkup[i]);
        window.tp.editor.setValueFromCoords(2,3+i,"");
        window.tp.editor.setValueFromCoords(3,3+i,""); // shared desktop/mobile
      }
      return window.tp.table.data.slice(3).map(row=>({title:row[0],imgPresent:String(row[1]).includes("wp-image-")}));
    },{assets:assets.map(({title})=>({title})),imageMarkup});
    if(rows.length!==2||rows.some(r=>!r.imgPresent))throw Error("New rows not populated");
    await page.getByRole("button",{name:/Save Changes/i}).first().click();
    await page.waitForTimeout(1800);
    const after=await read();
    report.finalCount=after.items?.length;
    if(after.items?.length!==3 || TARGETS.some(t=>!after.items.some(row=>imageString(row).includes(t.filename))))
      throw Error("Table REST readback missing imported banners");
    record("REST_VERIFIED",{count:after.items.length,filenames:TARGETS.map(x=>x.filename)});
    report.success=true;
    await page.screenshot({path:dir+"/esc-table-after.png",fullPage:false});
    await page.close();
  }
  await context.close();
}catch(e){report.error=String(e.message||e).slice(0,450);record("FAIL",{reason:report.error});process.exitCode=1;}
finally{await browser.close();await writeFile(dir+"/result.json",JSON.stringify(report,null,2)+"\n");}
