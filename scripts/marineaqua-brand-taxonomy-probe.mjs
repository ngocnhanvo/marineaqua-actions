import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const origin = "https://marine-aqua.vn";
const samples = [
  "/san-pham/ati-straton-led-230w-den-led-chuyen-dung-cho-be-san-ho/",
  "/san-pham/kessil-ap9x-usa-den-led-chuyen-dung-cho-be-san-ho-ca-canh-bien/",
  "/san-pham/skimmer-deltec-2000i/",
];
const output = { samples: [], errors: [] };
await mkdir("brand-taxonomy-probe-evidence", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const path of samples) {
    const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!response?.ok()) throw Error("Source product HTTP " + response?.status() + " " + path);
    output.samples.push(await page.evaluate(() => ({
      url: location.href,
      productClasses: [...document.querySelectorAll("article.product, .product.type-product, main .product")]
        .slice(0, 5).map(el => String(el.className || "").split(/\\s+/).filter(c => c.includes("product_cat") || c.includes("product_tag"))),
      bodyCategoryClasses: [...document.body.classList].filter(c => c.includes("product_cat")),
      categoryAnchors: [...document.querySelectorAll("a[href*='/danh-muc/']")]
        .slice(0, 20).map(a => ({ text: a.textContent.trim(), href: a.href })),
      itemprops: [...document.querySelectorAll('[itemprop="category"]')]
        .map(el => ({ text: el.textContent.trim(), content: el.getAttribute("content") || "" })),
    })));
  }
  console.log("BRAND_TAXONOMY_PROBE=" + JSON.stringify(output.samples));
  await page.close();
} catch (error) {
  output.errors.push(String(error?.message || error));
  console.error("BRAND_TAXONOMY_PROBE_FAIL=" + output.errors.at(-1));
  process.exitCode = 1;
} finally {
  await writeFile("brand-taxonomy-probe-evidence/result.json", JSON.stringify(output, null, 2));
  await browser.close();
}
