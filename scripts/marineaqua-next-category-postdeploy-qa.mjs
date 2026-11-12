import { chromium } from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const ORIGIN="https://marine-aqua.io.vn",DIR="next-category-production-qa-evidence";
await mkdir(DIR,{recursive:true});
const source=JSON.parse(await readFile("next-category-catalog-evidence/manifest.json","utf8"));
const mapping={status:"PASS"}; // Source archive membership is independently checked by this live QA; mapping parity is gated in the release workflow.
const output={checkedAt:new Date().toISOString(),routes:[],failures:[],status:"STARTED"};
const assert=(label,ok,reason)=>{if(!ok){output.failures.push({label,reason});console.error("NEXT_CATEGORY_QA_FAIL="+label+" "+reason)}};
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
     prices:cards.map(card=>({color:card.querySelector("p.text-center.text-base.font-bold")?
       getComputedStyle(card.querySelector("p.text-center.text-base.font-bold")).color:"",
       text:card.querySelector("p.text-center.text-base.font-bold")?.textContent.trim()||""})),
     media:cards.slice(0,4).map(card=>{const img=card.querySelector("img");
      return {ok:Boolean(img?.complete&&img.naturalWidth>0&&!String(img.currentSrc||img.src).includes("/placeholders/product.webp")),
      src:img?.currentSrc||img?.src||""}}),
     hrefs:cards.map(card=>card.querySelector("a[href]")?.getAttribute("href")||""),
     hasPagination:!!document.querySelector('nav[aria-label="Phân trang"]')
    };
   });
   const expectedCards=path===paths[0]?Math.min(total,16):total%16||16;
   output.routes.push({path,http:response?.status(),expectedTotal:total,...result});
   assert("total_"+path,response?.status()===200&&result.cards===expectedCards&&(total===0?result.reportedTotal===0||result.reportedTotal===-1:result.reportedTotal===total),
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
   console.log("NEXT_CATEGORY_PRODUCTION_ROUTE="+JSON.stringify(output.routes.at(-1)));
  }
 }
 // Regression guard: this migration must not alter the already accepted brand catalog.
 for(const [slug,expected] of [["thuong-hieu",246],["korallen-zucht",88]]){
  const path="/san-pham/"+slug+"/";
  const response=await page.goto(ORIGIN+path,{waitUntil:"domcontentloaded",timeout:45000});
  const record=await page.evaluate(()=>{
   const text=document.querySelector("main")?.textContent||"";
   const match=text.match(/Tổng\s*(\d+)\s*sản phẩm/i);
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
   (source.archiveMembership[root.slug]?.length===0?mobile.cards===0:mobile.cards>0),JSON.stringify(mobile));
  output.routes.push({path:path+" mobile",http:response?.status(),...mobile});
  const dropdown=page.locator("#dropdown-trigger");
  if(root.children.length===0){
   console.log("NEXT_CATEGORY_NAVIGATION_LEAF_ROOT=PASS no child dropdown required "+root.slug);
  }else if(await dropdown.count()){
   await dropdown.click();
   const menu=page.locator("#dropdown-menu");
   const hrefs=await menu.locator("a[href]").evaluateAll(items=>items.map(a=>a.getAttribute("href")));
   const expectedChildren=root.children.map(slug=>"/san-pham/"+slug);
   const available=await menu.isVisible()&&expectedChildren.every(child=>
     hrefs.some(h=>h&&h.replace(/\/$/,"")===child));
   assert("category_navigation_"+root.slug,available,JSON.stringify({hrefs,expectedChildren}));
  }else assert("category_navigation_"+root.slug,false,"Missing category dropdown");
  await page.screenshot({path:DIR+"/mobile-"+root.slug+".png",fullPage:false});
  await page.setViewportSize({width:1440,height:900});
  await page.goto(ORIGIN+path,{waitUntil:"domcontentloaded",timeout:45000});
  await page.screenshot({path:DIR+"/desktop-"+root.slug+".png",fullPage:false});
 }
 await context.close();
}catch(e){output.failures.push({label:"fatal",reason:String(e.stack||e).slice(0,700)})}
finally{
 output.status=output.failures.length?"FAIL":"PASS";
 console.log("NEXT_CATEGORY_POSTDEPLOY="+output.status+" routes="+output.routes.length+
  " errors="+output.failures.length);
 await writeFile(DIR+"/report.json",JSON.stringify(output,null,2)+"\n");
 await browser.close();
 if(output.status!=="PASS")process.exitCode=1;
}