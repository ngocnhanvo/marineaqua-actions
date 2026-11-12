import { test } from "node:test";
import assert from "node:assert/strict";
import { createDispatcher } from "./dispatcher.mjs";
import { createMcpServer } from "./server.mjs";

const policy = {
  githubToken: "fake-github-token",
  repositories: "ngocnhanvo/marineaqua-actions",
  workflows: "marineaqua-php-release.yml,marineaqua-production-deploy.yml",
  events: "wp_trigger_build",
  refs: "main",
  requiredInputs: { "marineaqua-php-release.yml": { confirm: "DEPLOY_PHP" } },
  requiredPayloads: { wp_trigger_build: { site_domain: "marine-aqua.io.vn" } },
  eventWorkflows: { wp_trigger_build: "marineaqua-production-deploy.yml" }
};
const good = path => new Response(JSON.stringify(path), {
  status: 200, headers: { "Content-Type": "application/json" }
});
function stubFetch(calls) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/dispatches") && options.method === "POST") {
      if (url.includes("/workflows/"))
        return good({ workflow_run_id: 12345, html_url: "https://github.com/run/12345" });
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/actions/runs/12345"))
      return good({ id: 12345, status: "completed", conclusion: "success",
        event: "workflow_dispatch", head_sha: "a".repeat(40),
        run_attempt: 1, html_url: "https://github.com/run/12345" });
    if (url.includes("/actions/runs/12345/jobs"))
      return good({ jobs: [{ id: 7, name: "release", conclusion: "success",
        steps: [{ name: "signed deploy", conclusion: "success" }] }] });
    return good({ workflow_runs: [] });
  };
}
const make = calls => createDispatcher({ ...policy, fetchImpl: stubFetch(calls) });
const repo = "ngocnhanvo/marineaqua-actions";
test("workflow_dispatch reports new run ID, not deployment success", async () => {
  const calls = [], dispatcher = make(calls);
  const response = await dispatcher.workflow_dispatch({
    repo, workflow_id: "marineaqua-php-release.yml", ref: "main",
    inputs: { confirm: "DEPLOY_PHP" }
  });
  assert.equal(response.run_id, 12345);
  assert.equal(response.stage, "DISPATCH_ACCEPTED_NOT_BUILD_PASS");
  assert.equal(JSON.parse(calls[1].options.body).return_run_details, true);
  assert.equal(calls[1].options.headers["X-GitHub-Api-Version"], "2026-03-10");
});
test("rejects unallowlisted repos, workflows, refs, and changed confirmations", async () => {
  const calls = [], dispatcher = make(calls);
  for (const args of [
    { repo: "ngocnhanvo/other", workflow_id: "marineaqua-php-release.yml", ref: "main" },
    { repo, workflow_id: "unapproved.yml", ref: "main" },
    { repo, workflow_id: "marineaqua-php-release.yml", ref: "master" },
    { repo, workflow_id: "marineaqua-php-release.yml", ref: "main", inputs: { confirm: "NO" } }
  ]) await assert.rejects(dispatcher.workflow_dispatch(args));
  assert.equal(calls.length, 0);
});
test("repository_dispatch requires exact origin and never pretends run ID known", async () => {
  const calls = [], dispatcher = make(calls);
  await assert.rejects(dispatcher.repository_dispatch({
    repo, event_type: "wp_trigger_build",
    client_payload: { site_domain: "evil.example" }
  }));
  await assert.rejects(dispatcher.repository_dispatch({
    repo, event_type: "wp_trigger_build",
    client_payload: { site_domain: "marine-aqua.io.vn", extra: true }
  }));
  const response = await dispatcher.repository_dispatch({
    repo, event_type: "wp_trigger_build",
    client_payload: { site_domain: "marine-aqua.io.vn" }
  });
  assert.equal(response.stage, "DISPATCH_ACCEPTED_NOT_BUILD_PASS");
  assert.equal(response.run_id, null);
  assert.equal(calls[1].options.method, "POST");
});
test("refuses duplicate queued production run before dispatch", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return good({ workflow_runs: [{ event: "repository_dispatch", status: "in_progress",
      html_url: "https://github.com/existing" }] });
  };
  const dispatcher = createDispatcher({ ...policy, fetchImpl });
  await assert.rejects(dispatcher.repository_dispatch({
    repo, event_type: "wp_trigger_build",
    client_payload: { site_domain: "marine-aqua.io.vn" }
  }), /already runs/);
  assert.equal(calls.length, 1);
});
test("get_workflow_run distinguishes completed job and live QA", async () => {
  const calls = [], dispatcher = make(calls);
  const run = await dispatcher.get_workflow_run({ repo, run_id: 12345 });
  assert.equal(run.stage, "RUN_COMPLETED_NOT_LIVE_QA_PASS");
  assert.equal(run.jobs[0].steps[0].conclusion, "success");
  await assert.rejects(dispatcher.get_workflow_run({ repo, run_id: -1 }));
});
test("MCP server rejects unauthorized requests and offers exactly three tools", async () => {
  const dispatcher = make([]);
  const bearerToken = "local-test-bearer-token-of-32-characters";
  const server = createMcpServer({ dispatcher, bearerToken });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = "http://127.0.0.1:" + address.port + "/mcp";
  const send = (method, id, token) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: {} })
  });
  try {
    const denied = await send("tools/list", 1, "wrong");
    assert.equal(denied.status, 401);
    const list = await (await send("tools/list", 2, bearerToken)).json();
    assert.deepEqual(list.result.tools.map(tool => tool.name), [
      "workflow_dispatch", "repository_dispatch", "get_workflow_run"
    ]);
    assert.equal(list.result.tools[2].annotations.readOnlyHint, true);
    const init = await (await send("initialize", 3, bearerToken)).json();
    assert.equal(init.result.serverInfo.name, "github-actions-dispatcher");
    const call = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + bearerToken
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 4, method: "tools/call",
        params: { name: "get_workflow_run", arguments: { repo, run_id: 12345 } }
      })
    });
    const result = await call.json();
    assert.equal(result.result.structuredContent.stage,
      "RUN_COMPLETED_NOT_LIVE_QA_PASS");
    const invalid = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + bearerToken
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 5, method: "tools/call",
        params: { name: "workflow_dispatch", arguments: {
          repo: "ngocnhanvo/unapproved", workflow_id: "nope.yml", ref: "main"
        } }
      })
    });
    assert.equal((await invalid.json()).result.isError, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
test("upstream failures do not include token or raw response body", async () => {
  const dispatcher = createDispatcher({
    ...policy,
    fetchImpl: async () => new Response("private body contains secret", { status: 403 })
  });
  await assert.rejects(
    dispatcher.workflow_dispatch({
      repo, workflow_id: "marineaqua-php-release.yml",
      ref: "main", inputs: { confirm: "DEPLOY_PHP" }
    }),
    error => /HTTP 403/.test(error.message) && !error.message.includes("secret")
  );
});
