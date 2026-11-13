# Cart and checkout — Header categories and alignment checkpoint

## Scope

User request: indent the cart content to line up with the Header menu and restore **Danh mục sản phẩm** on cart and checkout. Reference: `image(20261113-141844).png`. The shopper cart key visible in that screenshot was not reused or copied into the implementation/tests.

- Project: marine-aqua.vn.
- Source gate: `bypass`; code mode: `auto-build`.
- Knowledge main: `1b5aab9e2f8b2fccb42947a74a48df6d9761570f`, unchanged.
- Previous task `docs/checkout-billing-checkpoint.md`: DONE; do not repeat it.

## Root causes and fix

The commerce SSR route already loaded WordPress category data through `getCacheData()`, but omitted `productCategories` when destructuring the result and calling `Layout`. Layout/Header consequently received their default empty category array. The working product archive route passes this same cached property.

The fix passes that existing property through the shared commerce route. No additional category request, hardcoded menu, fallback dataset, menu order change or CMS write is introduced. Existing category exclusions and click/tap behavior remain owned by the shared renderer. The route is also used for receipts; no order or receipt was generated for QA.

Cart and checkout used a generic Tailwind `container mx-auto px-4`, which does not share Header's width rules. Both wrappers now use a stable `data-commerce-container` marker and responsive widths matching the existing design:

| Viewport | Commerce container |
| --- | --- |
| Below 1024 px | Viewport minus 32 px; 16 px side gutters |
| 1024–1439 px | Viewport minus 24 px, matching Header navigation |
| 1440 px and wider | 92.5% width, max 1920 px, matching Header navigation |

Only the two page wrappers and the category prop wiring changed. No global Header CSS, billing fields, cart arithmetic, private SSR cache headers, authentication, environment or deployment architecture changed.

## Source and completed checks

- Astro `master` baseline: `771d37ef5a3614277f6366aa900bff346f271964`.
- Astro source commit: `0002be54d57405c08ad819b66ed4882fdeedeb9e`, non-force expected-SHA ref update and readback verified.
- Changed files: `src/astro/pages/CartPage.astro`, `src/astro/pages/CheckoutPage.astro`, `src/pages/ssr/cart/[slug]/index.astro` — 4 additions / 3 deletions.
- PHP: no edits or release required in this task.
- Astro CI [43382064682, attempt 9](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43382064682), job `131942711294`: SUCCESS on the exact source SHA; **348 tests / 38 files**, Astro check **0 errors / 0 warnings**.
- Production request Actions commit: `c534a63e1ca4d7199a009543f3175149ff597c4a`.
- Existing dispatch bridge [43442497787](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43442497787): SUCCESS.
- Existing production deployment [43442550992](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43442550992), job `131943581528`: SUCCESS. Exact source SHA and actual `ASTRO_BUILD_COMPLETE=PASS`, `ASTRO_OUTPUT_VALIDATION=PASS`, `FTPS_UPLOAD=PASS`, `SIGNED_UNZIP_SUCCESS` markers verified.

## Current checkpoint

**DONE — source committed, production deployed, live QA and visual review accepted.**

Final verification: 2026-11-13 21:33 +07:00 (Asia/Ho_Chi_Minh). Astro master remains `0002be54d57405c08ad819b66ed4882fdeedeb9e`; PHP master remains `f7d63f5b0b83c779f7ffd3f05c7185e5e806a3f6`. CI, dispatch bridge, production deployment and live QA all report completed/success.

### Production QA

- QA source Actions commit: `e2142c539cdf74e1676d7005c846898d6b86e9e7`.
- Existing cart/checkout harness scope: `--scope=commerce-header`; other scopes preserved.
- QA run [43442965685](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43442965685), job `131945029867`: **27/27 PASS**, no errors.
- Desktop 1920 × 1080 / 1366 × 900 and mobile 390 × 844. Measurements match for both cart and checkout:

| Viewport | Commerce left / right / width | Header navigation left / right / width |
| --- | --- | --- |
| 1920 px | 72 / 1848 / 1776 px | 72 / 1848 / 1776 px |
| 1366 px | 12 / 1354 / 1342 px | 12 / 1354 / 1342 px |
| 390 px | 16 / 374 / 358 px | Desktop navigation hidden; 16 px content gutters retained |

- The page heading uses the same edges. Measured desktop mismatch: 0 px. Document content width equals viewport width at all three sizes, with no horizontal overflow.
- Complete ordered nested labels and URLs match the working WordPress-backed archive at [Korallen-Zucht](https://marine-aqua.io.vn/san-pham/korallen-zucht): **16 roots / 38 nodes**, matching desktop/mobile trees and existing category exclusions. This is a comparison with the working public renderer; no WordPress taxonomy/admin writes were performed.
- Cart and checkout menu opening/closing, nested second-click toggling and menu viewport bounds pass at all three sizes. Actual navigation to [Ống nước](https://marine-aqua.io.vn/san-pham/ong-nuoc) succeeds and retains the guest cart.
- Six cart/checkout responses retain `Cache-Control: private, no-store, max-age=0` and `Vary: Cookie,Accept-Encoding,User-Agent`.
- Guards block checkout/auth/order requests and non-cart mutations before navigation. Recorded live authentication requests, checkout POSTs, order requests, real orders and new accounts: **0**. No payment or email action was performed.
- Three isolated transient carts were cleaned; each removed one fixture item and read back **0 remaining items**. The shopper cart shown in the user reference was not used.

### Evidence and visual review

- Artifact `cart-checkout-live-qa`, ID `14046322252`, contains `report.json` and 12 screenshots.
- ZIP size: 3,609,379 bytes. SHA256 verified: `adfc20243e4aa648f9c671bb4216c9940d4c438b48ee57fcdea12e14c9c6683a`. Artifact expiry: 2026-11-27.
- Primary and independent visual review together cover all 12 screenshots: cart and checkout full pages plus opened category menus at all three sizes.
- Visual result: desktop content edges align with Header navigation, mobile content stacks with 16 px gutters, and the restored categories are readable and usable. No material new clipping or overflow observed. Pink areas in screenshots are intentional QA input masks.
- No outstanding work for this request. Previous checkout-billing, account/cart, hover and shipping-fee work remains completed; do not rerun or reimplement without a new requirement.
