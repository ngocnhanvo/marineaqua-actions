/** Offline Chromium fixtures exercise real source guards; no site/WordPress requests. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('.qa/package.json'));
const { chromium } = require('playwright');
const ts = require('typescript');
const astro = path.resolve(process.env.ASTRO_SOURCE || 'source-astro');
const php = path.resolve(process.env.PHP_SOURCE || 'source-php');
const output = path.resolve('artifacts/visual-builder');
await mkdir(output, { recursive: true });
const sources = {
  astro: execFileSync('git', ['-C', astro, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  php: execFileSync('git', ['-C', php, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
};
const modules = [
  'builderHeaderNavLock', 'builderFooterSelection', 'builderEditabilityCues',
];
const moduleScripts = [];
for (const name of modules) {
  const source = await readFile(path.join(astro, 'src/lib/wordpress', name + '.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  moduleScripts.push(`(() => { const exports = {}; ${compiled}\nObject.assign(window.__vbExports, exports); })();`);
}
const preview = await readFile(path.join(astro, 'src/pages/esc-builder/preview/[pageId].astro'), 'utf8');
const policyStart = preview.indexOf('        function isSafePreviewControl(target,event) {');
const listenerStart = preview.indexOf('        document.addEventListener("click", (event) => {', policyStart);
const listenerEnd = preview.indexOf('\n        }, true);', listenerStart);
assert(policyStart >= 0 && listenerStart > policyStart && listenerEnd > listenerStart,
  'Actual generic preview interaction contract is missing');
const clickPolicy = preview.slice(policyStart, listenerEnd + '\n        }, true);'.length);
const plugin = await readFile(path.join(php, 'wp-content/plugins/esc-visual-builder/esc-visual-builder.php'), 'utf8');
for (const module of ['shared-menu', 'shared-footer', 'shared-footer-media', 'shared-footer-assets']) {
  assert(plugin.includes(`/includes/${module}.php`), `${module} is not wired into WordPress`);
}

const fixture = `<!doctype html><html class="esc-builder-preview"><head><meta charset="utf-8"><style>
body{font:16px/1.5 system-ui;margin:0;background:#f1f5f9;color:#0f172a}header,main,footer{margin:16px;padding:20px;background:white;border:1px solid #cbd5e1;border-radius:10px}nav{display:flex;gap:18px;flex-wrap:wrap}button,a{font:inherit}button{padding:8px 12px;cursor:pointer}section{padding:16px;margin:10px 0;border:1px solid #ddd}[data-esc-vb-region-state="editable"]:hover{outline:2px dashed #2563eb}[data-esc-vb-region-state="readonly"]:hover{outline:2px dashed #94a3b8}#esc-vb-editability-hint{position:fixed;bottom:0;right:0;padding:12px;background:#eff6ff;max-width:85%}[hidden]{display:none!important}
</style></head><body>
<header id="main-header"><nav>
<a id="menu-link" data-esc-vb-menu-item-id="71" href="https://outside.example.test/" target="_blank" rel="noopener noreferrer">Menu item</a>
<button type="button" id="parent-toggle" data-menu-trigger data-esc-vb-menu-item-id="72" aria-expanded="false">Parent item</button>
</nav></header>
<main>
<section data-tablepress-preview="sample_07"><h1>Preview interaction fixture</h1>
<button type="button" data-esc-builder-preview-action id="slide">Next slide</button>
<button type="button" role="tab" aria-selected="false" id="tab">Details tab</button>
<details><summary id="summary">Accordion</summary><p>Accordion content</p></details>
<button type="button" id="unknown">Unapproved action</button>
<form><button type="submit" data-esc-builder-preview-action id="submit">Submit</button></form>
</section>
<section id="unsupported">Unsupported public content</section>
</main>
<footer id="footer-contact">
<p data-esc-vb-footer-field="sodienthoaihanoi">Phone: <a id="footer-phone" href="tel:0123456789"><span data-esc-vb-footer-value>0123456789</span></a></p>
<p data-esc-vb-footer-asset-row="4" data-esc-vb-footer-asset-table="pub_example_07" data-esc-vb-footer-asset-version="${'a'.repeat(64)}"><span data-esc-vb-footer-asset-label>Credit</span>: <a id="footer-credit" href="https://outside.example.test/" data-esc-vb-footer-asset-value>Publisher</a></p>
</footer></body></html>`;

const checks = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const navigations = [];
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    page.on('framenavigated', frame => navigations.push(frame.url()));
    await context.route('**/*', route => route.abort());
    await page.setContent(fixture);
    await page.evaluate(() => { window.__vbExports = {}; });
    for (const script of moduleScripts) await page.addScriptTag({ content: script });
    await page.evaluate(policy => {
      window.__events = { menu: [], footer: [], assets: [], unavailable: [], ui: 0, unknown: 0, submit: 0, messages: [] };
      const events = window.__events;
      const hooks = window.__vbExports;
      const unavailable = message => events.unavailable.push(message);
      window.__dispose = [
        hooks.installBuilderHeaderNavLock(document, (...value) => events.menu.push(value), true, unavailable),
        hooks.installBuilderFooterSelection(document, value => events.footer.push(value), unavailable, true, (...value) => events.assets.push(value), true),
        hooks.installBuilderEditabilityCues(document, { sample_07: {} }, unavailable, true, true, true),
      ];
      const fakeWindow = { parent: { postMessage: value => events.messages.push(value) } };
      new Function('document', 'Element', 'window', 'parentOrigin', 'NodeFilter',
        'let selectionDispatched=false;\n' + policy)(document, Element, fakeWindow, 'https://admin.example.test', NodeFilter);
      document.getElementById('parent-toggle').addEventListener('click', event => {
        const node = event.currentTarget;
        node.setAttribute('aria-expanded', String(node.getAttribute('aria-expanded') !== 'true'));
      });
      for (const id of ['slide', 'tab', 'summary']) document.getElementById(id).addEventListener('click', () => events.ui++);
      document.getElementById('unknown').addEventListener('click', () => events.unknown++);
      document.getElementById('submit').addEventListener('click', () => events.submit++);
    }, clickPolicy);

    await page.click('#menu-link');
    assert.equal(await page.evaluate(() => window.__events.menu[0]?.[2]), 71);
    assert.equal(await page.getAttribute('#menu-link', 'target'), '_blank');
    await page.click('#parent-toggle');
    assert.equal(await page.getAttribute('#parent-toggle', 'aria-expanded'), 'true');
    await page.click('#parent-toggle', { modifiers: ['Alt'] });
    assert.equal(await page.getAttribute('#parent-toggle', 'aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => window.__events.menu.at(-1)?.[2]), 72);
    await page.click('#footer-phone');
    assert.equal(await page.evaluate(() => window.__events.footer.at(-1)), 'sodienthoaihanoi');
    await page.click('#footer-credit');
    assert.deepEqual(await page.evaluate(() => window.__events.assets.at(-1)), [4, 'pub_example_07', 'a'.repeat(64)]);
    for (const id of ['slide', 'tab', 'summary']) await page.click('#' + id);
    assert.equal(await page.evaluate(() => window.__events.ui), 3);
    for (const id of ['unknown', 'submit']) await page.click('#' + id);
    assert.equal(await page.evaluate(() => window.__events.unknown + window.__events.submit), 0);
    await page.click('#slide', { modifiers: ['Alt'] });
    assert.equal(await page.evaluate(() => window.__events.ui), 3);
    await page.hover('#footer-phone');
    assert.equal(await page.getAttribute('[data-esc-vb-footer-field]', 'data-esc-vb-region-state'), 'editable');
    await page.screenshot({ path: path.join(output, name + '-editable.png'), fullPage: true });

    await page.evaluate(() => {
      window.__dispose.forEach(dispose => dispose());
      const hooks = window.__vbExports;
      const unavailable = value => window.__events.unavailable.push(value);
      window.__events.menu = []; window.__events.footer = []; window.__events.assets = [];
      hooks.installBuilderHeaderNavLock(document, value => window.__events.menu.push(value), false, unavailable);
      hooks.installBuilderFooterSelection(document, value => window.__events.footer.push(value), unavailable, false, value => window.__events.assets.push(value), false);
      hooks.installBuilderEditabilityCues(document, {}, unavailable, false, false, false);
    });
    await page.click('#menu-link');
    await page.click('#footer-phone');
    await page.click('#footer-credit');
    assert.equal(await page.evaluate(() => window.__events.menu.length + window.__events.footer.length + window.__events.assets.length), 0);
    assert((await page.evaluate(() => window.__events.unavailable.length)) >= 3);
    await page.hover('#footer-phone');
    assert.equal(await page.getAttribute('[data-esc-vb-footer-field]', 'data-esc-vb-region-state'), 'readonly');
    await page.screenshot({ path: path.join(output, name + '-readonly.png'), fullPage: true });
    assert.equal(context.pages().length, 1, 'Preview must not open a new tab');
    assert.equal(requests.length, 0, 'Offline preview must not send external/API requests');
    assert.equal(navigations.length, 0, 'Preview must not navigate');
    checks.push({ viewport: name, header: 'PASS', footer: 'PASS', controls: 'PASS', readonly: 'PASS', navigation: 'BLOCKED' });
    await context.close();
  }
  // Run the shipped WordPress TinyMCE and both actual native preview builders.
  // This editor is entirely synthetic; no admin login, DB save or external request.
  const phpRequire = createRequire(path.join(php, 'tests/esc-table-preview.test.cjs'));
  const builders = phpRequire(path.join(php, 'tests/esc-table-preview.test.cjs')).loadPreviewBuilders();
  const themeRoot = path.join(php, 'wp-content/themes/vibe-code-theme');
  const editorSource = await readFile(path.join(themeRoot, 'inc/tablepress/html.php'), 'utf8');
  const cssBlock = editorSource.match(/\$css = array\(([\s\S]*?)\n    \);/);
  assert(cssBlock, 'Native editor preview styles are missing');
  const editorCSS = [...cssBlock[1].matchAll(/'([^'\r\n]*)'/g)].map(match => match[1]).join('');
  const mceRoot = path.join(php, 'wp-includes/js/tinymce');
  const editorScripts = await Promise.all([
    readFile(path.join(mceRoot, 'tinymce.min.js'), 'utf8'),
    readFile(path.join(mceRoot, 'themes/modern/theme.min.js'), 'utf8'),
    readFile(path.join(mceRoot, 'plugins/noneditable/plugin.min.js'), 'utf8'),
  ]);
  const stylesheet = await readFile(path.join(themeRoot, 'mce.css'), 'utf8');
  const nativeFixture = '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><h1>ESC Table editor fixture</h1><textarea id="native-content"></textarea></body></html>';
  for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.href === 'https://editor.example.test/' && route.request().resourceType() === 'document') {
        await route.fulfill({ contentType: 'text/html', body: nativeFixture });
      } else if (url.origin === 'https://editor.example.test' &&
        /^\/tinymce-skin\/(?:skin\.min\.css|content\.min\.css|fonts\/(?:tinymce|tinymce-small)\.(?:woff|ttf|eot|svg))$/.test(url.pathname)) {
        const relative = url.pathname.slice('/tinymce-skin/'.length);
        await route.fulfill({ contentType: relative.endsWith('.css') ? 'text/css' : 'application/octet-stream',
          body: await readFile(path.join(mceRoot, 'skins/lightgray', relative)) });
      } else if (url.origin === 'https://editor.example.test' && url.pathname === '/wp-json/api/image/tablepress') {
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#dbeafe"/><text x="20" y="100" fill="#1e3a8a">ESC Table preview</text></svg>' });
      } else { unexpected.push(url.href); await route.abort(); }
    });
    // TinyMCE 4's URI bootstrap cannot initialize on an opaque about:blank URL.
    await page.goto('https://editor.example.test/');
    for (const content of editorScripts) await page.addScriptTag({ content });
    assert.deepEqual(errors, [], 'WordPress TinyMCE bootstrap: ' + errors.join('; '));
    assert.equal(await page.evaluate(() => typeof window.tinymce?.init), 'function');
    await page.evaluate(css => {
      window.tinymce.init({ selector: '#native-content', theme: 'modern', plugins: 'noneditable',
        skin: 'lightgray', skin_url: 'https://editor.example.test/tinymce-skin',
        content_css: false, content_style: css, menubar: false, toolbar: false,
        statusbar: false, width: 300, height: 500,
        init_instance_callback: () => { window.__nativeReady = true; } });
    }, stylesheet + editorCSS);
    await page.waitForFunction(() => window.__nativeReady === true, undefined, { timeout: 10000 });
    await page.locator('#native-content_ifr').waitFor({ state: 'visible', timeout: 10000 });
    for (const [action, build] of Object.entries(builders)) {
      const html = build('section_17', 300, 200);
      await page.evaluate(html => window.tinymce.get('native-content').setContent(html), html);
      await page.waitForFunction(() => {
        const image = window.tinymce.get('native-content').getBody().querySelector('.tablepress-attached-image');
        return image?.complete && image.naturalWidth === 300;
      }, undefined, { timeout: 10000 });
      const result = await page.evaluate(() => {
        const editor = window.tinymce.get('native-content');
        const image = editor.getBody().querySelector('.tablepress-attached-image');
        const box = image.getBoundingClientRect();
        const saved = editor.getContent();
        editor.setContent(saved);
        return { saved, reloaded: editor.getContent(), width: box.width, height: box.height,
          wrappers: editor.getBody().querySelectorAll('.tablepress-preview-wrap').length };
      });
      assert(!/\s(?:style|data-mce-style)\s*=/i.test(result.saved), action + ': serialized preview contains styles');
      assert(!/\s(?:style|data-mce-style)\s*=/i.test(result.reloaded), action + ': preview styles return after reload');
      assert.equal(result.wrappers, 1);
      assert.equal((result.saved.match(/\[table id=section_17 \/\]/g) || []).length, 1);
      assert(result.width > 0 && result.width <= 300 && Math.abs(result.width / result.height - 1.5) < 0.02,
        action + ': editor preview must fit its container without distorting the 300/200 image');
    }
    await page.frameLocator('#native-content_ifr').locator('.tablepress-attached-image').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => window.tinymce.get('native-content').getBody().querySelector('img')?.complete, undefined, { timeout: 10000 });
    await page.screenshot({ path: path.join(output, name + '-native-insertcode.png'), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    assert.equal(context.pages().length, 1);
    checks.push({ viewport: name, nativeInsertCode: 'PASS', nativeReplace: 'PASS', editor: 'WORDPRESS_TINYMCE', serializedStyles: 'NONE', sizing: 'PASS' });
    await context.close();
  }
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ sources, checks, scope: 'OFFLINE_BROWSER_CONTRACT; no production deployment' }, null, 2));
  console.log('MARINEAQUA_ESC_TABLE_INSERTCODE=PASS; native_tinymce=true; viewports=desktop,mobile; no_cms_write=true');
  console.log('MARINEAQUA_VISUAL_BUILDER_BROWSER=PASS; viewports=desktop,mobile; no_build=true; no_ftp=true; no_cms_write=true');
  console.log('SOURCE_SHAS=' + JSON.stringify(sources));
} finally {
  await browser.close();
}
