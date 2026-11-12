# Marine Aqua — latest response

- Checkpoint: 2026-11-12 ~10:41 Asia/Ho_Chi_Minh, fix consultation launcher second-click toggle and utility-button spacing.
- Site: https://marine-aqua.io.vn
- Astro: ngocnhanvo/marineaqua-astro@master db7378852d0c36b04df277aab153e369a8acd873.
- Actions: ngocnhanvo/marineaqua-actions@main 6bbc67c657600e712f13cb52151feb468a8fc290 before this checkpoint.
- WordPress/PHP unchanged.
- Prior widget delivered at Astro ea98d90, see earlier GitHub commits; current request DONE.

## Changes

1. `src/astro/components/Tool/ContactWidget.astro`: removed `closeContactPanel()` from the launcher `pointerdown` handler. The old pointerdown closed the panel before click, so click reopened it; now the existing click handler toggles open/closed. Close only on actual launcher drag once movement exceeds the threshold. Astro commit `a510d9a9`.
2. `src/astro/components/Layout/Layout.astro`: Back-to-top button moved from bottom 5.25rem / sticky 9.25rem to 7.5rem / sticky 11.5rem, centered horizontally at right 25px mobile / 33px desktop. This creates 31px vertical gap from the 65px consultation launcher in both sticky and default placement. Astro commit `db737885`.
3. `scripts/marineaqua-live-readonly.mjs`: added browser regression checks for second click CLOSE, third click REOPEN, and visibility/gap/alignment of two floating buttons on 390px and 1440px. Actions commit `6bbc67c`.

## Verification

- Astro CI: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43124177120 last attempt SUCCESS, source `db737885`.
- Production deployment: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43136036466 attempt 6 SUCCESS, source `db737885`, FTPS_UPLOAD=PASS, SIGNED_UNZIP_SUCCESS.
- Post-deploy Playwright: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43149429794, read-only live job concluded failure overall due unrelated known category scroll anchor and Home_00 banner checks; targeted `MARINEAQUA_CONSULTATION_PANEL=PASS` on 390px and 1440px.
- Targeted values: `secondClickClosed=true`, `secondClickCollapsed=true`, `thirdClickOpened=true`, `floatingButtons.gap=31` px, `floatingButtons.centerDelta=2` px (390) and `1` px (1440). Also Escape, outside close, AI open/close, phone/Messenger/Zalo links PASS.
- Never conflate targeted widget success with overall known QA failures.

## Pre-existing unrelated backlog

- Category scroll-anchor test resets scroll to zero.
- Home_00 banner media/mobile slide navigation checks fail.
- Best Practices Lighthouse CSP issue remains to be independently re-audited; do not weaken security merely to raise score.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
