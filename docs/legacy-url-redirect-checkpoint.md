# Marine Aqua legacy URL redirect checkpoint

Date: 2026-11-14

## Scope completed

- Source: `ngocnhanvo/marineaqua-astro@master`
- Final source commit: `dde39c674eb7cdae8c2f3ccea81842c083ed4105`
- Production build: [43620696205](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43620696205) — SUCCESS
- Final exhaustive Playwright QA: [43621203140](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43621203140) — SUCCESS
- Follow-up bounded HTTP QA: [43621425929](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43621425929) — SUCCESS
- QA artifact report: 87 checks, 0 failures, 0 errors.
- All 33 product-category URLs discovered in the old WordPress `product_cat-sitemap.xml` returned HTTP 301 and their destinations returned HTTP 200.
- Desktop/mobile checks also verified the sampled nested categories, pagination/query preservation, retired products, old tag archives, article archive and accent-insensitive product search.

## Redirect behavior

- `/danh-muc/{category-path}` resolves the final category slug against the live WordPress product-category inventory and redirects to `/san-pham/{category-slug}`.
- Category pagination is preserved as `/san-pham/{category-slug}/{page}`.
- Query parameters are preserved.
- Retired products are mapped to their closest live category only when that destination category exists.
- Legacy tag archives either map to a source-backed live category/page or to product search.
- The former `/bai-viet` archive redirects to the WordPress-owned Knowledge archive.

## URL inventory

Read-only inventory run: [43618339702](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43618339702).

- Old sitemap: 660 URLs.
- Old WordPress REST: 366 products, 13 pages, 133 posts, 39 product categories, 1,775 product tags.
- Current WordPress REST route inventory: 672 routes.
- 153 changed legacy paths received destination candidates.
- 506 paths were already present with the same path.
- One non-category URL remains unresolved: `/818641-2`. Do not invent a destination; inspect the old source content before adding a redirect.

## Separate follow-up (not part of category redirect acceptance)

During QA, the public `/sitemap.xml` endpoint returned only one URL even though the build logged 548 WordPress routes. The WordPress SEO Files contract supports both manual and auto modes; the current mode/content has not yet been read back from WordPress. Do not overwrite a manual sitemap or change CMS settings without first verifying the live configuration and comparing its intended URL set. This is separate from the completed 301 category redirect task.

## Next session

1. If continuing the broader legacy URL audit, inspect `/818641-2` on the old source before choosing a target.
2. If continuing SEO sitemap work, read `/wp-json/esc-seo-files/v1/public` using the project Actions secret-backed runner, record `sitemap.mode` and manual XML URL count, then decide whether the one-URL output is intentional or an outdated manual sitemap.
3. Do not rerun the completed production redirect release unless source changes again.
