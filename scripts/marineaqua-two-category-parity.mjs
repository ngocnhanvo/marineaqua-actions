import { chromium } from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const SOURCE="https://marine-aqua.vn",WP="https://admin.marine-aqua.io.vn",DIR="two-category-parity-evidence";
await mkdir(DIR,{recursive:true});
const source=JSON.parse(await readFile("two-category-catalog-evidence/manifest.json","utf8"));
const mapping=JSON.parse(await readFile("two-category-mapping-evidence/mapping.json","utf8"));
const report={sourceCount:source.products?.length||0,checked:0,matched:0,
 missing:[],duplicates:[],wrongCategory:[],wrongPrice:[],wrongStock:[],wrongMedia:[],
 seoReview:[],catalogCounts:[],errors:[],status:"STARTED"};
const browser=await chromium.launch({headless:true});
const valid=(v,m)=>{if(!v)throw Error(m)};
try{
 valid(mapping.status==="PASS"&&source.details?.length===source.products?.length,"Unverified source");
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 valid(!page.url().includes("wp-login.php"),"WP login failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok?(await r.text()).trim():"";
 });
 valid(Boolean(nonce),"REST nonce absent");
 const records=[];
 for(let n=1;n<=50;n++){
  const response=await context.request.get(WP+"/wp-json/wc/v3/products?per_page=100&status=any&page="+n,
   {headers:{"X-WP-Nonce":nonce},timeout:45000,failOnStatusCode:false});
  valid(response.ok(),"Woo products HTTP "+response.status()+" page "+n);
  const batch=await response.json();
  valid(Array.isArray(batch),"Malformed WooCommerce inventory");
  records.push(...batch);
  if(batch.length<100)break;
 }
 report.targetCount=records.length;
 const bySlug=new Map();
 for(const product of records){
  if(bySlug.has(product.slug))report.duplicates.push({slug:product.slug,ids:[bySlug.get(product.slug).id,product.id]});
  bySlug.set(product.slug,product);
 }
 const money=v=>[...new Set([...String(v||"").matchAll(/([\d.,]+)₫/g)]
  .map(x=>Number(x[1].replace(/[.,]/g,""))).filter(n=>Number.isFinite(n)&&n>0))];
 for(const item of source.details){
  report.checked++;
  const slug=new URL(item.url).pathname.split("/").filter(Boolean).at(-1);
  const target=bySlug.get(slug);
  if(!target){report.missing.push(slug);continue}
  report.matched++;
  const expected=mapping.assignments[item.url]||[];
  if(expected.some(t=>!target.categories?.some(c=>Number(c.id)===Number(t.id))))
   report.wrongCategory.push({slug,expected:expected.map(t=>t.slug),actual:target.categories?.map(c=>c.slug)});
  const prices=money(item.priceText);
  const regular=prices.length===2?String(prices[0]):prices.length===1?String(prices[0]):"";
  const sale=prices.length===2?String(prices[1]):"";
  if(String(target.regular_price||"")!==regular||String(target.sale_price||"")!==sale)
   report.wrongPrice.push({slug,regular:target.regular_price,sale:target.sale_price,source:item.priceText});
  const stock=/hết hàng/i.test(item.stockText)?"outofstock":"instock";
  if(target.stock_status!==stock)report.wrongStock.push({slug,expected:stock,actual:target.stock_status});
  const media=target.images?.[0]?.src||"";
  if(!media||!(/^\/wp-content\/uploads\//.test(media)||/^https:\/\/admin\.marine-aqua\.io\.vn\/wp-content\/uploads\//.test(media)))
   report.wrongMedia.push({slug,media});
  const metas=target.meta_data||[];
  const title=String(metas.find(m=>m.key==="_yoast_wpseo_title")?.value||"").trim();
  const description=String(metas.find(m=>m.key==="_yoast_wpseo_metadesc")?.value||"").trim();
  if(item.seoTitle&&title!==item.seoTitle)report.seoReview.push({slug,field:"title"});
  if(item.seoDescription&&description!==item.seoDescription)report.seoReview.push({slug,field:"description"});
 }
 for(const [slug,originalUrls] of Object.entries(source.archiveMembership)){
  const expected=new Set(originalUrls.map(url=>new URL(url).pathname.split("/").filter(Boolean).at(-1)));
  const term=mapping.terms.find(x=>x.slug===slug);
  valid(Boolean(term),"Unmapped category "+slug);
  const live=records.filter(product=>product.status==="publish"&&
   (product.categories||[]).some(cat=>Number(cat.id)===Number(term.id)));
  const actual=new Set(live.map(x=>x.slug));
  const missing=[...expected].filter(x=>!actual.has(x));
  const extra=[...actual].filter(x=>!expected.has(x));
  report.catalogCounts.push({slug,expected:expected.size,actual:actual.size,missing,extra});
 }
 report.status=(report.missing.length||report.duplicates.length||report.wrongCategory.length||
  report.wrongPrice.length||report.wrongStock.length||report.wrongMedia.length||
  report.catalogCounts.some(x=>x.missing.length||x.extra.length))?"FAIL":"PASS";
 console.log("TWO_CATEGORY_PARITY="+report.status+" source="+report.sourceCount+" matched="+report.matched+
  " missing="+report.missing.length+" categories="+report.wrongCategory.length+
  " prices="+report.wrongPrice.length+" stocks="+report.wrongStock.length+
  " media="+report.wrongMedia.length+" archiveErrors="+
  report.catalogCounts.filter(x=>x.missing.length||x.extra.length).length+
  " seoReview="+report.seoReview.length);
 if(report.status==="FAIL")process.exitCode=1;
 await context.close();
}catch(e){
 report.status="FAIL";report.errors.push(String(e.stack||e).slice(0,700));
 console.error("TWO_CATEGORY_PARITY_FATAL="+report.errors.at(-1));
 process.exitCode=1;
}finally{
 await writeFile(DIR+"/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}