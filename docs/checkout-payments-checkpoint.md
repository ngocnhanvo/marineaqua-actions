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
- Therefore configure real WooCommerce COD enabled/title/order/eligibility and disable OnePayUS; retain existing BACS. No fake gateway, frontend-only renamed option, extra checkout API, or hardcoded payment list.
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

## Verified PHP release

- [PHP release 43445193201](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43445193201), job `131952701305`: **SUCCESS**, exact `d1361c8f5abeae239cea70fb09dc57693acd0c2d` source logged.
- Existing checkout preflight/payment metadata/login regressions and **9 native COD contract groups passed** before upload.
- Actual FTPS markers at 2026-11-13 14:42:58 UTC: TLS/identity/document-root PASS; only `checkout_endpoint.php` installed with SHA256 readback PASS; 12 allowlisted files checked. Ready marker passed at 14:42:59 UTC.
- Existing bridge [43445147676](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43445147676) completed successfully.
- No Astro source or build change: current checkout reads gateway settings for each private SSR request.

## WooCommerce configuration and resolved ordering issue

| Gateway | Final enabled | Final position | Visible checkout label |
| --- | --- | --- | --- |
| COD | true | 33 | Thanh toán khi nhận hàng |
| BACS | true | 35 | Chuyển khoản ngân hàng trực tiếp |
| Cheque | false | 36 | Hidden, unchanged |
| OnePayUS | false | 37 | Hidden |

COD's previous `enable_for_methods = ["free_shipping"]` restricted it to free shipping. It is now the native empty multiselect array (REST projects this as `""`), allowing the existing shipping methods. Global shipping rates/zones and the negotiated-shipping UI were not edited. `enable_for_virtual = "yes"` is retained.

The real write scope was limited to two gateway records:
- COD: enabled, title, order, and `settings.enable_for_methods`.
- OnePayUS: enabled and its separate numeric order.
- BACS received no write. Unrelated visible gateway settings were fingerprinted; BACS also had a full before/after equality check.

### Actual sequence and evidence

1. Initial apply [43445571550](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43445571550) stopped **before writes** when it found a nonempty COD shipping restriction. Changed 0, no rollback required.
2. Read-only inventory [43446066963](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43446066963), source `48c4c5ac2faee88408066e0f919435426968cbab`: PASS, two GETs, no mutations. Confirmed COD disabled/order 37/free_shipping-only, OnePayUS enabled/order 33, BACS enabled/order 35 and Cheque disabled/order 36.
3. Apply [43446505961](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43446505961), source `da30e4760c7b25596f0819d324e02e3ffad8cc90`: COD PUT returned 200 and saved the intended COD settings at order 33. Its following item GET returned 404, so the run correctly failed; rollback could not address the temporarily hidden COD registry item. OnePayUS had not yet been changed.
4. Source inspection found the cause in native `WC_Payment_Gateways::init()`, blob `0630bd1a1ab88048b9a65682b96643c83a3efe6f`: gateway instances are keyed by numeric configured order. COD and OnePayUS at 33 collide, and the later-loaded OnePayUS overwrites COD. Disabled gateways participate too, so merely disabling OnePayUS would not resolve it.
5. Recovery source `0bfbaf76fccb54b3d514c65ab5afe56cca32f7bc`, [43447409305](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43447409305), job `131960375555`: **PASS**. After pinning the observed three-entry registry and free slot 37, it moved only OnePayUS to disabled/order 37. COD reappeared at 33 with the already-saved native settings.
6. Final collection and item GETs all returned 200. All four registry IDs have distinct positions, enabled order is exactly COD then BACS, COD has the requested title and empty restrictions, BACS is unchanged, errors and `cleanup_remaining` are empty.
7. Recovery artifact `14049360684` (`marineaqua-checkout-payments`), workflow-provided SHA256 `739620784291f808fc2c293b2a16e8a3c28d1457bf7344a7617000aada80af06`, expires 2026-11-27. The verified job log contains the same structured result. No artifact-download digest verification has been claimed for this settings artifact.

Future settings changes must preserve **unique numeric positions for every registered gateway, including disabled gateways**. Current recovery mode accepts the already-correct state without writing; order writes/rollbacks now reject visible collisions before PUT. The normal apply plan pins COD's intended position 33, rather than deriving it from the now-moved OnePayUS position.

No customer order/account or payment was created by configuration. Native WooCommerce gateway-setting hooks were left intact; potential administrative notification delivery from enabling/disabling a gateway was not inspected or suppressed. Do not claim zero emails for the settings mutation.

## Current checkpoint

**IN PROGRESS — PHP deployed and WooCommerce configuration verified; final browser QA pending.**

- QA source: `e8fae7d57c7244c66173c5a2000aaaa5c3233a97`.
- Existing cart/checkout workflow scope: `--scope=checkout-payments`; other scopes retained.
- QA [43447691761](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43447691761), desktop 1366 × 900 and mobile 390 × 844.
- Every checkout POST and synthetic receipt is intercepted. Test COD/default/order/title, BACS selection, validation, rejected/uncertain/successful client behavior, Header/storage reset, and owned transient-cart cleanup.
- Next: wait for QA result, review screenshots, verify cleanup, then save final checkpoint and exact latest response.
