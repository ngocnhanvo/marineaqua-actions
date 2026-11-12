import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const SOURCE="https://marine-aqua.vn", WP="https://admin.marine-aqua.io.vn";
const dir="brand-post-import-parity-evidence";
await mkdir(dir,{recursive:true});
const result={checkedAt:new Date().toISOString(),checked:0,matched:0,
 missing:[],duplicates:[],wrongCategories:[],wrongPrice:[],wrongStock:[],
 wrongMedia:[],sourceMissingSeo:[],galleryReview:[],metadataReview:[],titleReview:[],skuReview:[],seoReview:[],descriptionReview:[],mediaFilenameReview:[],errors:[]};
const source=JSON.parse(await readFile("brand-catalog-evidence/manifest.json","utf8"));
const mapping=JSON.parse(await readFile("brand-taxonomy-mapping-evidence/mapping.json","utf8"));
const valid=(cond,msg)=>{if(!cond)throw Error(msg)};
const sourcePrices=value=>[...String(value).matchAll(/([\d.,]+)₫/g)]
 .map(m=>Number(m[1].replace(/[.,]/g,""))).filter(n=>Number.isFinite(n)&&n>0);
const browser=await chromium.launch({headless:true});
try{
 valid(source.details?.length===246&&mapping.inputCount===246&&mapping.unassigned?.length===0,
  "Source manifests are incomplete");
 const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
 valid(Boolean(user&&pass),"WordPress parity credentials missing");
 const ctx=await browser.newContext();
 const page=await ctx.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(user);
 await page.locator("#user_pass").fill(pass);
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 valid(!page.url().includes("wp-login"),"WordPress admin login failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok?(await r.text()).trim():"";
 });
 valid(Boolean(nonce),"WP REST nonce missing");
 const records=[];
 for(let n=1;n<=60;n++){
  let response;
  for(let retry=0;retry<4;retry++){
   try{
    response=await ctx.request.get(WP+"/wp-json/wc/v3/products?per_page=100&status=any&page="+n,
      {headers:{"X-WP-Nonce":nonce},timeout:60000,failOnStatusCode:false});
    if(response.ok())break;
   }catch(error){if(retry===3)throw error}
   await new Promise(resolve=>setTimeout(resolve,(retry+1)*900));
  }
  valid(response?.ok(),"WooCommerce products page "+n+" HTTP "+response?.status());
  const batch=await response.json();
  valid(Array.isArray(batch),"Malformed WooCommerce product page "+n);
  records.push(...batch);
  if(batch.length<100)break;
 }
 result.targetTotal=records.length;
 const bySlug=new Map();
 for(const entry of records){
  const key=entry.slug;
  if(bySlug.has(key))result.duplicates.push({slug:key,ids:[bySlug.get(key).id,entry.id]});
  bySlug.set(key,entry);
 }
 for(const item of source.details){
  result.checked++;
  const url=item.url,slug=new URL(url).pathname.split("/").filter(Boolean).at(-1);
  const target=bySlug.get(slug);
  if(!target){result.missing.push({url,slug});continue}
  result.matched++;
  const expectedCategories=mapping.assignments?.[url]||[];
  if(expectedCategories.some(cat=>!target.categories?.some(c=>Number(c.id)===Number(cat.id))))
   result.wrongCategories.push({slug,expected:expectedCategories.map(c=>c.slug),actual:target.categories?.map(c=>c.slug)});
  const amounts=[...new Set(sourcePrices(item.priceText))];
  const regular=amounts.length===2?String(amounts[0]):amounts.length===1?String(amounts[0]):"";
  const sale=amounts.length===2?String(amounts[1]):"";
  if(String(target.regular_price||"")!==regular||String(target.sale_price||"")!==sale)
   result.wrongPrice.push({slug,source:item.priceText,regular:target.regular_price,sale:target.sale_price});
  const stock=/hết hàng/i.test(item.stockText)?"outofstock":"instock";
  if(target.stock_status!==stock)result.wrongStock.push({slug,source:item.stockText,target:target.stock_status});
  const media=target.images?.[0]?.src||"";
  if(!media||!(/^\/wp-content\/uploads\//.test(media)||/^https:\/\/admin\.marine-aqua\.io\.vn\/wp-content\/uploads\//.test(media)))
   result.wrongMedia.push({slug,targetMedia:media});
  if(item.images?.length>1&&target.images?.length<item.images.length)
   result.galleryReview.push({slug,originalCaptured:item.images.length,targetMediaCount:target.images.length});
  const metas=Array.isArray(target.meta_data)?target.meta_data:[];
  const originMeta=metas.find(m=>m.key==="_marine_source_url")?.value;
  if(originMeta&&originMeta!==url)result.metadataReview.push({slug,reason:"SOURCE_URL_MISMATCH"});
  const normalizeText=value=>String(value||"").replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&#8211;|&#8212;/g,"-").normalize("NFC").replace(/\\s+/g," ").trim();
  if(normalizeText(target.name)!==normalizeText(item.title))
   result.titleReview.push({slug,expected:item.title,target:target.name});
  if(item.sku&&target.sku!==item.sku)
   result.skuReview.push({slug,expected:item.sku,target:target.sku});
  const expectedFilename=decodeURIComponent(new URL(item.images[0].src).pathname.split("/").at(-1));
  if(media){
   const targetFilename=decodeURIComponent(new URL(media,WP).pathname.split("/").at(-1));
   if(targetFilename!==expectedFilename)
    result.mediaFilenameReview.push({slug,expectedFilename,targetFilename});
  }
  const descriptionText=normalizeText(target.description);
  if(item.description&&descriptionText.slice(0,100)!==normalizeText(item.description).slice(0,100))
   result.descriptionReview.push({slug,reason:"DESCRIPTION_TEXT_REVIEW"});
  const originalMeta=metas.find(m=>m.key==="_yoast_wpseo_metadesc")?.value;
  if(item.seoDescription&&normalizeText(originalMeta)!==normalizeText(item.seoDescription))
   result.seoReview.push({slug,reason:"SEO_META_DESCRIPTION_DIFF"});
  if(!originMeta)result.metadataReview.push({slug,reason:"SOURCE_URL_METADATA_ABSENT"});
  const yoastTitle=String(metas.find(m=>m.key==="_yoast_wpseo_title")?.value||"").trim();
  const yoastDescription=String(metas.find(m=>m.key==="_yoast_wpseo_metadesc")?.value||"").trim();
  if(item.seoTitle&&yoastTitle!==item.seoTitle)
   result.seoReview.push({slug,field:"title",expected:item.seoTitle,actual:yoastTitle});
  if(item.seoDescription&&yoastDescription!==item.seoDescription)
   result.seoReview.push({slug,field:"description",expected:item.seoDescription,actual:yoastDescription});
  if(!item.seoDescription)result.sourceMissingSeo.push(slug);
  const normalize=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/&[a-z]+;|&#\\d+;/gi," ")
   .replace(/\\s+/g," ").trim().normalize("NFC");
  if(normalize(item.description)&&!normalize(target.description).includes(normalize(item.description).slice(0,120)))
   result.descriptionReview.push({slug,field:"description",sourceChars:item.description.length,
    targetChars:String(target.description||"").length});
 }
 result.status=(
  result.missing.length||result.duplicates.length||result.wrongCategories.length||
  result.wrongPrice.length||result.wrongStock.length||result.wrongMedia.length
 )?"FAIL":"PASS";
 console.log("BRAND_PARITY="+result.status+
  " target="+result.targetTotal+" matched="+result.matched+
  " missing="+result.missing.length+" categoryErrors="+result.wrongCategories.length+
  " priceErrors="+result.wrongPrice.length+" stockErrors="+result.wrongStock.length+
  " mediaErrors="+result.wrongMedia.length+" galleryReview="+result.galleryReview.length+
  " sourceMissingSeo="+result.sourceMissingSeo.length+" titleReview="+result.titleReview.length+
  " skuReview="+result.skuReview.length+" seoReview="+result.seoReview.length+
  " descriptionReview="+result.descriptionReview.length);
 if(result.status==="FAIL")process.exitCode=1;
 await ctx.close();
}catch(e){
 result.status="FAIL";
 result.errors.push(String(e?.stack||e?.message||e).slice(0,700));
 console.error("BRAND_PARITY_FATAL="+result.errors.at(-1));
 process.exitCode=1;
}finally{
 await writeFile(dir+"/report.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
