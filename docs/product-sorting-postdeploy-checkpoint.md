# Marine Aqua — Product sorting and search postdeploy QA (2026-11-13 ICT)

Project: `marine-aqua.vn`  
Frontend: https://marine-aqua.io.vn  
WordPress: https://admin.marine-aqua.io.vn  
Source: `ngocnhanvo/marineaqua-astro@master`; backend: `ngocnhanvo/marineaqua-php@master`; execution: `ngocnhanvo/marineaqua-actions@main`.

## Verified current production state

- Astro source HEAD: `08832a4ba0f2a62853123b766b7bb3985f98d266` — *Remove sticky product search toolbar*. The earlier product sorting commits `9f280436c0`, `13c72ffd75`, `d6ca7bc3e8` remain ancestors.
- WordPress/PHP source HEAD: `d4013371fbfaa072ad2508a0dfe6d5163a578052` — snapshot-safe paging and backward compatibility already released; DO NOT revisit previously completed product-log deletion/ack mechanism.
- Astro production run [#43282741889](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43282741889) completed SUCCESS, source commit `08832a4ba0f2a62853123b766b7bb3985f98d266` confirmed in job log. `ASTRO_BUILD_COMPLETE=PASS`, `FTPS_UPLOAD=PASS`, `SIGNED_UNZIP_SUCCESS`. It followed approved GitHub-only bridge run [#43282693630](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43282693630).
- Prior sorting build [#43280720740](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43280720740) also SUCCESS with source SHA `d6ca7bc3e897f346f319090ab1ece5271de6688a`.

## Newly added regression coverage — completed

- Actual Actions source edit: `scripts/marineaqua-product-pagination-live-qa.mjs`, commit [`41347f9abad0`](https://github.com/ngocnhanvo/marineaqua-actions/commit/41347f9abad00f61c3ef147d8c5c7a3b75c6cd8f). Existing read-only workflow reused, no additional build/deploy pipeline.
- Playwright read-only production run [#43283106067](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43283106067): **attempt 1 SUCCESS**, then **attempt 2 SUCCESS after newest Astro deployment**.
- Attempt 2 validated: `MARINEAQUA_PRODUCT_SORT_NAME_ASC=PASS`, `NAME_DESC=PASS`, `PRICE_ASC=PASS`, `PRICE_DESC=PASS`, `SORT_SEARCH_PAGING=PASS`, `SORT_MOBILE=PASS`.
- Sorting compared cards across page 1 and page 2, not just within one page. Search form and pagination retained active sorting; changing sort retained the search query; 390px mobile did not overflow. Desktop/mobile screenshots and JSON report uploaded under artifact `marineaqua-product-pagination-live-qa`.
- Existing assertions still passed: paged API snapshot, legacy endpoint compatibility (`355` logs observed), live desktop/mobile homepage.
- QA only performed GET/browser actions. No WordPress writes, coupon changes, source Astro/PHP changes, log cleanup, production build trigger or redeploy from this QA.

## Scope and next non-duplicate work

- Product sorting/search/pagination **postdeploy verification DONE**.
- Latest Dispatch Bridge generalization to `template-actions` and Knowledge is already DONE (recorded in `chatgpt/latest-response.md` prior response); do not repeat.
- Broader website work remains scoped separately. The previously owner-deferred CLS performance issue should not be treated as an authorized immediate change. Inspect up-to-date run/commit/checkpoint and explicitly assigned work before starting the next change.
- Release status uses strict stages: build PASS, signed deploy PASS and live QA PASS only for the observed changes.
