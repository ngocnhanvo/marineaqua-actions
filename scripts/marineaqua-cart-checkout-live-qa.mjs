import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const HOST = 'https://marine-aqua.io.vn';
const DIR = 'cart-checkout-evidence';
const STORAGE_KEY = 'esc-cart-storage';
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && ['--scope=shipping-fee', '--scope=account-cart', '--scope=checkout-readiness', '--scope=checkout-billing', '--scope=commerce-header', '--scope=checkout-payments', '--scope=checkout-consent'].includes(args[0])), 'Supported scopes: shipping-fee, account-cart, checkout-readiness, checkout-billing, commerce-header, checkout-payments, checkout-consent; omit the flag for the full suite');
const QA_SCOPE = args.length ? args[0].split('=')[1] : 'full';
const QA_VIEWPORTS = [
  ...(QA_SCOPE === 'commerce-header' ? [{ name: 'desktop-wide', width: 1920, height: 1080 }] : []),
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
].filter(viewport => QA_SCOPE !== 'checkout-readiness' || viewport.name === 'mobile');
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
const BILLING_LOCALITY = { billing_state: 'Tỉnh QA', billing_city: 'Phường QA', order_comments: 'Kiểm tra giao diện — không tạo đơn' };
const BILLING_PASSWORD = 'QA-Only-Not-An-Account-2026';
const report = { status: 'STARTED', scope: QA_SCOPE, checkedAt: new Date().toISOString(), checks: [], navigation: [], network: [], cleanup: [], screenshots: [], errors: [] };
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
    if (['account-cart', 'checkout-billing', 'commerce-header', 'checkout-payments', 'checkout-consent'].includes(QA_SCOPE) && response) {
      const actualUrl = new URL(response.url());
      if (actualUrl.origin === HOST && ['/gio-hang', '/thanh-toan'].includes(actualUrl.pathname.replace(/\/+$/, ''))) {
        diagnostic.stage = 'RESPONSE_CACHE_POLICY';
        const headers = response.headers();
        const cacheControl = headers['cache-control'] || '';
        const vary = headers.vary || '';
        const directives = cacheControl.toLowerCase().split(',').map(value => value.split('=', 1)[0].trim());
        diagnostic.cachePolicy = {
          cacheControl, vary,
          private: directives.includes('private'),
          noStore: directives.includes('no-store'),
          variesByCookie: vary.toLowerCase().split(',').some(value => value.trim() === 'cookie'),
        };
        assert.equal(diagnostic.cachePolicy.private, true, check + ': SSR response must be private');
        assert.equal(diagnostic.cachePolicy.noStore, true, check + ': SSR response must be no-store');
        assert.equal(diagnostic.cachePolicy.variesByCookie, true, check + ': SSR response must vary by Cookie');
      }
    }
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
  const privateFields = 'input:not([type]), input[type="text"], input[type="password"], input[type="email"], input[type="tel"], input[type="search"], input[type="url"], input[type="number"], textarea, select, pre, code' +
    (QA_SCOPE === 'account-cart' ? ', [data-account-name], [data-account-email]' : '');
  await page.screenshot({ path: DIR + '/' + name, fullPage: true, animations: 'disabled', timeout: 5000, mask: [page.locator(privateFields)] });
  report.screenshots.push(name);
}
async function checkLayout(page, viewport, name) {
  const widths = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  assert.ok(widths.content <= widths.viewport + 2, name + ' has horizontal overflow: ' + widths.content + ' > ' + widths.viewport);
  report.checks.push({ type: name + '-layout', viewport, ...widths, ok: true });
}
const normalizedText = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
function normalizedDestination(value) {
  const url = new URL(value, HOST);
  return url.origin + (url.pathname.replace(/\/+$/, '') || '/') + url.search + url.hash;
}
function cartTotals(cart) {
  assert.ok(cart?.totals && typeof cart.totals === 'object', 'Server cart totals are missing');
  const totals = {};
  for (const key of ['subtotal', 'discount_total', 'total_tax', 'total']) {
    const value = cart.totals[key];
    assert.ok(value !== undefined && value !== null && value !== '', 'Server cart total missing: ' + key);
    totals[key] = Number(value);
    assert.ok(Number.isFinite(totals[key]), 'Server cart total is not numeric: ' + key);
  }
  return totals;
}
function assertCartUnchanged(before, after, label) {
  assert.equal(after.cart_key, before.cart_key, label + ': cart identity changed');
  assert.deepEqual(cartTotals(after), cartTotals(before), label + ': server totals changed');
  assert.equal(after.items.length, before.items.length, label + ': item count changed');
  for (const item of before.items) {
    const match = after.items.find(candidate => candidate.item_key === item.item_key);
    assert.ok(match && quantity(match) === quantity(item), label + ': item identity or quantity changed');
  }
}
async function readShippingSummary(page, labels, kind) {
  const row = page.locator('[data-shipping-fee]');
  await row.waitFor({ state: 'visible' });
  assert.equal(await row.count(), 1, kind + ': shipping row is missing or duplicated');
  return row.evaluate((element, { labels, kind }) => {
    const norm = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    const visible = node => Boolean(node && node.getClientRects().length && getComputedStyle(node).display !== 'none');
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const slot = element.closest('[data-checkout-shipping-fee]');
    const positionNode = slot || element;
    const container = positionNode.parentElement;
    const children = [...container.children];
    const findRow = label => children.find(child => [...child.querySelectorAll('span')].some(span => norm(span.textContent) === label));
    const amounts = {};
    const positions = {};
    for (const [field, label] of Object.entries(labels)) {
      const amountRow = findRow(label);
      const amount = amountRow?.querySelector(':scope > span:last-child') ||
        amountRow?.firstElementChild?.querySelector(':scope > span:last-child');
      amounts[field] = { visible: visible(amountRow), text: norm(amount?.textContent) };
      positions[field] = amountRow ? children.indexOf(amountRow) : -1;
    }
    const totalRow = findRow(labels.total);
    const links = [...element.querySelectorAll('a')];
    const link = links[0];
    const labelNode = element.querySelector(':scope > span');
    return {
      kind, label: norm(labelNode?.textContent), linkCount: links.length,
      link: link ? { text: norm(link.textContent), href: link.href, target: link.target, rel: [...link.relList] } : null,
      withinCheckoutSlot: Boolean(slot && slot.closest('#checkout-cart-container')),
      immediatelyBeforeTotal: positionNode.nextElementSibling === totalRow,
      shippingPosition: children.indexOf(positionNode), positions, amounts,
      geometry: {
        row: rect(element), label: labelNode ? rect(labelNode) : null, link: link ? rect(link) : null,
        textFits: element.scrollWidth <= element.clientWidth + 1,
      },
    };
  }, { labels, kind });
}
function assertShippingSummary(summary, serverCart, saved, expectedHref) {
  const label = summary.kind;
  assert.equal(summary.label, 'Phí giao hàng:', label + ': wrong shipping label');
  assert.equal(summary.linkCount, 1, label + ': agreement must be one link');
  assert.equal(summary.link?.text, 'Thỏa thuận', label + ': wrong agreement text');
  assert.equal(normalizedDestination(summary.link.href), normalizedDestination(expectedHref), label + ': shipping destination differs from the CMS Header link');
  assert.equal(summary.link.target, '_blank', label + ': agreement must open a new tab');
  for (const token of ['noopener', 'noreferrer']) assert.ok(summary.link.rel.includes(token), label + ': missing ' + token);
  assert.equal(summary.immediatelyBeforeTotal, true, label + ': shipping row must be immediately before total');
  if (label.startsWith('checkout')) assert.equal(summary.withinCheckoutSlot, true, label + ': shared row is outside its checkout render slot');
  assert.ok(summary.positions.subtotal >= 0 && summary.positions.subtotal < summary.shippingPosition, label + ': shipping row must follow subtotal');
  for (const key of ['discount_total', 'total_tax']) {
    if (summary.amounts[key].visible) assert.ok(summary.positions[key] < summary.shippingPosition, label + ': shipping row is before ' + key);
  }
  assert.ok(summary.geometry.textFits && summary.geometry.label && summary.geometry.link &&
    summary.geometry.label.right <= summary.geometry.link.x + 1, label + ': shipping text overlaps or overflows');
  const totals = cartTotals(serverCart);
  const currency = saved.items[0]?.itemCurrency?.vi || 'VND';
  assert.match(currency, /^[A-Z]{3}$/, label + ': unsupported cart currency');
  const format = value => normalizedText(new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(value));
  for (const key of ['subtotal', 'discount_total', 'total_tax', 'total']) {
    assert.equal(Number(saved[key]), totals[key], label + ': browser and server totals differ for ' + key);
    const shown = summary.amounts[key];
    if (key === 'subtotal' || key === 'total' || totals[key] > 0) assert.equal(shown.visible, true, label + ': missing visible ' + key);
    if (shown.visible) {
      const prefix = key === 'discount_total' ? '- ' : key === 'total_tax' ? '+ ' : '';
      assert.equal(shown.text, prefix + format(totals[key]), label + ': displayed ' + key + ' differs from server total');
    }
  }
  return { totals, currency };
}
async function shippingPopup(page, scope, expectedHref, label) {
  const parentUrl = page.url();
  const responses = [];
  const started = Date.now();
  const onResponse = response => {
    const request = response.request();
    if (request.isNavigationRequest()) responses.push(response);
  };
  scope.context.on('response', onResponse);
  let popup;
  try {
    [popup] = await Promise.all([
      scope.context.waitForEvent('page', { timeout: RESPONSE_TIMEOUT }),
      page.locator('[data-shipping-fee] a').click({ timeout: DOM_TIMEOUT }),
    ]);
    await popup.waitForURL(url => url.href !== 'about:blank', { waitUntil: 'domcontentloaded', timeout: RESPONSE_TIMEOUT });
    await popup.waitForLoadState('domcontentloaded', { timeout: RESPONSE_TIMEOUT });
    assert.equal(normalizedDestination(popup.url()), normalizedDestination(expectedHref), label + ': new tab opened the wrong URL');
    const response = responses.findLast(candidate => {
      try { return candidate.request().frame().page() === popup && candidate.request().frame() === popup.mainFrame(); }
      catch { return false; }
    });
    assert.equal(response?.status(), 200, label + ': new tab did not return HTTP 200');
    assert.equal(normalizedText(await popup.locator('main h1').first().textContent({ timeout: DOM_TIMEOUT })), 'Phí ship hàng', label + ': new tab heading differs from the published shipping Page');
    assert.equal(await popup.evaluate(() => window.opener === null), true, label + ': new tab retains an opener');
    assert.equal(page.url(), parentUrl, label + ': clicking agreement navigated the original cart/checkout tab');
    const evidence = { check: label + '-shipping-popup', url: safeUrl(popup.url()), http: response.status(), elapsedMs: elapsed(started), openerNull: true, parentUnchanged: true, ok: true };
    report.navigation.push(evidence);
    return evidence;
  } finally {
    scope.context.off('response', onResponse);
    if (popup && !popup.isClosed()) await popup.close();
  }
}
async function shippingFeeQA(page, scope, saved) {
  const labels = await page.locator('#cart-content-wrapper').evaluate(element => {
    const text = JSON.parse(element.dataset.i18n || '{}');
    return { subtotal: text.summary_subtotal, discount_total: text.summary_discount, total_tax: text.summary_tax, total: text.summary_total };
  });
  assert.ok(Object.values(labels).every(label => typeof label === 'string' && label.trim()), 'Cart summary labels are unavailable');
  const headerLinks = await page.locator('header a[href]').evaluateAll(links => links
    .filter(link => (link.textContent || '').normalize('NFC').replace(/\s+/g, ' ').trim() === 'Phí ship hàng')
    .map(link => link.href));
  assert.ok(headerLinks.length, 'Published CMS Header shipping link is missing');
  const expectedHref = normalizedDestination(headerLinks[0]);
  assert.ok(headerLinks.every(href => normalizedDestination(href) === expectedHref), 'CMS Header shipping destinations disagree');
  assert.equal(new URL(expectedHref).origin, HOST, 'Shipping Page must belong to this production origin');
  assert.equal(new URL(expectedHref).pathname.replace(/\/$/, ''), '/thong-bao', 'Published shipping Page differs from the verified information-page checkpoint');
  const cartBefore = await readCart(scope.context, saved.cartKey);
  assert.equal(cartBefore.items.length, 1, 'Shipping QA requires one isolated cart item');
  assert.equal(quantity(cartBefore.items[0]), 1, 'Shipping QA must begin with quantity one');
  const cartSummary = await readShippingSummary(page, labels, 'cart');
  const cartMoney = assertShippingSummary(cartSummary, cartBefore, saved, expectedHref);
  const cartPopup = await shippingPopup(page, scope, expectedHref, scope.name + '-cart');
  const cartAfter = await readCart(scope.context, saved.cartKey);
  assertCartUnchanged(cartBefore, cartAfter, 'Cart shipping link');
  const cartSavedAfter = await state(page);
  assert.equal(cartSavedAfter.cartKey, saved.cartKey, 'Cart shipping link changed browser cart identity');
  assertShippingSummary(await readShippingSummary(page, labels, 'cart'), cartAfter, cartSavedAfter, expectedHref);
  report.checks.push({ type: 'shipping-fee-cart', viewport: scope.name, summary: cartSummary, ...cartMoney, popup: cartPopup, totalsUnchanged: true, ok: true });
  await checkLayout(page, scope.name, 'shipping-cart');
  await screenshot(page, scope.name + '-shipping-cart.png');

  await clickNavigation(page, '#btn-proceed-checkout', scope.name + '-shipping-cart-checkout-navigation');
  const checkoutSaved = await checkoutReady(page, scope);
  assert.equal(checkoutSaved.cartKey, saved.cartKey, 'Shipping QA lost the cart across checkout navigation');
  const checkoutBefore = await readCart(scope.context, saved.cartKey);
  assertCartUnchanged(cartAfter, checkoutBefore, 'Cart to checkout navigation');
  const initialSummary = await readShippingSummary(page, labels, 'checkout-initial');
  const initialMoney = assertShippingSummary(initialSummary, checkoutBefore, checkoutSaved, expectedHref);
  report.checks.push({ type: 'shipping-fee-checkout-initial', viewport: scope.name, summary: initialSummary, ...initialMoney, totalsUnchangedFromCart: true, ok: true });

  // Checkout regenerates its summary HTML after quantity updates. The shared
  // server-rendered shipping row must be cloned back exactly once each time.
  const oldRow = await page.locator('[data-shipping-fee]').elementHandle();
  assert.ok(oldRow, 'Checkout shipping row disappeared before update');
  try {
    await clickMutation(page, '#checkout-cart-container .btn-qty-plus', '/api/cart/update');
    await until(async () => quantity((await state(page))?.items?.[0]) === 2, 'Checkout quantity did not increase to two');
    await until(() => oldRow.evaluate(element => !element.isConnected), 'Checkout did not replace the old shipping row during its render');
  } finally {
    await oldRow.dispose();
  }
  const updatedSaved = await checkoutReady(page, scope);
  const updatedCart = await readCart(scope.context, saved.cartKey);
  assert.equal(updatedCart.items.length, 1, 'Checkout update changed the isolated item count');
  assert.equal(updatedCart.items[0].item_key, checkoutBefore.items[0].item_key, 'Checkout update replaced the cart item');
  assert.equal(quantity(updatedCart.items[0]), 2, 'Server cart did not retain checkout quantity two');
  assert.equal(updatedSaved.cartKey, saved.cartKey, 'Checkout quantity update changed cart identity');
  const updatedSummary = await readShippingSummary(page, labels, 'checkout-after-update');
  const updatedMoney = assertShippingSummary(updatedSummary, updatedCart, updatedSaved, expectedHref);
  const checkoutPopup = await shippingPopup(page, scope, expectedHref, scope.name + '-checkout');
  const finalCart = await readCart(scope.context, saved.cartKey);
  assertCartUnchanged(updatedCart, finalCart, 'Checkout shipping link');
  const finalSaved = await state(page);
  assert.equal(finalSaved.cartKey, saved.cartKey, 'Checkout shipping link changed browser cart identity');
  assertShippingSummary(await readShippingSummary(page, labels, 'checkout-after-popup'), finalCart, finalSaved, expectedHref);
  report.checks.push({ type: 'shipping-fee-checkout-render-after-update', viewport: scope.name, quantityBefore: 1, quantityAfter: 2, summary: updatedSummary, ...updatedMoney, popup: checkoutPopup, totalsUnchangedByLink: true, ok: true });
  await checkLayout(page, scope.name, 'shipping-checkout');
  await screenshot(page, scope.name + '-shipping-checkout.png');
  assert.equal(scope.mock.records.length, 0, 'Shipping QA unexpectedly attempted checkout');
  assert.equal(await page.locator('#terms-checkbox').isChecked(), false, 'Shipping QA must not accept checkout terms');
  assert.equal(await page.locator('#createaccount').isChecked(), false, 'Shipping QA must remain a guest');
  report.checks.push({ type: 'shipping-fee-no-order', viewport: scope.name, interceptedCheckoutPosts: 0, realOrders: 0, ok: true });
}
const ACCOUNT_COOKIE = 'esc_user_session';
const ACCOUNT_FIXTURE = {
  id: 2147483647, name: 'Marine Aqua QA synthetic profile', email: 'account-qa@example.invalid',
  billing: { first_name: 'Marine Aqua QA synthetic profile', email: 'account-qa@example.invalid', phone: '', address_1: '', chuthe: 'ca_nhan', cccd: '' },
};
const ACCOUNT_PASSWORD = 'browser-only-qa-password';
let accountContract;
async function accountCmsContract(context) {
  if (accountContract) return accountContract;
  const response = await context.request.get(HOST + '/data/cms-common.json', { timeout: API_TIMEOUT });
  assert.equal(response.status(), 200, 'Published CMS registry is unavailable');
  const data = await response.json();
  const pages = (data.pages || []).filter(page => page.key === 'account' && page.lang === 'vi');
  assert.equal(pages.length, 1, 'Expected one Vietnamese account Page in the published registry');
  assert.equal(pages[0].action, 'AccountPage', 'Account Page must use the dedicated component');
  assert.equal(pages[0].slug, 'tai-khoan', 'Unexpected account Page slug');
  accountContract = { id: pages[0].id, href: HOST + '/tai-khoan' };
  report.checks.push({ type: 'account-cms-contract', pageId: accountContract.id, path: '/tai-khoan', action: 'AccountPage', live: true, ok: true });
  return accountContract;
}
async function assertEmptyGuestInfo(response, label) {
  assert.ok([200, 401].includes(response.status()), label + ': unexpected guest info HTTP status');
  const data = await response.json();
  // Never print an unexpected response body: it could contain private data.
  assert.ok(data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0, label + ': unauthenticated info was not an empty object');
  assert.ok((response.headers()['cache-control'] || '').includes('no-store'), label + ': guest info must not be cached');
  return { http: response.status(), emptyObject: true, noStore: true };
}
async function invalidAccountCookies(context) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, iat: now, exp: now + 300, user: ACCOUNT_FIXTURE })).toString('base64url');
  const probes = [
    { label: 'malformed', value: 'not-a-session-token' },
    { label: 'legacy-unsigned', value: encodeURIComponent(JSON.stringify(ACCOUNT_FIXTURE)) },
    { label: 'tampered-signature', value: 'v1.' + payload + '.' + 'A'.repeat(43) },
  ];
  for (const probe of probes) {
    privateValues.add(probe.value);
    const response = await context.request.get(HOST + '/api/user/info', {
      headers: { Cookie: ACCOUNT_COOKIE + '=' + probe.value }, timeout: API_TIMEOUT,
    });
    const outcome = await assertEmptyGuestInfo(response, probe.label);
    report.checks.push({ type: 'account-invalid-cookie', case: probe.label, live: true, endpoint: '/api/user/info', ...outcome, ok: true });
  }
  assert.equal((await context.cookies(HOST)).some(cookie => cookie.name === ACCOUNT_COOKIE), false, 'Negative probes persisted an authentication cookie');
}
async function installAccountGuards(scope) {
  for (const value of [ACCOUNT_FIXTURE.name, ACCOUNT_FIXTURE.email, ACCOUNT_PASSWORD]) privateValues.add(value);
  const auth = { viewport: scope.name, mode: 'live', loginOutcome: 'reject', logoutOutcome: 'reject', cartWritesAllowed: false, records: [], blocked: [], liveInfoGets: 0 };
  (report.auth ||= []).push(auth);
  scope.auth = auth;
  await scope.context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
    const block = async reason => {
      auth.blocked.push({ method, path, reason });
      report.errors.push(scope.name + ': unexpected request was blocked: ' + method + ' ' + path);
      await route.abort('blockedbyclient');
    };
    const fulfill = async (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'private, no-store' }, body: JSON.stringify(body) });
    if (/^\/api\/(?:user\/order|orders?)(?:\/|$)|^\/wp-json\/(?:wc\/[^/]+|custom\/[^/]+)\/orders?(?:\/|$)/.test(path)) {
      await block('Order reads and writes are outside this QA'); return;
    }
    if (path === '/api/user/login' || path === '/api/user/logout') {
      if (url.origin !== HOST || method !== 'POST') { await block('Unexpected auth origin or method'); return; }
      if (path.endsWith('/login')) {
        let body; try { body = request.postDataJSON(); } catch { body = {}; }
        const fixtureMatched = body?.username === ACCOUNT_FIXTURE.email && body?.password === ACCOUNT_PASSWORD && body?.rememberme === false;
        if (!fixtureMatched) { await block('Login payload is not the synthetic browser fixture'); return; }
        const success = auth.loginOutcome === 'success';
        auth.records.push({ path, method, simulated: true, fixtureMatched: true, http: success ? 200 : 401 });
        if (success) auth.mode = 'profile';
        await fulfill(success ? 200 : 401, success ? { ok: true, data: { display_name: ACCOUNT_FIXTURE.name, billing: ACCOUNT_FIXTURE.billing } } : { ok: false, msg: 'QA_MOCK_LOGIN_REJECTED' });
      } else {
        const success = auth.logoutOutcome === 'success';
        auth.records.push({ path, method, simulated: true, http: success ? 200 : 500 });
        if (success) auth.mode = 'live';
        await fulfill(success ? 200 : 500, { success, error: success ? undefined : 'QA_MOCK_LOGOUT_REJECTED' });
      }
      return;
    }
    if (path === '/api/user/info') {
      if (url.origin !== HOST || method !== 'GET') { await block('Unexpected profile request'); return; }
      if (auth.mode === 'profile') {
        auth.records.push({ path, method, simulated: true, http: 200 });
        await fulfill(200, ACCOUNT_FIXTURE);
      } else {
        auth.liveInfoGets++;
        await route.fallback();
      }
      return;
    }
    if (path === '/api/cart/checkout') { await route.fallback(); return; }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && [HOST, 'https://admin.marine-aqua.io.vn'].includes(url.origin)) {
      if (url.origin === HOST && auth.cartWritesAllowed && ['/api/cart/add', '/api/cart/update', '/api/cart/del'].includes(path)) {
        await route.fallback(); return;
      }
      await block('Only own transient-cart mutations and mocked auth are allowed'); return;
    }
    await route.fallback();
  });
}
async function accountUiQA(page, scope) {
  const contract = await accountCmsContract(scope.context);
  if (scope.name === 'desktop') await invalidAccountCookies(scope.context);
  await navigate(page, HOST + '/', scope.name + '-account-home');
  let selector = '#header-contacts a[data-header-action="account"]';
  if (scope.name === 'mobile') {
    await page.locator('#hamburger-btn').click();
    await page.locator('#mobile-menu-container').waitFor({ state: 'visible' });
    selector = '#mobile-menu-container a[data-header-action="account"]';
  }
  const accountLink = page.locator(selector);
  assert.equal(await accountLink.count(), 1, 'Actual account link is missing or duplicated');
  assert.equal(normalizedDestination(await accountLink.getAttribute('href')), contract.href, 'Header account link differs from the CMS Page');
  const [guestInfo] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/user/info' && response.request().method() === 'GET', { timeout: RESPONSE_TIMEOUT + DOM_TIMEOUT + API_TIMEOUT }),
    clickNavigation(page, selector, scope.name + '-actual-account-navigation'),
  ]);
  const guestResponse = await assertEmptyGuestInfo(guestInfo, scope.name + ' guest');
  assert.equal(normalizedDestination(page.url()), contract.href, 'Header did not open the account Page');
  assert.equal(normalizedText(await page.locator('main h1').textContent()), 'Tài khoản', 'Account Page heading is incorrect');
  await page.locator('[data-account-guest]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-account-profile]').isVisible(), false, 'Guest account incorrectly shows a profile');
  assert.equal(await page.locator('#account-page a[href="#"], #login-form a[href="#"]').count(), 0, 'Account exposes an unresolved placeholder link');
  await checkLayout(page, scope.name, 'account-guest');
  await screenshot(page, scope.name + '-account-guest.png');
  report.checks.push({ type: 'account-live-guest-navigation', viewport: scope.name, entry: scope.name === 'mobile' ? 'hamburger-account-utility' : 'desktop-header-account', ...guestResponse, live: true, ok: true });

  const form = page.locator('#login-form'), submit = form.locator('button[type="submit"]');
  const labels = await form.evaluate(node => JSON.parse(node.dataset.i18n || '{}'));
  await submit.click();
  assert.equal(scope.auth.records.length, 0, 'Empty login form attempted authentication');
  assert.ok(await form.evaluate(node => !node.checkValidity()), 'Login required-field validation did not run');
  await page.locator('#login-username').fill(ACCOUNT_FIXTURE.email);
  await page.locator('#login-password').fill(ACCOUNT_PASSWORD);
  await page.locator('#toggle-password').click();
  assert.equal(await page.locator('#login-password').getAttribute('type'), 'text', 'Password visibility control did not reveal the fixture');
  await page.locator('#toggle-password').click();
  assert.equal(await page.locator('#login-password').getAttribute('type'), 'password', 'Password visibility control did not conceal the fixture');
  await submit.click();
  await page.locator('#login-error-message').waitFor({ state: 'visible' });
  assert.equal(normalizedText(await page.locator('#login-error-text').textContent()), labels.login_failed, 'Mocked login rejection did not show the safe localized message');
  assert.equal(await submit.isEnabled(), true, 'Rejected login did not restore its button');
  assert.equal(scope.auth.records.filter(record => record.path === '/api/user/login').length, 1, 'Mock login rejection was duplicated');
  report.checks.push({ type: 'account-login-ui-rejection', viewport: scope.name, simulated: true, requiredFields: true, passwordToggle: true, localizedError: true, ok: true });

  scope.auth.loginOutcome = 'success';
  await navigate(page, contract.href, scope.name + '-mock-login-reload', () => submit.click());
  await page.locator('[data-account-profile]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-account-guest]').isVisible(), false, 'Simulated profile still shows the guest form');
  assert.equal(normalizedText(await page.locator('[data-account-name]').textContent()), ACCOUNT_FIXTURE.name, 'Simulated profile name is missing');
  assert.equal(normalizedText(await page.locator('[data-account-email]').textContent()), ACCOUNT_FIXTURE.email, 'Simulated profile email is missing');
  await screenshot(page, scope.name + '-account-profile-mocked.png');
  report.checks.push({ type: 'account-profile-ui', viewport: scope.name, simulated: true, liveAuthentication: false, renderedFixture: true, ok: true });

  const accountLabels = await page.locator('#account-page').evaluate(node => JSON.parse(node.dataset.i18n || '{}'));
  await page.locator('[data-account-logout]').click();
  await page.locator('[data-account-error]').waitFor({ state: 'visible' });
  assert.equal(normalizedText(await page.locator('[data-account-error-text]').textContent()), accountLabels.logout_failed, 'Mocked logout error is not localized');
  assert.equal(await page.locator('[data-account-profile]').isVisible(), true, 'Rejected logout hid the simulated profile');
  assert.equal(await page.locator('[data-account-logout]').isEnabled(), true, 'Rejected logout did not unlock its button');
  scope.auth.logoutOutcome = 'success';
  const [finalGuestInfo] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/user/info' && response.request().method() === 'GET', { timeout: RESPONSE_TIMEOUT + DOM_TIMEOUT + API_TIMEOUT }),
    navigate(page, contract.href, scope.name + '-mock-logout-reload', () => page.locator('[data-account-logout]').click()),
  ]);
  await assertEmptyGuestInfo(finalGuestInfo, scope.name + ' post-mock guest');
  await page.locator('[data-account-guest]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-account-profile]').isVisible(), false, 'Mocked logout did not restore guest view');
  assert.equal(scope.auth.records.filter(record => record.path === '/api/user/login').length, 2, 'Unexpected login request count');
  assert.equal(scope.auth.records.filter(record => record.path === '/api/user/logout').length, 2, 'Unexpected logout request count');
  assert.equal((await scope.context.cookies(HOST)).some(cookie => cookie.name === ACCOUNT_COOKIE), false, 'Browser mocks must not create a real authentication session');
  report.checks.push({ type: 'account-logout-ui', viewport: scope.name, simulated: true, rejectionPreservesProfile: true, successRestoresGuest: true, liveAuthentication: false, ok: true });
  scope.auth.cartWritesAllowed = true;
}
async function singleProductName(page, saved, kind) {
  const container = kind === 'cart' ? '#cart-list-container' : '#checkout-cart-container';
  const names = page.locator(container + ' [data-cart-product-name]');
  assert.equal(await names.count(), saved.items.length, kind + ': main product name count differs from cart items');
  const details = [];
  for (const item of saved.items) {
    const rawName = typeof item.itemName === 'object' ? item.itemName?.vi : item.itemName;
    const name = await page.evaluate(value => {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = String(value || '').replace(/<[^>]*>/g, '');
      return textarea.value.normalize('NFC').replace(/\s+/g, ' ').trim();
    }, rawName);
    assert.ok(name, kind + ': expected main product name is empty');
    const matched = names.filter({ hasText: name });
    assert.equal(await matched.count(), 1, kind + ': main product name is duplicated');
    assert.equal(normalizedText(await matched.textContent()), name, kind + ': main product name changed');
    const duplication = await matched.evaluate(element => {
      const norm = node => (node.textContent || '').normalize('NFC').replace(/\s+/g, ' ').trim();
      const siblings = [...element.parentElement.children].filter(node => node !== element);
      return {
        blueParagraphs: siblings.filter(node => /(?:^|\s)text-blue-/.test(node.className)).length,
        duplicateParagraphs: siblings.filter(node => norm(node) === norm(element)).length,
      };
    });
    assert.equal(duplication.blueParagraphs, 0, kind + ': secondary blue product paragraph remains');
    assert.equal(duplication.duplicateParagraphs, 0, kind + ': duplicate product paragraph remains');
    const variants = item.variations?.vi || [];
    const removal = page.locator(container + ' .btn-remove-item').filter({ visible: true });
    assert.equal(await removal.count(), saved.items.length, kind + ': remove controls were lost');
    let control;
    if (variants.length) {
      const selector = page.locator(container + ' custom-select');
      assert.ok(await selector.count(), kind + ': variation selector was lost');
      assert.equal(await selector.first().isVisible(), true, kind + ': variation selector is hidden');
      assert.ok(normalizedText(await selector.first().locator('.trigger-label').textContent()), kind + ': selected variation label is blank');
      control = 'variation';
    } else {
      for (const direction of ['plus', 'minus']) {
        const button = page.locator(container + ' .btn-qty-' + direction);
        assert.equal(await button.count(), saved.items.length, kind + ': quantity controls were lost');
        assert.equal(await button.first().isVisible(), true, kind + ': quantity control is hidden');
        assert.equal(Number(await button.first().getAttribute('data-qty')), quantity(item), kind + ': displayed quantity changed');
      }
      control = 'quantity; variation not applicable to this simple-product fixture';
    }
    details.push({ mainNameCount: 1, secondaryBlueParagraphs: 0, duplicateParagraphs: 0, control });
  }
  return details;
}
async function accountCartQA(page, scope, saved) {
  const labels = await page.locator('#cart-content-wrapper').evaluate(element => {
    const text = JSON.parse(element.dataset.i18n || '{}');
    return { subtotal: text.summary_subtotal, discount_total: text.summary_discount, total_tax: text.summary_tax, total: text.summary_total };
  });
  const shippingHref = await page.locator('header a[href]').evaluateAll(links => links.find(link =>
    (link.textContent || '').normalize('NFC').replace(/\s+/g, ' ').trim() === 'Phí ship hàng')?.href);
  assert.ok(shippingHref && normalizedDestination(shippingHref) === HOST + '/thong-bao', 'Published shipping policy link changed');
  const cart = await readCart(scope.context, saved.cartKey);
  const cartNames = await singleProductName(page, saved, 'cart');
  const cartSummary = await readShippingSummary(page, labels, 'cart');
  const cartMoney = assertShippingSummary(cartSummary, cart, saved, shippingHref);
  await checkLayout(page, scope.name, 'account-cart');
  await screenshot(page, scope.name + '-account-cart.png');
  report.checks.push({ type: 'single-product-name-cart', viewport: scope.name, names: cartNames, shippingLinkPreserved: true, ...cartMoney, ok: true });
  await clickNavigation(page, '#btn-proceed-checkout', scope.name + '-account-cart-checkout');
  const checkoutSaved = await checkoutReady(page, scope);
  const checkout = await readCart(scope.context, saved.cartKey);
  assertCartUnchanged(cart, checkout, 'Cart/checkout presentation changes');
  const checkoutNames = await singleProductName(page, checkoutSaved, 'checkout');
  const checkoutSummary = await readShippingSummary(page, labels, 'checkout');
  const checkoutMoney = assertShippingSummary(checkoutSummary, checkout, checkoutSaved, shippingHref);
  await checkLayout(page, scope.name, 'account-checkout');
  await screenshot(page, scope.name + '-account-checkout.png');
  report.checks.push({ type: 'single-product-name-checkout', viewport: scope.name, names: checkoutNames, shippingLinkPreserved: true, totalsUnchanged: true, ...checkoutMoney, ok: true });
  assert.equal(scope.mock.records.length, 0, 'Account/cart QA attempted checkout');
  assert.equal(scope.auth.blocked.length, 0, 'An unexpected auth/order request was blocked');
  assert.ok(scope.auth.records.every(record => record.simulated === true), 'Authentication request escaped browser mocks');
  report.checks.push({ type: 'account-cart-safety', viewport: scope.name, authSimulationOnly: true, checkoutPosts: 0, orderRequests: 0, realOrders: 0, ok: true });
}
async function installCommerceHeaderGuards(scope, purpose = 'commerce Header') {
  scope.commerceGuard = { blocked: [] };
  await scope.context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
    const sensitive = /^\/api\/(?:user|orders?)(?:\/|$)/.test(path) ||
      /^\/wp-json\/.*\/(?:login|logout|users?|customers?|orders?)(?:\/|$)/.test(path);
    const ownCartWrite = url.origin === HOST && method === 'POST' && ['/api/cart/add', '/api/cart/update', '/api/cart/del'].includes(path);
    if (sensitive || (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !ownCartWrite)) {
      scope.commerceGuard.blocked.push({ method, url: safeUrl(url.href) });
      report.errors.push(scope.name + ': ' + purpose + ' QA blocked an unexpected request: ' + method + ' ' + safeUrl(url.href));
      await route.abort('blockedbyclient');
      return;
    }
    await route.fallback();
  });
}
async function catalogTree(page, selector) {
  const container = page.locator(selector);
  assert.equal(await container.count(), 1, selector + ': expected exactly one category container');
  return container.evaluate(element => {
    const norm = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    const read = list => [...(list?.children || [])].filter(node => node.matches('li.marine-category-tree-item')).map(item => {
      const details = item.querySelector(':scope > details');
      const link = details
        ? details.querySelector(':scope > .marine-category-tree-children > a.marine-category-tree-all')
        : item.querySelector(':scope > a.marine-category-tree-leaf');
      const name = details
        ? details.querySelector(':scope > summary .marine-category-tree-name')
        : link?.querySelector('.marine-category-tree-name');
      const url = link?.getAttribute('href') ? new URL(link.getAttribute('href'), location.origin) : null;
      return { label: norm(name?.textContent), href: url ? url.origin + url.pathname.replace(/\/+$/, '') : '',
        children: details ? read(details.querySelector(':scope > .marine-category-tree-children > ul.marine-category-tree')) : [] };
    });
    return read(element.querySelector('ul.marine-category-tree'));
  });
}
const flattenCatalog = tree => tree.flatMap(node => [node, ...flattenCatalog(node.children)]);
async function commerceCategoryOracle(page, scope) {
  // The known-working product archive is a separate route/data path from the
  // commerce SSR route under repair. Compare the full ordered tree, not a count.
  const desktop = await catalogTree(page, '#header-product-catalog-panel');
  const mobile = await catalogTree(page, '#mobile-menu-container .marine-mobile-menu-categories');
  assert.deepEqual(mobile, desktop, 'Working archive desktop/mobile category trees differ');
  const flat = flattenCatalog(desktop);
  assert.ok(desktop.length > 0 && flat.length > desktop.length, 'Working archive must supply a nonempty nested category oracle');
  for (const node of flat) {
    assert.ok(node.label && node.href, 'Category oracle contains a missing label or destination');
    const url = new URL(node.href);
    assert.equal(url.origin, HOST, 'Category oracle destination is outside the storefront');
    assert.ok(!['giam-gia-khung', 'uncategorized', 'khong-phan-loai'].includes(decodeURIComponent(url.pathname.split('/').pop())), 'Excluded category leaked into the Header tree');
  }
  assert.equal(new Set(flat.map(node => node.href)).size, flat.length, 'Category oracle contains duplicate destinations');
  if (report.categoryOracle) assert.deepEqual(desktop, report.categoryOracle.tree, 'Working category oracle changed between viewports');
  else report.categoryOracle = { source: 'working WordPress-backed product archive Header', url: safeUrl(page.url()), tree: desktop, nodes: flat.length };
  scope.catalogOracle = desktop;
  report.checks.push({ type: 'commerce-category-oracle', viewport: scope.name, source: safeUrl(page.url()), roots: desktop.length, nodes: flat.length, orderedTreeCaptured: true, desktopMobileParity: true, excludedCategoriesAbsent: true, ok: true });
}
async function commerceAlignment(page, scope, kind) {
  const selector = '[data-commerce-container="' + kind + '"]';
  assert.equal(await page.locator(selector).count(), 1, kind + ': commerce container marker missing or duplicated');
  const measured = await page.locator(selector).evaluate((element, mobile) => {
    const rect = node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width }; };
    const heading = element.querySelector('h1');
    const header = document.querySelector('#header-navrow > div');
    return { container: rect(element), heading: heading ? rect(heading) : null,
      header: mobile ? null : header ? rect(header) : null,
      viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth };
  }, scope.name === 'mobile');
  assert.ok(measured.heading, kind + ': page heading missing');
  assert.ok(Math.abs(measured.heading.left - measured.container.left) <= 1, kind + ': heading is offset from the commerce content edge');
  if (scope.name === 'mobile') {
    assert.ok(Math.abs(measured.container.left - 16) <= 1 && Math.abs(measured.viewport - measured.container.right - 16) <= 1, kind + ': mobile content must retain 16px gutters');
  } else {
    assert.ok(measured.header, kind + ': desktop Header container missing');
    assert.ok(Math.abs(measured.container.left - measured.header.left) <= 1, kind + ': left content edge does not align with Header');
    assert.ok(Math.abs(measured.container.right - measured.header.right) <= 1, kind + ': right content edge does not align with Header');
  }
  assert.ok(measured.content <= measured.viewport + 2, kind + ': horizontal overflow');
  report.checks.push({ type: 'commerce-header-alignment', viewport: scope.name, page: kind, ...measured, tolerancePx: 1, ok: true });
}
async function openCommerceCatalog(page, scope) {
  const mobile = scope.name === 'mobile';
  const trigger = page.locator(mobile ? '#hamburger-btn' : '[data-header-catalog-trigger]').filter({ visible: true }).first();
  const panel = page.locator(mobile ? '#mobile-menu-container' : '#header-product-catalog-panel');
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await trigger.waitFor({ state: 'visible' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'Category menu must start closed');
  await trigger.click();
  await panel.waitFor({ state: 'visible' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'Category trigger did not expand');
  const category = page.locator(mobile ? '#mobile-menu-container .marine-mobile-menu-categories' : '#header-product-catalog-panel');
  if (mobile) {
    assert.equal(normalizedText(await category.locator('h2').textContent()), 'Danh mục sản phẩm', 'Mobile category title is missing');
    await category.locator('h2').scrollIntoViewIfNeeded();
  } else assert.equal(normalizedText(await trigger.textContent()), 'Danh mục sản phẩm', 'Desktop category title is missing');
  return { trigger, panel, category };
}
async function commerceCatalogInteraction(page, scope, kind) {
  const desktop = await catalogTree(page, '#header-product-catalog-panel');
  const mobile = await catalogTree(page, '#mobile-menu-container .marine-mobile-menu-categories');
  assert.deepEqual(desktop, scope.catalogOracle, kind + ': desktop categories differ from the working archive');
  assert.deepEqual(mobile, scope.catalogOracle, kind + ': mobile categories differ from the working archive');
  const { trigger, panel, category } = await openCommerceCatalog(page, scope);
  const branch = category.locator('details.marine-category-tree-details').first();
  assert.ok(await branch.count(), kind + ': nested category interaction cannot be verified');
  const summary = branch.locator(':scope > summary');
  const initial = await branch.evaluate(element => element.open);
  await summary.click();
  assert.equal(await branch.evaluate(element => element.open), !initial, kind + ': first category click did not toggle');
  await summary.click();
  assert.equal(await branch.evaluate(element => element.open), initial, kind + ': second category click did not close/restore');
  const bounds = await panel.evaluate(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, viewport: document.documentElement.clientWidth }; });
  assert.ok(bounds.left >= -1 && bounds.right <= bounds.viewport + 1, kind + ': menu extends horizontally outside the viewport');
  // Current viewport only: preserve the actual open menu and its internal scroll.
  const imageName = scope.name + '-commerce-' + kind + '-menu.png';
  await page.screenshot({ path: DIR + '/' + imageName, fullPage: false, animations: 'disabled', timeout: 5000,
    mask: [page.locator('input:not([type="checkbox"]):not([type="radio"]), textarea, select, pre, code')] });
  report.screenshots.push(imageName);
  await trigger.click();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false', kind + ': second Header click did not close the menu');
  report.checks.push({ type: 'commerce-header-categories', viewport: scope.name, page: kind, nodes: flattenCatalog(desktop).length, fullOrderedTreeParity: true, menuOpenClose: true, nestedSecondClickRestoresState: true, menuWithinViewport: true, ok: true });
}
async function commerceHeaderQA(page, scope, saved) {
  const before = await readCart(scope.context, saved.cartKey);
  await commerceAlignment(page, scope, 'cart');
  await screenshot(page, scope.name + '-commerce-cart.png');
  await commerceCatalogInteraction(page, scope, 'cart');
  await clickNavigation(page, '#btn-proceed-checkout', scope.name + '-commerce-cart-checkout');
  const checkout = await checkoutReady(page, scope);
  assert.ok(checkout.cartKey === saved.cartKey, 'Commerce Header fix changed the cart session');
  await commerceAlignment(page, scope, 'checkout');
  await screenshot(page, scope.name + '-commerce-checkout.png');
  await commerceCatalogInteraction(page, scope, 'checkout');
  const { category } = await openCommerceCatalog(page, scope);
  // A real tree may have only parent categories at its top level. Expand
  // visible branches by clicking until a leaf destination is actually visible.
  for (let depth = 0; depth < 8 && !(await category.locator('a.marine-category-tree-leaf').filter({ visible: true }).count()); depth++) {
    const summary = category.locator('details.marine-category-tree-details:not([open]) > summary').filter({ visible: true }).first();
    assert.ok(await summary.count(), 'No expandable category branch exposes a leaf destination');
    await summary.click();
  }
  const leaf = category.locator('a.marine-category-tree-leaf').filter({ visible: true }).first();
  assert.ok(await leaf.count(), 'No category destination is available for click navigation');
  const destination = normalizedDestination(await leaf.getAttribute('href'));
  assert.ok(flattenCatalog(scope.catalogOracle).some(node => node.href === destination), 'Clicked destination is absent from the working category oracle');
  await navigate(page, destination, scope.name + '-commerce-category-navigation', () => leaf.click({ timeout: DOM_TIMEOUT }));
  assert.equal(normalizedDestination(page.url()), destination, 'Category link did not navigate to its real destination');
  assertCartUnchanged(before, await readCart(scope.context, saved.cartKey), 'Header menu navigation');
  assert.equal(scope.commerceGuard.blocked.length, 0, 'Unexpected auth/order or mutation request occurred');
  assert.equal(scope.mock.records.length, 0, 'Header QA attempted checkout');
  report.checks.push({ type: 'commerce-category-navigation', viewport: scope.name, destination, cartPreserved: true, ok: true });
  report.checks.push({ type: 'commerce-header-safety', viewport: scope.name, liveAuthenticationRequests: 0, orderRequests: 0, checkoutPosts: 0, realOrders: 0, realAccounts: 0, ok: true });
}
async function installBillingGuards(scope) {
  scope.billingGuard = { blocked: [], interceptedCheckoutPosts: 0 };
  for (const value of [...Object.values(VALID_BILLING), ...Object.values(BILLING_LOCALITY), BILLING_PASSWORD]) privateValues.add(value);
  await scope.context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
    const sensitive = /^\/api\/(?:user|orders?)(?:\/|$)/.test(path) ||
      /^\/wp-json\/.*\/(?:login|logout|users?|customers?|orders?)(?:\/|$)/.test(path);
    const ownCartWrite = url.origin === HOST && method === 'POST' && ['/api/cart/add', '/api/cart/update', '/api/cart/del'].includes(path);
    const mockedCheckout = url.origin === HOST && method === 'POST' && path === '/api/cart/checkout';
    if (sensitive || (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !ownCartWrite && !mockedCheckout)) {
      scope.billingGuard.blocked.push({ method, url: safeUrl(url.href) });
      report.errors.push(scope.name + ': billing QA blocked an unexpected request: ' + method + ' ' + safeUrl(url.href));
      await route.abort('blockedbyclient');
      return;
    }
    if (mockedCheckout) scope.billingGuard.interceptedCheckoutPosts++;
    await route.fallback();
  });
}
function billingPayloadProjection(payload) {
  const billing = payload?.billing || {};
  return {
    name: billing.first_name === VALID_BILLING.billing_tenchuthe,
    phone: billing.phone === VALID_BILLING.billing_sodienthoai,
    email: billing.email === VALID_BILLING.billing_email,
    address: billing.address_1 === VALID_BILLING.billing_diachi,
    province: billing.state === BILLING_LOCALITY.billing_state,
    districtWard: billing.city === BILLING_LOCALITY.billing_city,
    note: payload?.customer_note === BILLING_LOCALITY.order_comments,
    terms: payload?.terms === true,
    noAccountPassword: payload?.account_password === '',
    noLegacyMetadata: !Object.hasOwn(billing, 'chuthe') && !Object.hasOwn(billing, 'cccd'),
  };
}
async function billingLayoutQA(page, scope) {
  const card = page.locator('[data-checkout-billing-card]');
  await card.waitFor({ state: 'visible' });
  assert.equal(await card.count(), 1, 'Billing card is missing or duplicated');
  const snapshot = await card.evaluate(element => {
    const visible = node => Boolean(node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const field = node => ({
      name: node.name, placeholder: node.getAttribute('placeholder'), required: node.required,
      type: node.type, autocomplete: node.autocomplete, labelled: Boolean(node.labels?.length || node.getAttribute('aria-label')),
      empty: node.value === '', radius: Number.parseFloat(getComputedStyle(node).borderRadius), ...rect(node),
    });
    const heading = element.querySelector('#checkout-billing-title');
    const fields = [...element.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"]), textarea')].filter(visible).map(field);
    const checkbox = element.querySelector('#createaccount');
    return {
      card: { ...rect(element), background: getComputedStyle(element).backgroundColor, radius: Number.parseFloat(getComputedStyle(element).borderRadius) },
      heading: { text: heading?.textContent?.trim(), fontSize: Number.parseFloat(getComputedStyle(heading).fontSize) },
      fields, checkbox: { label: checkbox?.closest('label')?.textContent?.replace(/\s+/g, ' ').trim(), checked: checkbox?.checked, ...rect(checkbox) },
      legacyVisible: [...element.querySelectorAll('[name="billing_chuthe"], [name="billing_cccd"]')].filter(visible).length,
    };
  });
  const expected = [
    ['billing_tenchuthe', 'Họ và tên *', 'billing name', true],
    ['billing_sodienthoai', 'Số điện thoại', 'billing tel', true],
    ['billing_email', 'Email *', 'billing email', true],
    ['billing_diachi', 'Địa chỉ *', 'billing address-line1', true],
    ['billing_state', 'Tỉnh / Thành phố', 'billing address-level1', false],
    ['billing_city', 'Quận / Huyện / Phường', 'billing address-level2', false],
    ['order_comments', 'Ghi chú đơn hàng', '', false],
  ];
  assert.deepEqual(snapshot.fields.map(field => field.name), expected.map(field => field[0]), 'Billing field order differs from the user reference');
  assert.equal(snapshot.heading.text, 'Thông tin thanh toán', 'Billing card heading differs from the reference');
  assert.ok(snapshot.heading.fontSize >= 19 && snapshot.heading.fontSize <= 21, 'Billing heading size differs from the reference');
  assert.equal(snapshot.card.background, 'rgb(255, 255, 255)', 'Billing card must have a white background');
  assert.ok(snapshot.card.radius >= 12, 'Billing card corner radius is missing');
  assert.equal(snapshot.legacyVisible, 0, 'Removed personal/organization or identity fields remain visible');
  for (const [index, [name, placeholder, autocomplete, required]] of expected.entries()) {
    const field = snapshot.fields[index];
    assert.equal(field.placeholder, placeholder, name + ': placeholder differs from the reference');
    assert.equal(field.required, required, name + ': required policy changed');
    assert.equal(field.labelled, true, name + ': accessible label is missing');
    assert.equal(field.empty, true, name + ': fresh guest form unexpectedly contains data');
    if (autocomplete) assert.equal(field.autocomplete, autocomplete, name + ': autocomplete purpose is incorrect');
    assert.ok(field.radius >= 11 && field.radius <= 13, name + ': field corner radius differs from the reference');
    if (name !== 'order_comments') assert.ok(field.height >= 48 && field.height <= 52, name + ': field height differs from the reference');
  }
  const [name, phone, email, address, province, district, note] = snapshot.fields;
  for (const [index, field] of [name, phone, email, address].entries()) {
    assert.ok(Math.abs(field.x - name.x) <= 1 && Math.abs(field.width - name.width) <= 1, field.name + ': field is not full width');
    if (index) assert.ok(field.y - snapshot.fields[index - 1].bottom >= 14 && field.y - snapshot.fields[index - 1].bottom <= 18, field.name + ': vertical spacing differs from the reference');
  }
  assert.ok(name.x - snapshot.card.x >= 23 && name.x - snapshot.card.x <= 26, 'Billing card padding differs from the reference');
  assert.ok(province.y - address.bottom >= 14 && province.y - address.bottom <= 18, 'Locality row spacing differs from the reference');
  if (scope.name === 'desktop') {
    assert.ok(Math.abs(province.y - district.y) <= 1 && Math.abs(province.width - district.width) <= 1, 'Desktop localities must use two equal columns');
    assert.ok(district.x - province.right >= 10 && district.x - province.right <= 14, 'Desktop locality column gap differs from the reference');
    assert.ok(Math.abs(province.x - name.x) <= 1 && Math.abs(district.right - name.right) <= 1, 'Desktop localities do not span the card');
  } else {
    assert.ok(district.y > province.bottom && Math.abs(province.width - name.width) <= 1 && Math.abs(district.width - name.width) <= 1, 'Mobile localities must stack at full width');
  }
  assert.equal(snapshot.checkbox.label, 'Tạo tài khoản mới?', 'Create-account label differs from the reference');
  assert.equal(snapshot.checkbox.checked, false, 'Fresh checkout unexpectedly enables account creation');
  assert.ok(snapshot.checkbox.y > Math.max(province.bottom, district.bottom) && note.y > snapshot.checkbox.bottom, 'Checkbox and notes must follow the locality fields');
  assert.ok(Math.abs(note.x - name.x) <= 1 && Math.abs(note.width - name.width) <= 1 && note.height >= 98 && note.height <= 104, 'Order notes size differs from the reference');
  await checkLayout(page, scope.name, 'checkout-billing');
  await screenshot(page, scope.name + '-checkout-billing.png');
  // This crop is deliberately taken only after proving every visible field is
  // blank in a fresh guest context, so placeholders remain reviewable without PII.
  const cardScreenshot = scope.name + '-checkout-billing-card.png';
  await card.screenshot({ path: DIR + '/' + cardScreenshot, animations: 'disabled', timeout: 5000 });
  report.screenshots.push(cardScreenshot);
  report.checks.push({ type: 'checkout-billing-reference-layout', viewport: scope.name, fields: snapshot.fields.map(({ name, placeholder, required, labelled, autocomplete, height, width }) => ({ name, placeholder, required, labelled, autocomplete, height, width })), localities: scope.name === 'desktop' ? 'two-equal-columns' : 'stacked', legacyControlsVisible: 0, blankGuestScreenshot: true, ok: true });
}
async function checkoutBillingQA(page, scope, saved) {
  await clickNavigation(page, '#btn-proceed-checkout', scope.name + '-billing-cart-checkout');
  await checkoutReady(page, scope);
  const form = page.locator('#checkout-form'), submit = page.locator('#submit-checkout-btn'), terms = page.locator('#terms-checkbox');
  let methods = await form.evaluate(node => JSON.parse(node.dataset.paymentMethods || '[]'));
  let paymentRetry = false;
  if (!methods.length) {
    const messages = await form.evaluate(node => JSON.parse(node.dataset.checkoutMessages || '{}'));
    const warning = page.locator('#checkout-cart-container + div [role="status"]').filter({ hasText: messages.payment_unavailable });
    assert.equal(await warning.count(), 1, 'Empty gateway metadata does not have the explicit unavailable state');
    assert.equal(await warning.isVisible(), true, 'Payment unavailable state is hidden');
    paymentRetry = true;
    await navigate(page, page.url(), scope.name + '-billing-payment-fresh-get');
    await checkoutReady(page, scope);
    methods = await form.evaluate(node => JSON.parse(node.dataset.paymentMethods || '[]'));
  }
  assert.ok(methods.length, 'Configured payment options are unavailable after at most one fresh GET');
  await billingLayoutQA(page, scope);
  assert.equal(await terms.isChecked(), false, 'Terms must start unchecked');
  assert.equal(await submit.isDisabled(), true, 'Submit must stay disabled before accepting terms');
  await terms.check();
  await until(async () => await submit.isEnabled(), 'Nonempty checkout did not enable submission after terms');
  await submit.click();
  for (const name of Object.keys(VALID_BILLING)) assert.equal(await page.locator('[name="' + name + '"]').evaluate(input => input.validity.valueMissing), true, name + ': blank required field was accepted');
  assert.equal(scope.mock.records.length, 0, 'Blank required fields submitted checkout');
  await fillValidGuestForm(page);
  assert.equal(await page.locator('#billing_state').inputValue(), '', 'Province should be optional and initially empty');
  assert.equal(await page.locator('#billing_city').inputValue(), '', 'District/ward should be optional and initially empty');
  await page.locator('#billing_email').fill('invalid-email');
  await submit.click();
  assert.equal(await page.locator('#billing_email').evaluate(input => input.validity.typeMismatch), true, 'Invalid email was accepted');
  assert.equal(scope.mock.records.length, 0, 'Invalid email submitted checkout');
  await page.locator('#billing_email').fill(VALID_BILLING.billing_email);
  report.checks.push({ type: 'checkout-billing-validation', viewport: scope.name, requiredFields: Object.keys(VALID_BILLING), emailType: true, localitiesOptional: true, termsGuard: true, configuredMethods: methods, freshGetRetries: Number(paymentRetry), ok: true });

  const createAccount = page.locator('#createaccount'), accountFields = page.locator('#create-account-fields'), password = page.locator('#account_password');
  assert.equal(await accountFields.isVisible(), false, 'Account fields must start hidden');
  assert.equal(await password.evaluate(input => input.required), false, 'Hidden password must not be required');
  await createAccount.check();
  await accountFields.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#account_username').inputValue(), VALID_BILLING.billing_email, 'Account username did not follow the billing email');
  assert.equal(await page.locator('#account_username').evaluate(input => input.readOnly), true, 'Account username must remain tied to billing email');
  assert.equal(await password.evaluate(input => input.required && input.validity.valueMissing), true, 'Creating an account must require a password');
  await submit.click();
  assert.equal(scope.mock.records.length, 0, 'Account creation without a password submitted checkout');
  await password.fill(BILLING_PASSWORD);
  await page.locator('#toggle-password-btn').click();
  assert.equal(await password.getAttribute('type'), 'text', 'Password visibility toggle failed');
  await page.locator('#toggle-password-btn').click();
  assert.equal(await password.getAttribute('type'), 'password', 'Password visibility toggle did not conceal the fixture');
  await createAccount.uncheck();
  assert.equal(await accountFields.isVisible(), false, 'Unchecking account creation did not hide its fields');
  assert.equal(await password.inputValue(), '', 'Unchecking account creation did not clear its password');
  assert.equal(await password.evaluate(input => input.required), false, 'Unchecking account creation did not clear the password requirement');
  report.checks.push({ type: 'checkout-billing-account-controls', viewport: scope.name, emailSynced: true, conditionalPasswordRequired: true, visibilityToggle: true, uncheckedClearsPassword: true, accountPosts: 0, ok: true });

  for (const [name, value] of Object.entries(BILLING_LOCALITY)) await page.locator('[name="' + name + '"]').fill(value);
  assert.equal(await form.evaluate(node => node.checkValidity()), true, 'Synthetic form with localities must be valid');
  const before = await readCart(scope.context, saved.cartKey);
  scope.mock.expected = true;
  scope.mock.status = 422;
  scope.mock.held = new Promise(resolve => { scope.mock.release = resolve; });
  await submit.click();
  await until(() => scope.mock.records.length === 1, 'Synthetic checkout was not intercepted');
  assert.equal(await submit.isDisabled(), true, 'Pending checkout did not lock submission');
  await form.evaluate(node => node.requestSubmit());
  await page.waitForTimeout(300);
  assert.equal(scope.mock.records.length, 1, 'Duplicate checkout escaped the submission guard');
  const record = scope.mock.records[0];
  assert.equal(record.createAccount, false, 'Guest payload attempted account creation');
  assert.equal(record.cartKeyPresent, true, 'Checkout payload lost the cart identity');
  assert.ok(methods.includes(record.paymentMethod), 'Checkout payload changed the configured payment method');
  for (const [name, matched] of Object.entries(record.billingProjection)) assert.equal(matched, true, 'Checkout payload mapping failed: ' + name);
  scope.mock.release();
  await until(async () => await submit.isEnabled(), 'Mocked rejection did not restore submission');
  await page.locator('#checkout-error').waitFor({ state: 'visible' });
  const errorMessage = await form.evaluate(node => JSON.parse(node.dataset.checkoutMessages || '{}').checkout_failed || '');
  assert.equal(normalizedText(await page.locator('#checkout-error').textContent()), errorMessage, 'Mocked rejection did not show a safe localized error');
  for (const [name, value] of Object.entries({ ...VALID_BILLING, ...BILLING_LOCALITY })) assert.equal(await page.locator('[name="' + name + '"]').inputValue(), value, 'Rejected checkout cleared field: ' + name);
  assertCartUnchanged(before, await readCart(scope.context, saved.cartKey), 'Mocked billing rejection');
  assert.equal(scope.billingGuard.blocked.length, 0, 'Unexpected auth/order or mutation request occurred');
  assert.equal(scope.billingGuard.interceptedCheckoutPosts, 1, 'Unexpected checkout request count');
  report.checks.push({ type: 'checkout-billing-payload-and-rejection', viewport: scope.name, simulated: true, fieldsMapped: record.billingProjection, duplicateGuard: true, valuesPreserved: true, cartPreserved: true, interceptedPosts: 1, liveOrders: 0, ok: true });
  report.checks.push({ type: 'checkout-billing-safety', viewport: scope.name, liveAuthenticationRequests: 0, orderRequests: 0, realOrders: 0, realAccounts: 0, checkoutPostsMocked: 1, ok: true });
}
async function checkoutConsentQA(page, scope, saved) {
  await clickNavigation(page, '#btn-proceed-checkout', scope.name + '-consent-cart-checkout');
  await checkoutReady(page, scope);
  const form = page.locator('#checkout-form'), terms = page.locator('#terms-checkbox'), submit = page.locator('#submit-checkout-btn');
  let methods = await form.evaluate(node => JSON.parse(node.dataset.paymentMethods || '[]'));
  let freshGetRetries = 0;
  if (!methods.length) {
    const messages = await form.evaluate(node => JSON.parse(node.dataset.checkoutMessages || '{}'));
    const warning = page.locator('#checkout-cart-container + div [role="status"]').filter({ hasText: messages.payment_unavailable });
    assert.equal(await warning.count(), 1, 'Missing methods must have the explicit unavailable state');
    assert.equal(await warning.isVisible(), true, 'Payment unavailable state must be visible');
    freshGetRetries++;
    await navigate(page, page.url(), scope.name + '-consent-payment-fresh-get');
    await checkoutReady(page, scope);
    methods = await form.evaluate(node => JSON.parse(node.dataset.paymentMethods || '[]'));
  }
  assert.ok(methods.length, 'Consent guard needs a configured payment method and nonempty cart');
  const label = form.locator('label').filter({ has: terms });
  assert.equal(await label.count(), 1, 'Consent checkbox must have exactly one containing label');
  const snapshot = await label.evaluate(element => ({
    text: element.textContent.normalize('NFC').replace(/\s+/g, ' ').trim(),
    links: [...element.querySelectorAll('a')].map(link => ({
      text: link.textContent.normalize('NFC').replace(/\s+/g, ' ').trim(), href: link.getAttribute('href'),
      target: link.target, rel: [...link.relList],
    })),
    required: element.querySelector('#terms-checkbox')?.required === true,
    textFits: element.scrollWidth <= element.clientWidth + 1,
  }));
  assert.equal(snapshot.text, 'Tôi đã đọc và đồng ý với điều khoản và điều kiện của website *', 'Consent label differs from the requested sentence');
  assert.equal(snapshot.links.length, 1, 'Consent must contain exactly one linked phrase');
  assert.equal(snapshot.links[0].text, 'điều khoản và điều kiện', 'Only the requested phrase may be linked');
  assert.equal(snapshot.links[0].href, '/chinh-sach-doi-tra-hang', 'Consent link must use the requested relative destination');
  assert.equal(snapshot.links[0].target, '_blank', 'Policy must open in a new tab');
  for (const token of ['noopener', 'noreferrer']) assert.ok(snapshot.links[0].rel.includes(token), 'Consent link is missing ' + token);
  assert.ok(snapshot.required && snapshot.textFits, 'Consent must remain required and fit its responsive container');
  assert.equal(await terms.isChecked(), false, 'Consent must start unchecked');
  assert.equal(await submit.isDisabled(), true, 'Unchecked consent must block checkout');
  report.checks.push({ type: 'checkout-consent-content', viewport: scope.name, ...snapshot, freshGetRetries, ok: true });
  await checkLayout(page, scope.name, 'checkout-consent');
  await screenshot(page, scope.name + '-checkout-consent.png');
  const consentImage = scope.name + '-checkout-consent-label.png';
  await label.screenshot({ path: DIR + '/' + consentImage, animations: 'disabled', timeout: 5000 });
  report.screenshots.push(consentImage);

  const parentUrl = page.url(), before = await readCart(scope.context, saved.cartKey);
  const responses = [];
  const onResponse = response => { if (response.request().isNavigationRequest()) responses.push(response); };
  scope.context.on('response', onResponse);
  let popup;
  try {
    [popup] = await Promise.all([
      scope.context.waitForEvent('page', { timeout: RESPONSE_TIMEOUT }),
      label.locator('a').click({ timeout: DOM_TIMEOUT }),
    ]);
    await popup.waitForURL(url => url.href !== 'about:blank', { waitUntil: 'domcontentloaded', timeout: RESPONSE_TIMEOUT });
    assert.equal(normalizedDestination(popup.url()), HOST + '/chinh-sach-doi-tra-hang', 'Policy popup opened a different Page');
    const response = responses.findLast(candidate => {
      try { return candidate.request().frame().page() === popup && candidate.request().frame() === popup.mainFrame(); }
      catch { return false; }
    });
    assert.equal(response?.status(), 200, 'Policy popup did not return HTTP 200');
    assert.equal(await popup.evaluate(() => window.opener === null), true, 'Policy popup retained an opener');
    const heading = normalizedText(await popup.locator('main h1').first().textContent({ timeout: DOM_TIMEOUT }));
    assert.ok(heading, 'Policy popup has no published heading');
    assert.equal(page.url(), parentUrl, 'Policy link navigated away from checkout');
    assert.equal(await terms.isChecked(), false, 'Clicking the link changed the consent checkbox');
    assert.equal(await submit.isDisabled(), true, 'Opening the policy bypassed the consent guard');
    assert.equal((await state(page))?.cartKey, saved.cartKey, 'Policy link lost browser cart identity');
    assertCartUnchanged(before, await readCart(scope.context, saved.cartKey), 'Checkout consent link');
    report.checks.push({ type: 'checkout-consent-policy-popup', viewport: scope.name, url: safeUrl(popup.url()), heading, http: response.status(), openerNull: true, parentUnchanged: true, checkboxUnchanged: true, cartPreserved: true, ok: true });
  } finally {
    scope.context.off('response', onResponse);
    if (popup && !popup.isClosed()) await popup.close();
  }
  await terms.check();
  await until(async () => await submit.isEnabled(), 'Accepting consent did not enable the eligible checkout');
  await terms.uncheck();
  await until(async () => await submit.isDisabled(), 'Removing consent did not disable checkout');
  assert.equal(scope.mock.records.length, 0, 'Consent-only QA attempted checkout');
  assert.equal(scope.commerceGuard.blocked.length, 0, 'Unexpected authentication, order or mutation request occurred');
  assert.equal(await page.locator('#createaccount').isChecked(), false, 'Consent-only QA must remain a guest');
  report.checks.push({ type: 'checkout-consent-toggle', viewport: scope.name, required: true, uncheckedDisabled: true, checkedEnabled: true, uncheckedAgainDisabled: true, checkoutPosts: 0, ok: true });
  report.checks.push({ type: 'checkout-consent-safety', viewport: scope.name, checkoutPosts: 0, realOrders: 0, realAccounts: 0, authenticationRequests: 0, ok: true });
}
async function installCheckoutPaymentsGuard(scope) {
  scope.payments = { blocked: [], interceptedCheckoutPosts: 0, receiptDocuments: 0, receiptUrl: '', receiptPath: '', cartKey: '', successState: null };
  for (const value of [...Object.values(VALID_BILLING), BILLING_PASSWORD]) privateValues.add(value);
  await scope.page.exposeBinding('__marineQaObserveCodCartReset', (_source, snapshot) => { scope.payments.successState = snapshot; });
  await scope.context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
    const block = async reason => {
      scope.payments.blocked.push({ method, url: safeUrl(url.href), reason });
      report.errors.push(scope.name + ': payment QA blocked an unexpected request: ' + method + ' ' + safeUrl(url.href));
      await route.abort('blockedbyclient');
    };
    // A synthetic receipt is fulfilled here before WordPress/Astro can look up
    // an order. Never let a fabricated order ID/key reach the real receipt route.
    const receipt = path.replace(/\/+$/, '') === '/dat-hang-thanh-cong' || /\/order-received(?:\/|$)/.test(path) || url.searchParams.has('order_key');
    if (receipt) {
      if (url.href !== scope.payments.receiptUrl || method !== 'GET' || !request.isNavigationRequest() || scope.mock.status !== 200) {
        await block('Only the exact mocked COD receipt document is permitted'); return;
      }
      scope.payments.receiptDocuments++;
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'Cache-Control': 'private, no-store' },
        body: '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>COD QA receipt fixture</title></head><body><main data-qa-mocked-cod-receipt>Điều hướng COD giả lập — không tạo đơn hàng</main></body></html>' });
      return;
    }
    const sensitive = /^\/api\/(?:user|orders?)(?:\/|$)/.test(path) ||
      /^\/wp-json\/.*\/(?:login|logout|users?|customers?|orders?)(?:\/|$)/.test(path);
    const ownCartWrite = url.origin === HOST && method === 'POST' && ['/api/cart/add', '/api/cart/update', '/api/cart/del'].includes(path);
    const mockedCheckout = url.origin === HOST && method === 'POST' && path === '/api/cart/checkout';
    if (sensitive || (request.isNavigationRequest() && url.origin !== HOST) ||
        (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !ownCartWrite && !mockedCheckout)) {
      await block('Only storefront reads, owned cart mutations and locally mocked checkout are permitted'); return;
    }
    if (mockedCheckout) scope.payments.interceptedCheckoutPosts++;
    await route.fallback();
  });
}
function checkoutPaymentPayloadProjection(payload, scope) {
  const billing = payload?.billing || {};
  let receiptPathMatches = false;
  try {
    const url = new URL(payload?.slugDone, HOST);
    receiptPathMatches = url.origin === HOST && url.pathname === scope.payments.receiptPath && !url.search && !url.hash;
  } catch { /* a malformed destination must fail the assertion */ }
  return {
    cartMatches: payload?.cartKey === scope.payments.cartKey,
    terms: payload?.terms === true,
    guest: payload?.create_account === false && payload?.account_password === '',
    name: billing.first_name === VALID_BILLING.billing_tenchuthe,
    phone: billing.phone === VALID_BILLING.billing_sodienthoai,
    email: billing.email === VALID_BILLING.billing_email,
    address: billing.address_1 === VALID_BILLING.billing_diachi,
    country: billing.country === 'VN',
    receiptPathMatches,
    noClientTotals: ['total', 'subtotal', 'amount', 'total_tax', 'shipping_total', 'discount_total', 'line_items'].every(key => !Object.hasOwn(payload || {}, key)),
  };
}
async function checkoutPaymentsQA(page, scope, saved) {
  await clickNavigation(page, '#btn-proceed-checkout', scope.name + '-payments-cart-checkout');
  await checkoutReady(page, scope);
  const form = page.locator('#checkout-form'), submit = page.locator('#submit-checkout-btn');
  let methods = await form.evaluate(node => JSON.parse(node.dataset.paymentMethods || '[]'));
  let paymentRetry = false;
  if (!methods.length) {
    const messages = await form.evaluate(node => JSON.parse(node.dataset.checkoutMessages || '{}'));
    const warning = page.locator('#checkout-cart-container + div [role="status"]').filter({ hasText: messages.payment_unavailable });
    assert.equal(await warning.count(), 1, 'Missing methods must have an explicit unavailable state');
    assert.equal(await warning.isVisible(), true, 'Payment unavailable state must be visible');
    paymentRetry = true;
    await navigate(page, page.url(), scope.name + '-payments-fresh-get');
    await checkoutReady(page, scope);
    methods = await form.evaluate(node => JSON.parse(node.dataset.paymentMethods || '[]'));
  }
  assert.deepEqual(methods, ['cod', 'bacs'], 'Checkout methods must be COD first, then the existing BACS method');
  const radios = await form.locator('input[name="payment_method"]').evaluateAll(inputs => inputs.map(input => ({
    id: input.value, title: input.closest('label')?.textContent?.normalize('NFC').replace(/\s+/g, ' ').trim(),
    checked: input.checked, enabled: input.matches(':enabled'), visible: Boolean(input.getClientRects().length),
  })));
  assert.deepEqual(radios.map(radio => radio.id), methods, 'Rendered payment controls differ from allowed server metadata');
  assert.equal(radios[0].title, 'Thanh toán khi nhận hàng', 'COD must have the requested Vietnamese label');
  assert.equal(radios[1].title, 'Chuyển khoản ngân hàng trực tiếp', 'Existing bank transfer label changed');
  assert.ok(radios.every(radio => radio.enabled && radio.visible), 'A configured payment option is hidden or disabled');
  assert.deepEqual(radios.map(radio => radio.checked), [true, false], 'COD must be selected by default in the former OnePayUS position');
  assert.equal(await page.locator('input[name="payment_method"][value="onepayus"]').count(), 0, 'OnePayUS remains in checkout');
  assert.doesNotMatch(normalizedText(await page.locator('#checkout-cart-container + div').textContent()), /onepayus/i, 'OnePayUS label remains visible');
  scope.payments.cartKey = saved.cartKey;
  const receiptPath = new URL(await page.locator('#checkout-data-bridge').getAttribute('data-slug-done'), HOST);
  assert.equal(receiptPath.origin, HOST, 'Receipt must stay on the storefront origin');
  assert.equal(receiptPath.pathname.replace(/\/+$/, ''), '/dat-hang-thanh-cong', 'Receipt route differs from the published commerce Page');
  assert.ok(!receiptPath.search && !receiptPath.hash, 'Configured receipt must not contain an order identifier');
  scope.payments.receiptPath = receiptPath.pathname;
  report.checks.push({ type: 'checkout-payment-options', viewport: scope.name, methods, labels: radios.map(radio => radio.title), codDefault: true, onepayAbsent: true, bacsPreserved: true, freshGetRetries: Number(paymentRetry), ok: true });
  await checkLayout(page, scope.name, 'checkout-payments');
  await screenshot(page, scope.name + '-checkout-payments.png');
  const paymentImage = scope.name + '-checkout-payments-section.png';
  await page.locator('#checkout-cart-container + div').screenshot({ path: DIR + '/' + paymentImage, animations: 'disabled', timeout: 5000 });
  report.screenshots.push(paymentImage);

  const cod = form.locator('input[name="payment_method"][value="cod"]');
  const bacs = form.locator('input[name="payment_method"][value="bacs"]');
  await bacs.check();
  assert.ok(await bacs.isChecked() && !(await cod.isChecked()), 'Bank transfer cannot be selected independently');
  assert.equal(await submit.isDisabled(), true, 'Changing payment method bypassed the terms guard');
  await cod.check();
  assert.ok(await cod.isChecked() && !(await bacs.isChecked()), 'COD cannot be selected again');
  report.checks.push({ type: 'checkout-payment-selection', viewport: scope.name, bacsSelectable: true, codSelectable: true, mutuallyExclusive: true, termsGuardPreserved: true, ok: true });

  const serverBefore = await readCart(scope.context, saved.cartKey);
  // Existing helper exercises required/email/terms validation, a held 422 with
  // duplicate-submit protection and 502 uncertainty. All POSTs remain mocked.
  await formValidation(page, scope);
  assertCartUnchanged(serverBefore, await readCart(scope.context, saved.cartKey), 'Mocked COD rejection and uncertainty');
  assert.equal(scope.mock.records.length, 2, 'Expected exactly the mocked rejection and uncertainty requests');
  assert.deepEqual(scope.mock.records.map(record => record.paymentMethod), ['cod', 'cod'], 'COD payload sent a different payment gateway');
  for (const record of scope.mock.records) {
    for (const [field, matches] of Object.entries(record.paymentProjection)) assert.equal(matches, true, 'COD payload failed: ' + field);
  }
  report.checks.push({ type: 'checkout-cod-payload', viewport: scope.name, simulated: true, paymentMethod: 'cod', guest: true, fieldsMapped: true, clientTotalsOmitted: true, localReceiptDestination: true, rejectionPreservesServerCart: true, ok: true });

  const account = page.locator('#createaccount'), password = page.locator('#account_password');
  await account.check();
  await page.locator('#create-account-fields').waitFor({ state: 'visible' });
  assert.equal(await password.evaluate(input => input.required && input.validity.valueMissing), true, 'Account creation must still require its password');
  await submit.click();
  assert.equal(scope.mock.records.length, 2, 'Account creation without password attempted checkout');
  await password.fill(BILLING_PASSWORD);
  await account.uncheck();
  assert.equal(await password.inputValue(), '', 'Returning to guest checkout must clear the account password');
  assert.equal(await password.evaluate(input => input.required), false, 'Guest COD must not require an account password');
  assert.equal(await form.evaluate(node => node.checkValidity()), true, 'Guest COD fixture must remain valid');
  report.checks.push({ type: 'checkout-cod-account-guard', viewport: scope.name, conditionalPasswordRequired: true, guestPasswordCleared: true, accountRequests: 0, ok: true });

  // Observe production's cart:updated listener before its confirmed-success
  // navigation. No test code clears storage or adjusts the Header itself.
  await page.evaluate(key => {
    window.addEventListener('cart:updated', () => {
      if (localStorage.getItem(key) !== null) return;
      const badges = [...document.querySelectorAll('.marine-header-cart-count')];
      const links = [...document.querySelectorAll('a[data-header-action="cart"]')];
      window.__marineQaObserveCodCartReset({
        storageRemoved: true, badgeCount: badges.length,
        badgesReset: badges.every(badge => badge.textContent === '0' && badge.classList.contains('hidden')),
        cartLinkCount: links.length,
        cartLinksReset: links.every(link => !new URL(link.href).searchParams.has('cart_key')),
      }).catch(() => {});
    });
  }, STORAGE_KEY);
  const receipt = new URL(scope.payments.receiptPath, HOST);
  receipt.searchParams.set('order_id', '2147483647');
  receipt.searchParams.set('order_key', 'wc_order_marine_qa_mock_only');
  privateValues.add('wc_order_marine_qa_mock_only');
  scope.payments.receiptUrl = receipt.href;
  scope.mock.expected = true;
  scope.mock.status = 200;
  scope.mock.held = Promise.resolve();
  await navigate(page, receipt.href, scope.name + '-mocked-cod-success-navigation', () => submit.click());
  await page.locator('[data-qa-mocked-cod-receipt]').waitFor();
  assert.equal(page.url(), receipt.href, 'Confirmed COD did not navigate to the safe local receipt');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null, 'Confirmed COD did not clear persisted browser cart');
  await until(() => Boolean(scope.payments.successState), 'Confirmed COD did not emit a cart reset before navigation');
  const reset = scope.payments.successState;
  assert.ok(reset.storageRemoved && reset.badgeCount > 0 && reset.badgesReset && reset.cartLinkCount > 0 && reset.cartLinksReset, 'Confirmed COD left the old Header badge or cart links');
  assert.equal(scope.payments.receiptDocuments, 1, 'Mocked receipt navigation must occur exactly once');
  assert.equal(scope.mock.records.length, 3, 'Confirmed COD submitted an unexpected number of requests');
  assert.deepEqual(scope.mock.records.map(record => record.mockHttp), [422, 502, 200], 'Unexpected mock response sequence');
  assert.ok(scope.mock.records.every(record => record.paymentMethod === 'cod' && record.createAccount === false), 'A mocked COD submission used another method or attempted an account');
  for (const [field, matches] of Object.entries(scope.mock.records.at(-1).paymentProjection)) assert.equal(matches, true, 'Confirmed COD payload failed: ' + field);
  // A browser mock cannot claim server-side COD completion. The actual owned
  // fixture still exists here and is removed using its retained identity in finally.
  assertCartUnchanged(serverBefore, await readCart(scope.context, saved.cartKey), 'Browser-only mocked COD success');
  report.checks.push({ type: 'checkout-cod-confirmed-client-success', viewport: scope.name, simulated: true, safeLocalReceipt: true, receiptDocumentMocked: true, serverOrderLookup: false, ...reset, ownedFixtureRetainedForCleanup: true, ok: true });
  assert.equal(scope.payments.blocked.length, 0, 'Unexpected auth/order/payment request occurred');
  assert.equal(scope.payments.interceptedCheckoutPosts, 3, 'Not all checkout requests passed through the safety guard');
  report.checks.push({ type: 'checkout-payments-safety', viewport: scope.name, mockedCheckoutPosts: 3, liveCheckoutPosts: 0, realOrders: 0, realAccounts: 0, authenticationRequests: 0, payments: 0, emails: 0, receiptDocumentsMocked: 1, ok: true });
}
async function installCheckoutReadinessGuard(scope) {
  scope.readiness = { blocked: [], documentRequests: 0 };
  await scope.context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const sensitivePath = /^\/api\/(?:user|orders?|cart)(?:\/|$)/.test(url.pathname) ||
      /^\/wp-json\/.*\/(?:login|logout|users?|customers?|orders?)(?:\/|$)/.test(url.pathname);
    const checkoutDocument = request.isNavigationRequest() && url.origin === HOST && url.pathname.replace(/\/+$/, '') === '/thanh-toan';
    if (checkoutDocument) scope.readiness.documentRequests++;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) || sensitivePath ||
        (checkoutDocument && (url.search || scope.readiness.documentRequests > 2))) {
      const blocked = { method, url: safeUrl(url.href) };
      scope.readiness.blocked.push(blocked);
      report.errors.push('Read-only payment QA blocked an unexpected request: ' + method + ' ' + blocked.url);
      await route.abort('blockedbyclient');
      return;
    }
    await route.fallback();
  });
}
async function checkoutPaymentSnapshot(page, attempt) {
  await page.locator('#checkout-form').waitFor({ state: 'visible' });
  await page.locator('#checkout-cart-container [role="status"]').waitFor({ state: 'visible' });
  const snapshot = await page.locator('#checkout-form').evaluate(form => {
    const norm = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const messages = JSON.parse(form.dataset.checkoutMessages || '{}');
    const section = document.querySelector('#checkout-cart-container + div');
    const warningText = norm(messages.payment_unavailable);
    const warnings = [...(section?.querySelectorAll('[role="status"]') || [])].filter(element => norm(element.textContent) === warningText);
    const serverCart = JSON.parse(document.querySelector('#checkout-data-bridge')?.getAttribute('data-cart') || 'null');
    return {
      methods: JSON.parse(form.dataset.paymentMethods || 'null'),
      radios: [...form.querySelectorAll('input[name="payment_method"]')].map(input => ({
        id: input.value, title: norm(input.closest('label')?.textContent),
        visible: visible(input), enabled: input.matches(':enabled'), checked: input.checked,
      })),
      paymentSectionPresent: Boolean(section?.querySelector('h4')),
      warningLabelPresent: Boolean(warningText),
      warningCount: warnings.length,
      visibleWarnings: warnings.filter(visible).length,
      cartUnavailable: form.dataset.cartUnavailable !== 'false',
      builderPreview: form.dataset.builderPreview !== 'false',
      serverCartKeyPresent: Boolean(serverCart?.cart_key),
      serverCartItems: Array.isArray(serverCart?.items) ? serverCart.items.length : 0,
      emptyCartVisible: [...form.querySelectorAll('#checkout-cart-container [role="status"]')].some(element => visible(element) && norm(element.textContent) === norm(messages.cart_empty)),
      submitDisabled: form.querySelector('#submit-checkout-btn')?.disabled === true,
    };
  });
  const navigation = report.navigation.at(-1);
  Object.assign(snapshot, { attempt, http: navigation?.http, responseMs: navigation?.responseMs, elapsedMs: navigation?.elapsedMs });
  report.paymentConfiguration.attempts.push(snapshot);
  assert.ok(Array.isArray(snapshot.methods) && snapshot.methods.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id)), 'Payment metadata must be an array of public gateway IDs');
  assert.equal(new Set(snapshot.methods).size, snapshot.methods.length, 'Payment gateway IDs are duplicated');
  assert.ok(snapshot.paymentSectionPresent && snapshot.warningLabelPresent, 'Payment section or localized unavailable label is missing');
  assert.equal(snapshot.cartUnavailable, false, 'Empty-cart visit unexpectedly reports a cart-service failure');
  assert.equal(snapshot.builderPreview, false, 'Payment readiness must use the production page');
  assert.equal(snapshot.serverCartKeyPresent, false, 'Read-only payment QA must not use a server cart');
  assert.equal(snapshot.serverCartItems, 0, 'Read-only payment QA must have no server cart items');
  assert.ok(snapshot.emptyCartVisible && snapshot.submitDisabled, 'Empty-cart UI must remain visible and submission disabled');
  const controlsMatch = snapshot.radios.length === snapshot.methods.length && snapshot.radios.every((radio, index) =>
    radio.id === snapshot.methods[index] && radio.title && radio.visible && radio.enabled);
  snapshot.ready = snapshot.methods.length > 0 && controlsMatch && snapshot.radios.filter(radio => radio.checked).length === 1 && snapshot.visibleWarnings === 0;
  snapshot.coherentUnavailable = snapshot.methods.length === 0 && snapshot.radios.length === 0 && snapshot.warningCount === 1 && snapshot.visibleWarnings === 1;
  snapshot.state = snapshot.ready ? 'READY' : snapshot.coherentUnavailable ? 'UNAVAILABLE' : 'INCONSISTENT';
  console.log('MARINEAQUA_PAYMENT_CONFIGURATION', safeJson(snapshot));
  await screenshot(page, scopeScreenshot(attempt));
  const sectionName = scopeScreenshot(attempt).replace('.png', '-payment-section.png');
  await page.locator('#checkout-cart-container + div').screenshot({ path: DIR + '/' + sectionName, animations: 'disabled', timeout: 5000 });
  report.screenshots.push(sectionName);
  return snapshot;
}
const scopeScreenshot = attempt => 'mobile-checkout-readiness-' + attempt + '.png';
async function checkoutReadinessQA(page, scope) {
  report.paymentConfiguration = {
    purpose: 'payment-configuration-only; empty cart; no order-readiness claim',
    viewport: scope.name, readOnly: true, maxFreshGetRetries: 1, retryUsed: false, outcome: 'STARTED', attempts: [],
  };
  await navigate(page, HOST + '/thanh-toan', scope.name + '-payment-configuration-initial');
  const initial = await checkoutPaymentSnapshot(page, 'initial');
  let final = initial;
  // These options are server-rendered. Only the explicit unavailable state
  // permits one fresh GET; a UI mismatch or navigation failure is never retried.
  if (initial.coherentUnavailable) {
    report.paymentConfiguration.retryUsed = true;
    await navigate(page, HOST + '/thanh-toan', scope.name + '-payment-configuration-fresh-get');
    final = await checkoutPaymentSnapshot(page, 'fresh-get');
  }
  report.paymentConfiguration.outcome = initial.ready ? 'FIRST_GET_READY' :
    final.ready ? 'RECOVERED_AFTER_FRESH_GET' : final.coherentUnavailable ? 'STILL_UNAVAILABLE' : 'INCONSISTENT';
  assert.equal(final.ready, true, 'Mobile payment configuration is not ready: ' + report.paymentConfiguration.outcome);
  assert.equal(scope.readiness.documentRequests, report.paymentConfiguration.attempts.length, 'Unexpected checkout document navigation occurred');
  assert.equal(scope.readiness.blocked.length, 0, 'A mutation, auth, order or cart request was blocked');
  assert.equal(scope.mock.records.length, 0, 'Read-only payment QA attempted checkout');
  const saved = await state(page);
  assert.ok(!saved?.cartKey && !(saved?.items?.length) && scope.carts.size === 0, 'Read-only payment QA unexpectedly created a cart');
  report.checks.push({ type: 'checkout-payment-configuration-readiness', viewport: scope.name, outcome: report.paymentConfiguration.outcome, firstGetReady: initial.ready, finalReady: true, freshGetRetries: Number(report.paymentConfiguration.retryUsed), methods: final.methods, visibleEnabledControls: final.radios.length, unavailableWarningVisible: false, emptyCartSubmitDisabled: true, ok: true });
  report.checks.push({ type: 'checkout-readiness-read-only', viewport: scope.name, cartMutations: 0, authenticationRequests: 0, orderRequests: 0, checkoutPosts: 0, realOrders: 0, ok: true });
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
  for (const viewport of QA_VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: 'block', ...(viewport.name === 'mobile' && ['checkout-readiness', 'checkout-billing', 'commerce-header', 'checkout-payments', 'checkout-consent'].includes(QA_SCOPE) ? { isMobile: true, hasTouch: true } : {}) });
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
      const mockHttp = QA_SCOPE === 'checkout-payments' && scope.mock.status === 200 ? 200 : scope.mock.status === 502 ? 502 : 422;
      const marker = mockHttp === 502 ? MOCK_UNCERTAIN : MOCK_REJECTION;
      scope.mock.records.push({ cartKeyPresent: Boolean(payload?.cartKey), createAccount: payload?.create_account === true, paymentMethod: String(payload?.payment_method || ''), mockHttp,
        ...(QA_SCOPE === 'checkout-billing' ? { billingProjection: billingPayloadProjection(payload) } : {}),
        ...(QA_SCOPE === 'checkout-payments' ? { paymentProjection: checkoutPaymentPayloadProjection(payload, scope) } : {}),
      });
      if (!scope.mock.expected) report.errors.push(viewport.name + ': unexpected checkout POST was safely intercepted');
      let timer;
      await Promise.race([scope.mock.held, new Promise(resolve => { timer = setTimeout(resolve, 10000); })]);
      clearTimeout(timer);
      const body = mockHttp === 200
        ? { ok: true, data: { result: 'success', status: 'processing', redirect: scope.payments.receiptUrl } }
        : { ok: false, msg: marker };
      await route.fulfill({ status: mockHttp, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
    });
    if (QA_SCOPE === 'account-cart') await installAccountGuards(scope);
    if (QA_SCOPE === 'checkout-readiness') await installCheckoutReadinessGuard(scope);
    if (QA_SCOPE === 'checkout-billing') await installBillingGuards(scope);
    if (QA_SCOPE === 'commerce-header') await installCommerceHeaderGuards(scope);
    if (QA_SCOPE === 'checkout-consent') await installCommerceHeaderGuards(scope, 'checkout consent');
    if (QA_SCOPE === 'checkout-payments') await installCheckoutPaymentsGuard(scope);
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
      if (QA_SCOPE === 'checkout-readiness') {
        await checkoutReadinessQA(page, scope);
      } else {
      if (QA_SCOPE === 'account-cart') await accountUiQA(page, scope);
      await navigate(page, HOST + '/san-pham/korallen-zucht', viewport.name + '-product-archive');
      if (QA_SCOPE === 'commerce-header') await commerceCategoryOracle(page, scope);
      const productUrl = await selectSimpleProduct(page, viewport.name);
      const wrapper = page.locator('#data-content-wrapper');
      await wrapper.waitFor();
      const cartSlug = await wrapper.getAttribute('data-cart-slug');
      const checkoutSlug = await wrapper.getAttribute('data-checkout-slug');
      assert.ok(await wrapper.getAttribute('data-product-id'), 'WooCommerce product ID missing');
      assert.ok(cartSlug && checkoutSlug && cartSlug !== checkoutSlug, 'WordPress cart/checkout URLs missing');
      assert.equal(await page.locator('#main-action-btn').count(), 1, 'Add-to-cart unavailable');
      if (QA_SCOPE === 'full') await checkLayout(page, viewport.name, 'product');
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
      if (QA_SCOPE === 'shipping-fee') {
        await shippingFeeQA(page, scope, saved);
      } else if (QA_SCOPE === 'account-cart') {
        await accountCartQA(page, scope, saved);
      } else if (QA_SCOPE === 'checkout-billing') {
        await checkoutBillingQA(page, scope, saved);
      } else if (QA_SCOPE === 'commerce-header') {
        await commerceHeaderQA(page, scope, saved);
      } else if (QA_SCOPE === 'checkout-payments') {
        await checkoutPaymentsQA(page, scope, saved);
      } else if (QA_SCOPE === 'checkout-consent') {
        await checkoutConsentQA(page, scope, saved);
      } else {
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
      }
      }
      assert.equal(report.errors.length, 0, 'Unexpected browser/checkout errors occurred');
    } catch (error) {
      report.status = 'FAIL';
      report.errors.push(viewport.name + ': ' + redact(error?.message || error).slice(0, 1000));
      console.error('MARINEAQUA_CART_CHECKOUT_DIAGNOSTIC', safeJson({ viewport: viewport.name, currentUrl: safeUrl(page.url()), checks: report.checks, navigation: report.navigation, network: report.network, errors: report.errors }));
      try { await screenshot(page, viewport.name + '-failure.png'); }
      catch (screenshotError) { report.screenshots.push({ error: redact(screenshotError?.message || screenshotError).slice(0, 300) }); }
      throw error;
    } finally {
      if (QA_SCOPE === 'checkout-readiness') {
        const remaining = await state(page).catch(() => null);
        const empty = !remaining?.cartKey && !(remaining?.items?.length) && scope.carts.size === 0;
        report.cleanup.push({ viewport: scope.name, readOnly: true, createdCarts: 0, mutations: 0, remainingItems: remaining?.items?.length || 0, ok: empty });
        if (!empty) {
          report.errors.push('Read-only payment QA unexpectedly retained cart state; no deletion was attempted');
          report.status = 'FAIL';
          process.exitCode = 1;
        }
      } else await cleanup(scope);
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
  console.log('MARINEAQUA_CART_CHECKOUT_LIVE_QA=' + report.status, safeJson({ scope: QA_SCOPE, checks: report.checks.length, realOrders: 0, errors: report.errors }));
  await writeFile(DIR + '/report.json', safeJson(report, 2) + '\n');
  await browser.close();
}
