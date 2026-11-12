import { chromium } from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const ORIGIN="https://marine-aqua.io.vn",DIR="two-category-production-qa-evidence";
await mkdir(DIR,{recursive:true});
const source=JSON.parse(await readFile("two-category-catalog-evidence/manifest.json","utf8"));
const mapping=JSON.parse(await readFile("two-category-mapping-evidence/mapping.json","utf8"));
const output={checkedAt:new Date().toISOString(),routes:[],failures:[],status:"STARTED"};
const assert=(label,ok,reason)=>{if(!ok){output.failures.push({label,reason});console.error("TWO_CATEGORY_QA_FAIL="+label+" "+reason)}};
const browser=await chromium.launch({headless:true});
try{
 if(mapping.status!=="PASS")throw Error("Unverified original category map");
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 const categories=[...new Set(source.categoryRoots.flatMap(root=>[root.slug,...root.children]))];
 for(const slug of categories){
  const expected=new Set((source.archiveMembership[slug]||[]).map(url=>new URL(url).pathname.split("/").filter(Boolean).at(-1)));
  const total=expected.size, lastPage=Math.ceil(total/16)||1;
  const paths=["/san-pham/"+slug+"/"];
  if(lastPage>1)paths.push("/san-pham/"+slug+"/"+lastPage+"/");
  for(const path of paths){
   const response=await page.goto(ORIGIN+path,{waitUntil:"domcontentloaded",timeout:45000});
   await page.evaluate(async()=>{
    const imgs=[...document.querySelectorAll("article.group img")].slice(0,4);
    imgs.forEach(img=>img.loading="eager");
    await Promise.all(imgs.map(img=>new Promise(resolve=>{
     if(img.complete)return resolve();
     img.addEventListener("load",resolve,{once:true});
     img.addEventListener("error",resolve,{once:true});
     setTimeout(resolve,10000);
    })));
   });
   const result=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll("article.group")];
    const text=document.querySelector("main")?.textContent||"";
    const count=text.match(/Tổng\s*(\d+)\s*sản phẩm/i);
    return {
     h1:[...document.querySelectorAll("main h1")].map(el=>el.textContent.trim()),
     cards:cards.length,reportedTotal:count?Number(count[1]):-1,
     prices:cards.map(card=>({color:card.querySelector("p.text-base.font-extrabold")?
       getComputedStyle(card.querySelector("p.text-base.font-extrabold")).color:"",
       text:card.querySelector("p.text-base.font-extrabold")?.textContent.trim()||""})),
     media:cards.slice(0,4).map(card=>{const img=card.querySelector("img");
      return {ok:Boolean(img?.complete&&img.naturalWidth>0&&!String(img.currentSrc||img.src).includes("/placeholders/product.webp")),
      src:img?.currentSrc||img?.src||""}}),
     hrefs:cards.map(card=>card.querySelector("a[href]")?.getAttribute("href")||""),
     hasPagination:!!document.querySelector('nav[aria-label="Phân trang"]')
    };
   });
   const expectedCards=path===paths[0]?Math.min(total,16):total%16||16;
   output.routes.push({path,http:response?.status(),expectedTotal:total,...result});
   assert("total_"+path,response?.status()===200&&result.reportedTotal===total&&result.cards===expectedCards,
    "expected "+total+"/"+expectedCards+" got "+result.reportedTotal+"/"+result.cards+" HTTP "+response?.status());
   assert("title_"+path,result.h1.length===1&&Boolean(result.h1[0]),"H1="+JSON.stringify(result.h1));
   assert("prices_"+path,result.prices.length===result.cards&&result.prices.every(p=>p.color.includes("217, 38, 46")&&p.text),
    "Invalid prices "+JSON.stringify(result.prices.slice(0,3)));
   assert("media_"+path,result.media.every(img=>img.ok),"Failed media "+JSON.stringify(result.media));
   assert("hrefs_"+path,result.hrefs.every(h=>h.startsWith("/san-pham/")),"Invalid product detail links");
   if(result.hrefs[0]){
    const detail=await page.goto(new URL(result.hrefs[0],ORIGIN).href,{waitUntil:"domcontentloaded",timeout:45000});
    assert("detail_"+path,detail?.status()===200,"Product detail HTTP "+detail?.status());
   }
   console.log("TWO_CATEGORY_PRODUCTION_ROUTE="+JSON.stringify(output.routes.at(-1)));
  }
 }
 // Regression guard: this migration must not alter the already accepted brand catalog.
 for(const [slug,expected] of [["thuong-hieu",246],["korallen-zucht",88]]){
  const path="/san-pham/"+slug+"/";
  const response=await page.goto(ORIGIN+path,{waitUntil:"domcontentloaded",timeout:45000});
  const record=await page.evaluate(()=>{
   const text=document.querySelector("main")?.textContent||"";
   const match=text.match(/Tổng\\s*(\\d+)\\s*sản phẩm/i);
   return {count:match?Number(match[1]):-1,cards:document.querySelectorAll("article.group").length};
  });
  assert("regression_"+slug,response?.status()===200&&record.count===expected&&record.cards===16,
   JSON.stringify(record));
  output.routes.push({path,http:response?.status(),...record,expected,regression:true});
 }
 // Confirm navigation links under both menu groups and no mobile overflow.
 for(const root of source.categoryRoots){
  await page.setViewportSize({width:390,height:844});
  const path="/san-pham/"+root.slug+"/";
  const response=await page.goto(ORIGIN+path,{waitUntil:"domcontentloaded",timeout:45000});
  const mobile=await page.evaluate(()=>({
   width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
   cards:document.querySelectorAll("article.group").length
  }));
  assert("mobile_"+root.slug,response?.status()===200&&mobile.scrollWidth<=mobile.width+2&&
   mobile.cards>0,JSON.stringify(mobile));
  output.routes.push({path:path+" mobile",http:response?.status(),...mobile});
  await page.screenshot({path:DIR+"/mobile-"+root.slug+".png",fullPage:false});
  await page.setViewportSize({width:1440,height:900});
  await page.goto(ORIGIN+path,{waitUntil:"domcontentloaded",timeout:45000});
  await page.screenshot({path:DIR+"/desktop-"+root.slug+".png",fullPage:false});
 }
 await context.close();
}catch(e){output.failures.push({label:"fatal",reason:String(e.stack||e).slice(0,700)})}
finally{
 output.status=output.failures.length?"FAIL":"PASS";
 console.log("TWO_CATEGORY_POSTDEPLOY="+output.status+" routes="+output.routes.length+
  " errors="+output.failures.length);
 await writeFile(DIR+"/report.json",JSON.stringify(output,null,2)+"\n");
 await browser.close();
 if(output.status!=="PASS")process.exitCode=1;
}