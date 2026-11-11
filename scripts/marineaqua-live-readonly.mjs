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
          bannerAudit: (() => {
            const sections = [...document.querySelectorAll('[data-tablepress-preview="home_00"], [data-home-slider]')];
            return sections.map(el => {
              const rect=el.getBoundingClientRect(), style=getComputedStyle(el);
              return {
                tag:el.tagName,marker:el.getAttribute("data-tablepress-preview")||el.getAttribute("data-home-slider"),
                visible:Boolean(rect.width&&rect.height&&style.display!=="none"),
                rect:{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)},
                slideCount:el.querySelectorAll("[data-home-slide]").length,
                borderRadius:style.borderRadius,
                dotCount:el.querySelectorAll("[data-slider-dot]").length,
                split: (() => {
                  const slide=el.querySelector("[data-home-slide].is-active");
                  const copy=slide?.querySelector(".marine-hero-copy");
                  const media=slide?.querySelector(".marine-hero-media");
                  const c=copy?.getBoundingClientRect(),m=media?.getBoundingClientRect();
                  const img=media?.querySelector("img");
                  const imageStyle=img?getComputedStyle(img):null;
                  const overlayStyle=slide?getComputedStyle(slide,"::before"):null;
                  return {layout:slide?getComputedStyle(slide).display:"",
                    text:(copy?.innerText||"").slice(0,180),
                    copyWidth:Math.round(c?.width||0),
                    mediaWidth:Math.round(m?.width||0),
                    copyLeft:Math.round(c?.left||0),mediaLeft:Math.round(m?.left||0),
                    copyTop:Math.round(c?.top||0),mediaTop:Math.round(m?.top||0),
                    imageFit:imageStyle?.objectFit||"",
                    imagePosition:imageStyle?.objectPosition||"",
                    overlay:overlayStyle?.backgroundImage||"",
                    activeImageWidth:Math.round(img?.getBoundingClientRect().width||0),
                    activeImageHeight:Math.round(img?.getBoundingClientRect().height||0)};

                })(),
                srcs:[...el.querySelectorAll("[data-home-slide] img")].map(img=>({
                  src:(img.currentSrc||img.src||"").slice(0,180), loaded:img.complete&&img.naturalWidth>0,
                  naturalW:img.naturalWidth,naturalH:img.naturalHeight,
                  clientW:Math.round(img.getBoundingClientRect().width),clientH:Math.round(img.getBoundingClientRect().height)
                })).slice(0,8)
              };
            }).slice(0,6);
          })(),

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
      if (width === 1917 || width === 390) {
        const carousel=page.locator('[data-home-slider]:visible').first();
        const dots=carousel.locator('[data-slider-dot]');
        result.bannerSlideNavigation=[];
        if(await dots.count()===3) {
          for(let i=1;i<=2;i++){
            await dots.nth(i).click();
            await page.waitForTimeout(900);
            const slide=await carousel.evaluate((el)=>{
              const active=el.querySelector('[data-home-slide].is-active');
              const img=active?.querySelector('img');
              const source=active?.querySelector('source');
              return {title:active?.querySelector('figcaption')?.textContent?.trim()||"",
                currentIndex:[...el.querySelectorAll('[data-home-slide]')].indexOf(active),
                imageSrc:img?.currentSrc||img?.src||"",sourceSet:source?.srcset||"",
                imageLoaded:Boolean(img?.complete && img?.naturalWidth>10)};
            });
            result.bannerSlideNavigation.push(slide);
          }
        }
        console.log('BANNER_NAVIGATION_'+width+'='+JSON.stringify(result.bannerSlideNavigation));
      }
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
      console.log("BANNER_AUDIT_" + width + "=" + JSON.stringify(result.bannerAudit));
    } catch (error) {
      summary.views.push({ width, error: String(error.message || error).slice(0, 180) });
      console.log("FRONTEND_" + width + "=FAIL error=" + String(error.name || "request_error"));
    } finally {
      await page.close();
    }
  }

  // Verify deployed compact menu click hit-testing and visibility above the banner.
  summary.navResponsive = [];
  for (const width of [900, 1024, 1190, 1280, 1366, 1439, 1440]) {
    const page = await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      await page.waitForTimeout(600);
      const initial=await page.evaluate(()=>{
        const nav=document.querySelector("#header-navrow");
        const compact=document.querySelector("#header-compact-actions");
        const toggle=document.querySelector("#hamburger-btn");
        const menu=document.querySelector("#mobile-menu-container");
        const visible=el=>Boolean(el && getComputedStyle(el).display!=="none" &&
          el.getBoundingClientRect().width>0 && el.getBoundingClientRect().height>0);
        return {
          navVisible:visible(nav),
          compactVisible:visible(compact),
          toggleVisible:visible(toggle),
          menuHidden:menu?.hasAttribute("hidden"),
          documentWidth:document.documentElement.scrollWidth,
          viewportWidth:window.innerWidth,
          desktopItemCount:document.querySelectorAll("#desktop-menu > ul > li").length,
          mobileItemCount:document.querySelectorAll("#mobile-menu-container [data-menu-item]").length
        };
      });
      let menuOpened=false;
      let menuText="";
      if(width<1440 && initial.toggleVisible){
        await page.locator("#hamburger-btn").click();
        await page.waitForTimeout(100);
        const menuLayer=await page.evaluate(()=>{
          const menu=document.querySelector("#mobile-menu-container");
          const header=document.querySelector("#main-header");
          const r=menu?.getBoundingClientRect();
          const open=Boolean(menu && !menu.hasAttribute("hidden") &&
            getComputedStyle(menu).display!=="none" && r?.height>0);
          if(!open || !r)return {open,aboveBanner:false,topHit:""};
          const x=r.left+Math.min(100,r.width/2);
          const y=Math.max(0,Math.min(window.innerHeight-1,r.top+Math.min(40,r.height/2)));
          const hit=document.elementFromPoint(x,y);
          return {open,
            aboveBanner:Boolean(hit && (menu.contains(hit) || hit===menu)),
            topHit:hit?.tagName||"",
            headerRaised:header?.classList.contains("mobile-nav-open"),
            menuBg:getComputedStyle(menu).backgroundColor
          };
        });
        menuOpened=menuLayer.open && menuLayer.aboveBanner &&
          menuLayer.headerRaised && menuLayer.menuBg==="rgb(255, 255, 255)";
        menuText=(await page.locator("#mobile-menu-container").innerText()).slice(0,500);
      }
      const pass=width<1440
        ? !initial.navVisible && initial.compactVisible && initial.toggleVisible &&
          menuOpened && menuText.includes("TRANG CHỦ") &&
          menuText.includes("BÀI VIẾT CHIA SẺ KINH NGHIỆM") &&
          initial.documentWidth<=width+1
        : initial.navVisible && !initial.compactVisible && initial.documentWidth<=width+1;
      summary.navResponsive.push({width,pass,...initial,menuOpened});
      if([1190,1366,1440].includes(width))
        await page.screenshot({path:dir+"/navigation-"+width+".png",fullPage:false});
    }catch(error){
      summary.navResponsive.push({width,pass:false,error:String(error.message||error).slice(0,250)});
    }finally{await page.close();}
  }
  const navigationPass=summary.navResponsive.every(v=>v.pass);
  console.log("MARINEAQUA_NAV_RESPONSIVE="+(navigationPass?"PASS":"FAIL")+" "+JSON.stringify(summary.navResponsive));
  if(!navigationPass)process.exitCode=1;

  const context = await browser.newContext();
  for (const [label, path] of [
    ["menus", "/wp-json/esc-api/v1/menus"],
    ["pages", "/wp-json/wp/v2/pages?status=publish&per_page=5&_fields=id,slug"],
    ["home00", "/wp-json/tablepress/v1/table/home_00"],
  ]) {
    try {
      const response = await context.request.get(wordpress.origin + path, {
        timeout: 20000,
        failOnStatusCode: false,
      });
      const result = { status: response.status(), contentType: response.headers()["content-type"]?.split(";")[0] || "" };
      if (response.ok() && result.contentType.includes("json")) {
        const payload = await response.json();
        if (label === "home00") {
          const table=payload?.table || payload?.data || payload;
          const items=table?.items || table?.data?.items || [];
          result.keys=Object.keys(payload||{}).slice(0,20);
          result.fields=Array.isArray(table?.fields)?table.fields.map(f=>({key:f.key,label:f.label,type:f.type})):null;
          result.meta=table?.meta ? {api:table.meta.api,keys:Object.keys(table.meta)} : null;
          result.description=String(table?.description||"").slice(0,100);
          result.settingsKeys=Object.keys(table?.settings||{}).slice(0,20);
          result.itemCount=Array.isArray(items)?items.length:null;
          result.rows=Array.isArray(items)?items.slice(0,8).map(row=>({keys:Object.keys(row||{}),title:String(row?.title||"").slice(0,65),image:row?.image?{src:String(row.image?.src||"").slice(0,180),width:row.image?.width,height:row.image?.height}:null,mobile:row?.mobile})):[];
        } else if (label === "menus") {
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


// Verify final uncropped hero photography and soft left gradient after production deployment.
const bannerChecks = [1917,1440,768,390].map(width=>{
  const view=summary.views.find(v=>v.width===width);
  const carousels=(view?.bannerAudit||[]).filter(entry=>entry.tag==="DIV" && entry.visible &&
    entry.slideCount>0 && entry.borderRadius!=="0px");
  const hero=carousels.find(entry=>entry.srcs.some(img=>img.loaded && img.naturalW>10));
  const widthPass=Boolean(hero && Math.abs(hero.rect.w-width*0.925)<6);
  const mediaPass=hero ? hero.srcs.some(img=>{
    const src=String(img.src||"");
    const expectedHost=src.startsWith("https://marine-aqua.io.vn/images/pages/") ||
      src.startsWith("https://marine-aqua.vn/wp-content/uploads/2026/08/");
    return img.loaded && img.naturalW>10 && expectedHost &&
      src.includes("banner1-1-1380x672");
  }) : false;
  const radiusPass=Boolean(hero && hero.borderRadius===(width<640?"12px":"19px"));
  const splitPass=Boolean(hero && hero.slideCount===3 && hero.dotCount===3
    && hero.split?.copyWidth>150 && hero.split?.mediaWidth>150
    && hero.split?.text.includes("Chạm gần hơn")
    && hero.split?.imageFit==="contain"
    && (width<640 ? hero.split.copyTop>hero.split.mediaTop
       : hero.split.layout==="block"
          && hero.split.copyLeft===hero.split.mediaLeft
          && hero.split.mediaWidth>=hero.rect.w-3
          && hero.split.copyWidth<hero.rect.w*.5
          && hero.split.overlay.includes("linear-gradient")));
  return {width,passed:widthPass&&mediaPass&&radiusPass&&splitPass&&!view?.horizontalOverflow,
    carouselCount:carousels.length,loadedMedia:mediaPass,frameWidth:hero?.rect.w||0,
    frameHeight:hero?.rect.h||0,borderRadius:hero?.borderRadius||"",radiusPass,splitPass,slideCount:hero?.slideCount||0,split:hero?.split||null};
});
const interactionChecks=[1917,390].map(width=>{
  const samples=summary.views.find(v=>v.width===width)?.bannerSlideNavigation||[];
  return {width,passed:samples.length===2 && samples.every((v,i)=>v.currentIndex===i+1 &&
    v.imageLoaded && (v.imageSrc.includes(i===0?"banner2-8-1440x672":"banner3-4-1440x672") ||
      v.sourceSet.includes(i===0?"banner2-8-1440x672":"banner3-4-1440x672")))};
});
const bannerPass=bannerChecks.every(x=>x.passed)&&interactionChecks.every(x=>x.passed);
console.log("MARINEAQUA_HOME00_NAVIGATION="+JSON.stringify(interactionChecks));
console.log("MARINEAQUA_HOME00_BANNER=" + (bannerPass?"PASS":"FAIL") + " " + JSON.stringify(bannerChecks));
if(!bannerPass)process.exitCode=1;

console.log("MARINEAQUA_TEST_WRITE_REQUESTS=0 DEPLOY_REQUESTS=0");
