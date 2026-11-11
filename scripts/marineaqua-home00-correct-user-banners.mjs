import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const WP = "https://admin.marine-aqua.io.vn";
const SOURCE = "https://marine-aqua.vn";
const ID = "home_00";
const TARGETS = [
  {filename:"banner1-1-1380x672.jpg",path:"/wp-content/uploads/2026/08/banner1-1-1380x672.jpg",title:"Banner Marine Aqua 1"},
  {filename:"banner2-8-1440x672.jpg",path:"/wp-content/uploads/2026/08/banner2-8-1440x672.jpg",title:"Banner Marine Aqua 2"},
  {filename:"banner3-4-1440x672.jpg",path:"/wp-content/uploads/2026/08/banner3-4-1440x672.jpg",title:"Banner Marine Aqua 3"},
];
const dir="home00-correct-banner-evidence"; await mkdir(dir,{recursive:true});
// Use the native WordPress upload control when REST nonce is unavailable.
const report={table:ID,targetCount:TARGETS.length,steps:[],success:false};
const record=(name,details={})=>{report.steps.push({name,...details});console.log("BANNER_CORRECTION_"+name+"="+JSON.stringify(details));};
const u=process.env.WP_ADMIN_USERNAME,p=process.env.WP_ADMIN_PASSWORD;
if(!u||!p)throw Error("CMS credentials unavailable");
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:950}});
  const api=async(path)=>{
    for(let attempt=1;attempt<=3;attempt++){
      try{
        const r=await context.request.get(WP+path,{timeout:30000});
        if(!r.ok())throw Error("CMS API "+r.status()+" "+path);
        return await r.json();
      }catch(error){
        if(attempt===3 || !/ECONNRESET|socket hang up|ETIMEDOUT|ECONNREFUSED/i.test(String(error)))throw error;
        await new Promise(resolve=>setTimeout(resolve,attempt*1000));
      }
    }
  };
  const read=async()=>{const t=await api("/wp-json/tablepress/v1/table/"+ID);
    if(t.id!==ID||t.title!=="Banner trang chủ"||
       ["title","image","link","mobile"].some((k,i)=>t.fields?.[i]?.key!==k))throw Error("Home_00 identity mismatch");
    return t;
  };
  const before=await read();
  const imageString=(row)=>String(typeof row?.image==="string"?row.image:row?.image?.src||"");
  if(!Array.isArray(before.items)||before.items.length<1||!imageString(before.items[0]).includes("banner1-1-690x336"))throw Error("Existing banner unknown; refuse modification");
  const already=TARGETS.every((x,i)=>imageString(before.items[i]).includes(x.filename));
  if(already){record("ALREADY_DONE",{rows:before.items.length});report.success=true;}
  else {
    const expectedOld=["banner1-1-690x336","slide-pro-reef.jpg","slide-marine-aqua-1.jpg"];
    if(before.items.length!==3 || expectedOld.some((name,i)=>!imageString(before.items[i]).includes(name)))
      throw Error("Home_00 differs from previously verified three legacy slides; refuse overwrite");
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
    // WordPress Plupload initializes asynchronously after DOMContentLoaded.
    // If the HTML5 uploader has not initialized, classic multipart form is used.
    await page.waitForFunction(()=>document.querySelector('input[type="file"][id^="html5_"]')||
      document.querySelector('#file-form input[type="file"]'),null,{timeout:18000});
    await page.waitForTimeout(1800);
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
          const pluploadInput=page.locator('input[type="file"][id^="html5_"]').first();
          const hasPlupload=await pluploadInput.count()>0;
          const fileInput=hasPlupload ? pluploadInput : page.locator('#async-upload');
          if(!await fileInput.count())throw Error("No native WordPress media uploader or REST nonce");
          record("UPLOAD_MODE",{name:asset.filename,plupload:hasPlupload});
          await fileInput.setInputFiles({name:asset.filename,mimeType:"image/jpeg",buffer:asset.bytes});
          if(!hasPlupload) {
            const submission=await page.evaluate(()=>{
              const input=document.querySelector('#async-upload');
              const form=input?.form;
              if(!form || form.method.toLowerCase()!=="post" || form.enctype!=="multipart/form-data" ||
                 !form.action.startsWith(location.origin+"/wp-admin/"))
                throw Error("Unexpected classic upload form; refuse submit");
              const submit=form.querySelector('input[type="submit"],button[type="submit"]');
              if(!submit)throw Error("Native classic WordPress submit missing");
              form.requestSubmit(submit);
              return true;
            });
            if(!submission)throw Error("Native classic upload submit failed");
            await page.waitForLoadState("domcontentloaded",{timeout:45000}).catch(()=>{});
            await page.goto(WP+"/wp-admin/media-new.php",{waitUntil:"domcontentloaded",timeout:45000});
          }
          for(let attempt=0;attempt<18;attempt++){
            await page.waitForTimeout(1200);
            const list=await api("/wp-json/wp/v2/media?search="+encodeURIComponent(asset.filename.replace(/\\.jpg$/,""))+"&per_page=100&_fields=id,slug,source_url");
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
    if(grid.length!==5 ||grid[0].join("|")!=="title|image|link|mobile" ||
       !String(grid[2][1]).includes("banner1-1-690x336") ||
       !String(grid[3][1]).includes("slide-pro-reef.jpg") ||
       !String(grid[4][1]).includes("slide-marine-aqua-1.jpg") ||grid[1][0]!=="Tên banner")
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
    if(beforeWrite.items.length!==3 || ["banner1-1-690x336","slide-pro-reef.jpg","slide-marine-aqua-1.jpg"]
        .some((name,i)=>!imageString(beforeWrite.items[i]).includes(name)))
      throw Error("Concurrent Home_00 modification, refuse overwrite");
    record("WRITE_START",{oldRows:grid.length,replacementItems:3});
    const rows=await page.evaluate(({assets,imageMarkup})=>{
      for(let i=0;i<3;i++){
        window.tp.editor.setValueFromCoords(0,2+i,assets[i].title);
        window.tp.editor.setValueFromCoords(1,2+i,imageMarkup[i]);
        window.tp.editor.setValueFromCoords(2,2+i,"");
        window.tp.editor.setValueFromCoords(3,2+i,"");
      }
      return window.tp.table.data.slice(2).map(row=>({title:row[0],imgPresent:String(row[1]).includes("wp-image-")}));
    },{assets:assets.map(({title})=>({title})),imageMarkup});
    if(rows.length!==3||rows.some(r=>!r.imgPresent))throw Error("Replacement rows not populated");
    await page.getByRole("button",{name:/Save Changes/i}).first().click();
    await page.waitForTimeout(1800);
    const after=await read();
    report.finalCount=after.items?.length;
    if(after.items?.length!==3 || TARGETS.some((t,i)=>!imageString(after.items[i]).includes(t.filename)))
      throw Error("Table REST readback missing the three exact user-approved banners in order");
    record("REST_VERIFIED",{count:after.items.length,filenames:TARGETS.map(x=>x.filename)});
    report.success=true;
    await page.screenshot({path:dir+"/esc-table-after.png",fullPage:false});
    await page.close();
  }
  await context.close();
}catch(e){report.error=String(e.message||e).slice(0,450);record("FAIL",{reason:report.error});process.exitCode=1;}
finally{await browser.close();await writeFile(dir+"/result.json",JSON.stringify(report,null,2)+"\n");}
