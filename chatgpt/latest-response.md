# Marine Aqua — latest response

- Checkpoint: 2026-11-12, remove outdated fixed bottom contact bar from mobile/desktop.
- Astro production: ngocnhanvo/marineaqua-astro@master **c8eec1c10d1f1b72de45ccdd1c5d4f385366394e**.
- Actions main prior checkpoint: **94d4ef223afe4b7323b4b9474ef68a1331177c78**.
- Knowledge/main and WordPress/PHP/master unchanged.
- User saw the old turquoise sticky bottom contact bar (phone, Zalo, quote) at mobile viewport even though the new floating Tư vấn consultation panel already replaced it. Request DONE.

## Changes
- Astro `src/astro/components/Layout/Layout.astro`, commit `02fadda8`: remove BottomContactBar import and rendering, remove now-unused hotline/zalo/contactHref builder and `linkNavigation` import, remove `html.header-sticky-active` positioning rules that used to push the consultation and back-to-top buttons away from the bottom bar.
- Existing `ContactWidget` remains, with real WordPress phone/Messenger/Zalo data and AI chat; footer contacts remain.
- Astro `src/tests/contact-config.test.ts` commit `c8eec1c`: regression guard against rendering retired bottom contact bar.
- Actions `scripts/marineaqua-live-readonly.mjs` commit `94d4ef22`: post-deploy Playwright asserts `#bottom-contact-bar` absent and sticky-active class not attached while scrolled.

## Verified
- Astro source CI https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43124177120 latest attempt SUCCESS, 216/216 unit tests PASS and astro check 0 errors/0 warnings on c8eec1c.
- Production deploy https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43136036466 attempt 11 SUCCESS, deployed c8eec1c; ASTRO_BUILD_COMPLETE=PASS, FTPS_UPLOAD=PASS, SIGNED_UNZIP_SUCCESS.
- Post-deploy browser https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43156243787: targeted `MARINEAQUA_CONSULTATION_PANEL=PASS` at 390px and 1440px; `retiredStickyBarAbsent=true`; consultation panel, click toggle, Escape, AI, links and floating-button 31px gap all PASS.
- Overall read-only QA still FAILED on unrelated pre-existing `MARINEAQUA_CATEGORY_SCROLL_ANCHOR` scroll resetting to zero and `MARINEAQUA_HOME00_BANNER` media/navigation.

## Remaining known backlog (not current request)
- Category scroll-anchor.
- Home_00 banner media and mobile navigation.
- Lighthouse Best Practices CSP assessment.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
