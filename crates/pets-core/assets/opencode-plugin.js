// agent-pets plugin v1
// Agent Pets (https://github.com/Marczelloo/agent-pets): stan sesji opencode dla zwierzaka na pasku zadań.
// Wysyła tylko stan, rodzaj narzędzia, krótki opis akcji, pytanie i nazwę modelu na 127.0.0.1.
// Nigdy nie wysyła treści wiadomości, odpowiedzi ani plików. Plik zarządzany przez Agent Pets:
// wyłącz integrację opencode w ustawieniach Agent Pets zamiast go edytować.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// pola argumentów narzędzi, z których widżet składa opis akcji (nazwa pliku, komenda, wzorzec, host)
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

// Widżet mógł się zrestartować (nowy port i token), więc endpoint czytamy przy każdym zdarzeniu.
// Limit 300 ms i żadnych wyjątków na zewnątrz: plugin nigdy nie przeszkadza opencode.
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
    // widżet wyłączony albo zajęty: pomijamy
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
        case "session.deleted":
        case "session.error":
        case "permission.replied":
        case "question.replied":
        case "question.rejected":
          post(t, sid, {});
          break;
        case "session.updated":
          post(t, sid, { title: str(p.info && p.info.title, 200) });
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
