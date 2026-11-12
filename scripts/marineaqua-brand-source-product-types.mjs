import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const SOURCE="https://marine-aqua.vn";
const DIR="brand-source-product-types-evidence";
await mkdir(DIR,{recursive:true});
const source=JSON.parse(await readFile("brand-catalog-evidence/manifest.json","utf8"));
const known=new Set(source.products);
const result={checkedPages:0,products:[],unclassified:[],types:{},errors:[]};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 for(const listing of source.pages){
  const url=new URL(listing.url);
  if(url.origin!==SOURCE)throw Error("Untrusted source listing URL");
  const response=await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:45000});
  if(!response?.ok())throw Error("Source listing HTTP "+response?.status()+" "+url);
  const items=await page.evaluate(()=>[...document.querySelectorAll("li.product, .products .product")]
   .map(el=>{
    const link=[...el.querySelectorAll("a[href]")].map(a=>a.href)
     .find(href=>new URL(href).pathname.startsWith("/san-pham/"));
    const type=[...el.classList].find(x=>x.startsWith("product-type-"))?.slice(13)||"unknown";
    return {url:link||"",type};
   }).filter(x=>x.url));
  for(const item of items){
   if(!known.has(item.url))continue;
   if(result.products.some(p=>p.url===item.url))continue;
   result.products.push(item);
   result.types[item.type]=(result.types[item.type]||0)+1;
  }
  result.checkedPages++;
 }
 result.unclassified=[...known].filter(url=>!result.products.some(p=>p.url===url));
 console.log("BRAND_SOURCE_PRODUCT_TYPES="+JSON.stringify(result.types)+
  " checked="+result.products.length+"/"+known.size+
  " missing="+result.unclassified.length);
 if(result.unclassified.length||Object.keys(result.types).some(x=>x!=="simple"))
  throw Error("Non-simple or unclassified source products require manual type-safe migration review");
}catch(error){
 result.errors.push(String(error?.message||error).slice(0,250));
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/report.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
