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
 const expected=[
  ['muoi-bien-tropic-marin-pro-reef-25-kg-xo-nhua','Pro-Reef Salt Muối cho hồ cá cảnh biển 25kg-Tropic Marin (Xô nhựa)'],
  ['korallen-zucht-zeofood-plus-500ml-thuc-an-cho-san-ho','KORALLEN-ZUCHT ZEOFOOD PLUS 500ML'],
  ['den-cho-thuy-cung-ho-lon-zetlight-zet-200w-b-w','ĐÈN CHO THỦY CUNG, HỒ LỚN – ZETLIGHT ZET 200W B-W'],
  ['korallen-zucht-coral-system-component-4-500ml','KORALLEN-ZUCHT CORAL SYSTEM COMPONENT 4 500ML'],
  ['korallen-zucht-coral-system-component-3-500ml','KORALLEN-ZUCHT CORAL SYSTEM COMPONENT 3 500ML'],
  ['korallen-zucht-coral-system-component-2-500ml','KORALLEN-ZUCHT CORAL SYSTEM COMPONENT 2 500ML'],
  ['korallen-zucht-coral-system-component-1-500ml','KORALLEN-ZUCHT CORAL SYSTEM COMPONENT 1 500ML'],
  ['korallen-zucht-magnesium-complex-500ml','KORALLEN-ZUCHT MAGNESIUM COMPLEX 500ML'],
  ['tropic-marin-syn-biotic-sea-salt-25-kg-muoi-cho-ho-ca-bien-chlb-duc','SYN-BIOTIC Sea Salt muối cho bể cá cảnh biển 25kg-Tropic Marin']
 ];
 const linked=await source.evaluate(()=>[...new Set([...document.querySelectorAll('a[href*="/san-pham/"]')]
   .map(a=>new URL(a.href).pathname.split('/').filter(Boolean).pop()))]);
 result.sourceLinkSlugs=linked;
 result.products=expected.map(([slug,name])=>({slug,name,url:'https://marine-aqua.vn/san-pham/'+slug+'/'}));
 console.log('PROMOTION_SOURCE_COUNT='+result.products.length+' linked='+linked.length);
 console.log('PROMOTION_SOURCE_PRODUCTS='+JSON.stringify(result.products));
 if(expected.filter(([slug])=>linked.includes(slug)).length!==9)
   console.log('PROMOTION_SOURCE_LINKS_MISSING='+JSON.stringify(expected.map(x=>x[0]).filter(slug=>!linked.includes(slug))));
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
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 result.matches=result.products.map(src=>{
  const exact=result.target.filter(t=>String(t.slug)===String(src.slug));
  const title=exact.length?[]:result.target.filter(t=>norm(t.title?.rendered)===norm(src.name));
  const found=exact.length?exact:title;
  return {source:src.slug,sourceName:src.name,ids:found.map(t=>t.id),targetSlugs:found.map(t=>t.slug),matchType:exact.length?'slug':title.length?'title':'missing'};
 });
 console.log('PROMOTION_TARGET_MAPPING='+JSON.stringify(result.matches));
 await page.goto(WP+'/wp-admin/admin.php?page=tablepress_add',{waitUntil:'domcontentloaded',timeout:45000});
 result.tableAddControls=await page.locator('input,button,select').evaluateAll(xs=>xs.map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,text:(e.textContent||e.value||'').trim().slice(0,90)})).filter(x=>x.id||x.name||x.text).slice(0,85));
 await page.goto(WP+'/wp-admin/admin.php?page=tablepress&action=edit&table_id=home_04',{waitUntil:'domcontentloaded',timeout:45000});
 result.tableEditControls=await page.locator('input,button,select').evaluateAll(xs=>xs.map(e=>({tag:e.tagName,id:e.id,name:e.name,type:e.type,text:(e.textContent||e.value||'').trim().slice(0,80)})).filter(x=>/table.id|table.name|change|rename|id|insert|code|save/i.test((x.id||'')+' '+(x.name||'')+' '+x.text)).slice(0,80));
 console.log('PROMOTION_TABLE_EDIT_UI='+JSON.stringify(result.tableEditControls));
 console.log('PROMOTION_TABLE_ADD_UI='+JSON.stringify(result.tableAddControls));
 await page.screenshot({path:DIR+'/add-table-form.png'});
 const tables=await context.request.get(WP+'/wp-json/tablepress/v1/tables/prefix/all?per_page=100&page=1',{failOnStatusCode:false});
 if(tables.ok())result.tableIds=(await tables.json()).map(x=>x.id||x.table_id);
 console.log('PROMOTION_TABLE_IDS='+JSON.stringify(result.tableIds));
 const pages=await api('/wp-json/wp/v2/pages?context=edit&per_page=100&_fields=id,slug,acf,status');
 if(!pages.ok)throw Error('WP Pages '+pages.status);
 result.pageMatches=pages.data.filter(p=>p.slug==='khuyen-mai'||p.acf?.key==='promotions');
 const homePage=pages.data.find(p=>p.acf?.key==='home');
 if(homePage){
   await page.goto(WP+'/wp-admin/post.php?post='+homePage.id+'&action=edit',{waitUntil:'domcontentloaded',timeout:45000});
   result.pageEditorControls=await page.locator('button,input,a').evaluateAll(xs=>xs.map(e=>({tag:e.tagName,id:e.id,cls:String(e.className).slice(0,90),text:(e.textContent||e.value||e.title||'').trim().slice(0,90)})).filter(x=>/insert code|esc table|tablepress|insert|code|visual/i.test(x.text+' '+x.id+' '+x.cls)).slice(0,60));
   console.log('PROMOTION_PAGE_EDITOR_UI='+JSON.stringify(result.pageEditorControls));
 }
 console.log('PROMOTION_PAGE_MATCHES='+JSON.stringify(result.pageMatches));
 result.complete=true;
}catch(e){result.errors.push(String(e.stack||e).slice(0,650));console.error('PROMOTION_PREFLIGHT_FAIL='+result.errors.at(-1));process.exitCode=1}
finally{await writeFile(DIR+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close()}
