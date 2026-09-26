"use strict";
// Throwaway smoke test after iteration-3 edits — delete when done.
const fs = require("fs");
const vm = require("vm");
const html = fs.readFileSync("jev-chess.html", "utf8");
const script0 = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const noop = () => {};
const els = {};
const el = id => els[id] || (els[id] = { textContent: "", style: {}, addEventListener: noop, getContext: () => ctx2d });
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
let jevResponder = null;
const sandbox = {
  console,
  document: { getElementById: el, addEventListener: noop },
  location: { hostname: "localhost" },
  localStorage: { getItem: () => null, setItem: noop },
  fetch: async (url, opts) => {
    if (url === "/jevstatus") return { ok: true, json: async () => ({ serverKey: false }) };
    const body = JSON.parse(opts.body);
    const labels = Object.keys(body.questions.move.criteria);
    const r = jevResponder ? jevResponder(body, labels) : { choice: labels[0], confidence: 0.5, probabilities: {} };
    return { ok: true, json: async () => ({ answers: { move: r } }) };
  },
  prompt: noop, setTimeout: () => 0, clearTimeout: noop, AbortController,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(script0 + `
;globalThis.__t = { Jev, moveLabel,
  get board(){return board}, set board(v){board=v}, get turn(){return turn}, set turn(v){turn=v},
  get castleR(){return castleR}, set castleR(v){castleR=v}, get epSq(){return epSq}, set epSq(v){epSq=v},
  get gameOver(){return gameOver}, set gameOver(v){gameOver=v}, get lastUci(){return lastUci} };`, sandbox, { filename: "s" });
const S = sandbox, T = sandbox.__t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, c) => { c ? (pass++, console.log("PASS  " + n)) : (fail++, console.log("FAIL  " + n)); };

async function main() {
  check("start moves = 20", S.legalMoves(S.startBoard(), "w", { wK: 1, wQ: 1, bK: 1, bQ: 1 }, null).length === 20);
  S.newGame();
  // Construct K+R vs K endgame: White Ke4, Ra1; Black Ke8
  T.board = Array.from({ length: 8 }, () => new Array(8).fill(""));
  T.board[3][4] = "K";   // e4
  T.board[0][7] = "R";   // h1
  T.board[7][4] = "k";   // e8
  T.turn = "w";
  T.castleR = { wK: false, wQ: false, bK: false, bQ: false };
  T.epSq = null;
  T.gameOver = false;
  T.Jev.setKey("k");
  let sawSqueeze = false, sawMoreRoom = false, sawEndgameState = false, sawClock = false;
  jevResponder = (body, labels) => {
    if (body.state.includes("ENDGAME")) sawEndgameState = true;
    if (body.state.includes("Fifty-move clock")) sawClock = true;
    for (const [k, v] of Object.entries(body.questions.move.criteria)) {
      if (/squeezes the enemy king/.test(v)) sawSqueeze = true;
      if (/MORE room/.test(v)) sawMoreRoom = true;
    }
    const probabilities = {};
    for (const l of labels) probabilities[l] = 0.01;
    probabilities["h1h8"] = 0.9; // rook to h8 cuts the king off
    return { choice: "h1h8", confidence: 0.7, probabilities };
  };
  S.whiteMove();
  await sleep(120);
  check("endgame state text present", sawEndgameState);
  check("fifty-move clock shown in endgame", sawClock);
  check("king-squeeze annotations present", sawSqueeze);
  check("king-freed annotations present", sawMoreRoom);
  check("endgame move applied", T.lastUci === "h1h8" && T.turn === "b");
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error("CRASH:", e); process.exit(1); });
