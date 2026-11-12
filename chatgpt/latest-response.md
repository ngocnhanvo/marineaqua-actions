# Marine Aqua — latest response

- Checkpoint: 2026-11-12 10:35+07:00, contact consultation widget UI replacement.
- Project: marine-aqua.vn, frontend https://marine-aqua.io.vn, WordPress https://admin.marine-aqua.io.vn.
- Astro: ngocnhanvo/marineaqua-astro@master ea98d90e5d2d1ae372ea93c57707b6cc9d5d3d2b.
- Actions: ngocnhanvo/marineaqua-actions@main edb8dc60d2d988343bc76c6a214113316e622dd8 prior to checkpoint.
- PHP: ngocnhanvo/marineaqua-php@master 54574851f0eaea9e40341b36c5a7215573bc436e unchanged.
- User asked to replace "Chat với AI Agent" floating launcher with the consultation popup from supplied image, but adapt real Marine Aqua contact details; **this request DONE**.

## Changes implemented

- src/astro/components/Tool/ContactWidget.astro: compact circular "Tư vấn" button opens a responsive contact panel with phone, Messenger/Facebook, Zalo and Chat with AI assistant; maintains existing AI backend, conversation history and draggable launcher; Escape/outside-click/close work; accessible aria and inert for hidden panels.
- src/astro/components/Layout/Layout.astro: passes current WordPress WPInfo and locale into widget.
- src/tests/contact-config.test.ts: WordPress source and widget behavior contract checks.
- All actual contact links are generated from current-locale WordPress fields; missing channels suppressed (no hardcoded sample phone). On production QA verified 0931 37 36 36, https://m.me/FISHLOVERSHOP and https://zalo.me/0931373636.
- Astro commits: 1e96b268, 967b203b, 8317d618, 6f37f086, 7075e80a; final fix ea98d90 (AI opens immediately, parser/history async).

## Evidence

- CI run https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43124177120 attempt 4: 212/212 tests PASS, astro check 0 errors / 0 warnings, exact source ea98d90.
- Production release https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43136036466 attempt 5: completed/success with MARINEAQUA_DEPLOY_COMMIT=ea98d90, ASTRO_BUILD_COMPLETE=PASS, FTPS_UPLOAD=PASS, SIGNED_UNZIP_SUCCESS.
- After-deploy read-only Playwright https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43147634583 attempt 2: targeted MARINEAQUA_CONSULTATION_PANEL=PASS at 390px and 1440px; panel opens and stays in viewport, links valid, Escape/outside close, AI opens and closes.
- Full read-only Playwright workflow remains failure because unrelated previously-known tests MARINEAQUA_CATEGORY_SCROLL_ANCHOR and MARINEAQUA_HOME00_BANNER fail. Do not conflate with widget acceptance.

## Still open from earlier checkpoint, not part of this widget task

- Full suite's category scroll-anchor and Home_00 banner-media/mobile navigation failures.
- Best Practices Lighthouse CSP audit needs separate clean rerun and assessment; do not relax CSP without approval.
- Prior desktop CLS and Accessibility targeted fixes were already completed/deployed and should not be repeated.

## Intended final response

Đã thay nút Chat với Agent bằng nút Tư vấn và bảng liên hệ bốn kênh ngay trong source Astro. Thông tin liên hệ được lấy trực tiếp từ WordPress; AI vẫn hoạt động. Source CI PASS, production deploy thành công và Playwright kiểm chứng mobile/desktop PASS. Bộ kiểm thử toàn trang vẫn có lỗi danh mục/banner tồn tại trước đó.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
