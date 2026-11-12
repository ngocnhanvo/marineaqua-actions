import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const SOURCE = 'https://marine-aqua.vn';
const WP = 'https://admin.marine-aqua.io.vn';
const DIR = 'information-pages-evidence';
const pages = [
 { title: 'Chính sách đổi trả hàng', source: '/chinh-sach-doi-tra-hang/', slug: 'chinh-sach-doi-tra-hang' },
 { title: 'Phí ship hàng', source: '/thong-bao/', slug: 'thong-bao' },
 { title: 'Hướng dẫn mua hàng ở xa', source: '/huong-dan-mua-hang-o-xa/', slug: 'huong-dan-mua-hang-o-xa' },
 { title: 'Hướng dẫn mua hàng tại nhà', source: '/huong-dan-mua-hang-tai-nha/', slug: 'huong-dan-mua-hang-tai-nha' },
 { title: 'Thời gian bán hàng', source: '/thoi-gian-ban-hang/', slug: 'thoi-gian-ban-hang' },
];
const evidence = { scope: pages, results: [], errors: [] };
const assert = (value, message) => { if (!value) throw new Error(message); };
await mkdir(DIR, { recursive:true });
const browser = await chromium.launch({ headless: true });
try {
 assert(process.env.WP_ADMIN_USERNAME && process.env.WP_ADMIN_PASSWORD, 'Missing WordPress admin credentials');
 const context = await browser.newContext({ viewport:{ width:1280, height:900 }, ignoreHTTPSErrors:false });
 const admin = await context.newPage();
 await admin.goto(WP + '/wp-login.php', { waitUntil:'domcontentloaded', timeout:45000 });
 await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
 await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
 await admin.locator('#wp-submit').click();
 assert(!admin.url().includes('wp-login.php'), 'WordPress login rejected');
 await admin.goto(WP + '/wp-admin/post-new.php?post_type=page', { waitUntil:'domcontentloaded', timeout:45000 });
 const nonce = await admin.evaluate(async () => {
   if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
   const r = await fetch('/wp-admin/admin-ajax.php?action=rest-nonce', {credentials:'same-origin'});
   return r.ok ? (await r.text()).trim() : '';
 });
 assert(/^[a-zA-Z0-9]{8,32}$/.test(nonce), 'WordPress REST nonce missing');
 async function api(method,path,body) {
   const r = await context.request.fetch(WP + path, {
      method, headers:{'X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},
      data:body?JSON.stringify(body):undefined, failOnStatusCode:false,timeout:45000
   });
   if(!r.ok())throw Error('WordPress API '+path+' returned '+r.status()+' '+(await r.text()).slice(0,130));
   return r.json();
 }
 let records = [];
 for(let i=1;i<=20;i++){
   const result = await api('GET','/wp-json/wp/v2/pages?context=edit&status=any&per_page=100&page='+i+'&_fields=id,slug,status,title,content,acf').catch(e=>{
     if(i>1&&String(e.message).includes('400'))return [];
     throw e;
   });
   assert(Array.isArray(result),'Page registry must be an array');
   records.push(...result);
   if(result.length<100) break;
 }
 for (const entry of pages) {
  const row = {slug:entry.slug,source:SOURCE+entry.source,status:'STARTED'};
  evidence.results.push(row);
  try {
   const source = await context.newPage();
   let loaded = false;
   for (let attempt=0;attempt<2;attempt++) {
    try { const response=await source.goto(SOURCE+entry.source,{waitUntil:'domcontentloaded',timeout:55000});
      if(response?.ok()) {loaded=true;break;}
    } catch {}
   }
   assert(loaded, 'Source page unavailable; do not publish guessed content');
   const landedPath=new URL(source.url()).pathname.replace(/\/+$/, '') || '/';
   assert(landedPath===entry.source.replace(/\/+$/, ''), 'Source redirected to unrelated URL: '+landedPath);
   const extracted=await source.evaluate(() => {
      const all = [
       'article .entry-content', '.single-page .entry-content', '.entry-content',
       'main article .content', 'main .page-content', 'article .post-content',
       'article', '#content .content-area'
      ];
      const candidates=all.flatMap(selector=>[...document.querySelectorAll(selector)]);
      const element=candidates.find(node=>(node.textContent||'').trim().length>25);
      if(!element)return null;
      const copy=element.cloneNode(true);
      copy.querySelectorAll('script,style,iframe,form,button,nav,aside,footer,.sidebar,.widget,.breadcrumbs,.related-posts,.share-buttons').forEach(n=>n.remove());
      copy.querySelectorAll('*').forEach(node=>{
       [...node.attributes].forEach(attr=>{
         if(attr.name.startsWith('on') || attr.name==='srcdoc')node.removeAttribute(attr.name);
       });
       for(const key of ['src','href']) {
        const raw=node.getAttribute(key);
        if(!raw)continue;
        try {
         const u=new URL(raw,location.href);
         if(u.protocol!=='http:'&&u.protocol!=='https:'){node.removeAttribute(key);continue;}
         if(u.origin===location.origin && u.pathname.startsWith('/wp-content/uploads/')){
           node.setAttribute(key,u.pathname+u.search);
         } else if(u.origin===location.origin) node.setAttribute(key,u.pathname+u.search+u.hash);
        }catch{node.removeAttribute(key);}
       }
      });
      return {title:document.querySelector('h1')?.textContent?.trim()||'',html:copy.innerHTML,text:copy.textContent?.trim()||''};
   });
   await source.close();
   const minimumLength=['thoi-gian-ban-hang','thong-bao'].includes(entry.slug) ? 35 : 100;
   assert(extracted&&extracted.text.length>=minimumLength,'Source page missing substantive article content');
   assert(extracted.title, 'Source missing page heading; refuse unrelated document');
   assert(extracted.html.length<90000,'Unexpected oversized source content');
   const exact=records.filter(p=>p.slug===entry.slug && p.status!=='trash');
   assert(exact.length<=1,'Duplicate WordPress Pages for '+entry.slug);
   const old=exact[0];
   const current=String(old?.content?.raw || '');
   const newContent=extracted.html.trim();
   if(old && current.trim().length>=100){
     // Preserve already-authored material, never overwrite silently.
     if(old.acf?.action !== 'HomePage') {
       const fixed = await api('POST','/wp-json/wp/v2/pages/'+old.id,{
         acf:{action:'HomePage'},
       });
       assert(fixed.id===old.id, 'Existing Page action update failed');
       row.actionFixed=true;
     }
     if(old.status!=='publish'){
       const published=await api('POST','/wp-json/wp/v2/pages/'+old.id,{status:'publish'});
       assert(published.status==='publish','Existing Page publish failed');
     }
     row.status='EXISTING_CONTENT_PRESERVED';
     row.id=old.id;
     row.compare={sourceTextLength:extracted.text.length,existingHtmlLength:current.length};
   } else if(old) {
     const updated=await api('POST','/wp-json/wp/v2/pages/'+old.id,{
       content:newContent,
       status:'publish',
       acf: {action:'HomePage'},
     });
     assert(updated.id===old.id && updated.status==='publish','Existing Page readback failed');
     row.status='UPDATED';row.id=old.id;
   } else {
     const created=await api('POST','/wp-json/wp/v2/pages',{
       title:entry.title,slug:entry.slug,content:newContent,status:'publish',
       acf:{key:'information-'+entry.slug,action:'HomePage',product_lang:'vi'},
     });
     assert(created.id && created.slug===entry.slug && created.status==='publish','Created Page readback failed');
     row.status='CREATED';row.id=created.id;
   }
   row.sourceLength=extracted.text.length;
   row.sourceTitle=extracted.title;
   console.log('MARINEAQUA_INFORMATION_PAGE='+JSON.stringify(row));
  } catch(e){
    row.status='BLOCKED';row.error=String(e.message||e).slice(0,350);
    evidence.errors.push(row);
    console.error('MARINEAQUA_INFORMATION_PAGE_BLOCKED='+JSON.stringify(row));
  }
 }
 evidence.status=evidence.errors.length?'PARTIAL':'PASS';
 console.log('MARINEAQUA_INFORMATION_PAGES='+JSON.stringify({status:evidence.status,results:evidence.results}));
 if(evidence.errors.length)process.exitCode=1;
} catch(e){
 evidence.errors.push({fatal:String(e.message||e).slice(0,400)});
 evidence.status='FAIL';
 console.error('MARINEAQUA_INFORMATION_PAGES_FAIL='+String(e.message||e).slice(0,400));
 process.exitCode=1;
} finally {
 await writeFile(DIR+'/result.json',JSON.stringify(evidence,null,2)+'\n');
 await browser.close();
}
