# Marine Aqua — Audit đường kích hoạt workflow dự phòng (2026-11-13, Asia/Ho_Chi_Minh)

Project: marine-aqua.vn
Repo: ngocnhanvo/marineaqua-actions@main

## Phát hiện quan trọng
- Knowledge `core/07-execution-and-checkpoints.md` có runbook A-D: (A) POST dispatch có quyền, (B) WordPress Build Website qua UI đã đăng nhập, (C) workflow cầu nối đã tồn tại, (D) rerun chỉ khi tương đương SHA/payload. KHÔNG được dừng chỉ vì connector thiếu dispatch.
- Chế độ `auto-build` và cổng `bypass` cho phép deploy trong phạm vi được duyệt, **không phải nguyên nhân gây BLOCKED**.
- **Cầu nối có thật:** `.github/workflows/marineaqua-shared-playwright.yml` job `trigger-production-build-after-header` phát `repository_dispatch wp_trigger_build` tới workflow production. Job ID `130370217689` của run `42974470922` từng SUCCESS; job ID `130368597841` của run `42973955210` từng SUCCESS. Job chỉ kích khi push main chứa file trong paths trigger và HEAD commit message là `build: deploy approved WordPress Header menu` hoặc `build: deploy restored Home_00 banner`. Không được tạo commit giả/đổi trigger để chạy.
- **Rerun job cũ là một công cụ có thật**, cần xác minh tính tương đương ref/SHA/payload và guard trước khi dùng. Cầu nối Astro này KHÔNG thay thế PHP release cần làm trước. Không tuyên bố tất cả con đường C/D không tồn tại.
- **PHP production vẫn chưa triển khai endpoint phân trang.** Workflow PHP hiện tại `.github/workflows/marineaqua-php-release.yml` chỉ `workflow_dispatch` với `confirm=DEPLOY_PHP`. Run PHP thành công cũ `42641150259` ngày 2026-11-09 là event push tại Actions SHA `f784357b...`. Script `scripts/marineaqua-php-live-release.py` tại SHA đó **chưa có** `wp-content/plugins/github-trigger/products/endpoint.php` trong FILES, nên rerun job cũ không phát hành được bản vá hiện hành. Script HEAD mới có endpoint.
- GitHub connector: GET, fetch, update, rerun job; không có POST workflow_dispatch/repository_dispatch. Container không có gh CLI/credentials. WP browser/session chưa được kết nối. Không có queued/in_progress run tại lượt kiểm tra.
- Phần code/CI đã PASS: PHP HEAD `d401337`, Astro HEAD `479f79e`; run #43267657238 và #43267666534. Last production Astro run #43244690678 failed trước deploy.

## Đánh giá đúng nguyên nhân
- Phương án A: thiếu tool POST/token, không đồng nghĩa thiếu GitHub write.
- B: không có UI authenticated trong phiên.
- C: có bridge limited to specific legitimate CMS header/banner changes, không phù hợp trực tiếp cho PHP pagination; cấm commit no-op để kích hoạt.
- D: PHP run cũ dùng code Actions không upload endpoint. Astro bridge rerun chỉ đánh giá sau khi PHP mới lên live, không dùng để vượt qua bước PHP.
- Hạn chế thật: **chưa có đường hợp lệ trong công cụ phiên hiện tại để chạy PHP workflow hiện hữu với Actions script mới**. Cần công cụ có quyền `workflow_dispatch` trên `marineaqua-actions` hoặc phiên WordPress/runner phù hợp để triển khai PHP, rồi mới kích hoạt Astro production và QA.

## Trạng thái
Không thực hiện deploy/rerun; chỉ kiểm tra Knowledge, workflow source, lịch sử run/job và script tại historic SHA.
Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
