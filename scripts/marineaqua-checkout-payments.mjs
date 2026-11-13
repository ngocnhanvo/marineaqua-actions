import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// An authorized WooCommerce settings change, not a build or order workflow.
const WP = 'https://admin.marine-aqua.io.vn';
const DIR = 'checkout-payments-evidence';
const COD_TITLE = 'Thanh toán khi nhận hàng';
const recovery = process.argv.slice(2).join(' ') === '--recover-order-collision';
const apply = recovery || process.argv.slice(2).join(' ') === '--apply';
assert.ok(apply || process.argv.length === 2, 'Only --apply, --recover-order-collision or read-only inspection is supported');
const result = {
  mode: recovery ? 'recover-order-collision' : apply ? 'apply' : 'inspect',
  write_scope: { gateways: { cod: ['enabled', 'title', 'order', 'settings.enable_for_methods'], onepayus: ['enabled', 'order'] }, max_records: 2 },
  changed: 0, skipped_unchanged: 0, temporary_created: 0, cleanup_remaining: [],
  before: [], after: [], requests: [], rollback: [], errors: [],
};
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const publicView = gateway => ({ id: gateway.id, enabled: gateway.enabled, title: gateway.title, order: Number(gateway.order) });
function stableView(gateway) {
  const copy = structuredClone(gateway);
  delete copy._links;
  copy.order = Number(copy.order);
  return copy;
}
function protectedView(gateway) {
  const copy = stableView(gateway);
  const allowed = result.write_scope.gateways[gateway.id] || [];
  for (const key of allowed) {
    if (key === 'settings.enable_for_methods') {
      if (copy.settings?.enable_for_methods) delete copy.settings.enable_for_methods.value;
      continue;
    }
    delete copy[key];
    // WooCommerce mirrors its title/enabled options in the settings projection.
    if (copy.settings?.[key]) delete copy.settings[key].value;
  }
  return copy;
}
function shippingMethods(gateway) {
  const value = gateway.settings?.enable_for_methods?.value;
  // The native V3 controller projects an empty stored multiselect array as ''.
  // Nonempty strings are never decoded as if they were valid Woo settings.
  if (value == null || value === '') return [];
  assert.ok(Array.isArray(value) && value.every(item => typeof item === 'string'), 'Invalid native COD shipping-method option');
  return value;
}
const selectedFields = (gateway, keys) => Object.fromEntries(keys.map(key => [key,
  key === 'order' ? Number(gateway[key]) : key === 'settings'
    ? { enable_for_methods: shippingMethods(gateway) } : gateway[key],
]));
const safeError = error => {
  let text = String(error?.message || error);
  for (const secret of [process.env.WP_ADMIN_USERNAME, process.env.WP_ADMIN_PASSWORD]) {
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text.slice(0, 600);
};
await mkdir(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
let api;
const attempted = [];
try {
  assert.ok(process.env.WP_ADMIN_USERNAME && process.env.WP_ADMIN_PASSWORD, 'Missing authorized WordPress credentials');
  const page = await browser.newPage();
  await page.goto(WP + '/wp-login.php', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator('#wp-submit').click();
  // A listing page obtains a session/nonce without creating an auto-draft.
  await page.goto(WP + '/wp-admin/edit.php?post_type=page', { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.equal(new URL(page.url()).origin, WP, 'Unexpected WordPress origin');
  assert.ok(!page.url().includes('wp-login.php'), 'WordPress login failed');
  const nonce = await page.evaluate(async () => window.wpApiSettings?.nonce ||
    (await fetch('/wp-admin/admin-ajax.php?action=rest-nonce', {
      credentials: 'same-origin', signal: AbortSignal.timeout(15000),
    })).text());
  assert.match(nonce, /^[a-zA-Z0-9]{8,32}$/, 'Missing REST nonce');
  api = async (method, id = '', body) => {
    assert.ok(['', 'cod', 'onepayus', 'bacs'].includes(id), 'Gateway path outside scope');
    if (method !== 'GET') {
      assert.ok(apply && method === 'PUT' && ['cod', 'onepayus'].includes(id), 'Mutation outside WRITE_SCOPE');
      const allowed = result.write_scope.gateways[id];
      assert.ok(body && Object.keys(body).every(key => allowed.includes(key) ||
        (id === 'cod' && key === 'settings' && allowed.includes('settings.enable_for_methods'))), 'Gateway field outside WRITE_SCOPE');
      if ('enabled' in body) assert.equal(typeof body.enabled, 'boolean');
      if ('title' in body) assert.equal(typeof body.title, 'string');
      if ('order' in body) assert.ok(Number.isSafeInteger(body.order));
      if ('settings' in body) {
        assert.deepEqual(Object.keys(body.settings), ['enable_for_methods'], 'Only COD shipping eligibility may change');
        assert.ok(Array.isArray(body.settings.enable_for_methods) && body.settings.enable_for_methods.every(value => typeof value === 'string'), 'COD shipping eligibility must be a native multiselect array');
      }
    }
    const path = '/wp-json/wc/v3/payment_gateways' + (id ? '/' + id : '');
    const entry = { method, path, status: null };
    result.requests.push(entry);
    const response = await page.evaluate(async ({ method, path, body, nonce }) => {
      const response = await fetch(path, {
        method, credentials: 'same-origin',
        headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
      });
      let data; try { data = await response.json(); } catch { data = null; }
      return { ok: response.ok, status: response.status, data };
    }, { method, path, body, nonce });
    entry.status = response.status;
    if (!response.ok && typeof response.data?.code === 'string') entry.code = response.data.code.slice(0, 100);
    assert.ok(response.ok, method + ' ' + path + ' HTTP ' + response.status);
    return response.data;
  };
  const before = await api('GET');
  assert.ok(Array.isArray(before), 'Gateway inventory is not an array');
  result.before = before.map(publicView);
  const map = new Map(before.map(gateway => [gateway.id, gateway]));
  assert.equal(map.size, before.length, 'Duplicate gateway IDs');
  for (const id of recovery ? ['onepayus', 'bacs', 'cheque'] : ['cod', 'onepayus', 'bacs']) assert.ok(map.has(id), 'Missing configured gateway: ' + id);
  const cod = map.get('cod');
  const onepay = map.get('onepayus');
  const bacs = map.get('bacs');
  assert.equal(bacs.enabled, true, 'Existing BACS must remain enabled');
  assert.ok(Number.isSafeInteger(Number(onepay.order)), 'OnePayUS position is not a valid integer');
  if (recovery) {
    assert.deepEqual([...map.keys()].sort(), (cod ? ['bacs', 'cheque', 'cod', 'onepayus'] : ['bacs', 'cheque', 'onepayus']), 'Recovery inventory differs from the observed four-gateway installation');
    assert.equal(Number(bacs.order), 35, 'BACS position changed since the reviewed baseline');
    assert.equal(Number(map.get('cheque').order), 36, 'Cheque position changed since the reviewed baseline');
    if (!cod) {
      assert.equal(onepay.enabled, true, 'Collision recovery requires the observed enabled OnePayUS');
      assert.equal(Number(onepay.order), 33, 'Collision recovery requires the observed OnePayUS position');
      result.recovered_gateway = 'cod';
    } else {
      assert.equal(cod.enabled, true, 'Unexpected readable COD state during recovery');
      assert.equal(Number(cod.order), 33, 'Unexpected readable COD position during recovery');
      assert.equal(onepay.enabled, false, 'Readable COD must already have the recovered OnePayUS state');
      assert.equal(Number(onepay.order), 37, 'Unexpected OnePayUS position during recovery');
    }
    assert.ok(!before.some(gateway => gateway.id !== 'onepayus' && Number(gateway.order) === 37), 'Original COD position is no longer free for OnePayUS');
  }
  const restrictions = cod?.settings?.enable_for_methods?.value;
  result.protected_before_sha256 = hash(before.map(protectedView).sort((a, b) => a.id.localeCompare(b.id)));
  // This option contains public shipping-method IDs, never gateway credentials.
  // Record its native REST shape before deciding whether activation is safe.
  const restrictionValue = typeof restrictions === 'string' ? restrictions.slice(0, 400)
    : Array.isArray(restrictions) ? restrictions.slice(0, 30).map(value => String(value).slice(0, 100))
    : restrictions == null ? null : '[unsupported option shape]';
  result.cod_shipping_restrictions = { type: Array.isArray(restrictions) ? 'array' : typeof restrictions, value: restrictionValue };
  result.cod_accept_virtual = cod ? String(cod.settings?.enable_for_virtual?.value ?? '').slice(0, 20) : 'read-after-registry-recovery';
  if (apply && !recovery) assert.ok([canonical([]), canonical(['free_shipping'])].includes(canonical(shippingMethods(cod))),
    'COD shipping eligibility differs from the reviewed baseline');
  // The previous successful COD PUT saved position 33, colliding with OnePayUS.
  // Move only the surviving OnePayUS to the now-vacant original COD slot 37.
  const plan = recovery ? [{ id: 'onepayus', payload: { enabled: false, order: 37 } }] : [
    { id: 'cod', payload: { enabled: true, title: COD_TITLE, order: 33, settings: { enable_for_methods: [] } } },
    { id: 'onepayus', payload: { enabled: false } },
  ];
  result.plan = plan;
  if (apply) {
    for (const change of plan) {
      const original = map.get(change.id);
      const keys = Object.keys(change.payload);
      const baseline = selectedFields(original, keys);
      if (canonical(baseline) === canonical(change.payload)) {
        result.skipped_unchanged++;
        continue;
      }
      const current = await api('GET', change.id);
      assert.equal(hash(stableView(current)), hash(stableView(original)), 'Gateway changed concurrently: ' + change.id);
      if ('order' in change.payload) {
        const registry = await api('GET');
        assert.ok(Array.isArray(registry) && !registry.some(gateway => gateway.id !== change.id && Number(gateway.order) === change.payload.order),
          'Refusing a duplicate WooCommerce gateway position: ' + change.id);
      }
      attempted.push({ ...change, baseline, protectedHash: hash(protectedView(original)) });
      // Do not retry an uncertain PUT; a readback/rollback reconciles its actual result.
      await api('PUT', change.id, change.payload);
      const after = await api('GET', change.id);
      assert.equal(canonical(selectedFields(after, keys)), canonical(change.payload), 'Gateway readback differs: ' + change.id);
      assert.equal(hash(protectedView(after)), hash(protectedView(original)), 'Unrelated gateway setting changed: ' + change.id);
      result.changed++;
    }
  }
  const after = await api('GET');
  const expectedCount = before.length + (recovery && !cod ? 1 : 0);
  assert.ok(Array.isArray(after) && after.length === expectedCount, 'Gateway inventory changed unexpectedly');
  assert.equal(new Set(after.map(gateway => Number(gateway.order))).size, after.length, 'WooCommerce gateway positions must be unique, including disabled gateways');
  result.after = after.map(publicView);
  // Compare the same pre-existing registry members; recovery makes COD visible again.
  result.protected_after_sha256 = hash(after.filter(gateway => map.has(gateway.id)).map(protectedView).sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(result.protected_after_sha256, result.protected_before_sha256, 'Unrelated settings changed');
  if (apply) {
    const enabled = after.filter(gateway => gateway.enabled === true).sort((a, b) => Number(a.order) - Number(b.order));
    assert.deepEqual(enabled.map(gateway => gateway.id), ['cod', 'bacs'], 'Published payment order differs from the approved choices');
    assert.equal(enabled[0].title, COD_TITLE, 'COD title differs');
    assert.deepEqual(shippingMethods(enabled[0]), [], 'COD must allow the existing shipping methods');
    const codItem = await api('GET', 'cod');
    assert.equal(hash(stableView(codItem)), hash(stableView(enabled[0])), 'COD item and collection readbacks differ');
    assert.equal(Number(codItem.order), 33, 'COD must occupy the original OnePayUS position');
    if (recovery) {
      assert.deepEqual(after.map(gateway => gateway.id).sort(), ['bacs', 'cheque', 'cod', 'onepayus'], 'Recovery did not restore the complete gateway registry');
      assert.equal(Number(after.find(gateway => gateway.id === 'onepayus').order), 37, 'OnePayUS must occupy its separate disabled position');
      assert.equal(codItem.settings?.enable_for_virtual?.value, 'yes', 'COD virtual-order option changed');
    }
    assert.equal(hash(stableView(after.find(gateway => gateway.id === 'bacs'))), hash(stableView(bacs)), 'BACS settings changed');
    result.cod_shipping_restrictions_after = shippingMethods(enabled[0]);
    result.bacs_unchanged = true;
    result.enabled_order = enabled.map(publicView);
  }
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL'; result.errors.push(safeError(error)); process.exitCode = 1;
  for (const change of attempted.reverse()) {
    try {
      const current = await api('GET', change.id);
      const fields = selectedFields(current, Object.keys(change.payload));
      if (canonical(fields) === canonical(change.baseline)) {
        result.rollback.push({ id: change.id, status: 'already-baseline' });
        continue;
      }
      assert.equal(canonical(fields), canonical(change.payload), 'Concurrent field change prevents rollback: ' + change.id);
      assert.equal(hash(protectedView(current)), change.protectedHash, 'Concurrent setting change prevents rollback: ' + change.id);
      if ('order' in change.baseline) {
        const registry = await api('GET');
        assert.ok(Array.isArray(registry) && !registry.some(gateway => gateway.id !== change.id && Number(gateway.order) === change.baseline.order),
          'Rollback would recreate a gateway order collision: ' + change.id);
      }
      await api('PUT', change.id, change.baseline);
      const restored = await api('GET', change.id);
      assert.equal(canonical(selectedFields(restored, Object.keys(change.payload))), canonical(change.baseline), 'Rollback readback differs: ' + change.id);
      result.rollback.push({ id: change.id, status: 'restored' });
    } catch (rollbackError) {
      result.cleanup_remaining.push(change.id);
      result.errors.push('ROLLBACK_FAILED: ' + safeError(rollbackError));
    }
  }
} finally {
  // Public metadata and fingerprints only; never serialize gateway settings or credentials.
  await writeFile(DIR + '/result.json', JSON.stringify(result, null, 2) + '\n');
  console.log('MARINEAQUA_CHECKOUT_PAYMENTS=' + result.status + ' ' + JSON.stringify(result));
  await browser.close();
}
