# Marine Aqua homepage category CTA (DONE — 2026-11-13)

## Request
Change the WordPress ESC Table Home_00 hero call-to-action `Khám phá danh mục` on homepage from `#categories` to the published products listing `/san-pham`. Preserve banner visuals, slide data and other links.

## Source
- Project: marine-aqua.vn, Astro `ngocnhanvo/marineaqua-astro` production branch `master`.
- Knowledge `ngocnhanvo/knowledge` main, code mode auto-build, source gate bypass.
- Existing source file `src/astro/tablepress/Home_00.astro` contains real WordPress ESC Table-driven slides and presentation CTA.
- Only one source line changed: `<a class="marine-hero-button" href="#categories">` → `href="/san-pham"`.
- Astro source commit and exact deployed SHA: `45e27c9e188ce87fe6e5a2038be802162508842d`.
- No CMS data, ESC Table item, banner image, product, cart, PHP or menu modified.

## CI, production and QA
- Existing Astro CI run `43382064682` rerun job `131998162370` SUCCESS (source tests and Astro check).
- Release request `dispatch-requests/20261113T161000Z-home-category-cta.json` (commit `53e5916c36b5e4f3b8af76f19fee8a9498712c5d`) passed through existing dispatch bridge run `43458480164`.
- Existing canonical production deploy run `43458564198`, job `131999093731`: SUCCESS. Exact source `45e27c9e188ce87fe6e5a2038be802162508842d`, ASTRO_OUTPUT_VALIDATION=PASS, FTPS_UPLOAD=PASS (2568574 bytes), SIGNED_UNZIP_SUCCESS at 2026-11-13 16:03:45 UTC. No second deploy pipeline.
- Focused read-only Playwright QA `scripts/marineaqua-home-category-cta-qa.mjs`, workflow `.github/workflows/marineaqua-home-category-cta-qa.yml`.
- First pre-deploy QA run `43458378189` failed against the old production HTML `#categories` as expected; the same job was rerun after production activation. Rerun job `132000310209`: SUCCESS.
- Final QA `MARINEAQUA_HOME_CATEGORY_CTA.status=PASS` for desktop 1366 x 900 and mobile 390 x 844.
- Four hero CTA instances (visible and hidden slides) all have exactly `/san-pham`; clicking the visible active CTA navigated to `https://marine-aqua.io.vn/san-pham` in both viewports.
- Product destination HTTP 200. No horizontal overflow, document/viewport widths exactly 1366 and 390 px.
- Browser screenshots of CTA saved to QA artifact; no mutating HTTP requests or test records.

## Status
DONE — source fixed, production deployed and click-tested on desktop and mobile. Previous contact-header/checkout checkpoints remain DONE; no need to repeat.
