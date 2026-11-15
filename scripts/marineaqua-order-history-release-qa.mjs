import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// Release smoke checks exact source, canonical slug, loading and search.
const REPO = 'ngocnhanvo/marineaqua-actions';
const REQUEST_SHA = 'a5925152feea70b17096aa18532c844df3888418';
const SOURCE_SHA = '9fa23005af6698140b57135b3eb7c3f6f961c28c';
const FRONT = 'https://marine-aqua.io.vn';
const TARGET_PATH = '/don-hang-cua-toi';
const token = process.env.GH_TOKEN;
if (!token) throw Error('Missing GitHub runner read token');
const out = 'order-history-release-evidence';
await mkdir(out, { recursive: true });
const report = {status:'STARTED',bridge:null,production:null,checks:[],source:SOURCE_SHA};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const get = async path => {
  const response = await fetch('https://api.github.com' + path, {
    headers: { Authorization:'Bearer ' + token,
      Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' },
    signal:AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error('GitHub read ' + path.split('?')[0] + ' HTTP ' + response.status);
  return response.json();
};
const one = (list, name) => {
  if (list.length !== 1) throw Error('Expected one ' + name + ' run; found ' + list.length);
  return list[0];
};
let browser;
try {
  let bridge;
  for (let i = 0; i < 60; i++) {
    const data = await get('/repos/' + REPO + '/actions/workflows/marineaqua-dispatch-bridge.yml/runs?per_page=50');
    const hits = (data.workflow_runs || []).filter(item => item.head_sha === REQUEST_SHA);
    if (hits.length === 1) {
      bridge=hits[0];
      if (bridge.status === 'completed') break;
    }
    await sleep(5000);
  }
  assert.ok(bridge && bridge.status === 'completed', 'Dispatch Bridge did not finish');
  assert.equal(bridge.conclusion, 'success', 'Existing deploy Bridge failed');
  report.bridge = {id:bridge.id,conclusion:bridge.conclusion,url:bridge.html_url};
  console.log('ORDER_HISTORY_BRIDGE_SUCCESS=' + bridge.id);

  let production;
  for (let i = 0; i < 90; i++) {
    const data = await get('/repos/' + REPO + '/actions/workflows/marineaqua-production-deploy.yml/runs?per_page=50');
    const candidates = (data.workflow_runs || []).filter(item =>
      item.event === 'repository_dispatch' &&
      new Date(item.created_at).getTime() >= new Date(bridge.created_at).getTime() - 10000);
    production = one(candidates, 'matching production');
    if (production.status === 'completed') break;
    await sleep(5000);
  }
  assert.ok(production && production.status === 'completed', 'Production deployment unfinished');
  assert.equal(production.conclusion, 'success', 'Existing production deploy failed');
  const jobs = await get('/repos/' + REPO + '/actions/runs/' + production.id + '/jobs?per_page=100');
  assert.ok(jobs.jobs?.length, 'Production had no jobs');
  assert.ok(jobs.jobs.every(j => j.conclusion === 'success'), 'Production jobs not all successful');
  report.production={id:production.id,conclusion:production.conclusion,url:production.html_url};
  console.log('ORDER_HISTORY_PRODUCTION_SUCCESS=' + production.id);

  browser = await chromium.launch({headless:true});
  for (const viewport of [
    {name:'desktop',width:1366,height:850},
    {name:'mobile',width:390,height:844},
  ]) {
    const context = await browser.newContext({ viewport: {width:viewport.width,height:viewport.height} });
    const page = await context.newPage();
    await page.route('**/api/user/info',route => route.fulfill({
      status:200,contentType:'application/json',
      body:JSON.stringify({id:123,name:'Synthetic QA Customer',email:'qa@example.invalid'}),
    }));
    await page.route('**/api/user/order',async route => {
      await sleep(1100); // Give the client time to paint the in-page skeleton.
      await route.fulfill({
        status:200,contentType:'application/json',
        body:JSON.stringify({ok:true,orders:[{
          number:'83510',date:'09:09 15/11/2026',status:'on-hold',paymentMethod:'Bank transfer',
          subtotal:'950.000 đ',total:'950.000 đ',items:[{
            name:'Synthetic reef supplement',quantity:1,price:'950.000 đ',
            subtotal:'950.000 đ',image:'',meta:[],
          }],
        }]}),
      });
    });
    const response=await page.goto(FRONT+'/tai-khoan',{waitUntil:'domcontentloaded',timeout:60000});
    assert.equal(response?.status(),200,'Account Page HTTP status');
    const account = page.locator(viewport.name === 'desktop'
      ? '#header-contacts a[data-header-action="account"]'
      : '#mobile-menu-container a[data-header-action="account"]');
    await account.waitFor({state:'attached',timeout:15000});
    if (viewport.name === 'mobile') {
      await page.locator('#hamburger-btn').click();
      await account.waitFor({state:'visible',timeout:12000});
    }
    await account.locator('[data-account-online-dot]').waitFor({state:'visible',timeout:15000});
    await account.click();
    const panel = page.locator('#marine-account-panel');
    await panel.waitFor({state:'visible',timeout:12000});
    const orders = panel.locator('[data-account-orders]');
    assert.equal(await orders.count(),1,'Missing order item');
    assert.equal(await orders.evaluate(el => el.tagName),'A','Orders must be an interactive anchor');
    assert.notEqual(await orders.getAttribute('aria-disabled'),'true','Orders disabled');
    const href = await orders.getAttribute('href');
    assert.ok(href, 'Order history href missing');
    const dest = new URL(href,FRONT);
    assert.equal(dest.origin,FRONT,'Order link must remain same-origin');
    assert.equal(dest.pathname.replace(/\/$/,''),TARGET_PATH,'Orders link must use published WordPress slug');
    report.checks.push({viewport:viewport.name,case:'Authenticated account panel has clickable WordPress orders link',ok:true});
    await Promise.all([
      page.waitForURL(url => url.pathname.replace(/\/$/,'') === TARGET_PATH,{timeout:30000}),
      orders.click(),
    ]);
    const heading = page.getByRole('heading',{level:1,name:/Lịch sử đơn hàng/}).first();
    await heading.waitFor({state:'visible',timeout:15000});
    await page.locator('[data-orders-skeleton]').waitFor({state:'visible',timeout:12000});
    report.checks.push({viewport:viewport.name,case:'Skeleton visible while order API is loading',ok:true});
    const card = page.locator('[data-order-card]');
    await card.waitFor({state:'visible',timeout:15000});
    assert.equal(await page.locator('[data-orders-skeleton]').isVisible(),false,'Skeleton must hide after data arrives');
    const search = page.locator('#order-search');
    await search.waitFor({state:'visible',timeout:10000});
    await search.fill('83510');
    assert.equal(await card.isVisible(),true,'Order number search must match');
    await search.fill('no-such-order');
    assert.equal(await card.isVisible(),false,'Nonmatching order must be hidden');
    await search.fill('');
    assert.equal(await card.isVisible(),true,'Clear search must restore order');
    report.checks.push({viewport:viewport.name,case:'Search filters existing orders and restores cards',ok:true});
    const oldResponse = await page.request.get(FRONT+'/don-hang-cua-toi-4',{maxRedirects:0});
    assert.equal(oldResponse.status(),301,'Legacy order URL must redirect permanently');
    assert.equal(new URL(oldResponse.headers().location,FRONT).pathname,TARGET_PATH,'Redirect destination');
    report.checks.push({viewport:viewport.name,case:'Former order Page path redirects 301 to canonical',ok:true});
    await context.close();
  }
  report.status='PASS';
  console.log('ORDER_HISTORY_PRODUCTION_QA=PASS checks=' + report.checks.length);
} catch(error) {
  report.status='FAIL';
  report.error=String(error?.message||error).slice(0,500);
  console.error('ORDER_HISTORY_PRODUCTION_QA=FAIL ' + report.error);
  process.exitCode=1;
} finally {
  await browser?.close();
  await writeFile(out+'/result.json',JSON.stringify(report,null,2)+'\n');
}
