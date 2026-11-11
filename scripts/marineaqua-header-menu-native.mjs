import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const origin = "https://admin.marine-aqua.io.vn";
const pageId = 82454;
const locale = "vi";
const outDir = "header-menu-native-evidence";
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = { origin, locale, pageId, attempted: false, createdMenu: false, addedPage: false, verified: false };

const publicHeader = async (context) => {
  const response = await context.request.get(origin + "/wp-json/esc-api/v1/menus", { timeout: 30000 });
  if (!response.ok()) throw Error("WordPress Menu REST HTTP " + response.status());
  const body = await response.json();
  if (body?.success !== true || typeof body?.menus !== "object") throw Error("Invalid WordPress Menu payload");
  const menu = body.menus?.Header?.[locale];
  return Array.isArray(menu?.items) ? menu.items : [];
};
const isHome = (item) => {
  const href = String(item?.slug || item?.href || item?.url || "");
  const text = String(item?.label || item?.title || "");
  return /trang.?chủ|trang.?chu/i.test(text) && href !== "#" && item?.linkType !== "none";
};
try {
  const context = await browser.newContext({ baseURL: origin });
  const [pagesResponse, before] = await Promise.all([
    context.request.get("/wp-json/wp/v2/pages/" + pageId + "?_fields=id,status,slug,acf", { timeout: 30000 }),
    publicHeader(context),
  ]);
  if (!pagesResponse.ok()) throw Error("Source Home Page is unavailable");
  const home = await pagesResponse.json();
  if (home.id !== pageId || home.status !== "publish" || home.slug !== "trang-chu")
    throw Error("Home Page identity changed; refusing CMS write");
  if (before.some(isHome)) {
    evidence.verified = true;
    console.log("HEADER_MENU_HOME=ALREADY_PRESENT");
  } else {
    const username = process.env.WP_ADMIN_USERNAME, password = process.env.WP_ADMIN_PASSWORD;
    if (!username || !password) throw Error("Missing WordPress Admin credentials");
    const page = await context.newPage();
    await page.goto("/wp-login.php", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.locator("#user_login").fill(username);
    await page.locator("#user_pass").fill(password);
    await page.locator("#wp-submit").click();
    await page.goto("/wp-admin/nav-menus.php", { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!page.url().includes("/wp-admin/nav-menus.php")) throw Error("Cannot access native Menu Manager");
    evidence.attempted = true;

    // Guard against changes by another admin. The project currently owns only this empty menu.
    const selected = Number(await page.locator("#nav-menu-meta-object-id").inputValue());
    const menuName = String(await page.locator("#menu-name").inputValue() || "");
    const existingItems = await page.locator("#menu-to-edit > li").count();
    if (existingItems !== 0) throw Error("Existing menu contains items; refusing replace");
    if (selected > 0 && menuName !== "Marine Aqua Header VI") {
      throw Error("Selected native menu has a different identity; refusing CMS write");
    }
    if (!selected) {
      await page.locator("#menu-name").fill("Marine Aqua Header VI");
      await page.locator("#esc-menu-code").fill("Header");
      await page.locator("#esc-menu-lang").selectOption(locale);
      await page.locator("#esc-menu-type").selectOption("dropdown");
      evidence.stage = "create_native_menu";
      await page.locator("#save_menu_footer").click();
      await page.waitForURL(url => url.pathname.endsWith("/nav-menus.php") && Number(url.searchParams.get("menu")) > 0, { timeout: 45000 });
      evidence.createdMenu = true;
      console.log("HEADER_MENU_CREATED=PASS");
    }
    if (await page.locator("#menu-to-edit > li").count() !== 0) throw Error("Menu changed before metadata update");
    // WP only persists the custom code/language metadata on a native save of an existing menu.
    evidence.stage = "persist_header_identity";
    await page.locator("#esc-menu-code").fill("Header");
    await page.locator("#esc-menu-lang").selectOption(locale);
    await page.locator("#esc-menu-type").selectOption("dropdown");
    await page.locator("#save_menu_footer").click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(400);
    const code = await page.locator("#esc-menu-code").inputValue();
    const lang = await page.locator("#esc-menu-lang").inputValue();
    if (code !== "Header" || lang !== locale) {
      throw Error("Header code and language were not persisted in native WordPress");
    }
    console.log("HEADER_MENU_IDENTITY=PASS code=Header lang=vi");
    // Native built-in JSON importer resolves this verified Page ID to a real nav_menu_item.
    // A replace is permitted only after asserting the selected menu contains zero items.
    if (await page.locator("#menu-to-edit > li").count() !== 0)
      throw Error("Menu gained items before import; refusing replace");
    evidence.stage = "native_preview_home_import";
    await page.locator("#esc-pse-menu-json-input").fill(JSON.stringify([{
      key: "home", lang: locale, label: "Trang chủ", pageId, linkMode: "page", children: []
    }]));
    await page.locator("#esc-pse-menu-json-preview").click();
    const resultBox = page.locator("#esc-pse-menu-json-result");
    await resultBox.waitFor({ state: "visible", timeout: 25000 });
    const previewText = await resultBox.innerText();
    if (!previewText.includes("1 items hợp lệ") || !previewText.includes("1 items match được Page")
        || !previewText.includes("0 items dùng custom URL")
        || !previewText.includes("0 items không có liên kết")) {
      throw Error("Native import preview did not verify the published Home Page");
    }
    evidence.stage = "commit_native_home_import";
    page.once("dialog", dialog => dialog.accept());
    await Promise.all([
      page.waitForEvent("load", { timeout: 30000 }),
      page.locator("#esc-pse-menu-json-replace").click(),
    ]);
    evidence.addedPage = true;
    console.log("HEADER_MENU_HOME_NATIVE_SAVE=PASS");
    const after = await publicHeader(context);
    evidence.verified = after.some(isHome);
    evidence.count = after.length;
    if (!evidence.verified) throw Error("Home item missing or non-navigable in WordPress REST readback");
    console.log("HEADER_MENU_HOME_REST=PASS items=" + after.length);
    await page.screenshot({ path: outDir + "/header-menu-admin.png", fullPage: false });
    await page.close();
  }
  await context.close();
} catch (error) {
  evidence.failure = String(error?.message || error).slice(0, 240);
  console.error("HEADER_MENU_NATIVE=FAIL " + evidence.failure);
  process.exitCode = 1;
} finally {
  await writeFile(outDir + "/result.json", JSON.stringify(evidence, null, 2) + "\n");
  await browser.close();
}
