import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const origin = "https://admin.marine-aqua.io.vn";
const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
if(!username||!password)throw new Error("CMS_WRITE_BLOCKED: admin credentials missing");
const dir="cms-section-implementation-evidence";
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
let result={operation:"native-create-first-section",pageId:82454,requestedTable:"home_03",created:false};
try{
 const context=await browser.newContext();
 const pre=await context.request.get(origin+"/wp-json/tablepress/v1/tables/prefix/all?per_page=100&page=1",{timeout:30000});
 if(!pre.ok())throw new Error("CMS_WRITE_BLOCKED: inventory HTTP "+pre.status());
 const old=await pre.json();
 result.preexisting=Array.isArray(old)?old.map(x=>x.id):null;
 if(!Array.isArray(old))throw new Error("CMS_WRITE_BLOCKED: unexpected inventory response");
 // Never create duplicates on retries, and never change unrelated tables.
 if(old.length!==0) {
   result.status="SKIPPED_EXISTING_TABLES";
   console.log("CMS_CREATE_SKIPPED existing_tables="+old.length);
 }else{
   const page=await context.newPage();
   await page.goto(origin+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
   await page.locator("#user_login").fill(username);
   await page.locator("#user_pass").fill(password);
   await page.locator("#wp-submit").click();
   await page.goto(origin+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:45000});
   if(!page.url().includes("page=tablepress_add"))throw new Error("CMS_WRITE_BLOCKED: editor unavailable");
   const name=page.locator('input[name="table[name]"]');
   const rows=page.locator('input[name="table[rows]"]');
   const cols=page.locator('input[name="table[columns]"]');
   await name.waitFor({state:"visible",timeout:20000});
   await name.fill("Home 03 - Danh mục sản phẩm");
   await rows.fill("2");
   await cols.fill("5");
   await page.screenshot({path:dir+"/before-create.png"});
   await page.getByRole("button",{name:"Add Table"}).click();
   await page.waitForTimeout(2200);
   const url=page.url();
   result.afterCreateURLPath=new URL(url).pathname;
   result.editPanel=await page.locator("#tablepress-edit-screen").count();
   result.tpTable=await page.evaluate(()=>({
     id:window.tp?.table?.id||"",
     name:window.tp?.table?.meta?.name||"",
     dataRowCount:window.tp?.table?.data?.length||0,
     screenOptions:window.tp?.screenOptions ? Object.keys(window.tp.screenOptions) :[]
   }));
   result.controls=await page.locator("input,button").evaluateAll(els=>els.slice(0,80).map(el=>({
     tag:el.tagName,id:el.id,name:el.getAttribute("name"),type:el.getAttribute("type"),
     text:(el.textContent||el.value||"").trim().slice(0,70)
   })));
   await page.screenshot({path:dir+"/after-create.png",fullPage:false});
   result.created=Boolean(result.tpTable.id);
   console.log("CMS_NATIVE_CREATE="+JSON.stringify({created:result.created,id:result.tpTable.id,name:result.tpTable.name,urlPath:result.afterCreateURLPath,controls:result.controls}).slice(0,12000));
   await page.close();
 }
 const post=await context.request.get(origin+"/wp-json/tablepress/v1/tables/prefix/all?per_page=100&page=1",{timeout:30000});
 result.afterInventory=post.ok()?(await post.json()).map(x=>({id:x.id,name:x.name})):null;
 console.log("CMS_REST_READBACK="+JSON.stringify(result.afterInventory));
 await context.close();
}finally{
 await browser.close();
 await writeFile(dir+"/result.json",JSON.stringify(result,null,2)+"\n");
}
if(result.status!=="SKIPPED_EXISTING_TABLES"&&!result.created)process.exitCode=1;
