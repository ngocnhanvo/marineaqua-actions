import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const WP = 'https://admin.marine-aqua.io.vn';
const DIR = 'checkout-pages-inventory-evidence';
const report = { status:'STARTED', pages:[], paymentGateways:[], plugins:[], integration:null, reads:[], conflicts:[], errors:[] };
await mkdir(DIR,{recursive:true});
const browser = await chromium.launch({headless:true});
try {
  if (!process.env.WP_ADMIN_USERNAME || !process.env.WP_ADMIN_PASSWORD) throw Error('Missing WordPress credentials');
  const page = await browser.newPage();
  await page.goto(WP + '/wp-login.php', {waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator('#wp-submit').click();
  await page.goto(WP + '/wp-admin/edit.php?post_type=page',{waitUntil:'domcontentloaded',timeout:45000});
  if (page.url().includes('wp-login.php')) throw Error('WordPress Page editor login failed');
  const data = await page.evaluate(async()=>{
    const deadline = Date.now() + 90000;
    const reads = [];
    const nonce = window.wpApiSettings?.nonce || await (await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin',signal:AbortSignal.timeout(15000)})).text();
    if (!/^[a-zA-Z0-9]{8,32}$/.test(nonce)) throw Error('Invalid WordPress REST nonce');
    async function read(path) {
      const start = Date.now();
      const remaining = deadline - start;
      if (remaining <= 0) throw Error('Read-only WordPress inventory deadline exceeded');
      const result = { path: path.split('?')[0], method:'GET' };
      reads.push(result);
      try {
        const response = await fetch(path,{method:'GET',headers:{'X-WP-Nonce':nonce},credentials:'same-origin',signal:AbortSignal.timeout(Math.min(15000,remaining))});
        result.http = response.status;
        result.elapsedMs = Date.now() - start;
        if (!response.ok) throw Error(result.path + ' HTTP ' + response.status);
        return await response.json();
      } catch (error) {
        result.elapsedMs = Date.now() - start;
        result.error = String(error?.message || error).slice(0,200);
        throw error;
      }
    }
    const pages = [];
    for(let n=1;n<=30;n++){
      let chunk;
      try { chunk = await read('/wp-json/wp/v2/pages?context=edit&status=any&per_page=100&page='+n+'&_fields=id,slug,title,status,acf,content'); }
      catch (error) { if(n>1 && reads.at(-1)?.http===400) break; throw error; }
      if(!Array.isArray(chunk)) throw Error('Invalid WordPress pages inventory');
      pages.push(...chunk);
      if(chunk.length<100) break;
    }
    const metadata = await Promise.allSettled([
      read('/wp-json/wc/v3/payment_gateways?_fields=id,title,enabled,order'),
      read('/wp-json/wp/v2/plugins?context=edit&_fields=plugin,status,name')
    ]);
    const errors = [];
    const list = (result, name) => {
      if(result.status==='rejected') { errors.push(name + ': ' + String(result.reason?.message || result.reason).slice(0,250)); return []; }
      if(!Array.isArray(result.value)) { errors.push(name + ': invalid collection'); return []; }
      return result.value;
    };
    // Project only nonsensitive metadata even if an endpoint ignores _fields.
    const paymentGateways = list(metadata[0], 'payment_gateways').map(g=>({id:g.id,title:g.title,enabled:g.enabled,order:g.order}));
    const plugins = list(metadata[1], 'plugins').map(p=>({plugin:p.plugin,status:p.status,name:p.name}));
    return { pages:pages.map(p=>({id:p.id,slug:p.slug,title:p.title?.rendered,status:p.status,key:p.acf?.key,action:p.acf?.action,lang:p.acf?.product_lang,hasContent:Boolean(p.content?.raw)})),paymentGateways,plugins,pluginReadOk:metadata[1].status==='fulfilled' && Array.isArray(metadata[1].value),reads,errors };
  });
  report.pages = data.pages.filter(p => /cart|checkout|gio-hang|thanh-toan|dat-hang|don-hang|hoan-tat|order/i.test([p.key,p.action,p.slug,p.title].join(' ')));
  report.paymentGateways = data.paymentGateways;
  report.plugins = data.plugins;
  report.reads = data.reads;
  report.errors.push(...data.errors);
  const integration = data.plugins.filter(p => /(^|\/)esc-cocart-integration(?:\/|\.php$)/i.test(p.plugin || ''));
  report.integration = data.pluginReadOk ? { installed:integration.length>0, active:integration.some(p=>p.status==='active' || p.status==='network-active'), matches:integration } : null;
  if(report.errors.length) throw Error('Read-only checkout metadata inventory incomplete');
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

