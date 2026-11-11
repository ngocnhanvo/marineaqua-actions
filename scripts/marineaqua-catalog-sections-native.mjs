import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

// Verified 2026-11-09 capture of https://marine-aqua.vn/:
// Original Home product sections in this exact order.
const SECTIONS=[
  ["home_04","TROPIC-MARIN"],
  ["home_05","PRODIBIO"],
  ["home_06","PRODAC"],
  ["home_07","RED SEA"],
  ["home_08","CONTINUUM AQUATICS"],
];
const FIELDS=["key","api-itemName","api-itemPrice","api-slug","api-itemImage"];
const LABELS=["Product ID","Nguồn tên","Nguồn giá","Nguồn slug","Nguồn ảnh"];
const WP="https://admin.marine-aqua.io.vn";
const u=process.env.WP_ADMIN_USERNAME,p=process.env.WP_ADMIN_PASSWORD;
if(!u||!p)throw Error("CMS_WRITE_BLOCKED: WordPress credentials not configured");
const dir="cms-catalog-section-evidence";
await mkdir(dir,{recursive:true});
const results=[];
const log=(name,details={})=>console.log("CATALOG_"+name+"="+JSON.stringify(details));
const browser=await chromium.launch({headless:true});
let failed=false;
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const inventory=async()=>{
   const r=await context.request.get(WP+"/wp-json/tablepress/v1/tables/prefix/all?per_page=30&page=1",{timeout:30000});
   if(!r.ok())throw Error("ESC Table inventory error "+r.status());
   const j=await r.json();
   if(!Array.isArray(j))throw Error("ESC Table inventory malformed");
   return j;
 };
 const read=async id=>{
   const r=await context.request.get(WP+"/wp-json/tablepress/v1/table/"+id,{timeout:30000,failOnStatusCode:false});
   return r.ok()?await r.json():null;
 };
 const current=await inventory();
 // Prevent turning a table with someone else's name into a new catalog section.
 for(const [id,title] of SECTIONS){
   const sameName=current.filter(t=>String(t.title||t.name||"").trim()===title);
   if(sameName.length>1)throw Error("Ambiguous same-title ESC tables: "+title);
   if(sameName.some(t=>String(t.id)!==id && !/^\d+$/.test(String(t.id))))throw Error("Conflicting named ESC Table: "+title);
 }
 const page=await context.newPage();
 page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss();});
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(u);
 await page.locator("#user_pass").fill(p);
 await page.locator("#wp-submit").click();
 if(page.url().includes("wp-login.php"))throw Error("WordPress login failed");
 for(const [id,title] of SECTIONS){
   const item={id,title,status:"STARTED"};
   results.push(item);
   const existing=(await inventory()).find(t=>String(t.id)===id);
   if(existing){
     const dto=await read(id);
     if(!dto||dto.title!==title)throw Error("Existing table identity mismatch: "+id);
     item.status="EXISTING_VERIFIED";
     item.items=dto.items?.length||0;
     item.fields=dto.fields?.map(x=>x.key)||[];
     log("EXISTING",item);
     continue;
   }
   const drafts=(await inventory()).filter(t=>String(t.title||t.name||"").trim()===title && /^\d+$/.test(String(t.id)));
   if(drafts.length>1)throw Error("Multiple unfinalized drafts: "+title);
   if(drafts.length===1){
     item.draftId=String(drafts[0].id);
     item.status="NATIVE_DRAFT_RECOVERY";
     log("RECOVER_DRAFT",{id, draftId:item.draftId});
     await page.goto(WP+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+encodeURIComponent(item.draftId),{waitUntil:"domcontentloaded",timeout:45000});
   }else{
     await page.goto(WP+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:45000});
     const name=page.locator('input[name="table[name]"]');
     await name.waitFor({state:"visible",timeout:20000});
     await name.fill(title);
     await page.locator('input[name="table[rows]"]').fill("2");
     await page.locator('input[name="table[columns]"]').fill(String(FIELDS.length));
     await page.getByRole("button",{name:/Add Table/i}).click();
     const createdIdField=page.locator("#table-id");
     await createdIdField.waitFor({state:"visible",timeout:30000});
     item.draftId=await createdIdField.inputValue();
     item.status="NATIVE_CREATED";
   }
   const tableIdField=page.locator("#table-id");
   await tableIdField.waitFor({state:"visible",timeout:30000});
   const draft=await page.evaluate(()=>window.tp?.table?.data||[]);
   if(draft.length!==2 || draft.some(row=>row.length!==FIELDS.length) ||
      draft.some(row=>row.some(x=>String(x||"").trim())))throw Error("Unexpected nonempty draft: "+id);
   await page.waitForFunction(()=>Boolean(window.tp?.editor?.setValueFromCoords),null,{timeout:20000});
   if(item.draftId!==id){
     await tableIdField.fill(id);
     await page.locator("#table-information-shortcode").focus();
   }
   await page.evaluate(({fields,labels})=>{
     for(let i=0;i<fields.length;i++){
       window.tp.editor.setValueFromCoords(i,0,fields[i]);
       window.tp.editor.setValueFromCoords(i,1,labels[i]);
     }
   },{fields:FIELDS,labels:LABELS});
   await page.getByRole("button",{name:/Save Changes/i}).first().click();
   let dto=null;
   for(let attempt=0;attempt<5;attempt++){
     await page.waitForTimeout(1000);
     dto=await read(id);
     if(dto?.id===id && dto?.title===title)break;
   }
   if(!dto||dto.id!==id||dto.title!==title){
     item.restId=String(dto?.id||"");
     item.finalTableInput=await tableIdField.inputValue();
     item.editorSaveState=await page.evaluate(()=>({
       madeChanges:window.tp?.made_changes,
       currentId:window.tp?.table?.id,
       errorText:document.querySelector("#tablepress-page .notice-error")?.textContent?.trim()?.slice(0,160)||"",
     }));
     throw Error("REST readback identity mismatch: "+id);
   }
   if(!FIELDS.every((key,i)=>dto.fields?.[i]?.key===key))throw Error("REST field schema mismatch: "+id);
   if(!Array.isArray(dto.items)||dto.items.length!==0)throw Error("Refusing synthetic catalog item: "+id);
   item.status="SCHEMA_SAVED";
   item.fields=FIELDS;
   item.items=0;
   item.apiSource=String(dto.meta?.api||"");
   await page.screenshot({path:dir+"/"+id+".png",fullPage:false});
   log("NATIVE_SAVE_PASS",item);
 }
 await page.close();
 await context.close();
}catch(e){
 failed=true;log("FAIL",{reason:String(e.message||e).slice(0,320)});
}finally{
 await browser.close();
 await writeFile(dir+"/result.json",JSON.stringify({source:"https://marine-aqua.vn",sourceCapture:"2026-11-09",records:results,failed},null,2)+"\n");
}
if(failed||results.some(r=>!["SCHEMA_SAVED","EXISTING_VERIFIED"].includes(r.status)))process.exitCode=1;
