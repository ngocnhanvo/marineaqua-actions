import { chromium } from "playwright";
import { readFile,writeFile,mkdir } from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn";
const DIR="brand-seo-probe-evidence";
await mkdir(DIR,{recursive:true});
const original=JSON.parse(await readFile("brand-catalog-evidence/manifest.json","utf8"));
const result={checked:0,matches:0,missingTitle:[],missingDescription:[],sourceMissingDescription:[],sourceValueMismatch:[],errors:[]};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 if(page.url().includes("wp-login.php"))throw Error("WordPress login rejected");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok?(await r.text()).trim():"";
 });
 if(!nonce)throw Error("WordPress REST nonce missing");
 const records=[];
 for(let n=1;n<=30;n++){
  const response=await context.request.get(WP+"/wp-json/wc/v3/products?per_page=100&status=any&page="+n,{
   headers:{"X-WP-Nonce":nonce},timeout:45000,failOnStatusCode:false});
  if(!response.ok())throw Error("WordPress products HTTP "+response.status());
  const batch=await response.json();
  records.push(...batch);
  if(batch.length<100)break;
 }
 const bySlug=new Map(records.map(x=>[x.slug,x]));
 for(const item of original.details){
  const slug=new URL(item.url).pathname.split("/").filter(Boolean).at(-1);
  const record=bySlug.get(slug);
  if(!record)continue;
  result.checked++;
  const meta=record.meta_data||[];
  const title=String(meta.find(x=>x.key==="_yoast_wpseo_title")?.value||"");
  const description=String(meta.find(x=>x.key==="_yoast_wpseo_metadesc")?.value||"");
  if(item.seoTitle&&title!==item.seoTitle)
   result.missingTitle.push({slug,id:record.id,exists:Boolean(title)});
  if(item.seoDescription&&description!==item.seoDescription)
   result.missingDescription.push({slug,id:record.id,exists:Boolean(description)});
  if(!item.seoDescription)result.sourceMissingDescription.push(slug);
  if(title===item.seoTitle&&(!item.seoDescription||description===item.seoDescription))result.matches++;
 }
 console.log("BRAND_SEO_PROBE=PASS checked="+result.checked+" matches="+result.matches+
  " titleReview="+result.missingTitle.length+" descriptionReview="+result.missingDescription.length+
  " sourceMissingDescription="+result.sourceMissingDescription.length);
 await context.close();
}catch(e){
 result.errors.push(String(e?.message||e).slice(0,300));
 console.error("BRAND_SEO_PROBE_FAIL="+result.errors.at(-1));
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
