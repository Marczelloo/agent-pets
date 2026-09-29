// agent-pets plugin v1
// Agent Pets (https://github.com/Marczelloo/agent-pets): opencode session state for the taskbar pet.
// Sends only state, tool kind, short action description, question, and model name to 127.0.0.1.
// Never sends message content, responses, or files. This file is managed by Agent Pets:
// disable the opencode integration in Agent Pets settings instead of editing it.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// tool argument fields used by the widget to build action descriptions (file name, command, pattern, host)
const INPUT = { filePath: "file_path", path: "file_path", command: "command", pattern: "pattern", url: "url", query: "query", description: "description" };

function endpoint() {
  try {
    const p = process.env.AGENT_PETS_ENDPOINT || join(homedir(), ".agent-pets", "endpoint.json");
    const e = JSON.parse(readFileSync(p, "utf8"));
    return e && e.port && e.token ? e : null;
  } catch {
    return null;
  }
}

function str(v, max) {
  return typeof v === "string" && v ? v.slice(0, max) : undefined;
}

// The widget may have restarted (new port and token), so read the endpoint for every event.
// A 300 ms limit and no escaping exceptions ensure the plugin never interferes with opencode.
async function send(body) {
  try {
    const e = endpoint();
    if (!e) return;
    await fetch(`http://127.0.0.1:${e.port}/v1/events/opencode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${e.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300),
    });
  } catch {
    // widget is off or busy: skip it
  }
}

export const AgentPets = async ({ directory }) => {
  const post = (event, session, extra) => {
    if (typeof session !== "string" || !session) return;
    void send({ v: 1, ts: Date.now(), pid: process.pid, event, session, cwd: directory, ...extra });
  };
  return {
    event: async ({ event }) => {
      const t = event && event.type;
      const p = (event && event.properties) || {};
      const sid = p.sessionID || (p.info && p.info.id);
      switch (t) {
        case "session.created":
          post(t, sid, { parent: str(p.info && p.info.parentID, 128), title: str(p.info && p.info.title, 200) });
          break;
        case "session.deleted":
        case "session.error":
        case "permission.replied":
        case "question.replied":
        case "question.rejected":
          post(t, sid, {});
          break;
        case "session.updated":
          post(t, sid, { title: str(p.info && p.info.title, 200), parent: str(p.info && p.info.parentID, 128) });
          break;
        case "session.status":
          post(t, sid, { status: str(p.status && p.status.type, 20) });
          break;
        case "permission.asked":
          post(t, sid, { question: str(p.title || p.permission, 400) });
          break;
        case "question.asked": {
          const q = (Array.isArray(p.questions) && p.questions[0] && p.questions[0].question) || p.question;
          post(t, sid, { question: str(q, 400) });
          break;
        }
        default:
          break;
      }
    },
    "chat.message": async (input) => {
      const m = input && input.model;
      const model = m && m.modelID ? (m.providerID ? `${m.providerID}/${m.modelID}` : m.modelID) : undefined;
      if (model) post("chat.message", input.sessionID, { model: str(model, 120) });
    },
    "tool.execute.before": async (input, output) => {
      const a = (output && output.args) || {};
      const only = {};
      for (const [from, to] of Object.entries(INPUT)) {
        const v = str(a[from], 500);
        if (v && !only[to]) only[to] = v;
      }
      post("tool.before", input && input.sessionID, { tool: str(input && input.tool, 80), input: only });
    },
    "tool.execute.after": async (input) => {
      post("tool.after", input && input.sessionID, { tool: str(input && input.tool, 80) });
    },
  };
};
