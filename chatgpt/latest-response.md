# Marine Aqua — GitHub-only dispatch bridge VERIFIED and production PASS (2026-11-13, Vietnam)

Project marine-aqua.vn. User explicitly rejected MCP and requested ordinary GitHub connection with a reusable Actions workflow for workflow_dispatch/repository_dispatch.

## DONE: Remove MCP
- Commit `93393c595bf123540a6a09c2f6b849eb3fe957d3` removed all 6 prototype files (`tools/github-actions-dispatcher/**`, `.github/workflows/github-actions-dispatcher-ci.yml`).
- Verified current git tree has **no MCP files**.

## DONE: GitHub-only dispatch bridge
- `.github/workflows/marineaqua-dispatch-bridge.yml`
- `scripts/marineaqua-dispatch-bridge.py` and `scripts/test_marineaqua_dispatch_bridge.py`
- `docs/marineaqua-dispatch-bridge.md`
- New approved files `dispatch-requests/<timestamp>-<reason>.json` committed through the existing ChatGPT GitHub connector produce genuine `push` triggers; Actions runner calls GitHub REST POST with its existing `github.token` and permissions `contents:write/actions:write`. No MCP, hosting, new ChatGPT plugin, no token in chat.
- Validation: exactly one added request file (not a no-op commit), unique request id, exact allowlisted repo/workflow/event/ref/inputs/domain, source SHA matches source `master`, no duplicate active workflow; run locking, wait-to-completion and all jobs success. Reruns of old bridge run forbidden. Workflow code push run [#43276579882](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43276579882) succeeded and printed NO_DISPATCH_REQUEST.

## Production workflow_dispatch: PASS
- Request commit `73cba00fde236a2272923319969d527aaf6f8dd4` (`dispatch-requests/20261112T180842Z-php-product-paging-release.json`).
- Bridge [#43276766922](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43276766922) completed/success → PHP production [#43276847920](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43276847920) completed/success.
- PHP source `ngocnhanvo/marineaqua-php@master` SHA `d4013371fbfaa072ad2508a0dfe6d5163a578052`.
- Log `MARINEAQUA_PHP_RELEASE installed=wp-content/plugins/github-trigger/products/endpoint.php sha256_verified=PASS`, `completed=PASS files_checked=8`, unzip ready PASS.

## Production repository_dispatch: PASS
- Request commit `46b763af20cfa43960a21db6b75b85698a88d9d5` (`dispatch-requests/20261112T181143Z-astro-product-paging-release.json`).
- Bridge [#43277293206](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43277293206) completed/success → Astro production [#43277360360](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43277360360) completed/success.
- Astro source `ngocnhanvo/marineaqua-astro@master` SHA `479f79e4356660387d8271bfdca4b76bef461026`.
- Exact SHA confirmed in release log; `ASTRO_BUILD_COMPLETE=PASS`, `FTPS_UPLOAD=PASS`, `SIGNED_UNZIP_SUCCESS` confirmed. Build 3m50s without old 30s AbortError. Existing production pipeline unchanged.

## Live QA: PASS
- Created specific read-only QA: `scripts/marineaqua-product-pagination-live-qa.mjs` and `.github/workflows/marineaqua-product-pagination-live-qa.yml`.
- GitHub Actions [#43278636054](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43278636054) completed/success:
  - `MARINEAQUA_PAGED_PRODUCT_LOGS=PASS total=355`: paged response schema, snapshot SHA256, per-page limit.
  - `MARINEAQUA_LEGACY_PRODUCT_LOGS=PASS count=355`: backward compatible array.
  - `MARINEAQUA_PUBLIC_HOME_DESKTOP=PASS`, `MARINEAQUA_PUBLIC_HOME_MOBILE=PASS` (Playwright).
  - artifact ID `13970843469`, name `marineaqua-product-pagination-live-qa`, JSON report + screenshots.
- QA inspected 355 product log records at the time; this alone doesn't prove whether old successful-build cleanup succeeded or not. Per explicit user instruction, **do not redo prior log deletion/ack logic**.
- External public web fetch from ChatGPT's web tool unavailable; authoritative runner QA passed.

## Summary
GitHub-only bridge, both dispatch methods, production PHP, production Astro, signed provenance and live browser/REST QA are DONE. No MCP. Check repo Actions docs for new approved request format; do not rerun old requests.
Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
