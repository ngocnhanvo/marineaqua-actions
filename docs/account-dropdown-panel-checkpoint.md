# Marine Aqua account dropdown checkpoint

Date: 2026-11-15

## Acceptance

- Source: `ngocnhanvo/marineaqua-astro@master`
- Accepted commit: `5b10a6eeb6c168d8ef2d752e2b6dbc3d4517ebad`
- CI: [43670231601](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43670231601) — SUCCESS.
- Production: [43670345681](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43670345681) — SUCCESS.
- Live Playwright: [43670494271](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43670494271) — SUCCESS.
- Account dropdown QA: 12 checks, desktop/mobile, PASS.
- Product/category regression QA: 91 checks, PASS.

## Behavior

- Clicking the account icon opens a 320px anchored floating panel when `/api/user/info` returns a server-verified signed-in customer.
- Panel includes display name, email, `Đơn hàng của tôi`, and red `Đăng xuất` action.
- User-provided profile fields are assigned via `textContent`, never interpolated into HTML.
- Panel closes on second icon click, outside click, Escape, scroll, resize and navigation.
- Desktop and mobile share the same panel and session state; mobile menu closes when panel opens.
- Logging out calls the existing same-origin POST `/api/user/logout` and reloads after success.
- Missing, invalid or expired customer sessions do not display the green dot; guest click continues to the WordPress account/login Page.

## WordPress Page availability

The production WordPress Pages API currently returns account `id=83459`, key `account`, slug `tai-khoan`, but **no published Page with key `orderhistory`**. Do not hard-code an invented order-history URL.

Until a real WordPress-owned order-history Page is published:
- The panel keeps the visually matching `Đơn hàng của tôi` row.
- The row is a non-interactive `span[aria-disabled=true]` with a localized explanatory title.
- Once a valid WordPress Page with key `orderhistory` exists in the current locale, Astro can render its real link on the next build.
- Implementing/publishing a new order-history Page and native ESC Table label contract is a separate CMS task, not an unverified URL shortcut.

## Final state

Account dropdown panel: DONE.
Published order-history destination: NOT AVAILABLE IN WORDPRESS; guarded disabled state verified.
