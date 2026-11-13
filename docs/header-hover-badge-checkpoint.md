# Header hover and cart quantity badge — DONE

Updated: 2026-11-13 19:37:26 +07:00 (Asia/Ho_Chi_Minh)
Project: marine-aqua.vn
Production: https://marine-aqua.io.vn
Source: ngocnhanvo/marineaqua-astro@master
Source commit: 22fb44109065c23bff817faa9341e03f9cef8932

## Completed scope

- Consolidated account/cart control styling; excluded these controls from legacy contact-link hover rules.
- Kept outline icons transparent inside one soft blue hover surface, with no hover translation.
- Anchored each quantity badge to its own control. White border separates the badge; wider numbers grow left while the right edge stays attached.
- Preserved existing WordPress URLs, quantity aggregation, hidden zero state, 99+ display cap and cart_key synchronization. Header scripts are unchanged.
- Preserved responsive visibility; added consistent keyboard focus and reduced-motion behavior.
- Changed only src/astro/components/Layout/Header.astro and src/styles/marine-aqua-approved.css in the Astro source.

## Verified production release

- Request: dispatch-requests/20261113T123116Z-header-hover-badge-release.json
- Request commit: c3a950e06236b081c6c7a6e0f6a34825b23a7ba6
- Dispatch bridge: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43425888105 — SUCCESS, attempt 1.
- Existing production deployment: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43425939749 — SUCCESS, job 131887245220.
- Logs verify source 22fb44109065c23bff817faa9341e03f9cef8932 and ASTRO_BUILD_COMPLETE=PASS, ASTRO_OUTPUT_VALIDATION=PASS, FTPS_UPLOAD=PASS, SIGNED_UNZIP_SUCCESS.
- Production pipeline, branches, env/secrets, transport, activation and rollback remain unchanged.

## Focused live browser verification

- Existing Header QA script extended at Actions commit 254e37cac320264c4929503349a3be10e2e6268a; workflow unchanged.
- Run: https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43426486215 — SUCCESS, job 131889035257.
- Persisted result: docs/header-information-links-live-qa-latest.json — PASS, no errors.
- Desktop 1366×900 and touch mobile 390×844: counts 0, 1, 12, 100 (rendered 99+) PASS. Zero hidden; nonzero badge offsetParent is its cart control; text fits; no clipping, horizontal overflow or quantity-induced layout shift.
- Actual badge sizes: 1 = 18×18; 12 = 22×18; 99+ = 30×18 CSS pixels.
- Hover remains one surface, outline icons remain transparent and geometry stays fixed. Cart keyboard focus PASS. Account is the existing WordPress fallback span without a Page URL; focus is correctly NOT_APPLICABLE, and its source behavior was preserved.
- Exactly one cart remains visible at widths 899, 900, 1023 and 1024; compact control is used below 900.
- Mobile sticky header at scrollY 600 and reduced-motion settings PASS.
- Existing five Header information links and their five destination pages remain valid.
- Browser-local quantity fixtures only; no cart/order API calls or non-read requests forwarded. Fixtures cleaned in both contexts.
- Artifact 14038535942: marineaqua-header-information-links-live-qa.
- ZIP SHA256: ca26044afd5c2af93c373954cbbaf84e918453b091c759306195556cd3ef5d8c.
- Reviewed production screenshots: desktop normal, cart hover and keyboard focus; mobile normal, 99+ and sticky 99+. Badge is attached to the button and no inner blue hover blob remains.

## Continuation

This request is DONE. Do not rerun the completed cart/checkout implementation or the earlier commerce QA for this visual fix. The existing docs/cart-checkout-checkpoint.md remains the checkpoint for that separate completed scope.
