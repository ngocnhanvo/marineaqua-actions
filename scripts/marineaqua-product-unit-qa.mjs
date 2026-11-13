import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const FRONT='https://marine-aqua.io.vn';
const WP='https://admin.marine-aqua.io.vn';
const DIR='product-unit-evidence';
const result={status:'STARTED',checks:[],errors:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const rest=await fetch(WP+'/wp-json/wc/store/v1/products?search='+encodeURIComponent('Skeletal Elements')+'&per_page=40',{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
  assert.ok(rest.ok,'WooCommerce public product lookup HTTP '+rest.status);
  const products=await rest.json();
  assert.ok(Array.isArray(products),'WooCommerce product payload is not an array');
  const product=products.find(item=>/skeletal elements/i.test(String(item.name||''))&&Number(item.id)>0&&item.slug);
  assert.ok(product,'Source Red Sea Skeletal Elements product not found');
  const url=FRONT+'/san-pham/'+encodeURIComponent(product.slug);
  for(const viewport of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},serviceWorkers:'block'});
    const page=await context.newPage();
    try {
      await context.route('**/*',route=>{
        if(!['GET','HEAD','OPTIONS'].includes(route.request().method()))throw Error('Unexpected mutation');
        return route.continue();
      });
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      assert.equal(response?.status(),200,'Product detail should be published');
      const title=await page.locator('h1').first().textContent();
      assert.match(title||'',/skeletal elements/i,'Wrong product page');
      const quote=page.getByRole('link',{name:/liên hệ báo giá/i});
      assert.ok(await quote.count()>=1,'Quotation link missing');
      assert.equal(await page.getByText('Cái',{exact:true}).count(),0,'Unexpected product unit label');
      const width=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
      assert.ok(width.document<=width.viewport+2,'Horizontal overflow');
      await page.screenshot({path:DIR+'/'+viewport.name+'-product-unit.png',fullPage:true,animations:'disabled'});
      result.checks.push({viewport:viewport.name,url,status:response?.status(),quoteLinks:await quote.count(),unitLabels:0,width,pass:true});
    } finally { await context.close(); }
  }
  result.status='PASS';
} catch(error){
  result.status='FAIL';result.errors.push(String(error?.stack||error).slice(0,1200));process.exitCode=1;
} finally {
  await browser.close();
  await writeFile(DIR+'/result.json',JSON.stringify(result,null,2)+'\n');
  console.log('MARINEAQUA_PRODUCT_UNIT_QA='+JSON.stringify(result));
}
