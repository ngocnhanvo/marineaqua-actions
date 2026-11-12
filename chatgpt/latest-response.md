# Marine Aqua — GitHub Actions Dispatcher MCP prototype (2026-11-13, Asia/Ho_Chi_Minh)

Project: marine-aqua.vn
Repository: ngocnhanvo/marineaqua-actions@main

## Request
User asked to TRY a standalone GitHub Actions Dispatcher with 3 functions:
`workflow_dispatch`, `repository_dispatch`, `get_workflow_run`.

## Implemented (real commits to Actions main)
- `tools/github-actions-dispatcher/dispatcher.mjs`: allowlisted GitHub REST client with exact repo/workflow/ref/event/input/payload policies, POST event trigger, unique direct workflow run ID where available (GitHub API 2026-03-10), no retries of non-idempotent POSTs, duplicate active run guard, read run/job results, explicit acceptance-vs-build/QA states.
- `tools/github-actions-dispatcher/server.mjs`: minimal dependency-free JSON-RPC MCP Streamable HTTP endpoint POST /mcp, initialize, tools/list, tools/call; exactly three tools; bearer secret for local authenticated backend, timing-safe check, loopback default.
- `tools/github-actions-dispatcher/dispatcher.test.mjs`: 7 automated tests incl. no live dispatch, authorization, allowlist and payload reject, duplicate prevention, run results, MCP HTTP init/list/call round-trip.
- `tools/github-actions-dispatcher/package.json`: standalone Node >=22 package.
- `tools/github-actions-dispatcher/README.md`: local test, Marine Aqua env allowlists, security, GitHub permissions, OAuth/Tunnel setup and ChatGPT plugin connection limitations.
- `.github/workflows/github-actions-dispatcher-ci.yml`: NO DEPLOY test-only CI on genuine dispatcher source changes, zero production secrets.
- HEAD after source work: `6886c176acfa2410322ae4b3f8e20fb65722938b`.

## Evidence
- GitHub Actions [#43274677108](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43274677108): completed / success; syntax checks PASS; offline MCP/REST contract tests PASS. Prior CI runs #43274196489, #43274355544, #43274642092 also success.
- API modern behavior: `workflow_dispatch` returns run ID when `return_run_details:true`; `repository_dispatch` still returns HTTP 204 only. Don't invent correlation.
- **No real dispatch** was sent; existing production workflow and PHP release were NOT run by this task.
- **MCP NOT installed in ChatGPT**; no hosted HTTPS endpoint, OAuth 2.1 provider/proxy, GitHub App dispatch credential or activated custom plugin was available in this session. Internal `MCP_BEARER_TOKEN` is for local/proxy use, not supported ChatGPT OAuth replacement. Never publish raw backend with "No authentication".

## Follow-up work required
1. Provision trusted hosting or Secure MCP Tunnel and OAuth 2.1 / authorized proxy with per-user auth. Configure GitHub App installation token for only Actions repo with `Actions:write`, `Contents:write`, secure env/secret manager. Do not share secrets in chat.
2. Connect this hosted MCP in ChatGPT Plugins, install, observe actual `tools/list` and authenticated read-only `get_workflow_run`. No connector installation can be forced from repo commits.
3. Once direct tool access exists, dispatch existing `marineaqua-php-release.yml` ref main inputs confirm=DEPLOY_PHP, verify new paginated endpoint live, then `repository_dispatch wp_trigger_build` payload site_domain=marine-aqua.io.vn and verify signed Astro production deploy/QA.
4. If tool isn't available in a later session, resume Knowledge CORE-07 A-D fallback, do not fake push events or create second deployment pipeline.

## Final status
Source CODE_READY + CI PASS; Hosted MCP connection NOT SET UP; production PHP/Astro deployment from previous task remains open.
Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
