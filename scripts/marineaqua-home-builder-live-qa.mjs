import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';

const WP='https://admin.marine-aqua.io.vn';
const FRONT='https://marine-aqua.io.vn';
const ACTIONS='ngocnhanvo/marineaqua-actions';
const SHA='c20902aef19e62281271915afd235e273ac641ce';
const RELEASE_AT=Date.parse('2026-11-13T18:01:40Z')-15000;
const DIR='home-builder-live-evidence';
const report={status:'STARTED',sourceSha:SHA,production:{status:'PENDING'},cms:{status:'NOT_TESTED'},
  public:{status:'NOT_TESTED',views:[]},builder:{status:'NOT_TESTED'},errors:[]};
await mkdir(DIR,{recursive:true});

async function github(path,textResponse=false){
 assert.ok(process.env.GITHUB_TOKEN,'Missing token for read-only provenance');
 const response=await fetch('https://api.github.com'+path,{
  headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,
    Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'MarineAqua-Builder-QA'},
  signal:AbortSignal.timeout(25000)});
 assert.ok(response.ok,'GitHub API '+response.status+' '+path.split('?')[0]);
 return textResponse?response.text():response.json();
}
async function verifyDeploy(){
 let found;
 for(let trial=0;trial<48&&!found;trial++){
   const res=await github('/repos/'+ACTIONS+'/actions/workflows/marineaqua-production-deploy.yml/runs?per_page=35');
   const candidates=(res.workflow_runs||[]).filter(r=>r.event==='repository_dispatch'&&Date.parse(r.created_at)>=RELEASE_AT);
   for(const run of candidates){
    const jobResult=await github('/repos/'+ACTIONS+'/actions/runs/'+run.id+'/jobs?per_page=100');
    for(const job of (jobResult.jobs||[])){
      if(job.status!=='completed')continue;
      const logs=await github('/repos/'+ACTIONS+'/actions/jobs/'+job.id+'/logs',true);
      if(logs.includes(SHA)){found={run,jobs:jobResult.jobs,logs};break;}
    }
    if(found)break;
   }
   if(!found&&trial<47)await new Promise(r=>setTimeout(r,15000));
 }
 assert.ok(found,'No production deployment run with expected Astro source SHA');
 const {run,jobs,logs}=found;
 report.production={status:'FAIL',run_id:run.id,url:run.html_url,attempt:run.run_attempt,
  conclusion:run.conclusion,signedActivation:logs.includes('SIGNED_UNZIP_SUCCESS'),sourceVerified:true};
 if(run.status!=='completed'){
   // The bridge can identify a live run before GitHub marks it completed.
   for(let i=0;i<45;i++){
     await new Promise(resolve=>setTimeout(resolve,6000));
     const current=await github('/repos/'+ACTIONS+'/actions/runs/'+run.id);
     if(current.status==='completed'){
       run.status=current.status;run.conclusion=current.conclusion;
       report.production.conclusion=current.conclusion;
       break;
     }
   }
 }
 assert.equal(run.status,'completed');
 assert.equal(run.conclusion,'success','Production workflow failed');
 assert.ok(jobs.length&&jobs.every(j=>j.conclusion==='success'),'Production workflow jobs not all PASS');
 assert.ok(report.production.signedActivation,'Signed FTP activation not verified');
 report.production.status='PASS';
}

const browser=await chromium.launch({headless:true});
async function verifyPublic(){
 for(const v of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  const ctx=await browser.newContext({viewport:{width:v.width,height:v.height},serviceWorkers:'block'});
  const page=await ctx.newPage();
  try{
   const result={viewport:v.name};
   const response=await page.goto(FRONT+'/',{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(response?.status(),200,'Homepage not available');
   const expected={
      eyebrow:'GÓC ĐẠI DƯƠNG CỦA BẠN',
      heading:'Chạm gần hơn với',
      heading_emphasis:'thế giới san hô.',
      description:'Thiết bị, vật tư và phụ kiện cho hồ cá cảnh biển — chọn lựa dễ dàng hơn cho từng bể cá.',
      cta_text:'Khám phá danh mục',
      footnote:'Marine Aqua • Thiết bị & phụ kiện cá cảnh biển'
   };
   const banner=page.locator('section[data-marine-home-variant="'+v.name+'"]');
   await banner.waitFor({state:'attached',timeout:15000});
   const firstSlide=banner.locator('[data-home-slide]').first();
   assert.ok(await firstSlide.count()>0,'Expected a live banner slide');
   for(const [key,value] of Object.entries(expected)){
     const selector=firstSlide.locator('[data-esc-builder-field="'+key+'"]');
     assert.equal(await selector.count(),1,'Missing editable field '+key);
     assert.equal((await selector.innerText()).trim(),value,'Unexpected content for '+key);
   }
   const button=firstSlide.locator('.marine-hero-button');
   assert.equal(await button.getAttribute('href'),'/san-pham','CTA path changed');
   const groups=await page.locator('section.marine-brand-section').count();
   assert.equal(groups,5,'Unexpected number of product brand groups');
   assert.equal(await page.locator('.marine-brand-section h2[data-esc-builder-cell-field="section_title"]').count(),5,
     'Product section title editing markers missing');
   result.brandSections=groups;
   result.bannerFields=Object.keys(expected);
   result.horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
   assert.equal(result.horizontalOverflow,false,'Horizontal layout overflow');
   await page.screenshot({path:DIR+'/home-'+v.name+'.png',fullPage:false,animations:'disabled'});
   result.status='PASS';report.public.views.push(result);
  }finally{await ctx.close();}
 }
 report.public.status='PASS';
}
async function verifyCmsAndBuilder(){
 const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 const page=await ctx.newPage();
 try{
  const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  assert.ok(username&&password,'WordPress admin QA credentials unavailable');
  // Do not bypass WordPress permissions. A transient login-page redirect
  // can occur during concurrent site activity, so retry the native login.
  let loggedIn=false;
  const attempts=[];
  for(let attempt=1;attempt<=3&&!loggedIn;attempt++){
    await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    await page.locator('#wp-submit').click({timeout:25000});
    await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
    loggedIn=!page.url().includes('wp-login.php')&&
      (await page.locator('#wpadminbar').count())>0;
    attempts.push({attempt,authenticated:loggedIn,path:new URL(page.url()).pathname});
    if(!loggedIn&&attempt<3)await page.waitForTimeout(1500*attempt);
  }
  report.cms.loginAttempts=attempts;
  assert.ok(loggedIn,'WordPress session failed after native login retries');
  const res=await ctx.request.get(WP+'/wp-json/tablepress/v1/table/home_00',{timeout:30000});
  assert.equal(res.status(),200,'ESC Table unavailable after deployment');
  const data=await res.json();
  const keys=(data.fields||[]).map(f=>f.key);
  for(const key of ['eyebrow','heading','heading_emphasis','description','cta_text','cta_url','footnote']){
    assert.ok(keys.includes(key),'Missing WordPress ESC Table field '+key);
  }
  report.cms={status:'PASS',table:'home_00',itemCount:data.items?.length||0,
    fields:keys,source:'WordPress native TablePress REST'};
  await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page=82454',
   {waitUntil:'domcontentloaded',timeout:45000});
  const frame=page.frameLocator('iframe#esc-vb-frame');
  const target=frame.locator('section[data-marine-home-variant="desktop"] [data-esc-builder-field="heading"]').first();
  await target.waitFor({state:'visible',timeout:50000});
  const before=await target.innerText();
  await target.click({timeout:12000});
  const box=page.locator('#esc-vb-edit-title');
  await box.waitFor({state:'visible',timeout:25000});
  await page.waitForFunction(()=>(document.querySelector('#esc-vb-edit-title')?.value||'').trim().length>0,
     null,{timeout:25000}).catch(()=>{});
  const editorVisible=await box.isVisible().catch(()=>false);
  const dialog=await page.locator('body').innerText();
  report.builder={status:'FAIL',selectedField:'heading',headingText:before,editorVisible,
    editorValue:editorVisible?(await box.inputValue()).slice(0,180):null,
    pageSnippet:dialog.slice(-1200)};
  await page.screenshot({path:DIR+'/builder-heading-selection.png',fullPage:false});
  assert.ok(editorVisible,'Clicking heading did not open Visual Builder text editor');
  report.builder.textFieldSelector=await page.locator('#esc-vb-edit-row').inputValue().catch(()=>null);
  assert.equal((await box.inputValue()).trim(),before.trim(),'Builder picked wrong field content');
  // Image edit must remain independent after selecting a text field.
  const media=frame.locator('section[data-marine-home-variant="desktop"] .marine-hero-media').first();
  const mediaSize=await media.boundingBox();
  assert.ok(mediaSize&&mediaSize.width>130&&mediaSize.height>80,'Banner image area unexpectedly small');
  // The split layout masks its left edge and navigation controls cover corners.
  // Locate a genuinely clickable point in the image using hit-testing, without
  // force-clicking through text or slider controls.
  const hitPoint=await media.evaluate((element)=>{
    const r=element.getBoundingClientRect();
    for(const y of [.3,.45,.6,.75,.85]){
      for(const x of [.38,.5,.62,.72,.82,.9]){
        const node=document.elementFromPoint(r.left+r.width*x,r.top+r.height*y);
        if(node&&element.contains(node))return {x:Math.round(r.width*x),y:Math.round(r.height*y)};
      }
    }
    return null;
  });
  report.builder.imageHitPoint=hitPoint;
  assert.ok(hitPoint,'Visible banner image has no independently clickable point');
  await media.click({position:hitPoint,timeout:18000});
  await page.locator('#esc-vb-image-choose').waitFor({state:'visible',timeout:18000});
  report.builder.imageEditorVisible=true;
  // Distinct existing Product ESC Table section title should use its own
  // title editing source; do not save or mutate actual product data.
  const brand=frame.locator('.marine-brand-section h2[data-esc-builder-cell-field="section_title"]').first();
  await brand.scrollIntoViewIfNeeded({timeout:16000});
  await brand.click({timeout:16000});
  await page.locator('#esc-vb-edit-title').waitFor({state:'visible',timeout:20000});
  const brandValue=(await brand.innerText()).trim();
  await page.waitForTimeout(2200);
  report.builder.productTitleText=brandValue;
  report.builder.productTitleEditorValue=await page.locator('#esc-vb-edit-title').inputValue();
  report.builder.productTitleRow=await page.locator('#esc-vb-edit-row').inputValue().catch(()=>null);
  report.builder.productTitleFeedback=await page.locator('#esc-vb-edit-feedback').innerText().catch(()=>null);
  report.builder.productTitleCaption=await page.locator('#esc-vb-edit-caption').innerText().catch(()=>null);
  report.builder.productTitlePageTail=(await page.locator('body').innerText()).slice(-1300);
  assert.equal(report.builder.productTitleEditorValue.trim(),brandValue,'Product section title did not map to its WordPress source');
  report.builder.productTitleEditable=true;
  report.builder.status='PASS';
 }finally{await ctx.close();}
}

try{
 try{await verifyDeploy()}catch(e){report.errors.push('PRODUCTION: '+String(e.message||e));}
 try{await verifyPublic()}catch(e){report.public.status='FAIL';report.errors.push('PUBLIC: '+String(e.message||e));}
 try{await verifyCmsAndBuilder()}catch(e){report.builder.status='FAIL';report.errors.push('BUILDER: '+String(e.message||e));}
 report.status=report.errors.length?'FAIL':'PASS';
 if(report.status!=='PASS')process.exitCode=1;
}finally{
 await browser.close();
 await writeFile(DIR+'/result.json',JSON.stringify(report,null,2)+'\n');
 console.log('MARINEAQUA_HOME_BUILDER_LIVE_QA='+JSON.stringify({
  status:report.status,sourceSha:SHA,production:report.production,
  public:report.public,builder:report.builder,errors:report.errors
 }));
}