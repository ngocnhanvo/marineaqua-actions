import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const FRONT = 'https://marine-aqua.io.vn';
const OUT = 'account-header-status-evidence';
await mkdir(OUT, { recursive: true });
const report = { status: 'STARTED', cases: [], errors: [], mode: 'synthetic read-only API mocks' };
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { name: 'desktop', width: 1366, height: 850 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    let authenticated = false;
    await page.route('**/api/user/info', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie' },
        body: JSON.stringify(authenticated
          ? { id: 42, name: 'Synthetic Customer', email: 'fixture@example.invalid' }
          : {}),
      });
    });
    await page.route('**/api/user/logout', async route => {
      assert.equal(route.request().method(), 'POST', 'Logout request must be POST');
      authenticated = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
    const accountLink = page.locator(viewport.name === 'mobile'
      ? '#mobile-menu-container a[data-header-action="account"]'
      : '#header-contacts a[data-header-action="account"]');
    const dot = accountLink.locator('[data-account-online-dot]');
    async function visit() {
      const response = await page.goto(FRONT + '/tai-khoan', {
        waitUntil: 'domcontentloaded', timeout: 60000,
      });
      assert.equal(response?.status(), 200, 'Account page is not HTTP 200');
      await accountLink.waitFor({ state: 'attached', timeout: 12000 });
      if (viewport.name === 'mobile') {
        await page.locator('#hamburger-btn').click();
        await accountLink.waitFor({ state: 'visible', timeout: 10000 });
      }
    }

    await visit();
    assert.equal(await dot.count(), 1, 'Missing account dot element');
    assert.equal(await dot.isVisible(), false, 'Guest must not have a green dot');
    assert.ok(!(await accountLink.getAttribute('aria-label') || '').includes('Đã đăng nhập'),
      'Guest account label must not claim signed-in');
    report.cases.push({ viewport: viewport.name, case: 'guest: no green dot', ok: true });

    authenticated = true;
    await visit();
    await dot.waitFor({ state: 'visible', timeout: 12000 });
    assert.match(await accountLink.getAttribute('aria-label') || '', /Đã đăng nhập|Signed in/,
      'Signed-in account must expose accessible status');
    await page.locator('[data-account-profile]').waitFor({ state: 'visible', timeout: 12000 });
    report.cases.push({ viewport: viewport.name, case: 'verified user: green dot', ok: true });

    const panel = page.locator('#marine-account-panel');
    await accountLink.click();
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await accountLink.getAttribute('aria-expanded'), 'true', 'Account trigger must be expanded');
    assert.equal(await panel.locator('[data-account-panel-name]').innerText(), 'Synthetic Customer');
    assert.equal(await panel.locator('[data-account-panel-email]').innerText(), 'fixture@example.invalid');
    const orderLink = panel.locator('[data-account-orders]');
    assert.equal(await orderLink.count(), 1, 'Account panel must show the order-history item');
    const disabled = await orderLink.getAttribute('aria-disabled') === 'true';
    if (disabled) {
      assert.equal(await orderLink.getAttribute('href'), null,
        'Unpublished order history must not navigate to an invented route');
      assert.equal(await orderLink.evaluate(el => el.tagName), 'SPAN',
        'Unpublished order history must be non-interactive');
    } else {
      assert.match(await orderLink.getAttribute('href') || '', /^\//,
        'Published order history must use a real WordPress Page route');
    }
    assert.match(await orderLink.innerText(), /Đơn hàng của tôi|My orders/);
    assert.match(await panel.locator('[data-account-panel-logout]').innerText(), /Đăng xuất|Log out/);
    report.cases.push({ viewport: viewport.name, case: 'account panel: profile and safe order item', orderPagePublished: !disabled, ok: true });
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden', timeout: 10000 });
    assert.equal(await accountLink.getAttribute('aria-expanded'), 'false');
    if (viewport.name === 'mobile') {
      await page.locator('#hamburger-btn').click();
      await accountLink.waitFor({ state: 'visible', timeout: 10000 });
    }
    await accountLink.click();
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('main#main-content').click({ position: { x: 20, y: 20 } });
    await panel.waitFor({ state: 'hidden', timeout: 10000 });
    report.cases.push({ viewport: viewport.name, case: 'account panel: Escape and outside click close', ok: true });

    if (viewport.name === 'mobile') {
      await page.locator('#hamburger-btn').click();
      await accountLink.waitFor({ state: 'visible', timeout: 10000 });
    }
    await accountLink.click();
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel.locator('[data-account-panel-logout]').click();
    await page.locator('[data-account-guest]').waitFor({ state: 'visible', timeout: 12000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-account-online-dot]:not([hidden])').length === 0,
      null, { timeout: 12000 });
    assert.equal(await panel.isVisible(), false, 'Signed-out account panel must close');
    report.cases.push({ viewport: viewport.name, case: 'account panel: logout via server API', ok: true });

    authenticated = true;
    await visit();
    await dot.waitFor({ state: 'visible', timeout: 12000 });
    await page.locator('[data-account-profile]').waitFor({ state: 'visible', timeout: 12000 });

    // Never log a real customer in or out: only the synthetic intercepted API
    // responds to the Account Page's existing logout action.
    // Close the mobile navigation so it cannot cover the logout button.
    if (viewport.name === 'mobile') await page.locator('#hamburger-btn').click();
    await page.locator('[data-account-logout]').click();
    await page.locator('[data-account-guest]').waitFor({ state: 'visible', timeout: 12000 });
    await accountLink.waitFor({ state: 'attached', timeout: 12000 });
    await page.waitForFunction(() => {
      const node = document.querySelector(window.innerWidth < 1024
        ? '#mobile-menu-container a[data-header-action="account"] [data-account-online-dot]'
        : '#header-contacts a[data-header-action="account"] [data-account-online-dot]');
      return node instanceof HTMLElement && node.hidden;
    }, null, { timeout: 12000 });
    assert.equal(await dot.evaluate(element => element.hidden), true,
      'Logout must clear the green dot DOM state');
    report.cases.push({ viewport: viewport.name, case: 'logout: dot cleared', ok: true });

    await context.close();
  }
  report.status = 'PASS';
  console.log('MARINEAQUA_ACCOUNT_HEADER_STATUS=PASS ' + JSON.stringify({ checks: report.cases.length }));
} catch (error) {
  report.status = 'FAIL';
  report.errors.push(String(error?.message || error).slice(0, 500));
  process.exitCode = 1;
  console.error('MARINEAQUA_ACCOUNT_HEADER_STATUS=FAIL ' + report.errors[0]);
} finally {
  await writeFile(OUT + '/result.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
