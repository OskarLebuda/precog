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

/** Spreads probability over the options, with most of it on the first candidate. */
function defaultAnswers(req: MockRequest) {
  const answers: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(req.questions)) {
    if (question.type === "choice") {
      const labels = Object.keys(question.criteria as Record<string, unknown>);
      const probabilities: Record<string, number> = {};
      const rest = labels.length > 1 ? 0.3 / (labels.length - 1) : 0;
      for (const [index, label] of labels.entries()) {
        probabilities[label] = index === 0 ? 0.7 : rest;
      }
      answers[name] = {
        type: "choice",
        choice: labels[0],
        confidence: 0.7,
        probabilities,
      };
    } else if (question.type === "score") {
      const levels = (question.criteria as unknown[]).length;
      const probabilities: Record<string, number> = {};
      for (let i = 0; i < levels; i++) probabilities[String(i)] = 1 / levels;
      answers[name] = {
        type: "score",
        score: (levels - 1) / 2,
        confidence: 0.4,
        legend: question.criteria,
        probabilities,
      };
    } else {
      answers[name] = { type: "noul", noul: 0.2 };
    }
  }
  return answers;
}

export async function startMock(options: MockOptions = {}): Promise<MockServer> {
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

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const mock: MockServer = {
    url: `http://127.0.0.1:${port}`,
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
