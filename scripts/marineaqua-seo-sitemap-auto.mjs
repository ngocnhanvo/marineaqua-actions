import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP = 'https://admin.marine-aqua.io.vn';
const FRONT = 'https://marine-aqua.io.vn';
const OUT = 'marineaqua-seo-sitemap-auto';
const report = { status: 'STARTED', before: null, after: null, errors: [], writes: 0 };
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  assert.ok(process.env.WP_ADMIN_USERNAME && process.env.WP_ADMIN_PASSWORD,
    'WordPress admin credentials are not configured');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let authenticated = false;
  for (let attempt = 0; attempt < 3 && !authenticated; attempt++) {
    await page.goto(WP + '/wp-login.php', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (await page.locator('#user_login').count()) {
      await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
      await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
      await page.locator('#wp-submit').click();
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    }
    authenticated = !page.url().includes('wp-login.php') &&
      await page.locator('#wpadminbar').count() > 0;
  }
  assert.ok(authenticated, 'WordPress Admin login failed');

  await page.goto(WP + '/wp-admin/options-general.php?page=esc-seo-files&tab=sitemap',
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.ok(!page.url().includes('wp-login.php'), 'SEO Files admin page requires login');
  await page.locator('input[name="sitemap_mode"]').first().waitFor({ state: 'visible', timeout: 20000 });

  async function readSourceConfig() {
    return page.evaluate(async () => {
      const response = await fetch('/wp-json/esc-seo-files/v1/public', {
        credentials: 'same-origin', headers: { accept: 'application/json', 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error('SEO Files REST readback HTTP ' + response.status);
      const data = await response.json();
      return {
        version: data.version, site: data.site, mode: data.sitemap?.mode,
        manualXml: data.sitemap?.xml || '',
        extra: data.sitemap?.extra || [], exclude: data.sitemap?.exclude || []
      };
    });
  }

  const before = await readSourceConfig();
  assert.equal(before.version, 1, 'Unexpected SEO Files schema');
  assert.equal(before.site, FRONT, 'SEO Files site identity mismatch');
  assert.equal(before.mode, 'auto', 'Automatic sitemap must remain enabled');
  const requested = ['/thanh-toan', '/gio-hang', '/tai-khoan', '/don-hang-cua-toi'];
  const existing = before.exclude.map(String);
  const next = [...new Set([...existing, ...requested])];
  // Only change this one WordPress SEO Files field. Existing editor exclusions
  // and manually added URLs must be preserved.
  report.before = {
    mode:before.mode, extra:before.extra, exclude:existing,
    manualXmlBytes:before.manualXml.length
  };
  const textarea = page.locator('#esc-seo-exclude');
  await textarea.waitFor({state:'visible',timeout:15000});
  const current = (await textarea.inputValue()).split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);
  assert.deepEqual(current, existing, 'Sitemap admin form disagrees with REST exclusion readback');
  if (next.length !== existing.length) {
    await textarea.fill(next.join('\\n'));
    const submit = page.getByRole('button', {name:/Lưu sitemap\\.xml/i});
    assert.equal(await submit.count(),1,'Native sitemap Save button unavailable');
    await Promise.all([
      page.waitForURL(url => url.pathname.endsWith('/options-general.php'),{timeout:30000}),
      submit.click()
    ]);
    report.writes = 1;
  }
  const after = await readSourceConfig();
  assert.equal(after.mode,'auto','Sitemap mode changed unexpectedly');
  assert.deepEqual(after.extra,before.extra,'Existing extra URL config changed');
  assert.equal(after.manualXml,before.manualXml,'Manual restore data changed');
  assert.deepEqual(after.exclude,next,'WordPress exclusion readback mismatch');
  report.after = {mode:after.mode,extra:after.extra,exclude:after.exclude};
  report.status = 'PASS';
  console.log('MARINEAQUA_SITEMAP_EXCLUSIONS=PASS '+JSON.stringify({
    excluded:next, writes:report.writes, preservedExtra:true, mode:after.mode
  }));
  await context.close();
} catch (error) {
  report.status = 'FAIL';
  report.errors.push(String(error?.stack || error).slice(0, 1200));
  console.error('MARINEAQUA_SITEMAP_MODE_UPDATE=FAIL ' + String(error?.message || error).slice(0, 300));
  process.exitCode = 1;
} finally {
  await writeFile(OUT + '/result.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
