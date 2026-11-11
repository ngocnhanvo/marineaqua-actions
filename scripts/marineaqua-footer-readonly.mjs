import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn",FRONT="https://marine-aqua.io.vn";
const directory="footer-live-evidence";await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={mode:process.env.FOOTER_QA_MODE||"discover",wordpress:{},routes:[],footer:{},issues:[]};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 for(const [kind,path] of [["info","/wp-json/wp/v2/thong-tin-chung?per_page=10&status=publish"],["pages","/wp-json/wp/v2/pages?per_page=100&status=publish"],["categories","/wp-json/wp/v2/categories?per_page=100"]]){
  const res=await context.request.get(WP+path,{failOnStatusCode:false,timeout:30000});
  const json=await res.json().catch(()=>[]);
  const a=Array.isArray(json)?json:[];
  report.wordpress[kind]={status:res.status(),count:a.length};
  if(kind==="info")report.wordpress[kind].items=a.map(x=>({
   id:x.id,locale:x.acf?.product_lang?.value||x.acf?.product_lang||"",
   hasLogo:Boolean(x.acf?.logo?.url),company:Boolean(x.acf?.tencongty),
   facebook:x.acf?.facebook||"",
   googlemaphanoi:String(x.acf?.googlemaphanoi||"").slice(0,600),
   googlemaphcm:String(x.acf?.googlemaphcm||"").slice(0,250),
   addressHN:x.acf?.diachihanoi||"",addressHCM:x.acf?.diachihcm||"",
  }));
  if(kind==="pages")report.wordpress[kind].items=a.map(x=>({id:x.id,slug:x.slug,title:x.title?.rendered,key:x.acf?.key,action:x.acf?.action,locale:x.acf?.product_lang?.value||x.acf?.product_lang||""}));
  if(kind==="categories")report.wordpress[kind].items=a.map(x=>({id:x.id,slug:x.slug,name:x.name,count:x.count}));
 }
 const page=await context.newPage();
 for(const route of ["/lien-he","/contact","/tin-kien-thuc","/kien-thuc","/tin-tuc","/bai-viet","/tin-tuc/tin-kien-thuc","/tin-kien-thuc/1","/san-pham"]){
   const res=await page.request.get(FRONT+route,{failOnStatusCode:false,timeout:25000});
   report.routes.push({route,status:res.status()});
 }
 const res=await page.goto(FRONT+"/",{waitUntil:"domcontentloaded",timeout:45000});
 report.footer=await page.evaluate(()=>{
  const root=document.querySelector("#footer-contact");
  return {exists:!!root,headings:[...root?.querySelectorAll("h2")||[]].map(x=>x.textContent.trim()),
   links:[...root?.querySelectorAll("a")||[]].map(x=>({text:x.textContent.trim().slice(0,55),href:x.getAttribute("href")})),
   text:root?.innerText?.slice(0,900)||""};
 });
 report.homeStatus=res?.status();
 console.log("FOOTER_DISCOVERY="+JSON.stringify(report));
 await page.close();await context.close();
}catch(e){report.issues.push(String(e.message||e).slice(0,450));process.exitCode=1;console.error("FOOTER_DISCOVERY_FAIL="+report.issues.at(-1))}
finally{await writeFile(directory+"/discovery.json",JSON.stringify(report,null,2)+"\n");await browser.close()}
