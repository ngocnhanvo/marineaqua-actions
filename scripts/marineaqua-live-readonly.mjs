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
          visibleBannerVariants:[...document.querySelectorAll("[data-marine-home-variant]")]
            .filter(el=>getComputedStyle(el).display!=="none" && el.getBoundingClientRect().width>0).length,
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
          menuOpened && menuText.includes("Trang chủ") &&
          menuText.includes("Chính sách và hướng dẫn") && menuText.includes("Liên hệ") &&
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
        const desktop=innerWidth>=1440;
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
      let menuWorks=false;
      if(await trigger.count()){
        await trigger.click();
        menuWorks=await page.locator("#header-product-catalog-panel").isVisible();
        await page.keyboard.press("Escape");
        menuWorks=menuWorks&&!(await page.locator("#header-product-catalog-panel").isVisible());
      }
      const pass=!before.overflow&&!after.overflow&&after.scrollY>=600&&
        after.backgroundColor===(after.desktop ? "rgb(243, 249, 255)" : "rgba(255, 255, 255, 0.97)")&&
        after.fixedClass&&after.position==="fixed"&&after.aboveContent&&
        after.spacerVisible&&menuWorks;
      summary.headerFloating.push({width,pass,menuWorks,...after});
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

  // Category navigation is click-only on ALL pages. Homepage banner stays
  // full-width and must not carry a permanently visible catalog sidebar.
  summary.categorySidebar = [];
  for (const width of [1917, 1440, 1024, 390]) {
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
          const child=panel.locator("[data-marine-category-trigger]").first();
          if(await child.count()){
            await child.click();
            const childId=await child.getAttribute("aria-controls");
            const childPanel=panel.locator("[id='"+childId+"']");
            childOpened=await childPanel.isVisible() &&
              await child.getAttribute("aria-expanded")==="true";
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
      if([1440,390].includes(width)){
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

  // Regression: left-clustered nav; a single visually connected category
  // parent/submenu surface; no repeated heading or consultation CTA.
  summary.headerRefinements = [];
  for (const width of [1440, 1024, 390]) {
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
      if(width===1440||width===390)await page.screenshot({
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
const normalizeClean = value=>String(value||"").replace(/⚡/g,"").trim().toLocaleLowerCase("vi");
const cleanEntries=clean?.entries||[];
const cleanLabelsPass=cleanEntries.length===cleanExpectedLabels.length&&cleanEntries.every((item,i)=>
  normalizeClean(item.label)===cleanExpectedLabels[i]);
const cleanSale=cleanEntries.find(item=>item.sale);
const cleanSalePass=Boolean(cleanSale &&
  cleanSale.color==="rgb(216, 46, 74)" &&
  cleanSale.backgroundColor==="rgb(255, 241, 243)" &&
  !cleanSale.backgroundImage.includes("gradient") &&
  cleanSale.boltAnimation==="none");
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
