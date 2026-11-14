import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import https from 'node:https';
const WP='https://admin.marine-aqua.io.vn', FRONT='https://marine-aqua.io.vn';
const targetList=[
  {id:83449,slug:'gio-hang',table:'cart_semantics_vi',count:18},
  {id:83451,slug:'thanh-toan',table:'checkout_semantics_vi',count:51},
  {id:83453,slug:'dat-hang-thanh-cong',table:'checkout_done_semantics_vi',count:32},
  {id:83459,slug:'tai-khoan',table:'account_semantics_vi',count:24},
];
// Full, read-only post-deployment audit of all four WordPress-owned Page label tables.
const targets=targetList;
const http1Probe=(url)=>new Promise(resolve=>{
 let settled=false;
 const done=value=>{if(!settled){settled=true;resolve(value);}};
 const req=https.get(url,{timeout:22000,headers:{'Accept-Encoding':'identity'}},res=>{
  let bytes=0;
  res.on('data',chunk=>{bytes+=chunk.length;if(bytes>1500000)req.destroy();});
  res.on('end',()=>done({status:res.statusCode,bytes,ended:true}));
  res.on('aborted',()=>done({status:res.statusCode,bytes,ended:false,reason:'aborted'}));
  res.on('error',e=>done({status:res.statusCode,bytes,ended:false,errorType:e.code||e.name}));
 });
 req.on('timeout',()=>req.destroy(new Error('HTTP1Timeout')));
 req.on('error',e=>done({ended:false,errorType:e.code||e.name}));
});
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
  const record={...target,status:'STARTED',errors:[],previewResponses:[],frameHistory:[],failedDocuments:[]};
  const monitor=(response)=>{
   try {const u=new URL(response.url());
    if(response.request().resourceType()==='document' && (u.hostname==='marine-aqua.io.vn' || u.pathname.includes('/esc-builder/preview/'+target.id)))
      record.previewResponses.push({status:response.status(),host:u.hostname,path:u.pathname});
   }catch{}
  };
  const navigated=frame=>{if(frame===page.mainFrame())return;
    try{const u=new URL(frame.url());record.frameHistory.push({host:u.hostname,path:u.pathname});}
    catch{record.frameHistory.push({urlKind:'unparsed'});}
  };
  const requestFailed=req=>{if(req.resourceType()!=='document')return;
    try{const u=new URL(req.url());record.failedDocuments.push({host:u.hostname,path:u.pathname,error:req.failure()?.errorText||''});}catch{}
  };
  page.on('response',monitor);
  page.on('framenavigated',navigated);
  page.on('requestfailed',requestFailed);
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
   try {
    await inspector.waitFor({state:'visible',timeout:45000});
   } catch (error) {
    record.previewBody=(await frame.locator('body').innerText().catch(()=>'' )).slice(0,700);
    record.previewHtmlSize=await frame.locator('html').evaluate(el=>el.outerHTML.length).catch(()=>null);
    const iframeSrc=await page.locator('#esc-vb-frame').getAttribute('src').catch(()=>null);
    record.iframePath=iframeSrc?new URL(iframeSrc,WP).pathname:null;
    record.iframeHost=iframeSrc?new URL(iframeSrc,WP).hostname:null;
    record.framePaths=page.frames().map(f=>{try {return new URL(f.url()).pathname;} catch{return 'unknown';}});
    throw error;
   }
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
   // The Checkout Page owns 51 native labels: verify the LAST editable cell,
   // not only the first row, to catch backend 40-row discovery regressions.
   const last=rows.last();
   const lastText=(await last.innerText()).trim();
   record.lastSourceRow=await last.getAttribute('data-esc-builder-cell-row');
   assert.ok(Number.isSafeInteger(Number(record.lastSourceRow))
      && Number(record.lastSourceRow)>=target.count-1,
      'The final WordPress label has no stable source coordinate');
   await last.click({timeout:18000});
   await page.waitForFunction(expected=>
      String(document.querySelector('#esc-vb-edit-title')?.value||'').trim()===expected,
      lastText,{timeout:25000});
   record.lastEditorValue=await textarea.inputValue();
   record.lastRow=await page.locator('#esc-vb-edit-row').inputValue().catch(()=>null);
   assert.equal(record.lastEditorValue.trim(),lastText,
      'Final native WordPress label not independently selectable');
   // The inspector is not enough: a user must be able to click real semantic
   // text in the commerce component and reach the same native ESC source.
   const direct=frame.locator('main#main-content [data-esc-builder-cell-field="label"]:visible');
   record.directLabelCount=await direct.count();
   assert.ok(record.directLabelCount>0,'No directly editable commerce labels');
   const directLabel=direct.first();
   record.directLabelText=(await directLabel.innerText()).trim();
   record.directSourceRow=await directLabel.getAttribute('data-esc-builder-cell-row');
   await directLabel.click({timeout:15000});
   await page.waitForFunction(expected=>
     String(document.querySelector('#esc-vb-edit-title')?.value||'').trim()===expected,
     record.directLabelText,{timeout:25000});
   assert.equal((await textarea.inputValue()).trim(),record.directLabelText,
     'Direct commerce label selected the wrong WordPress cell');
   assert.equal(await page.locator('#esc-vb-edit-row').inputValue(),record.directSourceRow+':label',
     'Direct commerce label did not select its physical ESC row');
   record.directEditable='PASS';
   if(target.slug==='thanh-toan' || target.slug==='tai-khoan'){
     const formSelector=target.slug==='thanh-toan'
       ? '#checkout-form [data-esc-builder-cell-field="label"]:visible'
       : '#login-form [data-esc-builder-cell-field="label"]:visible';
     const nested=frame.locator(formSelector);
     assert.ok((await nested.count())>0,'Nested commerce form labels not selectable');
     const formLabel=nested.first();
     record.formLabel=(await formLabel.innerText()).trim();
     record.formRow=await formLabel.getAttribute('data-esc-builder-cell-row');
     await formLabel.click({timeout:15000});
     await page.waitForFunction(expected=>
       String(document.querySelector('#esc-vb-edit-title')?.value||'').trim()===expected,
       record.formLabel,{timeout:25000});
     assert.equal(await page.locator('#esc-vb-edit-row').inputValue(),record.formRow+':label',
       'Nested form selected wrong native ESC row');
     record.formDirectEditable='PASS';
   }

   if(target.slug==='dat-hang-thanh-cong'){
     // Preview must render a synthetic success state without real order data.
     record.previewDemoOrder=await frame.locator('main#main-content').innerText();
     assert.ok(record.previewDemoOrder.includes('DEMO-001'),
       'Checkout success preview must use a non-real demonstration order');
     delete record.previewDemoOrder;
   }
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
  page.off('response',monitor);
  page.off('framenavigated',navigated);
  page.off('requestfailed',requestFailed);
  report.pages.push(record);
 }
 report.status=report.pages.every(r=>r.status==='PASS')?'PASS':'FAIL';
 if(report.status!=='PASS')process.exitCode=1;
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,1000));process.exitCode=1;}
finally{
 await writeFile('artifacts/commerce-semantic-live-qa/report.json',JSON.stringify(report,null,2)+'\n');
 console.log('COMMERCE_SEMANTIC_LIVE_QA='+JSON.stringify(report));await browser.close();
}
