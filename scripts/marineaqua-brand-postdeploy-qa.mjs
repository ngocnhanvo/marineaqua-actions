import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const origin="https://marine-aqua.io.vn";
const dir="brand-postdeploy-qa-evidence";
await mkdir(dir,{recursive:true});
const result={checkedAt:new Date().toISOString(),routes:[],failures:[]};
const browser=await chromium.launch({headless:true});
const record=(label,ok,message)=>{if(!ok){result.failures.push({label,message});console.error("BRAND_PROD_QA_FAIL="+label+" "+message)}};
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 const aliases=[
  {from:"/thuong-hieu/",to:"/san-pham/thuong-hieu"},
  {from:"/thuong-hieu/korallen-zucht/",to:"/san-pham/korallen-zucht"},
 ];
 for(const alias of aliases){
  const response=await page.goto(origin+alias.from,{waitUntil:"domcontentloaded",timeout:40000});
  const redirected=await response?.request()?.redirectedFrom()?.response();
  const ok=response?.status()===200&&new URL(page.url()).pathname.replace(/\/$/,"")===alias.to&&redirected?.status()===301;
  result.routes.push({path:alias.from,final:page.url(),http:response?.status(),redirect:redirected?.status()});
  record("redirect_"+alias.from,ok,JSON.stringify(result.routes.at(-1)));
 }
 for(const path of ["/san-pham/thuong-hieu/","/san-pham/thuong-hieu/16/","/san-pham/korallen-zucht/","/san-pham/korallen-zucht/2/","/san-pham/korallen-zucht/6/"]){
  const response=await page.goto(origin+path,{waitUntil:"domcontentloaded",timeout:40000});
  const info=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll("article.group")];
   const prices=cards.map(card=>card.querySelector("p.text-base.font-extrabold"));
   const priceStyles=prices.filter(Boolean).map(el=>getComputedStyle(el).color);
   return {
    h1:[...document.querySelectorAll("main h1")].map(el=>el.textContent.trim()),
    cards:cards.length,
    priceStyles,
    firstProduct:cards[0]?.querySelector("a[href]")?.getAttribute("href")||"",
    images:cards.slice(0,4).map(card=>{
     const img=card.querySelector("img");
     return {src:img?.currentSrc||img?.src||"",ok:Boolean(img?.complete&&img.naturalWidth>0)};
    }),
    totalText:[...document.querySelectorAll("main p")].map(p=>p.textContent.trim()).find(t=>t.includes("sản phẩm)"))||"",
   };
  });
  result.routes.push({path,http:response?.status(),...info});
  const expectedLastPage={"/san-pham/thuong-hieu/16/":6,"/san-pham/korallen-zucht/6/":8};
  record("pagination_"+path,!expectedLastPage[path]||info.cards===expectedLastPage[path],
    "expectedFinalPageCards="+expectedLastPage[path]+" actual="+info.cards);
  record("listing_"+path,response?.status()===200&&info.cards>0&&info.h1.length===1,
    "HTTP="+response?.status()+" cards="+info.cards+" h1="+info.h1.length);
  record("price_"+path,info.priceStyles.length===info.cards&&info.priceStyles.every(s=>s.includes("217, 38, 46")),
    "redPrices="+info.priceStyles.length+"/"+info.cards+" styles="+info.priceStyles.slice(0,2));
  record("images_"+path,info.images.every(img=>img.ok),"images="+JSON.stringify(info.images));
  if(info.firstProduct){
   const detail=await page.goto(new URL(info.firstProduct,origin).href,{waitUntil:"domcontentloaded",timeout:40000});
   record("detail_"+path,detail?.status()===200,"HTTP="+detail?.status()+" href="+info.firstProduct);
  }
  console.log("BRAND_PROD_LISTING="+JSON.stringify(result.routes.at(-1)));
 }
 await page.setViewportSize({width:390,height:844});
 const mobile=await page.goto(origin+"/san-pham/korallen-zucht/",{waitUntil:"domcontentloaded",timeout:40000});
 const mobileData=await page.evaluate(()=>({
  width:innerWidth,documentWidth:document.documentElement.scrollWidth,
  cards:document.querySelectorAll("article.group").length,
 }));
 result.routes.push({path:"/san-pham/korallen-zucht/ mobile",http:mobile?.status(),...mobileData});
 record("mobile",mobile?.status()===200&&mobileData.cards>0&&mobileData.documentWidth<=mobileData.width+2,
  JSON.stringify(mobileData));
 await page.screenshot({path:dir+"/mobile-brand.png",fullPage:false});
 await page.setViewportSize({width:1440,height:900});
 await page.goto(origin+"/san-pham/korallen-zucht/",{waitUntil:"domcontentloaded",timeout:40000});
 await page.screenshot({path:dir+"/desktop-brand.png",fullPage:false});
 await context.close();
}catch(e){
 result.failures.push({label:"fatal",message:String(e?.stack||e).slice(0,600)});
}finally{
 result.status=result.failures.length?"FAIL":"PASS";
 console.log("BRAND_POSTDEPLOY_QA="+result.status+" routes="+result.routes.length+" failures="+result.failures.length);
 await writeFile(dir+"/report.json",JSON.stringify(result,null,2)+"
");
 await browser.close();
 if(result.status!=="PASS")process.exitCode=1;
}
