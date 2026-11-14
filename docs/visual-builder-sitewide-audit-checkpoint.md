# Marine Aqua — Sitewide Visual Builder and local ESC audit checkpoint (2026-11-14 ICT)

## Verified source
- Knowledge main: 1b5aab9e2f8b2fccb42947a74a48df6d9761570f
- Astro master: 036676f02d3b9afe9275afc58c0e50a2dae2145e
- PHP master: 2413dbff883307c1152ffd55318408b9bf010f14
- Actions main: c84d9501bf22e39d43bf35e86f19753ba39c186b
- Previous scoped contact completion: docs/contact-semantic-visual-builder-checkpoint.md; QA run 43542223866 success, canonical release 43542023346 success.

## New actions and evidence
- Extended existing read-only WordPress inventory script to list up to 1000 CMS Page records and list semantic ESC shortcodes; source commits a2eefff, syntax fix c84d950.
- Initial run 43544133278 failed node --check due escaped regex, fixed before touching WordPress.
- Corrected read-only QA run https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43544215923 SUCCESS; artifact 14093246698 and job logs show writes=0, errors=[], 19 published Pages.
- 2 pages have ESC shortcode: lien-he (contact_semantics_vi) and trang-chu (home_00, home_04 through home_08). Contact rawShortcodeCount=2 includes preview representation; do not infer duplicate CMS shortcode without native parser.
- 5 accessible local Product sources home_04 through home_08, count=4 each, can_add=true.
- ProductCategory/Page source counts both 0 in authenticated Builder item-schema inventory, NOT evidence that these source APIs are broken: tables contact_semantics_vi, home_03, khuyen_mai_01 return 403 editor_table_denied under the ticket currently scoped to Page 82454. Need audit per Page ticket and compare native TablePress REST.
- Real home_03 TablePress exists but Page shortcode inventory does not list home_03, investigate actual current page source and intended home category section before any mutation.
- Information Pages chinh-sach-doi-tra-hang, thong-bao, huong-dan-mua-hang-o-xa, huong-dan-mua-hang-tai-nha, thoi-gian-ban-hang have WordPress editor content, not native ESC shortcodes. Validate editing in Visual Builder using correct editor selection (not assume uneditable solely because no ESC table).
- Special real WordPress Pages gio-hang 83449, thanh-toan 83451, dat-hang-thanh-cong 83453, tai-khoan 83459 have empty editor content and no native ESC shortcodes. Per Knowledge these Page types require native semantic ESC Table for labels, placeholders and states, preserving transaction/auth API ownership.
- PostsPage and ProductsSSRPage dynamic listing pages are not automatically failures merely because no ESC table; separate semantic labels from API-owned dynamic content.

## Next exact non-duplicate steps
1. Audit authenticated Visual Builder for each 19 Page using its own Page ticket, source coordinates and editable Page Editor/ESC controls. Check actual WordPress Header menu destinations first; classify Page-level semantic strings, shared components and readonly API data independently.
2. For special transaction Pages above, inspect Astro SSR/action text inventory and existing PHP Builder registry, create/reuse genuine WordPress ESC Table per Page with stable key/label (key readonly), Insert Code via native WordPress Classic/Visual Editor; preserve Page identity and all business API workflows. Save → native REST readback → Builder Preview → production QA; minimal WRITE_SCOPE and rollback.
3. For existing local Product/ProductCategory/Page TablePress references, test real per-Page permissions, item picker, source/target red/green selection, cancel, add/remove/swap, save/readback/reload. Do not mutate WooCommerce Product/Category/Page source records. Separate frontend UI PASS from CMS write PASS.
4. Resolve missing home_03 shortcode only with verified native Page and intended layout/source contract; do not blindly insert or duplicate.
5. Run existing Actions QA and canonical production pipeline only when source/CMS actually changes, then verify correct live SHA, desktop/mobile and no horizontal overflow.
6. Continue without rerunning already SUCCESS contact and five-brand Product tests absent a regression.

## State
CODE_AUDIT_PASS, LIVE_READONLY_INVENTORY_PASS; SITEWIDE_BUILDER_QA_PENDING, SPECIAL_PAGE_SEMANTIC_MIGRATION_PENDING, LOCAL_REFERENCES_WRITE_QA_PENDING. No deploy or CMS writes during this continuation.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
