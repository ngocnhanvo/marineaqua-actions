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
  assert.equal(before.mode, 'manual', 'Expected the diagnosed manual sitemap mode');
  const manualLocCount = (before.manualXml.match(/<loc>\s*[^<]+?\s*<\/loc>/gi) || []).length;
  assert.equal(manualLocCount, 1, 'Manual XML changed since the read-only diagnosis; refusing write');
  assert.equal(before.extra.length, 0, 'Unexpected manual-to-auto extra URL configuration');
  assert.equal(before.exclude.length, 0, 'Unexpected manual-to-auto exclude URL configuration');
  report.before = {
    mode: before.mode, manualXmlBytes: before.manualXml.length,
    manualXmlLocCount: manualLocCount, extraUrlCount: before.extra.length,
    excludeUrlCount: before.exclude.length
  };

  const autoRadio = page.locator('input[name="sitemap_mode"][value="auto"]');
  await autoRadio.check();
  const form = page.locator('input[name="action"][value="esc_seo_files_save"]').locator('xpath=..');
  const submit = page.getByRole('button', { name: /Lưu sitemap\.xml/i });
  if (await submit.count()) {
    await submit.first().click();
  } else {
    const input = page.locator('input[type="submit"][value*="sitemap.xml"]');
    assert.equal(await input.count(), 1, 'Could not identify the native Save sitemap action');
    await input.click();
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  report.writes = 1;

  const after = await readSourceConfig();
  assert.equal(after.mode, 'auto', 'WordPress did not persist automatic sitemap mode');
  assert.deepEqual(after.extra, before.extra, 'Auto sitemap extra URL list changed unexpectedly');
  assert.deepEqual(after.exclude, before.exclude, 'Auto sitemap exclusion list changed unexpectedly');
  report.after = {
    mode: after.mode, manualXmlBytes: after.manualXml.length,
    extraUrlCount: after.extra.length, excludeUrlCount: after.exclude.length
  };
  // The plugin saves the previous manual XML into its own restore backup before
  // changing the option. Verify that the native restore action is now present.
  report.backupRestoreActionVisible =
    await page.locator('form input[name="action"][value="esc_seo_files_restore"]').count() === 1;
  assert.ok(report.backupRestoreActionVisible,
    'WordPress did not expose the saved sitemap restore action after switching modes');

  report.status = 'PASS';
  console.log('MARINEAQUA_SITEMAP_MODE_UPDATE=PASS ' + JSON.stringify({
    previousMode: before.mode, currentMode: after.mode,
    backupRestoreActionVisible: report.backupRestoreActionVisible
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
