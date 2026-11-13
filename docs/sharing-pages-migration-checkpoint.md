# Marine Aqua — Chia sẻ knowledge archives migration DONE (2026-11-13, Asia/Ho_Chi_Minh)

## Scope and source
Seven WordPress Post categories from https://marine-aqua.vn/ preserved as authentic taxonomy and Posts:
- Tổng quan về bể cá biển: `/cat/tong-quan-ve-be-ca` — 5 Posts
- Setup bể cá biển mini: `/cat/set-up-be-ca-bien-mini` — 4
- Kinh nghiệm xử lý bể cá: `/cat/kinh-nghiem-tri-reu-hai-tao-hai-trong-be-ca` — 48
- Cách chọn muối, vi sinh và hóa chất: `/cat/cach-chon-muoi-vi-sinh-va-hoa-chat-tot-nhat-cho-be-ca` — 36
- Cách chọn thức ăn tốt cho cá và san hô: `/cat/cach-chon-thuc-an-tot-cho-ca-va-san-ho` — 16
- Tin kiến thức: `/cat/tin-kien-thuc` — 24
- Các thiết bị trong bể cá: `/cat/cac-thiet-bi-trong-be-ca-den-skimmer-may-bom` — 32

**133 unique published Posts**, multiple-category memberships preserved exactly. Seven category terms and seven related Page records; existing `tin-kien-thuc` Page preserved with stable `knowledge` key, action `PostsPage`. WordPress Posts use `PostDetails` action.

## Verified results
- Source-to-target migration: [run 43350594852](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43350594852) SUCCESS. `docs/sharing-migration-latest.json`: PASS, 133 Posts (12 preserved, 121 created), 7 categories, 7 Pages, zero errors.
- Exact 133 source/target slug and category membership parity; existing WordPress Header items updated without changing other menu entries: [run 43352394338](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43352394338) SUCCESS, `docs/sharing-header-latest.json`: PASS, 7 menu links, membership PASS.
- Canonical production Astro deploy: [run 43353031719](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43353031719) SUCCESS (after correcting legacy `tin-kien-thuc` PostsPage prerender; failed earlier run 43352570683 was superseded).
- Production Playwright desktop/mobile: [run 43353305198](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43353305198), `docs/sharing-live-qa-latest.json`: PASS, 7 Header links present on both 1366px and 390px viewport, 14 archive route checks status 200 with nonempty cards, no horizontal overflow, 3 source-backed article detail routes status 200 and nonempty content.
- Astro production branch: `master`; last fix commit `85b9941093925d04c91f321109ce2bb2678ce393`, followed by post image `src` fallback `5ba62ab9359f2b7c01932fa8865bfaff938c3033` (deployed).
- Article media note: first native-media migration was superseded because proxy-binary upload failed; final content migration uses genuine featured images when already imported and preserves genuine original image URL in article body for missing featured images. Do not claim all 133 Post featured_media WordPress attachments have been imported. Source images are not fabricated.
- WordPress is canonical Posts and category data; no manual static post duplication or frontend fallback.

## Next-step constraints
Do not repeat the seven categories/133 Posts migration or build while these checkpoints are PASS. Separate any future completeness review of WordPress-native featured_media and article image URLs from the DONE text/page/navigation release.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
