import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

// A source-backed ESC Table shell, not fake categories or products.
// WordPress currently has zero ProductCategory records; all item rows stay empty.
const WP="https://admin.marine-aqua.io.vn";
const TABLE="home_03";
const TITLE="SẢN PHẨM";
const FIELDS=["api-key","api-name","api-slug","api-img","api-children"];
const LABELS=["Mã danh mục","Tên danh mục","Đường dẫn","Ảnh","Danh mục con"];
const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
if(!username||!password)throw Error("CMS_WRITE_BLOCKED: missing admin credentials");
const dir="cms-section-implementation-evidence";
await mkdir(dir,{recursive:true});
const result={pageId:82454,tableId:TABLE,title:TITLE,created:false,schemaSaved:false,itemsCreated:0,operations:[]};
const record=(name,details={})=>{result.operations.push({name,...details});console.log("HOME03_"+name+"="+JSON.stringify(details));};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 const readTable=async(id)=>{
   const response=await context.request.get(WP+"/wp-json/tablepress/v1/table/"+id,{timeout:25000,failOnStatusCode:false});
   return response.ok()?await response.json():null;
 };
 const inventory=async()=>{
   const response=await context.request.get(WP+"/wp-json/tablepress/v1/tables/prefix/all?per_page=30&page=1",{timeout:30000});
   if(!response.ok())throw Error("Cannot preflight WordPress ESC Table list: "+response.status());
   const data=await response.json();
   if(!Array.isArray(data))throw Error("Unexpected ESC Table inventory");
   return data;
 };
 const old=await inventory();
 result.preexisting=old.map(x=>String(x.id));
 const existing=old.find(x=>String(x.id)===TABLE);
 if(existing){
   const saved=await readTable(TABLE);
   if(!saved)throw Error("Existing home_03 cannot be read");
   result.schemaSaved=FIELDS.every((x,i)=>saved.fields?.[i]?.key===x);
   result.itemsCreated=Array.isArray(saved.items)?saved.items.length:0;
   record("REUSED",{id:TABLE,fieldsValid:result.schemaSaved,items:result.itemsCreated});
   if(!result.schemaSaved)throw Error("Existing home_03 has different schema: refuse overwrite");
 }else{
   const unfinalized=old.filter(x=>String(x.title||x.name||"").trim()===TITLE);
   if(unfinalized.length>1)throw Error("Multiple same-title tables; refuse duplicate creation");
   const page=await context.newPage();
   page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss();});
   await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
   await page.locator("#user_login").fill(username);
   await page.locator("#user_pass").fill(password);
   await page.locator("#wp-submit").click();
   if(page.url().includes("wp-login.php"))throw Error("CMS login not accepted");
   let draftId="";
   if(unfinalized.length===1){
     draftId=String(unfinalized[0].id);
     record("RECOVER_EXISTING_DRAFT",{id:draftId});
     await page.goto(WP+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+encodeURIComponent(draftId),{waitUntil:"domcontentloaded",timeout:45000});
   }else{
     await page.goto(WP+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:45000});
     if(!page.url().includes("page=tablepress_add"))throw Error("Native Add Table editor unavailable");
     await page.locator('input[name="table[name]"]').fill(TITLE);
     await page.locator('input[name="table[rows]"]').fill("2");
     await page.locator('input[name="table[columns]"]').fill(String(FIELDS.length));
     await page.screenshot({path:dir+"/add-table-before.png"});
     await page.getByRole("button",{name:/Add Table/i}).click();
     await page.locator("#table-id").waitFor({state:"visible",timeout:35000});
     draftId=await page.locator("#table-id").inputValue();
     result.created=true;
     record("NATIVE_CREATED",{draftId});
   }
   await page.locator("#table-id").waitFor({state:"visible",timeout:25000});
   await page.waitForFunction(()=>Boolean(window.tp?.editor?.setValueFromCoords&&window.tp?.table?.data),null,{timeout:25000});
   const initial=await page.evaluate(()=>window.tp?.table?.data||[]);
   if(initial.length!==2 || initial.some(row=>row.length!==5))throw Error("Unexpected Home_03 draft dimensions");
   // Never overwrite nonblank cells unless they are known initial defaults.
   if(initial.some(row=>row.some(cell=>String(cell||"").trim())))throw Error("Home_03 draft already has content; refuse overwrite");
   if(draftId!==TABLE){
     await page.locator("#table-id").fill(TABLE);
     await page.locator("#table-information-shortcode").focus();
   }
   await page.evaluate(({fields,labels})=>{
     for(let col=0;col<fields.length;col++){
       window.tp.editor.setValueFromCoords(col,0,fields[col]);
       window.tp.editor.setValueFromCoords(col,1,labels[col]);
     }
   },{fields:FIELDS,labels:LABELS});
   await page.getByRole("button",{name:/Save Changes/i}).first().click();
   await page.waitForTimeout(1500);
   const saved=await readTable(TABLE);
   if(!saved)throw Error("Native TablePress Save did not create requested ID");
   if(saved.title!==TITLE)throw Error("Saved ESC Table title mismatched");
   if(!FIELDS.every((x,i)=>saved.fields?.[i]?.key===x))throw Error("Saved ESC Table field schema mismatched");
   if(!Array.isArray(saved.items)||saved.items.length!==0)throw Error("Unexpected item rows: no fake categories allowed");
   result.schemaSaved=true;
   result.itemsCreated=0;
   record("NATIVE_SAVE_REST_PASS",{id:TABLE,fields:FIELDS,items:0});
   await page.screenshot({path:dir+"/home03-edit-saved.png",fullPage:false});
   await page.close();
 }
 const final=await inventory();
 result.finalIds=final.map(x=>String(x.id));
 if(!result.finalIds.includes(TABLE))throw Error("Final WordPress inventory is missing home_03");
 await context.close();
}catch(e){
 result.error=String(e.message||e).slice(0,320);
 record("FAIL",{reason:result.error});
 process.exitCode=1;
}finally{
 await browser.close();
 await writeFile(dir+"/result.json",JSON.stringify(result,null,2)+"\n");
 console.log("HOME03_RESULT="+JSON.stringify({created:result.created,schemaSaved:result.schemaSaved,items:result.itemsCreated,error:result.error||null}));
}
