import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const SOURCE="https://marine-aqua.vn",WP="https://admin.marine-aqua.io.vn",DIR="sanking-gallery-import-evidence";
const RESULT_LIMIT=500;
await mkdir(DIR,{recursive:true});
const result={createdMedia:[],reusedMedia:[],updated:[],skipped:[],backups:[],deferred:[],errors:[],status:"STARTED"};
const browser=await chromium.launch({headless:true});
const valid=(condition,message)=>{if(!condition)throw Error(message)};
try{
 const source=JSON.parse(await readFile("sanking-gallery-source-evidence/manifest.json","utf8"));
 const catalog=JSON.parse(await readFile("sanking-catalog-evidence/manifest.json","utf8"));
 valid(Array.isArray(source.products)&&source.products.length===catalog.details.filter(x=>x.images.length>1).length&&source.errors?.length===0,"Original gallery inventory incomplete");
 valid(catalog.details?.length===catalog.products?.length&&catalog.detailErrors?.length===0,"Original product source inventory incomplete");
 valid(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,"Missing WordPress credentials");
 const context=await browser.newContext({viewport:{width:1400,height:900}});
 const page=await context.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 valid(!page.url().includes("wp-login.php"),"WordPress product editor unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok?(await r.text()).trim():"";
 });
 valid(/^[a-zA-Z0-9]{8,32}$/.test(nonce),"WordPress REST nonce unavailable");
 const headers={"X-WP-Nonce":nonce};
 const isOwnedMedia=(value)=>{try{
  const u=new URL(value,WP);
  return Boolean(value)&&u.origin===WP&&u.pathname.startsWith("/wp-content/uploads/");
 }catch{return false}};
 async function api(method,path,payload){
  const max=method==="GET"?4:1;
  for(let attempt=1;attempt<=max;attempt++){
   try{
    const response=await context.request.fetch(WP+path,{method,
     headers:{...headers,...(payload?{"Content-Type":"application/json"}:{})},
     data:payload?JSON.stringify(payload):undefined,timeout:50000,failOnStatusCode:false});
    if(method==="GET"&&response.status()>=500&&attempt<max){
     await new Promise(resolve=>setTimeout(resolve,attempt*900));continue;
    }
    if(!response.ok())throw Error("WP "+method+" "+path.split("?")[0]+" HTTP "+response.status()+" "+
      (await response.text()).slice(0,120));
    return response.json();
   }catch(e){
    if(attempt>=max||!/socket hang up|ECONNRESET|ETIMEDOUT|TimeoutError/i.test(String(e)))throw e;
    await new Promise(resolve=>setTimeout(resolve,attempt*900));
   }
  }
 }
 const products=[];
 for(let n=1;n<=50;n++){
  const batch=await api("GET","/wp-json/wc/v3/products?per_page=100&status=any&page="+n);
  valid(Array.isArray(batch),"WooCommerce products inventory invalid");
  products.push(...batch);
  if(batch.length<100)break;
 }
 const bySlug=new Map(products.map(p=>[p.slug,p]));
 const mediaList=[];
 for(let n=1;n<=40;n++){
  const batch=await api("GET","/wp-json/wp/v2/media?context=edit&per_page=100&page="+n+"&_fields=id,source_url,alt_text");
  valid(Array.isArray(batch),"Malformed WordPress media list");
  mediaList.push(...batch);
  if(batch.length<100)break;
 }
 valid(Array.isArray(mediaList),"WordPress media inventory unavailable");
 const mediaByFilename=new Map(mediaList.map(x=>[decodeURIComponent(String(x.source_url||"").split("/").at(-1)),x]));
 const originalSources=new Map();
 async function ensureMedia(image,name){
  const src=new URL(image.src);
  valid(src.origin===SOURCE&&src.pathname.startsWith("/wp-content/uploads/"),"Unowned original image");
  const filename=decodeURIComponent(src.pathname.split("/").at(-1));
  valid(/^[^\/\\\x00-\x1f]{1,170}\.(png|jpe?g|webp)$/i.test(filename),"Image filename invalid");
  valid(!originalSources.has(filename)||originalSources.get(filename)===src.href,"Filename collision "+filename);
  originalSources.set(filename,src.href);
  const riskyFilename=/\.\.(?=[^.]+$)|woocommerce-placeholder|[\u2018\u2019]|-\d+x\d+\.[^.]+$|^download\.(jpe?g|png|webp)$/i.test(filename);
  const originalResponse=await (async()=>{
   for(let attempt=1;attempt<=4;attempt++){
    try{
     const response=await context.request.get(src.href,{timeout:45000,failOnStatusCode:false});
     valid(response.ok(),"Original image HTTP "+response.status());
     return response;
    }catch(error){
     if(attempt===4)throw error;
     await new Promise(resolve=>setTimeout(resolve,attempt*900));
    }
   }
  })();
  const originalBytes=await originalResponse.body();
  const expectedSha=createHash("sha256").update(originalBytes).digest("hex");
  const safeFilename=riskyFilename
   ? "marine-aqua-original-"+expectedSha.slice(0,20)+"."+filename.split(".").at(-1).toLowerCase()
   : filename;
  const reused=mediaByFilename.get(safeFilename);
  if(reused){
   valid(isOwnedMedia(reused.source_url),"Media origin mismatch");
   const [sourceResponse,targetResponse]=await Promise.all([
     Promise.resolve({ok:()=>true,body:async()=>originalBytes}),
     context.request.get(new URL(reused.source_url,WP).href,{timeout:45000,failOnStatusCode:false})
   ]);
   valid(sourceResponse.ok()&&targetResponse.ok(),"Unable to compare media for safe reuse "+filename);
   const sourceSha=createHash("sha256").update(await sourceResponse.body()).digest("hex");
   const targetSha=createHash("sha256").update(await targetResponse.body()).digest("hex");
   valid(sourceSha===targetSha,"Filename conflict: same name but different media "+filename);
   result.reusedMedia.push({filename,id:reused.id});return reused.id;
  }
  let bytes=originalBytes;
  for(let attempt=0;attempt<=3;attempt++){
   try{
    const response=await context.request.get(src.href,{timeout:35000,failOnStatusCode:false});
    valid(response.ok(),"Image HTTP "+response.status());
    bytes=await response.body();
    valid(bytes.length>500&&bytes.length<9000000,"Image size invalid");
    break;
   }catch(e){if(attempt===3){result.deferred.push({src:src.href,attempts:4,error:String(e).slice(0,160)});return null}}
  }
  const mime=/\.png$/i.test(filename)?"image/png":/\.webp$/i.test(filename)?"image/webp":"image/jpeg";
  // Native WordPress media uploader is preferred for the original product images.
  // A REST binary upload can be interrupted by the upstream proxy even when
  // the request was accepted; always check Media Library before submitting.
  const readExisting=async()=>{
    const list=await api("GET","/wp-json/wp/v2/media?search="+encodeURIComponent(safeFilename.replace(/\.[^.]+$/,""))+"&per_page=100&_fields=id,source_url,alt_text");
    return list.find(m=>decodeURIComponent(String(m.source_url||"").split("/").at(-1))===safeFilename);
  };
  let uploaded=await readExisting();
  if(!uploaded){
    await page.goto(WP+"/wp-admin/media-new.php",{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction(()=>document.querySelector('input[type="file"][id^="html5_"]')||
      document.querySelector('#file-form input[type="file"]'),null,{timeout:20000});
    await page.waitForTimeout(900);
    const html5=page.locator('input[type="file"][id^="html5_"]').first();
    const hasHTML5=await html5.count()>0;
    const input=hasHTML5?html5:page.locator("#async-upload");
    valid(await input.count()>0,"WordPress native media upload input missing");
    await input.setInputFiles({name:safeFilename,mimeType:mime,buffer:bytes});
    if(!hasHTML5){
      await page.evaluate(()=>{
        const field=document.querySelector("#async-upload");
        const form=field?.form;
        if(!form||form.method.toLowerCase()!=="post"||
           form.enctype!=="multipart/form-data"||
           !form.action.startsWith(location.origin+"/wp-admin/"))
          throw Error("Native WordPress classic upload form invalid");
        const submit=form.querySelector('input[type="submit"],button[type="submit"]');
        if(!submit)throw Error("Native upload submit missing");
        form.requestSubmit(submit);
      });
      await page.waitForLoadState("domcontentloaded",{timeout:45000}).catch(()=>{});
    }
    for(let attempt=0;attempt<18;attempt++){
      await page.waitForTimeout(1000);
      uploaded=await readExisting();
      if(uploaded)break;
    }
  }
  valid(uploaded?.id,"Native media upload did not persist "+filename);
  console.log("CATALOG_MEDIA_NATIVE_VERIFIED="+filename+" id="+uploaded.id);
  const confirmed=await api("GET","/wp-json/wp/v2/media/"+uploaded.id+"?_fields=id,source_url,alt_text");
  const confirmedUrl=new URL(String(confirmed.source_url||""),WP);
  valid(confirmed.id===uploaded.id&&confirmedUrl.origin===WP&&confirmedUrl.pathname.startsWith("/wp-content/uploads/"),"Media upload invalid "+filename+" source="+String(confirmed.source_url).slice(0,120));
  valid(decodeURIComponent(confirmedUrl.pathname.split("/").at(-1))===safeFilename,"Media filename changed "+filename);
  if(riskyFilename){
   const imageCheck=await context.request.get(confirmedUrl.href,{timeout:45000,failOnStatusCode:false});
   valid(imageCheck.ok(),"Safe media file HTTP "+imageCheck.status());
   valid(createHash("sha256").update(await imageCheck.body()).digest("hex")===expectedSha,
    "Safe media checksum mismatch "+filename);
   result.renamed=(result.renamed||[]).concat([{original:filename,safe:safeFilename,sha256:expectedSha}]);
  }
  const alt=String(image.alt||name).slice(0,220);
  const media=await api("POST","/wp-json/wp/v2/media/"+uploaded.id,{alt_text:alt});
  valid(media.id===uploaded.id&&media.alt_text===alt,"Media alt readback mismatch");
  mediaByFilename.set(safeFilename,uploaded);
  result.createdMedia.push({filename,id:uploaded.id});
  return uploaded.id;
 }

 const before=new Set((catalog.target.products||[]).map(x=>x.slug));
 const tasks=source.products.filter(p=>p.fullImages?.length>1 && !before.has(new URL(p.url).pathname.split("/").filter(Boolean).at(-1))).slice(0,RESULT_LIMIT);
 result.totalTasks=tasks.length;
 console.log("SANKING_GALLERY_PREFLIGHT products="+products.length+" multiImage="+tasks.length+
  " media="+mediaList.length);
 for(const product of tasks){
  const slug=new URL(product.url).pathname.split("/").filter(Boolean).at(-1);
  try{
   const item=bySlug.get(slug);
   valid(item?.id,"Original gallery target product not found "+slug);
   const sourceImages=[...new Map(product.fullImages.map(image=>[image.url,image])).values()];
   const existingImages=(item.images||[]).filter(x=>x.id&&isOwnedMedia(x.src));
   valid(existingImages.length>0,"Product main media missing "+slug);
   const mediaIds=[];
   for(const image of sourceImages){
    const filename=decodeURIComponent(new URL(image.url).pathname.split("/").at(-1));
    const current=existingImages.find(m=>{
     try{return decodeURIComponent(new URL(m.src,WP).pathname.split("/").at(-1))===filename}catch{return false}
    });
    if(current){mediaIds.push(current.id);continue}
    const mediaId=await ensureMedia({src:image.url,alt:image.alt},item.name);
    valid(Boolean(mediaId),"Gallery media upload incomplete "+slug+" "+filename);
    mediaIds.push(mediaId);
   }
   const targetIds=new Set(existingImages.map(m=>m.id));
   if(mediaIds.every(id=>targetIds.has(id))){
    result.skipped.push({slug,id:item.id,count:mediaIds.length});continue;
   }
   const imagePayload=sourceImages.map((img,i)=>({id:mediaIds[i],alt:img.alt||item.name}));
   // Keep first image if legacy/gallery extraction put thumbnails before main.
   if(mediaIds[0]!==existingImages[0].id){
    // Pre-existing main image may carry the source's deterministic safe alias.
    // Compare bytes before accepting another media library object.
    const original=sourceImages[0].url;
    const targetUrl=new URL(existingImages[0].src,WP).href;
    const [srcResp,dstResp]=await Promise.all([
     context.request.get(original,{timeout:45000,failOnStatusCode:false}),
     context.request.get(targetUrl,{timeout:45000,failOnStatusCode:false}),
    ]);
    valid(srcResp.ok()&&dstResp.ok(),"Unable to verify original main media "+slug);
    const a=createHash("sha256").update(await srcResp.body()).digest("hex");
    const b=createHash("sha256").update(await dstResp.body()).digest("hex");
    valid(a===b,"Main media differs from source "+slug);
    mediaIds[0]=existingImages[0].id;
   }
   result.backups.push({slug,id:item.id,images:existingImages.map(i=>({id:i.id,alt:i.alt||""}))});
   await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
   const updated=await api("PUT","/wp-json/wc/v3/products/"+item.id,{images:imagePayload});
   valid(updated?.id===item.id,"Gallery update failed "+slug);
   const verified=await api("GET","/wp-json/wc/v3/products/"+item.id);
   valid(verified.images?.length===mediaIds.length &&
    verified.images.every((m,i)=>m.id===mediaIds[i]&&isOwnedMedia(m.src)),
    "Gallery read-after-write mismatch "+slug);
   result.updated.push({slug,id:item.id,count:mediaIds.length});
   console.log("SANKING_GALLERY_UPDATED="+slug+" count="+mediaIds.length);
  }catch(e){
   result.errors.push({slug,error:String(e?.message||e).slice(0,260)});
   console.error("SANKING_GALLERY_FAILED="+slug+" "+result.errors.at(-1).error);
  }
 }
 result.status=result.errors.length||result.deferred.length?"PARTIAL":"PASS";
 console.log("SANKING_GALLERY_IMPORT="+result.status+" updated="+result.updated.length+
  " skipped="+result.skipped.length+" errors="+result.errors.length+
  " deferred="+result.deferred.length);
 if(result.status!=="PASS")process.exitCode=1;
 await context.close();
}catch(e){
 result.status="FAIL";
 result.errors.push({fatal:String(e?.stack||e?.message||e).slice(0,700)});
 console.error("SANKING_GALLERY_FATAL="+result.errors.at(-1).fatal);
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
