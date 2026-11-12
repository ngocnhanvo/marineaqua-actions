import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const SOURCE = "https://marine-aqua.vn";
const manifest = JSON.parse(await readFile("brand-catalog-evidence/manifest.json", "utf8"));
const outputDir = "brand-taxonomy-mapping-evidence";
await mkdir(outputDir, { recursive: true });
const targetCats = manifest.target.categories.filter(c => c.parent === 1769);
const expected = new Set(manifest.products);
const result = { inputCount: expected.size, brands: [], assignments: {}, unassigned: [], errors: [] };
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  for (const category of targetCats) {
    const seen = new Set();
    const products = new Set();
    let next = SOURCE + "/danh-muc/thuong-hieu/" + category.slug + "/";
    for (let n = 0; next && n < 70; n++) {
      if (seen.has(next)) throw Error("Category pagination loop " + category.slug);
      seen.add(next);
      const response = await page.goto(next, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (!response?.ok()) throw Error("Category HTTP " + response?.status() + " " + next);
      const { links, nextPage } = await page.evaluate(() => {
        const items = [...document.querySelectorAll("li.product a[href], .products .product a[href]")];
        const links = [...new Set(items.map(a => a.href).filter(href => {
          const url = new URL(href, location.href);
          return url.origin === location.origin && url.pathname.startsWith("/san-pham/") &&
            url.pathname.split("/").filter(Boolean).length === 2;
        }))];
        const next = document.querySelector(".woocommerce-pagination a.next, a.next.page-numbers");
        return { links, nextPage: next?.href || "" };
      });
      for (const link of links) products.add(link);
      const u = nextPage ? new URL(nextPage) : null;
      if (u && (u.origin !== SOURCE || !u.pathname.startsWith("/danh-muc/thuong-hieu/" + category.slug + "/")))
        throw Error("Pagination escaped category " + category.slug);
      next = u?.href || "";
    }
    for (const url of products) {
      if (!result.assignments[url]) result.assignments[url] = [];
      result.assignments[url].push({ id: category.id, slug: category.slug });
    }
    result.brands.push({ id: category.id, slug: category.slug, name: category.name,
      listingPages: seen.size, matched: [...products].filter(p => expected.has(p)).length,
      totalListed: products.size });
    console.log("BRAND_CATEGORY=" + category.slug + " pages=" + seen.size +
      " products=" + products.size);
  }
  // Some products appear only in the parent archive, not in any brand-child
  // archive. Read the actual primary product's WooCommerce taxonomy classes,
  // rather than guessing a brand from its name or related-product cards.
  result.parentOnly = [];
  for (const productUrl of [...expected].filter(url => !result.assignments[url]?.length)) {
    const response = await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!response?.ok()) throw Error("Unassigned detail HTTP " + response?.status() + " " + productUrl);
    const classes = await page.evaluate(() => {
      const element = document.querySelector(".product.type-product");
      return [...(element?.classList || [])].filter(x => x.startsWith("product_cat-"))
        .map(x => x.slice("product_cat-".length));
    });
    const matched = manifest.target.categories.filter(c => classes.includes(c.slug));
    if (!classes.length || !matched.length)
      throw Error("Missing authoritative taxonomy for " + productUrl + " classes=" + classes.join(","));
    result.assignments[productUrl] = matched.map(c => ({ id: c.id, slug: c.slug }));
    result.parentOnly.push({ url: productUrl, sourceClasses: classes, mapped: result.assignments[productUrl] });
  }
  result.unassigned = [...expected].filter(url => !result.assignments[url]?.length);
  result.unexpected = Object.keys(result.assignments).filter(url => !expected.has(url));
  console.log("BRAND_MAPPING=PASS source=" + expected.size +
    " assigned=" + (expected.size - result.unassigned.length) +
    " unassigned=" + result.unassigned.length + " unexpected=" + result.unexpected.length);
  if (result.unassigned.length) throw Error("Source products with no brand assignment " + result.unassigned.length);
  await context.close();
} catch (e) {
  result.errors.push(String(e?.message || e).slice(0,360));
  console.error("BRAND_MAPPING=FAIL " + result.errors.at(-1));
  process.exitCode = 1;
} finally {
  await writeFile(outputDir + "/mapping.json", JSON.stringify(result, null, 2));
  await browser.close();
}
