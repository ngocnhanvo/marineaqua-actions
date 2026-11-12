import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile,writeFile,mkdir } from "node:fs/promises";
const ROOT="next-category-gallery-parity-evidence";
const WP="https://admin.marine-aqua.io.vn";
await mkdir(ROOT,{recursive:true});
const source=JSON.parse(await readFile("next-category-gallery-source-evidence/manifest.json","utf8"));
const catalog=JSON.parse(await readFile("next-category-catalog-evidence/manifest.json","utf8"));
const before=new Set((catalog.target.products||[]).map(p=>p.slug));
const result={checked:0,passed:0,failures:[],aliasDiagnostics:[],status:"STARTED"};
const browser=await chromium.launch({headless:true});
try{
 if(source.products?.length!==catalog.details.filter(p=>p.images?.length>1).length||source.errors?.length)
  throw Error("Gallery source manifest incomplete");
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 if(page.url().includes("wp-login.php"))throw Error("WordPress credentials rejected");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok?(await r.text()).trim():"";
 });
 if(!nonce)throw Error("WP REST nonce unavailable");
 const products=[];
 for(let n=1;n<=50;n++){
  let response;
  for(let retry=0;retry<4;retry++){
   try{
    response=await context.request.get(WP+"/wp-json/wc/v3/products?per_page=100&status=any&page="+n,{
     headers:{"X-WP-Nonce":nonce},timeout:50000,failOnStatusCode:false});
    if(response.ok())break;
   }catch(e){if(retry===3)throw e}
   await new Promise(resolve=>setTimeout(resolve,(retry+1)*1000));
  }
  if(!response?.ok())throw Error("Target WooCommerce list failed on page "+n);
  const list=await response.json();
  if(!Array.isArray(list))throw Error("Target WooCommerce list malformed");
  products.push(...list);
  if(list.length<100)break;
 }
 const bySlug=new Map(products.map(p=>[p.slug,p]));
 const filename=value=>decodeURIComponent(new URL(value,WP).pathname.split("/").at(-1));
 for(const sourceProduct of source.products){
  // Verify every source gallery, including products reused from previous migrations.
  const slug=new URL(sourceProduct.url).pathname.split("/").filter(Boolean).at(-1);
  const target=bySlug.get(slug);
  const sourceImages=[...new Map(sourceProduct.fullImages.map(i=>[i.url,i])).values()];
  const expected=sourceImages.map(i=>filename(i.url));
  const actual=(target?.images||[]).map(i=>filename(i.src||""));
  result.checked++;
  let match=expected.length===actual.length;
  if(match){
   for(let i=0;i<expected.length;i++){
    if(expected[i]===actual[i])continue;
    // WordPress normalizes the legacy double-dot filename. The source hash
    // is the only permitted alias, and the uploaded bytes must match it.
    if(!(/\.\.(?=[^.]+$)|woocommerce-placeholder|[\u2018\u2019]|-\d+x\d+\.[^.]+$|^download\.(jpe?g|png|webp)$/i.test(expected[i])) ||
       !/^marine-aqua-original-[a-f0-9]{20}\.(png|jpe?g|webp)$/i.test(actual[i])){
     match=false;break;
    }
    const original=sourceImages[i].url;
    const current=target.images[i]?.src;
    if(!current){match=false;break}
    try{
     const [src,dst]=await Promise.all([
      context.request.get(original,{timeout:45000,failOnStatusCode:false}),
      context.request.get(new URL(current,WP).href,{timeout:45000,failOnStatusCode:false}),
     ]);
     if(!src.ok()||!dst.ok()){
      result.aliasDiagnostics.push({slug,index:i,sourceStatus:src.status(),targetStatus:dst.status()});
      match=false;break;
     }
     const a=createHash("sha256").update(await src.body()).digest("hex");
     const b=createHash("sha256").update(await dst.body()).digest("hex");
     result.aliasDiagnostics.push({slug,index:i,sourceSha:a,targetSha:b,alias:actual[i],sourceName:expected[i]});
     if(a!==b||!actual[i].includes(a.slice(0,20))){match=false;break}
    }catch(error){result.aliasDiagnostics.push({slug,index:i,error:String(error).slice(0,180)});match=false;break}
   }
  }
  if(!match)result.failures.push({slug,expected,actual});
  else result.passed++;
 }
 result.status=result.failures.length?"FAIL":"PASS";
 console.log("NEXT_CATEGORY_GALLERY_PARITY="+result.status+" matched="+result.passed+
  "/"+result.checked+" failures="+result.failures.length);
 if(result.failures.length)process.exitCode=1;
 await context.close();
}catch(e){
 result.status="FAIL";
 result.failures.push({fatal:String(e?.stack||e?.message||e).slice(0,450)});
 console.error("NEXT_CATEGORY_GALLERY_PARITY_FATAL="+result.failures.at(-1).fatal);
 process.exitCode=1;
}finally{
 await writeFile(ROOT+"/report.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
