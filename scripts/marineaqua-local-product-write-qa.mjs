import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP='https://admin.marine-aqua.io.vn';
const DIR='artifacts/local-product-write-qa';
const TABLE='home_04';
const PEER='home_05';
const PAGE_ID=82454;
const report={status:'STARTED',table:TABLE,source:'Product',checks:[],writes:0,cleanupRemaining:0,errors:[]};
const browser=await chromium.launch({headless:true});
await mkdir(DIR,{recursive:true});
let context,page,call,schema,original=[],candidate='';
async function authenticatedLogin(){
  page=await context.newPage();
  const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  assert.ok(username&&password,'Missing WP QA credentials');
  for(let attempt=0;attempt<3;attempt++){
    await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
    if(await page.locator('#user_login').isVisible().catch(()=>false)){
      await page.locator('#user_login').fill(username);
      await page.locator('#user_pass').fill(password);
      await page.locator('#wp-submit').click({timeout:25000});
      await page.waitForLoadState('domcontentloaded',{timeout:12000}).catch(()=>{});
      if(!page.url().includes('wp-login.php')&&await page.locator('#wpadminbar').count()>0)return;
    }
    if(attempt<2)await page.waitForTimeout(2200*(attempt+1));
  }
  throw Error('WP admin login unavailable');
}
async function loadSchema(id=TABLE){
 const {status,data}=await call('esc-builder/v1/item-schema',{table_id:id});
 assert.equal(status,200,'Schema '+id+': '+JSON.stringify(data).slice(0,260));
 assert.equal(data.table_id,id);
 assert.ok(Array.isArray(data.items)&&Array.isArray(data.row_hashes));
 return data;
}
async function save(path,body){
 const {status,data}=await call(path,body);
 assert.equal(status,200,path+' '+JSON.stringify(data).slice(0,260));
 assert.equal(data.saved,true,path+' not saved');
 report.writes++;
 return data;
}
async function restItems(){
 const response=await context.request.get(WP+'/wp-json/tablepress/v1/table/'+TABLE,{timeout:30000,failOnStatusCode:false});
 assert.equal(response.status(),200,'TablePress REST status');
 const data=await response.json();
 assert.ok(Array.isArray(data.items),'TablePress REST items missing');
 return data.items.map(row=>String(row.key||''));
}
const keys=x=>x.items.map(row=>String(row.key||''));
async function checkPersisted(expected,name){
 const fresh=await loadSchema();
 assert.deepEqual(keys(fresh),expected,name+' schema readback');
 assert.deepEqual(await restItems(),expected,name+' native REST readback');
 report.checks.push(name+':REST_PASS');
 return fresh;
}
async function cleanup(){
 if(!call||!original.length)return;
 try{
  let fresh=await loadSchema();
  let current=keys(fresh);
  if(candidate&&current.includes(candidate)){
    const index=current.indexOf(candidate);
    await save('esc-builder/v1/delete-item',{
      table_id:TABLE,row:index,expected_version:fresh.version,
      expected_row_hash:fresh.row_hashes[index]});
    fresh=await loadSchema();current=keys(fresh);
  }
  if(current.length===original.length && new Set(current).size===current.length){
    for(let i=0;i<original.length;i++){
      if(current[i]===original[i])continue;
      const target=current.indexOf(original[i]);
      if(target<0)break;
      await save('esc-builder/v1/swap-items',{
       table_id:TABLE,from_row:i,to_row:target,expected_version:fresh.version,
       expected_row_hashes:[fresh.row_hashes[i],fresh.row_hashes[target]]});
      fresh=await loadSchema();current=keys(fresh);
    }
  }
  report.cleanupRemaining=JSON.stringify(keys(fresh))===JSON.stringify(original)?0:1;
  if(report.cleanupRemaining===0){
   assert.deepEqual(await restItems(),original,'REST cleanup readback');
   report.checks.push('RESTORE_ORIGINAL_PASS');
  }
 }catch(e){report.cleanupRemaining=1;report.errors.push('CLEANUP: '+String(e.stack||e).slice(0,600));}
}
try{
 context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 await authenticatedLogin();
 const response=await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+PAGE_ID,
  {waitUntil:'domcontentloaded',timeout:45000});
 assert.equal(response?.status(),200,'Builder WP status');
 const scripts=await page.locator('script').allTextContents();
 const nonce=scripts.map(s=>s.match(/const nonce\s*=\s*["']([^"']+)["']/)?.[1]).find(Boolean);
 assert.ok(nonce,'Missing WP REST nonce');
 assert.equal(await page.evaluate(()=>typeof window.escVBGetTicket),'function','Builder ticket unavailable');
 call=async(path,body)=>{
   const ticket=await page.evaluate(()=>window.escVBGetTicket(false));
   const response=await context.request.post(WP+'/wp-json/'+path,{timeout:30000,failOnStatusCode:false,
    headers:{'Content-Type':'application/json','X-WP-Nonce':nonce},
    data:{page_id:PAGE_ID,...body,ticket}});
   return {status:response.status(),data:await response.json().catch(()=>({}))};
 };
 schema=await loadSchema();
 assert.equal(schema.source_api,'Product');
 original=keys(schema);
 assert.ok(original.length>=2&&original.length<40,'Need 2..39 original refs');
 assert.deepEqual(await restItems(),original,'Initial native REST baseline');
 report.checks.push('BASELINE_PASS');
 const peer=await loadSchema(PEER);
 candidate=keys(peer).find(id=>/^\d+$/.test(id)&&!original.includes(id))||'';
 assert.ok(candidate,'No distinct published Product available from other source');
 const denied=await call('esc-builder/v1/insert-item',{
  table_id:TABLE,mode:'new',after_row:original.length-1,
  expected_version:schema.version,values:{key:candidate,title:'FORBIDDEN_NATIVE_EDIT'}});
 assert.ok(denied.status>=400,'Native Product fields unexpectedly writable');
 assert.deepEqual(keys(await loadSchema()),original,'Denied Product mutation modified ESC Table');
 report.checks.push('NATIVE_ATTRIBUTE_READONLY_PASS');
 const inserted=await save('esc-builder/v1/insert-item',{
  table_id:TABLE,mode:'new',after_row:original.length-1,
  expected_version:schema.version,values:{key:candidate}});
 assert.equal(inserted.row,original.length);
 schema=await checkPersisted([...original,candidate],'ADD');
 await save('esc-builder/v1/swap-items',{
  table_id:TABLE,from_row:0,to_row:original.length,
  expected_version:schema.version,
  expected_row_hashes:[schema.row_hashes[0],schema.row_hashes[original.length]]});
 schema=await checkPersisted([candidate,...original.slice(1),original[0]],'SWAP');
 await save('esc-builder/v1/swap-items',{
  table_id:TABLE,from_row:0,to_row:original.length,
  expected_version:schema.version,
  expected_row_hashes:[schema.row_hashes[0],schema.row_hashes[original.length]]});
 schema=await checkPersisted([...original,candidate],'SWAP_REVERSE');
 await save('esc-builder/v1/delete-item',{
  table_id:TABLE,row:original.length,expected_version:schema.version,
  expected_row_hash:schema.row_hashes[original.length]});
 schema=await checkPersisted(original,'DELETE_AND_RESTORE');
 report.status='PASS';
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,1800));process.exitCode=1;}
finally{
 await cleanup();
 if(report.cleanupRemaining){report.status='FAIL';process.exitCode=1;}
 await writeFile(DIR+'/result.json',JSON.stringify(report,null,2)+'\n');
 console.log('LOCAL_PRODUCT_WRITE_QA='+JSON.stringify(report));
 await browser.close();
}
