# Marine Aqua — GitHub-only dispatch bridge and production release (2026-11-13, Vietnam)

## User intent
- Remove the MCP prototype completely. Use ordinary connected GitHub tooling.
- Create a reusable authorized GitHub Actions workflow that can trigger `workflow_dispatch` or `repository_dispatch`, following the same mechanism as prior self-activated Actions deployments.
- No MCP, extra hosting, user token in chat, no second production pipeline.

## Completed changes
- **MCP removed**: commit `93393c595bf123540a6a09c2f6b849eb3fe957d3`, deletes `tools/github-actions-dispatcher/**` and `.github/workflows/github-actions-dispatcher-ci.yml`. Verified git tree has no MCP files.
- **Bridge added**: `.github/workflows/marineaqua-dispatch-bridge.yml` and `scripts/marineaqua-dispatch-bridge.py`; offline unit tests in `scripts/test_marineaqua_dispatch_bridge.py`, usage in `docs/marineaqua-dispatch-bridge.md`.
- Workflow `on.push main paths: dispatch-requests/*.json`; a true new single-purpose JSON request commit is the dispatch command. It requires a unique filename, exact source SHA, allowlisted workflow/event/inputs/domain, rejects duplicate live runs, locks a new target run, checks terminal conclusion and jobs, prevents rerun re-dispatch. Source `master` checked using existing secret `SOURCE_REPO_PAT`; Actions API POST uses `github.token` with workflow `contents:write`, `actions:write`. No new credential or app.
- Bridge's own code push run [#43276579882](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43276579882) PASS: tests PASS, no request → NO_DISPATCH_REQUEST, no deployment.

## Real production dispatch evidence
- PHP request commit `73cba00fde236a2272923319969d527aaf6f8dd4`, file `dispatch-requests/20261112T180842Z-php-product-paging-release.json`.
- PHP bridge [#43276766922](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43276766922) **completed/success**. It triggered PHP production via **`workflow_dispatch`**, run [#43276847920](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43276847920) **completed/success**. Job log `MARINEAQUA_PHP_RELEASE installed=wp-content/plugins/github-trigger/products/endpoint.php sha256_verified=PASS`, `completed=PASS files_checked=8`, ready marker PASS.
- Astro request commit `46b763af20cfa43960a21db6b75b85698a88d9d5`, file `dispatch-requests/20261112T181143Z-astro-product-paging-release.json`.
- Astro bridge [#43277293206](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43277293206) triggered production `repository_dispatch wp_trigger_build`; run [#43277360360](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43277360360) source Astro `479f79e4356660387d8271bfdca4b76bef461026`. Latest checked Astro production **in_progress**, at `Build Astro Production (incremental WordPress data cache)`.
- Previous source CI PHP `#43267657238` and Astro `#43267666534` PASS.
- Attempted direct readback of WP paginated REST through web: inaccessible via this environment; FTPS file SHA verification is direct deploy evidence, not REST validation.
- No new external hosting/plugin.

## Next actions
1. Track production run `43277360360` and bridge run `43277293206` to completion, inspect job steps/log. If failed, investigate and fix actual source/pipeline, issue a **new** reviewed request file only when safe. Do NOT rerun old bridge requests (script rejects run_attempt >1).
2. If success, verify signed activation job, source SHA, staging provenance and live HTTP/browser QA on marine-aqua.io.vn using an authorized runner, since direct web access is blocked.
3. Preserve existing successful post-deploy log acknowledgement; do NOT reimplement.
4. Keep repository docs/checkpoint consistent and update final status only with evidence.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
