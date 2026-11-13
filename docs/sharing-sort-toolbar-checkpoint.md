# Marine Aqua — Sharing archive sort toolbar DONE (2026-11-13)

User requested a sorting filter like the product listing's summary/sort bar for category article pages.

## Implemented
- Astro master `src/astro/pages/PostsPage.astro`: responsive secondary toolbar below search (article total left, "Sắp xếp" dropdown right), four options Mặc định, Cũ nhất, Tên A–Z, Tên Z–A. Select submits a GET form, preserves current `q` and `cat`, and page links retain `sort` query.
- Astro master `src/lib/wordpress/posts/index.ts`: validated `sort` lookup mapping to WordPress REST `orderby=date/title`, `order=asc/desc`. Sorting occurs server-side before pagination; no client-only reshuffle.
- Astro master `src/pages/ssr/posts/[slug]/[page].astro`: pass query `sort` to Posts API.
- Last Astro commit `68ae5097bf43c325de3770006db04c662a3fd0e1`.

## Release gates
- Canonical production build and deployment run [43357439414](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43357439414): SUCCESS.
- Postdeploy Playwright QA [43357672607](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43357672607): SUCCESS, durable evidence `docs/sharing-sort-live-qa-latest.json`, status PASS, errors 0.
- Tested 3 categories (Tin kiến thức / Tổng quan về bể cá / Kinh nghiệm xử lý bể cá) × desktop 1366px + mobile 390px: 6/6 PASS. Verified article totals (24/5/48), default selector, real WordPress ordering changes for A–Z vs Z–A, selected sort URL and UI sync, sorting preserved across page 2 for categories with >12 posts, and no horizontal overflow.
- First QA run 43357469349 executed before deploy and failed with missing sort selector; superseded by successful postdeploy run.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
