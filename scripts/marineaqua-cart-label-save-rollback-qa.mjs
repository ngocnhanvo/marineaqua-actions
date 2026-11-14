import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

// Scoped, real save/readback/restore QA; never writes Product/Order/Account data.
// A missing cleanup is a HARD FAIL and is recorded for a human to recover.
const WP='https://admin.marine-aqua.io.vn';
const TARGET={pageId:83449,table:'cart_semantics_vi',key:'cart_select'};
const report={status:'STARTED',target:TARGET,phase:'start',writes:0,cleanup_remaining:null,errors:[]};
const labelUrl=WP+'/wp-json/tablepress/v1/table/'+TARGET.table;
const output='artifacts/cart-label-save-rollback';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
let ctx,page,snapshot,original,index,changed,nonce,ticket;
const extractItem=async()=>{
 const res=await ctx.request.get(labelUrl,{timeout:30000,failOnStatusCode:false});
 assert.equal(res.status(),200,'Source TablePress REST unavailable');
 const data=await res.json();
 assert.ok(Array.isArray(data?.items) && data.items.length===18,'Unexpected native cart label schema');
 return data;
};
const checkSame=(a,b)=>JSON.stringify(a?.items)===JSON.stringify(b?.items)
 && JSON.stringify(a?.fields)===JSON.stringify(b?.fields);
const writeRestore=async()=>{
 const fresh=await extractItem();
 const value=fresh.items[index]?.label;
 if(value===original)return {restored:true,mode:'already-original'};
 if(value!==changed)throw Error('CLEANUP_CONFLICT: current value belongs to another editor');
 if(!nonce||!ticket||!page)throw Error('CLEANUP_NO_AUTHENTICATED_CREDENTIALS');
 const headers={'X-WP-Nonce':nonce,'Content-Type':'application/json'};
 const read=await ctx.request.post(WP+'/wp-json/esc-builder/v1/editable-text',{
  headers,data:{page_id:TARGET.pageId,ticket,table_id:TARGET.table},
  timeout:30000,failOnStatusCode:false});
 assert.equal(read.status(),200,'Cleanup source read failed');
 const source=await read.json();
 const row=source.rows?.find(r=>r.row===index && r.field==='label');
 assert.ok(row && row.title===changed && /^[a-f0-9]{64}$/.test(source.version),'Cleanup source no longer matches marker');
 const saved=await ctx.request.post(WP+'/wp-json/esc-builder/v1/save-text',{
  headers,
  data:{page_id:TARGET.pageId,ticket,source_type:'esc_table',table_id:TARGET.table,
   row:index,field:'label',title:original,original_hash:row.hash,
   rendered_version:source.version,expected_version:source.version},
  timeout:30000,failOnStatusCode:false});
 assert.equal(saved.status(),200,'CLEANUP_SAVE_HTTP_FAILED');
 const result=await saved.json();
 assert.ok(result.saved===true && result.table_id===TARGET.table,'CLEANUP_SAVE_NOT_CONFIRMED');
 report.writes++;
 return {restored:true,mode:'authenticated-REST-fallback'};
};
try{
 assert.ok(process.env.WP_ADMIN_USERNAME && process.env.WP_ADMIN_PASSWORD,'Missing WP QA credentials');
 ctx=await browser.newContext({viewport:{width:1366,height:900}});
 page=await ctx.newPage();
 let loggedIn=false;
 for(let attempt=0;attempt<3&&!loggedIn;attempt++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').isVisible().catch(()=>false)){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await page.locator('#wp-submit').click({timeout:25000});
   await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
  }
  loggedIn=!page.url().includes('wp-login.php') && await page.locator('#wpadminbar').count()>0;
  if(!loggedIn)await page.waitForTimeout((attempt+1)*1500);
 }
 assert.ok(loggedIn,'WP authentication failed');
 snapshot=await extractItem();
 index=snapshot.items.findIndex(r=>r.key===TARGET.key);
 assert.ok(index>=0 && Number.isInteger(index),'Required non-sensitive label not found');
 original=String(snapshot.items[index].label||'');
 assert.ok(original.length>0&&original.length<120&&!original.includes('[QA-'),'Unsafe original label');
 changed=original+' [QA-'+String(process.env.GITHUB_RUN_ID||'local').replace(/[^0-9]/g,'').slice(0,14)+']';
 report.phase='select';
 const open=await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+TARGET.pageId,
  {waitUntil:'domcontentloaded',timeout:45000});
 assert.equal(open?.status(),200);
 ticket=await page.evaluate(()=>window.escVBGetTicket?.());
 assert.ok(typeof ticket==='string'&&ticket.length>20,'Page ticket unavailable');
 const scripts=await page.locator('script').allTextContents();
 nonce=scripts.map(t=>t.match(/const nonce\\s*=\\s*["']([^"']+)["']/)?.[1]).find(Boolean);
 assert.ok(nonce,'REST nonce unavailable');
 const frame=page.frameLocator('#esc-vb-frame');
 const cell=frame.locator('[data-esc-semantic-inspector][data-esc-source-table="'+TARGET.table+'"] [data-esc-builder-cell-row="'+index+'"][data-esc-builder-cell-field="label"]');
 await cell.waitFor({state:'visible',timeout:60000});
 assert.equal((await cell.innerText()).trim(),original,'Preview has a different source value');
 await cell.click({timeout:20000});
 const input=page.locator('#esc-vb-edit-title');
 await input.waitFor({state:'visible',timeout:20000});
 await page.waitForFunction(expected=>document.querySelector('#esc-vb-edit-title')?.value===expected,original,{timeout:25000});
 report.sourceRow=index;
 report.phase='save-temporary';
 await input.fill(changed);
 const save=page.locator('#esc-vb-edit-save');
 await save.waitFor({state:'visible',timeout:15000});
 await assert.doesNotReject(save.click({timeout:25000}));
 await page.waitForFunction(()=>String(document.querySelector('#esc-vb-edit-feedback')?.textContent||'').includes('Đã lưu WordPress'),null,{timeout:30000});
 report.writes++;
 const after=await extractItem();
 const changedCount=after.items.reduce((n,row,i)=>n+Number(JSON.stringify(row)!==JSON.stringify(snapshot.items[i])),0);
 assert.equal(changedCount,1,'CMS save mutated more than the selected label');
 assert.equal(after.items[index]?.label,changed,'CMS write/readback does not match selected label');
 report.changed_cells=changedCount;
 report.phase='restore-ui';
 await input.fill(original);
 await save.click({timeout:25000});
 await page.waitForFunction(()=>String(document.querySelector('#esc-vb-edit-feedback')?.textContent||'').includes('Đã lưu WordPress'),null,{timeout:30000});
 report.writes++;
 report.restored_with='Visual Builder Save';
 report.phase='final-readback';
}catch(e){
 report.errors.push(String(e.stack||e).slice(0,900));
}finally{
 if(snapshot&&index>=0&&original!==undefined){
  try{
   const current=await extractItem();
   if(current.items[index]?.label!==original){
    const recovery=await writeRestore();
    report.restored_with=recovery.mode;
   }
   const final=await extractItem();
   report.cleanup_remaining=checkSame(snapshot,final)?0:1;
   if(report.cleanup_remaining!==0)report.errors.push('CLEANUP_FAILED: native ESC Table differs from snapshot');
  }catch(e){report.cleanup_remaining=1;report.errors.push('CLEANUP_FAILED: '+String(e).slice(0,550));}
 }else if(!report.errors.length)report.errors.push('No initial CMS snapshot');
 report.status=report.errors.length===0&&report.writes>=2&&report.changed_cells===1&&report.cleanup_remaining===0?'PASS':'FAIL';
 report.phase='completed';
 process.exitCode=report.status==='PASS'?0:1;
 await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\\n');
 console.log('CART_SEMANTIC_SAVE_ROLLBACK='+JSON.stringify(report));
 await browser.close();
}
