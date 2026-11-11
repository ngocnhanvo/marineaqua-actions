import { chromium } from "playwright";
import { mkdir,readFile,writeFile } from "node:fs/promises";
const SOURCE="https://marine-aqua.vn", WP="https://admin.marine-aqua.io.vn", DIR="catalog-import-evidence";
const BRANDS=[["TROPIC-MARIN","tropic-marin"],["PRODIBIO","prodibio"],["PRODAC","prodac"],["RED SEA","red-sea"],["CONTINUUM AQUATICS","continuum-aquatics"]];
await mkdir(DIR,{recursive:true});
const result={created:[],reused:[],mediaCreated:[],mediaReused:[],categoriesCreated:[],deferred:[],errors:[],status:"STARTED"};
const browser=await chromium.launch({headless:true});
const valid=(ok,msg)=>{if(!ok)throw Error(msg)};
try{
 const source=JSON.parse(await readFile("catalog-audit-evidence/report.json","utf8"));
 valid(source.source===SOURCE&&source.target===WP&&source.errors?.length===0,"Source audit incomplete");
 valid(source.products?.length===20&&source.groups?.length===5,"Expected 20 original products");
 valid(new Set(source.products.map(x=>x.url)).size===20,"Duplicate source URL");
 const context=await browser.newContext({viewport:{width:1400,height:900}}),page=await context.newPage();
 valid(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,"Missing WP credentials");
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 valid(!page.url().includes("wp-login.php"),"WordPress native product editor unavailable");
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   return r.ok?(await r.text()).trim():"";
 });
 valid(/^[a-zA-Z0-9]+$/.test(nonce),"WordPress authenticated nonce unavailable");
 const headers={"X-WP-Nonce":nonce};
 const isOwnedMedia=(v)=>{try{const u=new URL(v,WP);return Boolean(v)&&u.origin===WP&&u.pathname.startsWith("/wp-content/uploads/")}catch{return false}};
 async function decoded(response,step){
   if(!response.ok())throw Error(step+" HTTP "+response.status()+" "+(await response.text()).slice(0,240));
   return response.json();
 }
 const api=(method,path,payload)=>context.request.fetch(WP+path,{
   method,headers:{...headers,...(payload?{"Content-Type":"application/json"}:{})},
   data:payload?JSON.stringify(payload):undefined,failOnStatusCode:false,timeout:45000
 }).then(r=>decoded(r,method+" "+path));
 const existing=await api("GET","/wp-json/wc/v3/products?per_page=100&status=any");
 valid(Array.isArray(existing),"WC product list unavailable");
 const products=new Map(existing.map(x=>[x.slug,x]));
 const categories=await api("GET","/wp-json/wc/v3/products/categories?per_page=100");
 valid(Array.isArray(categories),"WC categories unavailable");
 const cats=new Map(categories.map(x=>[x.slug,x]));
 const parent=cats.get("thuong-hieu");
 for(const [name,slug] of BRANDS){
  if(cats.has(slug))continue;
  const item=await api("POST","/wp-json/wc/v3/products/categories",{name,slug,...(parent?{parent:parent.id}:{})});
  valid(item.id&&item.slug===slug,"Brand category create failed "+slug);
  const check=await api("GET","/wp-json/wc/v3/products/categories/"+item.id);
  valid(check.slug===slug,"Brand category readback failed "+slug);
  cats.set(slug,item);result.categoriesCreated.push({id:item.id,slug});
 }
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
 const safeText=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
 const paragraphs=s=>String(s||"").split(/\n+/).map(x=>x.trim()).filter(Boolean).map(x=>"<p>"+safeText(x)+"</p>").join("\n");
 for(let i=0;i<5;i++){
  const [brand,catSlug]=BRANDS[i],group=source.groups[i],cat=cats.get(catSlug);
  valid(group.label===brand&&group.links.length===4&&cat?.id,"Group or category mismatch "+brand);
  for(const url of group.links){
   const product=source.products.find(x=>x.url===url);
   valid(product?.title&&product.images?.length,"Original data missing "+url);
   const slug=new URL(url).pathname.split("/").filter(Boolean).at(-1);
   const price=Number(String(product.price||"").replace(/[^0-9]/g,""));
   valid(/^[\d.,\s]+₫/.test(product.price)&&price>0&&price<100000000,"Price not verifiable "+slug);
   const stock=/hết hàng/i.test(product.stock)?"outofstock":/còn hàng/i.test(product.stock)?"instock":"";
   valid(stock,"Stock not verifiable "+slug);
   const found=products.get(slug);
   if(found){
    valid(found.name===product.title&&Number(found.regular_price||found.price)===price&&found.stock_status===stock,"Existing product differs "+slug);
    valid(found.categories?.some(c=>c.id===cat.id)&&found.images?.some(m=>isOwnedMedia(m.src)),"Existing product media/category differs "+slug);
    result.reused.push({id:found.id,slug,brand});continue;
   }
   const mediaId=await ensureMedia(product.images[0],product.title);
   if(!mediaId){console.log("ASSET_DEFERRED_SKIP="+slug);continue}
   const payload={
     name:product.title,slug,type:"simple",status:"publish",catalog_visibility:"visible",
     regular_price:String(price),manage_stock:false,stock_status:stock,
     description:paragraphs(product.description),short_description:paragraphs(product.summary),
     images:[{id:mediaId,alt:product.images[0].alt||product.title}],categories:[{id:cat.id}],
     meta_data:[{key:"_marine_source_url",value:url},{key:"_marine_source_id",value:String(product.sourceId||"")},...(product.seo?[{key:"_yoast_wpseo_metadesc",value:product.seo.slice(0,320)}]:[])]
   };
   if(product.sku)payload.sku=product.sku;
   const created=await api("POST","/wp-json/wc/v3/products",payload);
   valid(created.id&&created.slug===slug,"WC product create failed "+slug);
   const check=await api("GET","/wp-json/wc/v3/products/"+created.id);
   valid(check.name===product.title&&check.slug===slug&&Number(check.regular_price)===price&&check.stock_status===stock,"WC product readback failed "+slug);
   valid(check.images?.[0]?.id===mediaId&&isOwnedMedia(check.images[0].src)&&check.categories?.some(c=>c.id===cat.id),"WC product image/category mismatch "+slug);
   products.set(slug,check);
   result.created.push({id:created.id,slug,brand,price,stock,mediaId});
   console.log("CATALOG_PRODUCT_VERIFIED="+JSON.stringify(result.created.at(-1)));
  }
 }
 valid(result.deferred.length===0,"Image download deferred, do not proceed with incomplete section");
 valid(result.created.length+result.reused.length===20,"Not all 20 products verified");
 result.groups=source.groups.map((group,i)=>({
  table:"home_"+String(i+4).padStart(2,"0"),brand:group.label,
  categoryId:cats.get(BRANDS[i][1]).id,
  products:group.links.map(url=>{
   const slug=new URL(url).pathname.split("/").filter(Boolean).at(-1);
   const item=products.get(slug);valid(item?.id,"Product missing after import "+slug);
   return {id:item.id,slug};
  })
 }));
 result.status="PASS";
 console.log("CATALOG_IMPORT=PASS verified=20 created="+result.created.length+" reused="+result.reused.length);
 await page.close();await context.close();
}catch(e){result.errors.push(String(e.stack||e.message||e).slice(0,1500));result.status="FAIL";process.exitCode=1;console.error("CATALOG_IMPORT=FAIL "+result.errors.at(-1))}
finally{await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");await browser.close()}
