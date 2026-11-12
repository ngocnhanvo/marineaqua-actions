import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const SOURCE = "https://marine-aqua.vn";
const TARGET = "https://admin.marine-aqua.io.vn";
const ROOT = "/danh-muc/thuong-hieu/";
const OUTPUT = "brand-catalog-evidence";
const report = {
  source: SOURCE + ROOT, target: TARGET,
  checkedAt: new Date().toISOString(),
  scope: "read-only brand category and descendant product inventory",
  pages: [], brands: [], products: [], target: {}, errors: [],
};
await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const seen = new Set();
  let next = SOURCE + ROOT;
  for (let n = 0; next && n < 100; n++) {
    const url = new URL(next);
    if (url.origin !== SOURCE || !url.pathname.startsWith(ROOT)) {
      throw Error("Unexpected catalog pagination: " + next);
    }
    if (seen.has(url.href)) throw Error("Pagination cycle: " + next);
    seen.add(url.href);
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!response?.ok()) throw Error("Source listing HTTP " + response?.status() + " " + url.href);
    const result = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll("a[href]")];
      const productUrls = [...new Set(anchors
        .filter(a => a.closest("li.product, .products, .product-grid, .woocommerce-loop-product__link"))
        .map(a => a.href)
        .filter(href => {
          try {
            const u = new URL(href);
            return u.origin === location.origin && /^\\/san-pham\\/[^/]+\\/?$/.test(u.pathname);
          } catch { return false; }
        }))];
      const childCategories = anchors
        .filter(a => a.closest("ul.product-categories, .widget_product_categories"))
        .map(a => ({ label: a.textContent.trim(), url: a.href }))
        .filter(x => /^https:\\/\\/marine-aqua\\.vn\\/danh-muc\\/[^?#]+/.test(x.url));
      const pagination = anchors.find(a =>
        a.matches(".next.page-numbers, a.next") &&
        a.href.startsWith(location.origin + "/danh-muc/thuong-hieu/"));
      return { productUrls, childCategories, next: pagination?.href || "" };
    });
    report.pages.push({ url: url.href, productCount: result.productUrls.length });
    report.products.push(...result.productUrls);
    for (const cat of result.childCategories) {
      if (!report.brands.some(b => b.url === cat.url)) report.brands.push(cat);
    }
    next = result.next;
  }
  report.products = [...new Set(report.products)];
  if (!report.pages.length || !report.products.length) throw Error("Source brand category returned no products");
  const targetResponse = await context.request.get(TARGET + "/wp-json/api/products/categories", {
    timeout: 35000, failOnStatusCode: false,
  });
  report.target.categoryHttp = targetResponse.status();
  if (targetResponse.ok()) {
    const categories = await targetResponse.json();
    const flat = [];
    const walk = nodes => {
      for (const node of nodes || []) {
        flat.push({ id: node.id, slug: node.slug, name: node.name, parent: node.parent });
        walk(node.children);
      }
    };
    walk(Array.isArray(categories) ? categories : []);
    report.target.categories = flat;
  }
  console.log("BRAND_SOURCE_INVENTORY=PASS listingPages=" + report.pages.length +
    " uniqueProducts=" + report.products.length + " categoryLinks=" + report.brands.length);
  console.log("BRAND_TARGET_CATEGORY_HTTP=" + report.target.categoryHttp);
  await context.close();
} catch (error) {
  report.errors.push(String(error?.message || error).slice(0,500));
  console.error("BRAND_INVENTORY_FAIL=" + report.errors.at(-1));
  process.exitCode = 1;
} finally {
  await writeFile(OUTPUT + "/manifest.json", JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
