import { chromium } from "playwright";
import { lookup } from "node:dns/promises";
import { mkdir, writeFile } from "node:fs/promises";

const frontend = new URL(process.env.FRONTEND_URL || "");
const wordpress = new URL(process.env.WORDPRESS_URL || "");
if (frontend.origin !== "https://marine-aqua.io.vn" ||
    wordpress.origin !== "https://admin.marine-aqua.io.vn") {
  throw new Error("MARINEAQUA_DIAGNOSTICS_REFUSED: unexpected origin");
}

const summary = {
  scope: "read-only-public",
  frontend: frontend.origin,
  wordpress: wordpress.origin,
  dns: {},
  views: [],
  rest: {},
};
const dir = "live-diagnostics-evidence";
await mkdir(dir, { recursive: true });

for (const [label, host] of [["frontend", frontend.hostname], ["wordpress", wordpress.hostname]]) {
  try {
    const addresses = await lookup(host, { all: true });
    summary.dns[label] = [...new Set(addresses.map(x => x.address))];
    console.log("DNS_" + label.toUpperCase() + "=PASS addresses=" + summary.dns[label].join(","));
  } catch (error) {
    summary.dns[label] = [];
    console.log("DNS_" + label.toUpperCase() + "=FAIL reason=" + String(error.code || error.name));
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1917, 1440, 768, 390]) {
    const height = width >= 1440 ? 1092 : 844;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const problems = [];
    page.on("pageerror", error => problems.push(error.name || "pageerror"));
    try {
      const response = await page.goto(frontend.origin + "/", {
        waitUntil: "domcontentloaded", timeout: 45000,
      });
      await page.waitForTimeout(1800);
      const result = await page.evaluate(() => {
        const main = document.querySelector("main") || document.querySelector('[role="main"]');
        const imgs = [...document.images];
        const text = (el) => (el?.innerText || "").trim();
        const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        return {
          titleLength: document.title.length,
          bodyTextLength: text(document.body).length,
          mainExists: Boolean(main),
          mainTextLength: text(main).length,
          mainChildren: main?.children.length || 0,
          visibleHeadings: [...document.querySelectorAll("h1, h2")].filter(el => {
            const style = getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden" && Boolean(el.getClientRects().length);
          }).length,
          escSections: document.querySelectorAll("[data-tablepress-preview]").length,
          categoriesSlider: document.querySelectorAll("[data-marine-category-slider]").length,
          productPrices: document.querySelectorAll("[data-marine-product-price]").length,

          headerActionsAudit: (() => {
            const actions = [...document.querySelectorAll("#header-contacts > [data-header-action]")];
            return actions.map(el => ({
              type: el.getAttribute("data-header-action"),
              tag: el.tagName.toLowerCase(),
              svgPresent: Boolean(el.querySelector("svg")),
              svgMarkup: el.querySelector("svg")?.outerHTML.slice(0,420) || "",
              label: el.getAttribute("aria-label") || "",
              bg: getComputedStyle(el).backgroundColor,
              borderRadius: getComputedStyle(el).borderRadius,
            }));
          })(),
          headerV3ColorAudit: (() => {
            const items = [...document.querySelectorAll("#desktop-menu > ul > li")];
            return {
              itemCount: items.length,
              entries: items.map(li => {
                const element = li.querySelector(":scope > a, :scope > button, :scope > span");
                const style = element ? getComputedStyle(element) : null;
                const text = element?.textContent?.trim() || "";
                return {
                  label: text.slice(0, 85),
                  kind: element?.tagName?.toLowerCase() || "",
                  color: style?.color || "",
                  backgroundImage: style?.backgroundImage || "",
                  backgroundColor: style?.backgroundColor || "",
                  sale: li.hasAttribute("data-marine-sale"),
                  height: element ? Math.round(element.getBoundingClientRect().height) : 0,
                  borderRadius: style?.borderRadius || "",
                  left: element ? Math.round(element.getBoundingClientRect().left) : 0,
                  right: element ? Math.round(element.getBoundingClientRect().right) : 0,
                  boltSvg: Boolean(element?.querySelector(".marine-sale-bolt svg")),
                  boltAnimation: element?.querySelector(".marine-sale-bolt") ? getComputedStyle(element.querySelector(".marine-sale-bolt")).animationName : ""
                };
              })
            };
          })(),
          navLinks: document.querySelectorAll("header nav a, #desktop-menu a").length,
          headerNavTargets: [...document.querySelectorAll("#desktop-menu > ul > li > a")].slice(0,8).map(a => ({label:(a.textContent||"").trim().slice(0,70),href:a.getAttribute("href")})),
          header: (() => {
            const root = document.getElementById("main-header");
            const brand = document.getElementById("header-brandbar");
            const logo = brand?.querySelector('a[aria-label="Về trang chủ"] img');
            const navrow = document.getElementById("header-navrow");
            const hamburger = document.getElementById("hamburger-btn");
            const brandBounds = brand?.firstElementChild?.getBoundingClientRect();
            const desktop = window.matchMedia("(min-width: 900px)").matches;
            return {
              exists: Boolean(root && brand),
              brandWidth: Math.round(brandBounds?.width || 0),
              brandWidthPct: Number(((brandBounds?.width || 0) * 100 / window.innerWidth).toFixed(1)),
              logoFromCms: Boolean(logo?.getAttribute("src")),
              logoLoaded: Boolean(logo?.complete && logo?.naturalWidth > 0),
              companyText: (document.getElementById("header-company-caption")?.textContent || "").trim().slice(0, 100),
              fontFamily: getComputedStyle(document.body).fontFamily.slice(0, 110),
              desktopNavPresent: Boolean(navrow),
              desktopNavVisible: Boolean(navrow && getComputedStyle(navrow).display !== "none"),
              desktopNavBackground: navrow ? getComputedStyle(navrow).backgroundImage : "",
              desktopMenuItems: document.querySelectorAll("#desktop-menu > ul > li").length,
              mobileMenuButtonVisible: Boolean(hamburger && getComputedStyle(hamburger).display !== "none" && hamburger.getClientRects().length),
              expectedNavVisibility: desktop ? "visible" : "hidden",
            };
          })(),
          imageCount: imgs.length,
          brokenImages: imgs.filter(img => img.complete && img.naturalWidth === 0).length,
          horizontalOverflow: documentWidth > window.innerWidth + 2,
        };
      });
      if (width === 1917 && result.headerNavTargets?.length) {
        result.headerTargetChecks = [];
        for (const target of result.headerNavTargets.slice(0, 8)) {
          const href = target.href || "";
          if (!href.startsWith("/") || href.startsWith("//")) {
            result.headerTargetChecks.push({ label: target.label, result: "SKIPPED_NON_INTERNAL" });
            continue;
          }
          const targetResponse = await page.request.get(frontend.origin + href, {
            timeout: 20000, failOnStatusCode: false
          });
          result.headerTargetChecks.push({
            label: target.label, href, status: targetResponse.status(),
            ok: targetResponse.status() >= 200 && targetResponse.status() < 400
          });
        }
      }
      result.httpStatus = response?.status() ?? 0;
      result.finalHost = new URL(page.url()).hostname;
      result.pageErrors = problems.length;
      result.content = result.mainTextLength > 20 || result.escSections > 0 ? "PRESENT" : "EMPTY";
      summary.views.push({ width, ...result });
      await page.screenshot({ path: dir + "/frontend-" + width + ".png", fullPage: false });
      console.log("FRONTEND_" + width + "=" + JSON.stringify(result));
    } catch (error) {
      summary.views.push({ width, error: String(error.message || error).slice(0, 180) });
      console.log("FRONTEND_" + width + "=FAIL error=" + String(error.name || "request_error"));
    } finally {
      await page.close();
    }
  }

  const context = await browser.newContext();
  for (const [label, path] of [
    ["menus", "/wp-json/esc-api/v1/menus"],
    ["pages", "/wp-json/wp/v2/pages?status=publish&per_page=5&_fields=id,slug"],
  ]) {
    try {
      const response = await context.request.get(wordpress.origin + path, {
        timeout: 20000,
        failOnStatusCode: false,
      });
      const result = { status: response.status(), contentType: response.headers()["content-type"]?.split(";")[0] || "" };
      if (response.ok() && result.contentType.includes("json")) {
        const payload = await response.json();
        if (label === "menus") {
          const header = payload?.success === true ? payload?.menus?.Header : null;
          result.headerLocales = header && typeof header === "object"
            ? Object.fromEntries(Object.entries(header).map(([lang, value]) => [
                lang, Array.isArray(value?.items) ? value.items.length : 0,
              ]))
            : {};
        } else {
          result.publishedSampleCount = Array.isArray(payload) ? payload.length : 0;
        }
      }
      summary.rest[label] = result;
      console.log("WORDPRESS_" + label.toUpperCase() + "=" + JSON.stringify(result));
    } catch (error) {
      summary.rest[label] = { error: String(error.code || error.name || "request_error") };
      console.log("WORDPRESS_" + label.toUpperCase() + "=UNAVAILABLE reason=" + summary.rest[label].error);
    }
  }
  await context.close();
} finally {
  await browser.close();
}

await writeFile(dir + "/summary.json", JSON.stringify(summary, null, 2) + "\n");
const desktop = summary.views.find(x => x.width === 1917);
const mobile = summary.views.find(x => x.width === 390);
if (!desktop || desktop.httpStatus < 200 || desktop.httpStatus >= 400 ||
    desktop.finalHost !== frontend.hostname ||
    !mobile || mobile.httpStatus < 200 || mobile.httpStatus >= 400) {
  console.error("MARINEAQUA_LIVE_REACHABILITY=FAIL");
  process.exitCode = 1;
} else {
  console.log("MARINEAQUA_LIVE_REACHABILITY=PASS");
}
console.log("MARINEAQUA_HOMEPAGE_CONTENT=" +
  ((desktop?.content === "PRESENT" && mobile?.content === "PRESENT") ? "PRESENT" : "MISSING_OR_EMPTY"));

const headerActions = desktop?.headerActionsAudit || [];
const accountAction = headerActions.find(x=>x.type==="account");
const cartAction = headerActions.find(x=>x.type==="cart");
const headerActionPass = headerActions.length===2 && Boolean(accountAction?.svgPresent && cartAction?.svgPresent)
  && accountAction.borderRadius==="50%" && cartAction.borderRadius==="50%"
  && !headerActions.some(x=>x.label.includes("Facebook") || x.label.startsWith("Gọi"));
console.log("MARINEAQUA_HEADER_ACCOUNT_CART=" + (headerActionPass ? "PASS":"FAIL") +
 " actions=" + headerActions.length + " account=" + Boolean(accountAction) +
 " cart=" + Boolean(cartAction));
if (!headerActionPass) process.exitCode=1;
const v3 = desktop?.headerV3ColorAudit;
const v3Labels = ["trang chủ", "giảm giá khủng", "chính sách và hướng dẫn", "thời gian bán hàng", "liên hệ", "phí ship hàng", "bài viết chia sẻ kinh nghiệm"];
const normalizeV3 = text => String(text || "").replace(/⚡/g, "").trim().toLocaleLowerCase("vi");
const itemsV3 = v3?.entries || [];
const normalColorPass = itemsV3.filter((item,i) => i > 0 && !item.sale).every(item => item.color === "rgb(247, 251, 255)" || item.color === "rgb(255, 255, 255)");
const saleV3 = itemsV3.find(item => item.sale);
const salePass = Boolean(saleV3 && saleV3.backgroundImage.includes("linear-gradient") && saleV3.color === "rgb(255, 255, 255)");
const labelsPass = itemsV3.length === 7 && itemsV3.every((item,i) => normalizeV3(item.label) === v3Labels[i]);
const homeV3 = itemsV3[0];
// Verify the final deployed CSS specificity correction for the two approved pills.
const v3PillPass = Boolean(homeV3 && saleV3
  && homeV3.height === saleV3.height && homeV3.height === 48
  && homeV3.borderRadius === saleV3.borderRadius
  && homeV3.borderRadius === "17px"
  && saleV3.left - homeV3.right >= 10 && saleV3.left - homeV3.right <= 14);
const boltPass = Boolean(saleV3?.boltSvg && saleV3?.boltAnimation?.includes("marine-sale-bolt-pulse"));
const v3Pass = labelsPass && normalColorPass && salePass && v3PillPass && boltPass;
console.log("MARINEAQUA_V3_NAV_COLOR=" + (v3Pass ? "PASS" : "FAIL") +
  " items=" + itemsV3.length + " normalText=" + normalColorPass + " saleRedGradient=" + salePass +
  " orderedLabels=" + labelsPass + " matchedPills=" + v3PillPass + " boltSvg=" + boltPass);
if (!v3Pass) process.exitCode = 1;

console.log("MARINEAQUA_TEST_WRITE_REQUESTS=0 DEPLOY_REQUESTS=0");
