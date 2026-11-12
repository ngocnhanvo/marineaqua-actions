# Marine Aqua — latest response

- Checkpoint: 2026-11-12 12:14+07, resume brand-category product migration.
- Astro master: c8eec1c10d1f1b72de45ccdd1c5d4f385366394e (unchanged).
- PHP master: 54574851f0eaea9e40341b36c5a7215573bc436e (unchanged).
- Knowledge main: 945d1dc265ee.
- Actions main: 7920362019bb14970e0643932f0217562632a662 (before this checkpoint).
- Previous sticky-bottom removal was verified DONE, do not repeat.

## Current owner task

Transfer ALL original products belonging to original `BRAND - HÃNG SẢN XUẤT` at
`https://marine-aqua.vn/danh-muc/thuong-hieu/` and descendants to target
WooCommerce `https://admin.marine-aqua.io.vn` and complete corresponding
`https://marine-aqua.io.vn` category product-list pages. This is NOT yet done.

## New verified evidence

- New read-only workflow: `.github/workflows/marineaqua-brand-catalog-inventory.yml`.
- New source script: `scripts/marineaqua-brand-catalog-inventory.mjs`.
- Successful inventory workflow run:
  https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43159747154
- Logs: `BRAND_SOURCE_INVENTORY=PASS listingPages=21 uniqueProducts=246 categoryLinks=144`;
  `BRAND_TARGET_CATEGORY_HTTP=200`.
- Saved artifact `marine-aqua-brand-catalog-inventory`, ID 13916664620,
  manifest.json with 246 unique source product links and source list pages.
- 144 category links are URLs extracted across page sidebars; NOT 144
  verified brand descendants. Normalize/validate subtree before import.
- First workflow run #43159622768 failed on JS regex syntax; corrected in
  commit 7920362; subsequent workflow #43159747154 completed SUCCESS.
- No WooCommerce records were changed; no new Astro deploy performed.

## Previously completed — preserve

- 20 real products for five homepage brands were already imported and bound
  to ESC Tables home_04–home_08 (see docs/homepage-esc-section-checkpoint.md).
- Real products/categories must be reused by source slug/source URL/source ID,
  never blindly duplicated.
- Existing published Product listing Page `san-pham` and SSR route are present
  in repository; verify live behavior against source before changing.

## Exact next steps

1. Retrieve inventory artifact and crawl all 246 source product URLs for
   source ID, title, slug, price, stock, SKU, taxonomy membership, own media
   filenames, SEO title/meta description, and pagination/source snapshot.
2. Read ALL target WooCommerce products and product_cat terms with pagination,
   compare source and target by canonical source URL/source ID/slug, document
   missing records and category mapping, and back up scoped records.
3. Adapt existing native WordPress importer from `scripts/marineaqua-import-home-products.mjs`
   for bounded, resumable product batches and owned media uploads. Enforce
   idempotency, asset deferrals (initial + max 3 retries), original filenames,
   SEO readback and strict write scope.
4. Execute/import only verified missing records; preserve existing 20 and
   existing category hierarchy. Record created/reused/failed with IDs.
5. QA actual brand and child category listing routes, responsive UI,
   pagination, item counts and all navigation; fix SSR/frontend as needed.
6. Run source CI, production no-deploy build, sanctioned production workflow,
   await result and post-deploy Playwright/parity evidence.

## Status

SOURCE_LISTING_INVENTORY_PASS; PRODUCT_DETAIL_INVENTORY_NOT_DONE;
DATA_PARITY_NOT_DONE; IMPORT_NOT_STARTED_FOR_REMAINING_PRODUCTS;
VISUAL_QA_NOT_DONE; PRODUCTION_RELEASE_NOT_DONE.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
