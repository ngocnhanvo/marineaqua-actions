# Marine Aqua — Informational pages migration checkpoint (2026-11-13)

## Request
Implement remaining pages from the "Chính sách và hướng dẫn" menu and verify against https://marine-aqua.vn/.

## Implemented source
- Astro master: `src/astro/pages/InformationPage.astro` (commit b24bd4b72e537de0c994cedb687125db78d78fc5).
- Astro master: `src/astro/pages/HomePage.astro` delegates known information slugs / keys to InformationPage (commit 22b926aa954239cfbd662fbe05c8f330da77d8a9).
- Actions main: `scripts/marineaqua-information-pages-migration.mjs` pulls verified source articles, preserves existing nonempty WP pages, publishes content through existing WordPress REST with authorized admin session, and logs per-page evidence.
- Actions main: `.github/workflows/marineaqua-information-pages-migration.yml` uses existing Playwright image and runs the canonical `repository_dispatch wp_trigger_build` **only on migration success**. No new deploy implementation.
- Actions main: `scripts/marineaqua-information-pages-live-qa.mjs` and `.github/workflows/marineaqua-information-pages-live-qa.yml` provide five-route desktop/mobile verification after a successful canonical deploy.

## Scope
- `chinh-sach-doi-tra-hang`: https://marine-aqua.vn/chinh-sach-doi-tra-hang/
- `thong-bao` (site menu labels it "PHÍ SHIP HÀNG"): https://marine-aqua.vn/thong-bao/
- `huong-dan-mua-hang-o-xa`: https://marine-aqua.vn/huong-dan-mua-hang-o-xa/
- `huong-dan-mua-hang-tai-nha`: https://marine-aqua.vn/huong-dan-mua-hang-tai-nha/
- `thoi-gian-ban-hang`: https://marine-aqua.vn/thoi-gian-ban-hang/

## Verification and blocker
The source site's return policy is readable via web; other pages intermittently time out from the assistant environment. Runner performs its own strict source verification and refuses to fabricate unavailable content. The original return policy contains an apparent legacy seller-name reference ("AQua Thanh Xuân"); do not silently alter legal terms. Current GitHub connector's commit-scoped workflow lookup returned empty workflow_runs for relevant Actions commits; **no successful migration/deploy/live QA run has been verified here**. Do not mark DONE on the basis of commits or dispatch requests alone.

## Next steps
1. Inspect Actions workflow `marineaqua-information-pages-migration.yml`, run artifacts `information-pages-evidence/result.json` and any errors; fix failed source pages without inventing content.
2. Verify five WordPress Page slugs / actions / published HTML via authenticated REST; check existing authoring conflicts.
3. Inspect canonical `marineaqua-production-deploy.yml` success and its deployed Astro source SHA (>= 22b926aa).
4. Inspect `marineaqua-information-pages-live-qa.yml` and screenshots for all five routes including mobile. Fix failures and rerun approved pipeline, avoiding parallel duplicate deploys.
5. Check navigation menu links to these pages, plus scope of the separate "Chia sẻ" articles.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
