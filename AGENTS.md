# AGENTS.md

Notes for coding agents working in this repo. Read this before editing.

## What this is

An 8x8 chess game (`jev-chess.html`, single file, no dependencies)
whose White pieces are played by the TypeSafe "System One" decision
model (Jev) when an API key is available — falling back to a local
greedy heuristic when no key is set. A local greedy heuristic drives
Black in autoplay mode. `server.js` is a zero-dependency Node proxy that
makes Jev work locally. See DESIGN.md for architecture and README.md
for usage. Same pattern as the Fight and Go repos in the Arcade
collection.

## Gotchas

### CRLF vs LF (the big one)

The working copy is LF, but any `git checkout` / `git rebase` / `git
stash pop` converts files to CRLF (Windows `core.autocrlf`). After that,
edit-tool `old_string` matching silently fails with "not found" because
the file now has `\r\n` while your string has `\n`.

Fix: normalize before editing after any git operation that touches files:

```
node -e "const fs=require('fs');for(const f of ['jev-chess.html','README.md','DESIGN.md']){fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'));}"
```

Expect this after every rebase — it has happened repeatedly in the
sibling repos.

### Board indexing

The board is `board[y][x]` — row first, and **y=0 is rank 1** (White's
back rank), y=7 is rank 8. Pieces are single chars: uppercase White
(`PNBRQK`), lowercase Black, `''` (empty string, not null) for empty.
Moves are labeled `e2e4`-style by `moveLabel(m)` = `coordName(x1,y1) +
coordName(x2,y2)`; coordinates are files `a-h` (x 0-7) and ranks 1-8
(y+1). Test fixtures that assume `board[x][y]` or that rank 8 is y=0
will pass syntax checks and fail mysteriously.

### Promotion is auto-queen

`genPseudo` generates exactly one move per promotion (always `Q` via
`makeMove`). Standard perft reference numbers (which count Q/R/B/N
promotions as four moves) are therefore WRONG for this engine at any
depth where a promotion occurs. Valid references: start position
perft(3) = 8902, Kiwipete perft(3) = 97862, position 3 perft(4) =
43238 (no promotions in those trees at those depths). Position 4 is
only valid at depth 1.

### Testing headlessly

There is no test framework. Tests are throwaway Node scripts using
`vm.runInContext` over the extracted `<script>` block (see the Go
repo's AGENTS.md — the pattern is identical). Known traps:

- Top-level `const`/`let` in the script do **not** become sandbox
  properties (only `function` declarations do — and `opp`, `colorOf`,
  `isWhiteP` are const arrow functions, so they are NOT globals
  either). Append an export shim with getters/setters for the state
  vars (`board`, `turn`, `castleR`, `epSq`, `gameOver`, `halfmove`,
  `repMap`, `history`, `captures`, `lastUci`) and expose `Jev`.
- White opens the game: `newGame()` schedules `whiteMove` via
  `setTimeout`. Capture timers in the sandbox (never run them
  automatically), and call `S.whiteMove()` directly to drive a White
  turn deterministically. Every `applyMove(..., 'w')` also schedules a
  `whiteMove` — clear the timer list between test phases or stale
  White turns will fire.
- The DOM stub does not parse HTML. Assert only on what JS writes via
  `textContent`. The canvas context can be a Proxy that returns a
  noop function for any unknown method.
- `Jev.ready()` resolves asynchronously (`/jevstatus` fetch on
  localhost). Sleep ~50ms after driving a White move before asserting
  on the board. Mock `fetch` to answer `/jevstatus` with
  `{serverKey:false}` and POST `/jev` with `{answers:{move:{choice,
  confidence, probabilities}}}` — any probabilities work, the game
  plays the argmax over legal labels (deterministic, no temperature
  sampling).
- `heuristicPick` has random tie-breaking (`Math.random() * 2` in the
  score). Never assert a specific move choice — assert stone/piece
  counts or game termination.
- `undo()` restores the most recent snapshot where Black was to move —
  it takes back a full move pair, not one ply.
- Delete test scripts when done; they are not committed.

### Shell quirks (Git Bash on Windows)

- Use POSIX paths: `cd /c/Users/dybvig/Arcade/Chess`. Windows paths
  with backslashes error with "No such file or directory".
- `$1`/`$2` inside double-quoted `node -e "..."` strings are expanded by
  bash — use the edit tool for source changes, not shell one-liners.
- Quote URLs with parentheses.
- Do not print `TYPESAFE_API_KEY`; it is set in this environment.

### Server lifecycle

- `node server.js` serves on port **3001** (the Go repo's server uses
  3000 — both can run at once). A second instance fails with
  `EADDRINUSE` — check `netstat -ano | findstr :3001` and kill the
  holder (`taskkill /F /PID <pid>`) before starting.
- Static files are read per request: `jev-chess.html` changes need no
  restart; `server.js` changes do.
- When testing the live API through the proxy, start the server with a
  background process tool, not a foreground bash call — a foreground
  call blocks until timeout.

### GitHub Pages

- `index.html` is a redirect to `jev-chess.html`. Without it, Pages
  renders README.md instead of the game. Do not delete it.
- Jev never runs on Pages (the API sends no CORS headers, so the
  browser blocks direct calls even with a browser key) — White is the
  local heuristic there. Don't "fix" this by pointing the browser at
  the API directly; CORS blocks it. The endpoint logic uses the proxy
  (`/jev`) only on `localhost`/`127.0.0.1`; everywhere else it goes
  direct to `https://api.typesafe.ai`, which the browser blocks.

### Jev integration invariants

- White is Jev when an API key is available (browser key or server
  key). Without a key, White falls back to the local heuristic — the
  game keeps playing. There is no fallback on low confidence or
  errors: `whiteMove` retries up to 3 times (10s timeout per attempt);
  if all retries fail it shows an error message and plays no move.
- There is **no pass option** in the Jev criteria — chess has no pass.
  Jev must pick one of the listed moves.
- `filterMoves` reduces >30 legal moves to 30 candidates before
  querying Jev. `chooseMove` receives filtered moves; `buildState` and
  `describeMove` see the filtered set. The argmax in `chooseMove` only
  considers filtered move labels.
- `jevLastChoice` (White's previous move, shown in the state text) is
  set in `applyMove` for every White move — Jev and heuristic-fallback
  alike. Keep it that way (the Go repo had a regression here).
- `moveSeq` invalidates pending Jev decisions: `whiteMove` captures it
  before its async work, and `undo`/`newGame` bump it. A Jev answer
  arriving after an undo or new game must be discarded, not played.
- `applyMove` performs all end detection (checkmate, stalemate,
  fifty-move, insufficient material, threefold) synchronously, and
  `repMap`/`history` must stay consistent for undo (each history entry
  stores the `repKey` its move created; `undo` decrements it).
- `Jev.ready()` gates White's opening move so the first move of the
  game is not played by the heuristic while `/jevstatus` is still in
  flight. Keep this — without it the opening is wrong whenever a
  server key exists.
- `labels()` takes no parameters — it checks `Jev.isEnabled()` and
  `autoplay` internally.

### Engine correctness

The rules engine has been validated against standard perft numbers
(start, Kiwipete, position 3 — including en-passant pins and castling
through check). If you touch `genPseudo`, `makeMove`, `attackScan`, or
`updateCastleRights`, re-run a perft check before trusting anything
else.
