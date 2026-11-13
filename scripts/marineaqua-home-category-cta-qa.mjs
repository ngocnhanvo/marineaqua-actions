import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const ORIGIN = 'https://marine-aqua.io.vn';
const DIR = 'home-category-cta-evidence';
const result = { status: 'STARTED', viewports: [], errors: [] };
await mkdir(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const screen of [{label:'desktop',width:1366,height:900},{label:'mobile',width:390,height:844}]) {
    const context = await browser.newContext({viewport:{width:screen.width,height:screen.height}, serviceWorkers:'block'});
    const page = await context.newPage();
    try {
      await context.route('**/*', route => {
        const request = route.request();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) throw new Error('Unexpected browser mutation');
        return route.continue();
      });
      const response=await page.goto(ORIGIN+'/trang-chu',{waitUntil:'domcontentloaded',timeout:45000});
      assert.equal(response?.status(),200,'Homepage must load');
      const ctas=page.locator('[data-home-banner-section] .marine-hero-button');
      const count=await ctas.count();
      assert.ok(count>0,'No category CTA found in the WordPress home banner');
      const allHrefs=await ctas.evaluateAll(links=>links.map(el=>el.getAttribute('href')));
      assert.ok(allHrefs.every(href=>href==='/san-pham'), 'Unexpected CTA href(s): '+JSON.stringify(allHrefs));
      const active=page.locator('[data-home-banner-section]:visible [data-home-slide].is-active .marine-hero-button');
      assert.equal(await active.count(),1,'Expected one visible active banner category CTA');
      await active.screenshot({path:DIR+'/'+screen.label+'-cta.png'});
      await active.click();
      await page.waitForURL(url=>url.pathname.replace(/\/+$/,'')==='/san-pham',{timeout:12000});
      const destination=page.url();
      const destResponse=await page.request.get(ORIGIN+'/san-pham',{timeout:20000,failOnStatusCode:false});
      assert.equal(destResponse.status(),200,'Product listing must be HTTP 200');
      const widths=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth}));
      assert.ok(widths.document<=widths.viewport+2,'Destination horizontal overflow');
      result.viewports.push({screen:screen.label,ctaCount:count,href:'/san-pham',destination,productHttp:destResponse.status(),widths,status:'PASS'});
    } finally { await context.close(); }
  }
  result.status='PASS';
} catch(error) {
  result.status='FAIL';
  result.errors.push(String(error?.stack||error).slice(0,900));
  process.exitCode=1;
} finally {
  console.log('MARINEAQUA_HOME_CATEGORY_CTA='+JSON.stringify(result));
  await writeFile(DIR+'/result.json',JSON.stringify(result,null,2)+'\n');
  await browser.close();
}
