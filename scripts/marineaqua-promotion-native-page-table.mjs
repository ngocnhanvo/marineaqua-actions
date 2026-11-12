import { chromium } from "playwright";
import { mkdir,writeFile } from "node:fs/promises";

const WP="https://admin.marine-aqua.io.vn";
const TABLE="khuyen_mai_01",PAGE_SLUG="khuyen-mai",PAGE_KEY="promotions",DIR="promotion-page-table-evidence";
const SLUGS=[
 "muoi-bien-tropic-marin-pro-reef-25-kg-xo-nhua",
 "korallen-zucht-zeofood-plus-500ml-thuc-an-cho-san-ho",
 "korallen-zucht-coral-system-component-4-500ml",
 "korallen-zucht-coral-system-component-3-500ml",
 "korallen-zucht-coral-system-component-2-500ml",
 "korallen-zucht-coral-system-component-1-500ml",
 "korallen-zucht-magnesium-complex-500ml",
 "tropic-marin-syn-biotic-sea-salt-25-kg-muoi-cho-ho-ca-bien-chlb-duc"
];
const COLS=["key","api-itemName","api-itemPrice","api-slug","api-itemImage"];
const PATHS=["","itemName","itemPrice","slug","itemImage"];
const result={scope:{table:TABLE,page:PAGE_SLUG,products:SLUGS},steps:[],status:"STARTED",errors:[],temporaryCreated:[],cleanupRemaining:[]};
const valid=(value,why)=>{if(!value)throw Error(why)};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 valid(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,"Missing WP credentials");
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 const page=await context.newPage();
 page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
 await page.locator("#wp-submit").click();
 valid(!page.url().includes("wp-login.php"),"WordPress login rejected");
 await page.goto(WP+"/wp-admin/post-new.php?post_type=page",{waitUntil:"domcontentloaded",timeout:45000});
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   return r.ok?(await r.text()).trim():"";
 });
 valid(/^[a-zA-Z0-9]{8,32}$/.test(nonce),"WordPress REST nonce missing");
 const api=async(method,path,payload)=>{
  const r=await context.request.fetch(WP+path,{method,headers:{"X-WP-Nonce":nonce,...(payload?{"Content-Type":"application/json"}:{})},
   data:payload?JSON.stringify(payload):undefined,failOnStatusCode:false,timeout:50000});
  if(!r.ok())throw Error("WP "+method+" "+path.split("?")[0]+" HTTP "+r.status()+" "+(await r.text()).slice(0,200));
  return r.json();
 };
 const products=[];
 for(const slug of SLUGS){
  const matches=await api("GET","/wp-json/wc/v3/products?per_page=100&status=any&slug="+encodeURIComponent(slug));
  const exact=matches.filter(p=>p.slug===slug&&p.status==="publish");
  valid(exact.length===1,"Expected exactly one published target product for "+slug+"; actual="+exact.length);
  products.push({id:exact[0].id,slug,title:exact[0].name});
 }
 valid(products.length===8&&new Set(products.map(x=>x.id)).size===8,"Active source catalog product IDs must be exactly eight and unique");
 result.products=products;
 console.log("PROMOTION_VERIFIED_IDS="+JSON.stringify(products));
 result.steps.push("target_product_ids_verified");

 async function readTable(id){
  const r=await context.request.get(WP+"/wp-json/tablepress/v1/table/"+encodeURIComponent(id),{failOnStatusCode:false,timeout:35000});
  if(r.status()===404)return null;
  valid(r.ok(),"TablePress table "+id+" HTTP "+r.status());
  return r.json();
 }
 const initial=await readTable(TABLE);
 const alt=await readTable("145");
 console.log("PROMOTION_TABLE_CURRENT="+JSON.stringify({tableNamed:initial&&{id:initial.id,title:initial.title,source:initial.meta?.api,fields:initial.fields,rows:initial.items?.length},oldNumeric:alt&&{id:alt.id,title:alt.title,source:alt.meta?.api,rows:alt.items?.length}}));
 if(initial?.meta?.api==="Product"){
  valid(initial.fields?.length===COLS.length&&COLS.every((c,j)=>initial.fields[j]?.key===c),"Existing table field conflict");
  valid(initial.items?.length===8,"Existing table has unexpected item count");
  valid(initial.items.every((item,i)=>String(item.key)===String(products[i].id)),"Existing table product order conflict");
  result.steps.push("existing_table_verified");
 }else{
  valid(initial?.id===TABLE && initial?.title==="Khuyến mãi","Expected previously created native promotion table; refusing overwrite");
  await page.goto(WP+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+TABLE,{waitUntil:"domcontentloaded",timeout:45000});
  await page.waitForFunction(()=>Boolean(window.tp?.editor?.setValueFromCoords&&window.tp?.table?.data),null,{timeout:30000});
  const initialGrid=await page.evaluate(()=>window.tp.table.data);
  console.log("PROMOTION_NATIVE_TABLE_GRID="+JSON.stringify({rows:initialGrid.length,columns:initialGrid[0]?.length}));
  valid(initialGrid.length===9&&initialGrid.every(x=>x.length===5),"Unexpected native table dimensions; refuse mutation");
  await page.evaluate(({products,cols,paths})=>{
   for(let j=0;j<cols.length;j++)window.tp.editor.setValueFromCoords(j,0,cols[j]);
   for(let i=0;i<products.length;i++){
    window.tp.editor.setValueFromCoords(0,i+1,String(products[i].id));
    for(let j=1;j<cols.length;j++)window.tp.editor.setValueFromCoords(j,i+1,paths[j]);
   }
  },{products,cols:COLS,paths:PATHS});
  const src=page.locator("#js_custom_api");
  await src.waitFor({state:"visible",timeout:20000});
  await src.fill("Product");
  await page.getByRole("button",{name:/Save Changes/i}).first().click();
  await page.waitForTimeout(1600);
  const after=await readTable(TABLE);
  valid(after?.meta?.api==="Product","TablePress source was not saved");
  valid(after.fields?.length===5&&COLS.every((c,j)=>after.fields[j]?.key===c),"TablePress field mapping missing");
  valid(after.items?.length===8&&after.items.every((item,i)=>String(item.key)===String(products[i].id)),"TablePress eight product IDs mismatch");
  result.steps.push("native_table_saved_verified");
  await page.screenshot({path:DIR+"/promotion-esc-table.png"});
 }

 const inventory=await api("GET","/wp-json/wp/v2/pages?context=edit&per_page=100&_fields=id,slug,status,acf,content");
 const pages=inventory.filter(p=>p.slug===PAGE_SLUG||p.acf?.key===PAGE_KEY);
 valid(pages.length<=1,"Duplicate promotion pages; refuse mutation");
 let record=pages[0];
 if(record){
  valid(record.slug===PAGE_SLUG&&record.acf?.key===PAGE_KEY&&record.acf?.action==="HomePage"&&record.acf?.product_lang==="vi","Existing Page ACF mismatch");
  result.pageId=record.id;
 }else{
  record=await api("POST","/wp-json/wp/v2/pages",{title:"Khuyến mãi",slug:PAGE_SLUG,status:"draft",acf:{key:PAGE_KEY,action:"HomePage",product_lang:"vi"}});
  valid(record?.id&&record.slug===PAGE_SLUG,"Create promotion draft Page failed");
  result.pageId=record.id;
  result.temporaryCreated.push(record.id);
  result.steps.push("draft_page_created");
 }
 const before=await api("GET","/wp-json/wp/v2/pages/"+result.pageId+"?context=edit");
 valid(before.slug===PAGE_SLUG&&before.acf?.key===PAGE_KEY&&before.acf?.action==="HomePage","Promotion page readback mismatch");
 const codeBefore=String(before.content?.raw||"");
 const desired="[table id="+TABLE+" /]";
 const already=codeBefore.includes(desired);
 valid(!already||[...codeBefore.matchAll(/\[table id=khuyen_mai_01\s*\/\]/g)].length===1,"Duplicate shortcode in existing page");
 if(!already){
  valid(!codeBefore.trim(),"Existing authored Page content conflict: refuse overwrite");
  await page.goto(WP+"/wp-admin/post.php?post="+result.pageId+"&action=edit",{waitUntil:"domcontentloaded",timeout:45000});
  await page.waitForTimeout(1100);
  const textTab=page.locator("#content-html");
  if(await textTab.count())await textTab.click();
  const quick=page.locator("#qt_content_tablepress_quicktags_button");
  valid(await quick.isVisible(),"Native ESC Table Insert Code toolbar missing in Classic editor");
  await quick.click();
  await page.waitForTimeout(900);
  result.insertDialog=await page.locator("input,button,a,select").evaluateAll(xs=>xs.filter(e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0)
   .map(e=>({tag:e.tagName,id:e.id,cls:String(e.className).slice(0,95),value:String(e.value||"").slice(0,80),text:String(e.textContent||"").trim().slice(0,95)}))
   .filter(x=>/tablepress|insert|table|code|khuyen|chèn/i.test(x.text+" "+x.cls+" "+x.id+" "+x.value)).slice(-85));
  console.log("PROMOTION_NATIVE_INSERT_DIALOG="+JSON.stringify(result.insertDialog));
  const nativeInsert=page.getByRole("button",{name:/Insert Code/i});
  const nativeRows=page.locator('[data-table-id="'+TABLE+'"]');
  if(await nativeRows.count()){
   const row=nativeRows.first();
   const btn=row.getByRole("button",{name:/Insert|Chèn/i});
   if(await btn.count())await btn.first().click();
   else await row.click();
  }else if(await nativeInsert.count()){
   const selector=page.locator('input[type="search"]:visible,select:visible').last();
   if(await selector.count()){
    const tag=await selector.evaluate(e=>e.tagName);
    if(tag==="INPUT")await selector.fill(TABLE);
    else await selector.selectOption(TABLE);
   }
   await nativeInsert.first().click();
  }else{
   throw Error("Native ESC Table chooser not recognized; see PROMOTION_NATIVE_INSERT_DIALOG");
  }
  const inserted=await page.locator("#content").inputValue();
  valid(inserted.includes(desired),"Native Insert Code did not insert expected ESC Table ID");
  result.steps.push("native_insert_code_confirmed");
  await page.screenshot({path:DIR+"/promotion-native-insert.png"});
  const save=page.locator("#save-post");
  if(before.status==="draft"&&await save.count())await save.click();
  else if(await page.locator("#publish").count())await page.locator("#publish").click();
  else throw Error("Native Page Save control missing");
  await page.waitForTimeout(1300);
 }
 const verify=await api("GET","/wp-json/wp/v2/pages/"+result.pageId+"?context=edit");
 valid(String(verify.content?.raw||"").includes(desired),"Page native shortcode not persisted");
 const count=[...String(verify.content?.raw||"").matchAll(/\[table id=khuyen_mai_01\s*\/\]/g)].length;
 valid(count===1,"Page shortcode count not exactly one");
 if(verify.status!=="publish"){
  await api("POST","/wp-json/wp/v2/pages/"+result.pageId,{status:"publish"});
 }
 const published=await api("GET","/wp-json/wp/v2/pages/"+result.pageId+"?context=edit");
 valid(published.status==="publish"&&published.slug===PAGE_SLUG&&published.acf?.key===PAGE_KEY&&published.acf?.action==="HomePage"&&published.acf?.product_lang==="vi","Published promotion Page metadata invalid");
 valid(String(published.content?.raw||"").includes(desired),"Published Page lost native shortcode");
 result.temporaryCreated=[];
 result.status="PASS";
 result.steps.push("page_published_and_readback_verified");
 console.log("PROMOTION_PAGE_TABLE_PASS="+JSON.stringify({table:TABLE,pageId:result.pageId,productIds:products.map(x=>x.id),steps:result.steps}));
}catch(e){
 result.status="FAIL";
 result.errors.push(String(e.message||e).slice(0,500));
 console.error("PROMOTION_PAGE_TABLE_FAIL="+result.errors.at(-1));
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
