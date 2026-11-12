import { chromium } from "playwright";
import { readFile,mkdir,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const DIR="brand-media-collision-evidence";
await mkdir(DIR,{recursive:true});
const input=JSON.parse(await readFile("brand-catalog-evidence/manifest.json","utf8"));
const files=new Map();
for(const product of input.details){
 const image=product.images?.[0];
 if(!image?.src)continue;
 const filename=decodeURIComponent(new URL(image.src).pathname.split("/").at(-1));
 if(!files.has(filename))files.set(filename,[]);
 const list=files.get(filename);
 if(!list.some(x=>x.src===image.src))list.push({src:image.src,product:product.url});
}
const collisions=[...files.entries()].filter(([,values])=>values.length>1);
const result={groups:[],errors:[]};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 for(const [filename,sources] of collisions){
  const hashes=[];
  for(const source of sources){
   const response=await context.request.get(source.src,{timeout:45000,failOnStatusCode:false});
   if(!response.ok())throw Error("Source image HTTP "+response.status()+" "+filename);
   const bytes=await response.body();
   hashes.push({...source,sha256:createHash("sha256").update(bytes).digest("hex"),size:bytes.length});
  }
  const identical=hashes.every(x=>x.sha256===hashes[0].sha256);
  result.groups.push({filename,identical,hashes});
  console.log("BRAND_MEDIA_COLLISION="+filename+" identical="+identical);
 }
 console.log("BRAND_MEDIA_COLLISION_AUDIT=PASS groups="+result.groups.length+
   " identical="+result.groups.filter(x=>x.identical).length+
   " distinct="+result.groups.filter(x=>!x.identical).length);
 await context.close();
}catch(e){
 result.errors.push(String(e?.message||e).slice(0,350));
 console.error("BRAND_MEDIA_COLLISION_AUDIT_FAIL="+result.errors.at(-1));
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
