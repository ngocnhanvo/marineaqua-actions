import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base="https://marine-aqua.io.vn";
const paths=[
 "/thuong-hieu/","/thuong-hieu/korallen-zucht/","/san-pham/",
 "/san-pham/thuong-hieu/","/san-pham/korallen-zucht/",
 "/thuong-hieu/korallen-zucht/2/"
];
const output="brand-listing-route-evidence";
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const result={base,checkedAt:new Date().toISOString(),routes:[],errors:[]};
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 for(const path of paths) {
  try {
   const response=await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:40000});
   const snapshot=await page.evaluate(()=>({
    title:document.title,
    h1:[...document.querySelectorAll("main h1,h1")].slice(0,3).map(e=>e.textContent.trim()),
    productCards:document.querySelectorAll("article.group,.products .product,[data-product-card]").length,
    links:[...document.querySelectorAll("main a[href]")].slice(0,8).map(a=>a.getAttribute("href")),
    bodyText:document.body.innerText.slice(0,160),
   }));
   const row={path,status:response?.status()||0,finalUrl:page.url(),...snapshot};
   result.routes.push(row);
   console.log("BRAND_ROUTE="+JSON.stringify(row));
   if(response?.ok()&&/thuong-hieu|san-pham/.test(path)){
    await page.screenshot({path:output+"/"+path.replace(/[^a-z0-9]+/gi,"-")+".png",fullPage:false});
   }
  }catch(e){
   const error={path,error:String(e?.message||e).slice(0,240)};
   result.errors.push(error);
   console.error("BRAND_ROUTE_ERROR="+JSON.stringify(error));
  }
 }
 await context.close();
}finally{
 await writeFile(output+"/report.json",JSON.stringify(result,null,2));
 await browser.close();
}
