import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
// Recovery of ONE known workflow marker only. No new QA mutation.
const WP='https://admin.marine-aqua.io.vn';
const PAGE_ID=83285, RUN_ID='43558167264';
const MARK=' [QA'+RUN_ID+']';
const report={page_id:PAGE_ID,original_run:RUN_ID,status:'STARTED',writes:0,cleanup_remaining:null,errors:[]};
await mkdir('artifacts/page-editor-recovery',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext();
 const page=await ctx.newPage();
 let authed=false;
 for(let a=0;a<3&&!authed;a++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').isVisible().catch(()=>false)){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await page.locator('#wp-submit').click({timeout:25000});
   await page.waitForLoadState('domcontentloaded',{timeout:18000}).catch(()=>{});
  }
  authed=!page.url().includes('wp-login.php')&&(await page.locator('#wpadminbar').count())>0;
  if(!authed)await page.waitForTimeout(1500*(a+1));
 }
 assert.ok(authed,'WP authentication required');
 await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+PAGE_ID,
  {waitUntil:'domcontentloaded',timeout:45000});
 const ticket=await page.evaluate(()=>window.escVBGetTicket?.());
 assert.ok(typeof ticket==='string'&&ticket.length>20,'Missing valid Page ticket');
 const scripts=await page.locator('script').allTextContents();
 const nonce=scripts.map(t=>t.match(/const nonce\s*=\s*["']([^"']+)["']/)?.[1]).find(Boolean);
 assert.ok(nonce,'Missing REST nonce');
 const headers={'X-WP-Nonce':nonce,'Content-Type':'application/json'};
 const post=async path=>ctx.request.post(WP+'/wp-json/esc-builder/v1/'+path,{headers,data:{page_id:PAGE_ID,ticket},timeout:30000,failOnStatusCode:false});
 const current=async()=>{
  const r=await ctx.request.get(WP+'/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit',
   {headers,timeout:30000,failOnStatusCode:false});
  assert.equal(r.status(),200,'Unable to read WordPress Page');
  return String((await r.json()).content?.raw||'');
 };
 const before=await current();
 const knownBad='<p>Thời gian &nbsp;bán hàng của cửa hàng</p><p>– Bắt đầu từ 8h30 sáng</p><p>– Bắt đầu từ 8h30 sáng QA43559892576</p>';
 const knownGood='<p>Thời gian &nbsp;bán hàng của cửa hàng</p><p>– Bắt đầu từ 8h30 sáng</p><p>– Kết thúc sau 6h30 tối.</p>';
 if(before===knownGood){
  report.status='PASS';report.cleanup_remaining=0;report.restored_with='already-original';
 }else{
  assert.equal(before,knownBad,'CLEANUP_CONFLICT: Page differs from observed QA corruption; refusing overwrite');
  const check=await ctx.request.get(WP+'/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit',
    {headers,timeout:30000,failOnStatusCode:false});
  assert.equal(check.status(),200,'Cannot recheck Page before restore');
  const record=await check.json();
  assert.equal(Number(record.id),PAGE_ID);
  assert.equal(record.slug,'thoi-gian-ban-hang');
  assert.equal(String(record.content?.raw||''),before,'Concurrent Page mutation; refusing overwrite');
  const save=await ctx.request.post(WP+'/wp-json/wp/v2/pages/'+PAGE_ID,
    {headers,data:{content:knownGood},timeout:30000,failOnStatusCode:false});
  report.save_status=save.status();
  const saved=await save.json().catch(()=>({}));
  assert.ok(save.status()===200&&Number(saved.id)===PAGE_ID,
   'Native WordPress Page REST recovery denied: '+String(saved.code||'unknown'));
  report.writes++;
  const after=await current();
  assert.equal(after,knownGood,'Restored Page HTML differs from exact pre-test snapshot');
  report.restored_with='native-wp-page-rest-full-exact-snapshot';
  report.cleanup_remaining=0;
  report.status='PASS';
 }
}catch(e){
 report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,900));
}finally{
 if(report.cleanup_remaining!==0)report.status='FAIL';
 process.exitCode=report.status==='PASS'?0:1;
 await writeFile('artifacts/page-editor-recovery/report.json',JSON.stringify(report,null,2)+'\n');
 console.log('PAGE_EDITOR_EMERGENCY_RESTORE='+JSON.stringify(report));
 await browser.close();
}
