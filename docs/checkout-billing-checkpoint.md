# Checkout billing card — checkpoint

## Scope and baseline

User request: make the checkout section **Thông tin thanh toán** match the supplied reference image (`image(20261113-135425).png`). This is a new UI task after `docs/account-cart-checkpoint.md` was completed. Do not repeat the completed hover, cart badge, shipping fee, product-name or account work.

Project: marine-aqua.vn. Source gate: `bypass`. Code mode: `auto-build`.

- Knowledge main: `1b5aab9e2f8b2fccb42947a74a48df6d9761570f` (unchanged).
- Astro baseline: `ae45df69316e554f125e6f3d4aae5d66d429694b`.
- PHP baseline: `073ecf89d30243625d8433ec5f386b44e5bd12e3`.

## Implemented behavior

- White rounded billing card with 24 px padding, 20 px heading, 50 px inputs, 16 px main field gaps and 100 px notes area.
- Full-width fields in reference order: Họ và tên *, Số điện thoại, Email *, Địa chỉ *.
- Tỉnh / Thành phố and Quận / Huyện / Phường use two equal columns on desktop and full-width stacked fields on small screens.
- Native optional text inputs, accessible labels, appropriate autocomplete, 254-character limit. No invented geographical dataset.
- Tạo tài khoản mới? remains functional; notes follow it. Removed individual/organization radios and CCCD/tax-ID collection.
- Phone remains required by the established frontend/backend contract; its placeholder follows the reference without an asterisk. Name, email and address also remain required.
- Existing cart, shipping-fee link, payment-method source, duplicate-submission protection and uncertain-result behavior are preserved.

| UI input | Checkout payload / stored field |
| --- | --- |
| billing_state / Tỉnh / Thành phố | billing.state / billing_state |
| billing_city / Quận / Huyện / Phường | billing.city / billing_city |
| order_comments | customer_note |

The WooCommerce order setters already supported city/state. Added these fields to customer profile updates, login projection, BillingInfo and signed-session normalization for prefill from saved profiles. Empty optional values preserve the current nonempty-only profile-update convention; the order reflects the values supplied for that checkout. Removed custom identity fields are omitted from the browser payload; existing customer custom metadata is not overwritten. Existing signed sessions without locality fields remain valid.

Existing boundary: the Astro checkout proxy does not forward its customer identity to a WordPress session. Profile writes occur only in the backend's already-recognized customer/new-account paths. This task does not change that authentication architecture or claim a live authenticated checkout test.

## Source commits

| Repository / branch | Commit | Scope |
| --- | --- | --- |
| ngocnhanvo/marineaqua-astro / master | `771d37ef5a3614277f6366aa900bff346f271964` | Billing UI/i18n, type/session projection, request/session regressions (6 files) |
| ngocnhanvo/marineaqua-php / master | `f7d63f5b0b83c779f7ffd3f05c7185e5e806a3f6` | Customer locality persistence/login projection and PHP regressions (4 files) |

Both master refs were updated non-force with expected-SHA leases and read back. Source heads and changed-file lists matched the reviewed changes.

## Verified checks and release evidence

- Astro CI: [43382064682, attempt 8](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43382064682), job `131931139215`: SUCCESS on `771d37e`; **348 tests / 38 files**, Astro check **0 errors / 0 warnings**.
- PHP bridge: [43438966831](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43438966831): SUCCESS.
- PHP release: [43439000306](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43439000306), job `131931401024`: SUCCESS on `f7d63f5`; syntax, customer login **11 groups**, checkout preflight and payment gateway regression checks PASS. TLS/identity/target assertions PASS; **2 changed files** activated with SHA256 readback; 12 files checked; ready marker PASS.
- The PHP tests use stubs only: no actual accounts, authentication, orders, payments or emails.

## Production and live QA — completed

**DONE — requested billing UI deployed and verified.** Updated at 2026-11-13 21:10 +07:00 (Asia/Ho_Chi_Minh).

- Production request commit: `7be7db0e44d840609a1c4bec8f1bb91d7a8a91f9`; source `771d37ef5a3614277f6366aa900bff346f271964`.
- Astro bridge: [43439260992](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43439260992), both jobs SUCCESS.
- Production deployment: [43439305026](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43439305026), attempt 1, job `131932445141`, SUCCESS. Actual execution log verified the exact source SHA and `ASTRO_BUILD_COMPLETE=PASS`, `ASTRO_OUTPUT_VALIDATION=PASS`, `FTPS_UPLOAD=PASS`, `SIGNED_UNZIP_SUCCESS`. Existing build/cache/package/FTPS/signing/activation pipeline was preserved.
- Focused QA source: Actions commit `5501136db882ce26d28f3b418b24ba68d92c9cfc`, existing cart/checkout harness and workflow, `--scope=checkout-billing`. Other scopes remain available.
- Live QA: [43439678099](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43439678099), attempt 1, job `131933723883`, SUCCESS, **16/16 check records**, no errors.
- Artifact `14045432313`, `cart-checkout-live-qa`, SHA256 `8492c4905be7a0479325c6b3a9abb0fa27ac80d44f434a33c693d90f125208d5`; downloaded and digest verified. Contains report JSON and four PNGs; GitHub retention ends 2026-11-27.
- Source master heads were rechecked after QA and remain `771d37e` / `f7d63f5`.

### Browser acceptance

| Check | Desktop 1366 × 900 | Mobile 390 × 844 |
| --- | --- | --- |
| Reference heading, field order and exact placeholders | PASS | PASS |
| Input height / notes height | 50 px / 100 px | 50 px / 100 px |
| Locality layout | Two equal columns | Full-width stacked |
| Accessible labels, autocomplete and optional localities | PASS | PASS |
| Required name/phone/email/address; malformed email; terms guard | PASS | PASS |
| Account checkbox, email sync, conditional password and visibility toggle | PASS | PASS |
| Synthetic billing/locality/note mapping | PASS | PASS |
| Duplicate submission blocked; fields/cart preserved on mocked rejection | PASS | PASS |
| Horizontal overflow | None | None |
| Configured payment methods | onepayus + bacs; no fresh-GET retry | onepayus + bacs; no fresh-GET retry |
| Private/no-store/Vary Cookie on cart and checkout HTML | PASS | PASS |
| Temporary cart cleanup | 1 item removed; readback 0 | 1 item removed; readback 0 |

Root and an independent reviewer visually inspected `desktop-checkout-billing-card.png`, `mobile-checkout-billing-card.png` and both full-page screenshots against the user reference. Requested billing-card visual acceptance: PASS. Full-page PNGs mask input values; card crops are unmasked only after asserting every visible field is empty in a fresh guest context. The existing global Tư vấn widget appears over a small lower-right portion of the mobile notes area depending on scroll position; it was not introduced or modified by this task.

### Validation boundary and cleanup

- Checkout POST interception and auth/order guards were installed before any browser navigation.
- Two checkout submissions total, both fulfilled by browser mocks with a synthetic 422. **Zero real orders, new accounts, live authentication requests, payments or emails.**
- Positive account creation/profile/order persistence tests are offline PHP/session contract tests; live QA verifies the conditional form controls and outgoing payload without creating a customer/order.
- Two isolated guest carts were cleaned in `finally`; only known test items were removed, with API readback confirming zero remaining items on both viewports.
- No WordPress Page/content changes, deployment pipeline changes, environment/secret changes or new endpoints.
- No pending work remains for this request. Do not rerun the completed earlier cart/account/shipping/hover tasks unless a new requirement or observed regression warrants it.
