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
    // Track real layout-shift entries before any page script runs.
    // Unlike a Lighthouse DOM element list, sources are the *moved* nodes,
    // so capture the enclosing ESC section as well as its previous/current Y.
    await page.addInitScript(() => {
      window.__marineLayoutShifts = { score: 0, entries: [] };
      try {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (entry.hadRecentInput) continue;
            const record = {
              value: Math.round(entry.value * 100000) / 100000,
              startTime: Math.round(entry.startTime),
              sources: (entry.sources || []).slice(0, 5).map(source => ({
                tag: source.node?.tagName || "",
                class: typeof source.node?.className === "string" ? source.node.className.slice(0, 120) : "",
                section: source.node?.closest?.("[data-tablepress-preview]")?.getAttribute("data-tablepress-preview") || "",
                previousY: Math.round(source.previousRect?.y || 0),
                currentY: Math.round(source.currentRect?.y || 0)
              }))
            };
            window.__marineLayoutShifts.score += entry.value;
            if (window.__marineLayoutShifts.entries.length < 25) window.__marineLayoutShifts.entries.push(record);
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
      } catch (error) {
        window.__marineLayoutShifts.error = String(error.name || "unsupported");
      }
    });
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
                tag:el.tagName,marker:el.getAttribute("data-tablepress-preview")||el.getAttribute("data-home-slider"),isCarousel:el.hasAttribute("data-home-slider"),
                visible:Boolean(rect.width&&rect.height&&style.display!=="none"),
                rect:{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)},
                slideCount:el.querySelectorAll("[data-home-slide]").length,
                borderRadius:style.borderRadius,
                 borderWidth:style.borderTopWidth,
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
              desktopNavBgColor: navrow ? getComputedStyle(navrow).backgroundColor : "",
              brandBgColor: getComputedStyle(brand).backgroundColor,
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
      // Capture both initial-load shifts and shifts when the category/brand
      // sections enter the viewport; mobile and desktop are measured separately.
      result.layoutShiftBeforeScroll = await page.evaluate(() => ({
        score: Math.round((window.__marineLayoutShifts?.score || 0) * 100000) / 100000,
        entries: window.__marineLayoutShifts?.entries || []
      }));
      summary.views.push({ width, ...result });
      await page.screenshot({ path: dir + "/frontend-" + width + ".png", fullPage: false });
      for (const sectionId of ["home_03", "home_04"]) {
        await page.evaluate(id => {
          const section = document.querySelector('section[data-tablepress-preview="' + id + '"]');
          section?.scrollIntoView({ block: "center", behavior: "instant" });
        }, sectionId);
        await page.waitForTimeout(600);
      }
      const clsAfterScroll = await page.evaluate(() => {
        const category = document.querySelector('section[data-tablepress-preview="home_03"]');
        const style = category ? getComputedStyle(category) : null;
        return {
          score: Math.round((window.__marineLayoutShifts?.score || 0) * 100000) / 100000,
          entries: window.__marineLayoutShifts?.entries || [],
          category: {
            contentVisibility: style?.contentVisibility || "",
            containIntrinsicSize: style?.containIntrinsicSize || "",
            height: Math.round(category?.getBoundingClientRect().height || 0)
          }
        };
      });
      console.log("MARINEAQUA_CLS_" + width + "=" + JSON.stringify({
        beforeScroll: result.layoutShiftBeforeScroll,
        afterScroll: clsAfterScroll
      }));
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
  for (const width of [390, 768, 900, 1023, 1024, 1067, 1190, 1280, 1366, 1439, 1440, 1917]) {
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
          visibleBannerVariants:[...document.querySelectorAll("[data-marine-home-variant]")]
            .filter(el=>getComputedStyle(el).display!=="none" && el.getBoundingClientRect().width>0).length,
          viewportWidth:window.innerWidth,
          desktopItemCount:document.querySelectorAll("#desktop-menu > ul > li").length,
          desktopItemsFit:[...document.querySelectorAll("#desktop-menu > ul > li")].every(item=>{
            const rect=item.getBoundingClientRect();
            return rect.left>=-2&&rect.right<=innerWidth+2&&rect.width>0;
          }),
          mobileItemCount:document.querySelectorAll("#mobile-menu-container [data-menu-item]").length,
          catalogLabelVisible:(()=>{
            const el=document.querySelector("#header-navrow .marine-catalog-nav-trigger > span");
            return visible(el) && el.textContent.trim().includes("Danh mục sản phẩm");
          })(),
          desktopItemGapMax:(()=>{
            const items=[...document.querySelectorAll("#desktop-menu > ul > li")];
            if(items.length<2)return 0;
            return Math.max(...items.slice(1).map((item,i)=>
              item.getBoundingClientRect().left-items[i].getBoundingClientRect().right));
          })()
        };
      });
      let menuOpened=false;
      let menuText="";
      if(width<1024 && initial.toggleVisible){
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
          menuLayer.headerRaised && ["rgb(255, 255, 255)","rgb(243, 248, 252)"].includes(menuLayer.menuBg);
        menuText=await page.locator("#mobile-menu-container").innerText();
      }
      const mobileRootCount=width<1024
        ? await page.locator("#mobile-menu-container .marine-mobile-menu-main > ul > li").count() : 0;
      const mobileCatalogCount=width<1024
        ? await page.locator("#mobile-menu-container .marine-mobile-category-item").count() : 0;
      const pass=width<1024
        ? !initial.navVisible && initial.compactVisible && initial.toggleVisible &&
          menuOpened && mobileRootCount>0 && mobileCatalogCount>0 &&
          initial.documentWidth<=width+1
        : initial.navVisible && initial.desktopItemsFit && initial.catalogLabelVisible && initial.desktopItemGapMax<=20 && !initial.compactVisible && initial.documentWidth<=width+1;
      summary.navResponsive.push({width,pass,...initial,menuOpened,mobileRootCount,mobileCatalogCount});
      if([390,1023,1024,1067,1190,1366,1440,1917].includes(width))
        await page.screenshot({path:dir+"/navigation-"+width+".png",fullPage:false});
    }catch(error){
      summary.navResponsive.push({width,pass:false,error:String(error.message||error).slice(0,250)});
    }finally{await page.close();}
  }
  const navigationPass=summary.navResponsive.every(v=>v.pass);
  console.log("MARINEAQUA_NAV_RESPONSIVE="+(navigationPass?"PASS":"FAIL")+" "+JSON.stringify(summary.navResponsive));
  if(!navigationPass)process.exitCode=1;

  // Cross-check computed typography and the promotion's transparent surface.
  summary.desktopTypography = [];
  for (const width of [1024,1067,1200,1366,1440,1917]) {
    const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      const value=await page.evaluate(()=>{
        const items=[...document.querySelectorAll("#desktop-menu > ul > li")];
        const targets=items.map(li=>li.querySelector(":scope > a, :scope > button, :scope > span")).filter(Boolean);
        const sizes=targets.map(el=>getComputedStyle(el).fontSize);
        const sale=document.querySelector("#desktop-menu > ul > li[data-marine-sale] > a, #desktop-menu > ul > li[data-marine-sale] > button, #desktop-menu > ul > li[data-marine-sale] > span");
        const css=sale?getComputedStyle(sale):null;
        const rgb=css?.color||"";
        const okColor=rgb==="rgb(193, 42, 67)";
        return {
          sizes, uniform:sizes.length>=5&&new Set(sizes).size===1,
          saleBackground:css?.backgroundColor||"",
          saleBorder:css?.borderTopWidth||"",
          saleShadow:css?.boxShadow||"",
          saleTextColor:rgb,
          saleOk:!!css&&css.backgroundColor==="rgba(0, 0, 0, 0)"&&
            css.borderTopWidth==="0px"&&css.boxShadow==="none"&&okColor
        };
      });
      value.width=width;
      value.pass=value.uniform&&value.saleOk;
      summary.desktopTypography.push(value);
      await page.screenshot({path:dir+"/desktop-typography-"+width+".png",fullPage:false});
    } catch(error) {
      summary.desktopTypography.push({width,pass:false,error:String(error.message||error).slice(0,220)});
    } finally {await page.close()}
  }
  console.log("MARINEAQUA_DESKTOP_TYPOGRAPHY="+(summary.desktopTypography.every(x=>x.pass)?"PASS":"FAIL")+" "+JSON.stringify(summary.desktopTypography));
  if(!summary.desktopTypography.every(x=>x.pass))process.exitCode=1;

  // Underline on the real text only (not the full clickable menu item).
  summary.desktopUnderline = [];
  for (const width of [1024,1067,1366,1440,1917]) {
    const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      const button=page.locator("#desktop-menu [data-menu-trigger]:visible").first();
      await button.click();
      await page.waitForTimeout(220);
      const data=await button.evaluate(el=>{
        const label=el.querySelector(".marine-nav-label");
        const labelStyle=label?getComputedStyle(label,"::after"):null;
        const outerStyle=getComputedStyle(el,"::after");
        const buttonRect=el.getBoundingClientRect();
        const labelRect=label?.getBoundingClientRect();
        return {
          expanded:el.getAttribute("aria-expanded"),
          labelWidth:Math.round(labelRect?.width||0),
          triggerWidth:Math.round(buttonRect.width),
          underlineWidth:parseFloat(labelStyle?.width||"0"),
          labelUnderlineOpacity:labelStyle?.opacity||"",
          outerContent:outerStyle.content,
          outerDisplay:outerStyle.display
        };
      });
      data.width=width;
      data.pass=data.expanded==="true"&&data.labelWidth>30&&
        Math.abs(data.underlineWidth-data.labelWidth)<=2&&
        data.labelUnderlineOpacity==="1"&&
        data.triggerWidth>data.labelWidth&&
        (data.outerContent==="none"||data.outerDisplay==="none");
      summary.desktopUnderline.push(data);
      await page.screenshot({path:dir+"/nav-label-underline-"+width+".png",fullPage:false});
    } catch(error) {
      summary.desktopUnderline.push({width,pass:false,error:String(error.message||error).slice(0,240)});
    } finally {await page.close()}
  }
  console.log("MARINEAQUA_DESKTOP_UNDERLINE="+(summary.desktopUnderline.every(x=>x.pass)?"PASS":"FAIL")+" "+JSON.stringify(summary.desktopUnderline));
  if(!summary.desktopUnderline.every(x=>x.pass))process.exitCode=1;

  // Verify floating header at scroll depth, click behavior, fixed placement
  // and no layout shift on wide desktop, laptop and mobile.
  summary.headerFloating = [];
  for (const width of [1917,1440,1366,1190,1024,900,390]) {
    const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    try{
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      await page.waitForTimeout(300);
      const before=await page.evaluate(()=>({
        overflow:document.documentElement.scrollWidth>innerWidth+2,
        navWidth:document.querySelector("#header-navrow")?.getBoundingClientRect().width||0,
        bannerTop:document.querySelector('[data-home-slider]:not([hidden])')?.getBoundingClientRect().top||0
      }));
      await page.evaluate(()=>window.scrollTo(0,700));
      await page.waitForTimeout(400);
      const after=await page.evaluate(()=>{
        const nav=document.querySelector("#header-navrow");
        const brand=document.querySelector("#header-brandbar");
        const desktop=innerWidth>=1024;
        const target=desktop?nav:brand;
        const rect=target?.getBoundingClientRect();
        const cs=target?getComputedStyle(target):null;
        const navSpacer=document.querySelector("#header-nav-spacer");
        const mobileSpacer=document.querySelector("#mobile-header-spacer");
        return {
          desktop,scrollY:scrollY,
          fixedClass:desktop?nav?.classList.contains("header-nav-floating"):
            document.querySelector("#main-header")?.classList.contains("mobile-header-fixed"),
          position:cs?.position||"",
           backgroundColor:cs?.backgroundColor||"",
          borderRadius:cs?.borderRadius||"",
          backdropFilter:cs?.backdropFilter||"",
          top:Math.round(rect?.top||0),
          bottom:Math.round(rect?.bottom||0),
          left:Math.round(rect?.left||0),
          right:Math.round(rect?.right||0),
          aboveContent:Boolean(rect&&rect.top>=0&&rect.bottom<innerHeight),
          spacerVisible:desktop?
            getComputedStyle(navSpacer).display!=="none":
            getComputedStyle(mobileSpacer).display!=="none",
          overflow:document.documentElement.scrollWidth>innerWidth+2
        };
      });
      const trigger=page.locator("[data-header-catalog-trigger]:visible").first();
      let menuWorks=!after.desktop;
      if(await trigger.count()){
        await trigger.click();
        menuWorks=await page.locator("#header-product-catalog-panel").isVisible();
        await page.keyboard.press("Escape");
        menuWorks=menuWorks&&!(await page.locator("#header-product-catalog-panel").isVisible());
      }
      let headerSubmenuWorks=!after.desktop;
      if(after.desktop){
        const root=page.locator("#desktop-menu [data-menu-trigger]:visible").first();
        if(await root.count()){
          const controlled=await root.getAttribute("aria-controls");
          const menuPanel=page.locator('[id="'+controlled+'"]');
          await root.click();
          await page.waitForTimeout(160);
          const shown=await root.getAttribute("aria-expanded")==="true" && await menuPanel.isVisible();
          const hittable=shown && await menuPanel.evaluate((el)=>{
            const r=el.getBoundingClientRect();
            const x=Math.max(0,Math.min(innerWidth-1,r.left+Math.min(40,r.width/2)));
            const y=Math.max(0,Math.min(innerHeight-1,r.top+Math.min(25,r.height/2)));
            const hit=document.elementFromPoint(x,y);
            return r.width>100 && r.height>30 && hit!==null && (el===hit || el.contains(hit));
          });
          await page.keyboard.press("Escape");
          const closed=await root.getAttribute("aria-expanded")==="false" && !(await menuPanel.isVisible());
          headerSubmenuWorks=shown&&hittable&&closed;
        }
      }
      const pass=!before.overflow&&!after.overflow&&after.scrollY>=600&&
        after.backgroundColor===(after.desktop ? "rgba(243, 249, 255, 0.94)" : "rgba(255, 255, 255, 0.94)")&&
        after.top===0&&after.left===0&&Math.abs(after.right-width)<=2&&
        after.borderRadius==="0px"&&
        after.fixedClass&&after.position==="fixed"&&after.aboveContent&&
        after.spacerVisible&&menuWorks&&headerSubmenuWorks;
      summary.headerFloating.push({width,pass,menuWorks,headerSubmenuWorks,...after});
      if([1440,390].includes(width))
        await page.screenshot({path:dir+"/clean-ocean-floating-"+width+".png",fullPage:false});
    }catch(error){
      summary.headerFloating.push({width,pass:false,error:String(error.message||error).slice(0,240)});
    }finally{await page.close();}
  }
  const baseHeaderColorsPass=summary.views.every(view => view.error || (view.header?.brandBgColor === "rgb(255, 255, 255)" && (view.width < 1440 || view.header?.desktopNavBgColor === "rgb(243, 249, 255)")));
  console.log("MARINEAQUA_HEADER_COLOR_SCOPE="+(baseHeaderColorsPass?"PASS":"FAIL"));
  if(!baseHeaderColorsPass)process.exitCode=1;
  const floatPass=summary.headerFloating.every(item=>item.pass);
  console.log("MARINEAQUA_HEADER_FLOATING="+(floatPass?"PASS":"FAIL")+" "+JSON.stringify(summary.headerFloating));
  if(!floatPass)process.exitCode=1;

  // Header catalog chevron follows aria-expanded (down closed, up open).
  summary.catalogChevron = [];
  for (const width of [1024, 1440]) {
    const page=await browser.newPage({viewport:{width,height:840},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      const button=page.locator("#header-navrow [data-header-catalog-trigger]:visible");
      const measure=()=>button.evaluate(el=>({
        expanded:el.getAttribute("aria-expanded"),
        transform:getComputedStyle(el.querySelector("svg:last-child")).transform,
        path:el.querySelector("svg:last-child path")?.getAttribute("d")
      }));
      const closed=await measure();
      await button.click();
      await page.waitForTimeout(250);
      const opened=await measure();
      await button.click();
      await page.waitForTimeout(250);
      const closedAgain=await measure();
      const is180=transform=>transform==="matrix(-1, 0, 0, -1, 0, 0)";
      const isZero=transform=>transform==="none"||transform==="matrix(1, 0, 0, 1, 0, 0)";
      const pass=closed.expanded==="false"&&isZero(closed.transform)&&
        opened.expanded==="true"&&is180(opened.transform)&&
        closedAgain.expanded==="false"&&isZero(closedAgain.transform);
      summary.catalogChevron.push({width,pass,closed,opened,closedAgain});
    } catch(error) {
      summary.catalogChevron.push({width,pass:false,error:String(error.message||error).slice(0,250)});
    } finally {await page.close();}
  }
  console.log("MARINEAQUA_CATALOG_CHEVRON="+(summary.catalogChevron.every(x=>x.pass)?"PASS":"FAIL")+" "+JSON.stringify(summary.catalogChevron));
  if(!summary.catalogChevron.every(x=>x.pass))process.exitCode=1;

  // Approved navy top information strip must be square-edged, full-width
  // and readable. This is independent of the lower light-blue navigation.
  summary.topHeaderSquare = [];
  for (const width of [1024, 1440, 1917]) {
    const page=await browser.newPage({viewport:{width,height:840},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      const data=await page.evaluate(()=>{
        const strip=document.querySelector("#header-topline");
        const outer=document.querySelector("#main-header");
        const strong=strip?.querySelector("strong");
        const css=strip?getComputedStyle(strip):null;
        const outerCss=outer?getComputedStyle(outer):null;
        const rect=strip?.getBoundingClientRect();
        return {
          background:css?.backgroundColor,
          text:css?.color,
          companyText:strong?getComputedStyle(strong).color:"",
          radiusTopLeft:css?.borderTopLeftRadius,
          radiusBottomLeft:css?.borderBottomLeftRadius,
          outerTopLeft:outerCss?.borderTopLeftRadius,
          outerBottomLeft:outerCss?.borderBottomLeftRadius,
          left:rect?.left,
          right:rect?.right,
          width:innerWidth
        };
      });
      data.pass=data.background==="rgb(18, 57, 141)"&&
        data.text==="rgb(255, 255, 255)"&&
        data.companyText==="rgb(255, 255, 255)"&&
        data.radiusTopLeft==="0px"&&data.radiusBottomLeft==="0px"&&
        data.outerTopLeft==="0px"&&data.outerBottomLeft==="0px"&&
        Math.abs(data.left)<=2&&Math.abs(data.right-width)<=2;
      summary.topHeaderSquare.push(data);
      await page.screenshot({path:dir+"/top-header-navy-"+width+".png",fullPage:false});
    }catch(error){
      summary.topHeaderSquare.push({width,pass:false,error:String(error.message||error).slice(0,220)});
    }finally{await page.close()}
  }
  console.log("MARINEAQUA_TOP_HEADER_SQUARE="+(summary.topHeaderSquare.every(x=>x.pass)?"PASS":"FAIL")+" "+JSON.stringify(summary.topHeaderSquare));
  if(!summary.topHeaderSquare.every(x=>x.pass))process.exitCode=1;

  // Square left edges and lightweight opening effects for catalog/nav submenus.
  summary.menuOpeningMotion = [];
  for (const width of [1024,1440,1917]) {
    const page = await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      const trigger=page.locator("#header-navrow [data-header-catalog-trigger]:visible").first();
      await trigger.click();
      const catalog=page.locator("#header-product-catalog-panel");
      const panelStyle=await catalog.evaluate(el=>{
        const st=getComputedStyle(el);
        return {radius:st.borderRadius,animation:st.animationName,hidden:el.hidden};
      });
      const parent=catalog.locator("[data-marine-category-trigger]").first();
      await parent.click();
      const nestedStyle=await page.evaluate(()=>{
        const open=document.querySelector("#header-product-catalog-panel .marine-product-category-flyout:not([hidden])");
        const st=open?getComputedStyle(open):null;
        return {exists:!!open,animation:st?.animationName||"none"};
      });
      const nav=page.locator("#desktop-menu [data-menu-trigger]:visible").first();
      await trigger.click();
      await nav.click();
      const navStyle=await page.evaluate(()=>{
        const open=document.querySelector("#desktop-menu [data-menu-panel]:not([hidden])");
        return {exists:!!open,animation:open?getComputedStyle(open).animationName:"none"};
      });
      const pass=panelStyle.radius==="0px"&&!panelStyle.hidden&&
        panelStyle.animation.includes("marineCatalogReveal")&&
        nestedStyle.exists&&nestedStyle.animation.includes("marineSubmenuReveal")&&
        navStyle.exists&&navStyle.animation.includes("marineSubmenuReveal");
      summary.menuOpeningMotion.push({width,pass,panelStyle,nestedStyle,navStyle});
      await page.screenshot({path:dir+"/menu-opening-motion-"+width+".png",fullPage:false});
    }catch(error){
      summary.menuOpeningMotion.push({width,pass:false,error:String(error.message||error).slice(0,250)});
    }finally{await page.close();}
  }
  console.log("MARINEAQUA_MENU_OPENING_MOTION="+(summary.menuOpeningMotion.every(x=>x.pass)?"PASS":"FAIL")+" "+JSON.stringify(summary.menuOpeningMotion));
  if(!summary.menuOpeningMotion.every(x=>x.pass))process.exitCode=1;

  // Nested WooCommerce category labels use regular weight; main categories remain bold.
  summary.categoryChildWeight=[];
  for (const width of [1024,1440]) {
    const page=await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      await page.locator("#header-navrow [data-header-catalog-trigger]:visible").first().click();
      const parent=page.locator("#header-product-catalog-panel .marine-product-sidebar-parent[data-marine-category-trigger]").first();
      const parentWeight=await parent.evaluate(el=>getComputedStyle(el).fontWeight);
      await parent.click();
      const child=page.locator("#header-product-catalog-panel .marine-product-category-flyout:not([hidden]) .marine-product-category-group-title").first();
      const childWeight=await child.evaluate(el=>getComputedStyle(el).fontWeight);
      const nested=page.locator("#header-product-catalog-panel .marine-product-category-flyout:not([hidden]) .marine-product-category-links a").first();
      const nestedWeight=await nested.count()?await nested.evaluate(el=>getComputedStyle(el).fontWeight):"none";
      const pass=Number(parentWeight)>=600&&Number(childWeight)===400&&(nestedWeight==="none"||Number(nestedWeight)===400);
      summary.categoryChildWeight.push({width,pass,parentWeight,childWeight,nestedWeight});
      await page.screenshot({path:dir+"/category-child-weight-"+width+".png",fullPage:false});
    }catch(error) {
      summary.categoryChildWeight.push({width,pass:false,error:String(error.message||error).slice(0,250)});
    }finally {await page.close();}
  }
  console.log("MARINEAQUA_CATEGORY_CHILD_WEIGHT="+(summary.categoryChildWeight.every(x=>x.pass)?"PASS":"FAIL")+" "+JSON.stringify(summary.categoryChildWeight));
  if(!summary.categoryChildWeight.every(x=>x.pass))process.exitCode=1;

  // Promotion in WordPress desktop nav: no lightning, orange stars and subtle
  // animation that respects prefers-reduced-motion.
  summary.saleSparkles=[];
  for (const width of [1024,1440,1917]) {
    const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      const result=await page.locator("#desktop-menu [data-marine-sale]").first().evaluate(el=>{
        const caption=el.querySelector(".marine-sale-caption");
        const stars=[...el.querySelectorAll(".marine-sale-star")];
        const style=caption?getComputedStyle(caption):null;
        return {
          label:caption?.textContent||"",
          starCount:stars.length,
          boltCount:el.querySelectorAll(".marine-sale-bolt").length,
          starColors:stars.map(star=>getComputedStyle(star).color),
          animations:stars.map(star=>getComputedStyle(star).animationName),
          labelColor:style?.color||""
        };
      });
      result.width=width;
      result.pass=result.label.includes("Khuyến mãi")&&result.starCount===3&&
        result.boltCount===0&&result.animations.every(x=>x==="marineSaleStarTwinkle")&&
        result.starColors.every(x=>x==="rgb(255, 173, 57)");
      summary.saleSparkles.push(result);
      await page.screenshot({path:dir+"/sale-sparkles-"+width+".png",fullPage:false});
    }catch(error){
      summary.saleSparkles.push({width,pass:false,error:String(error.message||error).slice(0,250)});
    }finally{await page.close();}
  }
  console.log("MARINEAQUA_SALE_SPARKLES="+(summary.saleSparkles.every(x=>x.pass)?"PASS":"FAIL")+" "+JSON.stringify(summary.saleSparkles));
  if(!summary.saleSparkles.every(x=>x.pass))process.exitCode=1;

  // Category navigation is click-only on ALL pages. Homepage banner stays
  // full-width and must not carry a permanently visible catalog sidebar.
  summary.categorySidebar = [];
  for (const width of [1917, 1440, 1200, 1024]) {
    const page = await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      await page.waitForTimeout(500);
      const trigger=page.locator('[data-header-catalog-trigger]:visible').first();
      const panel=page.locator("#header-product-catalog-panel");
      const first=await page.evaluate(()=>{
        const headerCatalog=document.querySelector("#header-product-catalog-panel");
        const visible=el=>!!el && getComputedStyle(el).display!=="none" &&
          el.getBoundingClientRect().height>0;
        const banner=[...document.querySelectorAll("[data-home-slider]")].find(visible);
        const bannerRect=banner?.getBoundingClientRect();
        const duplicateId=[...document.querySelectorAll("[id]")].map(el=>el.id)
          .filter((id,index,ids)=>id && ids.indexOf(id)!==index);
        return {
          fixedSidebarCount:document.querySelectorAll("[data-marine-home-catalog],.marine-home-catalog").length,
          categoryPanelCount:document.querySelectorAll("[data-marine-product-sidebar]").length,
          catalogInitiallyHidden:headerCatalog?.hasAttribute("hidden")===true,
          bannerWidth:Math.round(bannerRect?.width||0),
          expectedWidth:window.innerWidth,
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,
          bannerVariants:[...document.querySelectorAll("[data-marine-home-variant]")]
            .filter(visible).length,
          duplicateIds:duplicateId.length
        };
      });
      const triggerVisible=(await trigger.count())===1;
      let clickOpened=false, clickClosed=false, outsideClosed=false;
      let escapeClosed=false, childOpened=false, childClosed=false;
      let categoryLinks=0, categoryRows=0, insideViewport=false;
      if(triggerVisible){
        await trigger.click();
        clickOpened=await panel.isVisible() &&
          await trigger.getAttribute("aria-expanded")==="true";
        if(clickOpened){
          const details=await panel.evaluate(el=>{
            const r=el.getBoundingClientRect();
            return {
              rows:el.querySelectorAll("[data-marine-category-item]").length,
              links:el.querySelectorAll("a[href]").length,
              viewport: r.left>=0 && r.right<=innerWidth+2 &&
                r.top>=0 && r.bottom<=innerHeight+2
            };
          });
          categoryRows=details.rows;categoryLinks=details.links;insideViewport=details.viewport;
          const child=panel.locator(".marine-product-sidebar-parent[data-marine-category-trigger]").first();
          if(await child.count()){
            const originalUrl=page.url();
            await child.click();
            const childId=await child.getAttribute("aria-controls");
            const childPanel=panel.locator("[id='"+childId+"']");
            childOpened=await childPanel.isVisible() &&
              await child.getAttribute("aria-expanded")==="true" && page.url()===originalUrl;
            await child.click();
            childClosed=!(await childPanel.isVisible()) &&
              await child.getAttribute("aria-expanded")==="false";
          }else{childOpened=true;childClosed=true}
        }
        await trigger.click();
        clickClosed=!(await panel.isVisible()) &&
          await trigger.getAttribute("aria-expanded")==="false";
        await trigger.click();
        await page.keyboard.press("Escape");
        escapeClosed=!(await panel.isVisible()) &&
          await trigger.getAttribute("aria-expanded")==="false";
        await trigger.click();
        await page.mouse.click(width-5, Math.min(850, page.viewportSize()?.height-10 || 850));
        outsideClosed=!(await panel.isVisible()) &&
          await trigger.getAttribute("aria-expanded")==="false";
      }
      const pass=Boolean(triggerVisible && first.fixedSidebarCount===0 &&
        first.categoryPanelCount===1 && first.catalogInitiallyHidden &&
        first.bannerVariants===1 && Math.abs(first.bannerWidth-width)<3 &&
        !first.horizontalOverflow && first.duplicateIds===0 &&
        clickOpened && clickClosed && outsideClosed && escapeClosed &&
        childOpened && childClosed && insideViewport &&
        categoryRows>0 && categoryLinks>0);
      summary.categorySidebar.push({width,pass,triggerVisible,clickOpened,clickClosed,
        outsideClosed,escapeClosed,childOpened,childClosed,insideViewport,
        categoryRows,categoryLinks,...first});
      if([1440,1024].includes(width)){
        await trigger.click();
        await page.screenshot({path:dir+"/product-category-click-menu-"+width+".png",fullPage:false});
      }
    }catch(error){
      summary.categorySidebar.push({width,pass:false,error:String(error.message||error).slice(0,300)});
    }finally{await page.close();}
  }
  const categorySidebarPass=summary.categorySidebar.every(v=>v.pass);
  console.log("MARINEAQUA_PRODUCT_CATEGORY_SIDEBAR="+(categorySidebarPass?"PASS":"FAIL")+
    " "+JSON.stringify(summary.categorySidebar));
  if(!categorySidebarPass)process.exitCode=1;

  // Switching long product category accordions must retain the clicked row
  // inside the same scrollable popover at a stable viewport position.
  summary.categoryScrollAnchor = [];
  for (const width of [1024, 1440]) {
    const page = await browser.newPage({viewport:{width,height:680},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      await page.locator("[data-header-catalog-trigger]:visible").first().click();
      const panel=page.locator("#header-product-catalog-panel");
      const parents=panel.locator(".marine-product-sidebar-parent[data-marine-category-trigger]");
      const count=await parents.count();
      if(count<2)throw new Error("Not enough expandable categories to test scroll anchoring");
      const first=parents.first();
      const next=parents.nth(1);
      await first.click();
      await panel.evaluate(el=>{el.scrollTop=Math.max(0,el.scrollHeight-el.clientHeight);});
      await next.evaluate(el=>el.scrollIntoView({block:"center",behavior:"instant"}));
      const before=await next.evaluate(el=>({top:el.getBoundingClientRect().top, scroll:el.closest("#header-product-catalog-panel")?.scrollTop||0}));
      await next.click();
      await page.waitForTimeout(110);
      const after=await next.evaluate(el=>({top:el.getBoundingClientRect().top, scroll:el.closest("#header-product-catalog-panel")?.scrollTop||0, expanded:el.getAttribute("aria-expanded")}));
      const panelRect=await panel.evaluate(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}));
      const pass=after.expanded==="true"&&Math.abs(after.top-before.top)<3&&after.top>=panelRect.top&&after.top<panelRect.bottom;
      summary.categoryScrollAnchor.push({width,pass,before,after,panelRect});
      await page.screenshot({path:dir+"/category-scroll-anchor-"+width+".png",fullPage:false});
    }catch(error){
      summary.categoryScrollAnchor.push({width,pass:false,error:String(error.message||error).slice(0,220)});
    }finally{await page.close();}
  }
  console.log("MARINEAQUA_CATEGORY_SCROLL_ANCHOR="+(summary.categoryScrollAnchor.every(v=>v.pass)?"PASS":"FAIL")+" "+JSON.stringify(summary.categoryScrollAnchor));
  if(!summary.categoryScrollAnchor.every(v=>v.pass))process.exitCode=1;

  // Product category arrows and nested bullets must match the approved accordion.
  summary.categoryVisual = [];
  for (const width of [1024,1440]) {
    const page=await browser.newPage({viewport:{width,height:820},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      await page.locator("[data-header-catalog-trigger]:visible").first().click();
      const parent=page.locator("#header-product-catalog-panel .marine-product-sidebar-parent[data-marine-category-trigger]").first();
      const collapsed=await parent.evaluate(el=>({
        path:el.querySelector(".marine-category-chevron path")?.getAttribute("d"),
        rotation:getComputedStyle(el.querySelector(".marine-category-chevron")).transform,
        expanded:el.getAttribute("aria-expanded")
      }));
      await parent.click();
      await page.waitForTimeout(230);
      const open=await parent.evaluate(el=>{
        const panel=document.getElementById(el.getAttribute("aria-controls")||"");
        const group=panel?.querySelector(".marine-product-category-group-title");
        const groupStyle=group?getComputedStyle(group,"::before"):null;
        const groupBox=group?.getBoundingClientRect();
        const container=panel?.querySelector(".marine-product-category-grid");
        const parentBox=el.getBoundingClientRect();
        return {
          expanded:el.getAttribute("aria-expanded"),
          rotation:getComputedStyle(el.querySelector(".marine-category-chevron")).transform,
          groupMarkerContent:groupStyle?.content,
          groupMarkerWidth:groupStyle?.width,
          groupMarkerRadius:groupStyle?.borderRadius,
          groupInset:(groupBox?.left||0)-(container?.getBoundingClientRect().left||0),
          groupLeft:groupBox?.left||0,
          parentLeft:parentBox.left,
          hasVerticalRule:Boolean(groupStyle?.borderLeftWidth&&groupStyle.borderLeftWidth!=="0px")
        };
      });
      const pass=collapsed.expanded==="false"&&collapsed.path==="m6 9 6 6 6-6"&&
        collapsed.rotation==="none"&&open.expanded==="true"&&
        open.rotation!=="none"&&open.groupMarkerContent!=="none"&&
        open.groupMarkerRadius==="50%"&&parseFloat(open.groupMarkerWidth||"0")>=5&&
        open.groupInset>=10&&!open.hasVerticalRule;
      summary.categoryVisual.push({width,pass,collapsed,open});
      await page.screenshot({path:dir+"/category-arrow-bullet-"+width+".png",fullPage:false});
    }catch(error){
      summary.categoryVisual.push({width,pass:false,error:String(error.message||error).slice(0,250)});
    }finally{await page.close()}
  }
  console.log("MARINEAQUA_CATEGORY_VISUAL="+(summary.categoryVisual.every(v=>v.pass)?"PASS":"FAIL")+" "+JSON.stringify(summary.categoryVisual));
  if(!summary.categoryVisual.every(v=>v.pass))process.exitCode=1;

  // All WooCommerce category levels live in the single hamburger menu below 1024.
  summary.mobileCatalog = [];
  for (const width of [390, 768, 1023]) {
    const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      const compactCatalog=await page.locator("#header-compact-actions [data-header-catalog-trigger]:visible").count();
      await page.locator("#hamburger-btn").click();
      const categories=page.locator("#mobile-menu-container .marine-mobile-menu-categories");
      const parent=categories.locator(".marine-mobile-category-link[data-menu-toggle]").first();
      if(!(await parent.count()))throw new Error("WordPress product categories have no expandable mobile parent");
      const count=await categories.locator(".marine-mobile-category-item").count();
      const sectionVisible=await categories.isVisible();
      const urlBefore=page.url();
      const panelId=await parent.getAttribute("aria-controls");
      const panel=page.locator('[id="'+panelId+'"]');
      await parent.click();
      const opened=await panel.isVisible()&&await parent.getAttribute("aria-expanded")==="true"&&page.url()===urlBefore;
      await parent.click();
      const closed=!(await panel.isVisible())&&await parent.getAttribute("aria-expanded")==="false";
      const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
      const pass=compactCatalog===0&&sectionVisible&&count>5&&opened&&closed&&!horizontalOverflow;
      summary.mobileCatalog.push({width,pass,compactCatalog,sectionVisible,count,opened,closed,horizontalOverflow});
      await page.screenshot({path:dir+"/unified-mobile-menu-"+width+".png",fullPage:false});
    } catch(error) {
      summary.mobileCatalog.push({width,pass:false,error:String(error.message||error).slice(0,240)});
    } finally {await page.close()}
  }
  const mobileCatalogPass=summary.mobileCatalog.every(item=>item.pass);
  console.log("MARINEAQUA_MOBILE_CATALOG="+(mobileCatalogPass?"PASS":"FAIL")+" "+JSON.stringify(summary.mobileCatalog));
  if(!mobileCatalogPass)process.exitCode=1;

  // Search focus must use a blue glow on the complete form, never an orange inner outline.
  summary.headerSearchFocus = {};
  {
    const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      const input=page.locator("#header-product-search input");
      await input.click();
      summary.headerSearchFocus=await page.evaluate(()=>{
        const form=document.querySelector("#header-product-search");
        const input=form?.querySelector("input");
        const button=form?.querySelector("button");
        const outer=form?getComputedStyle(form):null;
        const inner=input?getComputedStyle(input):null;
        const action=button?getComputedStyle(button):null;
        return {
          active:document.activeElement===input,
          outline:inner?.outlineStyle,
          outlineWidth:inner?.outlineWidth,
          borderColor:outer?.borderTopColor,
          boxShadow:outer?.boxShadow,
          buttonBackground:action?.backgroundColor,
          buttonVisible:Boolean(button?.getBoundingClientRect().width)
        };
      });
      const check=summary.headerSearchFocus;
      check.pass=check.active&&check.outline==="none"&&
        check.borderColor==="rgb(51, 184, 233)"&&
        check.boxShadow?.includes("31, 171, 231")&&check.buttonVisible;
      await page.screenshot({path:dir+"/header-search-focus-1440.png",fullPage:false});
    }catch(error){
      summary.headerSearchFocus={pass:false,error:String(error.message||error).slice(0,220)};
    }finally{await page.close();}
  }
  console.log("MARINEAQUA_HEADER_SEARCH_FOCUS="+(summary.headerSearchFocus.pass?"PASS":"FAIL")+" "+JSON.stringify(summary.headerSearchFocus));
  if(!summary.headerSearchFocus.pass)process.exitCode=1;

  // Regression: left-clustered nav; a single visually connected category
  // parent/submenu surface; no repeated heading or consultation CTA.
  summary.headerRefinements = [];
  for (const width of [1440, 1200, 1024]) {
    const page = await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin+"/",{waitUntil:"domcontentloaded",timeout:45000});
      await page.waitForTimeout(350);
      const headerBefore=await page.evaluate(()=>{
        const items=[...document.querySelectorAll("#desktop-menu > ul > li")];
        const rects=items.map(el=>el.getBoundingClientRect());
        const gaps=rects.slice(1).map((r,i)=>Math.round(r.left-rects[i].right));
        const row=document.querySelector("#desktop-menu > ul");
        return {
          hotlineExists:Boolean(document.querySelector("#header-hotline")),
          display:row ? getComputedStyle(row).justifyContent : "",
          gaps
        };
      });
      const trigger=page.locator("[data-header-catalog-trigger]:visible").first();
      await trigger.click();
      const firstChildTrigger=page.locator("#header-product-catalog-panel [data-marine-category-trigger]").first();
      await firstChildTrigger.click();
      // The parent row transitions background over 180ms. Read computed style
      // only after the transition settles; its first frame is transparent.
      await page.waitForTimeout(260);
      const panelId=await firstChildTrigger.getAttribute("aria-controls");
      const submenu=page.locator("#header-product-catalog-panel [id='"+panelId+"']");
      const visuals=await submenu.evaluate(el=>{
        const parent=el.previousElementSibling;
        const ps=getComputedStyle(parent),cs=getComputedStyle(el);
        const title=el.querySelector(".marine-product-category-head h2");
        const link=el.querySelector(".marine-product-category-head a");
        return {
          titleRepeated:Boolean(title),
          allLinkPresent:Boolean(link?.getAttribute("href")),
          childBorder:cs.borderTopWidth+" "+cs.borderRightWidth+" "+cs.borderBottomWidth+" "+cs.borderLeftWidth,
          parentBackground:ps.backgroundColor,
          childBackground:cs.backgroundColor,
          parentBottomRadius:ps.borderBottomLeftRadius,
          childTopRadius:cs.borderTopLeftRadius,
          childVisible:el.getBoundingClientRect().height>0,
          headerCssLoaded:Boolean([...document.styleSheets].some(sheet=>{try{return [...sheet.cssRules].some(rule=>rule.cssText.includes("marine-product-sidebar-item.is-expanded"))}catch{return false}}))
        };
      });
      const pass=!headerBefore.hotlineExists && (
        width<1440 || (headerBefore.display==="flex-start" &&
          headerBefore.gaps.length>0 && headerBefore.gaps.every(g=>g>=-2&&g<=30))
      ) && !visuals.titleRepeated && visuals.allLinkPresent &&
        visuals.childBorder==="0px 0px 0px 0px" &&
        visuals.parentBackground===visuals.childBackground &&
        visuals.parentBottomRadius==="0px" &&
        visuals.childTopRadius==="0px" && visuals.childVisible;
      summary.headerRefinements.push({width,pass,nav:headerBefore,submenu:visuals});
      if(width===1440||width===1024)await page.screenshot({
        path:dir+"/header-category-unified-"+width+".png",fullPage:false
      });
    }catch(error){
      summary.headerRefinements.push({width,pass:false,error:String(error.message||error).slice(0,260)});
    }finally{await page.close();}
  }
  const headerRefinementsPass=summary.headerRefinements.every(v=>v.pass);
  console.log("MARINEAQUA_HEADER_REFINEMENTS="+(headerRefinementsPass?"PASS":"FAIL")+
    " "+JSON.stringify(summary.headerRefinements));
  if(!headerRefinementsPass)process.exitCode=1;

  summary.productListingRoute = {};
  {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    try {
      const response = await page.goto(frontend.origin + "/san-pham", {
        waitUntil:"domcontentloaded", timeout:45000
      });
      await page.waitForTimeout(500);
      const trigger = page.locator("[data-header-catalog-trigger]:visible").first();
      const panel = page.locator("#header-product-catalog-panel");
      const beforeHidden = !(await panel.isVisible().catch(()=>false));
      const triggerExists = await trigger.count() > 0;
      let opened=false,closed=false;
      if(triggerExists){
        await trigger.click();
        opened=await panel.isVisible() && await trigger.getAttribute("aria-expanded")==="true";
        await page.keyboard.press("Escape");
        closed=!(await panel.isVisible()) && await trigger.getAttribute("aria-expanded")==="false";
      }
      const status=response?.status()||0;
      summary.productListingRoute={status,beforeHidden,triggerExists,opened,closed,
        pass:status>=200&&status<400&&beforeHidden&&triggerExists&&opened&&closed};
      console.log("MARINEAQUA_PRODUCT_LIST_ROUTE="+
        (summary.productListingRoute.pass?"PASS":"FAIL")+" "+JSON.stringify(summary.productListingRoute));
      if(!summary.productListingRoute.pass)process.exitCode=1;
      await page.screenshot({path:dir+"/product-list-collapsed-1440.png",fullPage:false});
    }catch(error){
      summary.productListingRoute={pass:false,error:String(error.message||error).slice(0,220)};
      console.log("MARINEAQUA_PRODUCT_LIST_ROUTE=FAIL "+JSON.stringify(summary.productListingRoute));
      process.exitCode=1;
    }finally{await page.close();}
  }

  // Regression for the three audited Lighthouse accessibility failures.
  // Read-only: the published DOM is inspected without changing any user data.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      const client = await page.context().newCDPSession(page);
      const browserIssues = [];
      client.on("Audits.issueAdded", ({ issue }) => {
        if (browserIssues.length < 15) browserIssues.push({
          type: String(issue?.code || "unknown").slice(0, 100),
          violation: String(issue?.details?.contentSecurityPolicyIssueDetails?.violationType || "").slice(0, 80),
          source: String(issue?.details?.contentSecurityPolicyIssueDetails?.sourceCodeLocation?.url || "").slice(0, 200)
        });
      });
      await client.send("Audits.enable");
      const homeResponse = await page.goto(frontend.origin + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(900);
      const policy = homeResponse?.headers()["content-security-policy"] || "";
      const cspAudit = { pageCspPresent: Boolean(policy),
        scriptUnsafeInline: /script-src[^;]*'unsafe-inline'/.test(policy),
        scriptStrictDynamic: /script-src[^;]*'strict-dynamic'/.test(policy),
        issues: browserIssues };
      summary.browserCsp = cspAudit;
      console.log("MARINEAQUA_CSP_BROWSER_AUDIT=" + JSON.stringify(cspAudit));
      const audit = await page.evaluate(() => {
        const actions = [...document.querySelectorAll("#header-contacts > span[data-header-action]")];
        const rolesValid = actions.length === 2 && actions.every(el =>
          el.getAttribute("role") === "img" && Boolean(el.getAttribute("aria-label")));
        const inactiveSlides = [...document.querySelectorAll('figure[data-home-slide][aria-hidden="true"]')];
        const slidesInert = inactiveSlides.length > 0 && inactiveSlides.every(el => el.hasAttribute("inert"));
        const caption = document.querySelector("#desktop-menu [data-marine-sale] .marine-sale-caption");
        const sourceColor = caption ? getComputedStyle(caption).color : "";
        const backgroundColor = document.querySelector("#header-navrow") ?
          getComputedStyle(document.querySelector("#header-navrow")).backgroundColor : "";
        const channels = color => {
          const values = color.match(/[0-9]+(?:[.][0-9]+)?/g)?.slice(0, 3).map(Number) || [];
          return values.length === 3 ? values.map(v => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          }) : null;
        };
        const luminance = color => {
          const rgb = channels(color);
          return rgb ? rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 : null;
        };
        const fg = luminance(sourceColor), bg = luminance(backgroundColor);
        const contrast = fg === null || bg === null ? 0 :
          (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
        return { rolesValid, slidesInert, inactiveSlides: inactiveSlides.length,
          sourceColor, backgroundColor, contrast: Number(contrast.toFixed(2)),
          pass: rolesValid && slidesInert && contrast >= 4.5 };
      });
      summary.lighthouseAccessibility = audit;
      console.log("MARINEAQUA_LIGHTHOUSE_ACCESSIBILITY=" + (audit.pass ? "PASS" : "FAIL") +
        " " + JSON.stringify(audit));
      if (!audit.pass) process.exitCode = 1;
    } catch (error) {
      summary.lighthouseAccessibility = { pass: false, error: String(error.message || error).slice(0, 240) };
      console.log("MARINEAQUA_LIGHTHOUSE_ACCESSIBILITY=FAIL " + JSON.stringify(summary.lighthouseAccessibility));
      process.exitCode = 1;
    } finally {
      await page.close();
    }
  }

  // Targeted post-deploy consultation panel QA. Read-only on public pages.
  summary.consultationPanel = [];
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
    try {
      await page.goto(frontend.origin + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
      const launcher = page.locator("#ai-agent-btn");
      await launcher.click({ timeout: 15000 });
      const opened = await page.evaluate(() => {
        const panel = document.querySelector("#marine-consult-panel");
        const btn = document.querySelector("#ai-agent-btn");
        const rect = panel?.getBoundingClientRect();
        const links = [...(panel?.querySelectorAll("a") || [])].map(a => ({
          label: (a.textContent || "").trim(), href: a.getAttribute("href") || ""
        }));
        return {
          open: Boolean(panel && !panel.hidden && !panel.inert),
          expanded: btn?.getAttribute("aria-expanded") === "true",
          title: panel?.querySelector("#marine-consult-title")?.textContent?.trim(),
          inViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth + 1
            && rect.top >= 0 && rect.bottom <= innerHeight + 1),
          links,
          aiOption: Boolean(panel?.querySelector("#marine-consult-ai")),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2
        };
      });
      await page.screenshot({path:dir+"/consultation-open-"+width+".png",fullPage:false});
      // Regression: clicking the same launcher a second time MUST close, not reopen.
      await launcher.click();
      const secondClickClosed = await page.locator("#marine-consult-panel").evaluate(el => el.hidden && el.inert);
      const secondClickCollapsed = await launcher.getAttribute("aria-expanded") === "false";
      await launcher.click();
      const thirdClickOpened = await page.locator("#marine-consult-panel").evaluate(el => !el.hidden && !el.inert);
      await page.keyboard.press("Escape");
      const closedByEscape = await page.locator("#marine-consult-panel").evaluate(el => el.hidden && el.inert);
      await launcher.click();
      await page.locator("#marine-consult-ai").click();
      const aiOpened = await page.locator("#ai-chat-box").evaluate(el =>
        !el.inert && el.getAttribute("aria-hidden") === "false");
      await page.locator("#close-chat-btn").click();
      const aiClosed = await page.locator("#ai-chat-box").evaluate(el =>
        el.inert && el.getAttribute("aria-hidden") === "true");
      await launcher.click();
      await page.mouse.click(3,3);
      const closedOutside = await page.locator("#marine-consult-panel").evaluate(el => el.hidden);
      await page.evaluate(() => window.scrollTo({top:document.body.scrollHeight,behavior:"instant"}));
      await page.waitForTimeout(700);
      const floatingButtons = await page.evaluate(() => {
        const top = document.querySelector("#back-to-top-btn");
        const consult = document.querySelector("#ai-agent-btn");
        if (!top || !consult) return {visible:false,gap:-1};
        const a = top.getBoundingClientRect(), b = consult.getBoundingClientRect();
        const visible = getComputedStyle(top).opacity !== "0" && !top.disabled;
        return {visible, gap:Math.round(b.top - a.bottom),
          centerDelta:Math.round(Math.abs((a.left+a.right)/2 - (b.left+b.right)/2))};
      });
      const linkTypesValid = opened.links.every(link =>
        (link.href.startsWith("tel:") && /^tel:\+?\d{9,15}$/.test(link.href)) ||
        /^https:\/\/(?:www\.)?(?:facebook\.com|m\.facebook\.com|fb\.com|m\.me|zalo\.me|oa\.zalo\.me)\//.test(link.href));
      const result = {width, ...opened, secondClickClosed, secondClickCollapsed, thirdClickOpened,
        closedByEscape, aiOpened, aiClosed, closedOutside, linkTypesValid, floatingButtons};
      result.pass = opened.open && opened.expanded && opened.title === "Kênh tư vấn"
        && opened.inViewport && opened.aiOption && !opened.horizontalOverflow
        && secondClickClosed && secondClickCollapsed && thirdClickOpened
        && closedByEscape && aiOpened && aiClosed && closedOutside && linkTypesValid
        && floatingButtons.visible && floatingButtons.gap >= 22 && floatingButtons.centerDelta <= 9;
      summary.consultationPanel.push(result);
    } catch (error) {
      summary.consultationPanel.push({width, pass:false, error:String(error.message || error).slice(0,350)});
    } finally {
      await page.close();
    }
  }
  const consultationPass = summary.consultationPanel.every(item => item.pass);
  console.log("MARINEAQUA_CONSULTATION_PANEL=" + (consultationPass ? "PASS" : "FAIL")
    + " " + JSON.stringify(summary.consultationPanel));
  if (!consultationPass) process.exitCode=1;

  // Check mobile promotion style and nested WooCommerce category dots against the live build.
  summary.mobileMenuVisual = [];
  for (const width of [390, 768]) {
    const page = await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
    try {
      await page.goto(frontend.origin + "/", {waitUntil:"domcontentloaded",timeout:45000});
      await page.locator("#hamburger-btn").click({timeout:12000});
      const sale = page.locator("#mobile-menu-container [data-marine-sale]").first();
      const saleResult = await sale.evaluate(el => {
        const control = el.querySelector(":scope > div > a, :scope > div > button, :scope > div > span");
        const caption = control?.querySelector(".marine-sale-caption");
        const stars = [...(caption?.querySelectorAll(".marine-sale-star") || [])];
        const style = control ? getComputedStyle(control) : null;
        return {
          starCount:stars.length,
          sparkleAnimated:stars.every(star=>getComputedStyle(star).animationName==="marineSaleStarTwinkle"),
          boltCount:el.querySelectorAll(".marine-sale-bolt").length,
          background:style?.backgroundColor || "",
          backgroundImage:style?.backgroundImage || "",
          label:caption?.textContent?.trim() || ""
        };
      });
      const expandable = page.locator("#mobile-menu-container .marine-mobile-menu-categories > .marine-mobile-category-list > .marine-mobile-category-item > button[data-menu-toggle]").first();
      if (await expandable.count()) await expandable.click();
      const categoryResult = await page.locator("#mobile-menu-container .marine-mobile-category-nested").first().evaluate(el => {
        const icons = [...el.querySelectorAll(".marine-mobile-category-dot")];
        const dotMarks = [...el.querySelectorAll(".marine-mobile-category-dot-mark")];
        return {iconCount:icons.length, markCount:dotMarks.length,
          noOldIcons: icons.every(icon=>!icon.querySelector("svg")),
          dotSizes:dotMarks.map(el=>Math.round(el.getBoundingClientRect().width)),
          borderLeft:getComputedStyle(el).borderLeftWidth};
      }).catch(error=>({iconCount:0,markCount:0,noOldIcons:false,dotSizes:[],borderLeft:"unknown",error:String(error.name)}));
      const alignment = await page.locator("#mobile-menu-container .marine-mobile-category-children:not([hidden])").first().evaluate(el => {
        const all = el.querySelector(":scope > .marine-mobile-category-all");
        const link = el.querySelector(".marine-mobile-category-nested > .marine-mobile-category-item > .marine-mobile-category-link");
        const dot = link?.querySelector(".marine-mobile-category-dot-mark");
        const label = link?.querySelector(":scope > span:nth-child(2)");
        if (!all || !dot || !label) return {pass:false,reason:"missing category row"};
        const allStyle = getComputedStyle(all);
        const bulletStyle = getComputedStyle(all, "::before");
        const dotLeft = dot.getBoundingClientRect().left;
        const allDotLeft = all.getBoundingClientRect().left +
          parseFloat(allStyle.paddingLeft) + parseFloat(bulletStyle.marginLeft);
        const allLabelLeft = allDotLeft + parseFloat(bulletStyle.width) + parseFloat(allStyle.gap);
        const labelLeft = label.getBoundingClientRect().left;
        return {allText:(all.textContent||"").trim(),dotDelta:Math.round(dotLeft-allDotLeft),
          labelDelta:Math.round(labelLeft-allLabelLeft),
          pass:(all.textContent||"").trim()==="Xem tất cả" &&
            Math.abs(dotLeft-allDotLeft)<=2 && Math.abs(labelLeft-allLabelLeft)<=2};
      }).catch(error=>({pass:false,error:String(error.message||error).slice(0,150)}));
      const pass = saleResult.starCount===3 && saleResult.sparkleAnimated &&
        saleResult.boltCount===0 && saleResult.background==="rgba(0, 0, 0, 0)" &&
        saleResult.backgroundImage==="none" &&
        categoryResult.iconCount>0 && categoryResult.iconCount===categoryResult.markCount &&
        categoryResult.noOldIcons && categoryResult.dotSizes.every(s=>s===6) &&
        categoryResult.borderLeft==="0px" && alignment.pass;
      const result={width,sale:saleResult,categories:categoryResult,alignment,pass};
      summary.mobileMenuVisual.push(result);
      await page.screenshot({path:dir+"/mobile-menu-stars-dots-"+width+".png",fullPage:false});
    }catch(error){
      summary.mobileMenuVisual.push({width,pass:false,error:String(error.message||error).slice(0,300)});
    }finally{await page.close();}
  }
  const mobileVisualPass=summary.mobileMenuVisual.every(item=>item.pass);
  console.log("MARINEAQUA_MOBILE_MENU_VISUAL="+(mobileVisualPass?"PASS":"FAIL")+" "+JSON.stringify(summary.mobileMenuVisual));
  if (!mobileVisualPass) process.exitCode=1;

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
// The clean header intentionally removes the legacy navy background, paired
// pills and glowing bolt. Validate the current WordPress-owned six-item hierarchy.
const clean = desktop?.headerV3ColorAudit;
const cleanExpectedLabels=["trang chủ","khuyến mãi","chính sách và hướng dẫn","thời gian bán hàng","chia sẻ","liên hệ"];
const normalizeClean = value=>String(value||"").replace(/[⚡✦]/g,"").trim().toLocaleLowerCase("vi");
const cleanEntries=clean?.entries||[];
const cleanLabelsPass=cleanEntries.length===cleanExpectedLabels.length&&cleanEntries.every((item,i)=>
  normalizeClean(item.label)===cleanExpectedLabels[i]);
const cleanSale=cleanEntries.find(item=>item.sale);
const cleanSalePass=Boolean(cleanSale &&
  cleanSale.color==="rgb(193, 42, 67)" &&
  cleanSale.backgroundColor==="rgba(0, 0, 0, 0)" &&
  !cleanSale.backgroundImage.includes("gradient") &&
  !cleanSale.boltSvg);
const cleanNormalPass=cleanEntries.filter(entry=>!entry.sale).every(entry=>
  ["rgb(36, 67, 92)","rgb(6, 119, 181)"].includes(entry.color));
const cleanHeaderPass=cleanLabelsPass&&cleanSalePass&&cleanNormalPass;
console.log("MARINEAQUA_CLEAN_OCEAN_HEADER="+(cleanHeaderPass?"PASS":"FAIL")+
  " "+JSON.stringify({count:cleanEntries.length,labels:cleanEntries.map(e=>e.label),
    normal:cleanNormalPass,sale:cleanSalePass}));
if(!cleanHeaderPass)process.exitCode=1;

// Verify final uncropped hero photography and soft left gradient after production deployment.
const bannerChecks = [1917,1440,768,390].map(width=>{
  const view=summary.views.find(v=>v.width===width);
  const carousels=(view?.bannerAudit||[]).filter(entry=>entry.tag==="DIV" && entry.visible &&
    entry.isCarousel && entry.slideCount>0 && entry.borderRadius==="0px");
  const hero=carousels.find(entry=>entry.srcs.some(img=>img.loaded && img.naturalW>10));
  // The catalog is now a click-only header popover, not a fixed banner column.
  const widthPass=Boolean(hero && Math.abs(hero.rect.w-width)<3 && Math.abs(hero.rect.x)<2);
  const mediaPass=hero ? hero.srcs.some(img=>{
    const src=String(img.src||"");
    const expectedHost=src.startsWith("https://marine-aqua.io.vn/images/pages/") ||
      src.startsWith("https://marine-aqua.vn/wp-content/uploads/2026/08/");
    return img.loaded && img.naturalW>10 && expectedHost &&
      src.includes("banner1-1-1380x672");
  }) : false;
  const radiusPass=Boolean(hero && hero.borderRadius==="0px" && hero.borderWidth==="0px");
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
