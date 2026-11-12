# Marine Aqua — latest response checkpoint (2026-11-12)

## Branch and repository contract

- Knowledge `ngocnhanvo/knowledge@main`: `945d1dc265ee`.
- Astro production source `ngocnhanvo/marineaqua-astro@master`: `448aebfaccc62859e870edf3c182138802d96da9`.
- WordPress `ngocnhanvo/marineaqua-php@master`: `54574851f0ea` (not edited).
- Actions `ngocnhanvo/marineaqua-actions@main`: checkpoint new commit following `1399e16cd7b5ad79b059601fc954234e4649abd9`.
- Code mode `auto-build`; source gate `bypass`; production builds exclusively via WordPress Build Website -> `repository_dispatch` in Actions.
- Prior mobile sticky-bottom removal and 20 homepage product imports already DONE. Do not redo.

## Current task — Original BRAND - HÃNG SẢN XUẤT catalog

Transfer all products of `https://marine-aqua.vn/danh-muc/thuong-hieu/` and child category archives into target WooCommerce, then finish real product-list pages for corresponding category links.

- Original inventory PASS: 21 category listing pages, 246 unique source URLs.
  Workflow https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43159747154; artifact 13916664620.
- Full detail inventory PASS 246/246 with 0 errors. Target initially had 20 valid matching products; 226 missing.
  Workflow https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43160118825; manifest artifact 13917609900.
- All 246 source products mapped to correct target taxonomy: 232 via 14 brand archives, 14 parent-only via actual source product class taxonomy. 0 unassigned, 0 unexpected.
  Workflow https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43163059058; mapping artifact 13918288250.
- 197 source product pages genuinely lack SEO meta description. Preserve absent status, do not fabricate. Some products have sale prices and one has "Liên hệ".
- Source media must remain under /wp-content/uploads/ with original filename, and reused media must pass SHA256; do not blindly reuse by filename.

## Real WooCommerce import (verified)

- First bounded run #43163417568: 11 successfully created/readback products (one relative URL media reuse failure), run overall FAIL; artifact 13919575375.
- Second bounded run #43164157488: seven additional successful created/readback products, 5 transient GET socket resets, overall FAIL.
- Third bounded run #43164685512: PASS, 12 created/readback products, no errors or deferrals. Transient GET errors now retried with limit, never automatically retry a POST.
- Last fully confirmed count: **30 NEW** products + 20 pre-existing = 50 target matches, 196 source products still missing.
- Full remaining import `scripts/marineaqua-import-brand-batch.mjs` BATCH_LIMIT 250, timeout 240min, running:
  https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43165656463
  **Do NOT start a duplicate importer while this run is in progress.**
  Strictly wait for its final completion, inspect `marine-aqua-brand-import-batch` artifact and logs, reconcile any new IDs/errors, then audit actual WooCommerce state. It may already create products while in progress.
- Current importer imports original MAIN image only, not full galleries; descriptions use source text converted to paragraphs. Complete fidelity/parity assessment is still outstanding; do not claim perfect copy.

## Astro category listing route work (source-only)

- Before code change, production route audit #43165890354 established `/thuong-hieu/` and `/thuong-hieu/korallen-zucht/` 404, while `/san-pham/`, `/san-pham/thuong-hieu/`, `/san-pham/korallen-zucht/` 200. Child /san-pham/korallen-zucht had 0 products on old deployment.
- Astro source updated on master:
  - `src/lib/wordpress/products/categoryRoute.ts` changes product category href to existing /san-pham/<categorySlug> instead of broken /thuong-hieu/<brand>.
  - `src/astro/pages/ProductsSSRPage.astro` modern ocean-blue cards, red prices, stock, proper image fit, better category scope and responsive grid.
  - `src/pages/thuong-hieu/[...slug].astro` redirects obsolete brand URLs with 301 to valid /san-pham routes.
- Source CI #43166369289 SUCCESS, no deploy.
- Production-equivalent build QA (no deploy) #43166554927 SUCCESS, from latest Astro master source, real WordPress data.
- **No production deployment of new Astro listing changes yet**. Wait for verified completion of current import; then use sanctioned WordPress Build Website trigger and post-deploy Playwright QA.

## Next tasks in strict order

1. Await import workflow #43165656463 final result. Parse logs and artifact; confirm all created ID/readbacks and no unresolved errors. If partial, rerun only missing products using the existing idempotent importer, not a duplicate concurrent job.
2. Read-only audit complete target WC products vs 246 source URLs, source prices and taxonomy; count unmatched, missing media/SEO and verify URL-based identity.
3. Assess full original gallery/description fidelity; migrate/repair deficits with bounded verified updates if required.
4. Build/deploy Astro **only** via the approved WordPress Build Website route once data parity sufficiently verified. Do not directly trigger FTP deployment.
5. Post-deploy Playwright QA: /thuong-hieu 301, /san-pham/thuong-hieu root listing, /san-pham/korallen-zucht child list/pagination, product detail links, correct red price, image rendering, mobile and desktop.
6. Save final checkpoint with exact commits/workflow evidence. Do not repeat previously completed work.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
