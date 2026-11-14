import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const TABLE='contact_semantics_vi';
const PAGE_ID=82580;
const DIR='artifacts/contact-semantic-live-qa';
const report={status:'STARTED',table:TABLE,pageId:PAGE_ID,writes:0,cleanupRemaining:0,checks:[],errors:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
let page,context,rest,original,fieldRow,modified=false,temporary='';
async function read(){
 const r=await rest('esc-builder/v1/editable-text',{table_id:TABLE});
 assert.equal(r.status,200,'Builder source read '+JSON.stringify(r.data).slice(0,250));
 return r.data;
}
async function readNative(){
 const r=await context.request.get(WP+'/wp-json/tablepress/v1/table/'+TABLE,{timeout:30000,failOnStatusCode:false});
 assert.equal(r.status(),200);
 return r.json();
}
async function save(source,value){
 const r=await rest('esc-builder/v1/save-text',{
  table_id:TABLE,source_type:'esc_table',
  row:source.row,field:source.field,title:value,
  original_hash:source.hash,
  rendered_version:source.version,expected_version:source.version,
 });
 assert.equal(r.status,200,'Builder Save: '+JSON.stringify(r.data).slice(0,250));
 assert.equal(r.data.saved,true,'Save did not persist');
 report.writes++;
 return r.data;
}
async function restore(){
 if(!modified||!original)return;
 try{
  const current=await read();
  const native=await readNative();
  if(String(native.items[fieldRow.row]?.label||'')!==original){
   const row=current.rows.find(x=>x.row===fieldRow.row&&x.field==='label');
   assert.ok(row,'Cleanup source row missing');
   await save({...row,version:current.version},original);
  }
  const finalNative=await readNative();
  assert.equal(String(finalNative.items[fieldRow.row]?.label||''),original);
  const verified=await read();
  assert.equal(verified.rows.find(x=>x.row===fieldRow.row&&x.field==='label')?.title,original);
  modified=false;report.checks.push('CLEANUP_RESTORED_PASS');
 }catch(e){report.cleanupRemaining=1;report.errors.push('CLEANUP '+String(e.stack||e).slice(0,800));}
}
try{
 context=await browser.newContext({viewport:{width:1440,height:900}});
 page=await context.newPage();
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 assert.ok(username&&password);
 let authed=false;
 for(let k=0;k<3&&!authed;k++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').isVisible().catch(()=>false)){
   await page.locator('#user_login').fill(username);
   await page.locator('#user_pass').fill(password);
   await page.locator('#wp-submit').click();
   await page.waitForLoadState('domcontentloaded',{timeout:12000}).catch(()=>{});
   authed=!page.url().includes('wp-login.php') && await page.locator('#wpadminbar').count()>0;
  }
  if(!authed&&k<2)await page.waitForTimeout((k+1)*2000);
 }
 assert.ok(authed,'WP admin unavailable');
 await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+PAGE_ID,
  {waitUntil:'domcontentloaded',timeout:45000});
 const scripts=await page.locator('script').allTextContents();
 const nonce=scripts.map(s=>s.match(/const nonce\s*=\s*["']([^"']+)["']/)?.[1]).find(Boolean);
 assert.ok(nonce,'Builder WP nonce missing');
 assert.equal(await page.evaluate(()=>typeof window.escVBGetTicket),'function','Missing Builder session ticket');
 rest=async(endpoint,body)=>{
  const ticket=await page.evaluate(()=>window.escVBGetTicket(false));
  const r=await context.request.post(WP+'/wp-json/'+endpoint,{
   data:{page_id:PAGE_ID,...body,ticket},
   headers:{'Content-Type':'application/json','X-WP-Nonce':nonce},
   timeout:30000,failOnStatusCode:false,
  });
  return {status:r.status(),data:await r.json().catch(()=>({}))};
 };
 const baseline=await read();
 assert.equal(baseline.table_id,TABLE);
 assert.ok(baseline.rows.some(r=>r.field==='label')&&baseline.rows.some(r=>r.field==='href'),
   'Semantic label and href not editable');
 assert.ok(!baseline.rows.some(r=>r.field==='key'),'Semantic technical key is editable');
 report.checks.push('SCHEMA_KEY_READONLY_PASS');
 const native=await readNative();
 const index=native.items.findIndex(row=>row.key==='details_description');
 assert.ok(index>=0,'No target semantic row');
 fieldRow=baseline.rows.find(row=>row.row===index&&row.field==='label');
 assert.ok(fieldRow?.editable,'Target label is not editable');
 original=String(native.items[index].label);
 assert.ok(original.length>5&&original===fieldRow.title);
 report.checks.push('BASELINE_PASS');
 const denied=await rest('esc-builder/v1/save-text',{
  table_id:TABLE,source_type:'esc_table',row:index,field:'key',
  title:'forbidden_key_change',original_hash:fieldRow.hash,
  rendered_version:baseline.version,expected_version:baseline.version,
 });
 assert.ok(denied.status>=400,'Native key write unexpectedly accepted');
 assert.equal((await readNative()).items[index].key,'details_description');
 report.checks.push('TECHNICAL_KEY_WRITE_REJECTED_PASS');
 temporary=original+' (kiểm thử tự động)';
 await save({...fieldRow,version:baseline.version},temporary);
 modified=true;
 assert.equal(String((await readNative()).items[index].label),temporary,'Native REST readback mismatch');
 assert.equal((await read()).rows.find(row=>row.row===index&&row.field==='label')?.title,temporary,'Builder REST readback mismatch');
 report.checks.push('SAVE_REST_READBACK_PASS');
 await page.reload({waitUntil:'domcontentloaded',timeout:45000});
 assert.equal(await page.evaluate(()=>typeof window.escVBGetTicket),'function','Builder reload lost session');
 assert.equal((await read()).rows.find(row=>row.row===index&&row.field==='label')?.title,temporary,
  'Builder reload readback mismatch');
 report.checks.push('BUILDER_RELOAD_READBACK_PASS');
 report.status='PASS';
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,1500));process.exitCode=1;}
finally{
 await restore();
 if(report.cleanupRemaining){report.status='FAIL';process.exitCode=1;}
 await writeFile(DIR+'/result.json',JSON.stringify(report,null,2)+'\n');
 console.log('CONTACT_SEMANTIC_LIVE_QA='+JSON.stringify(report));
 await browser.close();
}
