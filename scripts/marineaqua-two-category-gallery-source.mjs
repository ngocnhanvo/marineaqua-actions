import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const SOURCE="https://marine-aqua.vn";
const DIR="two-category-gallery-source-evidence";
await mkdir(DIR,{recursive:true});
const source=JSON.parse(await readFile("two-category-catalog-evidence/manifest.json","utf8"));
const multi=source.details.filter(p=>p.images.length>1);
const output={expected:multi.length,products:[],errors:[],checkedAt:new Date().toISOString()};
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 for(const product of multi) {
  try {
   const resp=await page.goto(product.url,{waitUntil:"domcontentloaded",timeout:45000});
   if(!resp?.ok())throw Error("HTTP "+resp?.status());
   const galleryImages=await page.evaluate(()=>{
    const imgs=[...document.querySelectorAll(".woocommerce-product-gallery img")];
    const candidates=imgs.map(img=>({
     src:img.getAttribute("data-zoom-image")||img.getAttribute("data-large_image")||
       img.getAttribute("data-src")||img.getAttribute("src")||"",
     alt:img.getAttribute("alt")||"",
    }));
    return [...new Map(candidates.filter(x=>{
     try{
      const u=new URL(x.src,location.href);
      return u.origin===location.origin&&u.pathname.startsWith("/wp-content/uploads/")&&
       /\.(png|jpe?g|webp)$/i.test(u.pathname);
     }catch{return false}
    }).map(x=>[new URL(x.src,location.href).href,{
     url:new URL(x.src,location.href).href,alt:x.alt
    }])).values()];
   });
   if(galleryImages.length!==product.images.length)
    throw Error("Gallery image count mismatch "+galleryImages.length+"/"+product.images.length);
   const images=[];
   for(const img of galleryImages){
    const expected=new URL(img.url);
    const candidate=new URL(img.url);
    candidate.pathname=candidate.pathname.replace(/-100x100(?=\.(?:png|jpe?g|webp)$)/i,"");
    let url=img.url,fullResolutionCandidate=false;
    if(candidate.href!==expected.href){
     const response=await page.request.head(candidate.href,{timeout:12000,failOnStatusCode:false});
     if(response.ok()&&/image\/(jpeg|png|webp)/i.test(response.headers()["content-type"]||"")){
      url=candidate.href;
      fullResolutionCandidate=true;
     }
    }
    images.push({url,alt:img.alt,thumbnail:img.url,fullResolutionCandidate});
   }
   const row={url:product.url,originalCaptured:product.images.length,fullImages:images};
   output.products.push(row);
   console.log("TWO_CATEGORY_GALLERY_ORIGINAL="+new URL(product.url).pathname+" fullImages="+images.length);
  }catch(e){
   output.errors.push({url:product.url,error:String(e?.message||e).slice(0,220)});
   console.error("TWO_CATEGORY_GALLERY_FAILED="+product.url+" "+output.errors.at(-1).error);
  }
 }
 console.log("TWO_CATEGORY_GALLERY_SOURCE="+(output.errors.length?"PARTIAL":"PASS")+
  " products="+output.products.length+"/"+output.expected+" errors="+output.errors.length);
 if(output.errors.length)process.exitCode=1;
} finally {
 await writeFile(DIR+"/manifest.json",JSON.stringify(output,null,2)+"\n");
 await browser.close();
}
