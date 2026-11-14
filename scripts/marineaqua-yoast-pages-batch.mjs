import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP = 'https://admin.marine-aqua.io.vn';
const pages = [
 {id:82454,slug:'trang-chu',title:'Trang chủ',seoTitle:'Shop thiết bị, phụ kiện cá cảnh biển uy tín tại Hà Nội',description:'FISHLOVESHOP COMPANY LIMITED nhập khẩu và phân phối chính hãng thiết bị, phụ kiện bể cá cảnh biển uy tín tại Hà Nội.'},
 {id:83285,slug:'thoi-gian-ban-hang',title:'THỜI GIAN BÁN HÀNG',seoTitle:'Thời gian bán hàng - Marine Aqua',description:'Marine Aqua phục vụ khách hàng mỗi ngày từ 8h30 sáng đến sau 6h30 tối. Liên hệ cửa hàng để được tư vấn trước khi đến mua sắm.'},
 {id:83275,slug:'huong-dan-mua-hang-tai-nha',title:'HƯỚNG DẪN MUA HÀNG TẠI NHÀ',seoTitle:'Hướng dẫn mua hàng tại nhà - Marine Aqua',description:'Marine Aqua hỗ trợ chuyển hàng tận nhà và thu tiền hàng cùng phí vận chuyển. Liên hệ cửa hàng để được hướng dẫn đặt hàng và xác nhận chi phí giao nhận.'},
 {id:83274,slug:'huong-dan-mua-hang-o-xa',title:'HƯỚNG DẪN MUA HÀNG Ở XA',seoTitle:'Hướng dẫn mua hàng ở xa - Marine Aqua',description:'Marine Aqua nhận đơn hàng trên toàn quốc và hướng dẫn khách ở xa thanh toán, vận chuyển. Hàng được gửi theo thông tin nhận hàng đã xác nhận với cửa hàng.'},
 {id:83272,slug:'chinh-sach-doi-tra-hang',title:'CHÍNH SÁCH ĐỔI TRẢ HÀNG',seoTitle:'Chính sách đổi trả hàng - Marine Aqua',description:'Tìm hiểu điều kiện và quy trình đổi trả sản phẩm tại Marine Aqua, bao gồm tình trạng sản phẩm, chứng từ mua hàng và các điều kiện áp dụng trước khi gửi yêu cầu.'},
 {id:82580,slug:'lien-he',title:'LIÊN HỆ',seoTitle:'Liên hệ - Marine Aqua',description:'Liên hệ Marine Aqua để được tư vấn thiết bị, vật tư và phụ kiện cho bể cá biển. Thông tin điện thoại, email và địa chỉ cửa hàng được cập nhật trên trang liên hệ.'},
 {id:82495,slug:'san-pham',title:'Sản phẩm',seoTitle:'Sản phẩm - Marine Aqua',description:'Khám phá thiết bị, vật tư và phụ kiện dành cho bể cá biển tại Marine Aqua. Xem danh mục sản phẩm và thông tin chi tiết để lựa chọn giải pháp phù hợp.'}
];
const out='yoast-pages-batch'; await mkdir(out,{recursive:true});
const report={status:'STARTED',pages:[],writes:0,errors:[]};
const browser=await chromium.launch({headless:true});
try{
 assert.ok(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,'WP credentials missing');
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
 assert.ok(auth,'WordPress Admin login failed');
 for(const item of pages){
  const rec={id:item.id,slug:item.slug,status:'STARTED'};
  try{
   await page.goto(WP+'/wp-admin/post.php?post='+item.id+'&action=edit',{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(new URL(page.url()).searchParams.get('post'),String(item.id));
   const title=page.locator('#title');
   const oldSlug=await page.locator('#post_name').inputValue().catch(()=>item.slug);
   assert.equal(oldSlug,item.slug,'Slug mismatch; refuse update');
   await page.locator('#yoast-google-preview-title-metabox').waitFor({state:'visible',timeout:25000});
   await page.locator('#yoast-google-preview-description-metabox').waitFor({state:'visible',timeout:25000});
   await title.fill(item.title);
   const seoTitle=page.locator('#yoast-google-preview-title-metabox');
   const seoDescription=page.locator('#yoast-google-preview-description-metabox');
   await seoTitle.fill(item.seoTitle); await seoTitle.evaluate(el=>el.blur());
   await seoDescription.fill(item.description); await seoDescription.evaluate(el=>el.blur());
   const form=await page.evaluate(()=>({seoTitle:document.querySelector('#yoast_wpseo_title')?.value||'',description:document.querySelector('#yoast_wpseo_metadesc')?.value||''}));
   assert.equal(form.seoTitle,item.seoTitle,'Yoast title field binding mismatch');
   assert.equal(form.description,item.description,'Yoast description field binding mismatch');
   const update=page.locator('#publish');
   await update.click({timeout:20000});
   await page.waitForTimeout(800);
   const deadline=Date.now()+25000; let after=null;
   while(Date.now()<deadline){
    const response=await context.request.get(WP+'/wp-json/wp/v2/pages/'+item.id,{timeout:15000});
    if(response.status()===200){
     after=await response.json();
     if(after.title?.rendered===item.title&&after.yoast_head_json?.title===item.seoTitle&&after.yoast_head_json?.description===item.description)break;
    }
    await page.waitForTimeout(700);
   }
   assert.ok(after,'REST read-after-write unavailable');
   assert.equal(after.slug,item.slug,'Slug changed');
   assert.equal(after.status,'publish','Page status changed');
   assert.equal(after.title?.rendered,item.title,'Page title/H1 source not saved');
   assert.equal(after.yoast_head_json?.title,item.seoTitle,'SEO title readback mismatch');
   assert.equal(after.yoast_head_json?.description,item.description,'Meta description readback mismatch');
   rec.status='PASS';rec.after={title:after.title.rendered,slug:after.slug,seoTitle:after.yoast_head_json.title,description:after.yoast_head_json.description};
   report.writes++; console.log('YOAST_PAGE_WRITE='+JSON.stringify(rec));
  }catch(e){rec.status='FAIL';rec.error=String(e.message||e).slice(0,300);report.errors.push({id:item.id,error:rec.error});console.error('YOAST_PAGE_WRITE_FAIL='+JSON.stringify(rec));}
  report.pages.push(rec);
 }
 report.status=report.errors.length?'PARTIAL':'PASS';
 if(report.errors.length)process.exitCode=1;
 console.log('YOAST_BATCH_SUMMARY='+JSON.stringify({status:report.status,total:pages.length,writes:report.writes,failures:report.errors.length}));
 await context.close();
}catch(e){report.status='FAIL';report.errors.push({fatal:String(e.stack||e).slice(0,1000)});process.exitCode=1}
finally{await writeFile(out+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
