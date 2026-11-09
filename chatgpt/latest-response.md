# Marine Aqua — checkpoint 2026-11-09 (Asia/Ho_Chi_Minh)

Project: Marine Aqua; frontend https://marine-aqua.io.vn; WordPress https://admin.marine-aqua.io.vn.
Application source branch is `master` for Astro and PHP. Automation repo uses `main`.

## Verified current repository HEADs

- `ngocnhanvo/marineaqua-astro/master` = `35422f814908421a816b1663a2e49ec736563974`
- `ngocnhanvo/marineaqua-php/master` = `54574851f0eaea9e40341b36c5a7215573bc436e`
- `ngocnhanvo/marineaqua-actions/main` = `031129f13d604b4c6f3ff80e7674595ee4f978dc`

## Completed this continuation (do not repeat)

1. Verified live PHP over encrypted FTPS; 10/10 selected WordPress/PHP files matched source. FTP read-only audit run [42636845979](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42636845979) PASS.
2. Diagnosed live build preflight: the public `marineaqua-unzip-v2.ready` contained `TEMPLATE_ASTRO_UNZIP_PROTOCOL=2` instead of the Marine Aqua marker. The signed endpoint initially returned HTTP 403 on frontend target lock; no CMS write was performed in this continuation.
3. Corrected marker in PHP master commit `6cc25c78988fb8856b148a66ae39eb88f735aa27`, corrected an inherited PSE-only regression test in `54574851f0eaea9e40341b36c5a7215573bc436e`. Deployed only the marker via existing protected PHP FTPS release [42641150259](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42641150259) PASS. Other six release files unchanged. Restored PHP release workflow to manual-only dispatch afterward.
4. Read-only production configuration/preflight run [42641417400](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42641417400) PASS: ENV_FILE WordPress/frontend origins correct; public marker HTTP 200 with correct content; signed PHP `action=check` HTTP 200, authenticated and target accepted; WordPress public REST published domain matches frontend. PHP FTPS audit 10/10 files still matched.
5. Added an isolated Astro production-equivalent build workflow with **NO DEPLOY**. Fixed the inherited Astro Contact_00 apostrophe parser defect, wrong/missing quote translation import, Vitest file improperly inside `src/pages`, missing React navigation and button modules, missing effects export, WordPress category/info type declarations, builder Page ID comparisons, UI toast store types, Astro Locals declaration and other typecheck problems. Moved `src/pages/api/contact/contact-config.test.ts` to `src/tests/contact-config.test.ts`, preserving its actual test.
6. Astro source CI run [42643651211](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42643651211) **SUCCESS**: 29 test files, 199/199 tests PASS, `astro check --js-only` 0 errors, 0 warnings (96 hints). Prior 27 inherited typecheck errors are resolved on the verified Astro HEAD.
7. Isolated real WordPress-data Astro build [42643660605](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42643660605) **SUCCESS** with compiled client, server entry, and SEO output, no ZIP upload or production deploy.
8. The build previously logged `WordPress chưa có menu Header hợp lệ, đang dùng src/data/menu.json fallback`. The local fallback `src/data/menu.json` is `[]`. Added a post-build **Header readiness gate** (without weakening source CI); run [42644162615](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42644162615) compiled Astro successfully but failed intentionally in the gate with `CMS_HEADER_MENU=FAIL missing_locales=vi`, `published_locales=1 usable_header_locales=0`.

## Exact next checkpoint / blockers

- **Required:** Create/verify the real `Header` menu in the active WordPress CMS for published locale `vi`, with actual project-approved navigation items. Do not ship an empty menu or populate it from template tenant data. Do not silently keep `src/data/menu.json` fallback in production. Inspect available published WordPress Pages/route mapping before creating menu. After CMS menu is verified, remove fallback per Knowledge and rerun source checks, isolated build and Header readiness; then obtain real browser QA before production deploy.
- **Do not conflate:** `ASTRO_BUILD_SUCCESS=PASS`, `SOURCE_CI=PASS`, but `DEPLOY_READY=FAIL` because missing CMS Header menu; `QA_PASS` and `DEPLOYED` have not occurred.
- **No Astro production deployment** was triggered during this continuation. One controlled PHP FTP marker update completed; WordPress database/content was not changed.
- The latest production-oriented build gate lives at `.github/workflows/marineaqua-astro-build-qa.yml`; source suite at `.github/workflows/marineaqua-astro-ci.yml`; PHP/FTPS audit at `.github/workflows/marineaqua-php-ftps-audit.yml`.
- Code mode: `auto-build`. Source write gate: `bypass`.
- Overall status: PARTIAL — WordPress Header menu and production/browser QA remain incomplete.
