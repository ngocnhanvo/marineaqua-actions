import { chromium } from "playwright";
import { mkdir,writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const WP="https://admin.marine-aqua.io.vn";
const SOURCE="https://marine-aqua.vn";
const SLUG="den-cho-thuy-cung-ho-lon-zetlight-zet-200w-b-w";
const DIR="promotion-missing-product-evidence";
const result={slug:SLUG,status:"STARTED",created:[],reused:[],mediaCreated:[],errors:[],cleanupRemaining:[]};
const valid=(x,m)=>{if(!x)throw Error(m)};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 valid(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,"WP credentials missing");
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 const original=await context.newPage();
 await original.goto(SOURCE+"/san-pham/"+SLUG+"/",{waitUntil:"domcontentloaded",timeout:60000});
 const detail=await original.evaluate(()=>({
  title:document.querySelector("h1.product_title,h1")?.textContent?.trim()||"",
  description:document.querySelector(".woocommerce-Tabs-panel--description,.woocommerce-tabs .woocommerce-Tabs-panel")?.innerHTML||"",
  summary:document.querySelector(".woocommerce-product-details__short-description")?.innerHTML||"",
  image:document.querySelector(".woocommerce-product-gallery__image img")?.getAttribute("data-large_image")||
        document.querySelector(".woocommerce-product-gallery__image img")?.getAttribute("src")||"",
  priceText:document.querySelector(".summary .price")?.textContent?.trim()||"",
  sku:document.querySelector(".sku")?.textContent?.trim()||""
 }));
 console.log("PROMOTION_SOURCE_DIAGNOSTIC="+JSON.stringify({url:original.url(),documentTitle:await original.title(),detail,images:await original.locator('img').evaluateAll(xs=>xs.slice(0,14).map(x=>({alt:x.alt,src:x.getAttribute('src'),dataSrc:x.getAttribute('data-src')})))}).slice(0,5200));
 valid(detail.title&&detail.image,"Source title / main media missing");
 const sourceImage=new URL(detail.image,SOURCE);
 valid(sourceImage.origin===SOURCE&&sourceImage.pathname.startsWith("/wp-content/uploads/"),"Source image is not legacy-owned WP media");
 const sourceName=decodeURIComponent(sourceImage.pathname.split("/").pop()||"");
 valid(/^[^/\\\x00-\x1f]{1,170}\.(jpe?g|png|webp)$/i.test(sourceName),"Unsafe source media filename");
 const priceText=(await original.locator("body").innerText()).match(/21[.,]499[.,]000\s*₫/);
 valid(priceText,"Source price verification failed");
 const price="21499000";
 console.log("PROMOTION_MISSING_SOURCE="+JSON.stringify({slug:SLUG,title:detail.title,image:sourceImage.pathname,price}));
 const page=await context.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
 await page.locator("#wp-submit").click();
 valid(!page.url().includes("wp-login.php"),"WP login failed");
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok?(await r.text()).trim():"";
 });
 valid(/^[a-zA-Z0-9]{8,32}$/.test(nonce),"WP admin REST nonce missing");
 async function api(method,path,payload){
  const r=await context.request.fetch(WP+path,{method,
   headers:{"X-WP-Nonce":nonce,...(payload?{"Content-Type":"application/json"}:{})},
   data:payload?JSON.stringify(payload):undefined,failOnStatusCode:false,timeout:50000});
  if(!r.ok())throw Error("CMS "+method+" "+path.split("?")[0]+" HTTP "+r.status()+" "+(await r.text()).slice(0,120));
  return r.json();
 }
 const existing=await api("GET","/wp-json/wc/v3/products?per_page=100&status=any&slug="+encodeURIComponent(SLUG));
 valid(Array.isArray(existing),"WooCommerce inventory not returned");
 if(existing.length){
  valid(existing.length===1&&existing[0].slug===SLUG&&existing[0].status==="publish","Existing product conflict");
  result.reused.push(existing[0].id);
  result.id=existing[0].id;result.status="ALREADY_PUBLISHED";console.log("PROMOTION_MISSING_PRODUCT="+JSON.stringify(result));
 }else{
  const categories=await api("GET","/wp-json/wc/v3/products/categories?per_page=100");
  const category=categories.find(c=>c.slug==="den-cho-be-ca-bien-san-ho");
  valid(category?.id,"Target lighting category missing; refuse uncategorized import");
  const filename=sourceName;
  const media=await api("GET","/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(filename.replace(/\.[^.]+$/,""))+"&per_page=100&_fields=id,source_url");
  let candidate=media.find(x=>decodeURIComponent(String(x.source_url||"").split("/").pop())===filename);
  const sourceResponse=await context.request.get(sourceImage.href,{timeout:45000,failOnStatusCode:false});
  valid(sourceResponse.ok(),"Legacy media HTTP "+sourceResponse.status());
  const bytes=await sourceResponse.body();
  valid(bytes.length>500&&bytes.length<9000000,"Legacy media size invalid");
  if(candidate){
   valid(new URL(candidate.source_url).origin===WP,"Target reused media origin mismatch");
   const old=await context.request.get(candidate.source_url,{timeout:45000,failOnStatusCode:false});
   valid(old.ok()&&createHash("sha256").update(await old.body()).digest("hex")===createHash("sha256").update(bytes).digest("hex"),"Target media filename collision with different bytes");
  }else{
   await page.goto(WP+"/wp-admin/media-new.php",{waitUntil:"domcontentloaded",timeout:45000});
   await page.waitForFunction(()=>Boolean(document.querySelector('input[type="file"][id^="html5_"],#async-upload')),{timeout:20000});
   const html5=page.locator('input[type="file"][id^="html5_"]').first();
   const isHtml5=await html5.count()>0;
   const input=isHtml5?html5:page.locator("#async-upload");
   await input.setInputFiles({name:filename,buffer:bytes,mimeType:/\.png$/i.test(filename)?"image/png":/\.webp$/i.test(filename)?"image/webp":"image/jpeg"});
   if(!isHtml5){
    await page.evaluate(()=>{
     const form=document.querySelector("#async-upload")?.form;
     if(!form||form.method.toLowerCase()!=="post"||form.enctype!=="multipart/form-data"||!form.action.startsWith(location.origin+"/wp-admin/"))throw Error("Unexpected native upload form");
     form.requestSubmit();
    });
   }
   for(let n=0;n<20;n++){
    await page.waitForTimeout(1100);
    const list=await api("GET","/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(filename.replace(/\.[^.]+$/,""))+"&per_page=100&_fields=id,source_url");
    candidate=list.find(x=>decodeURIComponent(String(x.source_url||"").split("/").pop())===filename);
    if(candidate)break;
   }
   valid(candidate?.id,"WP media upload not persisted");
   result.mediaCreated.push(candidate.id);
  }
  const payload={
   name:detail.title,slug:SLUG,status:"publish",type:"simple",catalog_visibility:"visible",
   description:detail.description||"",short_description:detail.summary||"",
   regular_price:price,stock_status:"instock",manage_stock:false,
   categories:[{id:category.id}],images:[{id:candidate.id}],
  };
  const created=await api("POST","/wp-json/wc/v3/products",payload);
  valid(created.id&&created.slug===SLUG,"WooCommerce product creation invalid");
  const check=await api("GET","/wp-json/wc/v3/products/"+created.id);
  valid(check.slug===SLUG&&check.status==="publish"&&Number(check.price)===21499000&&check.images?.[0]?.id===candidate.id&&check.categories?.some(x=>x.id===category.id),"WooCommerce product readback mismatch");
  result.id=created.id;result.created.push(created.id);result.status="CREATED_VERIFIED";
  console.log("PROMOTION_MISSING_PRODUCT="+JSON.stringify(result));
 }
}catch(e){result.errors.push(String(e.message||e).slice(0,400));result.status="FAIL";console.error("PROMOTION_MISSING_PRODUCT_FAIL="+result.errors.at(-1));process.exitCode=1}
finally{await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");await browser.close()}
