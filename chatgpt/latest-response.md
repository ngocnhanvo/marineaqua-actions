# Marine Aqua migration checkpoint — 2026-11-09

Project: marine-aqua.vn
Actions: ngocnhanvo/marineaqua-actions (main)
Astro: ngocnhanvo/marineaqua-astro (staging main, production source master)
PHP: ngocnhanvo/marineaqua-php (staging main, production source master)

## Verified repository state

- Astro staging main includes imported source commit `3744f81567bb0a1835320844a763acae09314870`, including package.json and application files.
- PHP staging main includes imported source commit `1c506a62e62f3e23413aba55df5ad8644e2aff09`, including wp-settings.php and WordPress files.
- Both application master branches remain bootstrap/incomplete: package.json not present on Astro master; wp-settings.php not present on PHP master. Do NOT build/deploy those branches.
- The previous workflow failure run 42612706895 was due to missing SOURCE_REPO_PAT at that time. The subsequent staging commits show source was imported later; do not assume current secret state or workflow QA status without checking live Actions.
- Verified checks on staging: target PHP wp-config.php absent, .env absent, Astro .env absent. Limited file-presence checks are not a full credential scan.
- Import workflow commit `96cef74f6610454d028b40e1930b9e73392ab9ea` removed the partial-import gate and changed push target to staging main only.
- Import workflow commit `1b47a56f53918d72f912058ddfdba303ce1f8e00` added exclusions for source workflows and common sensitive configuration/key files and checks for wp-config.php and .env.
- No production deploy or full build/test/visual QA has been verified.

## Next steps

1. Inspect latest import workflow run and log for `1b47a56`, confirm both matrix jobs and token permissions; do not mistake a source commit for end-to-end QA.
2. Compare source completeness against template branches, run Astro dependency/build/typecheck/tests and PHP syntax/integration/deploy-contract tests in isolated CI with sanitized environment.
3. Review all copied identifiers, endpoints, content, assets, secrets, CI workflows, WordPress configuration, and template-specific branding; remediate with project-specific values.
4. When verified, promote validated source from staging main to the designated master branches through a non-force process, then follow only existing production workflows with environment and rollout safeguards.
5. Keep this checkpoint current with commit/run IDs and actual test evidence.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
