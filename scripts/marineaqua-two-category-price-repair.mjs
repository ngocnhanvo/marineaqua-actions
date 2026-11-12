import { chromium } from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn",DIR="two-category-price-repair-evidence";
await mkdir(DIR,{recursive:true});
const oracle=JSON.parse(await readFile("two-category-price-oracle-evidence/oracle.json","utf8"));
const source=JSON.parse(await readFile("two-category-catalog-evidence/manifest.json","utf8"));
const mapping=JSON.parse(await readFile("two-category-mapping-evidence/mapping.json","utf8"));
const result={checked:0,updated:[],unchanged:[],backups:[],errors:[],status:"STARTED"};
const valid=(ok,msg)=>{if(!ok)throw Error(msg)};
const browser=await chromium.launch({headless:true});
try{
 valid(oracle.status==="PASS"&&oracle.missing.length===0&&oracle.conflicts.length===0,"Unverified original price oracle");
 valid(mapping.status==="PASS"&&source.products.length===source.details.length,"Unverified product mapping");
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 valid(!page.url().includes("wp-login.php"),"WordPress editor inaccessible");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const resp=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return resp.ok?(await resp.text()).trim():"";
 });
 valid(Boolean(nonce),"WP API nonce absent");
 async function api(method,path,payload){
  for(let attempt=1;attempt<=4;attempt++){
   try{
    const response=await context.request.fetch(WP+path,{method,timeout:50000,failOnStatusCode:false,
     headers:{"X-WP-Nonce":nonce,...(payload?{"Content-Type":"application/json"}:{})},
     data:payload?JSON.stringify(payload):undefined});
    if(method==="GET"&&response.status()>=500&&attempt<4){await new Promise(r=>setTimeout(r,attempt*700));continue}
    if(!response.ok())throw Error("WP "+method+" HTTP "+response.status()+" "+path);
    return await response.json();
   }catch(e){
    if(method!=="GET"||attempt===4||!/ECONNRESET|socket hang up|timeout/i.test(String(e)))throw e;
    await new Promise(r=>setTimeout(r,attempt*900));
   }
  }
 }
 const items=[];
 for(let n=1;n<=50;n++){
  const batch=await api("GET","/wp-json/wc/v3/products?per_page=100&status=any&page="+n);
  valid(Array.isArray(batch),"Invalid product inventory");
  items.push(...batch);
  if(batch.length<100)break;
 }
 const bySlug=new Map(items.map(item=>[item.slug,item]));
 const amounts=v=>[...new Set([...String(v||"").matchAll(/([\d.,]+)₫/g)]
  .map(x=>Number(x[1].replace(/[.,]/g,""))).filter(n=>Number.isFinite(n)&&n>0))];
 for(const sourceUrl of source.products){
  const slug=new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1);
  try{
   result.checked++;
   const target=bySlug.get(slug);
   valid(target?.id,"Missing target identity "+slug);
   const assigned=mapping.assignments[sourceUrl]||[];
   valid(assigned.length>0&&assigned.every(cat=>target.categories?.some(c=>Number(c.id)===Number(cat.id))),
    "Category mismatch on price-repair scope "+slug);
   const original=oracle.prices[sourceUrl];
   valid(Boolean(original?.priceText),"No independent source price "+slug);
   const values=amounts(original.priceText);
   let regular="",sale="";
   if(values.length===1)regular=String(values[0]);
   else if(values.length===2&&values[0]>values[1]){regular=String(values[0]);sale=String(values[1])}
   else if(String(original.priceText).trim()!=="Liên hệ")
    throw Error("Ambiguous price for "+slug+" "+original.priceText);
   const desiredStock=original.stock||target.stock_status;
   valid(["instock","outofstock","onbackorder"].includes(desiredStock),"Unknown stock");
   const changed=String(target.regular_price||"")!==regular||
    String(target.sale_price||"")!==sale||target.stock_status!==desiredStock;
   if(!changed){result.unchanged.push(slug);continue}
   result.backups.push({id:target.id,slug,prior:{regular_price:target.regular_price||"",
    sale_price:target.sale_price||"",stock_status:target.stock_status},source:{price:original.priceText,stock:original.stock}});
   await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
   const patch={regular_price:regular,sale_price:sale,stock_status:desiredStock};
   const updated=await api("PUT","/wp-json/wc/v3/products/"+target.id,patch);
   valid(updated?.id===target.id,"Price repair identity mismatch "+slug);
   const check=await api("GET","/wp-json/wc/v3/products/"+target.id);
   valid(String(check.regular_price||"")===regular&&String(check.sale_price||"")===sale&&
    check.stock_status===desiredStock,"Price/stock readback mismatch "+slug);
   valid((target.categories||[]).every(c=>check.categories?.some(x=>x.id===c.id))&&
    check.images?.[0]?.id===target.images?.[0]?.id,"Unrequested taxonomy/media drift "+slug);
   bySlug.set(slug,check);
   result.updated.push({slug,id:target.id,regular,sale,stock:desiredStock});
   console.log("TWO_CATEGORY_PRICE_STOCK_VERIFIED="+slug+" regular="+regular+" sale="+sale);
  }catch(e){
   result.errors.push({slug,error:String(e.message||e).slice(0,220)});
   console.error("TWO_CATEGORY_PRICE_STOCK_FAILED="+slug+" "+result.errors.at(-1).error);
  }
 }
 result.status=result.errors.length?"PARTIAL":"PASS";
 console.log("TWO_CATEGORY_PRICE_REPAIR="+result.status+" checked="+result.checked+
  " updated="+result.updated.length+" unchanged="+result.unchanged.length+" errors="+result.errors.length);
 if(result.status!=="PASS")process.exitCode=1;
 await context.close();
}catch(e){
 result.status="FAIL";result.errors.push({fatal:String(e.stack||e).slice(0,700)});
 console.error("TWO_CATEGORY_PRICE_REPAIR_FATAL="+result.errors.at(-1).fatal);
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}