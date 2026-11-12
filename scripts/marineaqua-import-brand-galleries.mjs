import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const SOURCE="https://marine-aqua.vn",WP="https://admin.marine-aqua.io.vn",DIR="brand-gallery-evidence";
await mkdir(DIR,{recursive:true});
const result={status:"STARTED",checked:0,updated:[],skipped:[],mediaCreated:[],mediaReused:[],deferred:[],errors:[]};
const browser=await chromium.launch({headless:true});
const valid=(yes,message)=>{if(!yes)throw Error(message)};
try{
 const source=JSON.parse(await readFile("brand-catalog-evidence/manifest.json","utf8"));
 valid(source.details?.length===246&&source.detailErrors?.length===0,"Unverified source gallery manifest");
 valid(Boolean(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD),"Missing WordPress credentials");
 const context=await browser.newContext({viewport:{width:1400,height:900}});
 const page=await context.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 valid(!page.url().includes("wp-login.php"),"WordPress admin login failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const response=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return response.ok?(await response.text()).trim():"";
 });
 valid(/^[a-zA-Z0-9]{8,32}$/.test(nonce),"WordPress REST nonce missing");
 const headers={"X-WP-Nonce":nonce};
 const isOwnedMedia=value=>{try{const u=new URL(value,WP);return u.origin===WP&&u.pathname.startsWith("/wp-content/uploads/")}catch{return false}};
 async function api(method,path,payload){
  for(let attempt=1;attempt<=(method==="GET"?4:1);attempt++){
   try{
    const response=await context.request.fetch(WP+path,{method,
      headers:{...headers,...(payload?{"Content-Type":"application/json"}:{})},
      data:payload?JSON.stringify(payload):undefined,failOnStatusCode:false,timeout:50000});
    if(!response.ok())throw Error("WordPress "+method+" "+path.split("?")[0]+" HTTP "+response.status()+" "+(await response.text()).slice(0,120));
    return response.json();
   }catch(e){
    if(method!=="GET"||attempt===4||!/ECONNRESET|socket hang up|TimeoutError|ETIMEDOUT|HTTP 5\d\d/.test(String(e)))throw e;
    await new Promise(resolve=>setTimeout(resolve,attempt*800));
   }
  }
 }
 const originalSources=new Map();
 const mediaList=await api("GET","/wp-json/wp/v2/media?context=edit&per_page=100&_fields=id,source_url,alt_text");
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
  const reused=mediaByFilename.get(filename);
  if(reused){
   valid(isOwnedMedia(reused.source_url),"Media origin mismatch");
   const [sourceResponse,targetResponse]=await Promise.all([
     context.request.get(src.href,{timeout:45000,failOnStatusCode:false}),
     context.request.get(new URL(reused.source_url,WP).href,{timeout:45000,failOnStatusCode:false})
   ]);
   valid(sourceResponse.ok()&&targetResponse.ok(),"Unable to compare media for safe reuse "+filename);
   const sourceSha=createHash("sha256").update(await sourceResponse.body()).digest("hex");
   const targetSha=createHash("sha256").update(await targetResponse.body()).digest("hex");
   valid(sourceSha===targetSha,"Filename conflict: same name but different media "+filename);
   result.mediaReused.push({filename,id:reused.id});return reused.id;
  }
  let bytes=null;
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
    const list=await api("GET","/wp-json/wp/v2/media?search="+encodeURIComponent(filename.replace(/\.[^.]+$/,""))+"&per_page=100&_fields=id,source_url,alt_text");
    return list.find(m=>decodeURIComponent(String(m.source_url||"").split("/").at(-1))===filename);
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
    await input.setInputFiles({name:filename,mimeType:mime,buffer:bytes});
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
  valid(decodeURIComponent(confirmedUrl.pathname.split("/").at(-1))===filename,"Media filename changed "+filename);
  const alt=String(image.alt||name).slice(0,220);
  const media=await api("POST","/wp-json/wp/v2/media/"+uploaded.id,{alt_text:alt});
  valid(media.id===uploaded.id&&media.alt_text===alt,"Media alt readback mismatch");
  mediaByFilename.set(filename,uploaded);
  result.mediaCreated.push({filename,id:uploaded.id});
  return uploaded.id;
 }

 const existing=[];
 for(let pageNo=1;pageNo<=50;pageNo++){
  const items=await api("GET","/wp-json/wc/v3/products?per_page=100&status=any&page="+pageNo);
  valid(Array.isArray(items),"WooCommerce catalog malformed");
  existing.push(...items);
  if(items.length<100)break;
 }
 const bySlug=new Map(existing.map(item=>[item.slug,item]));
 const target=source.details.filter(item=>item.images?.length>1);
 valid(target.length>0,"No original galleries to migrate");
 console.log("BRAND_GALLERY_PREFLIGHT=PASS targetProducts="+target.length+
  " extraImages="+target.reduce((n,item)=>n+item.images.length-1,0));
 for(const original of target){
  const slug=new URL(original.url).pathname.split("/").filter(Boolean).at(-1);
  result.checked++;
  try{
   const live=bySlug.get(slug);
   valid(live?.id,"WooCommerce product missing for original gallery "+slug);
   // Preserve a complete existing gallery, without forcing an overwrite of
   // its historical order or original user-owned metadata.
   if(live.images?.length>=original.images.length){
    result.skipped.push({slug,reason:"EXISTING_GALLERY_COMPLETE",count:live.images.length});continue;
   }
   valid(live.images?.length===1&&live.images[0]?.id&&isOwnedMedia(live.images[0].src),
    "Existing gallery is partial or primary media is not locally owned "+slug);
   const sourcePrimary=new URL(original.images[0].src);
   const targetPrimary=new URL(live.images[0].src,WP);
   // Verify the primary image bytes before writing any other gallery files.
   const [srcFirst,dstFirst]=await Promise.all([
    context.request.get(sourcePrimary.href,{timeout:45000,failOnStatusCode:false}),
    context.request.get(targetPrimary.href,{timeout:45000,failOnStatusCode:false})
   ]);
   valid(srcFirst.ok()&&dstFirst.ok(),"Primary image comparison network failure "+slug);
   valid(createHash("sha256").update(await srcFirst.body()).digest("hex")===
    createHash("sha256").update(await dstFirst.body()).digest("hex"),
    "Primary image SHA mismatch "+slug);
   const gallery=[{id:live.images[0].id}];
   let incomplete=false;
   for(const image of original.images.slice(1)){
    const id=await ensureMedia(image,original.title);
    if(!id){incomplete=true;break}
    gallery.push({id});
   }
   if(incomplete){result.deferred.push({slug,reason:"SOURCE_GALLERY_MEDIA_UNAVAILABLE"});continue}
   valid(gallery.length===original.images.length,"Gallery staging count mismatch "+slug);
   // REST product PUT is never retried automatically, because a request
   // that times out can already have committed. Future runs reread state.
   const changed=await api("PUT","/wp-json/wc/v3/products/"+live.id,{images:gallery});
   valid(changed?.id===live.id,"WooCommerce gallery PUT failed "+slug);
   const check=await api("GET","/wp-json/wc/v3/products/"+live.id);
   valid(check.images?.length===gallery.length&&gallery.every((media,i)=>check.images[i]?.id===media.id),
    "WooCommerce gallery order/readback mismatch "+slug);
   valid(check.images.every(media=>isOwnedMedia(media.src)),"Nonlocal image detected in gallery "+slug);
   result.updated.push({slug,id:live.id,imageIds:gallery.map(item=>item.id)});
   console.log("BRAND_GALLERY_VERIFIED="+slug+" images="+gallery.length);
  }catch(e){
   result.errors.push({slug,error:String(e?.message||e).slice(0,260)});
   console.error("BRAND_GALLERY_FAILED="+slug+" "+result.errors.at(-1).error);
  }
 }
 result.status=result.errors.length||result.deferred.length?"PARTIAL":"PASS";
 console.log("BRAND_GALLERY="+result.status+" checked="+result.checked+" updated="+result.updated.length+
  " completeExisting="+result.skipped.length+" errors="+result.errors.length+" deferred="+result.deferred.length);
 if(result.status!=="PASS")process.exitCode=1;
 await context.close();
}catch(e){
 result.status="FAIL";
 result.errors.push({fatal:String(e?.stack||e?.message||e).slice(0,600)});
 console.error("BRAND_GALLERY_FATAL="+result.errors.at(-1).fatal);
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/report.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
