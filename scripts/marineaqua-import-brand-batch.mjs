import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const SOURCE="https://marine-aqua.vn", WP="https://admin.marine-aqua.io.vn", DIR="brand-import-batch-evidence";
const BATCH_LIMIT=250;
await mkdir(DIR,{recursive:true});
const result={batchLimit:BATCH_LIMIT,created:[],reused:[],mediaCreated:[],mediaReused:[],categoriesCreated:[],deferred:[],errors:[],sourceMissingSeo:[],status:"STARTED"};
const browser=await chromium.launch({headless:true});
const valid=(ok,msg)=>{if(!ok)throw Error(msg)};
try {
 const source=JSON.parse(await readFile("brand-catalog-evidence/manifest.json","utf8"));
 const mapping=JSON.parse(await readFile("brand-taxonomy-mapping-evidence/mapping.json","utf8"));
 valid(source.source===SOURCE+"/danh-muc/thuong-hieu/"&&source.details?.length===246&&source.detailErrors?.length===0,"Source manifest unverified");
 valid(mapping.inputCount===246&&mapping.unassigned?.length===0&&mapping.errors?.length===0,"Source taxonomy mapping unverified");
 valid(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,"Missing WP admin credentials");
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
 valid(/^[a-zA-Z0-9]{8,32}$/.test(nonce),"REST nonce missing");
 const headers={"X-WP-Nonce":nonce};
 const isOwnedMedia=(v)=>{try{const u=new URL(v,WP);return Boolean(v)&&u.origin===WP&&u.pathname.startsWith("/wp-content/uploads/")}catch{return false}};
 async function api(method,path,payload) {
  const maxAttempts=method==="GET"?4:1;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   try {
    const response=await context.request.fetch(WP+path,{method,
     headers:{...headers,...(payload?{"Content-Type":"application/json"}:{})},
     data:payload?JSON.stringify(payload):undefined,failOnStatusCode:false,timeout:50000});
    if(method==="GET"&&response.status()>=500&&attempt<maxAttempts){
     await new Promise(resolve=>setTimeout(resolve,attempt*800));continue;
    }
    if(!response.ok())throw Error("WP "+method+" "+path.split("?")[0]+" HTTP "+response.status()+" "+(await response.text()).slice(0,180));
    return response.json();
   }catch(e){
    if(attempt>=maxAttempts||!/ECONNRESET|socket hang up|ETIMEDOUT|TimeoutError|ECONNABORTED/i.test(String(e)))throw e;
    console.log("BRAND_WP_GET_RETRY="+attempt+" path="+path.split("?")[0]);
    await new Promise(resolve=>setTimeout(resolve,attempt*800));
   }
  }
 }
 const existing=[];
 for(let pageNo=1;pageNo<=50;pageNo++){
  const list=await api("GET","/wp-json/wc/v3/products?per_page=100&status=any&page="+pageNo);
  if(!Array.isArray(list))throw Error("WooCommerce inventory malformed");
  existing.push(...list);
  if(list.length<100)break;
 }
 const products=new Map(existing.map(x=>[x.slug,x]));
 const categories=await api("GET","/wp-json/wc/v3/products/categories?per_page=100");
 valid(Array.isArray(categories),"WooCommerce categories unavailable");
 const cats=new Map(categories.map(c=>[c.slug,c]));
 const priceAmounts=value=>[...String(value).matchAll(/([\d.,]+)₫/g)]
  .map(m=>Number(m[1].replace(/[.,]/g,""))).filter(n=>Number.isFinite(n)&&n>0&&n<100000000);
 const mediaList=await api("GET","/wp-json/wp/v2/media?context=edit&per_page=100&_fields=id,source_url,alt_text");
 valid(Array.isArray(mediaList),"WordPress media inventory unavailable");
 const mediaByFilename=new Map(mediaList.map(x=>[decodeURIComponent(String(x.source_url||"").split("/").at(-1)),x]));
 const originalSources=new Map();
 async function ensureMedia(image,name){
  const src=new URL(image.src);
  valid(src.origin===SOURCE&&src.pathname.startsWith("/wp-content/uploads/"),"Unowned original image");
  const filename=decodeURIComponent(src.pathname.split("/").at(-1));
  valid(/^[^\/\\\x00-\x1f]{1,170}\.(png|jpe?g|webp)$/i.test(filename),"Image filename invalid");
  const priorSource=originalSources.get(filename);
  if(priorSource&&priorSource!==src.href){
   // Distinct legacy paths may contain byte-identical assets. Reuse is safe
   // only after direct hash comparison; never silently rename or overwrite.
   const [oldResponse,newResponse]=await Promise.all([
    context.request.get(priorSource,{timeout:45000,failOnStatusCode:false}),
    context.request.get(src.href,{timeout:45000,failOnStatusCode:false})
   ]);
   valid(oldResponse.ok()&&newResponse.ok(),"Unable to verify legacy media collision "+filename);
   const oldHash=createHash("sha256").update(await oldResponse.body()).digest("hex");
   const newHash=createHash("sha256").update(await newResponse.body()).digest("hex");
   valid(oldHash===newHash,"Different legacy media content under same filename "+filename);
  }
  if(!priorSource)originalSources.set(filename,src.href);
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
  // WordPress reserves image-size suffixes and sanitizes Unicode punctuation.
  // Use a stable, collision-resistant media name only for the known unsafe
  // filename patterns; keep source filename and exact bytes in metadata.
  const riskyFilename=/woocommerce-placeholder|[\u2018\u2019]|-\d+x\d+\.[^.]+$/i.test(filename);
  const originalHash=createHash("sha256").update(bytes).digest("hex");
  const safeFilename=riskyFilename
    ? "marine-aqua-original-"+originalHash.slice(0,20)+"."+filename.split(".").at(-1).toLowerCase()
    : filename;
  if(riskyFilename)console.log("BRAND_MEDIA_SAFE_FILENAME="+filename+" => "+safeFilename);
  const mime=/\.png$/i.test(safeFilename)?"image/png":/\.webp$/i.test(safeFilename)?"image/webp":"image/jpeg";
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
  const mediaResponse=await context.request.get(confirmedUrl.href,{timeout:45000,failOnStatusCode:false});
  valid(mediaResponse.ok(),"Uploaded media verification HTTP "+mediaResponse.status());
  valid(createHash("sha256").update(await mediaResponse.body()).digest("hex")===originalHash,
    "Uploaded image differs from original source "+filename);
  const alt=String(image.alt||name).slice(0,220);
  const media=await api("POST","/wp-json/wp/v2/media/"+uploaded.id,{alt_text:alt});
  valid(media.id===uploaded.id&&media.alt_text===alt,"Media alt readback mismatch");
  mediaByFilename.set(filename,uploaded);
  result.mediaCreated.push({filename,id:uploaded.id});
  return uploaded.id;
 }
 const normalizeName=s=>String(s||"").replace(/&#(x[0-9a-f]+|[0-9]+);?/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):parseInt(n,10))).replace(/&(amp|quot|apos|lt|gt|nbsp);/gi,(_,v)=>({amp:"&",quot:'"\x22"',apos:"\x27",lt:"<",gt:">",nbsp:" "}[v.toLowerCase()])).normalize("NFC").replace(/\\s+/g," ").trim();
 const safeText=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
 const paragraphs=s=>String(s||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).map(x=>"<p>"+safeText(x)+"</p>").join("\n");

 const selected=source.details.filter(item=>{
  const slug=new URL(item.url).pathname.split("/").filter(Boolean).at(-1);
  return !products.has(slug);
 }).slice(0,BATCH_LIMIT);
 result.selected=selected.map(item=>item.url);
 console.log("BRAND_BATCH_PREFLIGHT=PASS existing="+existing.length+" selected="+selected.length);
 for(const original of selected){
  const url=original.url,slug=new URL(url).pathname.split("/").filter(Boolean).at(-1);
  try{
   valid(url.startsWith(SOURCE+"/san-pham/")&&original.title&&original.images?.length,"Source title/media invalid "+slug);
   valid(!products.has(slug),"Product changed during import "+slug);
   const assigned=mapping.assignments?.[url];
   valid(Array.isArray(assigned)&&assigned.length>0,"Unverified category assignment "+slug);
   const categoryIds=[];
   for(const category of assigned){
    const live=cats.get(category.slug);
    valid(live?.id===category.id,"Target taxonomy drift "+category.slug);
    if(!categoryIds.includes(category.id))categoryIds.push(category.id);
   }
   const amounts=[...new Set(priceAmounts(original.priceText))];
   let regular_price="",sale_price="";
   if(amounts.length===1)regular_price=String(amounts[0]);
   else if(amounts.length===2&&amounts[0]>amounts[1]){
    regular_price=String(amounts[0]);sale_price=String(amounts[1]);
   }else if(original.priceText.trim()!=="Liên hệ"){
    throw Error("Ambiguous source price "+slug+": "+original.priceText.slice(0,110));
   }
   const stock=/hết hàng/i.test(original.stockText)?"outofstock":
    /còn hàng/i.test(original.stockText)?"instock":"";
   valid(Boolean(stock),"Unverified stock "+slug+": "+original.stockText);
   const mediaId=await ensureMedia(original.images[0],original.title);
   if(!mediaId){result.deferred.push({source_url:url,reason:"MEDIA_DEFERRED"});continue}
   const metadata=[
    {key:"_marine_source_url",value:url},
    {key:"_marine_source_id",value:String(original.id||"")},
    ...(original.seoTitle?[{key:"_yoast_wpseo_title",value:original.seoTitle}]:[]),
    ...(original.seoDescription?[{key:"_yoast_wpseo_metadesc",value:original.seoDescription}]:[]),
   ];
   if(!original.seoDescription)result.sourceMissingSeo.push({url,field:"meta_description",status:"SEO_SOURCE_MISSING"});
   const payload={
    name:original.title,slug,type:"simple",status:"publish",
    catalog_visibility:"visible",manage_stock:false,stock_status:stock,
    regular_price,sale_price,
    description:paragraphs(original.description),
    short_description:paragraphs(original.excerpt),
    images:[{id:mediaId,alt:original.images[0].alt||original.title}],
    categories:categoryIds.map(id=>({id})),
    meta_data:metadata,
   };
   if(original.sku)payload.sku=original.sku;
   // Only create previously absent, source-verified products. An interrupted
   // POST is never retried in this run: the next run re-fetches source IDs.
   const created=await api("POST","/wp-json/wc/v3/products",payload);
   valid(created?.id&&created.slug===slug,"Product POST failed readback "+slug);
   const check=await api("GET","/wp-json/wc/v3/products/"+created.id);
   valid(check.slug===slug&&normalizeName(check.name)===normalizeName(original.title),
    "Product identity readback mismatch "+slug);
   valid(check.stock_status===stock&&check.regular_price===regular_price&&
    check.sale_price===sale_price,"Product price/stock mismatch "+slug);
   valid(categoryIds.every(id=>check.categories?.some(c=>c.id===id))&&
    check.images?.[0]?.id===mediaId&&isOwnedMedia(check.images[0].src),
    "Product taxonomy/media readback mismatch "+slug);
   result.created.push({id:created.id,slug,url,categoryIds,regular_price,sale_price,stock,mediaId});
   products.set(slug,check);
   console.log("BRAND_BATCH_PRODUCT_VERIFIED="+slug+" id="+created.id);
  }catch(error){
   result.errors.push({url,error:String(error?.message||error).slice(0,260)});
   console.error("BRAND_BATCH_PRODUCT_FAILED="+slug+" "+result.errors.at(-1).error);
  }
 }
 result.status=result.errors.length||result.deferred.length?"PARTIAL":"PASS";
 console.log("BRAND_IMPORT_BATCH="+result.status+" created="+result.created.length+
   " missingBefore="+(source.details.length-existing.length)+" errors="+result.errors.length+
   " deferred="+result.deferred.length);
 if(result.status!=="PASS")process.exitCode=1;
 await context.close();
}catch(error){
 result.status="FAIL";
 result.errors.push({error:String(error?.stack||error?.message||error).slice(0,700)});
 console.error("BRAND_IMPORT_FATAL="+result.errors.at(-1).error);
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
