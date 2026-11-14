import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const targets=[
 {id:83272,slug:'chinh-sach-doi-tra-hang'},
 {id:83273,slug:'thong-bao'},
 {id:83274,slug:'huong-dan-mua-hang-o-xa'},
 {id:83275,slug:'huong-dan-mua-hang-tai-nha'},
 {id:83285,slug:'thoi-gian-ban-hang'},
];
const report={status:'STARTED',pages:[],writes:0,errors:[]};
await mkdir('artifacts/information-builder-qa',{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const ctx=await browser.newContext({viewport:{width:1366,height:900}});
 const page=await ctx.newPage();
 assert.ok(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,'WordPress QA credentials missing');
 let authed=false;
 for(let attempt=0;attempt<3&&!authed;attempt++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await page.locator('#wp-submit').click();
   await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
  }
  authed=!page.url().includes('wp-login.php')&&(await page.locator('#wpadminbar').count())>0;
  if(!authed)await page.waitForTimeout(1500*(attempt+1));
 }
 assert.ok(authed,'WordPress login failed');
 for(const target of targets){
  const record={...target,previewStatus:0,editorControls:[],selectable:false,errors:[]};
  try{
   const response=await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+target.id,
     {waitUntil:'domcontentloaded',timeout:45000});
   record.previewStatus=response?.status()||0;
   assert.equal(record.previewStatus,200);
   const frame=page.frameLocator('iframe#esc-vb-frame');
   const editorContent=frame.locator('.marine-information-content [data-esc-builder-html-part]').first();
   await editorContent.waitFor({state:'visible',timeout:45000});
   record.originalText=(await editorContent.innerText()).trim().slice(0,180);
   record.exposedEditSource=await editorContent.getAttribute('data-esc-builder-html-part');
   const textTarget=editorContent.locator('h1,h2,h3,h4,p,li').filter({visible:true}).first();
   record.clickedText=await textTarget.count()?await textTarget.innerText():await editorContent.innerText();
   if(await textTarget.count()) await textTarget.click({timeout:20000,position:{x:15,y:12}});
   else await editorContent.click({timeout:20000,position:{x:15,y:12}});
   const ui=await page.locator('body').innerText();
   record.editorControls=await page.locator('input,textarea,[contenteditable="true"]')
     .evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>({id:e.id,tag:e.tagName,name:e.getAttribute('name')||'',placeholder:e.getAttribute('placeholder')||''})).slice(-35));
   await page.waitForFunction(()=>String(document.querySelector('#esc-vb-edit-title')?.value||'').trim().length>0,null,{timeout:25000});
   record.selectable=await page.locator('#esc-vb-edit-title').isVisible().catch(()=>false);
   record.editorValue=record.selectable?await page.locator('#esc-vb-edit-title').inputValue():null;
   // Fail if the editor chose a neighboring token: opening an input alone
   // is insufficient evidence that Visual Builder edits the clicked text.
   const normalizeText=value=>String(value||'').replace(/\s+/g,' ').trim();
   record.matchClickedText=normalizeText(record.editorValue)===normalizeText(record.clickedText);
   assert.ok(record.matchClickedText,
     'Wrong WordPress text source selected: click target differs from editor value');
   assert.ok(record.editorValue?.trim(),'Editor field did not bind to WordPress source text');
   record.feedback=(await page.locator('#esc-vb-edit-feedback').innerText().catch(()=>'' )).slice(0,200);
   assert.ok(record.selectable,'Native WordPress Editor selection did not open for '+target.slug);
   if(target.slug==='thoi-gian-ban-hang'){
    record.tokenSelections=[];
    const scripts=await page.locator('script').allTextContents();
    const nonce=scripts.map(s=>s.match(/const nonce\s*=\s*["']([^"']+)["']/)?.[1]).find(Boolean);
    const ticket=await page.evaluate(()=>window.escVBGetTicket?.());
    assert.ok(nonce&&ticket,'Missing native WordPress authorization for read-only manifest');
    const resp=await ctx.request.post(WP+'/wp-json/esc-builder/v1/editable-page-text',
      {headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json'},
       data:{page_id:target.id,ticket},timeout:30000,failOnStatusCode:false});
    assert.equal(resp.status(),200,'Page source text manifest not authorized');
    const sourceManifest=await resp.json();
    record.sourceManifestCount=sourceManifest.rows?.length||0;

    const tokens=editorContent.locator('p').filter({visible:true});
    for(let idx=0;idx<Math.min(await tokens.count(),5);idx++){
     const node=tokens.nth(idx);
     const expected=(await node.innerText()).replace(/\s+/g,' ').trim();
     await node.click({timeout:18000,position:{x:15,y:12}});
     let value='';
     try{
      await page.waitForFunction(text=>
        String(document.querySelector('#esc-vb-edit-title')?.value||'').replace(/\s+/g,' ').trim()===text,
        expected,{timeout:12000});
      value=await page.locator('#esc-vb-edit-title').inputValue();
     }catch{
      value=await page.locator('#esc-vb-edit-title').inputValue();
     }
     const selectedRow=await page.locator('#esc-vb-edit-row').inputValue();
     const matched=value.replace(/\s+/g,' ').trim()===expected;
     const nativeRow=sourceManifest.rows?.find(r=>r.id===selectedRow);
     record.tokenSelections.push({idx,expected,value,selectedRow,matched,
       nativeTitle:nativeRow?.title||null,
       nativeMatches:nativeRow?.title?.replace(/\s+/g,' ').trim()===expected});
     assert.ok(matched,'Page Editor picked a different token at index '+idx);
    }
   }
  }catch(e){record.errors.push(String(e).slice(0,500));}
  report.pages.push(record);
 }
 report.status=report.pages.every(p=>!p.errors.length)?'PASS':'FAIL';
 if(report.status!=='PASS')process.exitCode=1;
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,1200));process.exitCode=1;}
finally{
 await writeFile('artifacts/information-builder-qa/report.json',JSON.stringify(report,null,2)+'\n');
 console.log('INFORMATION_BUILDER_QA='+JSON.stringify(report));await browser.close();
}
