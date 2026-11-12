# Marine Aqua — current catalog migration checkpoint (2026-11-12)

## Repository identity and policy
- Knowledge `ngocnhanvo/knowledge@main`, Astro `ngocnhanvo/marineaqua-astro@master` (latest source 4a3f0dfbe75d), PHP `ngocnhanvo/marineaqua-php@master` (unchanged), Actions `ngocnhanvo/marineaqua-actions@main`.
- Build policy: `auto-build`; source gateway `bypass`. Only canonical production workflow `marineaqua-production-deploy.yml` via `repository_dispatch` `wp_trigger_build` (site_domain marine-aqua.io.vn). Do not create another deploy pipeline.
- Prior sticky-bottom removal and homepage 20 product import are DONE. Do not repeat.

## User's current request
Migrate every product from original `https://marine-aqua.vn/danh-muc/thuong-hieu/` and its children to destination WooCommerce, then finish published Astro category product listing. Finish until verified, do not stop after a partial step.

## Independently verified source
- Original listing: 21 pages, 246 unique source products (run #43159747154, artifact 13916664620).
- Product metadata: 246/246 pages, 0 source errors; 20 initially present, 226 initially missing (run #43160118825, artifact 13917609900).
- Brand taxonomy mapping: 246/246 source products assigned correctly; 232 from 14 child archives, 14 verified parent-only (run #43163059058, artifact 13918288250).
- Original gallery: 64 product pages with extra thumbnail elements, gallery capture PASS 64/64 (run #43168972457 artifact 13920814186); verified 78 distinct additional full-size assets on 39 products after deduplicating repeat thumbnails.
- Identical filename collision audit: all 5 same-name/different-path source main media groups are SHA256-identical, safe reuse only after hash comparison (run #43170501664 SUCCESS).
- Original source has 197 products with no SEO meta description, 5 sale-price cases and one price marked Liên hệ.
- WooCommerce SEO probe run #43169954769: checked 133 products at scan time, 113 matched Yoast title/description; 20 older products need source Yoast title correction, 0 source-present meta description mismatch.

## Product import — active runs
- Initial 3 batches created 11 + 7 + 12 = 30 new products, all readback PASS for created entries; the first two runs were overall partial due media URL and transient GET failures, third #43164685512 SUCCESS.
- Main full-batch importer run **#43165656463** has been in progress since 2026-11-12 06:05Z. Do not run another importer concurrently.
- Recovery importer run **#43170661626** is currently PENDING under the same concurrency group. It will run after main import and reread all WooCommerce products, importing only missing slugs. Added safe identical-filename SHA verification in `scripts/marineaqua-import-brand-batch.mjs`, commit f13a8d8. Watch both runs and artifact; do not assume final count until readback.
- Concurrency group `marine-aqua-woocommerce-brand-import`, `cancel-in-progress:false`. GitHub replaces older *pending* runs within a group when a new one arrives. Earlier gallery run #43169467713 and earlier SEO run #43170262854 were cancelled **while pending, with zero writes** due replacement. They must not be mistaken as successful.

## Sequential controlled workflow chain (new)
1. On successful **recovery importer #43170661626**, `.github/workflows/marineaqua-brand-gallery-import.yml` is triggered by workflow_run and pinned to its ID. It restores verified unique full-resolution galleries via native WordPress Media Library with SHA reuse and readback. It uses the same writer concurrency group. Source gallery artifact 13920814186.
2. On successful gallery workflow completion, `.github/workflows/marineaqua-brand-seo-repair.yml` runs automatically (workflow_run), fixing source-verified Yoast title/description only, preserving source-missing fields and snapshotting rollback before PUT. Same writer group.
3. On successful SEO repair, `.github/workflows/marineaqua-brand-release-after-gallery.yml` runs parity on 246 products, full gallery identity/order and then dispatches the existing production Astro workflow using GitHub REST. It waits for unique run ID, build completion, revision marker, then runs Playwright postdeploy QA. This is an orchestrator, not another deploy implementation.
4. Release source syntax CI #43170868878 PASS (all involved scripts `node --check`).

## Astro source (not deployed yet)
- Astro master latest 4a3f0dfbe75d includes real category URLs `/san-pham/thuong-hieu`, `/san-pham/korallen-zucht`, updated modern listing grid/red prices, and 301 redirects for legacy `/thuong-hieu` routes. Source CI #43167563741 SUCCESS; production-equivalent no-deploy build #43166554927 SUCCESS. **Production deploy has not been triggered for these changes**.
- Old live route audit #43165890354: /san-pham/thuong-hieu 200, /san-pham/korallen-zucht 200 but zero cards prior to migration, /thuong-hieu roots 404. After deploy verify 301 and actual product counts, pagination, mobile, image and detail links.

## Next actions
- Monitor full importer #43165656463, then recovery importer #43170661626. If recovery FAIL, inspect artifact/errors, fix importer and pin gallery gate to final new recovery run; preserve already created products.
- Confirm gallery and SEO chain fully success, resolve any failures. If a workflow does not fire, investigate workflow_run chaining and trigger via approved repo Actions route.
- Check release gate and exact production run. Only after PASS validate /san-pham/thuong-hieu count 246, child listing, source parity, gallery, title metadata and screenshots.
- Never claim DONE based on source CI or partial imports; save all run links and commits.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
