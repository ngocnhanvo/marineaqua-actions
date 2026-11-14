import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
// Recovery of ONE known workflow marker only. No new QA mutation.
const WP='https://admin.marine-aqua.io.vn';
const PAGE_ID=83285, RUN_ID='43558167264';
const MARK=' [QA'+RUN_ID+']';
const report={page_id:PAGE_ID,original_run:RUN_ID,status:'STARTED',writes:0,cleanup_remaining:null,errors:[]};
await mkdir('artifacts/page-editor-recovery',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext();
 const page=await ctx.newPage();
 let authed=false;
 for(let a=0;a<3&&!authed;a++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').isVisible().catch(()=>false)){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await page.locator('#wp-submit').click({timeout:25000});
   await page.waitForLoadState('domcontentloaded',{timeout:18000}).catch(()=>{});
  }
  authed=!page.url().includes('wp-login.php')&&(await page.locator('#wpadminbar').count())>0;
  if(!authed)await page.waitForTimeout(1500*(a+1));
 }
 assert.ok(authed,'WP authentication required');
 await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+PAGE_ID,
  {waitUntil:'domcontentloaded',timeout:45000});
 const ticket=await page.evaluate(()=>window.escVBGetTicket?.());
 assert.ok(typeof ticket==='string'&&ticket.length>20,'Missing valid Page ticket');
 const scripts=await page.locator('script').allTextContents();
 const nonce=scripts.map(t=>t.match(/const nonce\s*=\s*["']([^"']+)["']/)?.[1]).find(Boolean);
 assert.ok(nonce,'Missing REST nonce');
 const headers={'X-WP-Nonce':nonce,'Content-Type':'application/json'};
 const post=async path=>ctx.request.post(WP+'/wp-json/esc-builder/v1/'+path,{headers,data:{page_id:PAGE_ID,ticket},timeout:30000,failOnStatusCode:false});
 const current=async()=>{
  const r=await ctx.request.get(WP+'/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit',
   {headers,timeout:30000,failOnStatusCode:false});
  assert.equal(r.status(),200,'Unable to read WordPress Page');
  return String((await r.json()).content?.raw||'');
 };
 const before=await current();
 const n=before.split(MARK).length-1;
 report.marker_count=n;
 assert.ok(n===0||n===1,'QA marker is duplicated, refusing ambiguous recovery');
 if(n===0){report.cleanup_remaining=0;report.status='PASS';}
 else{
  const read=await post('editable-page-text');
  assert.equal(read.status(),200,'No Page source read permission');
  const data=await read.json();
  const candidates=data.rows?.filter(r=>
    r.editable && r.part===0 && typeof r.full_text==='string' && r.full_text.includes(MARK));
  if(candidates?.length===0){
   // Existing Page tokenizer deliberately excludes text containing bracketed
   // [QA...] markers as possible shortcodes. A temporary QA marker therefore
   // cannot be selected through save-page-text. Restore ONLY the exact known
   // suffix through authenticated native WordPress Page REST.
   const full=await ctx.request.get(WP+'/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit',
     {headers,timeout:30000,failOnStatusCode:false});
   assert.equal(full.status(),200,'Cannot recheck Page identity');
   const record=await full.json();
   assert.equal(Number(record.id),PAGE_ID,'Wrong Page ID');
   assert.equal(record.slug,'thoi-gian-ban-hang','Wrong Page slug');
   assert.equal(String(record.content?.raw||''),before,'Concurrent Page mutation; refusing overwrite');
    assert.ok(!before.includes('[table id=') && !before.includes('[tablepress id='),'Do not rewrite Page with ESC shortcodes');
   const expected=before.replace(MARK,'');
   assert.ok(expected.length>10 && expected!==before,'No exact marker to remove');
   const save=await ctx.request.post(WP+'/wp-json/wp/v2/pages/'+PAGE_ID,
     {headers,data:{content:expected},timeout:30000,failOnStatusCode:false});
   report.save_status=save.status();
   const saved=await save.json().catch(()=>({}));
   assert.ok(save.status()===200 && Number(saved.id)===PAGE_ID,
     'Native WordPress REST recovery denied: '+String(saved.code||'unknown'));
   report.writes++;
   const after=await current();
   report.cleanup_remaining=after===expected?0:1;
   assert.equal(after,expected,'Restored Page differs in other HTML bytes');
   report.restored_with='native-wp-page-rest-exact-marker';
   report.status='PASS';
  }else{
   assert.equal(candidates?.length,1,'Source QA token ambiguous');

  const row=candidates[0];
  // The failed UI test may have edited a substring of a larger HTML token.
  // Use WordPress Page's native partial replacement to preserve every other
  // original byte, including HTML entities and whitespace around the marker.
  const full=row.full_text;
  const at=full.indexOf(MARK);
  assert.equal(full.lastIndexOf(MARK),at,'Multiple markers inside same source token');
  assert.ok(at>0,'Marker cannot start a text token');
  const prefixCodepoints=[...full.slice(0,at)];
  const last=prefixCodepoints.at(-1);
  assert.ok(last && !/[<>&\r\n]/.test(last),'Cannot find safe original neighboring character');
  const prefix=full.slice(0,at-last.length);
  const suffix=full.slice(at+MARK.length);
  const res=await ctx.request.post(WP+'/wp-json/esc-builder/v1/save-page-text',
   {headers,data:{page_id:PAGE_ID,ticket,part:row.part,offset:row.offset,title:last,
    selection_prefix:prefix,selection_text:last+MARK,selection_suffix:suffix,
    original_hash:row.hash,expected_version:data.version},
    timeout:30000,failOnStatusCode:false});
  report.save_status=res.status();
  const payload=await res.json().catch(()=>({}));
  assert.ok(res.status()===200 && payload.saved===true,'REST recovery denied: '+(payload.code||'unknown'));
  report.writes++;
  const after=await current();
  assert.equal(after,before.replace(MARK,''),'WordPress recovery changed unrelated HTML');
  report.cleanup_remaining=after.includes(MARK)?1:0;
  assert.equal(report.cleanup_remaining,0,'Marker remains after recovery');
  report.status='PASS';
  }
 }
}catch(e){
 report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,900));
}finally{
 if(report.cleanup_remaining!==0)report.status='FAIL';
 process.exitCode=report.status==='PASS'?0:1;
 await writeFile('artifacts/page-editor-recovery/report.json',JSON.stringify(report,null,2)+'\n');
 console.log('PAGE_EDITOR_EMERGENCY_RESTORE='+JSON.stringify(report));
 await browser.close();
}
