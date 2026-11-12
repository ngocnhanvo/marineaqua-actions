import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP='https://admin.marine-aqua.io.vn';
const SOURCE='https://marine-aqua.vn/danh-muc/giam-gia-khung/';
const DIR='promotion-preflight-evidence';
const result={source:SOURCE,products:[],target:[],matches:[],tableAddControls:[],tableIds:[],pageMatches:[],errors:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const source=await context.newPage();
 await source.goto(SOURCE,{waitUntil:'domcontentloaded',timeout:60000});
 result.sourceTitle=await source.title();
 result.products=await source.evaluate(()=>{
   const all=[...document.querySelectorAll('a[href*="/san-pham/"]')]
    .map(a=>({slug:new URL(a.href).pathname.split('/').filter(Boolean).pop(),name:(a.querySelector('h2,h3,h4')?.textContent||a.textContent||'').trim().replace(/\\s+/g,' '),url:new URL(a.href).origin+new URL(a.href).pathname}))
    .filter(x=>x.slug&&x.name&&x.name.length>8);
   return [...new Map(all.map(x=>[x.slug,x])).values()];
 });
 console.log('PROMOTION_SOURCE_COUNT='+result.products.length);
 console.log('PROMOTION_SOURCE_PRODUCTS='+JSON.stringify(result.products));
 const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
 if(!user||!pass)throw Error('Missing WP_ADMIN_USERNAME or WP_ADMIN_PASSWORD');
 const page=await context.newPage();
 await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('#user_login').fill(user);
 await page.locator('#user_pass').fill(pass);
 await page.locator('#wp-submit').click();
 if(page.url().includes('wp-login.php'))throw Error('WP admin login rejected');
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});return r.ok?(await r.text()).trim():'';});
 if(!/^[a-zA-Z0-9]{8,32}$/.test(nonce))throw Error('WordPress REST nonce missing');
 async function api(path){
  return page.evaluate(async ({path,nonce})=>{const r=await fetch(path,{headers:{'X-WP-Nonce':nonce},credentials:'same-origin'});return {ok:r.ok,status:r.status,data:await r.json(),total:Number(r.headers.get('x-wp-totalpages')||1)}},{path,nonce});
 }
 for(let n=1;n<=15;n++){
  const r=await api('/wp-json/wp/v2/product?context=edit&per_page=100&page='+n+'&_fields=id,slug,title,status,acf');
  if(!r.ok)throw Error('Target product API '+r.status+' page '+n);
  result.target.push(...r.data);
  if(n>=r.total)break;
 }
 const norm=x=>String(x||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 result.matches=result.products.map(src=>{
  const exact=result.target.filter(t=>norm(t.slug)===norm(src.slug));
  const title=result.target.filter(t=>norm(t.title?.rendered)===norm(src.name));
  const matches=exact.length?exact:title;
  return {source:src.slug,sourceName:src.name,ids:matches.map(t=>t.id),targetSlugs:matches.map(t=>t.slug),matchType:exact.length?'slug':title.length?'title':'missing'};
 });
 console.log('PROMOTION_TARGET_MAPPING='+JSON.stringify(result.matches));
 await page.goto(WP+'/wp-admin/admin.php?page=tablepress_add',{waitUntil:'domcontentloaded',timeout:45000});
 result.tableAddControls=await page.locator('input,button,select').evaluateAll(xs=>xs.map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,text:(e.textContent||e.value||'').trim().slice(0,90)})).filter(x=>x.id||x.name||x.text).slice(0,85));
 console.log('PROMOTION_TABLE_ADD_UI='+JSON.stringify(result.tableAddControls));
 await page.screenshot({path:DIR+'/add-table-form.png'});
 const tables=await context.request.get(WP+'/wp-json/tablepress/v1/tables/prefix/all?per_page=100&page=1',{failOnStatusCode:false});
 if(tables.ok())result.tableIds=(await tables.json()).map(x=>x.id||x.table_id);
 console.log('PROMOTION_TABLE_IDS='+JSON.stringify(result.tableIds));
 const pages=await api('/wp-json/wp/v2/pages?context=edit&per_page=100&_fields=id,slug,acf,status');
 if(!pages.ok)throw Error('WP Pages '+pages.status);
 result.pageMatches=pages.data.filter(p=>p.slug==='khuyen-mai'||p.acf?.key==='promotions');
 console.log('PROMOTION_PAGE_MATCHES='+JSON.stringify(result.pageMatches));
 result.complete=true;
}catch(e){result.errors.push(String(e.stack||e).slice(0,650));console.error('PROMOTION_PREFLIGHT_FAIL='+result.errors.at(-1));process.exitCode=1}
finally{await writeFile(DIR+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close()}
