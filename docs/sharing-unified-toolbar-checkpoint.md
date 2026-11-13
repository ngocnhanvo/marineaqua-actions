# Marine Aqua — Unified article search/sort toolbar DONE (2026-11-13)

Request: Put article search and "Sắp xếp" side by side, remove the "Tổng cộng ... bài viết" row from all seven sharing archives.

## Changes
- Astro production branch `master`, component `src/astro/pages/PostsPage.astro`.
- Single white toolbar: search field aligned left, WordPress-powered sorting dropdown aligned right; both at same y-coordinate on desktop and mobile, with responsive widths.
- Removed the separate gray totals row and the "Tổng cộng ... bài viết" summary entirely.
- Existing sorting modes, GET query persistence, search, pagination and article cards unchanged.
- Astro implementation commit: `5cfbd7e7a79ca6ad1ce0228d8580eac3fc2b3828`.

## Production proof
- Canonical production run [43358461460](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43358461460): SUCCESS.
- Final postdeploy Playwright run [43358689175](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43358689175): SUCCESS. Evidence: `docs/sharing-unified-toolbar-qa-latest.json`, status PASS, errors [].
- 3 representative archives (Tin kiến thức / Tổng quan / Kinh nghiệm) × desktop 1366px / mobile 390px: 6/6 PASS.
- Desktop search/sort y=425px (both); mobile search/sort y=298px (both) for Tin kiến thức.
- Mobile search width 226.75px, sort width 122px, no overflow. All samples HTTP 200, original default option preserved.
- Initial QA run 43358465774 fired before deploy and failed; superseded by successful postdeploy run.
- Screen captures in final QA artifact.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
