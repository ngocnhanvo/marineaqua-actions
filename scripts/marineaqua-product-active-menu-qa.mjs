import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const HOST = 'https://marine-aqua.io.vn';
const DIR = 'product-active-menu-evidence';
const report = { status: 'STARTED', checkedAt: new Date().toISOString(), checks: [], errors: [] };
await mkdir(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]) {
    const page = await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
    const legacyCases = [
      {from:'/danh-muc/thuong-hieu/',to:'/san-pham/thuong-hieu'},
      {from:'/danh-muc/thuong-hieu/zetlight/',to:'/san-pham/zetlight'},
      {from:'/danh-muc/may-bom-va-may-tao-song/may-tao-song/',to:'/san-pham/may-tao-song'},
      {from:'/danh-muc/thuong-hieu/zetlight/page/2/?orderby=price&utm_source=legacy',to:'/san-pham/zetlight/2',query:{orderby:'price',utm_source:'legacy'}},
      {from:'/san-pham/dung-dich-hieu-chinh-ong-nhom-do-man-continuum-aquatics-usa',to:'/san-pham/thiet-bi-do'},
      {from:'/san-pham/muoi-bien-tropic-marin-pro-reef-4-kg-box',to:'/san-pham/muoi-bien'},
      {from:'/san-pham/prodibio-stop-ammo-khu-doc-nuoc-hop-30-ong',to:'/san-pham/hoa-chat-bo-sung-va-thuoc-dac-tri'},
      {from:'/san-pham/tropic-marin-a-elements-250-ml-khoang-vi-luong-cho-san-ho',to:'/san-pham/hoa-chat-bo-sung-va-thuoc-dac-tri'},
      {from:'/san-pham/tropic-marin-all-for-reef-250-ml-dinh-duong-khoang-cho-be-ca-bien',to:'/san-pham/tropic-marin'},
      {from:'/san-pham/cot-nen-cao-cap-prodibio-aqua-terra-3l',to:'/san-pham/prodibio'},
      {from:'/san-pham/cot-nen-cao-cap-prodibio-aqua-terra-6l',to:'/san-pham/prodibio'},
      {from:'/san-pham/jebao-cross-flow-scp-70-tao-song-cho-be-ca-canh',to:'/san-pham/jebao'},
      {from:'/san-pham/keo-dan-ong-nuoc-pvc-chuyen-dung',to:'/san-pham/ong-nuoc'},
      {from:'/san-pham/lo-vat-lieu-zeovit-aquaexcel-z1',to:'/san-pham/aqua-excel'},
      {from:'/san-pham/phan-nen-cao-cap-prodibio-aqua-growth-soil-9l',to:'/san-pham/prodibio'},
      {from:'/tu-khoa/bio-mate',to:'/bio-mate'},
      {from:'/tu-khoa/cyano-clean',to:'/cyano-clean'},
      {from:'/tu-khoa/flatworm-stop',to:'/flatworm-stop'},
      {from:'/tu-khoa/zeozym',to:'/zeozym'},
      {from:'/bai-viet?utm_source=legacy',to:'/cat/tin-kien-thuc',query:{utm_source:'legacy'}},
      {from:'/tu-khoa/activated-carbon?utm_source=legacy',to:'/san-pham',query:{q:'activated carbon',utm_source:'legacy'}},
      {from:'/tu-khoa/cut-chu-t-20mm',to:'/san-pham/ong-nuoc'},
    ];
    for (const item of legacyCases) {
      let sourceResponse;
      const capture = response => {
        if (response.url() === HOST + item.from && response.request().isNavigationRequest()) {
          sourceResponse = response;
        }
      };
      page.on('response', capture);
      const finalResponse = await page.goto(HOST + item.from, {waitUntil:'domcontentloaded',timeout:60000});
      page.off('response', capture);
      const finalUrl = new URL(page.url());
      const expectedQuery = new URLSearchParams(item.query || {});
      const actualQuery = new URLSearchParams(finalUrl.search);
      const queryMatches = [...expectedQuery].every(([key,value]) => actualQuery.get(key) === value);
      const ok = sourceResponse?.status() === 301 && finalResponse?.status() === 200 &&
        finalUrl.pathname.replace(/\/+$/,'') === item.to &&
        queryMatches;
      report.checks.push({
        viewport:viewport.name,type:'legacy-category-redirect',from:item.from,
        status:sourceResponse?.status(),location:sourceResponse?.headers()['location'],
        finalStatus:finalResponse?.status(),finalUrl:finalUrl.pathname+finalUrl.search,ok
      });
      assert.ok(ok,'Legacy category redirect mismatch '+JSON.stringify(report.checks.at(-1)));
    }
    if (viewport.name === 'desktop') {
      const sourceCategoryResponse = await fetch('https://marine-aqua.vn/product_cat-sitemap.xml');
      assert.equal(sourceCategoryResponse.status,200,
        'Original WordPress product category sitemap must be readable');
      const sourceCategoryXml = await sourceCategoryResponse.text();
      const sourceCategoryPaths = [...sourceCategoryXml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
        .map(match => new URL(match[1].trim()).pathname)
        .filter(path => path.startsWith('/danh-muc/'));
      assert.ok(sourceCategoryPaths.length >= 30,
        'Original sitemap should enumerate all product category paths');
      for (const from of sourceCategoryPaths) {
        const sourceResponse = await page.request.get(HOST + from, {
          maxRedirects:0,timeout:15000
        });
        const location = sourceResponse.headers()['location'] || '';
        const destination = location ? new URL(location, HOST) : null;
        const finalResponse = destination
          ? await page.request.get(destination.href, { timeout:15000 })
          : null;
        const ok = sourceResponse.status() === 301 &&
          destination?.origin === HOST &&
          destination.pathname.startsWith('/san-pham/') &&
          finalResponse?.status() === 200;
        report.checks.push({
          viewport:viewport.name,type:'all-source-product-category-redirect',
          from,status:sourceResponse.status(),location,
          finalStatus:finalResponse?.status(),
          finalUrl:destination ? destination.pathname+destination.search : '',ok
        });
        assert.ok(ok,'Source product category redirect mismatch '+JSON.stringify(report.checks.at(-1)));
      }
    }
    const searchResponse = await page.goto(HOST + '/san-pham?q=muoi%20bien', {
      waitUntil:'domcontentloaded',timeout:60000
    });
    const searchValue = await page.locator('#search-input').inputValue();
    const productCount = await page.locator('article.group').count();
    assert.equal(searchResponse?.status(),200,'Product search route must return 200');
    assert.equal(searchValue,'muoi bien','Search query should retain the normalized term');
    assert.ok(productCount > 0,'Accent-insensitive search should find Muối biển products');
    report.checks.push({
      viewport:viewport.name,type:'accent-insensitive-product-search',
      searchValue,productCount,ok:true
    });
    const categoryPanel = viewport.name === 'desktop'
      ? '#header-product-catalog-panel'
      : '#mobile-menu-container .marine-mobile-menu-categories';
    for (const slug of ['thuong-hieu','korallen-zucht','den-cho-be-ca-bien-san-ho']) {
      const path = '/san-pham/' + slug;
      const response = await page.goto(HOST + path, {waitUntil:'domcontentloaded',timeout:60000});
      const state = await page.evaluate(({selector,slug}) => {
        const root = document.querySelector(selector);
        const links = [...(root?.querySelectorAll('a[aria-current="page"]') || [])];
        const hrefs = links.map(el => new URL(el.getAttribute('href')||'',location.origin).pathname.replace(/\/+$/,''));
        const target = '/san-pham/' + slug;
        const selected = links.find(el=>new URL(el.getAttribute('href')||'',location.origin).pathname.replace(/\/+$/,'')===target);
        const ancestor = selected?.closest('details');
        return {hrefs,target,active:!!selected,count:links.length,
          ancestorOpen:ancestor?ancestor.open:true,
          rootPresent:!!root,overflow:document.documentElement.scrollWidth>innerWidth+2};
      }, {selector:categoryPanel,slug});
      const ok = response?.status()===200 && state.rootPresent && state.active && state.count===1 &&
        state.ancestorOpen && !state.overflow;
      report.checks.push({viewport:viewport.name,type:'archive',slug,http:response?.status(),...state,ok});
      assert.ok(ok,'Archive category active mismatch '+JSON.stringify(report.checks.at(-1)));
      if (slug==='korallen-zucht') {
        const candidate = await page.locator('article.group a[href*="/san-pham/"]').first().getAttribute('href');
        assert.ok(candidate,'Missing product detail link in '+path);
        const detail = await page.goto(new URL(candidate,HOST).href,{waitUntil:'domcontentloaded',timeout:60000});
        const detailState = await page.evaluate(({selector})=>{
          const root=document.querySelector(selector);
          const current=[...(root?.querySelectorAll('a[aria-current="page"]')||[])];
          const urls=current.map(el=>new URL(el.getAttribute('href')||'',location.origin).pathname.replace(/\/+$/,''));
          const ancestor=current[0]?.closest('details');
          return {hrefs:urls,count:current.length,rootPresent:!!root,
            ancestorOpen:ancestor?ancestor.open:true,overflow:document.documentElement.scrollWidth>innerWidth+2};
        },{selector:categoryPanel});
        const detailOk = detail?.status()===200 && detailState.rootPresent && detailState.count===1 &&
          detailState.hrefs[0]?.startsWith('/san-pham/') && detailState.ancestorOpen && !detailState.overflow;
        report.checks.push({viewport:viewport.name,type:'detail',sourceCategory:slug,
          productUrl:new URL(candidate,HOST).pathname,http:detail?.status(),...detailState,ok:detailOk});
        assert.ok(detailOk,'Product detail category active missing '+JSON.stringify(report.checks.at(-1)));
        await page.screenshot({path:DIR+'/detail-'+viewport.name+'.png'});
      }
    }
    await page.close();
  }
  report.status='PASS';
  console.log('MARINEAQUA_PRODUCT_ACTIVE_QA=PASS '+JSON.stringify({checks:report.checks.length}));
} catch(error) {
  report.status='FAIL';
  report.errors.push(String(error?.message||error).slice(0,1200));
  process.exitCode=1;
  console.error('MARINEAQUA_PRODUCT_ACTIVE_QA=FAIL '+report.errors[0]);
} finally {
  await writeFile(DIR+'/report.json',JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
