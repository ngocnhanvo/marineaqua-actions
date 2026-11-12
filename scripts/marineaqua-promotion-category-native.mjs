import { chromium } from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn",DIR="promotion-category-evidence";
const SLUG="giam-gia-khung",NAME="Giảm giá khủng";
const PRODUCTS=[
 ["muoi-bien-tropic-marin-pro-reef-25-kg-xo-nhua",82627],
 ["korallen-zucht-zeofood-plus-500ml-thuc-an-cho-san-ho",82663],
 ["korallen-zucht-coral-system-component-4-500ml",82778],
 ["korallen-zucht-coral-system-component-3-500ml",82780],
 ["korallen-zucht-coral-system-component-2-500ml",82782],
 ["korallen-zucht-coral-system-component-1-500ml",82784],
 ["korallen-zucht-magnesium-complex-500ml",82801],
 ["tropic-marin-syn-biotic-sea-salt-25-kg-muoi-cho-ho-ca-bien-chlb-duc",82638]
];
const result={scope:{term:SLUG,products:PRODUCTS.map(x=>x[1])},created:[],updated:[],unchanged:[],errors:[],pageResidue:[],menu:[],verified:[],cleanupRemaining:[],status:"STARTED"};
await mkdir(DIR,{recursive:true});
const check=(value,msg)=>{if(!value)throw Error(msg)};
const browser=await chromium.launch({headless:true});
try{
 check(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,"Missing CMS credentials");
 const context=await browser.newContext({viewport:{width:1400,height:900}});
 const page=await context.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
 await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
 await page.locator("#wp-submit").click();
 check(!page.url().includes("wp-login.php"),"WordPress login rejected");
 await page.goto(WP+"/wp-admin/edit-tags.php?taxonomy=product_cat&post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});return r.ok?(await r.text()).trim():""});
 check(/^[a-zA-Z0-9]{8,32}$/.test(nonce),"Authenticated WP REST nonce unavailable");
 async function api(method,path,body){
  const response=await context.request.fetch(WP+path,{method,headers:{"X-WP-Nonce":nonce,...(body?{"Content-Type":"application/json"}:{})},data:body?JSON.stringify(body):undefined,timeout:45000,failOnStatusCode:false});
  if(!response.ok())throw Error("CMS "+method+" "+path.split("?")[0]+" HTTP "+response.status()+" "+(await response.text()).slice(0,130));
  return response.json();
 }
 let cats=await api("GET","/wp-json/wc/v3/products/categories?per_page=100");
 check(Array.isArray(cats),"WooCommerce category inventory malformed");
 let matches=cats.filter(c=>c.slug===SLUG);
 check(matches.length<=1,"Duplicate category slug "+SLUG);
 let cat=matches[0];
 if(cat){
  check(cat.name===NAME&&Number(cat.parent||0)===0,"Existing promotion category identity/parent conflict");
  result.category={id:cat.id,slug:cat.slug,status:"reused"};
 }else{
  check(await page.locator("#addtag").count(),"Native product category form missing");
  await page.locator("#tag-name").fill(NAME);
  await page.locator("#tag-slug").fill(SLUG);
  await page.locator("#parent").selectOption("-1");
  await page.locator("#addtag input[type=submit]").click();
  for(let i=0;i<18;i++){
   await page.waitForTimeout(800);
   cats=await api("GET","/wp-json/wc/v3/products/categories?per_page=100");
   cat=cats.find(c=>c.slug===SLUG);
   if(cat)break;
  }
  check(cat?.id&&cat.name===NAME&&Number(cat.parent||0)===0,"Category native save/readback failed");
  result.created.push({kind:"category",id:cat.id,slug:SLUG});
  result.category={id:cat.id,slug:cat.slug,status:"created"};
 }
 console.log("PROMO_CATEGORY="+JSON.stringify(result.category));
 for(const [slug,id] of PRODUCTS){
  const product=await api("GET","/wp-json/wc/v3/products/"+id);
  check(product.id===id&&product.slug===slug&&product.status==="publish","Product identity mismatch "+id);
  const prev=(product.categories||[]).map(x=>x.id);
  check(prev.length>0,"Existing category list missing for "+id);
  if(prev.includes(cat.id)){
   result.unchanged.push(id);continue;
  }
  const intended=[...prev,cat.id].map(cid=>({id:cid}));
  const changed=await api("PUT","/wp-json/wc/v3/products/"+id,{categories:intended});
  check(changed.id===id,"Update did not identify product "+id);
  const verify=await api("GET","/wp-json/wc/v3/products/"+id);
  const next=(verify.categories||[]).map(x=>x.id);
  check(prev.every(cid=>next.includes(cid))&&next.includes(cat.id),"Existing categories not preserved "+id);
  check(verify.slug===slug&&verify.status==="publish","Product state changed "+id);
  result.updated.push({id,before:prev,after:next});
  console.log("PROMO_PRODUCT_BOUND="+JSON.stringify({id,category:cat.id,preserved:prev.length}));
 }
 // Inventory only. Old promotional drafts and ESC Table are left unpublished
 // until their provenance is independently confirmed; never auto-delete business content.
 const pages=await api("GET","/wp-json/wp/v2/pages?context=edit&status=any&per_page=100&_fields=id,slug,status,title,acf");
 result.pageResidue=pages.filter(x=>x.acf?.key==="promotions"||/^khuyen-mai(?:-\d+)?$/.test(x.slug)).map(x=>({id:x.id,slug:x.slug,status:x.status,key:x.acf?.key}));
 console.log("PROMO_OLD_PAGES="+JSON.stringify(result.pageResidue));
 const menus=await api("GET","/wp-json/esc-api/v1/menus").catch(e=>({error:String(e.message||e)}));
 result.menu=menus?.menus?.Header ? Object.entries(menus.menus.Header).map(([lang,m])=>({lang,items:(m?.items||[]).filter(x=>/khuy[eế]n|giam-gia|promo/i.test(JSON.stringify(x))).slice(0,5)})) : [{error:menus.error||"no header menu"}];
 console.log("PROMO_HEADER_MENU="+JSON.stringify(result.menu).slice(0,5000));
 const final=await api("GET","/wp-json/wc/v3/products?per_page=100&category="+cat.id);
 check(Array.isArray(final),"Promotion category endpoint invalid");
 const found=new Set(final.map(x=>x.id));
 check(PRODUCTS.every(([,id])=>found.has(id)),"Promotion category does not contain every expected Product");
 result.verified=PRODUCTS.map(([,id])=>id);
 result.status="PASS";
 console.log("PROMO_CATEGORY_MEMBERSHIP_PASS="+JSON.stringify({category:result.category,updated:result.updated.length,unchanged:result.unchanged.length,verified:result.verified.length}));
 await page.screenshot({path:DIR+"/category-admin.png"});
}catch(e){result.status="FAIL";result.errors.push(String(e.stack||e).slice(0,850));console.error("PROMO_CATEGORY_MEMBERSHIP_FAIL="+result.errors.at(-1));process.exitCode=1}
finally{await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");await browser.close()}
