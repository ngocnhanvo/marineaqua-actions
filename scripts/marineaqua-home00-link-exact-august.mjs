import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn";
const SOURCE="https://marine-aqua.vn";
const TABLE="home_00";
const approved=[
  {name:"Banner Marine Aqua 1",file:"banner1-1-1380x672.jpg",width:1380,height:672},
  {name:"Banner Marine Aqua 2",file:"banner2-8-1440x672.jpg",width:1440,height:672},
  {name:"Banner Marine Aqua 3",file:"banner3-4-1440x672.jpg",width:1440,height:672},
];
const dir="home00-user-banners-verification";await mkdir(dir,{recursive:true});
const evidence={table:TABLE,expected:approved.map(x=>x.file),saved:false,verified:false,sourceVerified:[]};
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:960}});
  const api=async path=>{
    for(let attempt=1;attempt<=3;attempt++){
      try{
        const response=await context.request.get(WP+path,{timeout:30000});
        if(!response.ok())throw Error("REST HTTP "+response.status());
        return await response.json();
      }catch(error){
        if(attempt===3 || !/ECONNRESET|socket hang up|ETIMEDOUT/i.test(String(error)))throw error;
        await new Promise(r=>setTimeout(r,attempt*1250));
      }
    }
  };
  const read=async()=>{const table=await api("/wp-json/tablepress/v1/table/"+TABLE);
    if(table.id!==TABLE || table.title!=="Banner trang chủ" ||
      ["title","image","link","mobile"].some((key,i)=>table.fields?.[i]?.key!==key))
      throw Error("Home_00 identity/schema changed");
    return table;
  };
  const getImage=item=>String(typeof item?.image==="string"?item.image:item?.image?.src||"");
  const urls=approved.map(x=>SOURCE+"/wp-content/uploads/2026/08/"+x.file);
  const before=await read();
  if(!Array.isArray(before.items)||before.items.length!==3)throw Error("Expected exactly three Home_00 rows");
  const already=approved.every((x,i)=>getImage(before.items[i]).includes(urls[i]));
  if(!already){
    const oldFiles=["banner1-1-690x336","slide-pro-reef.jpg","slide-marine-aqua-1.jpg"];
    if(oldFiles.some((x,i)=>!getImage(before.items[i]).includes(x)))
      throw Error("Home_00 has unexpected content; refusing overwrite");
  }
  for(let i=0;i<approved.length;i++){
    const response=await context.request.get(urls[i],{timeout:30000,failOnStatusCode:false,maxRedirects:1});
    const bytes=await response.body();
    const mime=String(response.headers()["content-type"]||"");
    if(response.status()!==200 || !mime.startsWith("image/jpeg") ||
       bytes.length<5000 || bytes.length>5000000 || bytes[0]!==0xff || bytes[1]!==0xd8)
      throw Error("Source image verification failed: "+approved[i].file+" HTTP "+response.status());
    evidence.sourceVerified.push({name:approved[i].file,bytes:bytes.length});
  }
  console.log("USER_BANNERS_SOURCE=PASS "+JSON.stringify(evidence.sourceVerified));
  if(!already) {
    const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
    if(!username||!password)throw Error("WordPress credentials missing");
    const page=await context.newPage();
    await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
    await page.locator("#user_login").fill(username);
    await page.locator("#user_pass").fill(password);
    await page.locator("#wp-submit").click();
    await page.goto(WP+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+TABLE,{waitUntil:"domcontentloaded",timeout:45000});
    if(!page.url().includes("table_id="+TABLE))throw Error("Expected native ESC Table editor");
    await page.waitForFunction(()=>Boolean(window.tp?.editor?.setValueFromCoords&&window.tp?.table?.data),null,{timeout:25000});
    const oldData=await page.evaluate(()=>window.tp.table.data);
    if(oldData.length!==5||oldData[0].join("|")!=="title|image|link|mobile"||
       oldData[1][0]!=="Tên banner" ||
       oldFiles.some((x,i)=>!String(oldData[i+2][1]||"").includes(x)))
      throw Error("Native editor contents differ from protected REST state");
    const latest=await read();
    if(latest.items.length!==3||oldFiles.some((x,i)=>!getImage(latest.items[i]).includes(x)))
      throw Error("Concurrent WordPress edit detected");
    const html=approved.map((item,i)=>{
      // Exact image URL provided by site owner, data lives only in WordPress table.
      const src=urls[i];
      return '<img src="'+src+'" width="'+item.width+'" height="'+item.height+
        '" alt="'+item.name+'" loading="lazy" decoding="async" />';
    });
    await page.evaluate(({approved,html})=>{
      for(let i=0;i<3;i++){
        window.tp.editor.setValueFromCoords(0,i+2,approved[i].name);
        window.tp.editor.setValueFromCoords(1,i+2,html[i]);
        window.tp.editor.setValueFromCoords(2,i+2,"");
        window.tp.editor.setValueFromCoords(3,i+2,"");
      }
    },{approved,html});
    const edited=await page.evaluate(()=>window.tp.table.data.slice(2).map(x=>({title:x[0],image:x[1]})));
    if(edited.some((item,i)=>item.title!==approved[i].name || !item.image.includes(urls[i])))
      throw Error("WordPress native editor data verification failed");
    await page.getByRole("button",{name:/Save Changes/i}).first().click();
    await page.waitForTimeout(1500);
    evidence.saved=true;
    await page.screenshot({path:dir+"/home00-admin-after.png",fullPage:false});
    await page.close();
  }
  const after=await read();
  evidence.actual=after.items.map(item=>({title:item.title,image:getImage(item).slice(0,250)}));
  evidence.verified=after.items.length===3 && approved.every((x,i)=>
    after.items[i].title===x.name && getImage(after.items[i]).includes(urls[i]));
  if(!evidence.verified)throw Error("WordPress REST readback failed strict three-banner order");
  console.log("USER_BANNERS_HOME00_REST=PASS count=3 "+JSON.stringify(approved.map(x=>x.file)));
  await context.close();
}catch(error){
  evidence.error=String(error.message||error).slice(0,500);
  console.error("USER_BANNERS_HOME00=FAIL "+evidence.error);
  process.exitCode=1;
}finally{
  await writeFile(dir+"/result.json",JSON.stringify(evidence,null,2)+"\n");
  await browser.close();
}
