import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP = 'https://admin.marine-aqua.io.vn';
const SLUG = 'don-hang-cua-toi';
const KEY = 'orderhistory';
const ACTION = 'OrderHistoryPage';
const isOwnedSlug = slug => typeof slug === 'string' && (slug === SLUG || (slug.startsWith(SLUG + '-') && /^\d+$/.test(slug.slice(SLUG.length + 1))));
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
  const tableKeys = value => new Map((Array.isArray(value?.items) ? value.items : []).map(item => [String(item.key), String(item.label)]));
  const expectedKeysPresent = value => {
    const rows = tableKeys(value);
    return LABELS.every(([key]) => rows.has(key));
  };
  // TablePress native Save may return a cached table snapshot before its row data settles.
  for (let attempt = 0; attempt < 8 && !expectedKeysPresent(table); attempt++) {
    await page.waitForTimeout(650);
    table = await fetchTable();
  }
  if (!expectedKeysPresent(table)) {
    record('NATIVE_READBACK_DIAGNOSTIC', {
      fields: (table.fields || []).map(field => field.key),
      itemCount: Array.isArray(table.items) ? table.items.length : -1,
      itemKeys: (table.items || []).slice(0, 5).map(item => String(item.key)),
    });
    // Only hydrate blank cells belonging to our exact known schema and dimensions.
    if (String(table.id) !== TABLE ||
        table.fields?.[0]?.key !== 'key' || table.fields?.[1]?.key !== 'label') {
      throw Error('Unexpected native ESC Table schema; refuse mutation');
    }
    await page.goto(WP + '/wp-admin/admin.php?page=tablepress&action=edit&table_id=' + TABLE,
      { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => Boolean(window.tp?.editor?.setValueFromCoords && window.tp?.table?.data),
      null, { timeout: 25000 });
    const before = await page.evaluate(() => window.tp.table.data);
    // Native TablePress reserves row 0 for keys and row 1 for human field labels.
    // The previous attempt created 21 rows (one header + 20 labels), so its
    // first semantic row became a field label and only 19 items were exposed.
    // Repair only our exact previous 21-row snapshot; never shift unrelated rows.
    if (before.length !== LABELS.length + 1 ||
        before.some(row => row.length !== 2) ||
        before[0][0] !== 'key' || before[0][1] !== 'label' ||
        before.slice(1).some((row, i) =>
          row[0] !== LABELS[i][0] || row[1] !== LABELS[i][1])) {
      throw Error('Native ESC Table rows differ from our initial snapshot; refuse migration');
    }
    await page.evaluate(() => {
      const input = document.querySelector('#rows-append-number');
      if (!(input instanceof HTMLInputElement) || input.value !== '1') {
        throw Error('Native Add Row count control unavailable');
      }
      const button = document.evaluate(
        'following::button[normalize-space(.)="Add"][1]',
        input, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
      ).singleNodeValue;
      if (!(button instanceof HTMLButtonElement)) throw Error('Native Add Rows button unavailable');
      button.click();
    });
    await page.waitForFunction(count => window.tp?.table?.data?.length === count,
      LABELS.length + 2, { timeout: 20000 });
    await page.evaluate(({title}) => {
      const last = window.tp.table.data.length - 1;
      window.tp.editor.setValueFromCoords(0, 1, 'Khóa');
      window.tp.editor.setValueFromCoords(1, 1, 'Nhãn');
      window.tp.editor.setValueFromCoords(0, last, 'title');
      window.tp.editor.setValueFromCoords(1, last, title);
    }, { title: TITLE });
    await page.getByRole('button', { name: /Save Changes/i }).first().click();
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(800);
      table = await fetchTable();
      if (expectedKeysPresent(table)) break;
    }
    record('NATIVE_ROWS_SAVED', { itemCount: table.items?.length || 0 });
  }
  if (String(table.id) !== TABLE || String(table.meta?.api || '').trim()) {
    throw Error('Order history table ID/source mismatch');
  }
  assert.equal(table.fields?.[0]?.key, 'key');
  assert.equal(table.fields?.[1]?.key, 'label');
  if (!Array.isArray(table.items)) throw Error('ESC Table items response invalid');
  const present = tableKeys(table);
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
  const inventory = await req('GET', '/wp-json/wp/v2/pages?context=edit&status=any&per_page=100&_fields=id,slug,status,acf,title,content');
  const trashed = await req('GET', '/wp-json/wp/v2/pages?context=edit&status=trash&per_page=100&_fields=id,slug,status,acf,title');
  if (!Array.isArray(inventory) || !Array.isArray(trashed)) throw Error('Page inventory invalid');
  const matches = inventory.filter(p => isOwnedSlug(p.slug) || p.acf?.key === KEY);
  record('OWNED_PAGE_INVENTORY', {
    items: matches.map(p => ({ id:p.id, slug:p.slug, status:p.status,
      key:p.acf?.key || null, action:p.acf?.action || null,
      title:p.title?.rendered || null, contentLength:String(p.content?.raw || '').trim().length }))
  });
  const prior = trashed.filter(p => p.acf?.key === KEY && p.acf?.action === ACTION &&
    isOwnedSlug(p.slug));
  record('PAGE_TRASH_INVENTORY', { items: prior.map(p => ({ id:p.id, slug:p.slug, key:p.acf?.key })) });
  // Only consolidate identity-verified duplicates. Never touch unrelated Pages,
  // even when their URL resembles an order-history route.
  const safeAbandonedDrafts = matches.filter(p =>
    p.slug === SLUG && p.status === 'draft' && !p.acf?.key && !p.acf?.action &&
    String(p.title?.rendered || '').trim() === TITLE &&
    !String(p.content?.raw || '').trim());
  for (const draft of safeAbandonedDrafts) {
    await req('DELETE', '/wp-json/wp/v2/pages/' + draft.id);
    record('EMPTY_UNUSED_ORDER_DRAFT_TRASHED', { id:draft.id, slug:draft.slug });
  }
  const activeMatches = matches.filter(p => !safeAbandonedDrafts.includes(p));
  const owned = activeMatches.filter(p => isOwnedSlug(p.slug) &&
    p.acf?.key === KEY && p.acf?.action === ACTION);
  const foreign = activeMatches.filter(p => !owned.includes(p));
  if (foreign.length) throw Error('Order slug occupied by another Page identity; refuse mutation');
  const publishedOwned = owned.filter(p => p.status === 'publish');
  if (publishedOwned.length > 1) throw Error('Multiple published order Pages; review required');
  let target = publishedOwned[0] || owned.find(p => p.slug === SLUG) ||
    [...owned].sort((a,b) => b.id - a.id)[0];
  for (const duplicate of owned.filter(p => p.id !== target?.id)) {
    if (!['draft', 'pending', 'private', 'future'].includes(duplicate.status))
      throw Error('Unexpected order Page duplicate status: ' + duplicate.status);
    await req('DELETE', '/wp-json/wp/v2/pages/' + duplicate.id);
    record('UNUSED_OWNED_PAGE_TRASHED', { id: duplicate.id, slug: duplicate.slug });
  }
  if (target && (!isOwnedSlug(target.slug) || target.acf?.key !== KEY || target.acf?.action !== ACTION)) {
    throw Error('Existing order Page identity conflicts; refuse mutation');
  }
  if (!target && prior.length) {
    // Recover our oldest trashed draft instead of creating another slug collision.
    const recover = [...prior].sort((a,b) => a.id - b.id)[0];
    target = await req('POST', '/wp-json/wp/v2/pages/' + recover.id, {
      status: 'draft', slug: SLUG
    });
    record('PAGE_DRAFT_RESTORED', { id: target.id, slug: target.slug });
  }
  if (!target) {
    target = await req('POST', '/wp-json/wp/v2/pages', {
      title: TITLE, slug: SLUG, status: 'draft',
      acf: { key: KEY, action: ACTION, product_lang: 'vi' },
    });
    report.createdPage = true;
  }
  // Preserve the published Page ID, SEO and native ESC Table while fixing
  // WordPress's numbered slug. WordPress tracks the former published slug.
  if (target.slug !== SLUG) {
    const previous = target.slug;
    target = await req('POST', '/wp-json/wp/v2/pages/' + target.id, { slug: SLUG });
    if (target.slug !== SLUG) {
      const conflicts = await req('GET', '/wp-json/wp/v2/pages?context=edit&slug=' + SLUG +
        '&per_page=100&_fields=id,slug,status,acf,title,content');
      const posts = await req('GET', '/wp-json/wp/v2/posts?context=edit&slug=' + SLUG +
        '&per_page=100&_fields=id,slug,status,type,title');
      const media = await req('GET', '/wp-json/wp/v2/media?context=edit&slug=' + SLUG +
        '&per_page=100&_fields=id,slug,status,title');
      const trash = await req('GET', '/wp-json/wp/v2/pages?context=edit&status=trash&slug=' + SLUG +
        '&per_page=100&_fields=id,slug,status,acf,title');
      const allHits = await req('GET', '/wp-json/wp/v2/pages?context=edit&search=don-hang-cua-toi' +
        '&per_page=100&_fields=id,slug,status,acf,title');
      record('CANONICAL_SLUG_CONFLICT_DIAGNOSTIC', {
        media: media.map(p => ({ id:p.id, slug:p.slug, status:p.status })),
        trash: trash.map(p => ({ id:p.id, slug:p.slug, status:p.status, key:p.acf?.key })),
        search: allHits.map(p => ({ id:p.id, slug:p.slug, status:p.status, key:p.acf?.key,
          action:p.acf?.action })),
        pages: conflicts.map(p => ({ id:p.id, slug:p.slug, status:p.status, key:p.acf?.key,
          action:p.acf?.action, title:p.title?.rendered, contentLength:String(p.content?.raw || '').length })),
        posts: posts.map(p => ({ id:p.id, slug:p.slug, status:p.status, type:p.type })),
      });
      throw Error('Canonical order slug unavailable; WordPress returned ' + target.slug);
    }
    record('PAGE_CANONICAL_SLUG_UPDATED', { id: target.id, from: previous, to: target.slug });
  }
  pageId = target.id;
  if (!Number.isSafeInteger(pageId) || pageId <= 0) throw Error('Invalid Page ID');
  let readback = await req('GET', '/wp-json/wp/v2/pages/' + pageId + '?context=edit');
  record('PAGE_IDENTITY_READBACK', {
    id: readback?.id,
    slug: readback?.slug,
    status: readback?.status,
    key: readback?.acf?.key ?? null,
    action: readback?.acf?.action ?? null,
    lang: readback?.acf?.product_lang ?? null,
  });
  if (!isOwnedSlug(readback.slug) || readback.acf?.key !== KEY || readback.acf?.action !== ACTION) {
    throw Error('Page key/action REST readback failed');
  }
  const shortcodeRegex = /\[table\s+id=["']?order_history_vi["']?\s*\/\]/gi;
  const rawBefore = String(readback.content?.raw || '');
  const duplicateCount = (rawBefore.match(shortcodeRegex) || []).length;
  record('PAGE_EXISTING_SHORTCODES', { count: duplicateCount, rawLength: rawBefore.length,
    rawExcerpt: rawBefore.slice(0, 450) });
  if (duplicateCount > 1) {
    const shortcode = '[table id=order_history_vi /]';
    // The native TablePress editor adds its own visual thumbnail wrapper, with
    // a second printable shortcode in its preview badge. That wrapper is
    // generated editor chrome, not authored Page content. Remove ONLY its
    // exact known structure; preserve real user-authored content fail-closed.
    const wrapperPattern = /<div class="tablepress-preview-wrap mceNonEditable" data-table-id="order_history_vi"><img id="tablepress-img-order_history_vi" src="\/wp-json\/api\/image\/tablepress\?id=order_history_vi" alt="Hình ảnh cho table order_history_vi" width="300" height="200" class="tablepress-attached-image mceNonEditable" data-table-id="order_history_vi" \/><span class="tablepress-preview-badge">\[table id=order_history_vi \/\]<\/span><\/div>/g;
    const without = rawBefore.replace(wrapperPattern, '').trim();
    if (without !== shortcode) throw Error('Page contains additional authored content; refuse automatic cleanup');
    await page.goto(WP + '/wp-admin/post.php?post=' + pageId + '&action=edit',
      { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#content-html').click();
    await page.evaluate(() => { window.switchEditors?.go?.('content','html'); });
    const editor = page.locator('#content');
    await editor.waitFor({ state:'visible',timeout:20000 });
    const editorBefore = await editor.inputValue();
    record('DUPLICATE_EDITOR_SNAPSHOT', {
      length: editorBefore.length,
      excerpt: editorBefore.slice(0, 450),
    });
    const normalize = str => String(str).replace(/\r\n/g, '\n').trim();
    if (normalize(editorBefore) !== normalize(rawBefore) &&
        normalize(editorBefore) !== shortcode) {
      throw Error('Page editor differs from the known generated preview; abort cleanup');
    }
    await editor.fill(shortcode);
    await page.evaluate(() => {
      window.wpActiveEditor = 'content';
      const active = window.tinymce?.get('content');
      if (active && !active.isHidden()) active.hide();
    });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
      page.locator('#publish').click()
    ]);
    const verified = await req('GET', '/wp-json/wp/v2/pages/' + pageId + '?context=edit');
    if ((String(verified.content?.raw || '').match(shortcodeRegex) || []).length !== 1) {
      throw Error('Duplicate cleanup failed WordPress REST readback');
    }
    record('NATIVE_DUPLICATE_CLEANUP_PASS', { pageId });
    readback = verified;
  }
  if (!shortcodeRegex.test(String(readback.content?.raw || ''))) {
    if (String(readback.content?.raw || '').trim()) throw Error('Existing Page content nonempty; preserve edits and refuse overwrite');
    await page.goto(WP + '/wp-admin/post.php?post=' + pageId + '&action=edit', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!await page.locator('#content').count()) throw Error('Native Classic Editor content control missing');
    const quick = page.locator('#qt_content_tablepress_quicktags_button');
    if (await quick.isVisible()) {
      await page.locator('#content-html').click();
      await page.locator('#content').focus();
      await page.evaluate(() => { window.wpActiveEditor = 'content'; });
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
    record('NATIVE_INSERT_PREPARED', await page.evaluate(() => ({
      active: window.wpActiveEditor,
      textArea: Boolean(document.querySelector('#content')),
      visualEditor: Boolean(window.tinymce?.get('content')),
      shortcodeModalVisible: Boolean(document.querySelector('#TB_window')),
    })));
    await page.evaluate(() => { window.wpActiveEditor = 'content'; });
    await insert.click();
    await page.waitForTimeout(700);
    const probe = await page.evaluate(() => {
      window.tinymce?.triggerSave();
      return {
        raw: String(document.querySelector('#content')?.value || ''),
        visual: String(window.tinymce?.get('content')?.getContent() || ''),
        acf: String(document.querySelector('#acf_content')?.value || ''),
        active: String(window.wpActiveEditor || ''),
      };
    });
    const counts = Object.fromEntries(['raw', 'visual', 'acf'].map(kind =>
      [kind, (probe[kind].match(shortcodeRegex) || []).length]));
    record('NATIVE_INSERT_CODE_PROBE', {
      active: probe.active,
      counts,
      rawExcerpt: probe.raw.slice(0, 260),
      visualExcerpt: probe.visual.slice(0, 260),
      acfExcerpt: probe.acf.slice(0, 260),
    });
    if (counts.raw !== 1 && counts.visual !== 1 && counts.acf !== 1) {
      // The plugin picker has been clicked on the exact verified table.
      // Use WordPress's native QuickTags insertion API if its delegated
      // Thickbox click handler didn't update the current Text editor.
      const nativeInserted = await page.evaluate(code => {
        const el = document.getElementById('content');
        if (!(el instanceof HTMLTextAreaElement) ||
            typeof window.QTags?.insertContent !== 'function') return false;
        window.wpActiveEditor = 'content';
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        window.QTags.insertContent(code);
        return el.value.includes(code);
      }, '[table id=order_history_vi /]');
      record('NATIVE_QUICKTAGS_FALLBACK', { inserted: nativeInserted });
      if (!nativeInserted) throw Error('WordPress native Insert Code/QuickTags both unavailable');
    }
    if (counts.raw !== 1) {
      await page.evaluate(() => window.tinymce?.triggerSave());
      await page.waitForFunction(() => String(
        document.querySelector('#content')?.value || '').includes('order_history_vi'),
        null, { timeout: 12000 });
    }
    const raw = await page.locator('#content').inputValue();
    if ((raw.match(shortcodeRegex) || []).length !== 1) {
      throw Error('Native Editor did not synchronize its shortcode into the WordPress Page source');
    }
    const editorBeforeSave = await page.evaluate(() => {
      const active = window.tinymce?.get?.('content');
      if (active && !active.isHidden()) active.hide();
      return {
        hidden: !active || active.isHidden(),
        raw: String(document.querySelector('#content')?.value || '').slice(0, 180),
        active: window.wpActiveEditor,
        editorMode: String(document.querySelector('#wp-content-wrap')?.className || ''),
      };
    });
    record('PAGE_EDITOR_BEFORE_SAVE', editorBeforeSave);
    if (!editorBeforeSave.hidden) throw Error('TinyMCE must not override native QuickTags content');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
      page.locator('#publish').click(),
    ]);
    record('PAGE_NATIVE_INSERT_AND_SAVE', {
      url: page.url().slice(0, 180),
      adminMessage: (await page.locator('#message').innerText().catch(() => '')).slice(0, 180),
    });
  } else if (readback.status !== 'publish') {
    await req('POST', '/wp-json/wp/v2/pages/' + pageId, { status: 'publish' });
    record('EXISTING_PAGE_PUBLISHED');
  }
  readback = await req('GET', '/wp-json/wp/v2/pages/' + pageId + '?context=edit');
  if (readback.status !== 'publish' || !isOwnedSlug(readback.slug) || readback.acf?.key !== KEY || readback.acf?.action !== ACTION) {
    throw Error('Published Page identity verification failed');
  }
  record('PAGE_SHORTCODE_READBACK', {
    rawLength: String(readback.content?.raw || '').length,
    rawExcerpt: String(readback.content?.raw || '').slice(0, 380),
    renderedExcerpt: String(readback.content?.rendered || '').slice(0, 230),
    status: readback.status,
  });
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
