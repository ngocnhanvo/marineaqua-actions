import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const SITE="https://marine-aqua.io.vn",OUT="home-products-live-evidence";
const BRANDS=[["home_04","TROPIC-MARIN"],["home_05","PRODIBIO"],["home_06","PRODAC"],["home_07","RED SEA"],["home_08","CONTINUUM AQUATICS"]];
const report={target:SITE,desktop:[],mobile:[],pages:[],issues:[],checks:[]};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
function fail(message){report.issues.push(message);console.error("HOME_BRAND_QA_FAIL="+message)}
try{
 for(const [name,width,height] of [["desktop",1440,900],["mobile",390,844]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   const errors=[];page.on("pageerror",error=>errors.push(error.message));
   const response=await page.goto(SITE+"/",{waitUntil:"domcontentloaded",timeout:50000});
   await page.locator('section[data-tablepress-preview="home_08"]').waitFor({state:"attached",timeout:35000});
   if(name==="desktop"){
     const wp=await page.request.get("https://admin.marine-aqua.io.vn/wp-json/wp/v2/product/82568",{failOnStatusCode:false,timeout:20000});
     const body=await wp.json().catch(()=>({}));
     const urls=[
       "/san-pham","/san-pham?catSlug=continuum-aquatics",
       "/san-pham/continuum-aquatics",
       "/san-pham/continuum-aquatics/1"
     ];
     const probes=[];
     for(const url of urls){
       const res=await page.request.get(SITE+url,{failOnStatusCode:false,timeout:25000});
       probes.push({url,status:res.status(),contentType:res.headers()["content-type"]});
     }
     const stockFields=Object.entries(body||{}).filter(([k])=>/stock|inventory|status|class_list|meta|acf|price/i.test(k)).map(([k,v])=>[k,JSON.stringify(v).slice(0,360)]);
     console.log("HOME_BRAND_WP_PRODUCT_FIELDS="+JSON.stringify({status:wp.status(),keys:Object.keys(body||{}),stockFields,probes}));
     report.probes={wpProductStatus:wp.status(),stockFields,probes};
   }
   const audit=[];
   for(const [id,title] of BRANDS){
     const section=page.locator('section[data-tablepress-preview="'+id+'"]');
     await section.scrollIntoViewIfNeeded();
     await page.waitForTimeout(550);
     const value=await section.evaluate((el)=>{
       const imgs=[...el.querySelectorAll(".marine-brand-card img")];
       const links=[...el.querySelectorAll(".marine-brand-card")];
       const rects=links.map(link=>link.getBoundingClientRect());
       return {
         title:el.querySelector("h2")?.textContent?.trim()||"",
         count:links.length,
         priceCount:el.querySelectorAll("[data-marine-product-price]").length,
         prices:[...el.querySelectorAll("[data-marine-product-price]")].map(x=>x.textContent.trim()),
         outOfStock:links.filter(link=>link.textContent.includes("Hết hàng")).length,
         links:links.map(link=>link.getAttribute("href")),
         imageUrls:imgs.map(img=>img.currentSrc||img.src),
         imageCount:imgs.length,
         brokenImages:imgs.filter(img=>!img.complete||img.naturalWidth<=0).map(img=>img.currentSrc||img.src),
         overflow:rects.some(r=>r.left < -2||r.right > innerWidth+2),
         grid:links.length>1?Math.round(rects[1].left-rects[0].left):0,
         moreHref:el.querySelector(".marine-brand-section__all")?.getAttribute("href")||""
       };
     });
     audit.push({id,expected:title,...value});
     if(value.title!==title)fail(name+" "+id+" incorrect title "+value.title);
     if(value.count!==4||value.imageCount!==4||value.priceCount!==4)fail(name+" "+id+" counts "+JSON.stringify({count:value.count,image:value.imageCount,prices:value.priceCount}));
     if(value.brokenImages.length)fail(name+" "+id+" broken images "+JSON.stringify(value.brokenImages));
     if(value.overflow)fail(name+" "+id+" cards overflow viewport");
     if(value.links.some(x=>!x||!x.startsWith("/")||x.startsWith("//")))fail(name+" "+id+" unsafe/missing card links");
     if(value.imageUrls.some(x=>!x||x.startsWith("https://marine-aqua.vn")))fail(name+" "+id+" image still hotlinked to legacy");
     if(!value.moreHref.startsWith("/"))fail(name+" "+id+" missing category link");
   }
   const details=await page.evaluate(()=>({
     viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
     cards:document.querySelectorAll(".marine-brand-card").length,
     prices:document.querySelectorAll(".marine-brand-card [data-marine-product-price]").length,
     stockBadges:[...document.querySelectorAll(".marine-brand-card")].filter(el=>el.textContent.includes("Hết hàng")).length,
     theme:document.body.className,
   }));
   report[name]=audit;
   report.checks.push({name,response:response?.status(),...details,pageErrors:errors});
   if(details.scrollWidth>width+2)fail(name+" document overflow "+details.scrollWidth);
   if(details.cards!==20||details.prices!==20)fail(name+" missing cards/prices total="+details.cards+"/"+details.prices);
   if(details.stockBadges!==2)fail(name+" stock badging expected 2 got "+details.stockBadges);
   if(errors.length)fail(name+" browser page errors "+errors.slice(0,3).join("; "));
   await page.screenshot({path:OUT+"/"+name+"-homepage.png",fullPage:true,animations:"disabled"});
   const urls=[...new Set(audit.flatMap(x=>x.links))];
   if(name==="desktop"){
     for(const url of urls){
       const res=await page.request.get(SITE+url,{timeout:30000,failOnStatusCode:false});
       report.pages.push({path:url,status:res.status()});
       if(res.status()<200||res.status()>=400)fail("broken product detail "+url+" status="+res.status());
     }
     for(const url of [...new Set(audit.map(x=>x.moreHref))]){
       const res=await page.request.get(SITE+url,{timeout:30000,failOnStatusCode:false});
       report.pages.push({category:url,status:res.status()});
       if(res.status()<200||res.status()>=400)fail("broken category "+url+" status="+res.status());
     }
   }
   console.log("HOME_BRAND_"+name.toUpperCase()+"="+JSON.stringify({audit,details}));
   await page.close();
 }
 const continuum=report.desktop.find(x=>x.id==="home_08");
 if(continuum?.outOfStock!==2)fail("Expected 2 out-of-stock Continuum products");
 report.status=report.issues.length?"FAIL":"PASS";
 console.log("HOME_BRAND_VISUAL_QA="+report.status+" cards=20 screenshots=desktop,mobile issues="+report.issues.length);
 if(report.issues.length)process.exitCode=1;
}catch(error){fail(String(error.stack||error).slice(0,750));report.status="FAIL";process.exitCode=1}
finally{await writeFile(OUT+"/report.json",JSON.stringify(report,null,2)+"\n");await browser.close()}
