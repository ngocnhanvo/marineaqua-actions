import { chromium } from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const SOURCE="https://marine-aqua.vn",DIR="four-category-price-oracle-evidence";
await mkdir(DIR,{recursive:true});
const baseline=JSON.parse(await readFile("four-category-catalog-evidence/manifest.json","utf8"));
const result={checkedAt:new Date().toISOString(),pages:[],prices:{},conflicts:[],missing:[],errors:[],status:"STARTED"};
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 const sourceSet=new Set(baseline.products);
 for(const record of baseline.pages){
  const url=new URL(record.url);
  if(url.origin!==SOURCE||!url.pathname.startsWith("/danh-muc/"))throw Error("Unexpected source archive "+url);
  const response=await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:45000});
  if(!response?.ok())throw Error("Archive HTTP "+response?.status()+" "+url.href);
  const cards=await page.evaluate(()=>{
   const items=[...document.querySelectorAll("li.product, .products .product")];
   return items.map(card=>{
    const href=[...card.querySelectorAll("a[href]")].map(a=>a.href)
      .find(h=>{try{let u=new URL(h);return u.origin===location.origin&&u.pathname.startsWith("/san-pham/")&&u.pathname.split("/").filter(Boolean).length===2}catch{return false}});
    const text=(card.innerText||card.textContent||"").replace(/\s+/g," ").trim();
    const prices=[...card.querySelectorAll(".price .woocommerce-Price-amount, .price bdi")].map(el=>el.textContent.trim());
    const priceText=card.querySelector(".price")?.textContent.replace(/\s+/g," ").trim()||
      (text.includes("Liên hệ")?"Liên hệ":"");
    const stock=/hết hàng/i.test(text)?"outofstock":/còn hàng/i.test(text)?"instock":"";
    const productId=(String(card.className).match(/post-(\d+)/)||[])[1]||"";
    return {url:href||"",title:card.querySelector(".woocommerce-loop-product__title")?.textContent.trim()||"",
      priceText,stock,prices,productId};
   }).filter(c=>c.url);
  });
  for(const entry of cards){
   if(!sourceSet.has(entry.url))continue;
   const existing=result.prices[entry.url];
   if(existing){
    if(existing.priceText!==entry.priceText || (existing.stock&&entry.stock&&existing.stock!==entry.stock))
      result.conflicts.push({url:entry.url,prior:existing,new:entry,archive:url.href});
   }else result.prices[entry.url]={...entry,archive:url.href};
  }
  result.pages.push({url:url.href,items:cards.length});
 }
 result.missing=[...sourceSet].filter(x=>!result.prices[x]||!result.prices[x].priceText);
 if(result.conflicts.length||result.missing.length)throw Error("Source price oracle missing="+result.missing.length+" conflicts="+result.conflicts.length);
 result.status="PASS";
 console.log("FOUR_CATEGORY_PRICE_ORACLE=PASS products="+Object.keys(result.prices).length+
  " pages="+result.pages.length+" missing="+result.missing.length+" conflicts="+result.conflicts.length);
 await context.close();
}catch(e){
 result.status="FAIL";result.errors.push(String(e.stack||e).slice(0,800));
 console.error("FOUR_CATEGORY_PRICE_ORACLE=FAIL "+result.errors.at(-1));
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/oracle.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}