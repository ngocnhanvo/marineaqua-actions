# Marine Aqua — Rà soát timeout Get Product Logs (2026-11-12, Asia/Ho_Chi_Minh)

Project: marine-aqua.vn
Repository: ngocnhanvo/marineaqua-actions
Branch: main

## Kết quả
- Xóa logs sau deploy thành công đã xử lý: **không làm lại, không sửa cơ chế acknowledge**.
- Xác nhận Astro `src/lib/utils/fetchWithDiagnostics.ts` dùng AbortController timeout 30 giây, retry tối đa 3; `src/lib/wordpress/products/index.ts` gọi một lần `/wp-json/astro/v1/get-product-logs` khi có raw cache.
- Run 43242841647 SUCCESS: request đầu timeout, lần sau thành công; giai đoạn Products 355 changed, 202.399 giây (gồm cả fetch và xử lý).
- Run 43244690678 FAILED: Get Product Logs timeout cả 3 attempts và thất bại tại Build Astro Production.
- **Đã tìm thấy endpoint PHP** trong `wp-content/plugins/github-trigger/products/endpoint.php`. Endpoint đọc `vcs_astro_event_logs` (WP option), gộp theo product ID, gọi WP REST nội bộ theo nhóm 50 ID nhưng trả một response duy nhất sau khi đã xử lý tất cả nhóm. Đây là điểm nghẽn phù hợp với đề xuất phân trang HTTP.
- Log `id` là **product ID**, `event_id` là UUID; không có ID log tăng dần. Đề xuất cursor theo product ID được sort, fingerprint snapshot để phát hiện thay đổi lúc fetch, kiểm tra không thiếu/trùng chunk.
- PHP `vcs-build-trigger.php` đã có snapshot và acknowledge logs sau build SUCCESS, giữ nguyên. Đã có `Server-Timing` với `wp_total`, `rest`, `db_queries`; ưu tiên tận dụng trước khi thêm telemetry.
- Giữ incremental `getDataFromLogs.ts` và `modify`/`del`; chỉ áp dụng kết quả cache khi lấy đủ chunk. Chọn batch ban đầu 25–50 và đo; không chỉ tăng timeout.
- **Chốt phát hành:** `scripts/marineaqua-php-live-release.py` hiện có allowlist và **chưa deploy** `wp-content/plugins/github-trigger/products/endpoint.php`. Khi được giao triển khai sửa API, phải cập nhật manifest, kiểm tra PHP syntax/test, deploy backend tương thích cũ trước khi deploy Astro.
- **Phạm vi lượt này:** chủ dự án chỉ yêu cầu kiểm tra/đánh giá ý kiến agent. Không có commit sửa source Astro/PHP hoặc build/deploy mới cho lỗi này.

## Đề xuất kiểm thử khi triển khai
0 logs; 1 log; >50 logs; modify; del; published product thiếu payload; snapshot đổi giữa các chunk; trùng/thiếu chunk; compatibility request GET không có page/cursor; cache chỉ cập nhật sau khi đầy đủ dữ liệu.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
