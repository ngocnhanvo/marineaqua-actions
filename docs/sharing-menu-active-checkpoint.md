# Marine Aqua — Header sharing submenu active state DONE (2026-11-13)

## User issue
When visiting `/cat/tong-quan-ve-be-ca`, Header "Chia sẻ" submenu did not visually mark the current selected category. Other sharing archives showed the same problem.

## Root cause and fix
- Public archive paths `/cat/{slug}` are WordPress custom menu destinations, not the same as the legacy Page identity `slug`.
- The SSR route rewrites the user URL to `/ssr/posts/{slug}/{page}` and strips internal `curUrl` from `Astro.url.searchParams` before Header components are rendered.
- `src/lib/stringUtils/menuTree.ts` now checks both `href` and `slug` with exact/public-page-number boundary matching.
- `src/astro/components/Layout/Layout.astro` passes canonical public `headProps.href` to `Header.astro`, then to `Menu/Desktop.astro` and `Menu/Mobile.astro`.
- Mobile resolves its active slug at the top of the tree and passes it to nested `MobileBranch`. Desktop/ Mobile nested leaf anchors set `aria-current="page"` when selected; existing blue text / pale blue background styles apply.
- Preserves WordPress-owned menu links and non-related items unchanged.

## Release and validation
- Astro master final fix commit: `e484ba9cdf5f4c82eb2bd254de9c9b08d0a6df5f`.
- Canonical production deploy [43360791173](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43360791173): SUCCESS.
- Postdeployment Playwright [43361008528](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43361008528): SUCCESS.
- `docs/sharing-menu-active-qa-latest.json`: status PASS, **6/6**, zero errors.
- Checked desktop 1366 and mobile 390 for three representative WordPress sharing categories: `tong-quan-ve-be-ca`, `tin-kien-thuc`, `set-up-be-ca-bien-mini`. Each has correct href, active submenu blue style, `aria-current="page"`, active "Chia sẻ" parent and no horizontal overflow.
- Earlier runs 43360273374 and 43360480234 failed while the public URL bridge was not yet in production; superseded by final PASS run.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
