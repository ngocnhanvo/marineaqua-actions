# Checkout consent wording and policy link checkpoint

## Scope

User request: replace the checkout confirmation with **Tôi đã đọc và đồng ý với điều khoản và điều kiện của website *** and link only **điều khoản và điều kiện** to the relative URL `/chinh-sach-doi-tra-hang`.

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

## Verification and release

- Existing Astro CI run `43382064682`, new job `131970674201`, is running for this source. The workflow explicitly reads current Astro master; acceptance requires its logged SHA to match the new source.
- A focused `checkout-consent` scope is prepared in the existing cart/checkout QA harness. It will verify desktop/mobile exact text/link, real policy popup, preserved cart/checkbox state, required consent toggling, and owned fixture cleanup without checkout POSTs.
- QA will be published only after the existing production pipeline deploys this exact source.
- No new production pipeline, secret, deployment setting, PHP endpoint or business logic change.

## Current checkpoint

**IN PROGRESS — source committed; CI, existing Astro production deployment and focused live QA pending.**

Next: await CI success on the exact source, create one real dispatch release request, wait for build/upload/activation, run consent QA, inspect screenshots and cleanup, then save DONE and the exact final response.
