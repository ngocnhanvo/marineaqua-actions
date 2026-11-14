import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const PAGE_ID=83285;
const OUT='artifacts/information-save-rollback';
const report={status:'STARTED',page_id:PAGE_ID,writes:0,cleanup_remaining:null,errors:[]};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
let ctx,page,nonce,ticket,original,marker,selected;
const route=(name)=>WP+'/wp-json/esc-builder/v1/'+name;
const headers=()=>({'X-WP-Nonce':nonce,'Content-Type':'application/json'});
async function current(){
 const res=await ctx.request.get(WP+'/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit',
  {headers:{'X-WP-Nonce':nonce},timeout:30000,failOnStatusCode:false});
 assert.equal(res.status(),200,'WordPress Page snapshot unavailable');
 const data=await res.json();
 assert.equal(Number(data.id),PAGE_ID);
 return String(data.content?.raw||'');
}
async function sourceRead(){
 const res=await ctx.request.post(route('editable-page-text'),
  {headers:headers(),data:{page_id:PAGE_ID,ticket},timeout:30000,failOnStatusCode:false});
 assert.equal(res.status(),200,'Page Editor source read forbidden');
 const data=await res.json();
 assert.equal(data.source,'page_html');
 return data;
}
async function restoreIfRequired(){
 const latest=await current();
 if(latest===original)return 'already-restored';
 if(!selected||!marker||latest.split(marker).length!==2)
  throw Error('CLEANUP_CONFLICT: marker missing or duplicated');
 const expected=original.replace(selected.title,selected.title+marker);
 if(latest!==expected)
  throw Error('CLEANUP_CONFLICT: Page changed beyond exact QA token');
 const check=await ctx.request.get(WP+'/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit',
  {headers:headers(),timeout:30000,failOnStatusCode:false});
 assert.equal(check.status(),200,'Native Page cannot be rechecked');
 const entry=await check.json();
 assert.equal(Number(entry.id),PAGE_ID);
 assert.equal(entry.slug,'thoi-gian-ban-hang');
 assert.equal(String(entry.content?.raw||''),latest,'Concurrent Page edit');
 const save=await ctx.request.post(WP+'/wp-json/wp/v2/pages/'+PAGE_ID,
  {headers:headers(),data:{content:original},timeout:30000,failOnStatusCode:false});
 assert.equal(save.status(),200,'CLEANUP_FAILED: native WordPress Page REST');
 assert.equal(Number((await save.json()).id),PAGE_ID,'Unexpected restored Page ID');
 report.writes++;
 assert.equal(await current(),original,'CLEANUP_FAILED: restored Page differs');
 return 'authenticated-native-page-rest';
}
try{
 assert.ok(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,'WordPress QA credentials missing');
 ctx=await browser.newContext({viewport:{width:1366,height:900}});
 page=await ctx.newPage();
 let authed=false;
 for(let attempt=0;attempt<3&&!authed;attempt++){
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  if(await page.locator('#user_login').isVisible().catch(()=>false)){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   await page.locator('#wp-submit').click({timeout:25000});
   await page.waitForLoadState('domcontentloaded',{timeout:16000}).catch(()=>{});
  }
  authed=!page.url().includes('wp-login.php')&&(await page.locator('#wpadminbar').count())>0;
  if(!authed)await page.waitForTimeout((attempt+1)*1800);
 }
 assert.ok(authed,'WordPress login failed');
 const resp=await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+PAGE_ID,{waitUntil:'domcontentloaded',timeout:45000});
 assert.equal(resp?.status(),200);
 ticket=await page.evaluate(()=>window.escVBGetTicket?.());
 assert.ok(typeof ticket==='string'&&ticket.length>20,'Page-scoped ticket missing');
 const scripts=await page.locator('script').allTextContents();
 nonce=scripts.map(s=>s.match(/const nonce\s*=\s*["']([^"']+)["']/)?.[1]).find(Boolean);
 assert.ok(nonce,'WordPress REST nonce missing');
 original=await current();
 assert.ok(original.length>10,'WordPress Page has no existing editor content');
 const inspector=page.frameLocator('#esc-vb-frame').locator('.marine-information-content [data-esc-builder-html-part]').first();
 await inspector.waitFor({state:'visible',timeout:50000});
 const data=await sourceRead();
 const input=page.locator('#esc-vb-edit-title');
 // Only use the exact second native paragraph verified by the independent
 // read-only Page DOM ↔ parent editor ↔ REST manifest run 43560892567.
 const target=inspector.locator('p').filter({visible:true}).nth(1);
 const display=(await target.innerText()).replace(/\s+/g,' ').trim();
 assert.equal(display,'– Bắt đầu từ 8h30 sáng','Target WordPress text changed');
 const native=data.rows?.find(row=>row.title===display&&row.editable);
 assert.ok(native && native.id==='0:56','Native token identity changed');
 assert.equal(original.split(display).length-1,1,'Target no longer unique in raw WordPress HTML');
 await target.click({timeout:20000,position:{x:15,y:12}});
 await page.waitForFunction(expected=>
   String(document.querySelector('#esc-vb-edit-title')?.value||'').replace(/\s+/g,' ').trim()===expected
   && document.querySelector('#esc-vb-edit-row')?.value==='0:56',
   display,{timeout:20000});
 assert.equal((await input.inputValue()).replace(/\s+/g,' ').trim(),display,'Wrong Page Editor input');
 selected={id:native.id,part:native.part,title:display};
 report.source_token=native.id;
 marker=' QA'+String(process.env.GITHUB_RUN_ID||'1').replace(/\D/g,'').slice(-12);
 report.phase='save';
 await input.fill(display+marker);
 const save=page.locator('#esc-vb-edit-save');
 await save.waitFor({state:'visible',timeout:15000});
 await save.click({timeout:20000});
 let live='';
 for(let i=0;i<20;i++){
  live=await current();
  if(live.includes(display+marker))break;
  await page.waitForTimeout(650);
 }
 assert.ok(live.includes(display+marker),'UI Save not confirmed by WordPress REST');
 report.writes++;
 // WordPress Page text Saver must preserve the entire HTML except one token.
 assert.equal(live,original.replace(display,display+marker),'Page Save modified unrelated source bytes');
 report.changed_tokens=1;
 report.phase='restore';
 report.restored_with=await restoreIfRequired();
 assert.equal(await current(),original,'Save/rollback Page snapshot mismatch');
}catch(e){report.errors.push(String(e.stack||e).slice(0,850));}
finally{
 if(original!==undefined&&ctx&&nonce&&ticket){
  try{
   const mode=await restoreIfRequired();
   report.restored_with??=mode;
   report.cleanup_remaining=(await current())===original?0:1;
   if(report.cleanup_remaining!==0)report.errors.push('CLEANUP_FAILED: Page HTML differs from snapshot');
  }catch(e){report.cleanup_remaining=1;report.errors.push('CLEANUP_FAILED: '+String(e).slice(0,500));}
 } else report.cleanup_remaining=original===undefined?0:1;
 report.status=report.errors.length===0&&report.changed_tokens===1&&report.writes>=2&&report.cleanup_remaining===0?'PASS':'FAIL';
 report.phase='completed';
 process.exitCode=report.status==='PASS'?0:1;
 await writeFile(OUT+'/report.json',JSON.stringify(report,null,2)+'\n');
 console.log('INFORMATION_PAGE_SAVE_ROLLBACK='+JSON.stringify(report));
 await browser.close();
}
