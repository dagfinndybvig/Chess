"use strict";
// Minimal local server for Jev Chess.
// Serves static files and proxies POST /jev -> TypeSafe System One API.
// Usage:  node server.js   then open http://localhost:3001
// Port 3001 because the Go repo's server (Arcade/Go) uses 3000 — both can
// run at the same time.
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = 3001;
const TS_HOST = "api.typesafe.ai";
const TS_PATH = "/v1/systemone";
// Optional: set TYPESAFE_API_KEY to let the server inject the key for
// development, programmatic use, and testing. A browser-supplied
// Authorization header always takes precedence.
const ENV_KEY = process.env.TYPESAFE_API_KEY || "";
// Opt-in Mistral chat backend (chat adapter): set MISTRAL_MODEL (for
// example mistral-large-4, the Le Chonk preview) plus MISTRAL_API_KEY
// and decision requests are answered by that chat model instead of
// TypeSafe. Takes precedence over TypeSafe while set.
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MISTRAL_HOST = "api.mistral.ai";
const MISTRAL_PATH = "/v1/chat/completions";
const MISTRAL_TIMEOUT = 120000;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const ROOT = __dirname;

function serveStatic(req, res) {
  let url = req.url === "/" ? "/jev-chess.html" : req.url.split("?")[0];
  // Resolve against ROOT and refuse anything that escapes it — a leading
  // "//" or ".." must never walk up the filesystem.
  const rootDir = path.resolve(ROOT);
  const file = path.resolve(rootDir, "." + url);
  if (file !== rootDir && !file.startsWith(rootDir + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function sendJson(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ---- Mistral chat backend (chat adapter) ----
// The game sends one Choice question whose criteria carry a description
// per labeled move (the tactical annotations that drive play quality).
// The adapter turns that into a chat completion with structured outputs
// (one required string constrained to the legal labels) and reshapes the
// reply into the decision response the browser expects. Choice
// probabilities are synthetic: the picked move gets 0.5 (1 when it is
// the only option) and the rest share the remainder.

function mistralSchema(questions) {
  const properties = {};
  const required = [];
  const prompt = [];
  for (const [name, question] of Object.entries(questions)) {
    if (!question || typeof question !== "object") throw new Error("invalid question " + name);
    if (question.type !== "choice") throw new Error("unsupported question type " + question.type);
    const criteria = question.criteria;
    if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) {
      throw new Error("choice question " + name + " has no criteria");
    }
    const labels = Object.keys(criteria);
    if (!labels.length) throw new Error("choice question " + name + " has no criteria");
    properties[name] = { type: "string", enum: labels };
    required.push(name);
    prompt.push(name + " (choice): " + question.instructions + " Allowed: " + labels.join(", ") + ".");
    for (const label of labels) prompt.push("  " + label + " — " + criteria[label]);
  }
  return { properties, required, prompt };
}

function buildMistralRequest(jevRequest) {
  const questions = jevRequest.questions;
  if (!questions || typeof questions !== "object" || Array.isArray(questions)) {
    throw new Error("questions must be an object");
  }
  const { properties, required, prompt } = mistralSchema(questions);
  return {
    model: MISTRAL_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a typed decision model. Evaluate every requested field independently and return exactly one JSON object matching the schema. " +
          "Do not omit fields or add commentary.\n" + prompt.join("\n"),
      },
      { role: "user", content: String(jevRequest.state || "") },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "decision",
        strict: true,
        schema: {
          type: "object",
          properties,
          required,
          additionalProperties: false,
        },
      },
    },
  };
}

// Le Chonk (mistral-large-4) is a hybrid reasoning model: message.content
// is an array of parts — a "thinking" part followed by a "text" part whose
// text is the JSON answer. Older/other chat models return the JSON as a
// string, and structured outputs may deliver a parsed object; all three
// shapes are handled here.
function mistralContentJson(content) {
  if (Array.isArray(content)) {
    const text = content.filter(part => part && part.type === "text" && typeof part.text === "string")
      .map(part => part.text).join("");
    try {
      return JSON.parse(text || "{}");
    } catch (error) {
      throw new Error("Mistral returned invalid JSON");
    }
  }
  if (content && typeof content === "object") return content;
  try {
    return JSON.parse((content || "{}"));
  } catch (error) {
    throw new Error("Mistral returned invalid JSON");
  }
}

function adaptMistralReply(jevRequest, reply) {
  const message = reply && reply.choices && reply.choices[0] && reply.choices[0].message;
  const values = mistralContentJson(message && message.content);
  const answers = {};
  for (const [name, question] of Object.entries(jevRequest.questions)) {
    const labels = Object.keys(question.criteria);
    const value = values[name];
    if (!labels.includes(value)) throw new Error("Mistral returned an invalid choice for " + name);
    const probabilities = {};
    const rest = labels.filter(label => label !== value);
    probabilities[value] = rest.length ? 0.5 : 1;
    const share = rest.length ? 0.5 / rest.length : 0;
    for (const label of rest) probabilities[label] = share;
    answers[name] = { choice: value, confidence: 0.9, probabilities };
  }
  const usage = reply.usage || {};
  return {
    model: MISTRAL_MODEL,
    answers,
    usage: {
      input_tokens: Number(usage.prompt_tokens || 0),
      output_tokens: Number(usage.completion_tokens || 0),
    },
  };
}

// Forward a decision request to Mistral's chat completions endpoint and
// adapt the reply. Mistral's status code is forwarded so the browser's
// retry logic sees real upstream errors.
function handleMistral(req, res) {
  const chunks = [];
  req.on("data", c => chunks.push(c));
  req.on("end", () => {
    let jevRequest;
    try {
      jevRequest = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      sendJson(res, 400, { error: "bad_request", detail: "invalid JSON body" });
      return;
    }
    let chatRequest;
    try {
      chatRequest = buildMistralRequest(jevRequest);
    } catch (error) {
      sendJson(res, 400, { error: "bad_request", detail: String(error.message) });
      return;
    }
    const body = JSON.stringify(chatRequest);
    const upstream = https.request(
      {
        hostname: MISTRAL_HOST,
        path: MISTRAL_PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: "Bearer " + MISTRAL_API_KEY,
        },
      },
      up => {
        const upChunks = [];
        up.on("data", c => upChunks.push(c));
        up.on("end", () => {
          const text = Buffer.concat(upChunks).toString("utf8");
          let data;
          try {
            data = JSON.parse(text || "{}");
          } catch (error) {
            sendJson(res, 502, { error: "mistral_error", detail: "invalid JSON from Mistral" });
            return;
          }
          if (up.statusCode !== 200) {
            const detail =
              (data && (data.message || (data.error && data.error.message))) ||
              "HTTP " + up.statusCode;
            sendJson(res, up.statusCode || 502, { error: "mistral_error", detail });
            return;
          }
          try {
            sendJson(res, 200, adaptMistralReply(jevRequest, data));
          } catch (error) {
            sendJson(res, 502, { error: "mistral_error", detail: String(error.message) });
          }
        });
      }
    );
    const timer = setTimeout(() => {
      upstream.destroy(new Error("upstream timed out after " + MISTRAL_TIMEOUT + "ms"));
    }, MISTRAL_TIMEOUT);
    upstream.on("close", () => clearTimeout(timer));
    upstream.on("error", e => {
      const detail = String(e.message);
      const timedOut = /timed out/i.test(detail);
      sendJson(res, timedOut ? 504 : 502, { error: timedOut ? "proxy_timeout" : "mistral_error", detail });
    });
    upstream.end(body);
  });
}

function proxyJev(req, res) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };
    // Forward Authorization header from the browser request
    const auth = req.headers["authorization"];
    if (auth) headers["Authorization"] = auth;
    else if (ENV_KEY) headers["Authorization"] = "Bearer " + ENV_KEY;

    const upstream = https.request(
      { host: TS_HOST, path: TS_PATH, method: "POST", headers },
      (up) => {
        res.writeHead(up.statusCode || 502, {
          "Content-Type": up.headers["content-type"] || "application/json",
        });
        up.pipe(res);
      }
    );
    upstream.on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "proxy_error", detail: String(e.message) }));
    });
    upstream.end(body);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/jev") {
    if (MISTRAL_MODEL) return handleMistral(req, res);
    return proxyJev(req, res);
  }
  if (req.method === "GET" && req.url === "/jevstatus") {
    sendJson(res, 200, {
      serverKey: !!(ENV_KEY || MISTRAL_MODEL),
      backend: MISTRAL_MODEL ? "mistral:" + MISTRAL_MODEL : "typesafe",
      mode: MISTRAL_MODEL ? "chat" : "typesafe",
    });
    return;
  }
  return serveStatic(req, res);
});

if (MISTRAL_MODEL && !MISTRAL_API_KEY) {
  console.error("MISTRAL_MODEL is set but MISTRAL_API_KEY is missing");
  process.exit(1);
}

server.listen(PORT, () => {
  console.log("Jev Chess");
  console.log("Open http://localhost:" + PORT);
  if (MISTRAL_MODEL) {
    console.log("AI backend: Mistral model " + MISTRAL_MODEL + " via https://" + MISTRAL_HOST + MISTRAL_PATH + " (chat adapter)");
    if (ENV_KEY) console.log("(TYPESAFE_API_KEY is ignored while MISTRAL_MODEL is set)");
  } else {
    console.log("Jev proxy: POST /jev -> https://" + TS_HOST + TS_PATH);
    console.log("Server-side key: " + (ENV_KEY ? "yes (TYPESAFE_API_KEY)" : "no"));
  }
});
