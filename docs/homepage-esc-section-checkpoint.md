# Marine Aqua - WordPress homepage ESC Table checkpoint

Date: 2026-11-11 (Asia/Ho_Chi_Minh)
Project: marine-aqua.vn
Astro: ngocnhanvo/marineaqua-astro master @ aae07ca1d93463b932d8cb78186abb824f7e7a98
PHP: ngocnhanvo/marineaqua-php master @ 54574851f0eaea9e40341b36c5a7215573bc436e
Actions: ngocnhanvo/marineaqua-actions main @ e2a990792fa9c145500b90bc8584a0753e158e96 (observed before this checkpoint update)
WordPress target: https://admin.marine-aqua.io.vn
Frontend target: https://marine-aqua.io.vn
Original content source: https://marine-aqua.vn

## Completed and VERIFIED

- WordPress published Page ID 82454, slug `trang-chu`, `key=home`, `action=HomePage`, locale `vi`. Preserved all identity/ACF fields.
- ESC Table `home_00`: Banner trang chủ. Original banner was imported to target WordPress Media (verified attachment ID 82458), native ESC Table has image, REST readback PASS.
- ESC Table `home_03`: SẢN PHẨM. Schema `api-key, api-name, api-slug, api-img, api-children`. Source `ProductCategory` saved through native ESC Table admin and REST readback.
- ESC Table `home_04`: TROPIC-MARIN; `home_05`: PRODIBIO; `home_06`: PRODAC; `home_07`: RED SEA; `home_08`: CONTINUUM AQUATICS. Each schema `key, api-itemName, api-itemPrice, api-slug, api-itemImage`. Source `Product` saved through native ESC Table admin and REST readback. These headings come from an actual 2026-11-09 original-site capture, NOT from the template.
- All SEVEN IDs are real, independently persisted ESC Tables in WordPress; no fictitious product/category item rows.
- Native Classic Editor `Insert a ESC Table` button and its official WordPress TablePress Thickbox inserted each of the seven tables into the real Page. Exactly one shortcode per table, in order `home_00, home_03, home_04, home_05, home_06, home_07, home_08`. Native WordPress Update and reload/readback returned exact 7/7 and unchanged Page identity. [Run #42955216077](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42955216077) **SUCCESS**.
- `ProductCategory` / `Product` source settings (all six) Save/readback PASS and field/item integrity retained. [Run #42955292334](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42955292334) **SUCCESS**.
- No-deploy Astro build from REAL WordPress data: seven TablePress tables processed, production-equivalent build outputs verified, header WordPress-only contract PASS. [Run #42955622340](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42955622340) **SUCCESS**, NO FTP and NO DEPLOY.
- Source Astro design work from earlier approved version and tests exists; do NOT redraw or copy old-site assets into source.
- No Astro/PHP code edits during this section migration; only Actions scripts/workflow QA and WordPress CMS via authenticated native editor.

## Explicitly NOT complete

- At latest inventory, new WordPress had ZERO products and ZERO ProductCategories. All newly added `home_03`–`home_08` have zero selected source references/item rows. `meta.api` is configured correctly but does not magically populate them. DO NOT insert mock product/prices or legacy external hotlinks.
- Header WordPress Menu Manager returned zero Header items. Astro must continue to render empty; never restore `src/data/menu.json` fallback.
- Approved design Astro `master` has not been confirmed deployed to live frontend. The latest verified production deployment was an older Astro SHA `cac6245d3028c2dc4feed1c582fa3a9a0087d6f9` (deploy run #42646488138); live release marker has not been independently read.
- No browser visual QA has passed for the redesigned site on 1917/1440/768/390; existing live screenshot showed mostly blank main before migration.
- No new production build was triggered during this migration; no production release is claimed.

## Next exact actions - do not repeat passed tasks

1. Inventory original `marine-aqua.vn` Page/category/product SEO records and corresponding source filenames/media. Existing original reference artifact [run #42656236316](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42656236316) contains original product sections (4 sample products per 5 brand sections), titles/prices/legacy URL/image.
2. Migrate OWNED real product/category/media records into target WordPress/WooCommerce with native verified credentials, stable source IDs, SEO title/meta description readback, preserved filenames and local /wp-content/uploads paths, backups/rollback and idempotency per Knowledge migration rules. Do not publish unverified content or use template fixtures.
3. Populate/select appropriate actual target ProductCategory IDs and Product IDs in the ESC Table `home_03`–`home_08`, preserving each table's item ordering and Visual Builder reference semantics. Test Save, REST readback and preview, including image ALT and item ordering; readonly source Product fields.
4. Configure genuine WordPress Menu Manager `Header` items/locale/URLs, including sale item only when the real target exists. No fallback.
5. Run full Astro source and no-deploy build QA on current source/data; Playwright Visual Builder and frontend width 1917/1440/768/390, prove visual parity, source references, slider interactions, sale pill, prices and no missing/legacy images.
6. Once all release gates pass, use ONLY existing equivalent WordPress-controlled `marineaqua-production-deploy.yml` pipeline (auto-build authorization) and verify post-deploy provenance, smoke, network and rollback evidence. Do not create second deploy pipeline.

**Checkpoint status:** CMS_LAYOUT_AND_SOURCE_BINDINGS_PASS, ASTRO_BUILD_NO_DEPLOY_PASS; CONTENT_MIGRATION_NOT_STARTED, MENU_NOT_CONFIGURED, VISUAL_QA_NOT_TESTED, PRODUCTION_RELEASE_NOT_DONE. Overall PARTIAL.


## 2026-11-11 12:22 ICT — verified continuation, supersedes stale menu/deploy observations above

- Astro master head **aae07ca1d93463b932d8cb78186abb824f7e7a98**, changes top strip to use real WordPress address; approved source remains `design/approved/marine-aqua-v3-preview.html`.
- Header menu **HAS ONE real WordPress item**. Native CMS job [#42962595851](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42962595851) SUCCESS; idempotent job [#42962617672](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42962617672) SUCCESS with `HEADER_MENU_HOME=ALREADY_PRESENT`. Do **NOT** recreate this item.
- Latest read-only live verification [#42963502876](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42963502876) SUCCESS: REST 200 `Header.vi=1`, frontend desktop `Trang chủ` at `/trang-chu` returns HTTP 200, logo loaded, Quicksand font, no overflow, no page errors at 1917px; homepage has ESC sections; 390px responsive HTTP 200. The run reports `categoriesSlider=0` and `productPrices=0` (source content absent).
- Same latest CMS inventory job: WordPress target has exactly one published Page (`82454`, `trang-chu`) with seven table shortcodes; **0 Product** and **0 ProductCategory** records. Native ESC Tables remain seven. Thus extra Header destinations MUST wait until genuine target pages/categories exist and are verified; do not fabricate links or seed Astro fallback.
- Actual WordPress-controlled production deployment [#42956575859](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42956575859) SUCCESS via repository_dispatch; its release target SHA must still be checked independently before declaring approved current Astro source deployed. The older statement 'no deployment after migration' is superseded by this run.
- **Next non-duplicate work**: inventory original-site owned product/category/media with exact identity/SEO/image mapping, then migrate verified records idempotently to WooCommerce and bind `home_03`-`home_08` to true target IDs. After valid destinations exist, add remaining WordPress Header items and verify REST + frontend. Then run source tests/browser visual QA at 1917/1440/768/390 and production deploy through existing approved pipeline. Do not rerun already-successful page/table/header-Home creation.
- This update records read-only verification only, not content migration, visual acceptance, or complete release. **Overall PARTIAL.**

## 2026-11-12 01:39 ICT — verified five-brand homepage completion (supersedes old content/deploy status)

**Scope:** Populate and redesign five original homepage brand sections, migrate their real original products into WooCommerce, and deploy + visually verify them. This scope is now DONE; old notes above saying zero Products, empty section items, and unreleased Astro are stale.

- **Original owned product data:** read-only Playwright source inventory [#43068755791](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43068755791) SUCCESS: five brands in exact original order, four distinct product URLs each; extracted source names, price, availability, original uploads and SEO metadata. No synthetic prices or remote image hotlinks in final frontend.
- **WooCommerce import:** [#43073720639](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43073720639) SUCCESS: 20/20 products checked, 15 newly created and 5 reused across resumable attempts, original media copied to target WordPress Media Library, all selected prices and stock statuses read back. Two Continuum items are truly `outofstock`; source prices may differ from preliminary screenshots, so verified source fetch wins.
- **ESC Tables:** [#43076108508](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43076108508) and idempotent check [#43076154082](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43076154082) SUCCESS. WordPress `home_04` (TROPIC-MARIN), `home_05` (PRODIBIO), `home_06` (PRODAC), `home_07` (RED SEA), `home_08` (CONTINUUM AQUATICS): 4 real WooCommerce product IDs in each, correct order, `Product` data source, native Save + REST readback. Preserve these IDs/rows and WordPress ownership.
- **Astro source:** `ngocnhanvo/marineaqua-astro` `master` at `495b5c5c8b472423f87db05e604c5d09cd02194f`. Shared `src/astro/components/Home/BrandProductSection.astro` renders the five modern responsive brand sections; price red, localized product image, real detail URL, native catalog route `/san-pham/<brand-slug>`, and two `Hết hàng` badges derived from genuine WP `class_list` when `stock_status` is absent from WP REST.
- **Source QA:** [#43078868826](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43078868826) SUCCESS, includes unit tests + Astro check; **build QA** [#43078868838](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43078868838) SUCCESS, asserts 5 sections, 20 prices, 2 out-of-stock badges, 5 correct category URLs, real WordPress-only Header menu.
- **Production release:** existing sanctioned `marineaqua-production-deploy.yml` repository_dispatch run [#43046627406](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43046627406), attempt **12**, SUCCESS. Actual Astro source SHA `495b5c5c8b472423f87db05e604c5d09cd02194f`; `FTPS_UPLOAD=PASS` and `SIGNED_UNZIP_SUCCESS`. This is the current verified frontend release.
- **Post-deploy Playwright:** [#43079542940](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43079542940) SUCCESS; artifact `marine-aqua-live-home-brands-visual-qa` with desktop/mobile full-page screenshots and report. Widths **1440px and 390px** both show exactly 20 card links, 20 real prices, 20 loaded localized images, 2 out-of-stock badges, no horizontal overflow and no JavaScript page errors. All 20 detail URLs and 5 category landing URLs returned success; each category rendered exactly 4 product cards.
- **Follow-up outside this scoped migration:** the separately reported Lighthouse CLS `0.172` was explicitly deferred by the owner until more of the website is complete; no claim of CLS fix here. Other unrelated site-wide remaining work must be evaluated from current checkpoints independently, not assumed completed by the five-brand delivery.

**Status for this five-brand homepage task:** MIGRATION_PASS, ESC_TABLES_5_OF_5_PASS, SOURCE_QA_PASS, BUILD_PASS, PRODUCTION_DEPLOYED, LIVE_VISUAL_QA_PASS. **DONE**.


## 2026-11-12 — Footer xanh biển hoàn tất và kiểm thử production

- **Frontend**: `ngocnhanvo/marineaqua-astro` `master` commit `4e810079c85db6c2aebbaca47475d0e8ecae77d7`. Footer tại `src/astro/components/Layout/Footer.astro` dùng logo + công ty + địa chỉ + số điện thoại + email + Facebook + Google Maps từ WordPress Info theo locale; nền xanh ocean, đường sóng trắng ở viền trên, layout responsive ba cột (thu gọn mobile). Footer bỏ form liên hệ tư vấn, bỏ nội dung demo/nguồn website cũ, thay copyright `© 2026 Marine Aqua. Bảo lưu mọi quyền.`
- **WordPress thật**: `/lien-he` (Page ID 82580, `key=contact`, `action=HomePage`) và `/tin-kien-thuc` (Page ID 82582, `key=knowledge`, `action=HomePage`) được xuất bản có readback và cleanup kiểm tra trong Actions [#43123919314](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43123919314) SUCCESS. Trang tin kiến thức hiện là trang chờ nội dung, không giả bài viết. Bốn liên kết footer là `/lien-he`, `/tin-kien-thuc`, WordPress ACF `googlemaphanoi` và WordPress ACF `facebook`; địa chỉ external thực được đối chiếu với WP. Không hard-code social/map URL vào Astro.
- **Source tests**: [#43124177120](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43124177120) SUCCESS; **production-equivalent no-deploy build**: [#43124177071](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43124177071) SUCCESS với hai Page thực và bốn link.
- **Production**: đúng pipeline hiện hữu `marineaqua-production-deploy.yml`, run [#43121040405](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43121040405), attempt **2**, completed SUCCESS; source Astro SHA `4e810079c85db6c2aebbaca47475d0e8ecae77d7`, FTPS_UPLOAD=PASS, SIGNED_UNZIP_SUCCESS.
- **Post-deploy Playwright**: [#43125305109](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43125305109) SUCCESS; `FOOTER_LIVE_QA=PASS views=4 links=4 issues=0` at mobile **390**, tablet **768**, desktop **1440**, wide **1917**. No horizontal overflow, no JS errors; logo loads after entering viewport, external targets have proper rel/target, local Page URLs HTTP 200, copyright present, no footer form or demo disclaimers. Artifact `marine-aqua-live-home-brands-visual-qa` contains full-page brand screenshots and four footer screenshots.
- CLS performance audit was deferred by owner and is **outside** this footer delivery.

**Footer task status:** SOURCE_PASS, CMS_PAGES_PASS, BUILD_PASS, DEPLOY_PASS, LIVE_QA_PASS — DONE.
