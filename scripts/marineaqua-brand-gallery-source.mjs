import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const SOURCE="https://marine-aqua.vn";
const DIR="brand-gallery-source-evidence";
await mkdir(DIR,{recursive:true});
const source=JSON.parse(await readFile("brand-catalog-evidence/manifest.json","utf8"));
const multi=source.details.filter(p=>p.images.length>1);
const output={expected:multi.length,products:[],errors:[],checkedAt:new Date().toISOString()};
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 for(const product of multi) {
  try {
   const resp=await page.goto(product.url,{waitUntil:"domcontentloaded",timeout:45000});
   if(!resp?.ok())throw Error("HTTP "+resp?.status());
   const images=await page.evaluate(()=>{
    const gallery=document.querySelector(".woocommerce-product-gallery");
    const anchors=[...(gallery?.querySelectorAll(".woocommerce-product-gallery__image a[href]")||[])];
    const candidates=anchors.map(a=>({
     url:new URL(a.href,location.href).href,
     alt:a.querySelector("img")?.alt||"",
     thumbnail:a.querySelector("img")?.src||"",
    }));
    return [...new Map(candidates.filter(x=>{
     const u=new URL(x.url);
     return u.origin===location.origin&&u.pathname.startsWith("/wp-content/uploads/")&&
      /\.(png|jpe?g|webp)$/i.test(u.pathname);
    }).map(x=>[x.url,x])).values()];
   });
   if(images.length<product.images.length)throw Error("Gallery missing full original links "+images.length+"/"+product.images.length);
   const row={url:product.url,originalCaptured:product.images.length,fullImages:images};
   output.products.push(row);
   console.log("BRAND_GALLERY_ORIGINAL="+new URL(product.url).pathname+" fullImages="+images.length);
  }catch(e){
   output.errors.push({url:product.url,error:String(e?.message||e).slice(0,220)});
   console.error("BRAND_GALLERY_FAILED="+product.url+" "+output.errors.at(-1).error);
  }
 }
 console.log("BRAND_GALLERY_SOURCE="+(output.errors.length?"PARTIAL":"PASS")+
  " products="+output.products.length+"/"+output.expected+" errors="+output.errors.length);
 if(output.errors.length)process.exitCode=1;
} finally {
 await writeFile(DIR+"/manifest.json",JSON.stringify(output,null,2)+"\n");
 await browser.close();
}
