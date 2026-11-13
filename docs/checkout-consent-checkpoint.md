# Checkout consent wording and policy link checkpoint

## Scope

User request: replace the checkout confirmation with `Tôi đã đọc và đồng ý với điều khoản và điều kiện của website *` and link only **điều khoản và điều kiện** to the relative URL `/chinh-sach-doi-tra-hang`.

- Project: marine-aqua.vn; code mode `auto-build`; source gate `bypass`.
- Knowledge main `1b5aab9e2f8b2fccb42947a74a48df6d9761570f`, unchanged and previously read. Applicable repository/branch, release and latest-response rules rechecked.
- Previous `docs/checkout-payments-checkpoint.md`: DONE; COD configuration and backend processing must not be repeated.
- Astro baseline: `0002be54d57405c08ad819b66ed4882fdeedeb9e`.
- PHP: `d1361c8f5abeae239cea70fb09dc57693acd0c2d`, unchanged; no PHP release or gateway/CMS write required.

## Source change

- Astro master commit: `5c2af48b8d02c789f19c53e0e6194798fd40f907`.
- Two files, 16 additions / 3 deletions: `src/astroutils/CheckoutPage/InfoForm.astro` and `src/data/i18n/checkout.json`.
- Vietnamese text uses the existing i18n dictionary, with the requested website suffix and literal asterisk.
- A Vietnamese-only consent branch links the requested phrase to the owner's explicit relative URL. It opens a new tab with `noopener noreferrer`, preserving the checkout session while the policy is read.
- Other locales retain the existing Page-key link resolution and wording behavior. Required checkbox, client validation, checkout submission contract, COD and BACS are unchanged.
- Source update used expected-head, non-force CAS; both remote files read back exactly. Independent review accepted; dictionary JSON validation passed.
- No Visual Builder label migration was requested; this narrow edit does not migrate the checkout page or create CMS tables.

## Verified source checks and production release

- Existing [Astro CI 43382064682](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43382064682), attempt **10**, job `131970674201`: **SUCCESS** on exact source `5c2af48b8d02c789f19c53e0e6194798fd40f907`.
- **348 tests / 38 files passed**. Astro checks: 262 files, 0 errors, 0 warnings, 110 hints.
- Release request `dispatch-requests/20261113T151426Z-checkout-consent-release.json`, commit `01e35bb16d7c82f2ef811701e4e539c62dd400a8`.
- Existing [dispatch bridge 43450620474](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43450620474): **SUCCESS**; jobs `131971497983` and `131971650981`.
- Existing [production deploy 43450697765](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43450697765), job `131971767459`: **SUCCESS**, exact source SHA logged.
- Actual log evidence: `ASTRO_BUILD_COMPLETE=PASS` at 15:16:24 UTC, `ASTRO_OUTPUT_VALIDATION=PASS`, `FTPS_UPLOAD=PASS` at 15:16:42 UTC, `SIGNED_UNZIP_SUCCESS` at 15:16:52 UTC on 2026-11-13.
- Established build/cache/FTPS/signed activation pipeline preserved. No new production pipeline, secret, deployment setting, PHP endpoint or business logic change.

## Verified live QA

- QA source `f957e57f1abc3ad1c1dd650dcb99fed8641d6841`; only the existing cart/checkout harness and workflow extended with `--scope=checkout-consent`. Other scopes retained.
- [Live QA 43451121169](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43451121169), job `131973230880`: **SUCCESS, 14/14 checks**, desktop 1366 × 900 and mobile 390 × 844.
- Report `checkedAt=2026-11-13T15:18:18.032Z`; final PASS at `2026-11-13T15:19:58.5675556Z`.
- Exact normalized label on both viewports: `Tôi đã đọc và đồng ý với điều khoản và điều kiện của website *`.
- Exactly one linked phrase, `điều khoản và điều kiện`, with raw relative `href="/chinh-sach-doi-tra-hang"`, `target="_blank"` and `rel="noopener noreferrer"`.
- Actual clicks opened the production policy in a separate tab with HTTP 200 and heading **Chính sách đổi trả hàng**. `window.opener === null`; original checkout URL, cart identity/items, checkbox state and disabled-submit guard preserved.
- Required checkbox toggles submit eligibility disabled → enabled → disabled. Fresh checkout remains a guest.
- No horizontal overflow; content widths exactly 1366 and 390 px. Payment metadata needed no retry.
- **0 checkout POSTs, real orders, accounts, authentication requests or payment transactions.** Existing strict guards protected the test; this task did not repeat the completed COD submission suite.
- Both owned fixture carts cleaned in `finally`: each removed 1 item, API readback 0 remaining; errors empty.
- Artifact `14051310156`, `cart-checkout-live-qa`, 875,432 bytes, expires 2026-11-27. Downloaded ZIP SHA256 verified: `c5108553693272368ba5a829cdf4a1418ff589a1a5c9f6eb28babe4649570a3a`.
- Four screenshots visually accepted: root reviewed desktop/mobile label crops; independent reviewer accepted both full checkout views. Desktop sentence occupies one line; mobile wraps cleanly to two, with the asterisk visible. Pink fullpage input masks are deliberate QA redaction.
- QA script SHA256 `c53e5127b190adc512af2a5d2a2d7f179a1c07ac69a87ab33570be69c0dc7f37`; workflow SHA256 `740554db7ead6212e6a76c64eb9bbbaf5e9469c93d1e56e4887963a39e470ecb`. Exact remote contents verified.

## Current checkpoint

**DONE — requested consent text and relative policy link deployed and verified on desktop/mobile.**

Final heads rechecked at 2026-11-13 15:20:52 UTC: Astro `5c2af48b8d02c789f19c53e0e6194798fd40f907`; PHP unchanged `d1361c8f5abeae239cea70fb09dc57693acd0c2d`. CI, bridge, production deployment and live QA all completed successfully. No outstanding source, release, QA or cleanup work.

The exact final handoff response is saved separately in `chatgpt/latest-response.md`. Continue from this DONE checkpoint on the next request; do not repeat prior COD, billing, shipping-fee or Header work.
