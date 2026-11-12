# Marine Aqua — latest response

- Checkpoint: 2026-11-12 12:14+07, resume brand-category product migration.
- Astro master: c8eec1c10d1f1b72de45ccdd1c5d4f385366394e (unchanged).
- PHP master: 54574851f0eaea9e40341b36c5a7215573bc436e (unchanged).
- Knowledge main: 945d1dc265ee.
- Actions main: d56d0028f092cb41799d1c6d84467aa5010b97d3 (before this checkpoint).
- Previous sticky-bottom removal was verified DONE, do not repeat.

## Current owner task

Transfer ALL original products belonging to original `BRAND - HÃNG SẢN XUẤT` at
`https://marine-aqua.vn/danh-muc/thuong-hieu/` and descendants to target
WooCommerce `https://admin.marine-aqua.io.vn` and complete corresponding
`https://marine-aqua.io.vn` category product-list pages. This is NOT yet done.

## New verified evidence

- Source listing inventory: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43159747154 SUCCESS, 21 pages and 246 unique product URLs.
- Full source product details + target WC comparison: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43160118825 SUCCESS.
- Full artifact ID 13917609900. 246/246 source products with details read, 0 errors.
- Target WooCommerce: 20 existing products; matched 20 source slugs; **226 source products absent**.
- Target taxonomy endpoint HTTP 200, 39 categories in artifact.
- Source metadata: 197 of 246 do not expose a meta description and must be marked SEO_SOURCE_MISSING (do not fabricate).
- IMPORTANT: the old `.posted_in` selectors found zero product categories on source detail pages. Must extract Woo product_cat CSS classes / source category listing membership or other verified taxonomy before importing.
- Source products contain special prices (sale price/original price) and one `Liên hệ` case. Do not parse all price strings as one integer.
- No import of remaining 226 has been attempted, no additional production deploy.
- New scripts and workflow in actions/main use WordPress credentials only for read-only product GET.

## Previously completed — preserve

- 20 real products for five homepage brands were already imported and bound
  to ESC Tables home_04–home_08 (see docs/homepage-esc-section-checkpoint.md).
- Real products/categories must be reused by source slug/source URL/source ID,
  never blindly duplicated.
- Existing published Product listing Page `san-pham` and SSR route are present
  in repository; verify live behavior against source before changing.

## Exact next steps

1. Fix exact source taxonomy membership capture (current .posted_in extraction is empty), and distinguish product sale/contact/variable prices; validate SEO_SOURCE_MISSING for absent meta description.
2. Validate 226 missing matches by canonical URL and slug, mapping to 39 target taxonomy records; back up scoped records.
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

SOURCE_LISTING_INVENTORY_PASS; PRODUCT_DETAIL_INVENTORY_PASS_246_OF_246;
TARGET_OVERLAP_PASS_20_EXISTING_226_MISSING; TAXONOMY_MEMBERSHIP_UNVERIFIED;
DATA_PARITY_NOT_DONE; IMPORT_NOT_STARTED_FOR_REMAINING_PRODUCTS;
VISUAL_QA_NOT_DONE; PRODUCTION_RELEASE_NOT_DONE.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
