import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

// One-time, narrowly scoped migration of the seven approved V3 Header labels.
// Only WordPress Menu Manager stores the navigation; Astro has no local fallback.
const origin = "https://admin.marine-aqua.io.vn";
const pageId = 82454;
const locale = "vi";
const outDir = "header-menu-native-evidence";
const approved = [
  "Trang chủ",
  "⚡ GIẢM GIÁ KHỦNG",
  "CHÍNH SÁCH VÀ HƯỚNG DẪN",
  "THỜI GIAN BÁN HÀNG",
  "LIÊN HỆ",
  "PHÍ SHIP HÀNG",
  "BÀI VIẾT CHIA SẺ KINH NGHIỆM"
];
const normalized = s => String(s || "").replace(/⚡/g, "").trim().toLocaleLowerCase("vi");
const expected = approved.map(normalized);
const evidence = { origin, locale, pageId, attempted: false, verified: false, expectedCount: 7 };
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
async function readHeader(context) {
  const response = await context.request.get(origin + "/wp-json/esc-api/v1/menus", { timeout: 30000 });
  if (!response.ok()) throw Error("WordPress menu REST HTTP " + response.status());
  const body = await response.json();
  if (body?.success !== true || !body.menus || typeof body.menus !== "object")
    throw Error("WordPress menu REST schema invalid");
  return Array.isArray(body.menus?.Header?.[locale]?.items) ? body.menus.Header[locale].items : [];
}
function labels(items) { return items.map(i => normalized(i.label || i.title)); }
function isApproved(items) { return items.length === 7 && labels(items).every((s,i) => s === expected[i]); }
function isHome(item) {
  const label = normalized(item?.label || item?.title);
  const url = String(item?.slug || item?.href || item?.url || "");
  return label === normalized("Trang chủ") && url && url !== "#" && item?.linkType !== "none";
}
try {
  const context = await browser.newContext({ baseURL: origin });
  const [homeResponse, before] = await Promise.all([
    context.request.get("/wp-json/wp/v2/pages/" + pageId + "?_fields=id,status,slug", { timeout: 30000 }),
    readHeader(context)
  ]);
  if (!homeResponse.ok()) throw Error("Home Page identity lookup failed");
  const home = await homeResponse.json();
  if (home.id !== pageId || home.status !== "publish" || home.slug !== "trang-chu")
    throw Error("Verified Home Page identity changed");
  evidence.beforeCount = before.length;
  if (isApproved(before)) {
    if (!isHome(before[0])) throw Error("Existing Home item has invalid destination");
    evidence.verified = true;
    console.log("HEADER_MENU_V3=ALREADY_PRESENT");
  } else {
    // Only migrate initial blank or verified Home-only state, never overwrite an admin-customized menu.
    if (before.length > 1 || (before.length === 1 && !isHome(before[0])))
      throw Error("Existing menu differs from verified Home-only state; refusing replace");
    const username = process.env.WP_ADMIN_USERNAME, password = process.env.WP_ADMIN_PASSWORD;
    if (!username || !password) throw Error("WordPress Admin credentials unavailable");
    const page = await context.newPage();
    await page.goto("/wp-login.php", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.locator("#user_login").fill(username);
    await page.locator("#user_pass").fill(password);
    await page.locator("#wp-submit").click();
    await page.goto("/wp-admin/nav-menus.php", { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!page.url().includes("/wp-admin/nav-menus.php")) throw Error("Native Menu Manager unavailable");
    const menuName = await page.locator("#menu-name").inputValue();
    const selected = Number(await page.locator("#nav-menu-meta-object-id").inputValue());
    if (selected && menuName !== "Marine Aqua Header VI")
      throw Error("Wrong selected WordPress menu; refusing write");
    const currentRows = await page.locator("#menu-to-edit > li").count();
    if (currentRows !== before.length) throw Error("Menu item count changed since REST check");
    if (before.length === 1) {
      const adminText = normalized(await page.locator("#menu-to-edit > li").first().innerText());
      if (!adminText.includes(normalized("Trang chủ")))
        throw Error("Admin menu content differs from expected Home-only state");
    }
    if (!selected) {
      if (before.length !== 0) throw Error("REST menu exists but native manager has no selection");
      await page.locator("#menu-name").fill("Marine Aqua Header VI");
      await page.locator("#esc-menu-code").fill("Header");
      await page.locator("#esc-menu-lang").selectOption(locale);
      await page.locator("#esc-menu-type").selectOption("dropdown");
      await page.locator("#save_menu_footer").click();
      await page.waitForURL(u => u.pathname.endsWith("/nav-menus.php") && Number(u.searchParams.get("menu")) > 0, { timeout: 45000 });
      evidence.createdMenu = true;
    }
    await page.locator("#esc-menu-code").fill("Header");
    await page.locator("#esc-menu-lang").selectOption(locale);
    await page.locator("#esc-menu-type").selectOption("dropdown");
    await page.locator("#save_menu_footer").click();
    await page.waitForLoadState("domcontentloaded");
    const code = await page.locator("#esc-menu-code").inputValue();
    const lang = await page.locator("#esc-menu-lang").inputValue();
    if (code !== "Header" || lang !== locale) throw Error("Menu identity not persisted");
    // Owner approved adding labels now and assigning destinations later.
    // linkMode none avoids invented slugs or dead '#' URLs.
    const items = [
      {key:"home",lang:locale,label:approved[0],pageId,linkMode:"page",children:[]},
      ...approved.slice(1).map((label,i)=>({key:"approved-v3-"+(i+2),lang:locale,label,linkMode:"none",children:[]}))
    ];
    await page.locator("#esc-pse-menu-json-input").fill(JSON.stringify(items));
    evidence.stage = "preview_native_import";
    await page.locator("#esc-pse-menu-json-preview").click();
    const resultBox = page.locator("#esc-pse-menu-json-result");
    await resultBox.waitFor({ state: "visible", timeout: 25000 });
    const preview = await resultBox.innerText();
    evidence.preview = preview.slice(0, 450);
    if (!preview.includes("7 items hợp lệ") || !preview.includes("1 items match được Page") ||
        !preview.includes("0 items dùng custom URL") || !preview.includes("6 items không có liên kết"))
      throw Error("Native import preview rejected requested label-only menu: " + preview.slice(0,180));
    // Re-read immediately before replace to avoid clobbering concurrent editor changes.
    const justBefore = await readHeader(context);
    if (JSON.stringify(labels(justBefore)) !== JSON.stringify(labels(before)))
      throw Error("WordPress menu changed concurrently; refusing replace");
    evidence.attempted = true;
    evidence.stage = "save_native_import";
    page.once("dialog", dialog => dialog.accept());
    await Promise.all([
      page.waitForEvent("load", { timeout: 30000 }),
      page.locator("#esc-pse-menu-json-replace").click()
    ]);
    evidence.saved = true;
    await page.screenshot({ path: outDir + "/header-menu-admin.png", fullPage: false });
    await page.close();
  }
  const after = await readHeader(context);
  evidence.afterCount = after.length;
  evidence.actualLabels = after.map(i => String(i.label || i.title || ""));
  evidence.verified = isApproved(after) && isHome(after[0]);
  if (!evidence.verified)
    throw Error("REST readback did not match approved V3 order, labels and navigable Home");
  console.log("HEADER_MENU_V3_REST=PASS items=7; link destinations pending for 6 entries");
  await context.close();
} catch (error) {
  evidence.failure = String(error?.message || error).slice(0,500);
  console.error("HEADER_MENU_V3=FAIL " + evidence.failure);
  process.exitCode = 1;
} finally {
  await writeFile(outDir + "/result.json", JSON.stringify(evidence, null, 2) + "\n");
  await browser.close();
}
