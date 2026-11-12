import { chromium } from "playwright";
import { readFile,writeFile,mkdir } from "node:fs/promises";
const SOURCE="https://marine-aqua.vn",WP="https://admin.marine-aqua.io.vn";
const DIR="brand-seo-repair-evidence";
await mkdir(DIR,{recursive:true});
const original=JSON.parse(await readFile("brand-catalog-evidence/manifest.json","utf8"));
const mapping=JSON.parse(await readFile("brand-taxonomy-mapping-evidence/mapping.json","utf8"));
const result={checked:0,updated:[],reused:[],backups:[],priceBackups:[],priceUpdated:[],errors:[],status:"STARTED"};
const browser=await chromium.launch({headless:true});
try{
 if(original.details?.length!==246||mapping.unassigned?.length)
  throw Error("Incomplete source content/SEO baseline");
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 if(page.url().includes("wp-login.php"))throw Error("WordPress login denied");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok?(await r.text()).trim():"";
 });
 if(!nonce)throw Error("WP REST nonce missing");
 async function api(method,path,body){
  for(let attempt=1;attempt<=4;attempt++){
   try {
    const response=await context.request.fetch(WP+path,{
     method,headers:{"X-WP-Nonce":nonce,...(body?{"Content-Type":"application/json"}:{})},
     data:body?JSON.stringify(body):undefined,timeout:50000,failOnStatusCode:false
    });
    if(response.status()>=500&&method==="GET"&&attempt<4){
     await new Promise(resolve=>setTimeout(resolve,attempt*900));continue
    }
    if(!response.ok())throw Error("WP "+method+" "+path.split("?")[0]+" HTTP "+response.status());
    return response.json();
   }catch(e){
    if(method!=="GET"||attempt===4||!/socket hang up|ECONNRESET|timeout/i.test(String(e)))throw e;
    await new Promise(resolve=>setTimeout(resolve,attempt*900));
   }
  }
 }
 const products=[];
 for(let n=1;n<=50;n++){
  const batch=await api("GET","/wp-json/wc/v3/products?per_page=100&status=any&page="+n);
  if(!Array.isArray(batch))throw Error("WP product list malformed");
  products.push(...batch);
  if(batch.length<100)break;
 }
 const bySlug=new Map(products.map(p=>[p.slug,p]));
 if(original.details.some(item=>!bySlug.has(new URL(item.url).pathname.split("/").filter(Boolean).at(-1))))
  throw Error("Some source products are not yet imported, no SEO writes allowed");
 for(const item of original.details){
  const slug=new URL(item.url).pathname.split("/").filter(Boolean).at(-1);
  let current=bySlug.get(slug);
  try{
   result.checked++;
   if(!current?.id)throw Error("Missing WooCommerce target product");
   const allowedCats=mapping.assignments?.[item.url]||[];
   if(allowedCats.some(cat=>!current.categories?.some(c=>c.id===cat.id)))
    throw Error("Product category mismatch, refusing SEO update");
   // Original source prices are authoritative; repair legacy 20-product
   // homepage records only when their current regular/sale prices differ.
   const amounts=[...new Set([...String(item.priceText||"").matchAll(/([\d.,]+)₫/g)]
     .map(x=>Number(x[1].replace(/[.,]/g,""))).filter(n=>Number.isFinite(n)&&n>0))];
   let regular="",sale="";
   if(amounts.length===1)regular=String(amounts[0]);
   else if(amounts.length===2&&amounts[0]>amounts[1]){
    regular=String(amounts[0]);sale=String(amounts[1]);
   }else if(String(item.priceText||"").trim()!=="Liên hệ"){
    throw Error("Ambiguous original source price");
   }
   if(String(current.regular_price||"")!==regular||String(current.sale_price||"")!==sale){
    result.priceBackups.push({slug,id:current.id,
     previous:{regular_price:current.regular_price,sale_price:current.sale_price}});
    await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
    const updatedPrice=await api("PUT","/wp-json/wc/v3/products/"+current.id,
     {regular_price:regular,sale_price:sale});
    if(updatedPrice?.id!==current.id)throw Error("Price PUT identity mismatch");
    const confirmedPrice=await api("GET","/wp-json/wc/v3/products/"+current.id);
    if(String(confirmedPrice.regular_price||"")!==regular||
       String(confirmedPrice.sale_price||"")!==sale)
      throw Error("Original source price readback mismatch");
    current=confirmedPrice;
    result.priceUpdated.push({slug,id:current.id,regular_price:regular,sale_price:sale});
    console.log("BRAND_ORIGINAL_PRICE_VERIFIED="+slug);
   }
   const meta=Array.isArray(current.meta_data)?current.meta_data:[];
   const sourceUrl=meta.find(x=>x.key==="_marine_source_url")?.value;
   if(sourceUrl&&sourceUrl!==item.url)throw Error("Canonical source identity mismatch");
   const desired=[
    {key:"_yoast_wpseo_title",value:String(item.seoTitle||"").trim()},
    {key:"_yoast_wpseo_metadesc",value:String(item.seoDescription||"").trim()},
   ].filter(v=>v.value);
   const changes=desired.flatMap(v=>{
    const existing=meta.find(x=>x.key===v.key);
    if(String(existing?.value||"").trim()===v.value)return [];
    return [{...v,...(existing?.id?{id:existing.id}:{})}];
   });
   if(!changes.length){result.reused.push(slug);continue}
   result.backups.push({slug,id:current.id,
    previous:changes.map(c=>{
     const item=meta.find(x=>x.key===c.key);
     return {key:c.key,id:item?.id||null,value:item?.value??null};
    })});
   await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
   await api("PUT","/wp-json/wc/v3/products/"+current.id,{meta_data:changes});
   const readback=await api("GET","/wp-json/wc/v3/products/"+current.id);
   for(const expected of desired){
    const actual=readback.meta_data?.find(m=>m.key===expected.key)?.value;
    if(String(actual||"").trim()!==expected.value)
     throw Error("Yoast "+expected.key+" metadata readback mismatch");
   }
   result.updated.push({slug,id:current.id,fields:changes.map(x=>x.key)});
   console.log("BRAND_YOAST_UPDATED="+slug+" fields="+changes.map(x=>x.key).join(","));
  }catch(e){
   result.errors.push({slug,error:String(e?.message||e).slice(0,220)});
   console.error("BRAND_YOAST_FAILED="+slug+" "+result.errors.at(-1).error);
  }
 }
 result.status=result.errors.length?"PARTIAL":"PASS";
 console.log("BRAND_YOAST_REPAIR="+result.status+" checked="+result.checked+
  " updated="+result.updated.length+" reused="+result.reused.length+
  " errors="+result.errors.length);
 if(result.errors.length)process.exitCode=1;
 await context.close();
}catch(e){
 result.status="FAIL";
 result.errors.push({fatal:String(e?.stack||e?.message||e).slice(0,700)});
 console.error("BRAND_YOAST_FATAL="+result.errors.at(-1).fatal);
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
