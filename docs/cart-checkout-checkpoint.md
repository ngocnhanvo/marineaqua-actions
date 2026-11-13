# Marine Aqua — Cart / checkout checkpoint

Updated: 2026-11-13 (Asia/Ho_Chi_Minh).
Status at this checkpoint: **DONE — final PHP/Astro releases, 22/22 functional checks, transient-cart cleanup, and desktop/mobile visual acceptance verified.**

## Repository scope

- Knowledge: `ngocnhanvo/knowledge@main`.
- Frontend: `ngocnhanvo/marineaqua-astro@master` → `https://marine-aqua.io.vn`.
- Backend: `ngocnhanvo/marineaqua-php@master` → `https://admin.marine-aqua.io.vn`.
- Execution: `ngocnhanvo/marineaqua-actions@main`.
- Code mode: `auto-build`; source gate: `bypass`.
- Never create real orders, submit real payments, create customer accounts, or log cart keys for this QA.

## Completed earlier — do not repeat

| Work | Evidence |
|---|---|
| Cart read API no longer writes empty coupon synchronization | Earlier source checks and production release already completed. Preserve this fix. |
| Real WordPress business Pages | [Bootstrap 43383255104](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43383255104), SUCCESS |
| WordPress native public-to-SSR rewrites | [Rewrites 43384090681](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43384090681), SUCCESS |
| Earlier Astro release of those Pages/routes | [Production 43384322624](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43384322624), SUCCESS; source `a86c6ffa124dbcaad0891189268f0eef00d6a234`; signed activation verified |
| Read-only Page/gateway/plugin inventory | [Inventory 43396043950](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43396043950), SUCCESS |

WordPress IDs already created and verified:

| Page | ID | ACF key | ACF action | Rewrite ID / destination |
|---|---:|---|---|---|
| `/gio-hang` | 83449 | `ssr-cart` | `CartPage` | 83456 → `/ssr/cart/gio-hang` |
| `/thanh-toan` | 83451 | `ssr-checkout` | `CheckoutPage` | 83457 → `/ssr/cart/thanh-toan` |
| `/dat-hang-thanh-cong` | 83453 | `ssr-checkoutdone` | `CheckoutDonePage` | 83458 → `/ssr/cart/dat-hang-thanh-cong` |

Do not rerun bootstrap, overwrite these Pages, or recreate their rewrites. Preserve earlier completed product-migration, active-menu, sharing, and information-page work according to each task's own checkpoint; this commerce continuation does not recertify unrelated work.

## Changes completed in this continuation — do not redo

The following source corrections are implemented, released, and covered by the completed validation below:

- **Guest checkout SSR:** commit `bc03070` guards the absent lost-password Page before dereferencing it. The missing CMS Page no longer causes guest checkout SSR HTTP 500.
- **Frontend cart continuity:** commits `5c12bf3` and final source `af8e12b2402768de31a39f214ac16f9e5f33aa61` preserve the real `cart_key` through both desktop/mobile Header links and direct cart restoration. Actual Header clicks are covered by the browser QA; no constructed cart URL is used to bypass them.
- **Bounded cart loading:** cart GETs have a deadline and an explicit failure state. An unavailable server cart is distinguishable from a genuinely empty cart; error handling retains the user's existing cart state.
- **Actual WooCommerce gateway data:** the server projects enabled gateway metadata for the frontend. Verified enabled options are `onepayus` and `bacs`; the hardcoded inactive PayPal option is removed. Gateway settings and credentials are not sent to the client.
- **Checkout client guards:** terms acceptance, a nonempty cart, matching browser/server cart identity, and a busy submission guard control submission. Definitive HTTP 4xx rejection keeps the cart and permits correction; uncertain HTTP 5xx outcomes keep the cart and submission locked to prevent an immediate duplicate. Both branches are tested with locally intercepted requests.
- **Checkout API/receipt boundaries:** request fields, receipt access, and redirect destinations are validated; client-supplied totals are dropped so server cart/prices remain authoritative. The final Astro commit also includes the receipt syntax correction verified by CI.
- **BACS receipt:** transfer instructions are restricted to pending/on-hold BACS orders, use explicit bank/QR fields, and use a Marine Aqua transfer memo.
- **PHP mutation ordering:** enabled/available gateway, cart validity and stock checks run before order/account mutations. The BACS REST hook is globally loaded instead of depending on CoCart initialization. The final PHP correction preserves HTTP 400 for preflight rejection and returns HTTP 502 after an order-creation attempt, as recorded below.
- **CMS scope:** missing policy and lost-password CMS anchors are omitted. No fabricated policy content, placeholder link destination, or unrelated additional CMS record was created.

Preserve these changes when resuming. Their implementation, release, and current-scope acceptance are complete; do not repeat them as unfinished work.

## First PHP release completed and verified

Source: [`c43d8796ca43bab944fff67aac577d51f9854a43`](https://github.com/ngocnhanvo/marineaqua-php/commit/c43d8796ca43bab944fff67aac577d51f9854a43).

- [Bridge 43396593467](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43396593467), attempt 1: SUCCESS.
- [PHP deployment 43396628847](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43396628847), attempt 1: SUCCESS.
- Verified job: `131789016115` (`wordpress-php`).
- Actions release request commit: `3741e1e7682a744a634c65cf1f57a3b4e10c072c`.
- Request file: `dispatch-requests/20261113T085154Z-checkout-validation-php-release.json`.

Evidence from the completed deployment log:

1. PHP checkout logged the exact source SHA above.
2. PHP syntax checks passed.
3. `CHECKOUT_PREFLIGHT_REGRESSION=PASS`: 18 passing stub scenarios, including gateway eligibility, empty cart, terms, required billing fields, email/phone, WooCommerce cart/stock restrictions, mocked guest order and failed gateway results. No real orders or external test requests.
4. `PAYMENT_GATEWAY_READ_REGRESSION=PASS`: no CoCart dependency; fixture accounts only.
5. Existing image/static delta and build-status regression checks also passed.
6. FTPS TLS, target identity and WordPress document-root checks passed.
7. Two files installed, each with `sha256_verified=PASS`:
   - `wp-content/themes/vibe-code-theme/inc/checkout/checkout_endpoint.php`
   - `wp-content/themes/vibe-code-theme/inc/tools/payment-gateways.php`
8. Nine other allowlisted files were unchanged; `completed=PASS files_checked=11`.
9. `no_astro_build=PASS` and `MARINEAQUA_WP_UNZIP_READY_MARKER=PASS`.
10. Bridge locked the exact PHP run and ended `TARGET_RUN_SUCCESS_NOT_LIVE_QA`.

This certifies the PHP release only. It does not certify the corrected frontend, a real payment, or full browser acceptance.

## Final PHP correction released and verified

After the first release, review found that the general PHP exception handler still returned HTTP 400 even when order creation might already have been attempted. The frontend permits retry after a definitive 4xx rejection, so an uncertain post-creation exception must not be classified as an ordinary preflight validation rejection.

This correction is now deployed from [`9855763bf7319b18c9e36f86db5430ace39e6d66`](https://github.com/ngocnhanvo/marineaqua-php/commit/9855763bf7319b18c9e36f86db5430ace39e6d66): preflight failures remain HTTP 400; exceptions after order creation or an attempted creation return HTTP 502. Regression coverage also verifies that the next request resets to the correct preflight HTTP 400 behavior.

- [Final PHP bridge 43397461444](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43397461444): SUCCESS.
- [Final PHP deployment 43397488195](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43397488195), job `131791895687`: SUCCESS.
- Checkout endpoint installed with `sha256_verified=PASS`; 11 allowlisted files checked.
- HTTP 502 uncertainty handling and subsequent-request HTTP 400 reset regressions: PASS.
- Earlier bridge [43397310529](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43397310529) rejected a request reason exceeding 160 characters **before dispatch**. It did not start a PHP release and must not be mistaken for a failed production deployment.

The earlier `c43d8796` release remains historical evidence; `9855763b` is the current verified PHP release for this task.

## Final Astro source checked and deployment verified

Final frontend source: [`af8e12b2402768de31a39f214ac16f9e5f33aa61`](https://github.com/ngocnhanvo/marineaqua-astro/commit/af8e12b2402768de31a39f214ac16f9e5f33aa61). It includes the preceding frontend corrections and the receipt syntax correction.

- [Astro source checks 43382064682](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43382064682), **attempt 5**, job `131791693354`: SUCCESS.
- 288 tests across 36 test files passed; Astro checks reported 0 errors.
- Deployment request commit: [`37de84a52c0d8454fc214e42a7f3f5ffc3d549ad`](https://github.com/ngocnhanvo/marineaqua-actions/commit/37de84a52c0d8454fc214e42a7f3f5ffc3d549ad).
- Request file: `dispatch-requests/20261113T090022Z-cart-checkout-astro-release.json`.
- [Astro bridge 43397718464](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43397718464): SUCCESS.
- [Astro production deployment 43397778900](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43397778900), job `131792838868`: SUCCESS; exact source `af8e12b2402768de31a39f214ac16f9e5f33aa61` verified.
- `ASTRO_BUILD_COMPLETE=PASS` and `ASTRO_OUTPUT_VALIDATION=PASS`.
- `FTPS_UPLOAD=PASS`: 2,763,841 bytes; archive SHA-256 prefix `5c65244b74c7`.
- `SIGNED_UNZIP_SUCCESS` at **2026-11-13 09:02:42 UTC / 16:02:42 Asia/Ho_Chi_Minh**, configured production destination, `files=7`.
- Release states established: **BUILD_SUCCESS / DEPLOY_READY**. Full browser acceptance is separate.

Public GET verification after activation:

| Page | HTTP | Observed duration | Result |
|---|---:|---:|---|
| `/gio-hang` | 200 | 7.62 s | No Astro error page |
| `/thanh-toan` | 200 | 10.94 s | No Astro error page; `onepayus` and `bacs` options present |
| `/dat-hang-thanh-cong` | 200 | 8.56 s | No Astro error page |

These are individual observed GET durations, not a performance benchmark or proof of a completed payment.

## Live QA and visual acceptance completed

- [Cart/checkout QA 43398099782](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43398099782), job `131793884634`: **SUCCESS — 22 functional checks passed**.
- QA script commit: `93d4e7924245a9608bbb8d437fd5a48bdcfa2f33`.
- Both transient carts were verified empty after cleanup: **2 carts, 0 remaining items**.
- Evidence artifact: [14024295782](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43398099782/artifacts/14024295782); downloaded archive verified before inspection.
- All browser checkout POSTs are intercepted locally. HTTP 422 and HTTP 502 are simulated; no actual checkout POST reaches production.
- Initial screenshot review found a capture-state issue: checkout was captured after form interaction had scrolled the viewport, placing the sticky header in the middle of the full-page image and misaligning some field masks. This historical evidence defect was corrected and reverified below; the first run's 22 functional assertions remain valid.
- The narrow QA-helper correction is committed as `f21d95d234cd7c1f26060be3fc89a1b4cda3fb92`: blur the active element, scroll instantly to the top, await fonts and two animation frames within a deadline, assert zero scroll position, and mask text/password-like fields without hiding radio/checkbox selection. All functional and safety tests remain unchanged.
- [Final QA 43398960442](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43398960442), job `131796728828`: **SUCCESS — 22/22 checks passed**. All recorded navigations returned HTTP 200; the report contains no errors and no real orders. No Astro/PHP change or deployment was needed for the capture correction.
- Final script: `f21d95d234cd7c1f26060be3fc89a1b4cda3fb92`.
- Desktop and mobile each completed cleanup with **0 remaining cart items**.
- Final evidence artifact: [14024162351](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43398960442/artifacts/14024162351). The downloaded ZIP SHA-256 was verified as `5f8abe9facc144ea865d130dd8811fd6d3f01652f4a72ef5aefc1c2d8267e252` before reviewing its contents.
- The root agent visually reviewed **all six corrected screenshots**: desktop/mobile cart, checkout, and uncertain-checkout state. Header placement is at the top, field masks align, radio/checkbox selection is inspectable, layouts are responsive, and enabled versus uncertain-disabled checkout controls display correctly.
- Pink rectangles in the evidence images are deliberate QA field masks, not production styling.
- Horizontal overflow checks passed at **1366 px desktop / 390 px mobile**.
- Acceptance established: **BUILD_SUCCESS / DEPLOY_READY / FUNCTIONAL_QA_PASS / VISUAL_QA_PASS**.

The 22 checks cover simple-product selection; responsive product/cart/checkout layout; actual Header navigation retaining the cart; quantity increases/decreases with server readback; required fields, email and terms; mocked HTTP 422 rejection; mocked HTTP 502 uncertainty and duplicate-submit blocking; cart preservation; keyed GET restoration after simulated uncertainty; item removal and empty-cart blocking; and Buy now navigation.

Final-run navigation observations:

| Navigation | Desktop | Mobile |
|---|---:|---:|
| Cart → checkout | 6.213 s | 6.183 s |
| Buy now → checkout | 8.835 s | 14.112 s |

These are snapshots from the accepted run, not a latency benchmark or guarantee.

## Scope boundary

**DONE applies to the resumed cart/checkout scope only.** The [historical response before this closeout](https://github.com/ngocnhanvo/marineaqua-actions/blob/f21d95d234cd7c1f26060be3fc89a1b4cda3fb92/chatgpt/latest-response.md) mentioned unverified `featured_media` coverage for 133 posts. This commerce QA does not certify that separate historical media coverage or establish that the media task was completed later. Before any future media work, read its own latest checkpoint and verify the actual state instead of inferring completion from this document.

Native ESC label migration is outside the current commerce-continuation request. The Knowledge provision applies when the owner asks for editing these labels in Visual Builder. Do not create a label-migration TODO or use it to block acceptance of the current cart/checkout implementation. WordPress Page identities and native route rewrites remain the verified CMS requirements for this release.

## Completion and test boundary

The authorized continuation is complete. There is no active implementation, release, functional-QA, cleanup, or screenshot-review item remaining for this scope. Do not rerun completed deployments or recreate existing CMS Pages to resume this checkpoint.

Browser checkout POSTs were intercepted locally; HTTP 422 and HTTP 502 results were simulated. Live order creation, real payment processing, customer-account creation/login, and transactional email delivery were not exercised by design. This QA created no real orders, charges, customer accounts, or transactional emails. The passing mock tests certify the frontend's rejection/uncertainty behavior and cart preservation, not a real payment transaction.

Historical live QA failure before the corrected release:
[43384880066](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43384880066), attempt 1, **FAILURE**. Product detail, add-to-cart and cart UI passed; checkout navigation timed out after 60 seconds waiting for DOMContentLoaded. This older failure was superseded by the corrected deployment and the 22 passing functional checks above.

## Release mechanics

Use `marineaqua-actions@main` and the existing bridge; do not add another deploy pipeline.

A real release request is one newly added `dispatch-requests/<unique UTC ID>.json` file in its own commit, with an exact freshly verified source `master` SHA. PHP uses `workflow_dispatch`, workflow `marineaqua-php-release.yml`, ref `main`, and `confirm=DEPLOY_PHP`. Astro uses `repository_dispatch`, event `wp_trigger_build`, and `client_payload.site_domain=marine-aqua.io.vn`; production remains `marineaqua-production-deploy.yml`.

Check for an already active equivalent run first. Never rerun a dispatch-bridge request: attempt >1 is rejected to prevent duplicate dispatch. Follow exact bridge/target run IDs to completion and distinguish `TARGET_RUN_SUCCESS`, signed deploy readiness, and live QA.

## Documentation-only logging trigger audit

At Actions source `93d4e7924245a9608bbb8d437fd5a48bdcfa2f33`, all **102 workflow trigger blocks** were read. **83** workflows accept push events, all with path filters; none matches a `main` commit limited to `docs/cart-checkout-checkpoint.md` and `chatgpt/latest-response.md`.

Astro production accepts `repository_dispatch`; PHP release accepts `workflow_dispatch`. The dispatch bridge matches its own workflow/scripts/tests and `dispatch-requests/*.json`; live cart QA matches its own workflow/script. The later screenshot-helper commit changes the QA script, not these trigger filters. A final commit containing only the two documentation paths therefore triggers no additional workflow, build, or deployment.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất

