import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const WP = "https://admin.marine-aqua.io.vn";
const SLUG = "san-pham";
const KEY = "ssr-products";
const ACTION = "ProductsSSRPage";
const user = process.env.WP_ADMIN_USERNAME;
const password = process.env.WP_ADMIN_PASSWORD;
if (!user || !password) throw new Error("CMS_PRODUCT_PAGE_BLOCKED: missing credentials");

const dir = "product-list-page-evidence";
await mkdir(dir, { recursive: true });
const record = { slug: SLUG, key: KEY, action: ACTION, created: false, published: false, checks: [] };
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ baseURL: WP });
  const page = await context.newPage();
  await page.goto(WP + "/wp-login.php", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator("#user_login").fill(user);
  await page.locator("#user_pass").fill(password);
  await page.locator("#wp-submit").click();
  if (page.url().includes("wp-login.php")) throw Error("WordPress admin authentication rejected");
  await page.goto(WP + "/wp-admin/edit.php?post_type=page", { waitUntil: "domcontentloaded", timeout: 45000 });
  if (!page.url().includes("/wp-admin/edit.php")) throw Error("WordPress Pages permissions unavailable");

  // API nonce comes only from the current authenticated WordPress admin, never
  // from user input or a hard-coded token.
  const nonce = await page.evaluate(() =>
    window.wpApiSettings?.nonce ||
    document.querySelector('input[name="_wpnonce"]')?.value || "");
  if (!nonce) throw Error("WordPress REST nonce unavailable");

  const request = async (method, path, payload) => {
    const response = await page.evaluate(async ({ method, path, payload, nonce }) => {
      const r = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-WP-Nonce": nonce },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      let data = null;
      try { data = await r.json(); } catch { }
      return { status: r.status, ok: r.ok, data };
    }, { method, path, payload, nonce });
    if (!response.ok) {
      const code = String(response.data?.code || "unknown");
      throw Error("WordPress REST " + method + " " + path.split("?")[0] + " HTTP=" + response.status + " code=" + code);
    }
    return response.data;
  };

  const existing = await request("GET", "/wp-json/wp/v2/pages?context=edit&per_page=100&_fields=id,slug,status,acf");
  if (!Array.isArray(existing)) throw Error("Malformed authenticated page inventory");
  const matches = existing.filter(item => item.slug === SLUG || item.acf?.key === KEY);
  if (matches.length > 1) throw Error("Duplicate product listing pages; refusing mutation");
  const candidate = matches[0];
  if (candidate && (candidate.slug !== SLUG || candidate.acf?.key !== KEY ||
      candidate.acf?.action !== ACTION)) {
    throw Error("Existing product page configuration conflicts with required route");
  }
  if (candidate?.status === "publish") {
    record.pageId = candidate.id;
    record.published = true;
    record.checks.push("existing_rest_readback");
  } else {
    // No product listing Page exists. Create as draft, verify ACF and route,
    // publish only after readback; temporary draft is trashed if verification fails.
    let id = candidate?.id || null;
    try {
      if (!id) {
        const draft = await request("POST", "/wp-json/wp/v2/pages", {
          title: "Sản phẩm",
          slug: SLUG,
          status: "draft",
          acf: { key: KEY, action: ACTION, product_lang: "vi" },
        });
        id = draft?.id;
        if (!Number.isInteger(id) || id <= 0) throw Error("Page create did not return a valid ID");
        record.created = true;
        record.pageId = id;
      }
      let details = await request("GET", "/wp-json/wp/v2/pages/" + id + "?context=edit");
      if (details?.slug !== SLUG || details?.acf?.key !== KEY ||
          details?.acf?.action !== ACTION) {
        throw Error("Draft ACF REST readback did not match intended page");
      }
      record.checks.push("draft_acf_readback");
      if (details.status !== "publish") {
        await request("POST", "/wp-json/wp/v2/pages/" + id, { status: "publish" });
      }
      details = await request("GET", "/wp-json/wp/v2/pages/" + id + "?context=edit");
      if (details?.status !== "publish" || details?.slug !== SLUG ||
          details?.acf?.key !== KEY || details?.acf?.action !== ACTION) {
        throw Error("Published listing page failed readback verification");
      }
      record.published = true;
      record.pageId = id;
      record.checks.push("published_rest_readback");
    } catch (error) {
      if (record.created && id) {
        try {
          const discarded = await request("DELETE", "/wp-json/wp/v2/pages/" + id);
          record.cleaned = discarded?.status === "trash";
        } catch (cleanupError) {
          record.cleanupError = String(cleanupError.message || cleanupError).slice(0,140);
        }
      }
      throw error;
    }
  }
  if (!record.published) throw Error("Listing page not published");
  await page.goto(WP + "/wp-admin/post.php?post=" + record.pageId + "&action=edit",
    { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.screenshot({ path: dir + "/verified-product-page.png", fullPage: false });
  console.log("CMS_PRODUCT_LIST_PAGE=PASS " + JSON.stringify(record));
  await context.close();
} catch (error) {
  record.error = String(error.message || error).slice(0,260);
  console.error("CMS_PRODUCT_LIST_PAGE=FAIL " + JSON.stringify(record));
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(dir + "/result.json", JSON.stringify(record, null, 2) + "\n");
}
