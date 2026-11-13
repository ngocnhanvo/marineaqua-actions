# Marine Aqua — Header contact menu link (DONE)

## Scope
User reported new contact page `/lien-he` was not connected to the Header menu.
Project `marine-aqua.vn`; Astro `master`, PHP `master`, Actions `main`; Knowledge `main` source previously read. Code mode auto-build, source gate bypass.
Previous contact page layout checkpoint `docs/contact-page-checkpoint.md` DONE; do not rebuild the contact UI.

## Root cause and WordPress correction
WordPress Menu Manager Header/vi menu item **82509 Liên hệ** was present but had `linkType: none`, empty `href` and empty `slug`; it was rendered as noninteractive text.
Existing native menu UI was edited at `wp-admin/nav-menus.php`, retaining menu `Marine Aqua Header VI` and item ID.
The item now reads back from `/wp-json/esc-api/v1/menus` as `linkType: internal`, `href: lien-he`, `slug: lien-he`.
No duplicate item, no other Header item or hierarchy changes.
Native workflow `43455825353`, job `131989557118` **SUCCESS**. Readback: `MARINEAQUA_CONTACT_HEADER_MENU=PASS`, `changed=true`, `errors=[]`.
Source: `scripts/marineaqua-contact-header-menu.mjs`, workflow `.github/workflows/marineaqua-contact-header-menu.yml`.

## Publish
Astro source code unchanged at `afe994bb2cf47c3da78936d51c20b5c6edeabc84`; PHP unchanged.
Menu is cache/build-derived, therefore refreshed using existing production Astro pipeline.
Dispatch request `dispatch-requests/20261113T155000Z-contact-header-link.json`, commit `9beb0f52ab086687a66432f3594609495f1d4cdd`.
Dispatch bridge `43456195013` completed SUCCESS.
Production deployment `43456243983`, job `131991027486`, completed SUCCESS: expected source commit, ASTRO_BUILD_COMPLETE=PASS, ASTRO_OUTPUT_VALIDATION=PASS, FTPS_UPLOAD=PASS and SIGNED_UNZIP_SUCCESS at 2026-11-13 15:49:42 UTC. No second pipeline.

## Live QA
Focused Header navigation checks added to existing read-only `scripts/marineaqua-contact-page-live-qa.mjs`; latest QA script commit `83e6d27a108ce289a36ad8b2b14028161690080a`.
Auto-triggered runs before deploy or before QA regex correction failed; these are not accepted as final.
After deployment, `43456671923` job `131992512158` **SUCCESS**. `MARINEAQUA_CONTACT_PAGE_QA=PASS`.
Desktop 1366 and mobile 390: exactly one contact link inside respective header nav, correct `/lien-he` destination, real click and navigation, contact page H1, four WordPress common-info values equal footer, seller contact details, six links, no horizontal overflow.
All test requests are public GET; no orders, email, contact submission, accounts or cart mutation. No temporary objects/cleanup outstanding.

## Final
**DONE — Header contact link on desktop/mobile published and click-tested.**
Continue from this checkpoint, without repeating earlier contact page build or checkout work.
