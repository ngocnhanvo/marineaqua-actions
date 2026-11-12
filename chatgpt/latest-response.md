# Marine Aqua — latest response

- Time: 2026-11-12 09:15+07:00 (Asia/Ho_Chi_Minh, approximate)
- Project: marine-aqua.vn
- Repository: ngocnhanvo/marineaqua-actions
- Branch: main
- Work: diagnose and fix desktop CLS at TROPIC-MARIN section
- Astro source: ngocnhanvo/marineaqua-astro@master c518083c54761752a66360808eb5725c7b9388df
- Production deployment: run 43136036466 attempt 2 — SUCCESS
- CLS browser comparison: run 43138875630, baseline attempt 1, after fix attempt 2
- CLS 1440px: 0.14397 -> 0.00000
- CLS 1917px: 0.06353 -> 0.00000
- Playwright full suite: FAILURE for unrelated category scroll anchor and banner image checks; targeted CLS = PASS

## Intended full final response

Mình đã kiểm tra mã nguồn Astro master của Marine Aqua và xác định lỗi CLS của section sản phẩm TROPIC-MARIN. Phần tử Lighthouse đánh dấu là `div.mx-auto.w-[92.5%].max-w-[1920px]` trong `BrandProductSection.astro`, nhưng phần tử đó bị đẩy do bố cục thay đổi, không phải bản thân thẻ sản phẩm gây lỗi.

Trong `src/astro/pages/HomePage.astro`, scroll-reveal dùng `content-visibility: auto` cùng `contain-intrinsic-size: auto 900px`. Chiều cao dự phòng 900px khác kích thước thật của các section ESC Table nên khi trình duyệt tính lại layout, section sản phẩm dịch chuyển. Đã xóa cơ chế chiều cao giả, giữ nguyên hiệu ứng opacity và transform, dữ liệu WordPress và giao diện.

Playwright trước sửa: desktop 1440px CLS 0,14397; 1917px CLS 0,06353. Sau sửa và deploy: cả hai = 0,00000. Điều này xác nhận nguyên nhân trên các phép đo desktop thực tế. Mobile vẫn có CLS nhỏ 0,002–0,004 do header và thành phần nổi khi cuộn.

Source commit: https://github.com/ngocnhanvo/marineaqua-astro/commit/c518083c54761752a66360808eb5725c7b9388df
Production deploy: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43136036466 (attempt 2, success).
Browser comparison: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43138875630

Lưu ý: Full Playwright suite báo FAIL vì hai bài kiểm thử không liên quan: category scroll anchor và Home_00 banner image. Targeted CLS test đã PASS, hai mục khác chưa được sửa.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
