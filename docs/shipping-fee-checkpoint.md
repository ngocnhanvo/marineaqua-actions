# Shipping fee notice in Cart and Checkout — DONE

Updated: 2026-11-13 19:55:15 +07:00 (Asia/Ho_Chi_Minh)
Project: marine-aqua.vn
Production: https://marine-aqua.io.vn
Code mode: auto-build
Source gate: bypass

## Completed request

Both Cart and Checkout now display “Phí giao hàng: Thỏa thuận” immediately before the total. “Thỏa thuận” is an underlined link that opens the existing shipping information Page in a new tab.

- Existing WordPress Cart Page: 83449, key ssr-cart, action CartPage.
- Existing WordPress Checkout Page: 83451, key ssr-checkout, action CheckoutPage.
- Existing shipping information Page: 83273, key information-thong-bao, locale vi, current slug thong-bao, title “Phí ship hàng”.
- Resolver uses the real Page key, matching locale and published slug with linkNavigation. It does not substitute a fallback URL.
- Link uses target="_blank" and rel="noopener noreferrer"; no SPA navigation class.
- Shared ShippingFee.astro renders directly in the Cart summary and in an inert template for Checkout. Each client summary refresh clones exactly one row into its slot before the total.
- Shared presentation copy is in cart.json (vi/en). The existing monetary calculations, cart state, APIs and payment behavior were preserved.

## Source and production release

Astro source: ngocnhanvo/marineaqua-astro@master
Commit: 2668d2876f29775e5f552c05aa595daa15903f25

Changed files:
- src/astro/components/Cart/ShippingFee.astro
- src/astro/pages/CartPage.astro
- src/astroutils/CheckoutPage/InfoForm.astro
- src/data/i18n/cart.json

Release request:
- dispatch-requests/20261113T124750Z-shipping-fee-astro-release.json
- Actions commit 323f995b4b0655866aa56182e9b7647894552c50
- Bridge https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43428236092 — SUCCESS.
- Production https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43428285052 — SUCCESS, job 131895056785.
- Logs confirm source 2668d287 and ASTRO_BUILD_COMPLETE=PASS, ASTRO_OUTPUT_VALIDATION=PASS, FTPS_UPLOAD=PASS, SIGNED_UNZIP_SUCCESS.
- Existing production pipeline, branch policy, environment, deployment target, activation and rollback remain unchanged.

## Live browser verification

- QA source: ngocnhanvo/marineaqua-actions@main, commit e14192b644f7e9455443ba1a46f9d06926662b23.
- Existing cart/checkout workflow now invokes its explicit --scope=shipping-fee option. Running the script without that option still runs the previous full suite; its original full-flow assertions and cleanup are retained.
- Run https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43428684792 — SUCCESS.
- Job 131896387607; report scope shipping-fee; 16/16 checks PASS; errors [].
- Desktop 1366×900 and mobile 390×844: one notice row, exact labels, correct order before total, text fits, no horizontal overflow.
- Four actual link clicks (Cart and Checkout on both viewports) opened https://marine-aqua.io.vn/thong-bao with HTTP 200 and H1 “Phí ship hàng”. All new tabs had window.opener === null; original tab URL and cart identity were preserved.
- UI subtotal/discount/tax/total matched CoCart readback before and after opening the link.
- Checkout quantity was updated from 1 to 2 on each viewport; the previous row was detached and exactly one fresh notice remained, with the correct link and recalculated server totals.
- Four screenshots reviewed: desktop/mobile Cart and Checkout. Row typography, alignment and placement before total are correct; the existing floating contact widget behavior is unchanged.
- No checkout POST attempted, no orders or customer accounts created.
- Two temporary carts cleaned; each readback confirmed remainingItems: 0.
- Artifact 14037479615, cart-checkout-live-qa; ZIP SHA256 64998cd5226144601ea1c03d977d6dc2260bad94a72c68329d4ee763b8de48ad.

## Continuation

This shipping-notice request is DONE. Do not rerun the earlier completed full commerce suite (22/22 at run 43398960442) or the Header hover/badge work to resume this task. Their separate checkpoints remain in docs/cart-checkout-checkpoint.md and docs/header-hover-badge-checkpoint.md. No CMS Page creation, native shortcode insertion, label-table migration, payment configuration change or backend release was required for this request.
