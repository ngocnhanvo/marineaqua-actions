# Marine Aqua — Hide product unit label on detail (DONE — 2026-11-13)

## Scope
User noticed `Cái` displayed below `Liên hệ báo giá` on the Red Sea Skeletal Elements Foundation ABC+ 1kg product detail and requested removal; original merchant website does not show unit there.

## Implementation
- Astro source: `ngocnhanvo/marineaqua-astro` branch `master`; changed `src/astro/pages/ProductDetailsPage.astro` only.
- Removed the presentation line `{product.unit?.[language] && <p class="mt-1 text-sm text-[#64748b]">{product.unit[language]}</p>}` from inside the price/quote box.
- Kept WordPress WooCommerce unit data intact; no mutations to product records, pricing, stock, cart, checkout, or API.
- Astro commit `2815ca052eda6c99979f67009eba045271393e5e`.

## Validation and deployment
- Existing Astro CI rerun `43382064682` job `132005744618`: SUCCESS.
- Release dispatch request `dispatch-requests/20261113T162100Z-hide-product-unit.json`, Actions commit `bdfd8560ae5c2fa5a7a43b39f032f1234e81e0e7`, existing bridge `43460659723`.
- Existing canonical production deploy `43460712807` job `132006574331`: SUCCESS; exact Astro commit; ASTRO_BUILD_COMPLETE=PASS, ASTRO_OUTPUT_VALIDATION=PASS, FTPS_UPLOAD=PASS (2547769 bytes), SIGNED_UNZIP_SUCCESS at 2026-11-13 16:16:08 UTC.
- Read-only Playwright QA script `scripts/marineaqua-product-unit-qa.mjs` and workflow `.github/workflows/marineaqua-product-unit-qa.yml`; query real WooCommerce Store public API for Skeletal Elements to get actual slug, then test product page.
- Auto-triggered first QA before deploy failed (saw old `Cái`); after activation, rerun `43460785976` job `132007759878` completed SUCCESS.
- Live QA `MARINEAQUA_PRODUCT_UNIT_QA.status=PASS`: product `https://marine-aqua.io.vn/san-pham/chat-bo-sung-skeletal-elements-foundation-abc-1kg-redsea`, HTTP 200, `Liên hệ báo giá` link present (1), exact `Cái` visible labels 0, desktop 1366 (no overflow), mobile 390 (no overflow), full-page screenshot artifacts.
- No side effects, orders, emails, cart mutations or cleanup remaining.

## Final state
**DONE**. Resume future tasks from this checkpoint, leave previously completed Header, home hero, contact, and checkout work alone.
