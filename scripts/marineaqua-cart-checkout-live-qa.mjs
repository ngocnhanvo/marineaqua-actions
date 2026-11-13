import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const HOST = 'https://marine-aqua.io.vn';
const DIR = 'cart-checkout-evidence';
const report = { status: 'STARTED', checkedAt: new Date().toISOString(), checks: [], errors: [] };
await mkdir(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
let context;
let transient = null;
try {
  context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.on('dialog', async dialog => {
    report.errors.push('Unexpected UI dialog: ' + dialog.message().slice(0, 200));
    await dialog.dismiss();
  });
  const archive = await page.goto(HOST + '/san-pham/korallen-zucht', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(archive?.status(), 200, 'Product archive did not load');
  const candidate = await page.locator('article.group a[href*="/san-pham/"]').first().getAttribute('href');
  assert.ok(candidate, 'Product detail link missing in archive');
  const productUrl = new URL(candidate, HOST).href;
  const product = await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(product?.status(), 200, 'Product detail did not load');
  const wrapper = page.locator('#data-content-wrapper');
  await wrapper.waitFor();
  const productId = await wrapper.getAttribute('data-product-id');
  const cartSlug = await wrapper.getAttribute('data-cart-slug');
  const checkoutSlug = await wrapper.getAttribute('data-checkout-slug');
  assert.ok(productId, 'WooCommerce product ID is missing');
  assert.ok(cartSlug, 'WordPress cart page URL is missing');
  assert.ok(checkoutSlug && checkoutSlug !== cartSlug, 'WordPress checkout page URL is missing');
  assert.equal(await page.locator('#main-action-btn').count(), 1, 'Add to cart button not available');
  report.checks.push({ type: 'product-page', url: productUrl, productIdPresent: true, cartSlug, checkoutSlug, ok: true });

  await page.locator('#main-action-btn').click();
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem('esc-cart-storage') || 'null')?.state;
    return Boolean(state?.cartKey && state?.items?.length);
  }, { timeout: 30000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('esc-cart-storage') || 'null')?.state);
  assert.ok(saved.cartKey && saved.items?.length, 'Product was not added to CoCart');
  transient = { cartKey: saved.cartKey, itemKey: saved.items[0]?.item_key };
  report.checks.push({ type: 'add-to-cart', itemCount: saved.items.length, cartKeyPresent: true, ok: true });
  const cartHref = new URL(cartSlug, HOST);
  cartHref.searchParams.set('cart_key', saved.cartKey);
  const cartResponse = await page.goto(cartHref.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(cartResponse?.status(), 200, 'WordPress cart page is not available');
  await page.locator('#cart-content-wrapper').waitFor();
  await page.waitForTimeout(1000);
  const cartState = await page.evaluate(() => ({
    cartVisible: !document.getElementById('cart-items-view')?.classList.contains('hidden'),
    emptyVisible: !document.getElementById('cart-empty-view')?.classList.contains('hidden'),
    checkoutHref: document.getElementById('btn-proceed-checkout')?.getAttribute('href') || ''
  }));
  assert.ok(cartState.cartVisible && !cartState.emptyVisible, 'Added product missing in cart UI');
  assert.ok(cartState.checkoutHref.includes('cart_key='), 'Checkout navigation loses cart key');
  report.checks.push({ type: 'cart-page', cartVisible: true, checkoutKeyPresent: true, ok: true });
  const checkoutResponse = await page.goto(new URL(cartState.checkoutHref, HOST).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(checkoutResponse?.status(), 200, 'Checkout page did not load');
  assert.equal(await page.locator('#checkout-data-bridge').count(), 1, 'Checkout bridge was not rendered');
  report.checks.push({ type: 'checkout-page', http: checkoutResponse.status(), ok: true });
  const readCart = await page.request.get(HOST + '/api/cart?cart_key=' + encodeURIComponent(saved.cartKey));
  const cartJson = await readCart.json();
  assert.equal(readCart.status(), 200, 'Read-only cart API HTTP failed');
  assert.equal(cartJson.ok, true, 'Read-only cart API returned an error');
  assert.ok(Array.isArray(cartJson.data?.items), 'Read-only cart API returned invalid cart');
  report.checks.push({ type: 'cart-api', http: readCart.status(), itemCount: cartJson.data.items.length, ok: true });
  report.status = 'PASS';
  console.log('MARINEAQUA_CART_CHECKOUT_LIVE_QA=PASS', JSON.stringify({ checks: report.checks.length }));
} catch (error) {
  report.status = 'FAIL';
  report.errors.push(String(error?.message || error).slice(0, 1000));
  process.exitCode = 1;
  console.error('MARINEAQUA_CART_CHECKOUT_LIVE_QA=FAIL', report.errors.at(-1));
} finally {
  if (context && transient?.cartKey && transient?.itemKey) {
    try {
      const response = await context.request.post(HOST + '/api/cart/del', {
        data: { cart_key: transient.cartKey, item_key: transient.itemKey }
      });
      const json = await response.json();
      report.cleanup = { ok: response.ok() && json.ok === true, http: response.status() };
      if (!report.cleanup.ok) {
        report.status = 'FAIL';
        report.errors.push('Transient cart cleanup failed');
        process.exitCode = 1;
      }
    } catch (error) {
      report.status = 'FAIL';
      report.errors.push('Transient cart cleanup error: ' + String(error?.message || error).slice(0, 200));
      process.exitCode = 1;
    }
  }
  await writeFile(DIR + '/report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
