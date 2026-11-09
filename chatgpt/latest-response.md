# Marine Aqua — checkpoint 2026-11-09 (Asia/Ho_Chi_Minh)

Project: Marine Aqua; frontend https://marine-aqua.io.vn; WordPress https://admin.marine-aqua.io.vn. Only the Astro/PHP application source branches are `master`; Actions is `main`.

## Latest verified HEADs BEFORE this checkpoint commit
- Astro `ngocnhanvo/marineaqua-astro/master`: `cac6245d3028c2dc4feed1c582fa3a9a0087d6f9`
- PHP `ngocnhanvo/marineaqua-php/master`: `54574851f0eaea9e40341b36c5a7215573bc436e`
- Actions `ngocnhanvo/marineaqua-actions/main`: `734884e857e54dfaaa927fd166bbdff50f9a8898`

## This continuation completed — do not repeat
1. Confirmed WP published locale `vi` has no usable `Header` menu (last run `42644162615` was blocked by the previous required-menu gate). User had explicitly requested: remove JSON fallback and render empty if WordPress has no menu.
2. In Astro `src/lib/wordpress/menus/index.ts` added `getHeaderMenuItems()` to return only WordPress Header items scoped to published languages. The fetch failure message now explicitly states Header renders empty instead of using a fallback.
3. In `src/lib/wordpress/cache.ts` removed import `src/data/menu.json` and all fallback logic; menu is built exclusively using `getHeaderMenuItems(wordpressMenus,publishedLanguages)`, and logs that empty menu is intentional. Added `menuSourceVersion=2` to invalidate old aggregate `.cache/data.json` entries that could contain prior fallback output.
4. In `src/astro/components/Layout/Header.astro`, empty navigation now hides desktop nav row, hamburger button, and mobile menu component; brandbar/contact fields remain sourced from WordPress.
5. Added four unit tests for WordPress-only menus, empty response behavior, and invalidation of stale aggregate cache.
6. Validation: Source CI [42645656055](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42645656055) **SUCCESS** (203 tests, 0 type errors, 0 warnings). Build QA [42645825342](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42645825342) **SUCCESS** (Astro builds against actual WordPress data, outputs reviewed by CMS-menu contract; `CMS_HEADER_MENU=EMPTY locale=vi source=wordpress`, `CMS_HEADER_MENU=PASS wordpress_only_empty_allowed`).
7. Adjusted Actions QA gate to accept real empty CMS menu and to compare built menu counts with the normalized public WordPress response; does not require fake/template navigation.

## Previous verified accomplishments (preserved)
- FTPS live PHP source audit 10/10 selected files matched source; PHP marker corrected and released in [42641150259](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42641150259); FTPS signed PHP preflight verified in [42641417400](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42641417400). PHP release workflow restored to manual-only.
- Astro build parser, missing files, typecheck failures from template fixed; source CI and production-equivalent build now pass on latest tested commit.

## Remaining / next work
- **Production frontend was NOT deployed.** This continuation committed only Astro source and Actions QA changes; WordPress CMS was NOT edited, FTP was NOT changed. A real WordPress Header menu must still be authored by CMS owner when suitable published navigation exists; until then frontend intentionally renders empty.
- No live production browser smoke test of newly built Astro version has occurred. Before production deploy, follow project's Knowledge/explicit deployment authorization, verify CMS content, preview and browser QA, and ensure no other production blockers. Do not fabricate Header items or reintroduce JSON fallback.
- Consider building a browser smoke regression for empty menu with source-only Astro output, without deploying.
- `Cổng ghi source`: prior checkpoint said `bypass`; do not infer new permissions from history. Confirm current mode/policy before future writes.
- Overall status: **PARTIAL** — requested fallback removal and source/build QA are complete; production deployment and live browser QA not performed.
