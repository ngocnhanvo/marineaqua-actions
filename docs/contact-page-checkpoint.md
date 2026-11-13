# Marine Aqua — Contact page release checkpoint (DONE)

## Request and sources
- User requested rebuilding `/lien-he` using `https://marine-aqua.vn/lien-he/` or WordPress `thong-tin-chung` instead of previous bare text.
- Exact project repos: `ngocnhanvo/marineaqua-astro` (production `master`), `ngocnhanvo/marineaqua-php` (untouched `master`), `ngocnhanvo/marineaqua-actions` (`main`).
- Knowledge `main` `1b5aab9e2f8b2fccb42947a74a48df6d9761570f`; code mode `auto-build`; source gate `bypass`.
- Source contact reference publicly lists FISHLOVERSHOP COMPANY LIMITED, hotline 0931 37 36 36, email info@marine-aqua.vn, dealer/recruitment Mr Cuong 090 21 26 111. The source also contains a distinct legacy office address; this task follows the current WordPress `thong-tin-chung` for the canonical location, not duplicate/overwrite older address.
- Existing WordPress contact Page/slug and Header link preserved. No CMS table, menu, payment, or PHP mutation.

## Implementation
- New Astro `src/astro/pages/ContactPage.astro` committed `45ce4846835f5a2273af7def08a90d3af6403784`.
- `src/astro/pages/HomePage.astro` updated `afe994bb2cf47c3da78936d51c20b5c6edeabc84`, final production source head.
- HomePage routes only Vietnamese WordPress-backed `lien-he`/contact Page through ContactPage, preserving `currentPage`, CMS route identity, shared Layout and Header/Footer.
- Real current WordPress common info sources: `tencongty`, `diachiHaNoi/diachiHCM`, `hotline/sodienthoaiHaNoi/sodienthoaiHCM`, `emailHaNoi/emailHCM`, Google Maps link, same precedence as footer; no fake values.
- Reference site dealer/recruitment subsection has source-backed Mr Cường 090 21 26 111 and info@marine-aqua.vn (separate from dynamic retail contact).
- Marine design: branded gradient hero, breadcrumb/H1, four responsive white info cards, clear tel/mailto/maps CTAs, dealer/recruitment panel, existing footer preserved.
- No checkout/contact POST, accounts, orders, payment or WP content writes.

## Verification and deployment
- Existing Astro source-checks CI `43382064682` rerun job `131980506238`: success, latest master source verified.
- Release request `dispatch-requests/20261113T153000Z-contact-page-release.json`, source SHA `afe994bb2cf47c3da78936d51c20b5c6edeabc84`; request commit `f5987932337458c47494b2aa5f841c46540350cc`.
- Dispatch bridge `43453450041` accepted and started canonical existing production pipeline.
- Production deploy `43453539341`, job `131981668531`: completed SUCCESS; exact source SHA; `ASTRO_BUILD_COMPLETE=PASS`, `ASTRO_OUTPUT_VALIDATION=PASS`, `FTPS_UPLOAD=PASS` bytes=2785451, `SIGNED_UNZIP_SUCCESS` at 2026-11-13 15:33:40 UTC. No duplicate production workflow created.
- New read-only live QA source `scripts/marineaqua-contact-page-live-qa.mjs`, existing Actions runner Playwright image, and `.github/workflows/marineaqua-contact-page-live-qa.yml`; QA workflow is read-only and not a deployment path.
- Initial QA attempt `43453383696` ran before production deploy and failed on old bare page; expected timing error, not accepted. Reran the exact job after deployment: job `131982844304` **SUCCESS**.
- `MARINEAQUA_CONTACT_PAGE_QA=PASS`: desktop 1366x900 and mobile 390x844, two successful viewport check groups. HTTP 200, exactly one correctly styled H1, reference dealer block and phone, four exact WordPress-footer data values on each viewport, six links, safe external links, no horizontal overflow (`scrollWidth=clientWidth`), no private API writes.
- Screenshot artifact `14051958485` (1,140,919 bytes). Both fullpage screenshots (desktop/mobile) downloaded and visually reviewed: responsive cards, margins, hierarchy, buttons and footer all fit; no unexpected overlap or clipping.
- QA tested only public GET; no mutable business records or cleanup needed.
- Previous completed task `docs/checkout-consent-checkpoint.md` untouched; no regression changes to checkout.

## State
**DONE — deployed and verified.** Current public URL: `https://marine-aqua.io.vn/lien-he`.

Next request should start from this checkpoint, not rebuild completed contact/checkout work.
