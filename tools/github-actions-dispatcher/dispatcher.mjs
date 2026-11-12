// Minimal, dependency-free GitHub Actions control-plane. Never store or expose tokens.
const API = "https://api.github.com";
const API_VERSION = "2026-03-10";
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/;
const REF = /^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,127}$/;
const OWN_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const asSet = value => new Set(String(value || "").split(",").map(x => x.trim()).filter(Boolean));
const stop = message => { throw new Error(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createDispatcher(config) {
  const {
    githubToken, repositories, workflows, events, refs = "main",
    requiredInputs = {}, requiredPayloads = {}, eventWorkflows = {},
    fetchImpl = globalThis.fetch, delay = sleep, maxWaitSeconds = 30
  } = config;
  if (!githubToken || typeof githubToken !== "string") stop("GITHUB_TOKEN missing");
  const allowedRepos = asSet(repositories), allowedWorkflows = asSet(workflows),
    allowedEvents = asSet(events), allowedRefs = asSet(refs);
  if (!allowedRepos.size) stop("ALLOWED_REPOSITORIES required");
  if (!allowedRefs.size) stop("ALLOWED_REFS required");

  function repoPath(repo) {
    if (typeof repo !== "string" || !OWN_REPO.test(repo) || !allowedRepos.has(repo))
      stop("Repository is not allowlisted");
    const [owner, name] = repo.split("/");
    return "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(name);
  }
  function workflowName(workflow_id) {
    if (typeof workflow_id !== "string" || !NAME.test(workflow_id) ||
        !allowedWorkflows.has(workflow_id)) stop("Workflow is not allowlisted");
    return encodeURIComponent(workflow_id);
  }
  function eventName(event_type) {
    if (typeof event_type !== "string" || !NAME.test(event_type) ||
        !allowedEvents.has(event_type)) stop("Event is not allowlisted");
    return event_type;
  }
  function exactPolicy(given, policy, context) {
    if (!isObject(given) || !isObject(policy)) stop(context + " policy is missing");
    if (Object.keys(given).length !== Object.keys(policy).length ||
        !Object.keys(policy).every(key => own(given, key) && given[key] === policy[key]))
      stop(context + " does not match the approved policy");
  }
  async function api(method, path, body) {
    const response = await fetchImpl(API + path, {
      method,
      headers: {
        Authorization: "Bearer " + githubToken,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
      redirect: "error"
    });
    if (!response.ok) {
      // Never return request headers, body, PAT, or GitHub error response.
      stop("GitHub " + method + " failed: HTTP " + response.status);
    }
    if (response.status === 204) return null;
    return await response.json();
  }
  async function blockDuplicate(path, event) {
    const data = await api("GET", path + "?per_page=40");
    const active = (data.workflow_runs || []).find(run =>
      ["queued", "in_progress", "waiting", "pending", "requested"].includes(run.status) &&
      (!event || run.event === event)
    );
    if (active) stop("An equivalent workflow already runs: " + active.html_url);
  }
  async function workflow_dispatch({ repo, workflow_id, ref, inputs = {} }) {
    const base = repoPath(repo), wf = workflowName(workflow_id);
    if (typeof ref !== "string" || !REF.test(ref) || !allowedRefs.has(ref))
      stop("Git ref is not allowlisted");
    if (!isObject(inputs) || Object.keys(inputs).length > 25 ||
        Object.values(inputs).some(v => typeof v !== "string")) stop("Invalid workflow inputs");
    if (own(requiredInputs, workflow_id))
      exactPolicy(inputs, requiredInputs[workflow_id], "Workflow inputs");
    else if (Object.keys(inputs).length) stop("Inputs require an explicit policy");
    const path = base + "/actions/workflows/" + wf;
    await blockDuplicate(path + "/runs", "workflow_dispatch");
    const out = await api("POST", path + "/dispatches", {
      ref, inputs, return_run_details: true
    });
    const id = out?.workflow_run_id;
    return {
      stage: "DISPATCH_ACCEPTED_NOT_BUILD_PASS",
      repo, workflow_id, ref,
      run_id: Number.isSafeInteger(id) && id > 0 ? id : null,
      html_url: Number.isSafeInteger(id) && id > 0 ? out.html_url : null
    };
  }
  async function repository_dispatch({ repo, event_type, client_payload = {} }) {
    const base = repoPath(repo), event = eventName(event_type);
    exactPolicy(client_payload, requiredPayloads[event], "Repository dispatch payload");
    const workflow = eventWorkflows[event];
    if (workflow) {
      workflowName(workflow);
      await blockDuplicate(base + "/actions/workflows/" +
        encodeURIComponent(workflow) + "/runs", "repository_dispatch");
    }
    await api("POST", base + "/dispatches", { event_type: event, client_payload });
    return {
      stage: "DISPATCH_ACCEPTED_NOT_BUILD_PASS", repo, event_type,
      run_id: null, note: "repository_dispatch returns HTTP 204 without a run ID. Use get_workflow_run with workflow_id to inspect candidates, then lock the verified run ID."
    };
  }
  async function get_workflow_run({ repo, run_id, workflow_id, wait_seconds = 0 }) {
    const base = repoPath(repo);
    if (!Number.isInteger(wait_seconds) || wait_seconds < 0 ||
        wait_seconds > maxWaitSeconds) stop("Invalid wait_seconds");
    if (run_id == null) {
      const wf = workflowName(workflow_id);
      const result = await api("GET", base + "/actions/workflows/" + wf +
        "/runs?per_page=15");
      return {
        stage: "CANDIDATE_RUNS_NOT_CORRELATED",
        runs: (result.workflow_runs || []).map(r => ({
          id: r.id, html_url: r.html_url, event: r.event, status: r.status,
          conclusion: r.conclusion, head_sha: r.head_sha, created_at: r.created_at
        }))
      };
    }
    if (!Number.isSafeInteger(run_id) || run_id < 1) stop("Invalid run_id");
    let run;
    const deadline = Date.now() + wait_seconds * 1000;
    do {
      run = await api("GET", base + "/actions/runs/" + run_id);
      if (run.status === "completed" || Date.now() >= deadline) break;
      await delay(Math.min(3000, Math.max(0, deadline - Date.now())));
    } while (true);
    const value = {
      stage: run.status === "completed" ? "RUN_COMPLETED_NOT_LIVE_QA_PASS" : "RUN_PENDING",
      id: run.id, status: run.status, conclusion: run.conclusion,
      event: run.event, head_sha: run.head_sha,
      run_attempt: run.run_attempt, html_url: run.html_url,
      created_at: run.created_at, updated_at: run.updated_at
    };
    if (run.status === "completed") {
      const result = await api("GET", base + "/actions/runs/" + run_id + "/jobs?per_page=100");
      value.jobs = (result.jobs || []).map(j => ({
        id: j.id, name: j.name, conclusion: j.conclusion,
        steps: (j.steps || []).map(s => ({ name: s.name, conclusion: s.conclusion }))
      }));
    }
    return value;
  }
  return { workflow_dispatch, repository_dispatch, get_workflow_run };
}
