# Marine Aqua — latest response

- Checkpoint: 2026-11-12 10:00+07:00, Accessibility / Best Practices Lighthouse follow-up.
- Scope: marine-aqua.vn; frontend https://marine-aqua.io.vn; WordPress https://admin.marine-aqua.io.vn.
- Knowledge: ngocnhanvo/knowledge@main, CORE-01..09 / relevant Astro/WordPress and Playwright stacks.
- Astro: ngocnhanvo/marineaqua-astro@master eafca07427539473c5ad7377d1c904b7df186dd9.
- PHP: ngocnhanvo/marineaqua-php@master 54574851 (unchanged).
- Actions: ngocnhanvo/marineaqua-actions@main 8106d4f84a57fbe77deb83c045d3fdac55d60356 (QA source before checkpoint).
- Prior CLS fix c518083c, last production comparison CLS 0 at desktop: DONE; do not repeat.
- Prior keyboard/focus fix to hidden slide anchors 0c5ccc4: DONE; do not repeat.
- Lighthouse source report: Accessibility 89/100; Best Practices 96/100. Accessibility failures: aria-hidden-focus, aria-prohibited-attr, color-contrast (promo contrast 4.46 vs 4.5). Best Practices failure: inspector-issues => Content security policy, no affected URLs in report.

## Implemented

- Astro 72dd730: role=img on two non-interactive header icons with aria-label.
- Astro eafca074: promo red #d6334b -> #c12a43 in final CSS, 5.38:1 contrast on #f3f9ff.
- Actions 20514b1: update existing visual-QA color assertions.
- Actions c9691ed + 9ad204b: add corrected read-only regression for icon semantics, inert slides, promo contrast.
- Actions 8106d4f: inspect CSP on clean Playwright Chromium using CDP Audits.

## Verified run evidence

- CI source check: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43124177120 attempt 2 SUCCESS; checked Astro commit eafca074, 209/209 unit tests PASS, astro check 0 errors/0 warnings.
- Production release: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43136036466 attempt 3 SUCCESS, deploying Astro eafca074; FTPS_UPLOAD=PASS, SIGNED_UNZIP_SUCCESS.
- Post-deploy read-only Playwright: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43144280281 (overall FAILED; targeted MARINEAQUA_LIGHTHOUSE_ACCESSIBILITY=PASS; rolesValid=true, slidesInert=true, inactiveSlides=2, contrast=5.38).
- CSP browser verification: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43144791043 (overall FAILED due unrelated existing failures; targeted CSP audit pageCspPresent=true, scriptUnsafeInline=true, scriptStrictDynamic=false, issues=[]; accessibility PASS again).
- Remaining unrelated full-suite failures: MARINEAQUA_CATEGORY_SCROLL_ANCHOR (scroll reset to 0 on toggle), MARINEAQUA_HOME00_BANNER (media not loaded and mobile slide navigation fail).
- No fresh Lighthouse scoring after release. Browser CSP check alone does not prove old Chrome DevTools issue resolved in user's audit environment.

## Next precise steps

1. Re-run real Lighthouse clean browser on current production to determine whether Best Practices inspector-issues persists and identify original CSP issue source. If improvement requires nonce/hash/strict-dynamic changes to security architecture, provide impact, compatibility/rollback and seek explicit owner approval; never weaken CSP to raise score.
2. Diagnose and fix two separate existing UI QA failures (category scroll anchor, Home_00 banner media and mobile nav) from current source/WordPress, only after source-specific confirmation; do not use arbitrary placeholders or alter CMS without relevant rights.
3. Distinguish targeted Accessibility PASS and production deploy PASS from full Playwright FAIL, Lighthouse not re-scored.

## Intended full final response

Đã đọc lại Knowledge và checkpoint mới nhất, không lặp lại phần CLS/footer đã hoàn tất. Đã sửa ba lỗi Accessibility từ Lighthouse, commit Astro `eafca074`, chạy CI 209/209 PASS và deploy thành công qua production run #43136036466 attempt 3. Playwright trên production xác nhận ARIA và slide ẩn đúng, màu “Khuyến mãi” đạt 5,38:1.

Best Practices chưa thể chốt: Chrome sạch ghi nhận 0 CSP issue trong phiên, nhưng site vẫn sử dụng `'unsafe-inline'` và chưa có phép đo Lighthouse mới. Bộ Playwright tổng vẫn FAIL vì lỗi cuộn danh mục và banner đã tồn tại trước đó, không phải do sửa Accessibility. Đã cập nhật bài kiểm thử và lưu checkpoint, bước tiếp theo là khoanh vùng CSP và xử lý hai lỗi UI riêng.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
