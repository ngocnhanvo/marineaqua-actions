# Marine Aqua — Product logs HTTP pagination (2026-11-13, Asia/Ho_Chi_Minh)

Project: marine-aqua.vn
Repository roles: ngocnhanvo/marineaqua-astro@master, ngocnhanvo/marineaqua-php@master, ngocnhanvo/marineaqua-actions@main

## Đã kiểm chứng
- Root cause của build fail 43244690678: Astro abort request `get-product-logs` sau 30s, PHP xử lý tất cả groups 50 nhưng trả chung một HTTP response.
- PHP endpoint `wp-content/plugins/github-trigger/products/endpoint.php`: pagination HTTP theo `limit` (1–50) + product-ID `cursor`, SHA256 `snapshot`; `409` nếu logs thay đổi giữa các chunk; response không có `limit` vẫn là legacy array. Giữ `modify`/`del` và published missing fail closed. PHP HEAD `d4013371fbfaa072ad2508a0dfe6d5163a578052`.
- Astro `src/lib/wordpress/products/productLogPagination.ts`: mặc định page 25, validate metadata, total, snapshot, monotonic ID, duplicate/missing cursor; chỉ gọi `getDataFromLogs` khi fetch đủ; có fallback khi PHP cũ trả legacy array. Astro HEAD `479f79e4356660387d8271bfdca4b76bef461026`.
- Test PHP endpoint: `PRODUCT_LOG_PAGINATION_CONTRACT=PASS` với 56 records, 3 pages 25+25+6, legacy, change snapshot, del, missing publish, zero logs. [PHP CI run 43267657238](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43267657238) SUCCESS.
- Astro CI: 32 test files, **226/226 PASS**, `astro check --js-only` PASS. [Astro CI run 43267666534](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43267666534) SUCCESS.
- Actions script `scripts/marineaqua-php-live-release.py` now allowlists `wp-content/plugins/github-trigger/products/endpoint.php`; Actions HEAD before this checkpoint commit `f885bd458704f040a4abf676f530156ce337a377`.
- **Không sửa** việc acknowledge/xóa logs sau build success trong `vcs-build-trigger.php` (đã hoàn tất từ chat trước).

## Chưa hoàn tất / blocker
- **PHP production chưa deploy.** Workflow `.github/workflows/marineaqua-php-release.yml` là manual-only `workflow_dispatch` yêu cầu input `confirm=DEPLOY_PHP`; connector GitHub hiện tại không có công cụ POST dispatch, không có browser WordPress có phiên đăng nhập, và không có run mới cùng SHA để rerun tương đương. Không sửa workflow trigger/commit giả để bypass.
- **Astro production chưa build/deploy bản vá.** Canonical `.github/workflows/marineaqua-production-deploy.yml` chỉ nhận `repository_dispatch wp_trigger_build` đúng site domain; thiếu công cụ POST, không dùng CI NO DEPLOY thay thế.
- Production HTTP readback thử qua public web tool không truy cập được, do đó **không báo** LIVE QA PASS hay đo tốc độ thật.
- Trình tự tiếp theo: (1) kích hoạt workflow PHP hiện hữu trên Actions main `confirm=DEPLOY_PHP` qua công cụ có quyền dispatch; chờ SUCCESS và kiểm tra API `?limit=25` trả metadata/chunk; (2) kích hoạt canonical Astro production `wp_trigger_build` qua công cụ có quyền/WordPress UI; chờ run đúng SHA và deploy success; (3) browser/REST smoke và đo Server-Timing của từng page; (4) chạy lại category parity sau deploy. Không chạy hai lần phần đã PASS.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
