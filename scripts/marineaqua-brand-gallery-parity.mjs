import { chromium } from "playwright";
import { readFile,writeFile,mkdir } from "node:fs/promises";
const ROOT="brand-gallery-parity-evidence";
const WP="https://admin.marine-aqua.io.vn";
await mkdir(ROOT,{recursive:true});
const source=JSON.parse(await readFile("brand-gallery-source-evidence/manifest.json","utf8"));
const result={checked:0,passed:0,failures:[],status:"STARTED"};
const browser=await chromium.launch({headless:true});
try{
 if(source.products?.length!==64||source.errors?.length)
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
  const slug=new URL(sourceProduct.url).pathname.split("/").filter(Boolean).at(-1);
  const target=bySlug.get(slug);
  const expected=[...new Map(sourceProduct.fullImages.map(i=>[i.url,i])).values()].map(i=>filename(i.url));
  const actual=(target?.images||[]).map(i=>filename(i.src||""));
  result.checked++;
  if(expected.length!==actual.length||expected.some((name,i)=>name!==actual[i])){
   result.failures.push({slug,expected,actual});
  }else result.passed++;
 }
 result.status=result.failures.length?"FAIL":"PASS";
 console.log("BRAND_GALLERY_PARITY="+result.status+" matched="+result.passed+
  "/"+result.checked+" failures="+result.failures.length);
 if(result.failures.length)process.exitCode=1;
 await context.close();
}catch(e){
 result.status="FAIL";
 result.failures.push({fatal:String(e?.stack||e?.message||e).slice(0,450)});
 console.error("BRAND_GALLERY_PARITY_FATAL="+result.failures.at(-1).fatal);
 process.exitCode=1;
}finally{
 await writeFile(ROOT+"/report.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
