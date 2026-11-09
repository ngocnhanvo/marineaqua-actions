# Marine Aqua — checkpoint 2026-11-09 (Asia/Ho_Chi_Minh)

Project: marine-aqua.vn
Source branches: ngocnhanvo/marineaqua-astro/master and ngocnhanvo/marineaqua-php/master
Automation branch: ngocnhanvo/marineaqua-actions/main
Reference rules: ngocnhanvo/knowledge/main
Frontend: https://marine-aqua.io.vn
WordPress: https://admin.marine-aqua.io.vn

## Verified work and evidence

- Template source import COMPLETE at workflow run [42621792802](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42621792802), attempt 1, both Astro and PHP import jobs SUCCESS. An earlier run [42619991615](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42619991615) also succeeded. The original run [42612706895](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42612706895) failed before SOURCE_REPO_PAT became usable; that blocker is resolved for imports.
- Owner explicitly requires app source on master, NOT main. Fast-forward previously moved Astro master to `3744f81567bb0a1835320844a763acae09314870` and PHP master to `1c506a62e62f3e23413aba55df5ad8644e2aff09` without force; Astro package.json and PHP wp-settings.php were verified on master. GitHub Actions repo legitimately uses main.
- Import workflow updated at `2d954da77bbc7da607ab3eefdc0770d87eac2f0b`: manual dispatch, app checkout/push only master. It excludes common secrets and source workflows. Import alone does not deploy production.
- Read-only Visual Builder Chromium test [42612394689](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42612394689), attempt 2, SUCCESS (rerun after secret access was available).
- Offline deploy transport CI [42612457263](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42612457263), attempt 2, failed on ZIP -> PHP contract with reused marker count 0,0 instead of 2,3. Root cause: PHP read `template-image-delta.json`/`template-static-delta.json` while Python packaging emitted `marineaqua-image-delta.json`/`marineaqua-static-delta.json`.
- Fixed marker mismatch on PHP master in three commits: `a1d9a5d440ec89a0fac7cf9c80388ba24d7ffbe8`, `467f6ba4dc58c27637c915cf98a66ed0fa379db6`, `bb274f1ee9d7e6237b5f0e60311764713b58d739` (latest source PHP). Offline CI [42612457263](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/42612457263), attempt 3, SUCCESS after fix: PHP syntax, PHP image/static contracts and Python ZIP reconstruction suite.
- The Actions README was updated to remove the obsolete secret blocker in commit `4c50a5b40372141cf754fc8f5ba39e76ba2d7644`.
- NO production build, FTP deployment, database migration, live WordPress write, or production release was initiated by this continuation.

## Outstanding; do not mark the overall migration DONE

1. Run Astro dependency install, static/check/unit test and production-equivalent build **without deploying**, with genuine project-specific secure environment. No Astro build PASS / DEPLOY_READY / QA_PASS yet.
2. Perform comprehensive source parity (template and target) and scan for tenant-specific content, URLs, secrets, PHP configuration, third-party IDs and assets. Previous limited presence checks are not a full security/parity audit.
3. Confirm active WordPress instance identity, proper ENV_FILE values, FTP destination, CMS data/Menu/SEO and business content before a production rollout. Do not import template database, credentials, or customer content.
4. When deployment is justified, use only existing `marineaqua-production-deploy.yml` production path, observe exact run/attempt, rollback readiness and real frontend/browser QA. Source commit alone is not deployment.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
