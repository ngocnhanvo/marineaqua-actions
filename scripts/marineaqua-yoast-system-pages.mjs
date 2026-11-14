import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn',OUT='yoast-system-pages';
const pages=[
 {id:83459,slug:'tai-khoan',title:'Tài khoản',seoTitle:'Tài khoản - Marine Aqua',description:'Đăng nhập hoặc tạo tài khoản Marine Aqua để quản lý thông tin cá nhân, theo dõi đơn hàng và thuận tiện khi mua sắm thiết bị, phụ kiện bể cá biển.'},
 {id:83449,slug:'gio-hang',title:'Giỏ hàng',seoTitle:'Giỏ hàng - Marine Aqua',description:'Kiểm tra sản phẩm đã chọn, cập nhật số lượng và xem thông tin đơn hàng trước khi tiếp tục thanh toán tại Marine Aqua.'},
 {id:83451,slug:'thanh-toan',title:'Thanh toán',seoTitle:'Thanh toán - Marine Aqua',description:'Hoàn tất thông tin nhận hàng và lựa chọn phương thức thanh toán cho đơn hàng Marine Aqua. Kiểm tra kỹ thông tin trước khi xác nhận đặt hàng.'},
 {id:83453,slug:'dat-hang-thanh-cong',title:'Hoàn tất đơn hàng',seoTitle:'Hoàn tất đơn hàng - Marine Aqua',description:'Tra cứu thông tin xác nhận và trạng thái đơn hàng Marine Aqua bằng liên kết và thông tin đơn hàng được cung cấp sau khi đặt hàng.'}
];
await mkdir(OUT,{recursive:true});const report={status:'STARTED',writes:0,pages:[],errors:[]};const browser=await chromium.launch({headless:true});
try{
 assert.ok(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD);
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage();let auth=false;
 for(let n=0;n<3&&!auth;n++){await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});if(await page.locator('#user_login').count()){await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);await page.locator('#wp-submit').click();await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});}auth=!page.url().includes('wp-login.php')&&(await page.locator('#wpadminbar').count())>0;}
 assert.ok(auth,'Admin login failed');
 for(const p of pages){const rec={id:p.id,slug:p.slug};try{
  await page.goto(WP+'/wp-admin/post.php?post='+p.id+'&action=edit',{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(new URL(page.url()).searchParams.get('post'),String(p.id));
  assert.equal(await page.locator('#post_name').inputValue(),p.slug,'slug mismatch');
  const before=await ctx.request.get(WP+'/wp-json/wp/v2/pages/'+p.id);assert.equal(before.status(),200);
  const old=await before.json();assert.equal(old.status,'publish');
  const title=page.locator('#yoast-google-preview-title-metabox'),desc=page.locator('#yoast-google-preview-description-metabox');
  await title.waitFor({state:'visible',timeout:25000});await desc.waitFor({state:'visible',timeout:25000});
  await title.fill(p.seoTitle);
  await page.keyboard.press('Tab');
  await desc.fill(p.description);
  await page.keyboard.press('Tab');
  const state=await page.evaluate(()=>({title:document.querySelector('#yoast_wpseo_title')?.value||'',description:document.querySelector('#yoast_wpseo_metadesc')?.value||''}));
  assert.equal(state.title,p.seoTitle,'Yoast title did not bind to native field');
  assert.equal(state.description,p.description,'Yoast description did not bind to native field');
  await page.locator('#publish').click({timeout:20000});
  let after=null;const deadline=Date.now()+25000;while(Date.now()<deadline){const res=await ctx.request.get(WP+'/wp-json/wp/v2/pages/'+p.id);if(res.ok()){after=await res.json();if(after.yoast_head_json?.title===p.seoTitle&&after.yoast_head_json?.description===p.description)break;}await page.waitForTimeout(700);}
  assert.ok(after);assert.equal(after.slug,p.slug);assert.equal(after.status,'publish');assert.equal(after.yoast_head_json?.title,p.seoTitle);assert.equal(after.yoast_head_json?.description,p.description);
  rec.status='PASS';rec.after={title:after.title.rendered,slug:after.slug,seoTitle:after.yoast_head_json.title,description:after.yoast_head_json.description};report.writes++;
 }catch(e){rec.status='FAIL';rec.error=String(e.message||e).slice(0,260);report.errors.push({id:p.id,error:rec.error});}
 report.pages.push(rec);console.log('YOAST_SYSTEM_PAGE='+JSON.stringify(rec));
 }
 report.status=report.errors.length?'PARTIAL':'PASS';console.log('YOAST_SYSTEM_SUMMARY='+JSON.stringify({status:report.status,total:pages.length,writes:report.writes,failures:report.errors.length}));if(report.errors.length)process.exitCode=1;await ctx.close();
}catch(e){report.status='FAIL';report.errors.push({fatal:String(e.stack||e).slice(0,800)});process.exitCode=1}
finally{await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
