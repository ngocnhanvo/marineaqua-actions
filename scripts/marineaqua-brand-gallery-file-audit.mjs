import { chromium } from "playwright";
import { readFile,mkdir,writeFile } from "node:fs/promises";
const path="brand-gallery-file-evidence";
await mkdir(path,{recursive:true});
const source=JSON.parse(await readFile("brand-gallery-source-evidence/manifest.json","utf8"));
const all=[];
for(const p of source.products){
 const images=[...new Map(p.fullImages.map(i=>[i.url,i])).values()];
 for(const image of images.slice(1))all.push(image.url);
}
const urls=[...new Set(all)];
const result={totalReferences:all.length,unique:urls.length,files:[],errors:[],status:"STARTED"};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 for(let start=0;start<urls.length;start+=6){
  const batch=await Promise.all(urls.slice(start,start+6).map(async url=>{
   const r=await context.request.head(url,{timeout:20000,failOnStatusCode:false});
   return {url,http:r.status(),bytes:Number(r.headers()["content-length"]||0),
    type:r.headers()["content-type"]||""};
  }));
  result.files.push(...batch);
 }
 result.errors=result.files.filter(f=>f.http!==200||!f.type.startsWith("image/")||f.bytes>9000000);
 result.status=result.errors.length?"FAIL":"PASS";
 console.log("BRAND_GALLERY_FILES="+result.status+" references="+all.length+
  " unique="+urls.length+" oversized="+result.files.filter(f=>f.bytes>9000000).length+
  " maxBytes="+Math.max(0,...result.files.map(f=>f.bytes)));
 if(result.errors.length)process.exitCode=1;
 await context.close();
}catch(e){
 result.status="FAIL";
 result.errors.push({error:String(e?.message||e).slice(0,300)});
 console.error("BRAND_GALLERY_FILES_FATAL="+result.errors.at(-1).error);
 process.exitCode=1;
}finally{
 await writeFile(path+"/report.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
