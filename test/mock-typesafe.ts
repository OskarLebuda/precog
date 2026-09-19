/**
 * A tiny stand-in for the TypeSafe System One API, built from the wire format in
 * advocaat's client. Everything in the test suite runs against this, so no key is needed.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface MockRequest {
  state: Record<string, unknown>;
  questions: Record<string, { type: string; instructions?: unknown; criteria?: unknown }>;
  model?: string;
}

export interface MockOptions {
  /** Answer with this status and body instead of a normal answer. */
  status?: number;
  /** Wait this long before answering, to exercise the client timeout. */
  delayMs?: number;
  /** Replace the answers. Useful for testing what happens with unexpected ids. */
  answer?: (req: MockRequest) => Record<string, unknown>;
}

export interface MockServer {
  url: string;
  /** Every request the server received, newest last. */
  requests: MockRequest[];
  /** Authorization headers seen, so tests can check the key is sent. */
  keys: string[];
  options: MockOptions;
  close: () => Promise<void>;
}

/** The precog state, as far as the mock needs to read it. */
interface MaybePrecogState {
  page?: { path?: string };
  pointer?: { hoveredId?: string | null; nearestIds?: string[]; hasHover?: boolean };
  candidates?: Array<{ id: string; path: string; inViewport?: boolean }>;
}

/**
 * Ranks the options the way a model plausibly would: whatever the cursor is on or heading
 * for, then what is on screen, then what stays in the same section. Probability decays
 * geometrically down the ranking, leaving some for "no click at all".
 *
 * This is a stand-in, not a model. It exists so the end-to-end tests can assert that a plan
 * follows the pointer without spending money or needing a key.
 */
function rankCandidates(state: MaybePrecogState, labels: string[]) {
  const candidates = state.candidates ?? [];
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const nearest = new Set(state.pointer?.nearestIds ?? []);
  const section = (state.page?.path ?? "").split("/")[1] ?? "";

  const scored = labels
    .filter((label) => label !== "none")
    .map((label, index) => {
      const candidate = byId.get(label);
      return {
        label,
        index,
        score:
          (label === state.pointer?.hoveredId ? 3 : 0) +
          (nearest.has(label) ? 2 : 0) +
          (candidate?.inViewport ? 1 : 0) +
          (section && candidate?.path.startsWith(`/${section}`) ? 1 : 0),
      };
    })
    // Ties keep document order. Sorting by label would put `l10` ahead of `l2`.
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const decay = 0.65;
  const total = scored.reduce((sum, _, index) => sum + decay ** index, 0) || 1;
  const probabilities: Record<string, number> = {};
  let spent = 0;
  for (const [index, entry] of scored.entries()) {
    const p = Math.round(((0.85 * decay ** index) / total) * 1000) / 1000;
    probabilities[entry.label] = p;
    spent += p;
  }
  if (labels.includes("none")) probabilities.none = Math.round((1 - spent) * 1000) / 1000;
  return { choice: scored[0]?.label ?? labels[0]!, probabilities };
}

/** Answers every question from the state, so a plan can be asserted end to end. */
function defaultAnswers(req: MockRequest) {
  const state = (req.state ?? {}) as MaybePrecogState;
  const answers: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(req.questions)) {
    if (question.type === "choice") {
      const labels = Object.keys(question.criteria as Record<string, unknown>);
      const { choice, probabilities } = rankCandidates(state, labels);
      answers[name] = { type: "choice", choice, confidence: 0.7, probabilities };
    } else if (question.type === "score") {
      const levels = (question.criteria as unknown[]).length;
      const probabilities: Record<string, number> = {};
      for (let i = 0; i < levels; i++) probabilities[String(i)] = 1 / levels;
      answers[name] = {
        type: "score",
        // Someone with the cursor on a link is about to click; the levels run low to high.
        score: state.pointer?.hoveredId ? levels - 1 : (levels - 1) / 2,
        confidence: 0.4,
        legend: question.criteria,
        probabilities,
      };
    } else {
      // Someone with the cursor on a link is not about to leave the site.
      answers[name] = { type: "noul", noul: state.pointer?.hoveredId ? 0.1 : 0.2 };
    }
  }
  return answers;
}

export async function startMock(options: MockOptions = {}, port = 0): Promise<MockServer> {
  const requests: MockRequest[] = [];
  const keys: string[] = [];

  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      keys.push(req.headers.authorization ?? "");
      const send = () => {
        if (mock.options.status && mock.options.status >= 400) {
          res.writeHead(mock.options.status, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "mock failure" }));
          return;
        }
        if (req.url !== "/v1/systemone") {
          res.writeHead(404).end();
          return;
        }
        let parsed: MockRequest;
        try {
          parsed = JSON.parse(raw) as MockRequest;
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "bad json" }));
          return;
        }
        requests.push(parsed);
        const answers = mock.options.answer?.(parsed) ?? defaultAnswers(parsed);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            model: parsed.model ?? "jev-latest",
            answers,
            usage: { input_tokens: 400, output_tokens: 30 },
          }),
        );
      };
      if (mock.options.delayMs) setTimeout(send, mock.options.delayMs);
      else send();
    });
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const bound = (server.address() as AddressInfo).port;

  const mock: MockServer = {
    url: `http://127.0.0.1:${bound}`,
    requests,
    keys,
    options: { ...options },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
  return mock;
}
