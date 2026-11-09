import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const origin = "https://marine-aqua.vn/";
const output = path.resolve("reference-evidence");
await fs.mkdir(output, { recursive: true });

async function auditPage(label, width, height, mobile) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "vi-VN",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message).slice(0, 160)));
  let responseStatus = null;
  try {
    const response = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
    responseStatus = response?.status() ?? null;
    await page.waitForTimeout(4500);
    const finalUrl = new URL(page.url());
    if (!["marine-aqua.vn", "www.marine-aqua.vn"].includes(finalUrl.hostname)) {
      throw new Error("Unexpected website origin after redirect");
    }
    await page.evaluate(async () => {
      if ("fonts" in document) {
        await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 4000))]);
      }
    });
    const fullHeight = await page.evaluate(() => Math.min(document.documentElement.scrollHeight, 25000));
    for (let y = 0; y < fullHeight; y += Math.max(550, height - 120)) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(190);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);

    const audit = await page.evaluate(() => {
      const asText = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();
      const bounds = (el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY),
                 width: Math.round(r.width), height: Math.round(r.height) };
      };
      const heading = [...document.querySelectorAll("h1, h2, h3, h4")]
        .slice(0, 100).map((el) => ({ tag: el.tagName.toLowerCase(), text: asText(el).slice(0, 110), ...bounds(el) }));
      const logos = [...document.querySelectorAll("header img, .site-logo img, .custom-logo, img[alt*='Marine'], img[alt*='logo']")]
        .slice(0, 30).map((el) => ({ alt: el.alt || "", src: el.currentSrc || el.src || "",
          className: typeof el.className === "string" ? el.className.slice(0, 80) : "", ...bounds(el) }));
      const sections = [...document.querySelectorAll("main > *, main section, .elementor-section, .wp-block-group, .woocommerce, .home-product-catalog")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 100 && r.height > 65;
        }).slice(0, 90).map((el) => ({
          tag: el.tagName.toLowerCase(),
          id: (el.id || "").slice(0, 90),
          className: typeof el.className === "string" ? el.className.slice(0, 140) : "",
          text: asText(el).slice(0, 100), ...bounds(el),
        }));
      const imageAssets = [...document.querySelectorAll("header img, main img, .site-branding img, .custom-logo")]
        .filter((el) => el.currentSrc || el.src).slice(0, 70)
        .map((el) => ({ alt: el.alt || "", url: el.currentSrc || el.src, ...bounds(el) }));
      const productSections = [...document.querySelectorAll(".cat-products")]
        .map((section) => {
          const title = asText(section.querySelector("h2, h3, .cat-title")).slice(0, 100);
          const products = [...section.querySelectorAll(".product")].slice(0, 10).map((p) => ({
            title: asText(p.querySelector(".woocommerce-loop-product__title, h3, h2")).slice(0, 180),
            price: asText(p.querySelector(".price")).slice(0, 80),
            image: p.querySelector("img")?.currentSrc || p.querySelector("img")?.src || "",
            url: p.querySelector("a")?.href || "",
          }));
          return { title, products };
        });
      const categories = [...document.querySelectorAll(".widget_product_categories a")].slice(0, 55).map((a) =>
        ({ label: asText(a).slice(0, 70), href: a.href }));
      const colorSamples = [...document.querySelectorAll("header, nav, h1, h2, a, button, .site-header")]
        .slice(0, 32).map((el) => ({ tag: el.tagName.toLowerCase(), text: asText(el).slice(0, 45),
          color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
      return {
        title: document.title, documentHeight: document.documentElement.scrollHeight,
        heading, logos, sections, imageAssets, colorSamples, productSections, categories,
        firstBodyText: asText(document.body).slice(0, 1600),
      };
    });
    const target = path.join(output, label + ".jpg");
    await page.screenshot({ path: target, type: "jpeg", quality: 78, fullPage: true, animations: "disabled", timeout: 60000 });
    if (label === "desktop") {
      const logo = page.locator("header .custom-logo, header img[alt*='Marine'], header .site-logo img, header .custom-logo-link img").first();
      if (await logo.count() && await logo.isVisible()) {
        await logo.screenshot({ path: path.join(output, "original-logo.png"), timeout: 20000 });
      }
      const vp = await page.screenshot({ type: "jpeg", quality: 86, animations: "disabled" });
      await fs.writeFile(path.join(output, "desktop-first-fold.jpg"), vp);
    }
    if (label === "desktop") {
      const originalAssets = path.join(output, "source-assets");
      await fs.mkdir(originalAssets, { recursive: true });
      const originUrl = new URL(origin);
      const logoUrl = audit.logos.find((item) => item.src && item.src.includes("logo-trans.png"))?.src;
      const heroUrl = audit.imageAssets.find((item) => item.url.includes("/banner"))?.url;
      const candidates = [
        logoUrl && { name: "original-logo.png", url: logoUrl },
        heroUrl && { name: "original-banner.jpg", url: heroUrl },
        ...audit.productSections.flatMap((section, i) =>
          section.products.map((product, k) =>
            ({ name: "product-" + i + "-" + k + "." + (new URL(product.image).pathname.split(".").at(-1) || "jpg").toLowerCase(),
               url: product.image }))
        ),
      ].filter(Boolean);
      let copied = 0;
      for (const candidate of candidates) {
        const url = new URL(candidate.url);
        if (url.protocol !== "https:" || url.hostname !== originUrl.hostname || !url.pathname.startsWith("/wp-content/uploads/")) {
          console.log("REFERENCE_ASSET_SKIPPED", candidate.name, "origin_not_allowed");
          continue;
        }
        try {
          const response = await context.request.get(candidate.url, { timeout: 25000, maxRedirects: 2 });
          const contentType = String(response.headers()["content-type"] || "");
          const bytes = await response.body();
          if (!response.ok() || !contentType.startsWith("image/") || bytes.length > 4_000_000) {
            console.log("REFERENCE_ASSET_SKIPPED", candidate.name, "invalid_image_response");
            continue;
          }
          await fs.writeFile(path.join(originalAssets, candidate.name), bytes);
          copied++;
        } catch (error) {
          console.log("REFERENCE_ASSET_SKIPPED", candidate.name, "fetch_failed");
        }
      }
      console.log("REFERENCE_ORIGINAL_ASSETS_CAPTURED", copied, "of", candidates.length);
    }
    const report = { label, url: page.url(), viewport: { width, height }, status: responseStatus, pageErrors: errors, ...audit };
    await fs.writeFile(path.join(output, label + ".json"), JSON.stringify(report, null, 2));
    console.log("REFERENCE_CAPTURE_PASS", JSON.stringify({
      label, status: responseStatus, viewport: width + "x" + height,
      pageHeight: audit.documentHeight, headings: audit.heading.length,
      sections: audit.sections.length, logos: audit.logos.slice(0, 3),
      firstHeadings: audit.heading.slice(0, 20).map((h) => h.text),
      screenshot: target,
      categoryCount: audit.categories.length, productSectionCount: audit.productSections.length, products: audit.productSections.slice(0, 2),
    }));
    if (responseStatus !== 200) process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

await auditPage("desktop", 1440, 900, false);
await auditPage("mobile", 390, 844, true);
