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

    // The expected initial state is an empty native WP menu registry. Never replace or delete an existing menu.
    const existing = await page.locator("#select-menu-to-edit option").count();
    const selected = Number(await page.locator("#nav-menu-meta-object-id").inputValue());
    if (existing || selected) {
      throw Error("Menu registry changed; refusing potentially destructive bootstrap");
    }
    await page.locator("#menu-name").fill("Marine Aqua Header VI");
    await page.locator("#esc-menu-code").fill("Header");
    await page.locator("#esc-menu-lang").selectOption(locale);
    await page.locator("#esc-menu-type").selectOption("dropdown");
    evidence.stage = "create_native_menu";
    await page.locator("#save_menu_footer").click();
    await page.waitForURL(/nav-menus\.php.*menu=\d+/, { timeout: 45000 });
    evidence.createdMenu = true;
    console.log("HEADER_MENU_CREATED=PASS");

    // Add the already-published WordPress Home Page as a native post_type menu item.
    const homeChoices = page.locator('input[type="checkbox"][value="' + pageId + '"]');
    if (await homeChoices.count() === 0) throw Error("Published Home Page not present in native Page selector");
    await homeChoices.first().check({ force: true });
    await page.locator("#submit-posttype-page").click();
    await page.locator("#menu-to-edit > li").first().waitFor({ state: "attached", timeout: 30000 });
    evidence.stage = "add_published_home";
    const titleField = page.locator('#menu-to-edit input[id^="edit-menu-item-title-"]').first();
    if (await titleField.count()) await titleField.fill("Trang chủ");
    await page.locator("#save_menu_footer").click();
    await page.waitForLoadState("domcontentloaded");
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
