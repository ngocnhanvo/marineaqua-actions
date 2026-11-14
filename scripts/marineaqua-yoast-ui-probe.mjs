import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const ids=[82454,83272,83273,82580,83459,83451,83449,83453,82495];
const out='yoast-ui-probe'; await mkdir(out,{recursive:true});
const report={status:'STARTED',pages:[],errors:[]};
const browser=await chromium.launch({headless:true});
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('WP credentials missing');
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 let auth=false;
 for(let i=0;i<3&&!auth;i++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await page.locator('#wp-submit').click();
   await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
  }
  auth=!page.url().includes('wp-login.php')&&(await page.locator('#wpadminbar').count())>0;
 }
 if(!auth)throw Error('WP admin authentication failed');
 for(const id of ids){
  const rec={id};
  try{
   const response=await page.goto(WP+'/wp-admin/post.php?post='+id+'&action=edit',{waitUntil:'domcontentloaded',timeout:45000});
   rec.http=response?.status()||0;
   rec.url=page.url();
   rec.controls=await page.locator('input,textarea,[contenteditable="true"],[role="textbox"]').evaluateAll(els=>els.filter(el=>{
    const s=[el.id,el.getAttribute('name'),el.getAttribute('aria-label'),el.getAttribute('placeholder'),el.getAttribute('class')].join(' ');
    return /yoast|wpseo|seo|snippet|google-preview/i.test(s);
   }).map(el=>({
    tag:el.tagName,id:el.id,name:el.getAttribute('name')||'',role:el.getAttribute('role')||'',
    aria:el.getAttribute('aria-label')||'',placeholder:el.getAttribute('placeholder')||'',
    value:String(el.value||el.innerText||'').slice(0,220),
    visible:!!el.getClientRects().length,outer:el.outerHTML.slice(0,450)
   })).slice(0,50));
   rec.panels=await page.locator('body').innerText().then(t=>t.split('\n').filter(x=>/yoast|seo title|meta description|google preview|search appearance/i.test(x)).slice(0,40));
   await page.screenshot({path:out+'/page-'+id+'.png',fullPage:false}).catch(()=>{});
  }catch(e){rec.error=String(e.message||e).slice(0,250)}
  report.pages.push(rec); console.log('YOAST_UI_PROBE='+JSON.stringify(rec));
 }
 report.status=report.pages.every(x=>x.http===200)?'PASS':'PARTIAL';
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,800));process.exitCode=1}
finally{await writeFile(out+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
