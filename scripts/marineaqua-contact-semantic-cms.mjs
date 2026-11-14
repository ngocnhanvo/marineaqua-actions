import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const PAGE_ID=82580;
const TABLE='contact_semantics_vi';
const OUT='artifacts/contact-semantic-cms';
const LABELS=[
 ['brand','Marine Aqua',''],
 ['breadcrumb_home','Trang chủ',''],
 ['breadcrumb_current','Liên hệ',''],
 ['hero_title','Liên hệ Marine Aqua',''],
 ['hero_description','Kết nối với Marine Aqua để được tư vấn thiết bị, vật tư và phụ kiện cho bể cá biển, san hô.',''],
 ['details_title','Thông tin liên hệ',''],
 ['details_description','Chọn kênh liên hệ phù hợp để được hỗ trợ nhanh chóng.',''],
 ['company_label','Doanh nghiệp',''],
 ['address_label','Địa chỉ',''],
 ['directions_label','Xem chỉ đường',''],
 ['phone_label','Hotline tư vấn',''],
 ['email_label','Email',''],
 ['partners_title','Liên hệ mua hàng đại lý và tuyển dụng',''],
 ['partners_description','Đầu mối liên hệ theo thông tin công bố trên website Marine Aqua.',''],
 ['dealer_phone_label','Gọi Mr Cường: 090 21 26 111','tel:+84902126111'],
 ['dealer_email_label','Email: info@marine-aqua.vn','mailto:info@marine-aqua.vn'],
];
const report={status:'STARTED',scope:{pageId:PAGE_ID,tableId:TABLE},steps:[],errors:[],changed:0,createdTable:false,shortcodeCount:0};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 page.on('dialog',async dialog=>{
   if(dialog.type()==='confirm'){await dialog.accept();return;}
   if(dialog.type()==='prompt'&&/table|id|bảng|mã/i.test(dialog.message())){await dialog.accept(TABLE);return;}
   throw Error('Unexpected native dialog: '+dialog.type()+': '+dialog.message().slice(0,150));
 });
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 assert.ok(username&&password,'No WordPress login credentials');
 let authed=false;
 for(let attempt=0;attempt<3&&!authed;attempt++){
   await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
   if(await page.locator('#user_login').isVisible().catch(()=>false)){
     await page.locator('#user_login').fill(username);
     await page.locator('#user_pass').fill(password);
     await page.locator('#wp-submit').click();
     await page.waitForLoadState('domcontentloaded',{timeout:12000}).catch(()=>{});
     authed=!page.url().includes('wp-login.php') && await page.locator('#wpadminbar').count()>0;
   }
   if(!authed && attempt<2)await page.waitForTimeout((attempt+1)*2500);
 }
 assert.ok(authed,'WP login failed');
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
   return r.ok?(await r.text()).trim():'';
 });
 assert.match(nonce,/^[a-zA-Z0-9]{8,32}$/,'Missing WP REST nonce');
 const rest=async(method,path,body)=>{
  const r=await context.request.fetch(WP+path,{
   method,timeout:30000,failOnStatusCode:false,
   headers:{'X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},
   data:body?JSON.stringify(body):undefined,
  });
  return {status:r.status(),data:await r.json().catch(()=>({}))};
 };
 const p=await rest('GET','/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit');
 assert.equal(p.status,200,'Contact Page REST unavailable');
 const original=p.data;
 assert.equal(original.slug,'lien-he');
 assert.equal(original.status,'publish');
 assert.equal(original.acf?.key,'contact');
 assert.equal(original.acf?.action,'HomePage');
 assert.equal(original.acf?.product_lang?.value||original.acf?.product_lang,'vi');
 const precontent=String(original.content?.raw??'');
 const shortcode='[table id='+TABLE+' /]';
 const already=(precontent.match(new RegExp('\\[table id='+TABLE+'\\s*\\/\\]','g'))||[]).length;
 assert.ok(already<=1,'Page has repeated shortcode');
 report.steps.push('WP_PAGE_IDENTITY_PASS');
 const readTable=async()=>{
   const r=await rest('GET','/wp-json/tablepress/v1/table/'+TABLE);
   if(r.status===404)return null;
   assert.equal(r.status,200,'ESC Table REST: '+r.status);
   return r.data;
 };
 let table=await readTable();
 if(table){
  assert.equal(table.id,TABLE);
  assert.equal(table.meta?.api||'','');
  assert.deepEqual((table.fields||[]).map(f=>f.key),['key','label','href']);
  assert.deepEqual((table.items||[]).map(row=>String(row.key||'')),LABELS.map(row=>row[0]));
  report.steps.push('EXISTING_ESC_TABLE_PRESERVED');
 }else{
  await page.goto(WP+'/wp-admin/admin.php?page=tablepress&action=add',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('input[name="table[name]"]').waitFor({state:'visible',timeout:30000});
  await page.locator('input[name="table[name]"]').fill('Ngữ nghĩa trang Liên hệ Marine Aqua');
  await page.locator('input[name="table[rows]"]').fill(String(LABELS.length+2));
  await page.locator('input[name="table[columns]"]').fill('3');
  await page.getByRole('button',{name:/Add Table|Thêm bảng/i}).click();
  await page.waitForURL(/action=edit/,{timeout:45000});
  const tempId=new URL(page.url()).searchParams.get('table_id');
  assert.ok(tempId&&/^\d+$/.test(tempId),'New TablePress ID is not numeric');
  report.provisionalId=tempId;
  await page.locator('#table-id').waitFor({state:'visible',timeout:30000});
  await page.locator('#table-id').fill(TABLE);
  await page.locator('#table-id').press('Tab');
  await page.waitForFunction(()=>Boolean(window.tp?.editor?.setValueFromCoords && window.tp?.table?.data),
      null,{timeout:30000});
  const before=await page.evaluate(()=>({
    id:window.tp.table.id,
    rows:window.tp.table.data.length,
    cols:window.tp.table.data[0]?.length,
  }));
  assert.equal(before.rows,LABELS.length+2,'Unexpected TablePress row count');
  assert.equal(before.cols,3,'Unexpected column count');
  await page.evaluate((rows)=>{
    const grid=window.tp.table.data;
    if(grid.some(row=>row.some(value=>String(value||'').trim())))throw Error('New native ESC Table not blank');
    for(const [idx,key] of ['key','label','href'].entries())window.tp.editor.setValueFromCoords(idx,0,key);
    for(let col=0;col<3;col++)window.tp.editor.setValueFromCoords(col,1,'');
    rows.forEach((row,index)=>row.forEach((value,col)=>window.tp.editor.setValueFromCoords(col,index+2,value)));
  },LABELS);
  await page.getByRole('button',{name:/Save Changes|Lưu thay đổi/i}).first().click({timeout:25000});
  await page.waitForTimeout(1600);
  table=await readTable();
  assert.ok(table,'Native TablePress Save failed to persist the custom ID '+TABLE);
  assert.deepEqual((table.fields||[]).map(f=>f.key),['key','label','href']);
  assert.deepEqual((table.items||[]).map(row=>[String(row.key||''),String(row.label||''),String(row.href||'')]),LABELS);
  assert.equal(table.meta?.api||'','');
  report.createdTable=true;report.changed++;
  report.steps.push('NATIVE_ESC_TABLE_SAVE_REST_PASS');
 }
 if(already===0){
  await page.goto(WP+'/wp-admin/post.php?post='+PAGE_ID+'&action=edit',
     {waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(650);
  const textTab=page.locator('#content-html');
  if(await textTab.count())await textTab.click();
  const textarea=page.locator('#content');
  await textarea.waitFor({state:'visible',timeout:15000});
  assert.equal(await textarea.inputValue(),precontent,'Page content differs since REST snapshot');
  await textarea.evaluate(el=>{el.focus();el.setSelectionRange(el.value.length,el.value.length);});
  const quick=page.locator('#qt_content_tablepress_quicktags_button');
  assert.ok(await quick.isVisible(),'Native ESC Table Insert Code button missing');
  await quick.click();
  await page.waitForTimeout(750);
  let updated=await textarea.inputValue();
  if(!updated.includes(shortcode)){
    const sourceRow=page.locator('[data-table-id="'+TABLE+'"]').first();
    if(await sourceRow.count()){
      const insert=sourceRow.getByRole('button',{name:/Insert|Chèn/i});
      if(await insert.count())await insert.first().click();else await sourceRow.click();
    }
  }
  updated=await textarea.inputValue();
  assert.ok(updated.includes(shortcode),'Native Insert Code did not insert ESC shortcode');
  assert.ok(updated.includes(precontent),'Existing Page content was replaced');
  const save=page.locator('#publish');
  assert.ok(await save.count(),'Page Update button missing');
  await save.click();
  await page.waitForTimeout(1300);
  report.changed++;report.steps.push('PAGE_NATIVE_INSERT_CODE_SAVED');
 }
 const after=await rest('GET','/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit');
 assert.equal(after.status,200);
 assert.equal(after.data.slug,original.slug);
 assert.equal(after.data.acf?.key,original.acf?.key);
 assert.equal(after.data.acf?.action,original.acf?.action);
 assert.equal(after.data.status,original.status);
 const content=String(after.data.content?.raw||'');
 const count=(content.match(new RegExp('\\[table id='+TABLE+'\\s*\\/\\]','g'))||[]).length;
 report.shortcodeCount=count;
 assert.equal(count,1,'Page shortcode not unique after Save');
 assert.ok(content.includes(precontent),'Authored Page content not preserved');
 const verified=await readTable();assert.ok(verified);
 assert.deepEqual((verified.items||[]).map(x=>String(x.key||'')),LABELS.map(x=>x[0]));
 report.steps.push('PAGE_NATIVE_SHORTCODE_READBACK_PASS');
 report.status='PASS';
} catch(error){
 report.status='FAIL';report.errors.push(String(error.stack||error).slice(0,1800));process.exitCode=1;
} finally {
 await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');
 console.log('CONTACT_SEMANTIC_CMS='+JSON.stringify(report));
 await browser.close();
}
