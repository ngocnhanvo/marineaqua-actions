import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn",FRONT="https://marine-aqua.io.vn";
const OUT="footer-live-evidence";await mkdir(OUT,{recursive:true});
const report={target:FRONT,source:"WordPress",views:[],routes:[],issues:[]};
const browser=await chromium.launch({headless:true});
const fail=(message)=>{report.issues.push(message);console.error("FOOTER_VISUAL_FAIL="+message)};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const infoResponse=await context.request.get(WP+"/wp-json/wp/v2/thong-tin-chung?per_page=10&status=publish",{failOnStatusCode:false,timeout:30000});
 const info=await infoResponse.json();
 if(infoResponse.status()!==200||!Array.isArray(info)||info.length!==1)throw Error("WordPress Info inventory invalid");
 const source=info[0].acf||{};
 const facebook=String(source.facebook||"").trim();
 const maps=String(source.googlemaphanoi||source.googlemaphcm||"").trim();
 if(!facebook.startsWith("https://www.facebook.com/")||!maps.startsWith("https://maps.app.goo.gl/"))throw Error("Configured social/map destinations not trustworthy");
 const expected={
  contact:"/lien-he",knowledge:"/tin-kien-thuc",
  maps:new URL(maps).href,facebook:new URL(facebook).href
 };
 report.expected=expected;
 const pages=await context.request.get(WP+"/wp-json/wp/v2/pages?per_page=100&status=publish",{timeout:30000});
 const data=await pages.json();
 if(!Array.isArray(data)||!["lien-he","tin-kien-thuc"].every(slug=>data.some(p=>p.slug===slug)))throw Error("WordPress footer destination Pages missing");
 const first=await context.newPage();
 for(const [key,url] of Object.entries(expected)){
  if(key!=="contact"&&key!=="knowledge")continue;
  const r=await first.request.get(FRONT+url,{failOnStatusCode:false,timeout:30000});
  const text=r.ok()?await r.text():"";
  const ok=r.status()===200&&text.includes("id=\"footer-contact\"");
  report.routes.push({key,url,status:r.status(),ok});
  if(!ok)fail("Published Page invalid "+key+" "+r.status());
 }
 await first.close();
 for(const [name,width,height] of [["mobile",390,844],["tablet",768,1000],["desktop",1440,900],["wide",1917,1080]]){
  const page=await context.newPage({viewport:{width,height}});
  const errs=[];page.on("pageerror",e=>errs.push(e.message));
  const response=await page.goto(FRONT+"/",{waitUntil:"domcontentloaded",timeout:45000});
  const footer=page.locator("#footer-contact");
  await footer.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const measured=await footer.evaluate(root=>{
    const links=[...root.querySelectorAll("a[data-marine-footer-link]")];
    const labels=Object.fromEntries(links.map(a=>[a.dataset.marineFooterLink,{href:a.getAttribute("href"),label:a.textContent.trim(),target:a.target,rel:a.rel}]));
    const logo=root.querySelector("#footer-brand-title")?.parentElement?.querySelector("img");
    const box=root.getBoundingClientRect();
    return {
      headings:[...root.querySelectorAll("h2")].map(x=>x.textContent.trim()),
      hasForm:!!root.querySelector("form"),
      disclaimer:/Bản preview độc lập|Thông tin và hình ảnh sản phẩm được đối chiếu từ website gốc|không gửi dữ liệu/i.test(root.textContent||""),
      copyright:root.textContent?.includes("© 2026 Marine Aqua.")||false,
      brand:root.textContent?.includes("Marine Aqua")||false,
      logoLoaded:Boolean(logo?.complete&&logo.naturalWidth>0),
      links:labels,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,
      box:{left:Math.round(box.left),right:Math.round(box.right),width:Math.round(box.width)},
      background:getComputedStyle(root).backgroundImage,
    };
  });
  report.views.push({name,width,status:response?.status()||0,...measured,errors:errs});
  console.log("FOOTER_GEOMETRY="+JSON.stringify({name,width,box:measured.box,overflow:measured.horizontalOverflow,visualViewport:await page.evaluate(()=>({innerWidth,scrollX,documentWidth:document.documentElement.scrollWidth}))}));
  if(response?.status()!==200)fail(name+" homepage status "+response?.status());
  if(measured.horizontalOverflow)fail(name+" horizontal overflow");
  if(measured.box.right>width+2||measured.box.left<-2)fail(name+" footer outside viewport");
  if(measured.hasForm||measured.disclaimer||!measured.copyright)fail(name+" form/disclaimer/copyright mismatch");
  if(!measured.logoLoaded)fail(name+" logo not loaded");
  if(measured.headings.length!==3)fail(name+" expected three columns");
  for(const [key,href] of Object.entries(expected)){
   const a=measured.links[key];
   if(!a||a.href!==href)fail(name+" "+key+" wrong target "+JSON.stringify(a));
   if((key==="maps"||key==="facebook")&&(!a?.rel?.includes("noopener")||a?.target!=="_blank"))fail(name+" unsafe external link "+key);
  }
  if(!measured.background.includes("gradient"))fail(name+" footer not ocean blue");
  if(errs.length)fail(name+" JS errors "+errs.slice(0,2).join("|"));
  await footer.screenshot({path:OUT+"/footer-"+name+".png",animations:"disabled"});
  console.log("FOOTER_VIEW_"+name.toUpperCase()+"="+JSON.stringify({width,links:measured.links,logo:measured.logoLoaded,overflow:measured.horizontalOverflow}));
  await page.close();
 }
 await context.close();
}catch(e){fail(String(e.stack||e).slice(0,850))}
finally{
 report.status=report.issues.length?"FAIL":"PASS";
 console.log("FOOTER_LIVE_QA="+report.status+" views="+report.views.length+" links=4 issues="+report.issues.length);
 await writeFile(OUT+"/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
 if(report.issues.length)process.exitCode=1;
}
