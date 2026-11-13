import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const WP = 'https://admin.marine-aqua.io.vn';
const DIR = 'checkout-pages-inventory-evidence';
const report = { status:'STARTED', pages:[], conflicts:[], errors:[] };
await mkdir(DIR,{recursive:true});
const browser = await chromium.launch({headless:true});
try {
  if (!process.env.WP_ADMIN_USERNAME || !process.env.WP_ADMIN_PASSWORD) throw Error('Missing WordPress credentials');
  const page = await browser.newPage();
  await page.goto(WP + '/wp-login.php', {waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator('#wp-submit').click();
  await page.goto(WP + '/wp-admin/post-new.php?post_type=page',{waitUntil:'domcontentloaded',timeout:45000});
  if (page.url().includes('wp-login.php')) throw Error('WordPress Page editor login failed');
  const data = await page.evaluate(async()=>{
    const nonce = window.wpApiSettings?.nonce || (await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'})).text();
    const pages = [];
    for(let n=1;n<=30;n++){
      const res = await fetch('/wp-json/wp/v2/pages?context=edit&status=any&per_page=100&page='+n+'&_fields=id,slug,title,status,acf,content',{headers:{'X-WP-Nonce':nonce},credentials:'same-origin'});
      if(res.status===400 && n>1) break;
      if(!res.ok) throw Error('WP pages inventory HTTP '+res.status);
      const chunk=await res.json();
      if(!Array.isArray(chunk)) throw Error('Invalid WordPress pages inventory');
      pages.push(...chunk);
      if(chunk.length<100) break;
    }
    return pages.map(p=>({id:p.id,slug:p.slug,title:p.title?.rendered,status:p.status,key:p.acf?.key,action:p.acf?.action,lang:p.acf?.product_lang,hasContent:Boolean(p.content?.raw)}));
  });
  report.pages = data.filter(p => /cart|checkout|gio-hang|thanh-toan|dat-hang|don-hang|hoan-tat|order/i.test([p.key,p.action,p.slug,p.title].join(' ')));
  report.status='PASS';
  console.log('MARINEAQUA_CHECKOUT_PAGES_INVENTORY='+JSON.stringify(report));
  await page.close();
} catch(error) {
  report.status='FAIL';report.errors.push(String(error?.message||error).slice(0,500));
  process.exitCode=1;console.error('MARINEAQUA_CHECKOUT_PAGES_INVENTORY_FAIL='+report.errors[0]);
} finally {
  await writeFile(DIR+'/report.json',JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
