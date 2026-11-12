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


async function verifyLiveProductSorting(browser) {
  const root = WEB + '/san-pham/thuong-hieu/';
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const jsErrors = [];
  page.on('pageerror', (error) => jsErrors.push(String(error.message)));
  const take = async (url) => {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    assert.equal(response?.status(), 200, 'Product listing must return 200: ' + url);
    assert.equal(await page.locator('#product-sort').count(), 1, 'Missing live sort selector: ' + url);
    const records = await page.locator('article.group').evaluateAll((cards) => cards.map((card) => ({
      name: card.querySelector('h2')?.textContent?.trim() || '',
      priceText: card.querySelector('p.text-center.text-base.font-bold')?.textContent?.trim() || '',
      href: card.querySelector('a[href]')?.getAttribute('href') || ''
    })));
    assert.ok(records.length > 0 && records.length <= 16,
      'Expected 1-16 product cards: ' + url + ', got ' + records.length);
    assert.ok(records.every((item) => item.name && item.priceText && item.href.startsWith('/san-pham/')),
      'Invalid live product cards: ' + url);
    return records.map((item) => ({
      ...item,
      price: /liên hệ/i.test(item.priceText) ? null : Number(item.priceText.replace(/[^0-9]/g, ''))
    }));
  };
  const compare = (a, b, mode) => {
    const nameOrder = a.name.localeCompare(b.name, 'vi');
    if (mode === 'name-desc') return -nameOrder;
    if (mode.startsWith('price-')) {
      if (a.price === null && b.price !== null) return 1;
      if (b.price === null && a.price !== null) return -1;
      if (a.price !== null && b.price !== null && a.price !== b.price) {
        return mode === 'price-asc' ? a.price - b.price : b.price - a.price;
      }
    }
    return nameOrder;
  };

  try {
    for (const mode of ['name-asc', 'name-desc', 'price-asc', 'price-desc']) {
      const first = await take(root + '?sort=' + mode);
      const second = await take(root + '2/?sort=' + mode);
      const combined = first.concat(second);
      assert.equal(first.length, 16, 'Page 1 expected 16 cards: ' + mode);
      assert.equal(second.length, 16, 'Page 2 expected 16 cards: ' + mode);
      assert.ok(combined.every((item, index) => index === 0 || compare(combined[index - 1], item, mode) <= 0),
        'Sorting is not monotonic across page boundary: ' + mode
        + ' sample=' + JSON.stringify(combined.slice(13, 19)));
      REPORT.checks.push({ test: 'product_sort_' + mode, status: 'PASS', sample: combined.length });
      console.log('MARINEAQUA_PRODUCT_SORT_' + mode.toUpperCase().replace('-', '_') + '=PASS');
    }

    await take(root);
    await page.locator('#product-sort').selectOption('price-asc');
    await page.waitForURL((url) => url.searchParams.get('sort') === 'price-asc', { timeout: 30000 });
    assert.equal(await page.locator('#product-sort').inputValue(), 'price-asc');
    const sorted = await take(page.url());
    const search = sorted[0].name;
    await page.locator('#search-input').fill(search);
    await page.locator('#search-form button[type="submit"]').click();
    await page.waitForURL((url) => url.searchParams.get('q') === search, { timeout: 30000 });
    assert.equal(new URL(page.url()).searchParams.get('sort'), 'price-asc',
      'Submitting a product search dropped the active sort');
    const searched = await take(page.url());
    assert.ok(searched.some((item) => item.name === search), 'Search failed to find its exact source product');
    await page.locator('#product-sort').selectOption('price-desc');
    await page.waitForURL((url) => url.searchParams.get('sort') === 'price-desc', { timeout: 30000 });
    assert.equal(new URL(page.url()).searchParams.get('q'), search,
      'Changing sort dropped the product search query');

    await take(root + '?sort=name-asc');
    await page.locator('nav[aria-label="Phân trang"] a[aria-label="Trang sau"]').click();
    await page.waitForURL((url) => /\/2\/?$/.test(url.pathname), { timeout: 30000 });
    assert.equal(new URL(page.url()).searchParams.get('sort'), 'name-asc',
      'Pagination dropped the selected sort');
    await take(page.url());
    REPORT.checks.push({ test: 'sort_search_and_pagination_persistence', status: 'PASS' });
    console.log('MARINEAQUA_PRODUCT_SORT_SEARCH_PAGING=PASS');
    await page.screenshot({ path: 'marineaqua-pagination-live-qa/product-sort-desktop.png' });

    await page.setViewportSize({ width: 390, height: 844 });
    await take(root + '?sort=price-desc');
    const bounds = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth
    }));
    assert.ok(bounds.scrollWidth <= bounds.width + 2,
      'Mobile product sort causes horizontal overflow: ' + JSON.stringify(bounds));
    assert.equal(await page.locator('#product-sort').inputValue(), 'price-desc');
    await page.screenshot({ path: 'marineaqua-pagination-live-qa/product-sort-mobile.png' });
    assert.deepEqual(jsErrors, [], 'Client-side errors on product pages');
    REPORT.checks.push({ test: 'product_sort_mobile', status: 'PASS', ...bounds });
    console.log('MARINEAQUA_PRODUCT_SORT_MOBILE=PASS');
  } finally {
    await page.close();
  }
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
  await verifyLiveProductSorting(browser);
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
