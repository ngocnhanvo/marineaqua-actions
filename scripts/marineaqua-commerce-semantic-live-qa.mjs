import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn', FRONT='https://marine-aqua.io.vn';
const targets=[
  {id:83449,slug:'gio-hang',table:'cart_semantics_vi',count:18},
  {id:83451,slug:'thanh-toan',table:'checkout_semantics_vi',count:51},
  {id:83453,slug:'dat-hang-thanh-cong',table:'checkout_done_semantics_vi',count:32},
  {id:83459,slug:'tai-khoan',table:'account_semantics_vi',count:24},
];
const report={status:'STARTED',pages:[],errors:[],writes:0};
await mkdir('artifacts/commerce-semantic-live-qa',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1366,height:850}});
 const page=await ctx.newPage();
 let authed=false;
 assert.ok(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,'No admin QA credentials');
 for(let attempt=0;attempt<3&&!authed;attempt++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await page.locator('#wp-submit').click();
   await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
  }
  authed=!page.url().includes('wp-login.php')&&(await page.locator('#wpadminbar').count())>0;
  if(!authed)await page.waitForTimeout(1200*(attempt+1));
 }
 assert.ok(authed,'WordPress login failed');
 for(const target of targets){
  const record={...target,status:'STARTED',errors:[]};
  try{
   const table=await ctx.request.get(WP+'/wp-json/tablepress/v1/table/'+target.table,{timeout:30000});
   assert.equal(table.status(),200,'Native ESC source missing '+target.table);
   const native=await table.json();
   const keys=(native.items||[]).map(row=>String(row.key||''));
   assert.equal(keys.length,target.count,'Native WordPress keys count mismatch');
   assert.equal(new Set(keys).size,keys.length,'Duplicate label keys');
   const browserRes=await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+target.id,
     {waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(browserRes?.status(),200);
   const frame=page.frameLocator('iframe#esc-vb-frame');
   const inspector=frame.locator('[data-esc-semantic-inspector][data-esc-source-table="'+target.table+'"]');
   await inspector.waitFor({state:'visible',timeout:60000});
   const rows=inspector.locator('[data-esc-builder-cell-field="label"]');
   record.count=await rows.count();
   assert.equal(record.count,target.count,'Preview does not expose all label coordinates');
   const first=rows.first();
   const before=(await first.innerText()).trim();
   await first.click({timeout:15000});
   const textarea=page.locator('#esc-vb-edit-title');
   await textarea.waitFor({state:'visible',timeout:20000});
   await page.waitForFunction(()=>String(document.querySelector('#esc-vb-edit-title')?.value||'').trim().length>0,null,{timeout:25000});
   record.selectedValue=await textarea.inputValue();
   assert.equal(record.selectedValue.trim(),before,'Builder selected wrong source label');
   record.row=await page.locator('#esc-vb-edit-row').inputValue().catch(()=>null);
   record.uiPass=true;
   const publicPage=await ctx.newPage();
   try {
    const pub=await publicPage.goto(FRONT+'/'+target.slug,{waitUntil:'domcontentloaded',timeout:50000});
    record.publicHttp=pub?.status()||0;
    record.publicMain=await publicPage.locator('main#main-content').count()>0;
   }finally{await publicPage.close();}
   assert.ok(record.publicHttp>=200&&record.publicHttp<400&&record.publicMain,'Public commerce route inaccessible');
   record.status='PASS';
  }catch(e){record.status='FAIL';record.errors.push(String(e).slice(0,700));}
  report.pages.push(record);
 }
 report.status=report.pages.every(r=>r.status==='PASS')?'PASS':'FAIL';
 if(report.status!=='PASS')process.exitCode=1;
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,1000));process.exitCode=1;}
finally{
 await writeFile('artifacts/commerce-semantic-live-qa/report.json',JSON.stringify(report,null,2)+'\n');
 console.log('COMMERCE_SEMANTIC_LIVE_QA='+JSON.stringify(report));await browser.close();
}
