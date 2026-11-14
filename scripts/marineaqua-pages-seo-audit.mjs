import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const SOURCE = "https://marine-aqua.vn";
const WP = "https://admin.marine-aqua.io.vn";
const FRONT = "https://marine-aqua.io.vn";
const OUT = "pages-seo-audit-evidence";
const report = { status: "STARTED", source: SOURCE, target: FRONT, inventory: {}, records: [], errors: [], writes: 0 };
await mkdir(OUT, { recursive: true });

const clean = (value) => String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/\\[table\\b[^\\]]*\\]/gi, " ").replace(/\\s+/g, " ").trim();
const norm = (value) => clean(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const excerpt = (value) => {
  const text = clean(value);
  if (!text) return "";
  const sentence = text.length > 165 ? text.slice(0, 165).replace(/\\s+\\S*$/, "") : text;
  return sentence.trim().replace(/[,. ;:-]+$/, "") + (text.length > 165 ? "…" : "");
};
const pageRoute = (item) => {
  const key = String(item.acf?.key || "");
  if (key.startsWith("ssr-cart")) return "/ssr/cart/" + encodeURIComponent(item.slug);
  return "/" + encodeURIComponent(item.slug);
};
const readHead = async (page) => page.evaluate(() => ({
  documentTitle: document.title || "",
  description: document.querySelector('meta[name="description"]')?.content || "",
  canonical: document.querySelector('link[rel="canonical"]')?.href || "",
  h1: [...document.querySelectorAll("h1")].map(x => (x.innerText || x.textContent || "").replace(/\\s+/g, " ").trim()).filter(Boolean),
  mainText: (document.querySelector("main#main-content, main, article .entry-content, .entry-content")?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 12000),
  robots: document.querySelector('meta[name="robots"]')?.content || ""
}));
const browser = await chromium.launch({ headless: true });
try {
  if (!process.env.WP_ADMIN_USERNAME || !process.env.WP_ADMIN_PASSWORD) throw new Error("WordPress admin credentials are not configured");
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const admin = await context.newPage();
  let authenticated = false;
  for (let attempt = 0; attempt < 3 && !authenticated; attempt++) {
    await admin.goto(WP + "/wp-login.php", { waitUntil: "domcontentloaded", timeout: 45000 });
    if (await admin.locator("#user_login").count()) {
      await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
      await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
      await admin.locator("#wp-submit").click();
      await admin.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    }
    authenticated = !admin.url().includes("wp-login.php") && await admin.locator("#wpadminbar").count() > 0;
    if (!authenticated) await admin.waitForTimeout(1200 * (attempt + 1));
  }
  if (!authenticated) throw new Error("WordPress Admin login failed");
  await admin.goto(WP + "/wp-admin/post-new.php?post_type=page", { waitUntil: "domcontentloaded", timeout: 45000 });
  const nonce = await admin.evaluate(async () => {
    if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
    const response = await fetch("/wp-admin/admin-ajax.php?action=rest-nonce", { credentials: "same-origin" });
    return response.ok ? (await response.text()).trim() : "";
  });
  if (!/^[a-zA-Z0-9]{8,32}$/.test(nonce)) throw new Error("WordPress REST nonce unavailable");

  const pages = [];
  let totalPages = 1;
  for (let number = 1; number <= totalPages; number++) {
    const response = await context.request.get(
      WP + "/wp-json/wp/v2/pages?context=edit&status=publish&per_page=100&page=" + number +
      "&_fields=id,slug,status,title,content,excerpt,acf,yoast_head_json,meta",
      { headers: { "X-WP-Nonce": nonce }, timeout: 45000, failOnStatusCode: false }
    );
    if (!response.ok()) throw new Error("Published Page inventory HTTP " + response.status());
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error("Published Page inventory is not an array");
    pages.push(...batch);
    totalPages = Number(response.headers()["x-wp-totalpages"] || "1");
    if (!Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages > 100) throw new Error("Invalid published Page pagination");
  }
  if (new Set(pages.map(x => Number(x.id))).size !== pages.length) throw new Error("Duplicate WordPress Page IDs");
  report.inventory = {
    publishedPages: pages.length,
    locales: [...new Set(pages.map(p => p.acf?.product_lang?.value || p.acf?.product_lang || "vi"))].sort(),
    actions: [...new Set(pages.map(p => p.acf?.action || ""))].sort(),
    ssrPages: pages.filter(p => String(p.acf?.key || "").startsWith("ssr-")).length
  };
  console.log("PUBLISHED_PAGE_INVENTORY=" + JSON.stringify(report.inventory));

  const probeId = pages.find(p => p.status === "publish")?.id;
  if (probeId) {
    await admin.goto(WP + "/wp-admin/post.php?post=" + probeId + "&action=edit", { waitUntil: "domcontentloaded", timeout: 45000 });
    report.adminEditorProbe = await admin.locator("input,textarea,[contenteditable=true]").evaluateAll(elements =>
      elements.filter(el => /yoast/i.test([el.id, el.name, el.getAttribute("aria-label"), el.getAttribute("placeholder")].join(" ")))
        .slice(0, 30).map(el => ({
          tag: el.tagName, id: el.id, name: el.getAttribute("name") || "",
          valueLength: String(el.value || "").length,
          placeholder: el.getAttribute("placeholder") || ""
        }))
    );
    report.adminRestMetaKeys = Object.keys(pages.find(p => p.id === probeId)?.meta || {});
  }

  const sourceApi = await context.request.get(SOURCE + "/wp-json/", { timeout: 30000, failOnStatusCode: false });
  report.sourceRest = { status: sourceApi.status(), available: sourceApi.ok() };
  const sourcePage = await context.newPage();
  const targetPage = await context.newPage();

  for (const item of pages) {
    const key = String(item.acf?.key || "");
    const locale = item.acf?.product_lang?.value || item.acf?.product_lang || "vi";
    const record = {
      id: item.id, slug: item.slug, key, action: item.acf?.action || "", locale,
      pageTitle: clean(item.title?.rendered || item.title?.raw || ""),
      route: pageRoute(item), sourceStatus: 0, targetStatus: 0,
      sourceH1: [], targetH1: [], issues: []
    };
    try {
      const sourceRestResponse = await context.request.get(
        SOURCE + "/wp-json/wp/v2/pages?slug=" + encodeURIComponent(item.slug) +
        "&_fields=id,slug,status,title,content,excerpt,yoast_head_json",
        { timeout: 30000, failOnStatusCode: false }
      );
      let sourceItems = sourceRestResponse.ok() ? await sourceRestResponse.json() : [];
      if (!Array.isArray(sourceItems)) sourceItems = [];
      const exactSource = sourceItems.filter(p => p.slug === item.slug && p.status === "publish");
      record.sourcePageId = exactSource.length === 1 ? exactSource[0].id : null;
      record.sourceMatchCount = exactSource.length;
      const sourceData = exactSource.length === 1 ? exactSource[0] : null;
      record.sourceSeoTitle = clean(sourceData?.yoast_head_json?.title || "");
      record.sourceSeoDescription = clean(sourceData?.yoast_head_json?.description || "");
      record.sourceContentLength = clean(sourceData?.content?.rendered || "").length;

      const sourceUrl = SOURCE + "/" + encodeURIComponent(item.slug) + "/";
      try {
        const response = await sourcePage.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
        record.sourceStatus = response?.status() || 0;
        record.sourceFinalUrl = sourcePage.url();
        if (record.sourceStatus >= 200 && record.sourceStatus < 400) {
          const sourceHead = await readHead(sourcePage);
          record.sourceDocumentTitle = sourceHead.documentTitle;
          record.sourceMetaDescription = sourceHead.description;
          record.sourceH1 = sourceHead.h1;
          record.sourceTextLength = sourceHead.mainText.length;
          record.sourceCanonical = sourceHead.canonical;
          if (!record.sourceSeoTitle) record.sourceSeoTitle = sourceHead.documentTitle;
          if (!record.sourceSeoDescription) record.sourceSeoDescription = sourceHead.description;
        }
      } catch (error) {
        record.sourceBrowserError = String(error.message || error).slice(0, 140);
      }

      try {
        const targetUrl = FRONT + record.route;
        const response = await targetPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
        record.targetStatus = response?.status() || 0;
        record.targetFinalUrl = targetPage.url();
        if (record.targetStatus >= 200 && record.targetStatus < 400) {
          const targetHead = await readHead(targetPage);
          record.targetDocumentTitle = targetHead.documentTitle;
          record.targetMetaDescription = targetHead.description;
          record.targetH1 = targetHead.h1;
          record.targetCanonical = targetHead.canonical;
          record.targetRobots = targetHead.robots;
          record.targetTextLength = targetHead.mainText.length;
        }
      } catch (error) {
        record.targetBrowserError = String(error.message || error).slice(0, 140);
      }

      record.sourceH1Primary = record.sourceH1[0] || "";
      record.targetH1Primary = record.targetH1[0] || "";
      record.targetSeoTitle = record.targetDocumentTitle || clean(item.yoast_head_json?.title || "");
      record.targetSeoDescription = record.targetMetaDescription || clean(item.yoast_head_json?.description || "");
      const sourceTitle = record.sourceSeoTitle || record.pageTitle;
      const sourceDescription = record.sourceSeoDescription;
      record.recommendedSeoTitle = sourceTitle
        ? (sourceTitle.length <= 65 ? sourceTitle : sourceTitle.slice(0, 62).replace(/\\s+\\S*$/, "") + "…")
        : (record.pageTitle ? record.pageTitle + " | Marine Aqua" : "");
      const fallbackText = clean(sourceData?.content?.rendered || item.content?.raw || item.content?.rendered || "");
      record.recommendedSeoDescription = sourceDescription || excerpt(fallbackText);
      if (!record.sourcePageId) record.issues.push("SOURCE_PAGE_NOT_FOUND");
      if (!record.sourceSeoTitle) record.issues.push("SOURCE_SEO_TITLE_MISSING");
      if (!record.sourceSeoDescription) record.issues.push("SOURCE_SEO_DESCRIPTION_MISSING");
      if (!record.targetStatus) record.issues.push("TARGET_ROUTE_UNAVAILABLE");
      if (record.targetStatus && record.targetStatus !== 200) record.issues.push("TARGET_HTTP_" + record.targetStatus);
      if (!record.targetSeoTitle) record.issues.push("TARGET_SEO_TITLE_MISSING");
      if (!record.targetSeoDescription) record.issues.push("TARGET_SEO_DESCRIPTION_MISSING");
      if (!record.targetH1Primary) record.issues.push("TARGET_H1_MISSING");
      if (record.sourceH1Primary && record.targetH1Primary && norm(record.sourceH1Primary) !== norm(record.targetH1Primary))
        record.issues.push("H1_MISMATCH");
      if (record.sourceSeoTitle && record.targetSeoTitle && norm(record.sourceSeoTitle) !== norm(record.targetSeoTitle))
        record.issues.push("SEO_TITLE_MISMATCH");
      if (record.sourceSeoDescription && record.targetSeoDescription && norm(record.sourceSeoDescription) !== norm(record.targetSeoDescription))
        record.issues.push("SEO_DESCRIPTION_MISMATCH");
      if (record.targetCanonical && !record.targetCanonical.startsWith(FRONT + "/"))
        record.issues.push("CANONICAL_NOT_TARGET_DOMAIN");
      if (!record.targetCanonical) record.issues.push("CANONICAL_MISSING");
    } catch (error) {
      record.issues.push("AUDIT_ERROR");
      record.error = String(error.message || error).slice(0, 220);
      report.errors.push({ id: item.id, slug: item.slug, error: record.error });
    }
    record.verdict = record.issues.length ? "REVIEW" : "PASS";
    report.records.push(record);
    console.log("PAGE_SEO_AUDIT=" + JSON.stringify({
      id: record.id, slug: record.slug, locale: record.locale, route: record.route,
      sourceStatus: record.sourceStatus, targetStatus: record.targetStatus,
      sourceH1: record.sourceH1Primary, targetH1: record.targetH1Primary,
      sourceTitle: record.sourceSeoTitle, targetTitle: record.targetSeoTitle,
      sourceDescriptionLength: record.sourceSeoDescription.length,
      targetDescriptionLength: record.targetSeoDescription.length,
      issues: record.issues
    }));
  }

  report.summary = {
    total: report.records.length,
    pass: report.records.filter(x => x.verdict === "PASS").length,
    review: report.records.filter(x => x.verdict !== "PASS").length,
    sourceMissingTitle: report.records.filter(x => x.issues.includes("SOURCE_SEO_TITLE_MISSING")).length,
    sourceMissingDescription: report.records.filter(x => x.issues.includes("SOURCE_SEO_DESCRIPTION_MISSING")).length,
    targetMissingTitle: report.records.filter(x => x.issues.includes("TARGET_SEO_TITLE_MISSING")).length,
    targetMissingDescription: report.records.filter(x => x.issues.includes("TARGET_SEO_DESCRIPTION_MISSING")).length,
    h1Mismatch: report.records.filter(x => x.issues.includes("H1_MISMATCH")).length,
    routeUnavailable: report.records.filter(x => x.issues.includes("TARGET_ROUTE_UNAVAILABLE")).length
  };
  report.status = report.errors.length ? "PARTIAL" : "AUDIT_COMPLETE";
  console.log("PAGES_SEO_AUDIT_SUMMARY=" + JSON.stringify(report.summary));
  await context.close();
} catch (error) {
  report.status = "FAIL";
  report.errors.push({ fatal: String(error.stack || error).slice(0, 800) });
  process.exitCode = 1;
  console.error("PAGES_SEO_AUDIT_FAIL=" + String(error.message || error).slice(0, 250));
} finally {
  await writeFile(OUT + "/result.json", JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
