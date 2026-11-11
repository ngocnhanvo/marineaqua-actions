import { chromium } from "playwright";
import { mkdir,readFile,writeFile } from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn",DIR="catalog-bind-evidence";
const KEYS=["key","api-itemName","api-itemPrice","api-slug","api-itemImage"];
const PATHS=["", "itemName", "itemPrice", "slug", "itemImage"];
await mkdir(DIR,{recursive:true});
const report={tables:[],status:"STARTED",errors:[]};
const browser=await chromium.launch({headless:true});
const check=(x,message)=>{if(!x)throw Error(message)};
try{
 const migration=JSON.parse(await readFile("catalog-import-evidence/result.json","utf8"));
 check(migration.status==="PASS"&&migration.groups?.length===5,"Cannot bind incomplete product migration");
 const context=await browser.newContext({viewport:{width:1440,height:940}});
 const page=await context.newPage();
 page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
 check(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,"WordPress admin credentials missing");
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
 await page.locator("#wp-submit").click();
 check(!page.url().includes("wp-login.php"),"WordPress login failed");
 async function read(id){
   const res=await context.request.get(WP+"/wp-json/tablepress/v1/table/"+id,{timeout:30000,failOnStatusCode:false});
   check(res.ok(),"ESC Table "+id+" HTTP "+res.status());
   return res.json();
 }
 for(const group of migration.groups){
   const {table,brand,products}=group;
   check(/^home_0[4-8]$/.test(table)&&products.length===4,"Unexpected table identity "+table);
   const before=await read(table);
   check(before.id===table&&before.title===brand&&before.meta?.api==="Product","Table meta identity mismatch "+table);
   check(KEYS.every((key,index)=>before.fields?.[index]?.key===key),"Table field schema differs "+table);
   const expected=products.map(p=>String(p.id));
   check(new Set(expected).size===4,"Duplicate product ID "+table);
   const entry={table,brand,before:before.items?.length||0,expected};
   report.tables.push(entry);
   if(before.items?.length===4){
     check(before.items.every((item,index)=>String(item.key)===expected[index]&&PATHS.slice(1).every((path,column)=>String(item[KEYS[column+1]])===path)),"Existing ESC Table product order or mappings differ "+table);
     entry.status="ALREADY_VERIFIED";continue;
   }
   check(Array.isArray(before.items)&&before.items.length===0,"Refusing overwrite nonempty ESC Table "+table);
   await page.goto(WP+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+table,{waitUntil:"domcontentloaded",timeout:45000});
   check(!page.url().includes("wp-login.php"),"Native ESC Table editor inaccessible");
   await page.waitForFunction(()=>Boolean(window.tp?.editor?.setValueFromCoords&&window.tp?.table?.data),null,{timeout:25000});
   const rows=await page.evaluate(()=>window.tp.table.data);
   check(rows.length===2&&rows.every(row=>Array.isArray(row)&&row.length===5)&&KEYS.every((key,index)=>rows[0][index]===key),"Native TablePress existing rows conflict "+table);
   await page.locator("#rows-append-number").fill("4");
   await page.evaluate(()=>{
     const input=document.querySelector("#rows-append-number");
     const button=document.evaluate('following::button[normalize-space(.)="Add"][1]',input,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;
     if(!(button instanceof HTMLButtonElement))throw Error("Native Append Rows button unavailable");
     button.click();
   });
   await page.waitForFunction(()=>window.tp?.table?.data?.length===6,null,{timeout:18000});
   const appended=await page.evaluate(()=>window.tp.table.data.slice(2));
   check(appended.length===4&&appended.every(row=>row.length===5&&row.every(cell=>!String(cell||"").trim())),"Native rows are not blank "+table);
   await page.evaluate(({products,paths})=>{
     for(let i=0;i<products.length;i++){
       window.tp.editor.setValueFromCoords(0,i+2,String(products[i].id));
       for(let j=1;j<paths.length;j++)window.tp.editor.setValueFromCoords(j,i+2,paths[j]);
     }
   },{products,paths:PATHS});
   const latest=await read(table);
   check(latest.items.length===0&&latest.meta.api==="Product","Concurrent ESC Table mutation "+table);
   await page.getByRole("button",{name:/Save Changes/i}).first().click();
   await page.waitForTimeout(1400);
   const after=await read(table);
   check(after.items?.length===4&&after.title===before.title&&after.meta?.api==="Product","ESC Table readback invalid "+table);
   check(after.items.every((item,index)=>String(item.key)===expected[index]&&PATHS.slice(1).every((path,column)=>String(item[KEYS[column+1]])===path)),"ESC Table REST product source/order mismatch "+table);
   entry.status="SAVED_AND_VERIFIED";entry.after=after.items.length;
   console.log("CATALOG_ESC_TABLE_PASS="+JSON.stringify(entry));
   await page.screenshot({path:DIR+"/"+table+".png",fullPage:false});
 }
 check(report.tables.length===5&&report.tables.every(item=>["ALREADY_VERIFIED","SAVED_AND_VERIFIED"].includes(item.status)),"Not all five brand ESC Tables verified");
 report.status="PASS";
 console.log("CATALOG_ESC_BINDING=PASS tables=5 products=20");
 await page.close();await context.close();
}catch(e){report.errors.push(String(e.message||e).slice(0,600));report.status="FAIL";process.exitCode=1;console.error("CATALOG_ESC_BINDING=FAIL "+report.errors.at(-1))}
finally{await writeFile(DIR+"/result.json",JSON.stringify(report,null,2)+"\n");await browser.close()}
