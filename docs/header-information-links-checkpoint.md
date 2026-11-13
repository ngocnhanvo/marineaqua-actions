# Marine Aqua Header information links — DONE (2026-11-13 Asia/Ho_Chi_Minh)

User request: Link five published information pages in the original WordPress Header menu; preserve hierarchy, other items, and desktop/mobile behavior.

## WordPress native menu
- WordPress Header VI existing menu items changed by native wp-admin/nav-menus.php:
  - 82511 Chính sách đổi trả hàng => /chinh-sach-doi-tra-hang (child of Chính sách và hướng dẫn)
  - 82512 Phí ship hàng => /thong-bao (child)
  - 82513 Hướng dẫn mua hàng ở xa => /huong-dan-mua-hang-o-xa (child)
  - 82514 Hướng dẫn mua hàng tại nhà => /huong-dan-mua-hang-tai-nha (child)
  - 82515 Thời gian bán hàng => /thoi-gian-ban-hang (top-level)
- Native menu workflow [43336282791](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43336282791): PASS; unaffected entry checksum matched, no duplicates or hierarchy changes.
- Durable WordPress evidence: `docs/header-information-links-latest.json`.

## Production release
- Existing canonical Astro deploy workflow [43336552514](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43336552514): SUCCESS (commit from Astro master unchanged, WordPress Header menu refreshed).
- Trigger via approved dispatch bridge request `dispatch-requests/20261113T002400Z-header-information-five-links.json`. No second deployment pipeline.

## Live QA
- Corrected Playwright QA [43336982003](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43336982003): PASS.
- Desktop actual viewport 1366px, document width 1366px, all five linked anchors in navigation.
- Mobile actual viewport 390px, document width 390px, all five linked anchors in navigation.
- All five destination routes respond HTTP 200 with expected H1.
- Durable result: `docs/header-information-links-live-qa-latest.json`.
- Screenshots of desktop/mobile in QA artifact.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
