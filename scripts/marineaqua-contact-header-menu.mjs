import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP = 'https://admin.marine-aqua.io.vn';
const target = { label: 'Liên hệ', href: '/lien-he' };
const out = 'contact-header-evidence';
const report = { status: 'STARTED', target, before: null, after: null, changed: false, errors: [] };
const norm = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const pathname = value => String(value || '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
const flatten = (items, parent = null) => items.flatMap(item => [{ ...item, parentLabel: parent?.label || null }, ...flatten(item.children || [], item)]);
const snapshot = items => JSON.stringify(flatten(items).map(item => [item.id, item.key, item.label, item.href, item.slug, item.linkType, item.parentLabel, item.position]));
const assert = (ok, why) => { if (!ok) throw new Error(why); };

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  assert(process.env.WP_ADMIN_USERNAME && process.env.WP_ADMIN_PASSWORD, 'WordPress credentials missing');
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const load = async () => {
    const response = await context.request.get(WP + '/wp-json/esc-api/v1/menus', { failOnStatusCode: false, timeout: 35000 });
    assert(response.ok(), 'WordPress menu API returned HTTP ' + response.status());
    const payload = await response.json();
    assert(payload?.success === true && Array.isArray(payload?.menus?.Header?.vi?.items), 'Header VI menu not found');
    return payload.menus.Header.vi.items;
  };
  const before = await load();
  const existing = flatten(before).filter(item => norm(item.label) === norm(target.label) && !item.parentLabel);
  assert(existing.length === 1, 'Expected exactly one top-level contact entry; found ' + existing.length);
  const item = existing[0];
  assert(Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0, 'Invalid native WordPress menu ID');
  report.before = { id: item.id, label: item.label, href: item.href, slug: item.slug, linkType: item.linkType };
  const original = snapshot(before);
  if (pathname(item.href || item.slug) !== pathname(target.href) || item.linkType === 'none') {
    const admin = await context.newPage();
    await admin.goto(WP + '/wp-login.php', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
    await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
    await admin.locator('#wp-submit').click();
    assert(!admin.url().includes('wp-login.php'), 'WordPress login failed');
    await admin.goto(WP + '/wp-admin/nav-menus.php', { waitUntil: 'domcontentloaded', timeout: 45000 });
    assert(await admin.locator('#menu-name').inputValue() === 'Marine Aqua Header VI', 'Wrong selected WordPress menu');
    assert(await admin.locator('#esc-menu-code').inputValue() === 'Header' && await admin.locator('#esc-menu-lang').inputValue() === 'vi', 'Wrong Header locale');
    assert(snapshot(await load()) === original, 'Header changed concurrently; refusing update');
    const mode = admin.locator('select[name="esc-menu-item-link-type[' + item.id + ']"]');
    const input = admin.locator('input[name="esc-menu-item-custom-url[' + item.id + ']"]');
    const edit = admin.locator('#edit-' + item.id);
    assert(await mode.count() === 1 && await input.count() === 1 && await edit.count() === 1, 'Native menu editor controls not found');
    await edit.evaluate(element => element.click());
    await admin.evaluate(({ id, href }) => {
      const select = document.querySelector('select[name="esc-menu-item-link-type[' + id + ']"]');
      const field = document.querySelector('input[name="esc-menu-item-custom-url[' + id + ']"]');
      if (!(select instanceof HTMLSelectElement) || !(field instanceof HTMLInputElement)) throw Error('Native form controls unavailable');
      if (![...select.options].some(option => option.value === 'custom')) throw Error('Custom menu link mode unavailable');
      select.value = 'custom';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      field.value = href;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      if (select.value !== 'custom' || field.value !== href) throw Error('Native form input mismatch');
    }, { id: item.id, href: target.href });
    const save = admin.locator('#save_menu_footer');
    assert(await save.count() === 1, 'Native WordPress Save menu button missing');
    await save.click();
    await admin.waitForLoadState('domcontentloaded', { timeout: 25000 }).catch(() => {});
    report.changed = true;
    await admin.screenshot({ path: out + '/contact-menu-after-save.png' });
    await admin.close();
  }
  const after = await load();
  const items = flatten(after);
  const updated = items.filter(node => Number(node.id) === Number(item.id));
  assert(updated.length === 1, 'Contact menu item disappeared or duplicated');
  assert(pathname(updated[0].href || updated[0].slug) === pathname(target.href), 'Contact menu link incorrect after write');
  assert(updated[0].linkType !== 'none', 'Contact menu still not clickable');
  const ignoreContact = nodes => JSON.stringify(flatten(nodes).filter(node => Number(node.id) !== Number(item.id)).map(node => [node.id, node.key, node.label, node.href, node.slug, node.linkType, node.parentLabel, node.position]));
  assert(ignoreContact(before) === ignoreContact(after), 'Other WordPress menu items changed unexpectedly');
  report.after = { id: updated[0].id, label: updated[0].label, href: updated[0].href, slug: updated[0].slug, linkType: updated[0].linkType };
  report.status = 'PASS';
  console.log('MARINEAQUA_CONTACT_HEADER_MENU=PASS ' + JSON.stringify(report));
} catch (error) {
  report.status = 'FAIL'; report.errors.push(String(error?.message || error).slice(0, 500));
  console.error('MARINEAQUA_CONTACT_HEADER_MENU=FAIL ' + JSON.stringify(report.errors));
  process.exitCode = 1;
} finally {
  await writeFile(out + '/result.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
