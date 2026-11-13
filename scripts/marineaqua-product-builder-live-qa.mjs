import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const FRONT='https://marine-aqua.io.vn';
const TABLES=['home_04','home_05','home_06','home_07','home_08'];
const DIR='product-builder-live-evidence';
// QA after native WordPress Product column validation release #43485611524.
const report={status:'STARTED',sourceSha:'d79e13c3cf9a023b7a165eef390fe11b12e2d7fb',
  public:{status:'NOT_TESTED'},builder:{status:'NOT_TESTED',tables:[]},
  writes:0,temporaryCreated:0,cleanupRemaining:0,errors:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
const page=await context.newPage();
const requestTrace=[];
page.on('request',req=>{
 if(req.url().includes('/esc-builder/v1/')||req.url().includes('/wp-json/')){
   requestTrace.push({event:'start',method:req.method(),path:new URL(req.url()).pathname,time:Date.now()});
 }
});
page.on('response',res=>{
 if(res.url().includes('/esc-builder/v1/')||res.url().includes('/wp-json/')){
   requestTrace.push({event:'response',status:res.status(),path:new URL(res.url()).pathname,time:Date.now()});
 }
});
page.on('requestfailed',req=>{
 if(req.url().includes('/esc-builder/v1/')){
   requestTrace.push({event:'failure',path:new URL(req.url()).pathname,reason:req.failure()?.errorText||'unknown',time:Date.now()});
 }
});
page.on('pageerror',e=>requestTrace.push({event:'script_error',message:e.message.slice(0,200),time:Date.now()}));
try{
  let ready=false,checks=0;
  for(let i=0;i<42&&!ready;i++){
    const response=await context.request.get(FRONT+'/?esc_builder_check=product_refs',{timeout:25000,failOnStatusCode:false});
    const html=response.ok()?await response.text():'';
    ready=response.status()===200 && TABLES.every(id=>html.includes('data-esc-source-table="'+id+'"'));
    checks++;
    if(!ready&&i<41)await new Promise(r=>setTimeout(r,9000));
  }
  assert.ok(ready,'Production homepage has not published Product source metadata');
  report.public={status:'PASS',checks,productSources:TABLES};
  const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  assert.ok(username&&password,'WordPress QA credentials not configured');
  let authed=false;
  for(let attempt=0;attempt<3&&!authed;attempt++){
    await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    await page.locator('#wp-submit').click({timeout:25000});
    await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
    authed=!page.url().includes('wp-login.php')&&await page.locator('#wpadminbar').count()>0;
    if(!authed&&attempt<2)await page.waitForTimeout(1500*(attempt+1));
  }
  assert.ok(authed,'Native WordPress admin authentication failed');
  const wpPage=await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page=82454',
    {waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(wpPage?.status(),200,'Builder page unavailable');
  const frame=page.frameLocator('#esc-vb-frame');
  await frame.locator('section[data-tablepress-preview="home_04"]').waitFor({state:'visible',timeout:50000});
  for(const tableId of TABLES){
    const section=frame.locator('section[data-tablepress-preview="'+tableId+'"]');
    const track=section.locator('[data-esc-builder-product-track][data-esc-source-table="'+tableId+'"]');
    const cards=track.locator(':scope > [data-esc-builder-product-card][data-esc-builder-product-id]');
    const count=await cards.count();
    assert.ok(count>=2,'Product card references missing for '+tableId);
    assert.equal(await track.getAttribute('data-esc-builder-product-partial'),null,'Unexpected partial Product grid '+tableId);
    const ids=[];
    for(let i=0;i<count;i++){
      const card=cards.nth(i);
      ids.push(await card.getAttribute('data-esc-builder-product-id'));
      assert.equal(await card.getAttribute('data-esc-source-row'),String(i),'Wrong canonical row '+tableId+':'+i);
      assert.equal(await card.getAttribute('data-esc-vb-product-readonly'),'true');
    }
    assert.equal(new Set(ids).size,count,'Duplicate product ID in '+tableId);
    await cards.first().scrollIntoViewIfNeeded();
    await cards.first().click({position:{x:45,y:40},timeout:20000});
    await page.waitForFunction(id=>{
      const ctx=document.querySelector('#esc-vb-item-context')?.textContent||'';
      return ctx.startsWith(id+' · dòng 1');
    },tableId,{timeout:55000}).catch(()=>{});
    const selectedInfo={
      tableId,
      context:await page.locator('#esc-vb-item-context').innerText().catch(()=>null),
      status:await page.locator('#esc-vb-item-status').innerText().catch(()=>null),
      panelVisible:await page.locator('#esc-vb-item-panel').isVisible().catch(()=>false),
      inspector:await page.locator('#esc-vb-inspector').innerText().catch(()=>null),
      tag:await cards.first().evaluate(el=>({id:el.getAttribute('data-esc-builder-product-id'),
        row:el.getAttribute('data-esc-source-row'),parent:el.closest('[data-esc-source-table]')?.getAttribute('data-esc-source-table'),
        source:el.closest('[data-tablepress-preview]')?.getAttribute('data-tablepress-preview')}))
    };
    report.builder.lastSelection=selectedInfo;
    report.builder.requestTrace=requestTrace.slice(-35);
    assert.ok(selectedInfo.context?.startsWith(tableId+' · dòng 1'),
      'Card selection did not map to native ESC Table: '+JSON.stringify(selectedInfo));
    await page.locator('#esc-vb-item-new').waitFor({state:'visible',timeout:15000});
    assert.ok(await page.locator('#esc-vb-item-new').isEnabled(),'Add disabled '+tableId);
    assert.ok(await page.locator('#esc-vb-item-delete').isEnabled(),'Delete disabled '+tableId);
    assert.ok(await page.locator('#esc-vb-item-sort-open').isEnabled(),'Sort disabled '+tableId);
    report.builder.tables.push({id:tableId,count,firstProductId:ids[0],status:'PASS'});
  }
  const tableId=TABLES[0];
  const track=frame.locator('[data-esc-source-table="'+tableId+'"][data-esc-builder-product-track]');
  const cards=track.locator(':scope > [data-esc-builder-product-card][data-esc-builder-product-id]');
  const originalIds=await cards.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-esc-builder-product-id')));
  await cards.first().click({position:{x:45,y:40},timeout:15000});
  await page.waitForFunction(id=>document.querySelector('#esc-vb-item-context')?.textContent?.startsWith(id+' · dòng 1'),
    tableId,{timeout:20000});
  await page.locator('#esc-vb-item-new').click();
  await page.locator('#esc-vb-item-dialog').waitFor({state:'visible',timeout:15000});
  await page.locator('input[aria-label="Tìm sản phẩm WooCommerce đã xuất bản"]').waitFor({state:'visible',timeout:16000});
  report.builder.addDialog='PASS';
  await page.locator('#esc-vb-item-dismiss').click();
  assert.equal(await page.locator('#esc-vb-item-dialog').isVisible(),false,'Cancel add did not close');
  await page.locator('#esc-vb-item-delete').click();
  await page.locator('#esc-vb-item-delete-dialog').waitFor({state:'visible',timeout:15000});
  report.builder.deleteDialog='PASS';
  await page.locator('#esc-vb-item-delete-dismiss').click();
  assert.equal(await page.locator('#esc-vb-item-delete-dialog').isVisible(),false,'Cancel delete did not close');
  await page.locator('#esc-vb-item-sort-open').click();
  await page.locator('#esc-vb-item-sort-body').waitFor({state:'visible',timeout:15000});
  await cards.first().waitFor({state:'visible',timeout:15000});
  await page.waitForTimeout(900);
  assert.equal(await cards.first().getAttribute('data-esc-vb-item-source'),'','Red source not selected on Product card');
  assert.equal(await page.locator('#esc-vb-item-sort-preview-list').isVisible(),false,'Unexpected fallback ID list while cards are visible');
  await cards.nth(1).click({position:{x:45,y:40},timeout:18000});
  await page.waitForFunction(()=>!document.querySelector('#esc-vb-item-sort-save')?.disabled,null,{timeout:15000});
  assert.equal(await cards.nth(1).getAttribute('data-esc-vb-item-target'),'','Blue target not selected');
  report.builder.visualSwapSelection='PASS';
  await page.screenshot({path:DIR+'/product-swap-red-blue.png',fullPage:false});
  await page.locator('#esc-vb-item-sort-cancel').click();
  assert.equal(await track.locator('[data-esc-vb-item-source],[data-esc-vb-item-target]').count(),0,'Cancel left visual item marks');
  const finalIds=await cards.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-esc-builder-product-id')));
  assert.deepEqual(finalIds,originalIds,'Cancel changed rendered Product order');
  const response=await context.request.get(WP+'/wp-json/tablepress/v1/table/'+tableId,{timeout:25000});
  assert.equal(response.status(),200);
  const data=await response.json();
  assert.ok(Array.isArray(data.items),'Product source table REST unexpectedly empty');
  assert.deepEqual(data.items.map(item=>String(item.key||'')),originalIds,'Cancel unexpectedly changed WordPress Product order');
  report.builder.visualSwapCancel='PASS';
  report.builder.status='PASS';
}catch(error){
  report.errors.push(String(error.stack||error).slice(0,2200));
  report.status='FAIL';process.exitCode=1;
}finally{
  report.status=report.errors.length?'FAIL':'PASS';
  await writeFile(DIR+'/result.json',JSON.stringify(report,null,2)+'\n');
  console.log('MARINEAQUA_PRODUCT_BUILDER_QA='+JSON.stringify(report));
  await browser.close();
}