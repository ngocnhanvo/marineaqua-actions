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
