# Checkpoint — Tài khoản và tên sản phẩm trong giỏ hàng

- Project: marine-aqua.vn
- Updated: 2026-11-13 20:30 +07:00 (Asia/Ho_Chi_Minh)
- Code mode: auto-build
- Source write gate: bypass
- Status: PARTIAL — source, CMS và production đã cập nhật; live QA đang chạy.
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

## Điểm tiếp tục bắt buộc

Live QA run [43433898583](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43433898583), job 131913988581 đang in_progress tại thời điểm ghi. Scope account-cart; source QA ef2b863ef9d24da6422d321bebf25cd568c73299.

1. Chờ run này hoàn tất, đọc report/log; không trigger hoặc deploy lại nếu chưa có lỗi thật.
2. Kiểm chứng desktop/mobile: actual account navigation, guest API, negative cookies; positive login/profile/logout chỉ browser mocks. Cart/Checkout một tên chính, controls còn hiển thị, shipping/totals khớp và response headers private/no-store/Vary Cookie.
3. Xác nhận checkout POST/order requests bằng 0; giỏ QA tạm được xóa và readback 0 item. Fixture simple product, nhánh variation phải ghi N/A, không khai PASS chưa chạy.
4. Download artifact, đối chiếu digest và xem ảnh; sửa đúng lỗi nếu có, sau đó cập nhật checkpoint này thành DONE.
5. Ghi nguyên văn phản hồi cuối vào chatgpt/latest-response.md, đọc lại SHA/content rồi mới kết thúc lượt.

