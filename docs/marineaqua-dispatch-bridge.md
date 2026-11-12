# Marine Aqua: GitHub-only production dispatch bridge (NO MCP)

Use the **existing GitHub connector** to create **one new real request file**
in `dispatch-requests/`. A normal GitHub `push` event triggers the existing
`.github/workflows/marineaqua-dispatch-bridge.yml` in
`ngocnhanvo/marineaqua-actions@main`.

The bridge **only sends GitHub API events**; it does not copy code, upload FTP,
change any production build steps, or replace the existing production pipeline.
It uses `github.token` with `contents:write` and `actions:write` inside the
approved repository's GitHub Actions runner. No MCP server, hosting, additional
ChatGPT connector, token shared in chat or new secret is needed; the existing
`SOURCE_REPO_PAT` secret is only used to verify the actual source branch HEAD.

## Contracts

All requests must be a **new** file named:
`dispatch-requests/YYYYMMDDTHHMMSSZ-meaningful-action.json`.
`request_id` must exactly match the basename without `.json`. The push must
introduce exactly **one new file**, with no other file changes.

PHP (existing workflow only):
```json
{
  "action": "workflow_dispatch",
  "request_id": "20261113T010000Z-example-php-release",
  "reason": "Release reviewed PHP changes to the WordPress production backend",
  "source_sha": "<verified 40-character marineaqua-php master SHA>",
  "workflow": "marineaqua-php-release.yml",
  "ref": "main",
  "inputs": { "confirm": "DEPLOY_PHP" }
}
```

Astro (existing production repository_dispatch workflow only):
```json
{
  "action": "repository_dispatch",
  "request_id": "20261113T020000Z-example-astro-release",
  "reason": "Build the reviewed Astro production source after PHP is ready",
  "source_sha": "<verified 40-character marineaqua-astro master SHA>",
  "event_type": "wp_trigger_build",
  "client_payload": { "site_domain": "marine-aqua.io.vn" }
}
```

The example IDs above must **never be reused**. A real request is an audited
release command, not a no-op commit to trick an unrelated CI job.

The bridge checks:
- Only `ngocnhanvo/marineaqua-actions@main`, genuine push, **attempt 1**;
- Exactly one **added** request file (no unrelated modifications);
- Exact schema, approved workflow/event/ref/site domain/confirmation;
- Source SHA matches the remote `master` HEAD;
- No matching existing active target workflow;
- Identifies a unique new run from the accepted event;
- Polls that run to completion and verifies all target jobs succeeded.

A bridge failure stops the request; **it does not send POST again**. Do not
re-run a bridge job: a new request with a new ID is required after investigating.
A successful dispatch or green build does **not** equal signed deploy provenance
or live QA PASS; verify the production job steps and website separately.

## Evidence & tests

- `scripts/marineaqua-dispatch-bridge.py`: only executable dispatch logic.
- `scripts/test_marineaqua_dispatch_bridge.py`: offline unit tests.
- Source changes trigger test-only check; **no request means no dispatch**.
- The GitHub API connection cannot send the POST directly from this ChatGPT
  session; the allowed GitHub Actions runner has the POST ability.
- Source branch ownership: PHP `ngocnhanvo/marineaqua-php@master`, Astro
  `ngocnhanvo/marineaqua-astro@master`.
- Previously fixed deletion/acknowledgement of product logs after successful
  deploy must **not** be redone.

## Required workflow permissions

`permissions: { contents: write, actions: write }` are attached only to the
bridge workflow. GitHub repository/org policy must still permit these rights.
The code does not expose token values or use a public trigger endpoint.

GitHub event rules allow a workflow using `GITHUB_TOKEN` to trigger other
workflows via the explicit `workflow_dispatch` and `repository_dispatch`
events; ordinary push events from `GITHUB_TOKEN` do not chain automatically.
