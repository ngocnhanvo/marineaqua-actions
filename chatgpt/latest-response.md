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

## CURRENT NEW USER REQUEST — supplements/probiotics/medicines + fish/coral foods (2026-11-12)
Status: PARTIAL (the previous BRAND 246 migration remains DONE; DO NOT rerun it).
User requests all original products and category listings for two menu roots:
- `/danh-muc/hoa-chat-bo-sung-va-thuoc-dac-tri/` and children `giai-quyet-van-de`, `hoa-chat-giup-tang-mau-cho-san-ho`, `vi-sinh-va-thuc-an-vi-sinh`.
- `/danh-muc/thuc-an-cho-ca-va-san-ho/` and children `thuc-an-cho-ca`, `thuc-an-cho-san-ho`.
Original browse run #43188424042 SUCCESS, artifact 13929359331:
- Chemical root 122; children 50,48,20.
- Food root 32; children 8,24.
- 142 unique products across both roots (12 belong to both), all 142 detail pages read without errors.
- Target WooCommerce 246 products initially, 136 of these 142 were already present from prior brand migration, only 6 new product records required.
Taxonomy mapping #43190056717 SUCCESS, artifact 13931210653, 142/142 assigned to seven existing target product_cat terms.
Original gallery inventory #43190056695 SUCCESS, artifact 13929634487, 26/26 multi-image products checked.

Repository Actions scripts/workflows prepared:
- `scripts/marineaqua-two-category-inventory.mjs`, `.github/workflows/marineaqua-two-category-inventory.yml`.
- `scripts/marineaqua-two-category-mapping.mjs`, `.github/workflows/marineaqua-two-category-mapping.yml`.
- `scripts/marineaqua-two-category-import.mjs`, `.github/workflows/marineaqua-two-category-import.yml`. Existing 136 products are NOT duplicated; append only missing taxonomy to their existing terms, preserve existing prices/media/SEO. Import only 6 genuinely missing products via native WordPress media with readback.
- `scripts/marineaqua-two-category-gallery-source.mjs`, source workflow.
- `scripts/marineaqua-two-category-gallery-import.mjs`, workflow gates on successful importer and restores original multi-image galleries only for NEW products.
- `scripts/marineaqua-two-category-parity.mjs`, `scripts/marineaqua-two-category-gallery-parity.mjs`, `scripts/marineaqua-two-category-postdeploy-qa.mjs`, `scripts/marineaqua-two-category-release-trigger.mjs`, `.github/workflows/marineaqua-two-category-release.yml` prepared (release is workflow_dispatch-only, NOT triggered until import/gallery pass).

First importer #43190095337 failed only fetching artifact via Python urllib redirected signed asset (401), BEFORE any CMS writes. Fixed to pinned approved curl+zipfile artifact retrieval; NEW importer run #43190333150 is currently in_progress as of latest check, code executing actual Woo updates.
Gallery workflow `marineaqua-two-category-gallery-import.yml` is armed via workflow_run importer SUCCESS; currently source gallery manifest pinned.
Next: wait importer #43190333150 to conclude; inspect result/log/artifact for created6, existing taxonomy updates136, errors0. Repair any errors safely, no duplicate products. Wait new gallery importer workflow and inspect result. After data parity PASS, enable push trigger on `.github/workflows/marineaqua-two-category-release.yml` (workflow_dispatch only now) and run canonical Astro production dispatch via its guarded source script, verify signed SHA and live category counts, Playwright QA on all seven routes/pagination/mobile. Update this checkpoint as DONE only after production QA PASS.
Production Astro source remains `ngocnhanvo/marineaqua-astro@master` commit `4a3f0df...` and generic `ProductsSSRPage.astro` already handles product-category SSR routes; no separate card markup needed. Only canonical Actions production deploy workflow `marineaqua-production-deploy.yml` permitted.
Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
