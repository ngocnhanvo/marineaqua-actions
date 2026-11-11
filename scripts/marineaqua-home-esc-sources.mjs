import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn";
const TABLES=[
  ["home_03","ProductCategory"],
  ["home_04","Product"],
  ["home_05","Product"],
  ["home_06","Product"],
  ["home_07","Product"],
  ["home_08","Product"],
];
const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
if(!username||!password)throw Error("Missing WordPress admin credentials");
const dir="home-esc-api-source-evidence";
await mkdir(dir,{recursive:true});
const output={tables:[],success:false};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 const page=await context.newPage();
 page.on("dialog",async dialog=>{if(dialog.type()==="confirm")await dialog.accept();else await dialog.dismiss()});
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(username);
 await page.locator("#user_pass").fill(password);
 await page.locator("#wp-submit").click();
 if(page.url().includes("wp-login.php"))throw Error("Login did not authorize editor");
 const read=async id=>{
   const r=await context.request.get(WP+"/wp-json/tablepress/v1/table/"+id,{timeout:30000,failOnStatusCode:false});
   if(!r.ok())throw Error("ESC Table REST unavailable: "+id+" HTTP "+r.status());
   return r.json();
 };
 for(const [id,source] of TABLES){
   const before=await read(id);
   const old=String(before?.meta?.api||"");
   const row={id,source,before:old};
   output.tables.push(row);
   if(old===source){row.status="ALREADY_CORRECT";console.log("ESC_SOURCE_REUSED="+JSON.stringify(row));continue;}
   if(old&&old!==source)throw Error("Existing other source; refusing overwrite "+id);
   await page.goto(WP+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+id,{waitUntil:"domcontentloaded",timeout:45000});
   const input=page.locator("#js_custom_api");
   await input.waitFor({state:"visible",timeout:20000});
   if((await input.inputValue()).trim()!==old)throw Error("UI/REST source mismatch "+id);
   await input.fill(source);
   await page.getByRole("button",{name:/Save Changes/i}).first().click();
   let dto=null;
   for(let attempt=0;attempt<6;attempt++){
     await page.waitForTimeout(950);
     dto=await read(id);
     if(dto.meta?.api===source)break;
   }
   row.after=String(dto?.meta?.api||"");
   if(row.after!==source)throw Error("ESC Table native Save did not persist API source: "+id);
   if(dto.title!==before.title||JSON.stringify(dto.fields)!==JSON.stringify(before.fields)||
      JSON.stringify(dto.items)!==JSON.stringify(before.items))throw Error("Unexpected ESC Table data mutation: "+id);
   row.status="SAVE_READBACK_PASS";
   console.log("ESC_SOURCE_SAVED="+JSON.stringify(row));
   await page.screenshot({path:dir+"/"+id+".png",fullPage:false});
 }
 output.success=true;
 await context.close();
}catch(e){
 output.error=String(e.message||e).slice(0,300);
 console.error("ESC_SOURCE_FAILED="+output.error);
 process.exitCode=1;
}finally{
 await browser.close();
 await writeFile(dir+"/result.json",JSON.stringify(output,null,2)+"\n");
}
