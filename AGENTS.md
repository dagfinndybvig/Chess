# AGENTS.md

Notes for coding agents working in this repo. Read this before editing.

## What this is

The product is **Chess Harness** (page title, `<h1>`, server banner,
README H1). "Jev" names the AI player, not the game — do not rebrand
the player back into the title, and do not rename the file
`jev-chess.html` or the `/jev` endpoint (Pages and docs link them).

An 8x8 chess game (`jev-chess.html`, single file plus the committed
`le-chonk.webp` banner art) whose White pieces are played by the
TypeSafe "System One" decision
model (Jev) when an API key is available — falling back to a local
greedy heuristic when no key is set. A local greedy heuristic drives
Black in autoplay mode. `server.js` is a zero-dependency Node proxy that
makes Jev work locally; started with `MISTRAL_MODEL` plus
`MISTRAL_API_KEY`, it instead answers `POST /jev` itself by adapting
each decision request to a Mistral chat completion (chat-adapter
policy, Le Chonk = `mistral-large-4`). See DESIGN.md for architecture
and README.md for usage. Same pattern as the Fight and Go repos in the
Arcade collection.

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

### Promotions are full (Q/R/B/N)

`genPseudo` generates all four promotion options per promotion (pushes
and captures); `m.promo` holds the target piece and `makeMove` honors
it. `PROMOS` lists the queen first, so "first legal move to a square"
logic (the human's click) still promotes to a queen — only Jev and the
heuristic see all four options. Standard perft references are valid at
every depth; validated: start d3 = 8902, start d4 = **197281** (NOT
197285 — that number is wrong; Stockfish's own `go perft 4` divide
sums to 197281), Kiwipete d3 = 97862, position 3 d4 = 43238 and
d5 = 674624, position 4 d1/d2/d3 = 6/264/9467 (position 4's FEN castling
field is `kq` — fixtures must pass black's rights or the count is short
by the missing castles).

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
  sampling). `thinking` is an optional field only the Mistral adapter
  sends; include a string in the mock to exercise the Chonk UI panel.
- `heuristicPick` has random tie-breaking (`Math.random() * 2` in the
  score). Never assert a specific move choice — assert stone/piece
  counts or game termination.
- `undo()` restores the most recent snapshot where Black was to move —
  it takes back a full move pair, not one ply.
- Delete test scripts when done; they are not committed.

### Bench harness

`bench-jev.js` (headless autoplay of White vs the local heuristic
through the live proxy, writing per-game records with confidence and
hanging-piece metrics to `bench-results.json`) exists ONLY in this
local checkout — it is hidden via `.git/info/exclude`, not
`.gitignore`, so a fresh clone has neither file and git status stays
clean. Do not commit them, and pass a custom outfile (`node
bench-jev.js 1 my-run.json`) so the author's retained results are not
clobbered. Its per-move deadline is 90s — too tight for Le Chonk
(see the Mistral invariant above); use a single-move replay to verify
that backend.

### Shell quirks (Git Bash on Windows)

- Use POSIX paths: `cd /c/Users/dybvig/Arcade/Chess`. Windows paths
  with backslashes error with "No such file or directory".
- `$1`/`$2` inside double-quoted `node -e "..."` strings are expanded by
  bash — use the edit tool for source changes, not shell one-liners.
- Quote URLs with parentheses.
- Do not print `TYPESAFE_API_KEY`; it is set in this environment.
  `MISTRAL_API_KEY` lives in `~/.vibe/.env` — never print it or commit
  it; to run the Chonk backend, source that file in a launcher script
  (`set -a; source ~/.vibe/.env; set +a`) instead of exporting the key
  in a command line, which lands it in tool logs.
- `kill $!` in Git Bash does NOT kill the Windows node child, and the
  background process tool's stop sometimes leaves it alive too — always
  confirm with `netstat -ano | findstr :3001` and `taskkill //F //PID
  <pid>` (double slashes in Git Bash) before starting another server.

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
  errors: `whiteMove` retries up to 3 times (10s timeout per attempt,
  120s when the backend is Mistral); if all retries fail it shows an
  error message and plays no move.
- Backend precedence: a Mistral chat backend (`MISTRAL_MODEL` +
  `MISTRAL_API_KEY` on the server) takes precedence over Jev while
  set — `POST /jev` goes to `api.mistral.ai/v1/chat/completions` via
  the server's adapter, and a browser key does not override it.
  `/jevstatus` reports `backend` (`mistral:<model>` or `typesafe`) and
  `mode` (`chat` or `typesafe`) alongside `serverKey`. The browser
  reads `backend` for the timeout, the HUD (`WHITE: MISTRAL <model>`),
  and `labels()` (`Jev.displayName()`), and its error hint points at
  the server's Mistral env vars instead of the J prompt. The adapter
  includes every choice criterion description in the prompt (they are
  the coaching) and returns synthetic peaked probabilities (0.5 pick /
  shared rest, 0.9 confidence) — do not compare chat-adapter games
  with the Jev benchmarks. Le Chonk is a hybrid reasoning model:
  `message.content` is an ARRAY of parts (`thinking` + `text`) —
  `mistralContentJson` extracts the text parts, and also accepts a
  string or parsed-object content. Measured: ~60–120s per move at full
  thinking, so the local bench harness's 90s per-move deadline stalls
  Chonk games — verify this backend with a single-move replay, not a
  full bench run. The reasoning effort is RUNTIME server state
  (`mistralReasoning`, default from `MISTRAL_REASONING` or "high"):
  `/jevstatus` reports it as `reasoning`, `POST /jevreasoning {effort}`
  sets it (high/none; low/medium pass through for other models), and
  the browser's Chonk mode button toggles it via
  `Jev.toggleReasoning()` with the label driven by
  `updateChonkUi()` — placeholder panel text flips with the mode but
  real thinking text is never overwritten. mistral-large-4 accepts
  only `high` (long thinking, fills the panel) or `none` (~1s per
  move, no reasoning trace).
- The Chonk UI: the server passes the reasoning trace through as
  `answers.move.thinking`; `query` returns it, `chooseMove` logs it,
  and `whiteMove` calls `showThinking()` after a successful move, which
  renders the LAST ok log entry's thinking into the `#think` panel
  (with the move label in `#thinkmove`). Banner (`#chonkhead`,
  `le-chonk.webp` art) and panel visibility are driven by
  `updateChonkUi()` via `refreshHud()` — visible only when
  `chonkActive()` (enabled && mistral backend). server.js serves
  `.webp`; `le-chonk.webp` is a committed asset the page references.
- There is **no pass option** in the Jev criteria — chess has no pass.
  Jev must pick one of the listed moves.
- `filterMoves` reduces >30 legal moves to 30 candidates before
  querying Jev. `chooseMove` receives filtered moves; `buildState` and
  `describeMove` see the filtered set. The argmax in `chooseMove` only
  considers filtered move labels.
- `jevLastChoice` (White's previous move, shown in the state text) is
  set in `applyMove` for every White move — Jev and heuristic-fallback
  alike. Keep it that way (the Go repo had a regression here).
- `moveList` (all moves played, for the state text's history line and
  the anti-shuffle detection) is pushed in `applyMove`, reset in
  `newGame`, and truncated by `undo`. Keep all three updated together.
- `applyMove` performs all end detection (checkmate, stalemate,
  fifty-move, insufficient material, threefold) synchronously, and
  `repMap`/`history` must stay consistent for undo: each history entry
  stores the `repKey` its move created (undo decrements it), plus a
  copy of `captures` and the `moveList` length, which `undo` restores —
  without them the scoreboard and Jev's state text lie after an undo
  (this exact bug shipped and was fixed; don't reintroduce it).
- `describeMove`'s annotations drive Jev's skill level and were
  iterated to beginner strength against the heuristic (see DESIGN.md's
  measured results). The load-bearing ones: the quantified 3-ply
  exchange verdict (BAD MOVE / WINS MATERIAL), defender-abandonment
  detection, the two-move tactic warning (an opponent quiet reply that
  leaves a NEW White piece hanging — warning only, never BAD MOVE),
  the conversion escalations when ahead by 4+ (CONVERSION state line,
  repetition/shuffle wording), third-occurrence repetition warnings,
  the passive-shuffle flag, and the `endgameMode` king-squeeze
  annotations. If you change them, re-run headless autoplay games and
  compare — do not trust descriptions alone.
- `endgameMode` is computed per turn in `query()` (via `kingHuntMode()`)
  BEFORE the criteria are built, because `describeMove` reads it.
  Preserve that ordering.
- `moveSeq` invalidates pending Jev decisions: `whiteMove` captures it
  before its async work, and `undo`/`newGame` bump it. A Jev answer
  arriving after an undo or new game must be discarded, not played.
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
