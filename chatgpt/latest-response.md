# Marine Aqua — Approved UI source + hosting handoff (2026-11-10 Asia/Ho_Chi_Minh)

## Owner approval and scope
The owner explicitly APPROVED the last ocean-blue wide Quicksand design, including a coral/red glowing **GIẢM GIÁ KHỦNG** main menu pill after Home. Owner requested saving the fully approved design into the **Astro master repository** with detailed instructions so it can be deployed when hosting is available the next day. This turn committed the real theme implementation, not only the reference mockup. **Owner did not ask to deploy now; no hosting production deployment was triggered.**

## Exact repository heads (after all source work)
- `ngocnhanvo/marineaqua-astro/master`: `2b4b4b2ee0c24f4e5e59115aafdd7cf61d6af1a3`
- `ngocnhanvo/marineaqua-php/master`: `54574851f0eaea9e40341b36c5a7215573bc436e` (unchanged)
- `ngocnhanvo/marineaqua-actions/main`: `08e3994f72d384b78f308a4eb644819add7b240b` (before checkpoint update)
- Repo Knowledge `ngocnhanvo/knowledge/main` applies.

## Source committed, DO NOT REDO
1. [Self-contained complete HTML design reference](https://github.com/ngocnhanvo/marineaqua-astro/blob/master/design/approved/marine-aqua-v3-preview.html): 1,218,487 characters / Git blob SHA `b64e9748842946eaebf024e3b83379ada8216e68`; contains 23 original images inlined, live-site content for DESIGN REFERENCE ONLY, blue wide UI, Quicksand priority, sale pill. Do not put legacy product data/URLs in production CMS or routes. Large-file GitHub view may require downloading Raw.
2. [Detailed approved design & hosting handoff document](https://github.com/ngocnhanvo/marineaqua-astro/blob/master/docs/MARINE_AQUA_APPROVED_DESIGN_AND_HOSTING_HANDOFF.md) and root README links.
3. `src/styles/marine-aqua-approved.css` loaded from `src/styles/global.css` and scoped to `marine-aqua-v3` body in `src/astro/components/Layout/Layout.astro`: Quicksand local fonts (no bundled fonts/Google needed for production), 92.5% wide desktop (1773px at 1917px viewport), modern ocean-blue gradient, delicate waves and responsive cards/focus and reduced motion.
4. `src/astro/components/Menu/Desktop.astro` and `MobileBranch.astro`: `data-marine-sale` set ONLY for a real WordPress Menu Manager item with label `Giảm giá khủng`. Styling bright coral flash pill. No synthetic fallback items/URLs. If WordPress Header has no item, nothing invented.
5. `src/astro/tablepress/Home_03.astro`: WordPress ESC Table category list rendered as accessible horizontal scroll-snap carousel with prev/next buttons, responsive, reduced-motion and `astro:page-load` initialization. Preserves original CMS category item source, order, URLs.
6. `Home_04.astro` through `Home_08.astro`: optional positive `itemPrice.vi` from actual WP data printed red via `data-marine-product-price`; never use prices from legacy reference if absent.
7. New tests in `src/styles/marine-aqua-approved.test.ts`, covering font, palette, WordPress menu/slider and price source.

## Validated results (actual GitHub Actions, no deploy)
- [Astro source CI #42666497061](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42666497061): **SUCCESS**, 30 test files, **208/208 tests PASS**, astro check **0 errors, 0 warnings** on application SHA `39afb9ff5578fad58858f878f3cc353bea3a1e1f` (same application code as current HEAD; subsequent changes docs/README only).
- [Astro production-equivalent build #42666511315](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42666511315): **SUCCESS**, correct build outputs, `CMS_HEADER_MENU=EMPTY locale=vi source=wordpress`, WordPress-only contract PASS; no FTPS uploads.
- Browser QA of stored **exact Git blob**: recreated local file verified Git blob SHA matches `b64e974...`; Chromium `set_content` desktop 1917×1092 and mobile 390×844 **PASS**, approved sale pill renders coral gradient, **23/23 images**, zero overflow, category next buttons move track desktop scroll 2→755px and mobile 2→277px, no visual script failure. No real production browser QA has occurred. Screenshots generated locally at `/mnt/data/MarineAqua-Approved-Desktop.png`, `/mnt/data/MarineAqua-Approved-Mobile.png`.

## Required before tomorrow's launch
1. Hosting/DNS/SSL + domains `marine-aqua.io.vn` and WP `admin.marine-aqua.io.vn` operational; verify FTPS and correct root. Check six secret names in Actions, do not reveal secrets.
2. In WordPress Menu Manager create and publish locale `vi` Header menu with real items. **Sale item** text exactly `Giảm giá khủng`, placed after Trang chủ, href to real sale page/category, never `#`. Current CMS API has **empty Header for vi**, so production code correctly displays no menu yet. Cannot claim the pill shows on live frontend until CMS populated.
3. Verify owner-provided whale FISHLOVERSHOP logo is in WP media + info ACF. Add exact CMS real product categories, hero, correct prices, images/links; do NOT hotlink source legacy site.
4. Browser visual/functional QA after hosting is live for 1917,1440,768,390; inspect WordPress ESC Table and menu flows; follow detailed instructions in `docs/MARINE_AQUA_APPROVED_DESIGN_AND_HOSTING_HANDOFF.md`.
5. Trigger only existing authorized production workflow after hosting + CMS readiness and release request, monitor run/QA and retain rollback.

## State
- DESIGN_APPROVED = YES
- CODE_READY = YES (source saved)
- SOURCE_CI = PASS; BUILD_QA = PASS
- CMS_MENU_READY = NO (`vi` Header empty)
- HOSTING_LIVE_QA = NOT DONE
- DEPLOYED_NEW_DESIGN = NO
- Overall project status = PARTIAL. Do not claim production deployment or complete goal before hosting configured/tested.

Code mode `auto-build`; source write gate `bypass` (as explicitly declared by user project context). App branches **master**; Actions **main**.

---

# Marine Aqua — Wide Modern Preview v2 (2026-11-09)

## Pending user approval
The user supplied screenshots showing a full-width product website compared to the old Marine Aqua preview. They requested nearly full-width desktop layout, modern blue visual treatment, real Quicksand font, decorative ocean waves and livelier category icons. This is preview only. Do NOT deploy or implement into production until preview approval.

## Completed in this turn
- Self-contained interactive preview: /mnt/data/MarineAqua-Preview-Wide-Modern.html
- Desktop first-fold: /mnt/data/MarineAqua-Preview-Wide-Top.png (1917×1092)
- Desktop full-page: /mnt/data/MarineAqua-Preview-Wide-Full.png
- Mobile: /mnt/data/MarineAqua-Preview-Mobile-Top.png and /mnt/data/MarineAqua-Preview-Mobile-Full.png
- Tablet: /mnt/data/MarineAqua-Preview-Tablet-Top.png
- Comparison: /mnt/data/MarineAqua-Before-After-Wide.png
- Review ZIP: /mnt/data/MarineAqua-Modern-Wide-Review.zip
- Editable local source: /mnt/data/marine_aqua_design/preview/modern-wide.css and /mnt/data/marine_aqua_design/rework_preview.py

The 1917px viewport shows 1773px of content (72px each side), versus old 1220px max. At 1440px the content is 1328px (56px margins). Dominant ocean blue, water/ripple motifs and hover-animated SVG category icons, airy cards and larger red product prices. Exact whale/FISHLOVERSHOP original logo is preserved. Data from real marine-aqua.vn browser capture: 5 product brand sections in source order, 20 genuine products and image assets, 12 category slider links. No About section. Product links open actual source website, contact form preview does not send data.

Font: CSS declares Quicksand first, following the existing Astro Tailwind heading/paragraph font mapping, and imports Google Fonts when online. The offline Chromium rendered screenshots use rounded local fallback because the browser cannot fetch Google Fonts, so do not claim screenshots demonstrate exact Quicksand glyphs.

QA: Chromium viewports 1917,1440,768,390 show zero horizontal overflow, all 23 embedded original images loaded, category slider arrows advance scroll 2→869px, five brand sections, prices red rgb(217,31,59), no page JS errors. Tablet uses stacked hero / two-product columns. No production source/CMS/FTP modifications; Astro master safe restore commit 83ed8e27b9d13d53382768e7c4576183be2443ad remains.

## Next action
Wait for user feedback / visual approval. When approved, implement in Astro master using existing Quicksand font assets, retain ESC Table/WordPress data and section order, test with CI/Playwright then separately authorize production deployment. Overall PARTIAL.

---

# Marine Aqua — visual design review checkpoint (2026-11-09)

## User directive / approval gate

- Before coding the new Astro homepage design, first examine the **actual** original website `https://marine-aqua.vn/` using Chromium desktop/mobile; use its real assets and visible layout; build a preview, obtain user review; **do not deploy or introduce an unapproved redesign into `marineaqua-astro/master`**.
- User design corrections: keep the **exact original logo** (the source site's FISHLOVERSHOP blue whale icon, not an AI-recreated Marine Aqua wordmark), **blue** as the dominant brand palette, **no fabricated “Về chúng tôi” section**, convert product category navigation to a **horizontal clickable slider**, and make product **prices red**. Preserve the order of other original content/sections; only styling and the expressly approved category layout change.
- User allows preview files/source without inline AI image generation if it improves accuracy. Render first, implement Astro production design only **after approval**.

## Verified reference browser evidence (actual live website, not AI approximation)

- Read-only GitHub Actions Chromium captures:
  - [reference and original source assets run #42656236316](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42656236316) — SUCCESS, screenshots desktop 1440×900 (full page 1440×2567) and mobile 390×844 (full page 390×5093), JSON DOM metadata, original image files.
  - [product price/category capture run #42654836341](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42654836341) — SUCCESS.
- Original logo EXACT URL from DOM: `https://marine-aqua.vn/wp-content/uploads/2019/07/logo-trans.png`, blue whale/FISHLOVERSHOP. Banner from `/wp-content/uploads/2026/08/banner1-1-690x336.jpg`.
- Original page architecture: left vertical product categories on desktop, slideshow/banner to right, then 4-column product sections. On mobile categories render after product sections. Explicit user request overrides left sidebar presentation for preview → horizontal slider after hero.
- Current 5 brand sections from DOM in order, 4 products each: **TROPIC-MARIN, PRODIBIO, PRODAC, RED SEA, CONTINUUM AQUATICS**; 20 true source photos and prices extracted with browser. No “Về chúng tôi”.
- Avoid invented AI screenshot product data and copy; original site differs greatly from previous AI mockups.

## Visual review prototype (not Astro production)

- Generated standalone offline HTML with embedded original image binaries, CSS and a working category carousel. Built outside production source; screenshots:
  - `/mnt/data/MarineAqua-Preview-Desktop.png`
  - `/mnt/data/MarineAqua-Preview-Mobile.png`
  - `/mnt/data/MarineAqua-Preview-Interactive.html`
  - `/mnt/data/MarineAqua-Before-After.png`
  - `/mnt/data/MarineAqua-Visual-Review-Package.zip`
  - Original captures `/mnt/data/MarineAqua-Reference-Desktop.jpg`, `/mnt/data/MarineAqua-Reference-Mobile.jpg`.
- Playwright rendering QA against local standalone: **PASS** at 1440px and 390px: slider arrows advance, no horizontal document overflow, original logo loads, 5 original brand blocks and 20 original images present, no About section, every actual monetary price CSS `rgb(197,37,49)`, no page errors.
- HTML preview is **design only**; its local callback form does not submit; product and category anchors reference original source site, and there is no production release. Standalone offline preview uses Quicksand CSS font-family fallback without shipping font binaries; actual Astro implementation must reuse Tailwind Quicksand mapping and local fonts.
- The prototype includes a reference hero plus 5 live product brand sections. It intentionally does not add unverified original sections and does not import original tenant's product data into Marine Aqua WordPress.

## Premature Astro changes safely restored

- Early in the prior turn, unapproved visual-only changes were committed to Astro master before user reviewed imagery. Archived their exact HEAD as `ngocnhanvo/marineaqua-astro@archive/unapproved-ocean-ui-2026-11-09` (`6aa3259e4eb4ac68fc076f70250aca269d9bd708`).
- Added a **non-force, fast-forward commit** restoring the exact pre-design tree to `ngocnhanvo/marineaqua-astro/master` at `83ed8e27b9d13d53382768e7c4576183be2443ad`.
- Confirmed restored master tree SHA `d23627b28da2018c2fbddd1bae0febdbf7f6c201` is **identical** to approved pre-design baseline `cac6245d3028c2dc4feed1c582fa3a9a0087d6f9`. No rewritten branch history or Astro deployment in this work.
- Actions `main` gained read-only reference workflow `.github/workflows/marineaqua-reference-capture.yml` and JS script `scripts/marineaqua-reference-capture.mjs`. They capture the public reference website and downloadable evidence as workflow artifact; no WP CMS/FTP mutation.

## Exact next step

**Wait for the user's detailed feedback/approval of the preview**, then implement approved design on correct Astro application source `master` (through explicitly configured GitHub write gate). Preserve original project ESC Table section order, WordPress data sources, menu contract (never fallback static menu), and existing Quicksand Tailwind font. Do not transplant original site's own product database or replace the production logo without identifying original project branding assets. Run source CI, isolated Astro build, Playwright screenshot/browser QA before a separately authorized production release.

Status: **PARTIAL** — actual reference capture + prototype + browser QA complete; user visual sign-off and final Astro implementation pending.
