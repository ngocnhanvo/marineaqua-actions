# Marine Aqua — Informational pages migration DONE (2026-11-13, Asia/Ho_Chi_Minh)

## Scope and result
Five pages from the policy/instructions/time/shipping menu were checked against the legacy source and are published on https://marine-aqua.io.vn/:

| Page | Frontend path | Live text characters | Playwright |
| --- | --- | ---: | --- |
| Chính sách đổi trả hàng | /chinh-sach-doi-tra-hang | 553 | PASS |
| Phí ship hàng | /thong-bao | 149 | PASS |
| Hướng dẫn mua hàng ở xa | /huong-dan-mua-hang-o-xa | 1292 | PASS |
| Hướng dẫn mua hàng tại nhà | /huong-dan-mua-hang-tai-nha | 712 | PASS |
| Thời gian bán hàng | /thoi-gian-ban-hang | 78 | PASS |

All five production text lengths match the verified source lengths from the WordPress migration evidence.

## Implementation
- Astro `master`: `InformationPage.astro` and `HomePage.astro` published in commit `22b926aa954239cfbd662fbe05c8f330da77d8a9`.
- WordPress: preserved verified existing pages (IDs 83272, 83273, 83274, 83275) with corrected HomePage action; created opening-hours page ID 83285. No duplicate pages were created.
- WordPress migration Actions: run [43313806097](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43313806097), success with the canonical production dispatch.
- Canonical Astro production deploy: run [43314094984](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43314094984), success; deployed Astro SHA `22b926aa954239cfbd662fbe05c8f330da77d8a9`, `ASTRO_BUILD_COMPLETE=PASS`, `FTPS_UPLOAD=PASS`, `SIGNED_UNZIP_SUCCESS`.
- Production Playwright QA: run [43314866860](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43314866860), success; five URLs HTTP 200, correct H1, nonempty content, no product listing fallback, mobile viewport 390px and scrollWidth 390px (no horizontal overflow).
- Durable QA JSON: `docs/information-pages-live-qa-latest.json`; durable WordPress migration evidence: `docs/information-pages-run-latest.json`. Screenshots (desktop/mobile for five pages) are uploaded in the QA run artifact.

## Content caution
The **original** return-policy page at marine-aqua.vn contains the legacy seller reference "AQua Thanh Xuân". This is a source-content/legal-policy review item for the site owner, not a technical migration failure; do not silently alter its terms.

## Decisions
- Use source-backed WordPress content; no fabricated shipping fees, opening hours, or policy terms.
- Existing authored content remains preserved; missing Page actions were repaired.
- Use only the canonical production deployment workflow. The diagnostic/QA workflows are read-only and do not deploy.
- Do not repeat the migration or trigger another production build unless new user changes require it.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
