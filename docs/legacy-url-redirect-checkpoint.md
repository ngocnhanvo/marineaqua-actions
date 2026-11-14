# Marine Aqua legacy URL redirect and sitemap checkpoint

Date: 2026-11-14

## Final acceptance

<badge>Production + browser QA PASS</badge>

- Astro source: `ngocnhanvo/marineaqua-astro@master`
- Final source SHA: `bf816302f00ff5a5ef3f82146f12ffaf0ac4799a`
- Latest production deploy: [Actions run 43623801084](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43623801084) — SUCCESS
- Final production Playwright QA: [Actions run 43623940629](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43623940629) — SUCCESS
- Final browser report: `MARINEAQUA_PRODUCT_ACTIVE_QA=PASS`, 91 checks, 0 failures, 0 errors.
- Desktop and mobile both verified the legacy shop Page redirect and public sitemap.
- All 33 original product-category URLs discovered from the old WordPress `product_cat-sitemap.xml` return HTTP 301 and their destinations return HTTP 200.
- Final QA covers 46 sampled legacy redirects across desktop/mobile, 33 original category URLs, 2 sitemap checks, 2 accent-insensitive product searches, 6 archive checks and 2 detail-page checks.

## Completed redirects

### Product categories

- `/danh-muc/{category-path}` resolves the final category slug against the live WordPress product-category inventory and redirects to `/san-pham/{category-slug}`.
- Category pagination is preserved as `/san-pham/{category-slug}/{page}`.
- Query parameters are preserved.
- Retired products are mapped to their closest live category only when that destination category exists.
- Legacy tag archives either map to a source-backed live category/page or to product search.
- The former `/bai-viet` archive redirects to the WordPress-owned Knowledge archive.

### Original WooCommerce shop Page

The remaining source URL `/818641-2` was resolved from the old WordPress source:

- Old WordPress Page ID: `818641`
- Old slug: `818641-2`
- Published status: `publish`
- Empty title and no H1/description; the rendered page is the original product-category/shop archive.
- The current WordPress replacement is Page ID `82495`, slug `san-pham`, ACF `action=ProductsSSRPage`, `key=ssr-products`, locale `vi`.
- Added a guarded 301 alias from `/818641-2` to the live ProductsSSRPage route `/san-pham`, preserving query parameters.
- Offline test verifies the alias is enabled only when a real ProductsSSRPage route exists.
- Final live QA verified `/818641-2?utm_source=legacy` → HTTP 301 → `/san-pham?utm_source=legacy` HTTP 200 on desktop and mobile.

## Sitemap fixed

Root cause was WordPress SEO Files configured to `manual` mode with a manual XML containing only one URL and no extra/exclude entries. The Astro build already generated a WordPress route inventory, but manual mode intentionally bypassed it.

Safe CMS change:

- Before: `sitemap.mode=manual`, 169-byte manual XML, 1 `<loc>`.
- Used the native WordPress SEO Files admin UI to switch only the sitemap mode to `auto`.
- Preserved the existing extra/exclude URL lists (both empty).
- WordPress plugin exposed its native restore action after saving; the previous manual XML was backed up by the plugin before the option changed.
- After: `sitemap.mode=auto`, manual XML no longer used.
- No robots.txt or llms.txt settings were changed.

Production build evidence:

- Astro logged `Sitemap route inventory: 548 WordPress routes`.
- Astro converted the WordPress SEO Files source and packaged the generated sitemap.
- Public production `/sitemap.xml`: HTTP 200, XML `urlset`, 54,? KB, 548 `<loc>` entries.
- Final Playwright QA verified 548 entries on both desktop and mobile.

Related runs:
- Initial automatic sitemap release: [43620696205](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43620696205) — SUCCESS.
- Latest release including the `/818641-2` redirect: [43623801084](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43623801084) — SUCCESS.
- Final browser acceptance: [43623940629](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43623940629) — SUCCESS.

## Original inventory baseline

Read-only source/target inventory: [43622590715](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43622590715).

- Old sitemap: 660 URLs.
- Old WordPress REST: 366 products, 13 Pages, 133 Posts, 39 product categories and 1,775 product tags.
- Current WordPress REST route inventory: 672 routes.
- 153 changed legacy paths received destination candidates in the inventory.
- 506 paths already existed with the same path.
- The sole previously unresolved URL `/818641-2` is now resolved to `/san-pham`.
- No unresolved legacy URL remains in this scoped inventory.

## Source and Actions checkpoints

- Astro `master`: `bf816302f00ff5a5ef3f82146f12ffaf0ac4799a`
- Actions release request / deploy completed in run `43623801084`.
- Final QA workflow commit: `96a6402526d3c0dce91155ba13c8f4f149369f8e`
- Do not rerun the completed release unless source changes again.

## Final state

- 301 legacy product category and retired product redirects: PASS
- Legacy shop Page redirect: PASS
- WordPress SEO Files auto mode: PASS
- Public sitemap count 548: PASS
- Desktop/mobile Playwright: PASS
- Remaining unresolved URLs from this audit: 0
