# Marine Aqua — latest response

- Checkpoint: 2026-11-12 11:07+07, mobile promotion label alignment.
- Latest Astro master: c2221994ab173348395894091e5e749790510164.
- Latest Actions main before checkpoint: 50f24282f59959ae5950fd0fb2e16c438eb39d21.
- User reported mobile "Khuyến mãi" text appears 10px further right than sibling items after previous star migration.
- Root cause: `src/styles/marine-aqua-approved.css`, selector `#mobile-menu-container li[data-marine-sale] .marine-sale-caption` had `margin:3px 10px`. Changed to `margin:0`; decorative stars remain absolutely positioned.
- Change commit: https://github.com/ngocnhanvo/marineaqua-astro/commit/c2221994ab173348395894091e5e749790510164.
- CI source check: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43124177120 latest attempt SUCCESS.
- Production deploy: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43136036466 attempt 8 SUCCESS; deployed exactly c222199, `ASTRO_BUILD_COMPLETE=PASS`, `FTPS_UPLOAD=PASS`, `SIGNED_UNZIP_SUCCESS`.
- No additional browser pixel alignment assertion was executed for this specific margin change; do not fabricate a screenshot PASS.
- Previous mobile promotional stars and nested product category dots already passed production Playwright at 390px and 768px, do not redo.
- Unrelated still-open QA: category scroll-anchor and Home_00 banner failures; Lighthouse CSP Best Practices investigation.
- Current user request: DONE, narrow CSS alignment fix released.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
