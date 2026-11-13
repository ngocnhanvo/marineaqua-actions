# Checkout COD / payment methods checkpoint

## Scope and baseline

User request: hide OnePayUS and add **Thanh toán khi nhận hàng** in its checkout position, with COD processing as in aquathanhxuan.com. Existing bank transfer remains offered.

- Project: marine-aqua.vn; source gate `bypass`; code mode `auto-build`.
- Knowledge main: `1b5aab9e2f8b2fccb42947a74a48df6d9761570f`, unchanged.
- Previous `docs/commerce-header-checkpoint.md`: DONE. Alignment, Header categories, checkout billing and shipping-fee work must not be repeated.
- Astro baseline/current: `0002be54d57405c08ad819b66ed4882fdeedeb9e`.
- PHP baseline: `f7d63f5b0b83c779f7ffd3f05c7185e5e806a3f6`.

## Reference and implementation decisions

Read-only reference source:
- `ngocnhanvo/aquathanhxuan-astro@master`: `a41f9af898f11ca7dbf357aeb1f972d34efaf7db`.
- `ngocnhanvo/aquathanhxuan-php@master`: `f7d743c41bc7f6e54bfc594ed39396a2792e5a28`.
- Aqua enables the real WooCommerce COD gateway and calls native `process_payment()`. It publishes COD as the first/default option and maps the native receipt to the storefront.
- Marine already renders enabled WooCommerce metadata (ID/title/order), validates gateway availability before account/order writes, calls native payment processing, maps the receipt and clears browser cart state only on confirmed success.
- Therefore configure real WooCommerce COD enabled/title/order and disable OnePayUS; retain existing BACS. No fake gateway, frontend-only renamed option, extra checkout API, or hardcoded payment list.
- Unlike Aqua's frontend COD-only whitelist, Marine keeps its existing dynamic WordPress-owned payment list and bank transfer. Aqua's separate attempt/replay implementation is not transplanted in this narrowly scoped gateway change; existing Marine uncertainty/submission guards remain.
- Both projects vendor the same native WooCommerce COD class, blob `e131cc670ff7c58c572f4e24e301bac048ff9a70` (WooCommerce 11.1.0). Positive COD uses native processing/on-hold status without calling payment_complete; zero-total behavior remains native. Native stock hooks remain responsible for stock transitions.
- Native COD clears the server cart only when its hash matches the order. Marine's custom callback previously omitted this binding. The minimal PHP fix sets the order cart hash before saving/processing, preserving native protection against clearing a changed cart.

## Source / release

- PHP source commit: `d1361c8f5abeae239cea70fb09dc57693acd0c2d`; non-force expected-SHA update and exact file readback verified.
- `wp-content/themes/vibe-code-theme/inc/checkout/checkout_endpoint.php`: 3 added lines, including `$order->set_cart_hash( $cart->get_cart_hash() );`.
- `tests/checkout-preflight.test.php`: 2 added fixture/assertion lines.
- Actions contract/gate commit: `abc9b22cd8966765d09fcc9fff840f25579060dd`.
- Existing PHP production workflow now runs `scripts/marineaqua-checkout-cod-contract.test.php source-php` before FTPS upload, in addition to its existing regressions. The new test executes the actual vendored COD class with bounded storage/cart/order doubles; no WordPress bootstrap, live order, account, payment or email.
- Nine groups: positive COD and matching-cart cleanup; downloadable on-hold; native status filter; zero-total completion; mismatched-cart retention; disabled OnePayUS before mutations; unavailable COD before mutations; BACS delegation; uncertain post-order failure without retry/cleanup.
- Release request commit: `efd487dff038a314f347b718ce165603cb156623`; `dispatch-requests/20261113T144126Z-checkout-cod-php.json`.
- Bridge [43445147676](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43445147676).
- PHP release [43445193201](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43445193201), job `131952701305`.
- No Astro source change is needed: checkout reads current WooCommerce gateway settings at request time.

## Current checkpoint

**IN PROGRESS — PHP checks passed their workflow step; release still running.**

Next, in order:
1. Wait for exact PHP release success; inspect native COD regression output and FTPS hash readback.
2. Commit/run scoped `marineaqua-checkout-payments.mjs` and workflow only after PHP release passes. Writes restricted to COD enabled/title/order and OnePayUS enabled; BACS/unrelated settings are fingerprinted unchanged. Before/after readback and bounded conditional rollback are mandatory.
3. Commit/run existing live cart/checkout QA with `--scope=checkout-payments`, desktop 1366 and mobile 390. Every checkout POST and synthetic receipt is intercepted; no real orders or customer accounts.
4. Verify screenshots, cleanup each owned temporary cart with zero-item readback, and record final workflow/artifact evidence.
5. Save final checkpoint and exact `chatgpt/latest-response.md` before final response.
