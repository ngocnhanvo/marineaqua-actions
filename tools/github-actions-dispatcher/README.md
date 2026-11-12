# GitHub Actions Dispatcher — MCP prototype

Small standalone, zero-runtime-dependency, stateless MCP Streamable HTTP server.
**This does not create a GitHub Actions build/deploy pipeline.** It only calls
the *existing* GitHub APIs and reads runs.

## Tools

| Tool | GitHub REST call | Meaning |
|---|---|---|
| `workflow_dispatch` | POST `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` | Use `return_run_details: true` (API version 2026-03-10) and return run ID if GitHub provides it |
| `repository_dispatch` | POST `/repos/{owner}/{repo}/dispatches` | Returns accepted status, **not** a run ID |
| `get_workflow_run` | GET `/repos/{owner}/{repo}/actions/runs/{run_id}` and `/jobs` | Inspect status, conclusion, SHA and job steps; or list candidate runs for a workflow |

Never label a dispatch acknowledgment, completed run, or green CI job as a
verified production deployment. Signed deploy provenance and live browser QA
remain separate checks per Knowledge's CORE-07.

## Configuration (Marine Aqua example)

Run locally with Node.js 22+:

```bash
export GITHUB_TOKEN="<secret-in-server-secret-manager>"
export MCP_BEARER_TOKEN="<random-at-least-24-character-internal-secret>"
export ALLOWED_REPOSITORIES="ngocnhanvo/marineaqua-actions"
export ALLOWED_REFS="main"
export ALLOWED_WORKFLOWS="marineaqua-php-release.yml,marineaqua-production-deploy.yml"
export ALLOWED_EVENTS="wp_trigger_build"
export REQUIRED_WORKFLOW_INPUTS='{"marineaqua-php-release.yml":{"confirm":"DEPLOY_PHP"}}'
export REQUIRED_EVENT_PAYLOADS='{"wp_trigger_build":{"site_domain":"marine-aqua.io.vn"}}'
export EVENT_WORKFLOWS='{"wp_trigger_build":"marineaqua-production-deploy.yml"}'
node tools/github-actions-dispatcher/server.mjs
```

The process listens on `127.0.0.1:8787/mcp` by default. Use `HOST` and
`PORT` only for a deliberately isolated deployment.

For `GITHUB_TOKEN`, prefer an installation token from a dedicated GitHub App
restricted to the Actions repository. Minimum GitHub fine-grained permissions:
**Actions: write** for workflow dispatch and checking runs, **Contents: write**
for repository dispatch. Avoid broad classic PATs or distributing credentials
across chats, logs, repositories or browser code.

The server **fails closed** without allowlisted repositories and ref names.
Workflow and event calls only work if their names are allowlisted. For the
Marine Aqua example, the payload must match the exact host and the PHP
confirmation must match. Concurrent in-progress runs of the same workflow
are rejected before triggering. No automatic POST retry (a timeout may mean
the event was already delivered).

## Local contract test

```bash
node --test tools/github-actions-dispatcher/dispatcher.test.mjs
```

Mock tests never use live GitHub credentials and never deploy.

Local MCP smoke:

```bash
curl -fsS -H "Authorization: Bearer $MCP_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://127.0.0.1:8787/mcp
```

## Connecting to ChatGPT — NOT AUTOMATIC

Writing this code or setting GitHub app permissions **does not install a
tool in ChatGPT**. ChatGPT must be explicitly connected to a remotely
reachable MCP server (HTTPS `/mcp` or an authorized Secure MCP Tunnel).

**Security boundary:** `MCP_BEARER_TOKEN` is currently an *internal
proxy-to-upstream* credential for local smoke tests and an authenticated
reverse proxy. It is **not a substitute for ChatGPT's OAuth 2.1 user
authorization flow**. Before exposing this service beyond localhost:

1. Set up a trusted OAuth 2.1 authorization server/proxy supporting the MCP
   protected-resource metadata, PKCE, audience/scope validation and tokens
   bound to your ChatGPT user. The proxy must authenticate the incoming user
   and inject the private internal bearer header to this backend. Never
   expose `MCP_BEARER_TOKEN` to a browser or publish the raw backend.
2. Serve HTTPS `/mcp` through that proxy, with logs/redaction, abuse/rate
   limits, ingress controls and production secrets stored server-side.
3. In ChatGPT **Plugins → Add custom MCP server**, enter the trusted HTTPS
   URL (or use Secure MCP Tunnel where available), complete OAuth linking,
   review the tool permissions, and install the new plugin. App availability
   is dependent on your account/workspace settings.
4. Verify `tools/list` shows these three names and test
   `get_workflow_run` with a completed, known run. After the authentication
   and allowlist checks work, separately authorize a live dispatch.

**Do not use 'No authentication' on a publicly accessible server for these
write tools.** This prototype does not implement its own OAuth authorization
server, hosted deployment, DNS, TLS or ChatGPT plugin installation.

Relevant specs:
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
- https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event

## Acceptance/limitations

- Source and contract tests are independent of production deployments.
- `workflow_dispatch` may return `run_id` via modern GitHub API; when
  unavailable, the result remains `DISPATCH_ACCEPTED_NOT_BUILD_PASS`.
- `repository_dispatch` does not reliably return a run ID. Search using
  `get_workflow_run({repo,workflow_id})`, then verify the unique event,
  timestamp, source SHA and target before selecting a run. Never assume a
  candidate is correlated just because it appears after a POST.
- For a complete rollout: first publish a secure authenticated MCP endpoint,
  connect/install it in ChatGPT, perform an authenticated smoke, and only
  then test production PHP release → Astro deploy → signed provenance → QA.
