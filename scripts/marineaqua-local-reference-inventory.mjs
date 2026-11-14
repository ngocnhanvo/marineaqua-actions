import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const OUT='artifacts/local-reference-inventory';
const report={status:'STARTED',tables:[],sources:{Product:[],ProductCategory:[],Page:[]},errors:[],writes:0};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await ctx.newPage();
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 assert.ok(username&&password,'Missing WordPress QA credentials');
 let authed=false;
 for(let attempt=0;attempt<3&&!authed;attempt++){
  const login=await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').isVisible().catch(()=>false)){
   await page.locator('#user_login').fill(username);
   await page.locator('#user_pass').fill(password);
   await page.locator('#wp-submit').click({timeout:25000});
   await page.waitForLoadState('domcontentloaded',{timeout:20000}).catch(()=>{});
   authed=!page.url().includes('wp-login.php')&&await page.locator('#wpadminbar').count()>0;
  }
  if(!authed){
   report.loginLastFailure={attempt:attempt+1,http:login?.status(),urlPath:new URL(page.url()).pathname,title:(await page.title()).slice(0,100)};
   if(attempt<2)await page.waitForTimeout((attempt+1)*1800);
  }
 }
 assert.ok(authed,'WordPress admin authentication failed: '+JSON.stringify(report.loginLastFailure||{}));
 const response=await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page=82454',{waitUntil:'domcontentloaded',timeout:45000});
 assert.equal(response?.status(),200);
 const scriptTexts=await page.locator('script').allTextContents();
 const nonce=scriptTexts.map(t=>t.match(/const nonce\s*=\s*["']([^"']+)["']/)?.[1]).find(Boolean);
 assert.ok(nonce,'Builder REST nonce missing');
 const request=async(method,path,body)=> {
  const withTicket=path.startsWith('esc-builder/v1/')
    ? {page_id:82454,...body,ticket:await page.evaluate(()=>window.escVBGetTicket())} : body;
  const r=await ctx.request.fetch(WP+'/wp-json/'+path,{method,headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json'},data:withTicket?JSON.stringify(withTicket):undefined,timeout:30000,failOnStatusCode:false});
  return {status:r.status(),body:await r.json().catch(()=>({}))};
 };
 const list=await request('GET','tablepress/v1/tables');
 report.tableListStatus=list.status;
 const raw=list.body;
 const collect=(v)=>Array.isArray(v)?v:Object.values(v||{}).find(Array.isArray)||[];
 let entries=collect(raw);
 if(!entries.length && raw?.tables)entries=collect(raw.tables);
 let ids=[...new Set(entries.map(v=>String(typeof v==='string'||typeof v==='number'?v:v?.id??v?.ID??'')).filter(v=>/^[a-zA-Z0-9_-]{1,80}$/.test(v)))];
 if(!ids.length){
  const listPage=await ctx.newPage();
  const tablepress=await listPage.goto(WP+'/wp-admin/admin.php?page=tablepress',{waitUntil:'domcontentloaded',timeout:45000});
  report.tablepressAdminStatus=tablepress?.status()||0;
  const discovered=await listPage.locator('a[href*="table_id="],a[href*="tablepress&action=edit"]').evaluateAll(nodes=>nodes.map(a=>{
   try{return new URL(a.href).searchParams.get('table_id')||'';}catch{return '';}
  }));
  ids=[...new Set(discovered.filter(v=>/^[a-zA-Z0-9_-]{1,80}$/.test(v)))];
  report.adminTableLinks=discovered.length;
  report.tablepressAdminTitle=await listPage.title();
  await listPage.close();
 }
 if(!ids.length)throw new Error('No native TablePress table IDs discovered; REST list status '+list.status);
 report.tableCount=ids.length;
 for(const id of ids.slice(0,100)){
   const result=await request('POST','esc-builder/v1/item-schema',{table_id:id});
   if(result.status===200&&['Product','ProductCategory','Page'].includes(result.body.source_api)){
     report.sources[result.body.source_api].push({id,count:result.body.count,can_add:result.body.can_add});
   }
   report.tables.push({id,source:result.body?.source_api||'',status:result.status,code:result.body?.code||''});
 }
 assert.ok(report.tables.some(t=>t.status===200),'No authenticated Builder schema succeeded; first errors '+JSON.stringify(report.tables.slice(0,3)));
 const pagesResponse=await ctx.request.get(WP+'/wp-json/wp/v2/pages?per_page=100&context=edit',{headers:{'X-WP-Nonce':nonce},timeout:30000,failOnStatusCode:false});
 report.pagesRestStatus=pagesResponse.status();
 if(pagesResponse.ok()){
  const pages=await pagesResponse.json();
  report.cmsPages=pages.map(p=>({
   id:p.id,slug:p.slug,action:p.acf?.action||'',key:p.acf?.key||'',
   title:p.title?.raw||p.title?.rendered||'',
   contentLength:String(p.content?.raw||p.content?.rendered||'').length,
   shortcodes:[...String(p.content?.raw||p.content?.rendered||'').matchAll(/\[table id=([a-zA-Z0-9_-]+)\s*\/\]/g)].map(m=>m[1]),
  })).filter(p=>/lien-he|san-pham|khuyen-mai|tin-kien-thuc|chinh-sach|thong-bao|huong-dan|thoi-gian|trang-chu/.test(p.slug)).slice(0,50);
 }
 report.status='PASS';
} catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,1800));process.exitCode=1;}
finally {await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');console.log('LOCAL_REFERENCE_INVENTORY='+JSON.stringify(report));await browser.close();}
