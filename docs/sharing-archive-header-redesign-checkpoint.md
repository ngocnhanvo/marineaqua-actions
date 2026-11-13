# Marine Aqua — Sharing category header layout DONE (2026-11-13)

## Change
User reported raw, left-edge text above an isolated search field at `/cat/tin-kien-thuc` and other sharing article archives.

Astro `master` `src/astro/pages/PostsPage.astro` now:
- Does not inject raw WordPress Page HTML ahead of archive heading.
- Shows a structured full-width pale-blue knowledge hero with the site's 92.5%-width content alignment.
- Breadcrumb: Trang chủ / Chia sẻ / current category.
- Single semantic H1, optional normalized WordPress description and total article count.
- Clean, non-sticky search/filter toolbar below hero with consistent widths and modern input styling.
- Retains 7 live WordPress category routes, article cards, filters and pagination.
- Responsive desktop/mobile with no horizontal overflow.

Source commit: `df082d1f32aa52e5210f1ace20e1dea60a19f6d8`.
Canonical production release: [run 43354941020](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43354941020) SUCCESS.

## QA
Final browser QA: [run 43355621002](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43355621002) SUCCESS.
- Desktop width 1366px: 7/7 categories PASS.
- Mobile width 390px: 7/7 categories PASS.
- 14/14 verified semantic H1, hero alignment, search placement, nonempty article cards, 200 status and no horizontal overflow.
- Screenshots for `tin-kien-thuc` desktop and mobile in QA run artifacts.
- Durable report: `docs/sharing-header-visual-qa-latest.json`, status PASS, errors [].

The initial tests before publication used an obsolete bundle and one mobile assertion treated the correct 14.625px 3.75%-viewport gutter as an error. These were superseded by the final QA above. A GitHub evidence write 409 was addressed with conflict retry; final run passed entirely.

Do not rebuild or repeat this work unless the user requests further visual changes.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
