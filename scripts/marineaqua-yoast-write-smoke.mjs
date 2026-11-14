import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const PAGE={id:83273,slug:'thong-bao',title:'THÔNG BÁO PHÍ SHIP HÀNG',
 seoTitle:'THÔNG BÁO PHÍ SHIP HÀNG - Marine Aqua',
 description:'Marine Aqua hỗ trợ phí vận chuyển đến 30.000đ cho đơn hàng trên 500.000đ đủ điều kiện; khách hàng VIP được hưởng ưu đãi miễn phí vận chuyển.'};
const OUT='yoast-write-smoke';await mkdir(OUT,{recursive:true});
const report={status:'STARTED',page_id:PAGE.id,slug:PAGE.slug,writes:0,errors:[]};
const browser=await chromium.launch({headless:true});
try{
 assert.ok(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,'WP credentials missing');
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 let auth=false;
 for(let attempt=0;attempt<3&&!auth;attempt++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await page.locator('#wp-submit').click();
   await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
  }
  auth=!page.url().includes('wp-login.php')&&(await page.locator('#wpadminbar').count())>0;
 }
 assert.ok(auth,'WordPress Admin login failed');
 await page.goto(WP+'/wp-admin/post.php?post='+PAGE.id+'&action=edit',{waitUntil:'domcontentloaded',timeout:45000});
 assert.equal(new URL(page.url()).searchParams.get('post'),String(PAGE.id));
 assert.equal(await page.locator('#title').inputValue(),'Phí ship hàng','Unexpected Page title; refusing to write');
 const restBefore=await context.request.get(WP+'/wp-json/wp/v2/pages/'+PAGE.id,{timeout:30000});
 assert.equal(restBefore.status(),200);
 const before=await restBefore.json();
 assert.equal(before.slug,PAGE.slug);assert.equal(before.status,'publish');
 report.before={title:before.title?.rendered,slug:before.slug,seoTitle:before.yoast_head_json?.title||'',description:before.yoast_head_json?.description||''};
 const seoTitle=page.locator('#yoast-google-preview-title-metabox');
 const seoDescription=page.locator('#yoast-google-preview-description-metabox');
 await seoTitle.waitFor({state:'visible',timeout:25000});
 await seoDescription.waitFor({state:'visible',timeout:25000});
 await seoTitle.scrollIntoViewIfNeeded();
 await seoTitle.fill(PAGE.seoTitle);
 await seoTitle.evaluate(el=>el.blur());
 await seoDescription.scrollIntoViewIfNeeded();
 await seoDescription.fill(PAGE.description);
 await seoDescription.evaluate(el=>el.blur());
 await page.waitForFunction(()=>String(document.querySelector('#yoast_wpseo_title')?.value||'').length>0 &&
  String(document.querySelector('#yoast_wpseo_metadesc')?.value||'').length>0,null,{timeout:15000});
 report.formState=await page.evaluate(()=>({
  seoTitle:document.querySelector('#yoast_wpseo_title')?.value||'',
  description:document.querySelector('#yoast_wpseo_metadesc')?.value||''
 }));
 assert.equal(report.formState.seoTitle,PAGE.seoTitle,'Yoast title did not bind to native field');
 assert.equal(report.formState.description,PAGE.description,'Yoast description did not bind to native field');
 await page.locator('#title').fill(PAGE.title);
 await page.locator('#publish').click({timeout:20000});
 await page.waitForTimeout(1500);
 const deadline=Date.now()+20000;let after=null;
 while(Date.now()<deadline){
  const res=await context.request.get(WP+'/wp-json/wp/v2/pages/'+PAGE.id,{timeout:15000});
  if(res.status()===200){after=await res.json();if(after.yoast_head_json?.title===PAGE.seoTitle&&after.yoast_head_json?.description===PAGE.description&&after.title?.rendered===PAGE.title)break;}
  await page.waitForTimeout(700);
 }
 assert.ok(after,'WordPress REST readback unavailable');
 report.after={title:after.title?.rendered,slug:after.slug,status:after.status,
  seoTitle:after.yoast_head_json?.title||'',description:after.yoast_head_json?.description||''};
 assert.equal(after.slug,PAGE.slug,'Slug changed');
 assert.equal(after.status,'publish','Page is no longer published');
 assert.equal(after.title?.rendered,PAGE.title,'Page H1 source title not saved');
 assert.equal(after.yoast_head_json?.title,PAGE.seoTitle,'Yoast SEO title readback mismatch');
 assert.equal(after.yoast_head_json?.description,PAGE.description,'Yoast description readback mismatch');
 report.writes=1;report.status='PASS';
 console.log('YOAST_WRITE_SMOKE='+JSON.stringify(report));
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,1000));process.exitCode=1;console.error('YOAST_WRITE_SMOKE_FAIL='+String(e.message||e).slice(0,250))}
finally{await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
