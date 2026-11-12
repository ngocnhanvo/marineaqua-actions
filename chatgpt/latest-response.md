# Marine Aqua — latest response

- Checkpoint: 2026-11-12 10:55+07, mobile promotion stars and nested product-category dot icons.
- Astro: ngocnhanvo/marineaqua-astro@master 392091c5127554a04d2ed1b6301127f688165b8a
- Actions: ngocnhanvo/marineaqua-actions@main 7b41192d712c4bc4829941f1e85ac4e05b2bc8d5 before checkpoint.
- WordPress/PHP unchanged. Source branch for Astro/PHP is master, Actions main, Knowledge main.
- Owner request: Mobile Khuyến mãi must match desktop's three twinkling stars, remove pink background; nested product category labels use small dots instead of vertical rail. DONE.

## Implemented

1. MobileBranch.astro (commit e1699b5): removed mobile sale lightning SVG and use same three aria-hidden stars as desktop, keeping genuine WordPress sale detection and links.
2. MobileProductCategoryBranch.astro (commit e7ea7a1): nested nodes (depth > 0) use dot instead of category-card icon; top-level icons stay unchanged.
3. marine-aqua-approved.css (commit 76cb4e7): transparent sale background, red text and matching star animation with reduced-motion support; nested category dots 6px and no vertical rule, including 'Xem tất cả' rows.
4. marine-aqua-approved.test.ts (commit 392091c): new source regression assertions.
5. Actions scripts/marineaqua-live-readonly.mjs (commit 7b41192): read-only post-deploy visual checks on 390px/768px.

## Verified

- Source CI https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43124177120 (latest attempt): SUCCESS on Astro 392091c; 213/213 tests PASS and astro check 0 errors/0 warnings.
- Production release https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43136036466 attempt 7 SUCCESS; deployed exactly Astro SHA 392091c, FTPS_UPLOAD=PASS and SIGNED_UNZIP_SUCCESS.
- Browser QA https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43150745342: targeted MARINEAQUA_MOBILE_MENU_VISUAL=PASS for width 390 and 768, with 3 stars, twinkle animation, boltCount=0, sale background rgba(0,0,0,0), no image background; nested 14 dot icons, 6px each, no old SVG and borderLeft=0px. Overall QA workflow failed on preexisting category scroll anchor / Home_00 banner diagnostics unrelated to this change.
- Existing desktop sale visual check MARINEAQUA_SALE_SPARKLES=PASS.

## Other open work (unchanged)

- Separate existing category scroll-anchor reset to zero.
- Existing Home_00 image and mobile slide-navigation QA failures.
- Lighthouse Best Practices CSP investigation pending.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
