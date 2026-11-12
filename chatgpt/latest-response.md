# Marine Aqua seven menus DONE checkpoint 2026-11-12

Status: DONE. Source 146 unique products across 7 roots plus 2 empty pump children; 134 reused, 12 created. Source archive price oracle 146/146, 6 prices repaired. Multi-image galleries 29/29, 4 repaired. WooCommerce parity 146/146, no category, price, stock, media errors. Canonical signed production build run 43233160309 SUCCESS. Final acceptance run 43232799464 SUCCESS: 20 desktop/mobile route checks, zero errors. Source inventory 43220740658; independent oracles 43224165055; import 43224629409; price repair 43230561372; gallery repair 43231633217. Source slugs: may-bom-va-may-tao-song (0), may-bom (0), may-tao-song (0), muoi-bien (7), protein-skimmer (6), test-kits (1), thiet-bi-do (5), vat-lieu-loc (22), phu-kien-be-ca-canh (106). Production Astro master SHA 4a3f0dfbe75d5632dd1a3f28d728e6eeb7ba31f3. Do not repeat completed migration. Actions scripts/workflows prefix marineaqua-next-category-. Branch actions main; Astro/PHP master.

---

# Marine Aqua — FOUR PRODUCT CATEGORIES FINAL checkpoint (2026-11-12)

Status: **DONE — original inventory, taxonomy repair, source price parity, galleries, signed Astro production deploy, desktop/mobile live acceptance.** Do not repeat this migration.

## User scope and actual source
- Source roots: `/danh-muc/cat-da-va-chat-nen/` **0 products** (original source explicitly empty), `/danh-muc/den-cho-be-ca-bien-san-ho/` **11**, `/danh-muc/lo-canxi-va-vat-lieu/` **4**, `/danh-muc/lo-khu/` **2**.
- Total **17 unique products**, all 17 existed in target WooCommerce from prior brand migration; **0 new products created**, all 17 needed category membership added. Source detail inventory 17/17, independent archive price oracle 17/17, taxonomy mapping 17/17.
- Original fullsize gallery inventory 15 products with multiple images; exact gallery identity/order parity **15/15 PASS**.
- Import run [#43216127630](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43216127630) PASS: 17 existing category terms appended, 0 created, 0 errors, 0 deferred. No unrelated product data overwritten.
- Independent archive price oracle found **1 existing price mismatch**, fixed with backup/readback in [#43216570421](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43216570421) PASS: 17 checked, 1 updated, 16 unchanged, 0 errors.
- Final strict independent WooCommerce parity **PASS 17/17**: 0 missing, 0 wrong categories/prices/stock/main media, 0 archive count errors, 0 SEO review.
- Canonical signed production Astro build [#43217149964](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43217149964) SUCCESS, exact Astro master SHA `4a3f0dfbe75d5632dd1a3f28d728e6eeb7ba31f3`, signed activation and live route readiness PASS.
- Final release/acceptance [#43216816856](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43216816856) SUCCESS: source parity PASS, gallery 15/15 PASS, signed production PASS, Playwright live **10 route/check records, 0 errors** (4 desktop category routes, 4 mobile, 2 brand regressions).
- Live routes: `https://marine-aqua.io.vn/san-pham/cat-da-va-chat-nen/` 0 (empty state), `/san-pham/den-cho-be-ca-bien-san-ho/` 11, `/san-pham/lo-canxi-va-vat-lieu/` 4, `/san-pham/lo-khu/` 2. All HTTP 200, correct H1 and card count, images/prices/details and mobile no overflow.
- Runner scripts/workflows use prefix `marineaqua-four-category-` in `ngocnhanvo/marineaqua-actions@main`; evidence artifacts tied to runs above. No Astro/PHP source changes needed; WordPress category memberships changed, followed by canonical production rebuild.
- Project: `ngocnhanvo/knowledge@main`, `ngocnhanvo/marineaqua-astro@master`, `ngocnhanvo/marineaqua-php@master`, `ngocnhanvo/marineaqua-actions@main`. Code mode auto-build, source gate bypass.

---

# Marine Aqua — BRAND catalog migration FINAL checkpoint

Date: 2026-11-12 (Asia/Ho_Chi_Minh)
Status: **DONE — WooCommerce import + published Astro listing + production signed deploy + desktop/mobile Playwright QA.**

## Repository contract (do not change)
- Knowledge: `ngocnhanvo/knowledge@main`, branch main.
- Astro production: `ngocnhanvo/marineaqua-astro@master`, **deployed commit `4a3f0dfbe75d5632dd1a3f28d728e6eeb7ba31f3`**.
- WordPress/PHP: `ngocnhanvo/marineaqua-php@master`, PHP source not modified during this migration.
- Workflow owner: `ngocnhanvo/marineaqua-actions@main`, use one canonical production pipeline `.github/workflows/marineaqua-production-deploy.yml` and repository_dispatch `wp_trigger_build` with site_domain `marine-aqua.io.vn`.
- Code mode auto-build; source gate bypass.
- Prior footer, homepage ESC tables / 20 products, and sticky-bottom removal were already complete. Do not redo.

## User request — COMPLETED
Migrate every product under original `https://marine-aqua.vn/danh-muc/thuong-hieu/` to destination WooCommerce and finish corresponding category product listings on `https://marine-aqua.io.vn/`.

### Source and import
- Original category listing inventory: 21 pages, **246 unique product URLs**; run #43159747154.
- Detail inventory: 246/246 complete, run #43160118825, artifact 13917609900.
- Source taxonomy: 246/246 mapped, 14 child archives plus 14 parent-only source products, mapping run #43163059058, artifact 13918288250.
- 246/246 original products are WooCommerce `simple`; run #43174026060.
- Initial 20 genuine homepage products reused; imported remaining **226 products**, across initial bounded batches (11 + 7 + 12), main importer (181), recovery (8), and safe-media final recovery (7). Last import run #43176146719 PASS.
- Final original product parity **PASS 246/246**, zero missing, zero wrong prices/categories/stock/main-media. Gallery parity **PASS 64/64**, all correct original image identities and order, source-alias SHA256 validated. Last release parity run #43182669546; independent gallery diagnostic run #43181556957 PASS.
- 6 legacy source-vs-target prices corrected with rollback snapshots. 20 older Yoast titles fixed. SEO/price repair run #43180166742 PASS checked 246, updated 20, errors=0.
- 197 source products have no original meta description, intentionally not fabricated. One SEO text review is only trailing NBSP and three descriptions are non-fatal whitespace/text-normalization reviews. Seven original main image filenames required deterministic `marine-aqua-original-<sha>` naming because WordPress disallowed legacy Unicode or size/placeholder basename; uploaded original bytes were SHA verified. A double-dot original gallery image also uses verified hash filename.

### Astro source and release
- Astro master commit `4a3f0dfbe75d5632dd1a3f28d728e6eeb7ba31f3`: modern ocean-blue listing, red prices, correctly scoped category links, product cards, responsive grid, legacy `/thuong-hieu/` 301 redirect.
- Source CI #43167563741 PASS, no-deploy build QA #43166554927 PASS.
- Canonical signed production deploy: **#43182976954 COMPLETED SUCCESS**, Astro master SHA verified, build, FTPS upload and signed unzip activation all PASS.
- Public staging marker `/marineaqua-staging-build.json` returns 404 (not exposed through current Apache routing), causing old release orchestrator #43182669546 to report readiness FAIL despite successfully deployed source. A code-only fix to `scripts/marineaqua-brand-release-trigger.mjs` at commit `26bb5a3` now allows **signed build + exact Astro SHA + signed activate logs + live new category routes** as a bounded, secure readiness proof when the optional public marker is unavailable. Do not re-deploy merely to test this helper.
- Live postdeploy QA #43184187438 **PASS 8 routes, 0 failures**, 301 aliases, mobile no horizontal overflow, all tested image loads, product details, red prices, last pages.
- **FINAL independent acceptance run #43184886945 SUCCESS**: signed deployed SHA and signed activation log PASS, complete source taxonomy manifest loaded; Playwright QA **PASS 23 route/check records, 0 failures; 15/15 root and child category counts verified**.
- Source validation of the final readiness helper #43185251537 SUCCESS.
- Live product list `https://marine-aqua.io.vn/san-pham/thuong-hieu/`: 246 total products, 16 pages (last page 6).
- Live `https://marine-aqua.io.vn/san-pham/korallen-zucht/`: 88 total, 6 pages (last page 8).
- New source files are already deployed; no further build/deploy is needed for this user request.

## Evidence / definitive links
- Production workflow: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43182976954
- Live QA: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43184187438
- Final signed deployment + all 15 category counts + mobile QA: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43184886945
- Final data parity run: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43182669546 (product and gallery checks PASS, overall orchestration marked failed solely because old optional public marker probe returned 404; final independent acceptance #43184886945 supersedes readiness check).
- Actions source validation: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43185251537

## Follow-up policy
This task is DONE. Do not rerun import, gallery, SEO repair or production deploy without a **new** user request. Use this checkpoint, commit and evidence when user opens a fresh chat. If a separate task asks for future operational diagnostics, note Apache's optional public staging marker 404 but do not confuse this with deployed version/QA (signed provenance and 15/15 live category acceptance independently PASS).

## Second category migration FINAL checkpoint — 2026-11-12
Status: DONE — original products and menu categories migrated, data verified, Astro production deployed, browser QA passed.

Two source menu trees:
1. `/danh-muc/hoa-chat-bo-sung-va-thuoc-dac-tri/` (122 products), descendants:
   - `giai-quyet-van-de` 50
   - `hoa-chat-giup-tang-mau-cho-san-ho` 48
   - `vi-sinh-va-thuc-an-vi-sinh` 20
2. `/danh-muc/thuc-an-cho-ca-va-san-ho/` (32 products), descendants:
   - `thuc-an-cho-ca` 8
   - `thuc-an-cho-san-ho` 24

There are **142 unique original products** across both roots (12 in both), and 7 category archive routes. Read-only source inventory #43188424042 PASS 142/142 details, artifact 13929359331; original taxonomy mapping #43190056717 PASS, artifact 13931210653; original gallery inventory #43190056695 PASS 26/26 multi-image source products, artifact 13929634487.

WooCommerce importer #43190333150 PASS: 136 existing brand-migrated products retained; appended only missing verified category terms, without duplicate creation or unrelated mutations. Six missing genuine products created and read back ID 83065, 83067, 83069, 83071, 83073, 83075. Importer errors=0 and deferred media=0; artifact 13931032760.
Original new product galleries #43192517112 PASS: 3 gallery updates, zero errors/deferred.
An initial parity check correctly detected source detail-page pricing ambiguity; independent **source archive card price oracle** #43193282489 PASS for all 142 products across 28 pages, no conflicts/missing, artifact 13932255797. Scoped price/stock repair #43193881201 PASS, checked 142, updated 38, unchanged 104, errors=0, backup snapshots artifact 13932311847.
Final strict independent WooCommerce parity #43196539609 PASS 142/142 (0 missing, 0 incorrect category, price, stock, media, archive counts, SEO review).
Strict new-gallery image identity/order parity #43196767915 PASS 3/3, zero failures.
Script source checks #43196721265 PASS.
Canonical signed production Astro deploy run **#43197389986 SUCCESS**; used existing pipeline `.github/workflows/marineaqua-production-deploy.yml` via `repository_dispatch wp_trigger_build`; source `ngocnhanvo/marineaqua-astro@master`, signed deployed SHA `4a3f0dfbe75d5632dd1a3f28d728e6eeb7ba31f3`; FTPS and signed activate succeeded. Astro code did not need a separate page component: dynamic ProductsSSRPage already handles category routes.
Final release + live Playwright run **#43197072498 SUCCESS**: parity repeated PASS 142/142 and gallery PASS 3/3; signed provenance and both new root archive visible-count readiness PASS; production browser QA **PASS 17 route/check records, zero errors**, tested all 7 source-count listing routes, last pages, red price text, image loaded, product detail links, mobile dropdown and overflow plus existing brand regression (246 root / 88 Korallen-Zucht).
Artifact final run: 13933658202, name `marine-aqua-two-category-release-verification`.
Live category routes are `https://marine-aqua.io.vn/san-pham/<category-slug>/` for all seven slugs above. No need to rerun import, price repair, gallery, build or deploy for this task.
Public `/marineaqua-staging-build.json` returns 404 under Apache; the signed deployed SHA/log and both live root route counts are the approved reliable fallback, verified PASS.
- Production: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43197389986
- Final acceptance: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43197072498

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
