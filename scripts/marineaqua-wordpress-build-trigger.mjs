import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const OUT='wordpress-build-trigger';
const report={status:'STARTED',trigger:'WordPress GitHub Trigger admin UI',errors:[]};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 assert.ok(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,'WP admin secrets missing');
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await ctx.newPage();
 let authenticated=false;
 for(let i=0;i<3&&!authenticated;i++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await page.locator('#wp-submit').click();
   await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
  }
  authenticated=!page.url().includes('wp-login.php')&&await page.locator('#wpadminbar').count()>0;
 }
 assert.ok(authenticated,'WordPress Admin login failed');
 await page.goto(WP+'/wp-admin/admin.php?page=vcs-build-trigger',{waitUntil:'domcontentloaded',timeout:45000});
 const button=page.locator('#vcs-build-btn-main');
 await button.waitFor({state:'visible',timeout:30000});
 const force=page.locator('#vcs-force-build');
 report.before=await page.evaluate(()=>({url:location.href,buttonText:document.querySelector('#vcs-build-btn-main')?.innerText||'',buttonDisabled:document.querySelector('#vcs-build-btn-main')?.disabled,forcePresent:!!document.querySelector('#vcs-force-build'),status:document.querySelector('#vcs-status-text')?.innerText||'',pending:document.querySelector('#vcs-pending-count')?.innerText||''}));
 if(await button.isDisabled()){
  assert.equal(await force.count(),1,'Build button disabled and force-build control missing');
  await force.check();
 }
 assert.equal(await button.isDisabled(),false,'Official WordPress Build Website button remains disabled');
 await button.click();
 await page.waitForTimeout(1200);
 report.triggered=await page.evaluate(()=>({buttonText:document.querySelector('#vcs-build-btn-main')?.innerText||'',status:document.querySelector('#vcs-status-text')?.innerText||'',dashboardLink:document.querySelector('#vcs-status-text a')?.href||'',active:document.querySelector('#vcs-build-status')?.innerText||''}));
 console.log('WORDPRESS_BUILD_TRIGGERED='+JSON.stringify(report.triggered));
 const deadline=Date.now()+20*60*1000;
 let completed=false;
 while(Date.now()<deadline){
  await page.waitForTimeout(5000);
  const state=await page.evaluate(()=>({buttonText:document.querySelector('#vcs-build-btn-main')?.innerText||'',status:document.querySelector('#vcs-status-text')?.innerText||'',dashboardLink:document.querySelector('#vcs-status-text a')?.href||'',pending:document.querySelector('#vcs-pending-count')?.innerText||''}));
  report.latest=state;
  console.log('WORDPRESS_BUILD_STATUS='+JSON.stringify(state));
  if(/Build thành công|Build successful/i.test(state.status)){report.status='PASS';completed=true;break;}
  if(/Build thất bại|Build failed|Lỗi build/i.test(state.status)){report.status='FAIL';report.errors.push(state.status);completed=true;break;}
  if(!/Đang có Build khác chạy|Đang chờ GitHub|Đã gửi yêu cầu|Đang kiểm tra trạng thái|Build Website Ngay/i.test(state.buttonText+' '+state.status) && !/Đang có Build khác chạy/.test(state.buttonText)){
   if(!/Đang/.test(state.status)){report.status='UNKNOWN';break;}
  }
 }
 if(!completed&&report.status==='STARTED')report.status='TIMEOUT';
 await ctx.close();
 if(report.status!=='PASS')process.exitCode=1;
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,900));process.exitCode=1;console.error('WORDPRESS_BUILD_TRIGGER_FAIL='+String(e.message||e).slice(0,250));}
finally{await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
