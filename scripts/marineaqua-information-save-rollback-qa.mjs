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
 if(!selected||!marker||latest.indexOf(marker)<0)throw Error('CLEANUP_CONFLICT: missing QA marker');
 const fresh=await sourceRead();
 const row=fresh.rows?.find(r=>r.title===selected.title+marker && r.part===selected.part);
 assert.ok(row,'CLEANUP_CONFLICT: exact source token not found');
 const res=await ctx.request.post(route('save-page-text'),
  {headers:headers(),data:{page_id:PAGE_ID,ticket,
   part:row.part,offset:row.offset,title:selected.title,
   original_hash:row.hash,expected_version:fresh.version},
   timeout:30000,failOnStatusCode:false});
 assert.equal(res.status(),200,'CLEANUP_FAILED: REST page restore failed');
 const payload=await res.json();
 assert.equal(payload.saved,true,'CLEANUP_FAILED: restore not saved');
 report.writes++;
 return 'authenticated-REST-fallback';
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
 const h=inspector.locator('h1,h2,h3,h4,p,li').filter({visible:true}).first();
 if(await h.count())await h.click({timeout:20000,position:{x:15,y:12}});
 else await inspector.click({timeout:20000,position:{x:15,y:12}});
 const input=page.locator('#esc-vb-edit-title');
 await page.waitForFunction(()=>String(document.querySelector('#esc-vb-edit-title')?.value||'').trim().length>0,null,{timeout:25000});
 const rowKey=await page.locator('#esc-vb-edit-row').inputValue();
 const data=await sourceRead();
 const selectedRow=data.rows?.find(r=>r.id===rowKey);
 assert.ok(selectedRow&&selectedRow.editable,'Selected editor token is not authorized');
 // Restrict test to a short whole plain text token with no entity encoding.
 const display=String(selectedRow.title||'');
 assert.ok(display.length>=4&&display.length<=120&&!/[<>&\[\]\r\n]/.test(display),'Unsafe Page token for scoped write QA');
 assert.equal((await input.inputValue()).trim(),display,'UI source differs from canonical Page token');
 assert.ok(original.includes(display),'Original Page lacks exact raw test token');
 const occurrences=original.split(display).length-1;
 assert.equal(occurrences,1,'Test token must occur exactly once');
 selected={id:selectedRow.id,part:selectedRow.part,title:display};
 marker=' [QA'+String(process.env.GITHUB_RUN_ID||'1').replace(/\D/g,'').slice(-12)+']';
 report.source_token=selectedRow.id;
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
 await input.fill(display);
 await save.click({timeout:20000});
 let restored=false;
 for(let i=0;i<20&&!restored;i++){
  restored=(await current())===original;
  if(!restored)await page.waitForTimeout(700);
 }
 assert.ok(restored,'UI restore not yet confirmed; fallback will run');
 report.writes++;
 report.restored_with='Visual Builder Save';
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
