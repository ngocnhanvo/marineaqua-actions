# Marine Aqua — latest response

- Checkpoint: 2026-11-12 11:35+07, seamless mobile header/menu join.
- Astro PRODUCTION master: 2ed3f233ae88c6aff5d7c5f36970c1457f1bea14.
- Actions main: 2288de39b8df7c8c9f575d502964d1939fc46c4b before this checkpoint.
- WordPress/PHP unchanged.

## Change and cause

The mobile menu was opening separated from the bottom edge of the brand header, exposing a strip of the homepage banner. The extra offset was due to positioning the absolutely positioned menu relative to the header shell in the non-fixed state rather than the actual edge of the brand bar.

- CSS `src/styles/marine-aqua-approved.css`, commit 358a2519: the open menu shell becomes the positioning context; menu aligns at `top:-1px` in nonfixed mode; fixed mode aligned at `top:73px`; bottom corners keep rounding; drop shadow softened; a 3px white-to-blue overlay conceals the boundary without creating a new gap.
- CSS source regression test `src/styles/marine-aqua-approved.test.ts` commit 2ed3f233.
- Actions read-only Playwright script `scripts/marineaqua-live-readonly.mjs` commit 2288de39: measures headerBottom and menuTop at 390px/768px, requiring absolute difference <=3px while retaining previous menu visual checks.

## Evidence

- CI https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43124177120 (latest attempt): SUCCESS.
- Production deploy https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43136036466 attempt 10: SUCCESS; exact deployed Astro SHA 2ed3f233, ASTRO_BUILD_COMPLETE=PASS, FTPS_UPLOAD=PASS, SIGNED_UNZIP_SUCCESS.
- Production read-only Playwright https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43155246138: targeted `MARINEAQUA_MOBILE_MENU_VISUAL=PASS`. At 390px and 768px headerBottom=87px, menuTop=86px, seam delta=-1px. Previously verified sale stars, category dot icons and category item alignment remain PASS.
- Full site diagnostic still FAIL due separate known category scroll-anchor and Home_00 banner issues. No new defects attributed to this header/menu change.

## Existing backlog unchanged

- Category scroll-anchor reset.
- Home_00 banner media/navigation.
- Lighthouse Best Practices CSP.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
