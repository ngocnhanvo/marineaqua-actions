import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const SOURCE = "https://marine-aqua.vn";
const TARGET = "https://admin.marine-aqua.io.vn";
const ROOT = "/danh-muc/may-bom-va-may-tao-song/";
const OUTPUT = "next-category-catalog-evidence";
const report = {
  source: SOURCE + ROOT, target: TARGET,
  checkedAt: new Date().toISOString(),
  scope: "read-only seven original marine-aqua category trees plus two children inventory",
  pages: [], brands: [], products: [], target: {}, errors: [],
};
await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const categoryRoots = [{slug:"may-bom-va-may-tao-song",children:["may-bom","may-tao-song"]},{slug:"muoi-bien",children:[]},{slug:"protein-skimmer",children:[]},{slug:"test-kits",children:[]},{slug:"thiet-bi-do",children:[]},{slug:"vat-lieu-loc",children:[]},{slug:"phu-kien-be-ca-canh",children:[]}];
  report.archiveMembership = {};
  report.categoryRoots=categoryRoots;
  for(const root of categoryRoots){
   for(const slug of ["",...root.children]){
    const path="/danh-muc/"+root.slug+"/"+(slug?slug+"/":"");
    const seen=new Set();
    const found=new Set();
    let next=SOURCE+path;
    for(let n=0;next&&n<100;n++){
     const url=new URL(next);
     if(url.origin!==SOURCE||!url.pathname.startsWith(path))throw Error("Pagination left category "+next);
     if(seen.has(url.href))throw Error("Pagination cycle "+url.href);
     seen.add(url.href);
     const response=await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:45000});
     if(!response?.ok())throw Error("Category HTTP "+response?.status()+" "+url.href);
     const info=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll("li.product, .products .product")];
      const links=[...new Set(cards.flatMap(el=>[...el.querySelectorAll("a[href]")].map(a=>a.href))
       .filter(h=>{try{const u=new URL(h);return u.origin===location.origin&&u.pathname.startsWith("/san-pham/")&&u.pathname.split("/").filter(Boolean).length===2}catch{return false}}))];
      const next=document.querySelector(".woocommerce-pagination a.next, a.next.page-numbers")?.href||"";
      return {links,next};
     });
     for(const link of info.links)found.add(link);
     report.pages.push({url:url.href,category:slug||root.slug,count:info.links.length});
     next=info.next;
    }
    report.archiveMembership[slug||root.slug]=[...found];
    report.products.push(...found);
    console.log("NEXT_CATEGORY_ARCHIVE="+(slug||root.slug)+" pages="+seen.size+" products="+found.size);
   }
  }
  report.products=[...new Set(report.products)];
  if(!report.products.length)throw Error("No source products");
  console.log("NEXT_CATEGORY_SOURCE_LISTINGS="+report.pages.length+" uniqueProducts="+report.products.length);
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

  // Capture independent product details and source taxonomy/SEO for safe migration.
  report.details = [];
  report.detailErrors = [];
  for (let i = 0; i < report.products.length; i++) {
    const productUrl = report.products[i];
    try {
      const productResponse = await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (!productResponse?.ok()) throw Error("HTTP " + productResponse?.status());
      const detail = await page.evaluate(() => {
        const text = selector => document.querySelector(selector)?.textContent?.replace(/\\s+/g, " ").trim() || "";
        const productTitle = text("h1.product_title, h1.entry-title, main h1");
        const images = [...document.querySelectorAll(".woocommerce-product-gallery__image img, .woocommerce-product-gallery img")]
          .map(img => ({ src: img.getAttribute("data-large_image") || img.getAttribute("data-src") || img.src, alt: img.alt || productTitle }))
          .filter(img => {
            try {
              const url = new URL(img.src, location.href);
              return url.origin === location.origin && url.pathname.startsWith("/wp-content/uploads/");
            } catch { return false; }
          }).map(img => ({ src: new URL(img.src, location.href).href, alt: img.alt }));
        const uniqueImages = [...new Map(images.map(img => [img.src, img])).values()];
        const categories = [...document.querySelectorAll(".posted_in a[href], .product_meta a[href*='/danh-muc/']")]
          .map(a => ({ name: a.textContent.trim(), href: a.href }))
          .filter(x => x.href.startsWith(location.origin + "/danh-muc/"));
        return {
          id: (document.body.className.match(/postid-(\\d+)/) || [])[1] || "",
          title: productTitle,
          seoTitle: document.title.trim(),
          seoDescription: document.querySelector('meta[name="description"]')?.content || "",
          sku: text(".sku"),
          priceText: text(".summary .price, .product .price"),
          stockText: text(".stock"),
          excerpt: text(".woocommerce-product-details__short-description").slice(0, 2000),
          description: text("#tab-description, .woocommerce-Tabs-panel--description").slice(0, 8000),
          categories,
          images: uniqueImages,
        };
      });
      if (!detail.title || !detail.images.length) throw Error("Missing title or original media");
      report.details.push({ url: productUrl, ...detail });
      if ((i + 1) % 25 === 0) console.log("NEXT_CATEGORY_DETAIL_PROGRESS=" + (i + 1) + "/" + report.products.length);
    } catch (error) {
      report.detailErrors.push({ url: productUrl, error: String(error?.message || error).slice(0, 180) });
    }
  }
  console.log("NEXT_CATEGORY_DETAIL_INVENTORY=" + report.details.length + "/" + report.products.length +
    " errors=" + report.detailErrors.length);
  // Read the current destination catalog with native WooCommerce REST authorization.
  const user = process.env.WP_ADMIN_USERNAME;
  const pass = process.env.WP_ADMIN_PASSWORD;
  if (!user || !pass) throw Error("Missing target read-only inventory credentials");
  const admin = await context.newPage();
  await admin.goto(TARGET + "/wp-login.php", { waitUntil: "domcontentloaded", timeout: 45000 });
  await admin.locator("#user_login").fill(user);
  await admin.locator("#user_pass").fill(pass);
  await admin.locator("#wp-submit").click();
  await admin.goto(TARGET + "/wp-admin/post-new.php?post_type=product", { waitUntil: "domcontentloaded", timeout: 45000 });
  if (admin.url().includes("wp-login.php")) throw Error("Destination product editor inaccessible");
  const nonce = await admin.evaluate(async () => {
    if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
    const response = await fetch("/wp-admin/admin-ajax.php?action=rest-nonce", { credentials: "same-origin" });
    return response.ok ? (await response.text()).trim() : "";
  });
  if (!nonce) throw Error("Destination REST nonce missing");
  report.target.products = [];
  for (let n = 1; n <= 50; n++) {
    const response = await context.request.get(TARGET + "/wp-json/wc/v3/products?per_page=100&status=any&page=" + n, {
      headers: { "X-WP-Nonce": nonce }, timeout: 45000, failOnStatusCode: false,
    });
    if (!response.ok()) {
      if (response.status() === 400 && n > 1) break;
      throw Error("Target Woo products HTTP " + response.status() + " page=" + n);
    }
    const items = await response.json();
    if (!Array.isArray(items)) throw Error("Target Woo products malformed page=" + n);
    report.target.products.push(...items.map(item => ({
      id: item.id, slug: item.slug, title: item.name, sku: item.sku, price: item.price,
      categories: item.categories?.map(c => ({ id: c.id, slug: c.slug })),
      sourceUrl: item.meta_data?.find(m => m.key === "_marine_source_url")?.value || "",
      sourceId: item.meta_data?.find(m => m.key === "_marine_source_id")?.value || "",
    })));
    if (items.length < 100) break;
  }
  const targetSlugs = new Set(report.target.products.map(item => item.slug));
  report.target.present = report.details.filter(item => targetSlugs.has(new URL(item.url).pathname.split("/").filter(Boolean).at(-1))).length;
  report.target.missing = report.details.length - report.target.present;
  console.log("NEXT_CATEGORY_TARGET_PRODUCTS=" + report.target.products.length +
    " sourceMatched=" + report.target.present + " missing=" + report.target.missing);
  await admin.close();
  if (report.detailErrors.length) throw Error("Some original product details could not be verified: " + report.detailErrors.length);

  console.log("NEXT_CATEGORY_SOURCE_INVENTORY=PASS listingPages=" + report.pages.length +
    " uniqueProducts=" + report.products.length + " categoryLinks=" + categoryRoots.length);
  console.log("NEXT_CATEGORY_TARGET_CATEGORY_HTTP=" + report.target.categoryHttp);
  await context.close();
} catch (error) {
  report.errors.push(String(error?.message || error).slice(0,500));
  console.error("NEXT_CATEGORY_INVENTORY_FAIL=" + report.errors.at(-1));
  process.exitCode = 1;
} finally {
  await writeFile(OUTPUT + "/manifest.json", JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
