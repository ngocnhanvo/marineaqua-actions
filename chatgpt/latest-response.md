# Marine Aqua — Tiếp tục phân trang product logs (2026-11-13 00:21, Asia/Ho_Chi_Minh)

Project: marine-aqua.vn
Repository: ngocnhanvo/marineaqua-actions@main
Ứng dụng: ngocnhanvo/marineaqua-astro@master / ngocnhanvo/marineaqua-php@master

## Bằng chứng mới nhất
- Astro HEAD `479f79e4356660387d8271bfdca4b76bef461026` — pagination/snapshot/cache; Astro CI #43267666534 `success`, 226/226 unit tests PASS, `astro check --js-only` PASS.
- PHP HEAD `d4013371fbfaa072ad2508a0dfe6d5163a578052` — `get-product-logs?limit=25&cursor=...&snapshot=...`, backward-compatible legacy array; PHP CI #43267657238 `success`.
- Actions HEAD trước lượt ghi này `8602ebcb4afd89aa378605aa4e9dd7a658eae960` — PHP allowlist includes `wp-content/plugins/github-trigger/products/endpoint.php`.
- Canonical production run gần nhất #43244690678 attempt 2 `failure` tại `Build Astro Production`, upload/unpack đều `skipped`; production success trước đó #43242841647, trước bản vá.
- GET Actions latest runs: không có `queued` hay `in_progress`; chưa có run PHP production sau bản vá.
- HTTP live `admin.marine-aqua.io.vn/wp-json/astro/v1/get-product-logs?limit=25` và frontend provenance: từ môi trường hiện tại không truy cập được (web tool inaccessible; container DNS unavailable). Không khẳng định LIVE_PASS.
- Xóa/ack logs sau deploy đã xử lý ở chat trước: **không sửa lại**.

## Đường triển khai đã kiểm
- PHP workflow `.github/workflows/marineaqua-php-release.yml` chỉ `workflow_dispatch` yêu cầu `confirm=DEPLOY_PHP`; checkout PHP `master` tại execution, dùng Actions script mới để upload via verified FTPS.
- Astro canonical `.github/workflows/marineaqua-production-deploy.yml` chỉ `repository_dispatch` `wp_trigger_build` và guard domain `WC_URL_CLIENT` (marine-aqua.io.vn), checkout Astro `master`; QA NO DEPLOY không được thay thế.
- GitHub connector hiện tại: GET run/jobs/log, git write và rerun job; **không có POST workflow_dispatch/repository_dispatch hoặc browser WordPress authenticated**.
- Rerun cũ không tương đương: production run cũ sẽ dùng PHP production chưa cập nhật; PHP manual run cũ nếu có không có Actions script allowlist mới. Không rerun mù, không tạo commit giả, không đổi trigger để bypass.
- WordPress app connector chưa được cài; không có CMS session/tool đã xác thực trong lượt này.

## Công việc tiếp theo
1. Kích hoạt PHP production workflow trên Actions/main bằng quyền dispatch `confirm=DEPLOY_PHP`, đợi `success`, kiểm tra REST `limit=25` thực sự trả object metadata.
2. Kích hoạt chính production Astro `repository_dispatch wp_trigger_build`, `client_payload.site_domain=marine-aqua.io.vn` hoặc WordPress Build Website có session hợp lệ; theo dõi đúng run ID, source SHA, upload/unpack.
3. Sau khi có `BUILD_SUCCESS` + `DEPLOY_READY`, chạy HTTP/browser QA, đo paginated response time & so với giới hạn 30s, check cache, category parity.
4. Không chạy lại unit tests đã PASS khi source không đổi.

## Phản hồi gửi người dùng
Đã đọc quy tắc Knowledge và kiểm tra HEAD, checkpoint, source, Actions runs/jobs. Bản vá PHP/Astro và 226 unit tests PASS. Chưa có PHP live release và production Astro build mới; build trước thất bại #43244690678. Không có run đang chạy/chờ, công cụ hiện tại thiếu POST dispatch và browser WP authenticated nên chưa thể kích đúng 2 workflow hiện hữu. Không thay workflow hoặc rerun sai SHA/payload. Bước kế: deploy PHP trước, xác minh REST paginated, rồi production Astro và live QA. Không làm lại phần xóa logs.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
