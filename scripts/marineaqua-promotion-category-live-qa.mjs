import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const ORIGIN="https://marine-aqua.io.vn",CATEGORY="/san-pham/giam-gia-khung",DIR="promotion-category-live-evidence";
const result={url:ORIGIN+CATEGORY,views:[],errors:[],status:"STARTED"};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const view of [{name:"desktop",width:1440,height:900},{name:"mobile",width:390,height:844}]){
  const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const response=await page.goto(ORIGIN+CATEGORY,{waitUntil:"domcontentloaded",timeout:65000});
  if(!response||response.status()!==200)throw Error(view.name+" promotion route HTTP "+response?.status());
  await page.locator("main h1").first().waitFor({state:"visible",timeout:25000});
  const heading=(await page.locator("main h1").first().innerText()).trim();
  const cards=page.locator("main article").filter({has:page.getByRole("link",{name:"Xem chi tiết"})});
  const number=await cards.count();
  const documentData=await page.evaluate(()=>({
   horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+3,
   bodyWidth:document.body.scrollWidth,
   viewportWidth:window.innerWidth
  }));
  const promoLinks=await page.locator('a').evaluateAll(xs=>xs.filter(x=>(x.textContent||"").trim()==="Khuyến mãi").map(x=>x.getAttribute("href")));
  const expectedLink=promoLinks.some(x=>String(x||"").replace(/^\/+/,"")==="san-pham/giam-gia-khung");
  if(!heading.toLowerCase().includes("giảm giá khủng"))throw Error(view.name+" page title unexpected "+heading);
  if(number!==8)throw Error(view.name+" expected 8 product cards, got "+number);
  if(documentData.horizontalOverflow)throw Error(view.name+" horizontal overflow "+JSON.stringify(documentData));
  if(!expectedLink)throw Error(view.name+" Header promotion link not routed "+JSON.stringify(promoLinks));
  if(view.name==="desktop"){
   await page.locator("[data-header-catalog-trigger]").click();
   const panel=page.locator("#header-product-catalog-panel");
   await panel.waitFor({state:"visible",timeout:12000});
   if((await panel.innerText()).toLowerCase().includes("giảm giá khủng"))
    throw Error("Desktop category tree must exclude promotion term");
  }else{
   await page.locator("#hamburger-btn").click();
   const menu=page.locator("#mobile-menu-container");
   await menu.waitFor({state:"visible",timeout:12000});
   const categories=await page.locator(".marine-mobile-menu-categories").innerText();
   if(categories.toLowerCase().includes("giảm giá khủng"))
    throw Error("Mobile category tree must exclude promotion term");
  }
  await page.screenshot({path:DIR+"/"+view.name+".png",fullPage:true});
  const viewResult={view:view.name,status:response.status(),heading,cards:number,headerPromotionLinks:promoLinks,overflow:documentData.horizontalOverflow,categoryMenuExcludesPromotion:true};
  result.views.push(viewResult);console.log("PROMO_CATEGORY_LIVE_VIEW_PASS="+JSON.stringify(viewResult));
  await ctx.close();
 }
 result.status="PASS";
 console.log("PROMO_CATEGORY_LIVE_QA_PASS="+JSON.stringify({views:result.views.map(x=>x.view),products:8}));
}catch(e){result.status="FAIL";result.errors.push(String(e.message||e).slice(0,450));console.error("PROMO_CATEGORY_LIVE_QA_FAIL="+result.errors.at(-1));process.exitCode=1}
finally{await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");await browser.close()}
