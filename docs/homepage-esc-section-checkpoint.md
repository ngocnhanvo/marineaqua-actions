# Marine Aqua - WordPress homepage ESC Table checkpoint

Date: 2026-11-11 (Asia/Ho_Chi_Minh)
Project: marine-aqua.vn
Astro: ngocnhanvo/marineaqua-astro master @ 2b4b4b2ee0c24f4e5e59115aafdd7cf61d6af1a3
PHP: ngocnhanvo/marineaqua-php master @ 54574851f0eaea9e40341b36c5a7215573bc436e
Actions: ngocnhanvo/marineaqua-actions main
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
