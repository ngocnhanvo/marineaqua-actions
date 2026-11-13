# Checkpoint — Tài khoản và tên sản phẩm trong giỏ hàng

- Project: marine-aqua.vn
- Updated: 2026-11-13 20:34 +07:00 (Asia/Ho_Chi_Minh)
- Code mode: auto-build
- Source write gate: bypass
- Status: PARTIAL — production và main live QA 28/28 PASS; đang kiểm tra riêng một trạng thái payment unavailable trên mobile.
- Frontend: https://marine-aqua.io.vn
- WordPress: https://admin.marine-aqua.io.vn

## Yêu cầu và phạm vi

Giữ tên sản phẩm chính, bỏ đoạn tên màu xanh bị lặp dưới tên chính trong Cart và Checkout. Không cắt mất phần tên chính khi xuống dòng; giữ dữ liệu và bộ chọn biến thể. Làm icon tài khoản cạnh giỏ hàng bấm được, dùng WordPress Page thật và luồng đăng nhập hiện có. Mobile có mục Tài khoản trong menu.

Hover/badge và dòng “Phí giao hàng: Thỏa thuận” đã DONE ở các checkpoint trước. Không lặp lại migration, tạo lại Cart/Checkout/Done hoặc thay pipeline production.

## Source đã triển khai

| Repo / branch | Commit | Nội dung |
|---|---|---|
| ngocnhanvo/marineaqua-astro / master | d5a3ec034cf43682851ca84ee7e9a7f341d7b96a | Tên sản phẩm, account Page/form/navigation, phiên khách hàng có chữ ký, API auth/orders được kiểm tra identity |
| ngocnhanvo/marineaqua-astro / master | ae45df69316e554f125e6f3d4aae5d66d429694b | HEAD production cuối; private/no-store và Vary Cookie cho dispatcher SSR giỏ hàng/thanh toán/receipt |
| ngocnhanvo/marineaqua-php / master | 073ecf89d30243625d8433ec5f386b44e5bd12e3 | Chuyển đăng ký login ra khỏi module chỉ nạp cho CoCart, kiểm tra credentials qua WordPress |
| ngocnhanvo/marineaqua-actions / main | ef2b863ef9d24da6422d321bebf25cd568c73299 | QA scope account-cart, bảo toàn full/shipping-fee scopes |

Source ASTRO trước task: 2668d2876f29775e5f552c05aa595daa15903f25. PHP trước task: 9855763bf7319b18c9e36f86db5430ace39e6d66.

## Tài khoản và quyền riêng tư

- AccountPage là SSG chrome công khai; profile tải qua API private, render bằng textContent. Preview không gọi auth/private API.
- Cookie khách hàng có HMAC và thời hạn, key tách theo purpose/origin từ WOO_SECRET server hiện có. Không thêm env/secrets. Cookie JSON cũ không còn được coi là đăng nhập; cần đăng nhập lại.
- Login chỉ ký identity sau WordPress success và positive safe-integer ID. Orders bắt buộc customer ID đã xác minh và kiểm tra customer_id trong response. Không kiểm thử khai thác hoặc đọc đơn hàng thật.
- PHP login dùng wp_authenticate và metadata projection giới hạn; không tạo WP cookie, user, order hoặc email. Giữ _billing_chuthe và _billing_cccd. Không đổi context loader, MU optimizer hoặc plugin policy.
- SSR dispatcher là nơi duy nhất đưa customer profile vào HTML checkout; cùng dispatcher bảo vệ receipt. Bổ sung private/no-store + Vary Cookie ở đây, giữ nguyên cache dữ liệu CMS.
- Chưa thử đăng nhập bằng tài khoản khách hàng thật. Các positive auth cases dùng synthetic mocks; kiểm tra API route metadata thật đã PASS.

## WordPress Page đã xuất bản

Bootstrap account-only: run [43432642340](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43432642340), job 131909721245 — SUCCESS.

Inventory authenticated status=any: 18 Pages trước ghi, không có account/login candidate. REST index xác nhận /custom/v1/login có POST. Tạo/publish/readback đúng một Page:

- ID: 83459
- Slug: tai-khoan
- Title: Tài khoản
- Key: account
- Action: AccountPage
- product_lang: vi
- Content: rỗng
- Cleanup remaining: 0

Không sửa các Page Cart/Checkout/Done hoặc WordPress Menu. Không cần native SSR rewrite mới vì account dùng SSG route glob hiện hữu.

## Kiểm thử và phát hành đã PASS

- Astro CI: run [43382064682](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43382064682), job 131912131541; source ae45df69316e554f125e6f3d4aae5d66d429694b. 346 tests / 38 files PASS, Astro check 0 errors, 0 warnings. Có 58 auth/session regression cases mới.
- PHP release: run [43432346687](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43432346687), job 131908712236 — SUCCESS. Login 10 nhóm mock PASS; checkout/payment regression PASS. FTPS chỉ thay hai file PHP liên quan, hash readback PASS, 12 files checked. Bridge 43432303874 SUCCESS.
- Initial Astro release d5a3ec0: run 43432981117 / bridge 43432948583 — SUCCESS. Không chạy lại checkpoint này.
- Final Astro release ae45df6: run [43433564180](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43433564180), job 131912829745 / bridge 43433521485 — SUCCESS. ASTRO_BUILD_COMPLETE, ASTRO_OUTPUT_VALIDATION, FTPS_UPLOAD và SIGNED_UNZIP_SUCCESS đều PASS.
- Pipeline production, source branch policy, env/secrets, target, FTPS, signing, rollback và locks giữ nguyên. PHP allowlist thêm module login và test step trong workflow hiện có; không tạo pipeline khác.

## Main live QA đã PASS

Run [43433898583](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43433898583), job 131913988581, QA source ef2b863ef9d24da6422d321bebf25cd568c73299 — SUCCESS, scope account-cart, 28/28 named checks PASS.

Desktop 1366×900 và mobile 390×844: actual Header/menu account navigation tới Page83459; guest và invalid-cookie API trả object rỗng, no-store. Positive login/profile/logout dùng browser mocks, được đánh dấu simulated. Tên sản phẩm chính xuất hiện một lần tại Cart/Checkout; shipping link và tổng tiền khớp. Bốn response HTML Cart/Checkout thực tế có Cache-Control private, no-store, max-age=0 và Vary Cookie,Accept-Encoding,User-Agent.

Cleanup: hai giỏ tạm, mỗi giỏ xóa 1 item và readback remainingItems=0. Checkout POST/order requests/real orders đều 0. Simple-product fixture; variation branch N/A.

Artifact14043125444, cart-checkout-live-qa, SHA256 dda50014f305f6ebed8e7621b3430b152fa1ed8fa394bee82282458a5a773a55. Đã download và đối chiếu digest. Tám ảnh đã được xem, không thấy lỗi tên/layout/profile trong phạm vi thay đổi.

## Điểm tiếp tục — payment readiness riêng trên mobile

Ảnh mobile-account-checkout.png có cảnh báo không tải được phương thức thanh toán, trong khi desktop có onepayUS và chuyển khoản. Main QA kiểm tên/privacy/shipping nhưng không assert gateway readiness; vì vậy KHÔNG suy main QA28 PASS thành payment-ready.

Đã so sánh source trước/sau: CheckoutPage, paymentMethods.ts, PHP payment-gateways.php không đổi. Loader server-side chỉ nhận avas, không nhận cart, cookie, UA hay viewport; GET Woo payment_gateways có timeout10s và cache:no-store từ trước. Auth module chỉ áp dụng login route; private HTML headers không đổi outbound gateway request. Timing phù hợp lỗi upstream tạm thời nhưng chưa chứng minh nguyên nhân timeout.

Actions agent đang chuẩn bị scope checkout-readiness trong workflow QA hiện hữu: mobile GET /thanh-toan chỉ đọc, không tạo cart, không auth/order/mutation. Empty-cart submit disabled là đúng; chỉ chứng minh gateway configuration hiển thị. Cho phép tối đa một GET mới khi trạng thái unavailable rõ ràng, ghi cả lần đầu và outcome.

Bước tiếp theo:
1. Review/commit scope QA hẹp này, chờ run hoàn tất; không chạy lại main28 hoặc production nếu không có lỗi source thật.
2. Xác nhận radio payment methods hiển thị/khớp cấu hình và warning không còn; xem ảnh, ghi hạn chế nếu không phục hồi.
3. Cập nhật checkpoint DONE với run/artifact mới và ghi nguyên văn phản hồi cuối vào chatgpt/latest-response.md; verify SHA/content trước khi kết thúc.
