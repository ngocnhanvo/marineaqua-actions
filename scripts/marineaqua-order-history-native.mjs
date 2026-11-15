import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP = 'https://admin.marine-aqua.io.vn';
const SLUG = 'lich-su-don-hang';
const KEY = 'orderhistory';
const ACTION = 'OrderHistoryPage';
const TABLE = 'order_history_vi';
const TITLE = 'Lịch sử đơn hàng';
const LABELS = [
  ['title', 'Lịch sử đơn hàng'],
  ['loading', 'Đang tải đơn hàng...'],
  ['empty', 'Bạn chưa có đơn hàng nào.'],
  ['login_required', 'Vui lòng đăng nhập để xem đơn hàng.'],
  ['load_error', 'Không thể tải danh sách đơn hàng.'],
  ['network_error', 'Lỗi kết nối mạng, vui lòng thử lại sau!'],
  ['order_number', 'Mã đơn'],
  ['quantity', 'Số lượng'],
  ['payment_method', 'Hình thức'],
  ['subtotal', 'Thành tiền'],
  ['discount', 'Giảm giá'],
  ['tax', 'Thuế (VAT)'],
  ['total', 'Tổng thanh toán'],
  ['status_pending', 'Chờ thanh toán'],
  ['status_processing', 'Đang xử lý'],
  ['status_on_hold', 'Tạm giữ'],
  ['status_completed', 'Hoàn thành'],
  ['status_cancelled', 'Đã hủy'],
  ['status_refunded', 'Đã hoàn tiền'],
  ['status_failed', 'Thất bại'],
];
const username = process.env.WP_ADMIN_USERNAME;
const password = process.env.WP_ADMIN_PASSWORD;
if (!username || !password) throw Error('CMS_BLOCKED: WordPress admin secrets missing');
const out = 'order-history-native-evidence';
await mkdir(out, { recursive: true });
const report = { table: TABLE, slug: SLUG, key: KEY, action: ACTION, createdPage: false, published: false, steps: [] };
const record = (name, extra = {}) => { report.steps.push(name); console.log('ORDER_HISTORY_' + name + '=' + JSON.stringify(extra)); };
const browser = await chromium.launch({ headless: true });
let pageId = null;
let context;
let page;
let published = false;
try {
  context = await browser.newContext();
  page = await context.newPage();
  page.on('dialog', async d => { if (d.type() === 'confirm') await d.accept(); else await d.dismiss(); });
  await page.goto(WP + '/wp-login.php', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  await page.locator('#wp-submit').click();
  if (page.url().includes('wp-login.php')) throw Error('WordPress login rejected');
  const fetchTable = async () => {
    const r = await context.request.get(WP + '/wp-json/tablepress/v1/table/' + TABLE, { timeout: 25000, failOnStatusCode: false });
    return r.ok() ? r.json() : null;
  };
  // Create the labels only if absent. Never overwrite existing editor-authored cells.
  let table = await fetchTable();
  if (!table) {
    await page.goto(WP + '/wp-admin/admin.php?page=tablepress_add', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('input[name="table[name]"]').fill(TITLE);
    await page.locator('input[name="table[rows]"]').fill(String(LABELS.length + 1));
    await page.locator('input[name="table[columns]"]').fill('2');
    await page.getByRole('button', { name: /Add Table/i }).click();
    const idInput = page.locator('#table-id');
    await idInput.waitFor({ state: 'visible', timeout: 35000 });
    await page.waitForFunction(() => Boolean(window.tp?.editor?.setValueFromCoords && window.tp?.table?.data), null, { timeout: 25000 });
    const old = await page.evaluate(() => window.tp.table.data);
    assert.equal(old.length, LABELS.length + 1);
    assert.ok(old.every(row => row.length === 2 && row.every(cell => !String(cell || '').trim())));
    await idInput.fill(TABLE);
    await page.locator('#table-information-shortcode').focus();
    await page.evaluate(labels => {
      const rows = [['key', 'label'], ...labels];
      rows.forEach((row, ri) => row.forEach((v, ci) => window.tp.editor.setValueFromCoords(ci, ri, v)));
    }, LABELS);
    await page.getByRole('button', { name: /Save Changes/i }).first().click();
    for (let i = 0; i < 7; i++) {
      await page.waitForTimeout(900);
      table = await fetchTable();
      if (table) break;
    }
    record('TABLE_NATIVE_CREATED');
  }
  if (!table) throw Error('ESC Table missing after native Save');
  assert.equal(String(table.id), TABLE);
  if (String(table.meta?.api || '').trim()) throw Error('Order history labels must not bind a product API source');
  assert.equal(table.fields?.[0]?.key, 'key');
  assert.equal(table.fields?.[1]?.key, 'label');
  if (!Array.isArray(table.items)) throw Error('ESC Table items response invalid');
  const present = new Map(table.items.map(item => [String(item.key), String(item.label)]));
  if (present.size !== table.items.length) throw Error('Duplicate ESC semantic key');
  for (const [key] of LABELS) if (!present.has(key)) throw Error('ESC Table missing semantic key: ' + key);
  record('TABLE_REST_PASS', { items: present.size });

  // Obtain fresh REST nonce from the logged-in admin editor, not a hard-coded token.
  await page.goto(WP + '/wp-admin/post-new.php?post_type=page', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const nonce = await page.evaluate(async () => {
    if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
    const r = await fetch('/wp-admin/admin-ajax.php?action=rest-nonce', { credentials: 'same-origin' });
    return r.ok ? (await r.text()).trim() : '';
  });
  if (!/^[a-zA-Z0-9]{8,32}$/.test(nonce)) throw Error('Authenticated REST nonce unavailable');
  const req = async (method, path, payload) => {
    const result = await page.evaluate(async ({ method, path, payload, nonce }) => {
      const r = await fetch(path, { method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
        body: payload === undefined ? undefined : JSON.stringify(payload) });
      let body = null; try { body = await r.json(); } catch {}
      return { ok: r.ok, status: r.status, data: body };
    }, { method, path, payload, nonce });
    if (!result.ok) throw Error('WordPress REST ' + method + ' HTTP=' + result.status + ' code=' + result.data?.code);
    return result.data;
  };
  const inventory = await req('GET', '/wp-json/wp/v2/pages?context=edit&per_page=100&_fields=id,slug,status,acf,title,content');
  if (!Array.isArray(inventory)) throw Error('Page inventory invalid');
  const matches = inventory.filter(p => p.slug === SLUG || p.acf?.key === KEY);
  if (matches.length > 1) throw Error('Conflicting order history Pages; no mutation');
  let target = matches[0];
  if (target && (target.slug !== SLUG || target.acf?.key !== KEY || target.acf?.action !== ACTION)) {
    throw Error('Existing order Page identity conflicts; refuse mutation');
  }
  if (!target) {
    target = await req('POST', '/wp-json/wp/v2/pages', {
      title: TITLE, slug: SLUG, status: 'draft',
      acf: { key: KEY, action: ACTION, product_lang: 'vi' },
    });
    report.createdPage = true;
  }
  pageId = target.id;
  if (!Number.isSafeInteger(pageId) || pageId <= 0) throw Error('Invalid Page ID');
  let readback = await req('GET', '/wp-json/wp/v2/pages/' + pageId + '?context=edit');
  if (readback.slug !== SLUG || readback.acf?.key !== KEY || readback.acf?.action !== ACTION) {
    throw Error('Page key/action REST readback failed');
  }
  const shortcodeRegex = /\\[table\\s+id=["']?order_history_vi["']?\\s*\\/\\]/gi;
  if ((String(readback.content?.raw || '').match(shortcodeRegex) || []).length > 1) throw Error('Duplicate native shortcode');
  if (!shortcodeRegex.test(String(readback.content?.raw || ''))) {
    if (String(readback.content?.raw || '').trim()) throw Error('Existing Page content nonempty; preserve edits and refuse overwrite');
    await page.goto(WP + '/wp-admin/post.php?post=' + pageId + '&action=edit', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!await page.locator('#content').count()) throw Error('Native Classic Editor content control missing');
    const quick = page.locator('#qt_content_tablepress_quicktags_button');
    if (await quick.isVisible()) {
      await quick.click();
    } else {
      await page.locator('#content-tmce').click();
      await page.evaluate(() => {
        const editor = window.tinymce?.get('content');
        if (!editor || editor.isHidden()) throw Error('TinyMCE native editor unavailable');
        editor.focus();
        editor.selection.setCursorLocation(editor.getBody(), 0);
        window.wpActiveEditor = 'content';
      });
      await page.locator('#content_tablepress_insert_table, #content_tablepress_insert_table-button, .mce-btn[aria-label*="ESC Table"]').first().click();
    }
    const frame = page.frameLocator('#TB_iframeContent');
    const insert = frame.locator('input.insert-shortcode[title*="order_history_vi"]').first();
    await insert.waitFor({ state: 'visible', timeout: 25000 });
    if ((await insert.getAttribute('title')) !== '[table id=order_history_vi /]') throw Error('Native shortcode target mismatched');
    await insert.click();
    await page.evaluate(() => window.tinymce?.triggerSave());
    const raw = await page.locator('#content').inputValue();
    if ((raw.match(shortcodeRegex) || []).length !== 1) throw Error('Native Insert Code failed to produce exactly one shortcode');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
      page.locator('#publish').click(),
    ]);
    record('PAGE_NATIVE_INSERT_AND_SAVE');
  } else if (readback.status !== 'publish') {
    await req('POST', '/wp-json/wp/v2/pages/' + pageId, { status: 'publish' });
    record('EXISTING_PAGE_PUBLISHED');
  }
  readback = await req('GET', '/wp-json/wp/v2/pages/' + pageId + '?context=edit');
  if (readback.status !== 'publish' || readback.slug !== SLUG || readback.acf?.key !== KEY || readback.acf?.action !== ACTION) {
    throw Error('Published Page identity verification failed');
  }
  if ((String(readback.content?.raw || '').match(shortcodeRegex) || []).length !== 1) {
    throw Error('Published Page native shortcode not persisted');
  }
  report.pageId = pageId;
  report.published = true;
  published = true;
  record('PAGE_PUBLISHED_REST_PASS', { pageId, slug: SLUG });
  await page.screenshot({ path: out + '/page-verified.png' });
} catch (e) {
  report.error = String(e.message || e).slice(0, 350);
  console.error('ORDER_HISTORY_NATIVE_FAIL=' + report.error);
  process.exitCode = 1;
  // Only remove the newly-created temporary draft, never existing content or published records.
  if (report.createdPage && pageId && !published && page) {
    try {
      const adminUrl = WP + '/wp-admin/post.php?post=' + pageId + '&action=edit';
      await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      // No silent delete of a possibly published Page after an ambiguous save.
      const verify = await context.request.get(WP + '/wp-json/wp/v2/pages/' + pageId + '?context=edit');
      if (verify.ok() && (await verify.json()).status === 'draft') {
        await page.locator('#delete-action a.submitdelete').click();
        report.draftCleaned = true;
      }
    } catch (cleanupError) {
      report.cleanupError = String(cleanupError.message || cleanupError).slice(0, 160);
    }
  }
} finally {
  await writeFile(out + '/result.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
