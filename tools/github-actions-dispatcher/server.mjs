import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createDispatcher } from "./dispatcher.mjs";

const VERSION = "2025-06-18";
const schemaObject = (properties, required) => ({
  type: "object", properties, required, additionalProperties: false
});
const str = { type: "string", minLength: 1 };
const obj = { type: "object", additionalProperties: { type: "string" } };
export const TOOLS = [
  {
    name: "workflow_dispatch",
    title: "Dispatch existing workflow",
    description: "Starts an allowlisted existing workflow on an allowlisted ref. Acknowledgment is not build, deployment, or QA success. For Marine Aqua PHP release, confirm must equal DEPLOY_PHP.",
    inputSchema: schemaObject({ repo: str, workflow_id: str, ref: str, inputs: obj },
      ["repo", "workflow_id", "ref"]),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
  },
  {
    name: "repository_dispatch",
    title: "Dispatch existing production event",
    description: "Sends one explicitly allowlisted event with exact approved payload. No new build pipeline; HTTP acknowledgment is NOT deployment success. A repository dispatch does not return a run ID.",
    inputSchema: schemaObject({
      repo: str, event_type: str,
      client_payload: { type: "object", additionalProperties: true }
    }, ["repo", "event_type", "client_payload"]),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
  },
  {
    name: "get_workflow_run",
    title: "Check workflow run and job results",
    description: "Read one immutable GitHub Actions run by run ID, optionally wait up to 30 seconds. Or list candidates for a workflow; candidates are NOT proof of correlation. Completion is not live QA.",
    inputSchema: schemaObject({
      repo: str,
      run_id: { type: "integer", minimum: 1 },
      workflow_id: str,
      wait_seconds: { type: "integer", minimum: 0, maximum: 30 }
    }, ["repo"]),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
  }
];
const lookup = new Map(TOOLS.map(t => [t.name, t]));
const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({
  jsonrpc: "2.0", id, error: { code, message }
});
const json = value => JSON.stringify(value);
function readConfigObject(name, raw) {
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw Error("not an object");
    return value;
  } catch {
    throw Error(name + " must be a JSON object");
  }
}
export function configFromEnv(env = process.env) {
  return {
    githubToken: env.GITHUB_TOKEN,
    repositories: env.ALLOWED_REPOSITORIES,
    workflows: env.ALLOWED_WORKFLOWS,
    events: env.ALLOWED_EVENTS,
    refs: env.ALLOWED_REFS || "main",
    requiredInputs: readConfigObject("REQUIRED_WORKFLOW_INPUTS",
      env.REQUIRED_WORKFLOW_INPUTS),
    requiredPayloads: readConfigObject("REQUIRED_EVENT_PAYLOADS",
      env.REQUIRED_EVENT_PAYLOADS),
    eventWorkflows: readConfigObject("EVENT_WORKFLOWS", env.EVENT_WORKFLOWS)
  };
}
function constantTimeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function respond(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(json(body));
}
export function createMcpServer({ dispatcher, bearerToken }) {
  if (!bearerToken || bearerToken.length < 24)
    throw Error("MCP_BEARER_TOKEN must be a strong secret (24+ chars)");
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      respond(res, 200, { status: "ready" });
      return;
    }
    if (req.url !== "/mcp" || req.method !== "POST") {
      respond(res, 405, { error: "POST /mcp required" });
      return;
    }
    const authorization = req.headers.authorization || "";
    if (!constantTimeEquals(authorization, "Bearer " + bearerToken)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      respond(res, 401, { error: "Unauthorized" });
      return;
    }
    if (!(req.headers["content-type"] || "").startsWith("application/json")) {
      respond(res, 415, { error: "JSON required" }); return;
    }
    let raw = "";
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 65536) {
          respond(res, 413, { error: "Request too large" }); return;
        }
      }
      const data = JSON.parse(raw);
      if (data.jsonrpc !== "2.0" || typeof data.method !== "string") {
        respond(res, 400, rpcError(data.id ?? null, -32600, "Invalid request"));
        return;
      }
      if (data.id === undefined) {
        res.writeHead(202); res.end(); return;
      }
      if (data.method === "initialize") {
        respond(res, 200, rpc(data.id, {
          protocolVersion: VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "github-actions-dispatcher", version: "0.1.0" },
          instructions: "Use only approved repositories/workflows/events. Never claim a dispatch acknowledgment means BUILD_SUCCESS, DEPLOY_READY or QA_PASS. Check exact run ID; keep source SHA and live QA separate."
        })); return;
      }
      if (data.method === "ping") {
        respond(res, 200, rpc(data.id, {})); return;
      }
      if (data.method === "tools/list") {
        respond(res, 200, rpc(data.id, { tools: TOOLS })); return;
      }
      if (data.method === "tools/call") {
        const name = data.params?.name, args = data.params?.arguments || {};
        if (!lookup.has(name) || !args || Array.isArray(args) ||
            typeof args !== "object") {
          respond(res, 200, rpcError(data.id, -32602, "Invalid tool call"));
          return;
        }
        try {
          const output = await dispatcher[name](args);
          respond(res, 200, rpc(data.id, {
            structuredContent: output,
            content: [{ type: "text", text: json(output) }]
          }));
        } catch (err) {
          // Don't return secrets, full upstream bodies, or request payloads.
          respond(res, 200, rpc(data.id, {
            isError: true,
            content: [{ type: "text", text: String(err.message || "Tool error").slice(0,300) }]
          }));
        }
        return;
      }
      respond(res, 200, rpcError(data.id, -32601, "Method not found"));
    } catch {
      respond(res, 400, rpcError(null, -32700, "Invalid JSON request"));
    }
  });
}
if (process.argv[1] && import.meta.url === new URL("file://" +
    process.argv[1]).href) {
  const dispatcher = createDispatcher(configFromEnv());
  const server = createMcpServer({
    dispatcher, bearerToken: process.env.MCP_BEARER_TOKEN
  });
  const port = Number(process.env.PORT || "8787");
  const host = process.env.HOST || "127.0.0.1";
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw Error("Invalid PORT");
  server.listen(port, host, () => {
    console.log("GitHub Actions Dispatcher ready at " + host + ":" + port + "/mcp");
  });
}
