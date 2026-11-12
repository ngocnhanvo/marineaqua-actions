import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const WEB = 'https://marine-aqua.io.vn';
const WP = 'https://admin.marine-aqua.io.vn';
const REPORT = { tested_at: new Date().toISOString(), checks: [] };
await mkdir('marineaqua-pagination-live-qa', { recursive: true });

async function requestJson(url, timeout = 30000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { 'Cache-Control': 'no-cache', 'Accept': 'application/json' }
  });
  assert.equal(response.status, 200, 'Expected REST 200: ' + url + ' got ' + response.status);
  return await response.json();
}
function validatePage(page) {
  assert.ok(page && typeof page === 'object' && !Array.isArray(page),
    'Paged logs must be a JSON object (not the legacy array)');
  assert.ok(Array.isArray(page.logs) || (page.logs && typeof page.logs === 'object'),
    'Paged logs must contain logs array/object');
  assert.ok(Number.isSafeInteger(page.total) && page.total >= 0,
    'Paged logs must contain nonnegative integer total');
  assert.match(page.snapshot, /^[a-f0-9]{64}$/, 'Paged snapshot must be SHA-256');
  assert.ok(page.next_cursor === null || /^\d+$/.test(String(page.next_cursor)),
    'next_cursor must be null or numeric ID');
  return Array.isArray(page.logs) ? page.logs.length : Object.keys(page.logs).length;
}

let browser;
try {
  const first = await requestJson(WP + '/wp-json/astro/v1/get-product-logs?limit=1');
  const count = validatePage(first);
  assert.ok(count <= 1, 'limit=1 must return at most one record');
  assert.ok(count <= first.total, 'Page must be no larger than total');
  if (first.total === 0) {
    assert.equal(count, 0);
    assert.equal(first.next_cursor, null);
  }
  if (first.next_cursor !== null) {
    const secondUrl = WP + '/wp-json/astro/v1/get-product-logs?limit=1'
      + '&cursor=' + encodeURIComponent(first.next_cursor)
      + '&snapshot=' + encodeURIComponent(first.snapshot);
    const second = await requestJson(secondUrl);
    const count2 = validatePage(second);
    assert.equal(second.snapshot, first.snapshot);
    assert.equal(second.total, first.total);
    assert.ok(count2 <= 1);
    REPORT.checks.push({ test: 'second_page_snapshot', status: 'PASS' });
  }
  REPORT.checks.push({
    test: 'paged_product_logs', status: 'PASS',
    total: first.total, first_page_count: count
  });
  console.log('MARINEAQUA_PAGED_PRODUCT_LOGS=PASS total=' + first.total);

  // Preserve the old array schema for callers not opting into pagination.
  const legacy = await requestJson(WP + '/wp-json/astro/v1/get-product-logs', 30000);
  assert.ok(Array.isArray(legacy), 'Legacy endpoint must remain a JSON array');
  REPORT.checks.push({ test: 'legacy_logs_array', status: 'PASS', count: legacy.length });
  console.log('MARINEAQUA_LEGACY_PRODUCT_LOGS=PASS count=' + legacy.length);

  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: 'desktop', width: 1365, height: 768 },
    { name: 'mobile', width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const errors = [];
    page.on('pageerror', err => errors.push(String(err.message).slice(0, 250)));
    const response = await page.goto(WEB + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.equal(response?.status(), 200, viewport.name + ' homepage did not return 200');
    const title = (await page.title()).trim();
    const body = (await page.locator('body').innerText({ timeout: 12000 })).trim();
    assert.ok(title.length >= 3, viewport.name + ' homepage title missing');
    assert.ok(body.length > 100, viewport.name + ' homepage body looks empty');
    await page.screenshot({
      path: 'marineaqua-pagination-live-qa/home-' + viewport.name + '.png',
      fullPage: false
    });
    REPORT.checks.push({
      test: 'home_' + viewport.name,
      status: 'PASS', title, body_chars: body.length, page_errors: errors
    });
    console.log('MARINEAQUA_PUBLIC_HOME_' + viewport.name.toUpperCase() + '=PASS');
    await page.close();
  }
  REPORT.status = 'PASS';
} catch (error) {
  REPORT.status = 'FAIL';
  REPORT.error = String(error?.message || error).slice(0, 600);
  console.error('MARINEAQUA_LIVE_QA=FAIL ' + REPORT.error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await writeFile('marineaqua-pagination-live-qa/report.json',
    JSON.stringify(REPORT, null, 2) + '\n');
}
