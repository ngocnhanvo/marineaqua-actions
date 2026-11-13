import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const HOST = 'https://marine-aqua.io.vn';
const out = 'contact-page-evidence';
const report = { status: 'STARTED', checkedAt: new Date().toISOString(), checks: [], errors: [], screenshots: [] };
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]) {
    const context = await browser.newContext({viewport:{width:viewport.width,height:viewport.height},serviceWorkers:'block'});
    const page = await context.newPage();
    try {
      await context.route('**/*', async route => {
        const req=route.request(), u=new URL(req.url());
        if (!['GET','HEAD','OPTIONS'].includes(req.method()) || /\/api\/(?:cart|user|contact|agent)/.test(u.pathname)) {
          throw Error('Unexpected contact QA mutation or private API '+req.method()+' '+u.pathname);
        }
        await route.continue();
      });
      const response = await page.goto(HOST+'/lien-he',{waitUntil:'domcontentloaded',timeout:45000});
      assert.equal(response?.status(),200,'Contact route HTTP');
      const main=page.locator('main#main-content');
      await main.waitFor();
      assert.equal(await main.locator('h1').count(),1,'Exactly one visible contact H1 required');
      assert.equal((await main.locator('h1').textContent()).trim(),'Liên hệ Marine Aqua');
      assert.equal(await main.locator('#contact-details-title').isVisible(),true);
      const footer=page.locator('#footer-contact-info');
      const full = await main.textContent();
      assert.ok(full.includes('Liên hệ mua hàng đại lý và tuyển dụng'),'Source-backed recruitment section missing');
      assert.ok(full.includes('090 21 26 111'),'Source-backed reseller contact missing');
      const contactPhone=main.locator('a[href^="tel:"]');
      assert.ok(await contactPhone.count()>=2,'Missing sales and wholesale phones');
      const info=await footer.locator('p').allTextContents();
      for (const item of info.map(s=>s.trim()).filter(Boolean)) {
        assert.ok(full.includes(item), 'Contact page differs from live WordPress common info: '+item);
      }
      // Verify WordPress Header navigation is clickable on desktop and mobile.
      if (viewport.name === 'desktop') {
        const link = page.locator('#desktop-menu a').filter({ hasText: /^Liên hệ$/ });
        assert.equal(await link.count(), 1, 'WordPress Header contact link is missing or duplicated on desktop');
        assert.equal(new URL(await link.getAttribute('href'), HOST).pathname.replace(/\/+$/, ''), '/lien-he', 'Desktop Header contact destination mismatch');
        await link.click();
      } else {
        const toggle = page.locator('#hamburger-btn');
        await toggle.click();
        const link = page.locator('#mobile-menu-container a').filter({ hasText: /^Liên hệ$/ });
        assert.equal(await link.count(), 1, 'WordPress Header contact link is missing or duplicated on mobile');
        assert.equal(new URL(await link.getAttribute('href'), HOST).pathname.replace(/\/+$/, ''), '/lien-he', 'Mobile Header contact destination mismatch');
        await link.click();
      }
      await page.waitForURL(url => url.pathname.replace(/\/+$/, '') === '/lien-he', { timeout: 10000 });
      assert.equal(await page.locator('main#main-content h1').count(), 1, 'Header navigation did not reach contact page');
      const links=await main.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>({href:n.getAttribute('href'),target:n.target,rel:n.rel})));
      assert.ok(links.some(x=>x.href==='mailto:info@marine-aqua.vn'));
      assert.ok(links.some(x=>x.href?.startsWith('tel:+84902126111')));
      for(const link of links.filter(x=>x.target==='_blank')) {
        assert.ok(link.rel.includes('noopener')&&link.rel.includes('noreferrer'),'External link not protected');
      }
      const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
      assert.ok(width.scroll<=width.client+2,'Horizontal overflow');
      const h1style=await main.locator('h1').evaluate(el=>({fontSize:parseFloat(getComputedStyle(el).fontSize),weight:getComputedStyle(el).fontWeight}));
      assert.ok(h1style.fontSize>=28,'H1 styled like body text');
      const img=viewport.name+'-contact-page.png';
      await page.screenshot({path:out+'/'+img,fullPage:true,animations:'disabled',timeout:15000});
      report.screenshots.push(img);
      report.checks.push({viewport:viewport.name,http:200,h1:true,sourceWholesale:true,wordpressCommonFields:info.length,links:links.length,noHorizontalOverflow:true,headingStyle:h1style,...width,ok:true});
    } finally { await context.close(); }
  }
  report.status='PASS';
} catch(e) {
  report.status='FAIL';report.errors.push(String(e?.message||e).slice(0,500));process.exitCode=1;
} finally {
  await browser.close();
  console.log('MARINEAQUA_CONTACT_PAGE_QA='+report.status,JSON.stringify(report));
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
