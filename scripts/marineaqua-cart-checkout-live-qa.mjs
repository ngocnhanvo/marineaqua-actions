import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const HOST = 'https://marine-aqua.io.vn';
const DIR = 'cart-checkout-evidence';
const STORAGE_KEY = 'esc-cart-storage';
const RESPONSE_TIMEOUT = 40000;
const DOM_TIMEOUT = 15000;
const API_TIMEOUT = 20000;
const MOCK_REJECTION = 'MARINEAQUA_QA_CHECKOUT_REJECTED_NO_ORDER';
const MOCK_UNCERTAIN = 'MARINEAQUA_QA_CHECKOUT_UNCERTAIN_NO_ORDER';
const VALID_BILLING = {
  billing_tenchuthe: 'Marine Aqua QA',
  billing_sodienthoai: '0900000000',
  billing_email: 'marine-aqua-checkout-qa@example.invalid',
  billing_diachi: 'QA — không đặt hàng'
};
const report = { status: 'STARTED', checkedAt: new Date().toISOString(), checks: [], navigation: [], network: [], cleanup: [], screenshots: [], errors: [] };
const privateValues = new Set();
function redact(value) {
  let text = String(value ?? '');
  for (const secret of privateValues) if (secret) text = text.split(secret).join('[REDACTED]');
  return text.replace(/([?&](?:cart_key|cartKey|order_key)=)[^&#\s"'<>)]*/gi, '$1[REDACTED]').replace(/\bt_[a-z0-9]{16,}\b/gi, '[REDACTED]');
}
const safeJson = (value, indent) => JSON.stringify(value, (_key, item) => typeof item === 'string' ? redact(item) : item, indent);
function safeUrl(value) {
  try { const url = new URL(value, HOST); return url.origin + url.pathname; }
  catch { return redact(value).split('?')[0]; }
}
const elapsed = (start) => Date.now() - start;
async function until(predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(message);
}
async function navigate(page, url, check, click) {
  const start = Date.now();
  const diagnostic = { check, url: safeUrl(url), stage: 'DOCUMENT_RESPONSE', responseDeadlineMs: RESPONSE_TIMEOUT, domDeadlineMs: DOM_TIMEOUT };
  report.navigation.push(diagnostic);
  try {
    const response = click
      ? (await Promise.all([page.waitForNavigation({ waitUntil: 'commit', timeout: RESPONSE_TIMEOUT }), click()]))[0]
      : await page.goto(url, { waitUntil: 'commit', timeout: RESPONSE_TIMEOUT });
    diagnostic.responseMs = elapsed(start);
    diagnostic.http = response?.status() ?? null;
    diagnostic.url = safeUrl(response?.url() || page.url());
    diagnostic.contentType = response?.headers()['content-type'] || '';
    diagnostic.stage = 'DOM_CONTENT_LOADED';
    await page.waitForLoadState('domcontentloaded', { timeout: DOM_TIMEOUT });
    diagnostic.elapsedMs = elapsed(start);
    diagnostic.ok = true;
    console.log('MARINEAQUA_NAVIGATION', safeJson(diagnostic));
    assert.equal(response?.status(), 200, check + ' did not return HTTP 200');
    return response;
  } catch (error) {
    diagnostic.elapsedMs = elapsed(start);
    diagnostic.ok = false;
    diagnostic.error = redact(error?.message || error).slice(0, 1000);
    console.error('MARINEAQUA_NAVIGATION', safeJson(diagnostic));
    throw Error(check + ' failed at ' + diagnostic.stage + ': ' + diagnostic.error);
  }
}
async function clickNavigation(page, selector, check) {
  const locator = page.locator(selector).filter({ visible: true }).first();
  await locator.waitFor({ state: 'visible' });
  const href = await locator.getAttribute('href');
  return navigate(page, href || page.url(), check, () => locator.click({ timeout: DOM_TIMEOUT }));
}
async function selectSimpleProduct(page, viewport) {
  const candidates = await page.locator('article.group a[href*="/san-pham/"]').evaluateAll(links => [...new Set(links.map(link => link.getAttribute('href')).filter(Boolean))].slice(0, 8));
  assert.ok(candidates.length, 'Product detail links missing in archive');
  for (const candidate of candidates) {
    const productUrl = new URL(candidate, HOST).href;
    await navigate(page, productUrl, viewport + '-simple-product-candidate');
    const wrapper = page.locator('#data-content-wrapper');
    await wrapper.waitFor();
    const variation = await wrapper.getAttribute('data-is-variation');
    const domain = await wrapper.getAttribute('data-is-domain');
    const variations = JSON.parse(await wrapper.getAttribute('data-variations-list') || 'null');
    const simple = variation === 'false' && domain === 'false' && Array.isArray(variations) && variations.length === 0;
    if (!simple || !(await page.locator('#quantity-selector-block').isVisible()) || !(await page.locator('#main-action-btn').count())) continue;
    if (!(await page.locator('#main-action-btn').isEnabled())) continue;
    assert.equal(await page.locator('#btn-increase').count(), 1, 'Simple product has no increase control');
    assert.equal(await page.locator('#btn-decrease').count(), 1, 'Simple product has no decrease control');
    assert.equal((await page.locator('#quantity-display').textContent() || '').trim(), '1', 'Simple-product starting quantity must be one');
    report.checks.push({ type: 'simple-product-selection', viewport, url: safeUrl(productUrl), variation: false, domain: false, quantityControls: true, ok: true });
    return productUrl;
  }
  throw Error('No available simple product with quantity controls found among the first eight archive products; quantity QA cannot be claimed');
}
async function state(page) {
  return page.evaluate(key => {
    try { return JSON.parse(localStorage.getItem(key) || 'null')?.state || null; }
    catch { return null; }
  }, STORAGE_KEY);
}
function rememberCart(scope, saved) {
  if (!saved?.cartKey) return;
  privateValues.add(saved.cartKey);
  privateValues.add(encodeURIComponent(saved.cartKey));
  if (!scope.carts.has(saved.cartKey)) scope.carts.set(saved.cartKey, new Set());
  for (const item of saved.items || []) if (item.item_key) scope.carts.get(saved.cartKey).add(item.item_key);
}
const quantity = (item) => Number(typeof item?.quantity === 'object' ? item.quantity?.value : item?.quantity);
async function readCart(context, cartKey) {
  const response = await context.request.get(HOST + '/api/cart?cart_key=' + encodeURIComponent(cartKey), { timeout: API_TIMEOUT });
  assert.equal(response.status(), 200, 'Cart readback HTTP failed');
  const json = await response.json();
  assert.equal(json.ok, true, 'Cart readback returned an API error');
  assert.ok(Array.isArray(json.data?.items), 'Cart readback has no items array');
  return json.data;
}
async function clickMutation(page, selector, path) {
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST', { timeout: API_TIMEOUT }),
    page.locator(selector).first().click({ timeout: DOM_TIMEOUT })
  ]);
  const json = await response.json();
  assert.equal(response.ok(), true, path + ' HTTP failed');
  assert.equal(json.ok, true, path + ' returned an API error');
}
async function cartReady(page, scope) {
  await page.locator('#cart-content-wrapper').waitFor();
  await page.locator('#cart-list-container .btn-remove-item').first().waitFor();
  const saved = await state(page);
  rememberCart(scope, saved);
  assert.ok(saved?.cartKey && saved.items?.length, 'Cart UI lost the saved cart');
  const current = new URL(page.url());
  assert.ok(current.searchParams.get('cart_key') === saved.cartKey, 'Actual cart navigation lost the cart key');
  const serverCart = await page.locator('#cart-content-wrapper').getAttribute('data-cart');
  assert.ok(JSON.parse(serverCart || '{}')?.cart_key === saved.cartKey, 'SSR cart does not match the browser cart');
  return saved;
}
async function checkoutReady(page, scope) {
  await page.locator('#checkout-data-bridge').waitFor({ state: 'attached' });
  await page.locator('#checkout-form').waitFor();
  await page.locator('#checkout-cart-container .btn-remove-item').first().waitFor();
  const saved = await state(page);
  rememberCart(scope, saved);
  assert.ok(saved?.cartKey && saved.items?.length, 'Checkout lost the saved cart');
  assert.ok(new URL(page.url()).searchParams.get('cart_key') === saved.cartKey, 'Checkout navigation lost the cart key');
  const serverCart = JSON.parse(await page.locator('#checkout-data-bridge').getAttribute('data-cart') || '{}');
  assert.ok(serverCart.cart_key === saved.cartKey, 'Checkout SSR cart does not match browser cart');
  return saved;
}
async function screenshot(page, name) {
  const capturePosition = await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    let deadline;
    try {
      await Promise.race([
        (async () => {
          if (document.fonts) await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        })(),
        new Promise((_resolve, reject) => { deadline = setTimeout(() => reject(Error('Screenshot fonts/animation-frame readiness exceeded 4000ms')), 4000); })
      ]);
    } finally {
      clearTimeout(deadline);
    }
    return { x: window.scrollX, y: window.scrollY };
  });
  assert.equal(capturePosition.y, 0, 'Screenshot must start at scrollY zero');
  assert.equal(capturePosition.x, 0, 'Screenshot must start at scrollX zero');
  const privateFields = 'input:not([type]), input[type="text"], input[type="password"], input[type="email"], input[type="tel"], input[type="search"], input[type="url"], input[type="number"], textarea, select, pre, code';
  await page.screenshot({ path: DIR + '/' + name, fullPage: true, animations: 'disabled', timeout: 5000, mask: [page.locator(privateFields)] });
  report.screenshots.push(name);
}
async function checkLayout(page, viewport, name) {
  const widths = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  assert.ok(widths.content <= widths.viewport + 2, name + ' has horizontal overflow: ' + widths.content + ' > ' + widths.viewport);
  report.checks.push({ type: name + '-layout', viewport, ...widths, ok: true });
}
async function fillValidGuestForm(page) {
  for (const [name, value] of Object.entries(VALID_BILLING)) {
    privateValues.add(value);
    await page.locator('[name="' + name + '"]').fill(value);
  }
  assert.equal(await page.locator('#createaccount').isChecked(), false, 'QA must remain guest checkout');
  const payment = page.locator('input[name="payment_method"]:enabled').first();
  assert.ok(await payment.count(), 'No configured payment option available');
  await payment.check();
  await page.locator('#terms-checkbox').check();
  assert.equal(await page.locator('#checkout-form').evaluate(form => form.checkValidity()), true, 'Synthetic guest form must be valid before guard checks');
}
async function formValidation(page, scope) {
  const submit = page.locator('#submit-checkout-btn');
  const terms = page.locator('#terms-checkbox');
  const form = page.locator('#checkout-form');
  assert.equal(await terms.isChecked(), false, 'Terms must start unchecked');
  assert.equal(await submit.isDisabled(), true, 'Submit must be disabled before accepting terms');
  assert.equal(await page.locator('#createaccount').isChecked(), false, 'QA must remain guest checkout');
  const countBefore = scope.mock.records.length;
  await terms.check();
  await until(async () => !(await submit.isDisabled()), 'Valid nonempty cart did not enable checkout after terms');
  await submit.click();
  const invalidRequired = await form.evaluate(node => Array.from(node.querySelectorAll('[required]')).filter(input => !input.checkValidity()).length);
  assert.ok(invalidRequired > 0, 'Missing required fields were not invalid');
  assert.equal(scope.mock.records.length, countBefore, 'Required-field validation submitted checkout');

  const fixtures = { ...VALID_BILLING, billing_email: 'invalid-email' };
  for (const [name, value] of Object.entries(fixtures)) {
    privateValues.add(value);
    await page.locator('[name="' + name + '"]').fill(value);
  }
  await submit.click();
  assert.equal(await page.locator('[name="billing_email"]').evaluate(input => input.validity.typeMismatch), true, 'Invalid email was not rejected');
  assert.equal(scope.mock.records.length, countBefore, 'Invalid email submitted checkout');
  const email = VALID_BILLING.billing_email;
  privateValues.add(email);
  await page.locator('[name="billing_email"]').fill(email);
  const payment = page.locator('input[name="payment_method"]:enabled').first();
  assert.ok(await payment.count(), 'No real configured payment option is available');
  await payment.check();
  await terms.uncheck();
  assert.equal(await submit.isDisabled(), true, 'Unchecking terms did not disable checkout');
  await terms.check();
  assert.equal(await form.evaluate(node => node.checkValidity()), true, 'Synthetic guest form is not valid');

  scope.mock.expected = true;
  scope.mock.status = 422;
  scope.mock.held = new Promise(resolve => { scope.mock.release = resolve; });
  const before = await state(page);
  await submit.click();
  await until(() => scope.mock.records.length > countBefore, 'Mock checkout request was not intercepted');
  assert.equal(await submit.isDisabled(), true, 'Pending checkout did not lock the submit button');
  // requestSubmit tests the submission guard as well as the disabled button.
  await form.evaluate(node => node.requestSubmit());
  await page.waitForTimeout(300);
  assert.equal(scope.mock.records.length, countBefore + 1, 'Duplicate checkout request escaped the submission guard');
  assert.equal(scope.mock.records.at(-1).createAccount, false, 'Guest QA attempted account creation');
  scope.mock.release();
  await until(async () => !(await submit.isDisabled()), 'Rejected checkout did not unlock the form');
  const rejection = page.locator('#checkout-error');
  await rejection.waitFor({ state: 'visible' });
  const expectedMessage = await form.evaluate(node => JSON.parse(node.dataset.checkoutMessages || '{}').checkout_failed || '');
  assert.ok(expectedMessage, 'Localized checkout failure message is missing');
  const displayedMessage = (await rejection.textContent() || '').trim();
  assert.equal(displayedMessage, expectedMessage, 'Rejected checkout did not show its safe localized error');
  assert.equal(displayedMessage.includes(MOCK_REJECTION), false, 'Checkout exposed the internal upstream rejection marker');
  const after = await state(page);
  assert.ok(after?.cartKey === before.cartKey, 'Rejected checkout cleared the cart key');
  assert.equal(after?.items?.length, before.items.length, 'Rejected checkout cleared the cart items');
  assert.ok((await readCart(scope.context, after.cartKey)).items.length, 'Rejected checkout cleared the server cart');
  assert.equal(await page.locator('#checkout-form').count(), 1, 'Rejected checkout navigated away');
  report.checks.push({ type: 'form-validation-and-rejected-checkout', viewport: scope.name, requiredFields: true, email: true, terms: true, duplicateGuard: true, preservedCart: true, interceptedPosts: scope.mock.records.length - countBefore, realOrders: 0, ok: true });

  // A mocked 502 simulates uncertainty after an order might have been received.
  // The browser must retain the cart and keep submission locked until a reload.
  const countBeforeUncertain = scope.mock.records.length;
  const beforeUncertain = await state(page);
  const keyedCheckoutUrl = page.url();
  scope.mock.status = 502;
  scope.mock.held = Promise.resolve();
  await submit.click();
  await until(() => scope.mock.records.length === countBeforeUncertain + 1, 'Mock uncertain checkout request was not intercepted');
  const uncertainMessage = await form.evaluate(node => JSON.parse(node.dataset.checkoutMessages || '{}').checkout_uncertain || '');
  assert.ok(uncertainMessage && uncertainMessage !== expectedMessage, 'Distinct localized checkout_uncertain message is missing');
  await until(async () => await rejection.isVisible() && (await rejection.textContent() || '').trim() === uncertainMessage, 'HTTP 502 did not display checkout_uncertain');
  assert.equal(scope.mock.records.at(-1).mockHttp, 502, 'Uncertainty test did not receive its mocked 502');
  assert.equal(await submit.isDisabled(), true, 'Uncertain checkout unlocked the submit button');
  await terms.uncheck();
  await terms.check();
  assert.equal(await submit.isDisabled(), true, 'Changing terms unlocked uncertain checkout');
  assert.equal(await form.evaluate(node => node.checkValidity()), true, 'Uncertainty guard must be checked with otherwise valid fields');
  await form.evaluate(node => node.requestSubmit());
  await page.waitForTimeout(300);
  assert.equal(scope.mock.records.length, countBeforeUncertain + 1, 'Uncertain checkout allowed another POST');
  const uncertainCart = await state(page);
  assert.ok(uncertainCart?.cartKey === beforeUncertain.cartKey, 'Uncertain checkout cleared the cart key');
  assert.equal(uncertainCart?.items?.length, beforeUncertain.items.length, 'Uncertain checkout cleared cart items');
  assert.equal((await readCart(scope.context, uncertainCart.cartKey)).items.length, beforeUncertain.items.length, 'Uncertain checkout altered server cart items');
  assert.equal(await page.locator('#checkout-form').count(), 1, 'Uncertain checkout navigated away');
  assert.equal((await rejection.textContent() || '').includes(MOCK_UNCERTAIN), false, 'Checkout exposed the mocked upstream uncertainty marker');
  report.checks.push({ type: 'mocked-502-uncertainty-guard', viewport: scope.name, visibleLocalizedError: true, submitLocked: true, repeatPostBlocked: true, preservedCart: true, interceptedPosts: 1, realOrders: 0, ok: true });
  await screenshot(page, scope.name + '-checkout-uncertain.png');

  // Only reset the simulated browser uncertainty through an ordinary keyed GET.
  scope.mock.status = 422;
  scope.mock.expected = false;
  await navigate(page, keyedCheckoutUrl, scope.name + '-reload-after-mocked-502');
  const reloaded = await checkoutReady(page, scope);
  assert.ok(reloaded.cartKey === beforeUncertain.cartKey, 'Reload after mocked uncertainty lost the cart session');
  await fillValidGuestForm(page);
  await until(async () => !(await page.locator('#submit-checkout-btn').isDisabled()), 'Reload did not reset simulated browser uncertainty');
  assert.equal(scope.mock.records.length, countBeforeUncertain + 1, 'Reload unexpectedly submitted checkout');
  report.checks.push({ type: 'reset-mocked-uncertainty-by-get', viewport: scope.name, preservedCart: true, validFormBeforeEmptyGuard: true, ok: true });
}
async function cleanup(scope) {
  scope.mock.release?.();
  try { if (!scope.page.isClosed()) rememberCart(scope, await state(scope.page)); } catch { /* retained cart identities remain available */ }
  for (const [cartKey, knownItems] of scope.carts) {
    const outcome = { viewport: scope.name, ok: false, removed: 0, remainingItems: null };
    report.cleanup.push(outcome);
    try {
      const cart = await readCart(scope.context, cartKey);
      for (const item of cart.items) {
        assert.ok(knownItems.has(item.item_key), 'Cleanup refused an unrecognized cart item');
        const response = await scope.context.request.post(HOST + '/api/cart/del', { data: { cart_key: cartKey, item_key: item.item_key }, timeout: API_TIMEOUT });
        const json = await response.json();
        assert.ok(response.ok() && json.ok === true, 'Cart cleanup deletion failed');
        outcome.removed++;
      }
      const readback = await readCart(scope.context, cartKey);
      outcome.remainingItems = readback.items.length;
      outcome.ok = outcome.remainingItems === 0;
      assert.equal(outcome.ok, true, 'Cleanup did not leave an empty cart');
    } catch (error) {
      outcome.error = redact(error?.message || error).slice(0, 500);
      report.errors.push('Cleanup: ' + outcome.error);
      report.status = 'FAIL';
      process.exitCode = 1;
    }
  }
}

await mkdir(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(DOM_TIMEOUT);
    const scope = { name: viewport.name, context, page, carts: new Map(), mock: { records: [], expected: false, status: 422, held: Promise.resolve(), release: () => {}, dialogs: 0 } };
    const startedAt = Date.now();
    // Installed before any page visit. Every checkout POST is fulfilled locally;
    // synthetic billing data, account creation and order creation never reach production.
    await context.route(/\/api\/cart\/checkout(?:[/?#]|$)/, async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      let payload;
      try { payload = route.request().postDataJSON(); } catch { payload = {}; }
      const mockHttp = scope.mock.status === 502 ? 502 : 422;
      const marker = mockHttp === 502 ? MOCK_UNCERTAIN : MOCK_REJECTION;
      scope.mock.records.push({ cartKeyPresent: Boolean(payload?.cartKey), createAccount: payload?.create_account === true, paymentMethod: String(payload?.payment_method || ''), mockHttp });
      if (!scope.mock.expected) report.errors.push(viewport.name + ': unexpected checkout POST was safely intercepted');
      let timer;
      await Promise.race([scope.mock.held, new Promise(resolve => { timer = setTimeout(resolve, 10000); })]);
      clearTimeout(timer);
      await route.fulfill({ status: mockHttp, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: false, msg: marker }) });
    });
    page.on('response', response => {
      const request = response.request();
      const url = safeUrl(response.url());
      if (report.network.length >= 150 || (!request.isNavigationRequest() && !url.startsWith(HOST + '/api/'))) return;
      report.network.push({ viewport: viewport.name, type: 'response', url, http: response.status(), contentType: response.headers()['content-type'] || '', elapsedMs: elapsed(startedAt) });
    });
    page.on('requestfailed', request => {
      if (report.network.length < 150) report.network.push({ viewport: viewport.name, type: 'request-failed', url: safeUrl(request.url()), error: redact(request.failure()?.errorText || 'Unknown request error'), elapsedMs: elapsed(startedAt) });
    });
    page.on('dialog', async dialog => {
      if (dialog.message().includes(MOCK_REJECTION) && scope.mock.expected) scope.mock.dialogs++;
      else report.errors.push('Unexpected UI dialog: ' + redact(dialog.message()).slice(0, 200));
      await dialog.dismiss();
    });
    try {
      await navigate(page, HOST + '/san-pham/korallen-zucht', viewport.name + '-product-archive');
      const productUrl = await selectSimpleProduct(page, viewport.name);
      const wrapper = page.locator('#data-content-wrapper');
      await wrapper.waitFor();
      const cartSlug = await wrapper.getAttribute('data-cart-slug');
      const checkoutSlug = await wrapper.getAttribute('data-checkout-slug');
      assert.ok(await wrapper.getAttribute('data-product-id'), 'WooCommerce product ID missing');
      assert.ok(cartSlug && checkoutSlug && cartSlug !== checkoutSlug, 'WordPress cart/checkout URLs missing');
      assert.equal(await page.locator('#main-action-btn').count(), 1, 'Add-to-cart unavailable');
      await checkLayout(page, viewport.name, 'product');
      await page.locator('#main-action-btn').click();
      await page.waitForFunction(key => {
        const saved = JSON.parse(localStorage.getItem(key) || 'null')?.state;
        return Boolean(saved?.cartKey && saved?.items?.length);
      }, STORAGE_KEY, { timeout: API_TIMEOUT });
      const added = await state(page);
      rememberCart(scope, added);
      assert.equal(added.items.length, 1, 'Expected one isolated QA cart item');

      // Follow the actual header link; never construct a cart URL to bypass navigation.
      await clickNavigation(page, 'a[data-header-action="cart"]', viewport.name + '-header-cart-navigation');
      assert.equal(new URL(page.url()).pathname.replace(/\/$/, ''), new URL(cartSlug, HOST).pathname.replace(/\/$/, ''), 'Header opened the wrong cart page');
      const saved = await cartReady(page, scope);
      assert.ok(saved.cartKey === added.cartKey, 'Header navigation changed the cart session');
      report.checks.push({ type: 'actual-header-cart-navigation', viewport: viewport.name, ok: true });
      await clickMutation(page, '#cart-list-container .btn-qty-plus', '/api/cart/update');
      await until(async () => quantity((await state(page))?.items?.[0]) === 2, 'Cart quantity did not increase to two');
      const increased = await readCart(context, saved.cartKey);
      assert.equal(quantity(increased.items[0]), 2, 'Server quantity did not increase');
      await clickMutation(page, '#cart-list-container .btn-qty-minus', '/api/cart/update');
      await until(async () => quantity((await state(page))?.items?.[0]) === 1, 'Cart quantity did not decrease to one');
      assert.equal(quantity((await readCart(context, saved.cartKey)).items[0]), 1, 'Server quantity did not decrease');
      report.checks.push({ type: 'quantity-update', viewport: viewport.name, plus: 2, minus: 1, serverReadback: true, ok: true });
      await checkLayout(page, viewport.name, 'cart');
      await screenshot(page, viewport.name + '-cart.png');

      await clickNavigation(page, '#btn-proceed-checkout', viewport.name + '-cart-checkout-navigation');
      await checkoutReady(page, scope);
      await checkLayout(page, viewport.name, 'checkout');
      await formValidation(page, scope);
      await screenshot(page, viewport.name + '-checkout.png');
      await clickMutation(page, '#checkout-cart-container .btn-remove-item', '/api/cart/del');
      await until(async () => (await state(page))?.items?.length === 0, 'Remove item did not empty the browser cart');
      assert.equal((await readCart(context, saved.cartKey)).items.length, 0, 'Remove item did not empty server cart');
      assert.equal(await page.locator('#submit-checkout-btn').isDisabled(), true, 'Empty checkout still allows submission');
      const postsBeforeEmpty = scope.mock.records.length;
      await page.locator('#checkout-form').evaluate(form => form.requestSubmit());
      await page.waitForTimeout(300);
      assert.equal(scope.mock.records.length, postsBeforeEmpty, 'Empty cart submitted checkout');
      await clickNavigation(page, 'a[data-header-action="cart"]', viewport.name + '-empty-header-cart-navigation');
      await page.locator('#cart-empty-view').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#cart-items-view').isVisible(), false, 'Empty cart still shows item view');
      const checkoutLink = page.locator('#btn-proceed-checkout');
      assert.ok(!(await checkoutLink.isVisible()) || await checkoutLink.getAttribute('aria-disabled') === 'true' || !(await checkoutLink.getAttribute('href')), 'Empty cart has an enabled checkout navigation');
      report.checks.push({ type: 'remove-and-empty-checkout-guard', viewport: viewport.name, serverReadback: true, ok: true });

      await navigate(page, productUrl, viewport.name + '-buy-now-product');
      await clickNavigation(page, '#buy-now-btn', viewport.name + '-buy-now-navigation');
      assert.equal(new URL(page.url()).pathname.replace(/\/$/, ''), new URL(checkoutSlug, HOST).pathname.replace(/\/$/, ''), 'Buy now did not open the CMS checkout page');
      const bought = await checkoutReady(page, scope);
      assert.equal((await readCart(context, bought.cartKey)).items.length, 1, 'Buy now did not retain its server cart');
      report.checks.push({ type: 'buy-now', viewport: viewport.name, cartKeyRetained: true, realOrders: 0, ok: true });
      assert.equal(report.errors.length, 0, 'Unexpected browser/checkout errors occurred');
    } catch (error) {
      report.status = 'FAIL';
      report.errors.push(viewport.name + ': ' + redact(error?.message || error).slice(0, 1000));
      console.error('MARINEAQUA_CART_CHECKOUT_DIAGNOSTIC', safeJson({ viewport: viewport.name, currentUrl: safeUrl(page.url()), checks: report.checks, navigation: report.navigation, network: report.network, errors: report.errors }));
      try { await screenshot(page, viewport.name + '-failure.png'); }
      catch (screenshotError) { report.screenshots.push({ error: redact(screenshotError?.message || screenshotError).slice(0, 300) }); }
      throw error;
    } finally {
      await cleanup(scope);
      await context.close();
    }
    if (report.status === 'FAIL') throw Error('Transient cart cleanup failed');
  }
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  if (!report.errors.length) report.errors.push(redact(error?.message || error).slice(0, 1000));
  process.exitCode = 1;
} finally {
  console.log('MARINEAQUA_CART_CHECKOUT_CLEANUP', safeJson(report.cleanup));
  console.log('MARINEAQUA_CART_CHECKOUT_LIVE_QA=' + report.status, safeJson({ checks: report.checks.length, realOrders: 0, errors: report.errors }));
  await writeFile(DIR + '/report.json', safeJson(report, 2) + '\n');
  await browser.close();
}
