<img width="718" height="803" alt="chess" src="https://github.com/user-attachments/assets/ed71859c-26ab-46e2-9d1f-f0a24a2fb1e6" />

# Jev Chess

A small chess game where the White pieces are played by
[Jev](https://www.typesafe.ai), TypeSafe AI's "System One" decision
model, when an API key is available. Without a key, White falls back to
a built-in local heuristic AI. You play Black. In autoplay mode, the
local heuristic drives Black against Jev's White (or against itself if
no key is set). This follows the same architecture as
[Go](https://github.com/dagfinndybvig/Go) and
[Fight](https://github.com/dagfinndybvig/Fight) in the same Arcade
collection.

Jev is a general-purpose decision model, not a dedicated chess engine.
It receives a text description of the board and chooses one move per
turn — no search tree, no minimax, no evaluation function beyond what
the prompt describes. It is one of the oldest dreams of AI ("the Turing
test of game-playing"), and modern LLM-based decision models play chess
roughly at weak-club level: they know how pieces move and spot simple
tactics, but no general-purpose decision model can match even a one-ply
greedy heuristic at consistent material play. The local heuristic here
is also deliberately weak (capture value, opponent-reply capture
penalty, center bias, no positional understanding), so the two are
comparable — autoplay is a baseline AI benchmark, not a strong chess
exhibition.

The game is also served from GitHub Pages:
**https://dagfinndybvig.github.io/Chess/** — Jev needs the local proxy
server and an API key (see Running below). On Pages (or when opening
`jev-chess.html` directly without a server) the game tries the TypeSafe
API directly with your browser key, but the API sends no CORS headers,
so the browser blocks the call. To play against Jev, run `node
server.js` locally. Without a key (on Pages, file://, or localhost
without a key), White is played by the local heuristic AI instead —
the game still works, just without Jev.

## Rules

Full chess rules on an 8x8 board: all piece moves, castling, en passant,
pawn promotion (auto-queen — a deliberate simplification, since
under-promotions are rare and it keeps the move set small for Jev),
check, checkmate, and stalemate. Draws are detected for the fifty-move
rule, threefold repetition, and insufficient material (K vs K, K+minor
vs K). There is no pass in chess — White opens every game, so the
machine (Jev or the local AI) always plays the first move.

## Controls

| Action | Input |
| --- | --- |
| Move a piece | Click the piece, then click its destination (legal targets are dotted) |
| Undo | Undo button (returns to your turn, taking back the last full move pair) |
| New game | New game button |
| Set Jev API key | `J` |
| Toggle Jev log panel | `L` |
| Toggle autoplay (Jev vs local AI) | `0` |

All of these are also visible as buttons above the board: **Autoplay:
off/on (0)**, **API key (J)**, and **Jev log (L)**.

## Running

**Without a server (local AI plays White):** open `jev-chess.html`
directly in a browser. No build step, no external assets. Without an
API key, White is played by the local heuristic AI — the game works,
just without Jev.

**With Jev AI:** the TypeSafe API does not send CORS headers, so
browser-to-API calls are blocked. A zero-dependency Node.js proxy server
is included. Run it locally:

```
node server.js
```

Then open **http://localhost:3001** in your browser. The server picks
up `TYPESAFE_API_KEY` from its environment automatically (check
`GET /jevstatus`); you can also press **J** in-game and paste a key from
[console.typesafe.ai](https://console.typesafe.ai). A browser key always
takes precedence. The key is stored in `localStorage`.

The port is **3001**, not 3000, because the Go repo's server
(`Arcade/Go`) uses 3000 — both games can run at the same time.

**Environment variable:**

```
# macOS / Linux
TYPESAFE_API_KEY=yourkey node server.js

# Windows (cmd.exe)
set TYPESAFE_API_KEY=yourkey && node server.js

# Windows (PowerShell)
$env:TYPESAFE_API_KEY="yourkey"; node server.js
```

The HUD shows who is playing at all times:

- A yellow **matchup line** under the title with stone glyphs, e.g.
  `● You (Black)  vs  ○ Jev (White)`,
  `● You (Black)  vs  ○ Local AI (White)` (no key),
  `● Local AI (Black)  vs  ○ Jev (White)` (autoplay with key), or
  `● Local AI 1 (Black)  vs  ○ Local AI 2 (White)` (autoplay without key),
  naming the actual driver of each colour.
- A bordered **player combinations** panel listing the possible
  matchups and how to switch between them.
- The indicator in the bottom-right corner:

- **green WHITE: JEV** — Jev is active and choosing White's moves
- **red WHITE: LOCAL AI** — no API key set; the local heuristic is
  playing White. Press J to enter a key (Jev needs `node server.js` on
  localhost).

### Starting, stopping, restarting the server

**Start** — from the game folder:

```
cd C:\Users\dybvig\Arcade\Chess
node server.js
```

It prints a banner, the game URL, and whether a server-side key was
found. The game is then at **http://localhost:3001**.

**Stop** — press `Ctrl+C` in the terminal running it. If it runs in the
background with no terminal, kill the process holding port 3001:

```
# Windows (cmd.exe / PowerShell)
netstat -ano | findstr :3001
taskkill /F /PID <pid>

# macOS / Linux
lsof -ti :3001 | xargs kill
```

**Restart** — stop it, then start it again. Two things worth knowing:

- Changes to `jev-chess.html` do **not** need a restart — static files
  are read from disk on every request, so a browser refresh picks them
  up.
- Changes to `server.js` **do** need a restart.

**Port already in use** — if startup fails with
`Error: listen EADDRINUSE: address already in use :::3001`, a previous
instance is still running. Stop it with the commands above, then start
again.

**If the server stops mid-game** — Jev polls fail and White stops
moving (the HUD turns red and shows "NO KEY"). The game retries up to
3 times before showing an error. Once the server is running again, Jev
resumes automatically on White's next turn — no page reload needed, as
long as the server had a key when the page was loaded. If the page was
loaded while the server was down, either reload the page after starting
the server, or press `J` and enter a key.

## How it works

On each White turn:

1. **State** — the game builds a text description: the board diagram
   (ranks 8→1, files a-h), material captured by both sides, both
   players' last moves, the material balance with an ahead/behind
   judgment, check status, and a scan of "pieces in danger" (own
   undefended or cheaper-attacked pieces; opponent pieces that can be
   captured for free) so Jev sees threats.
2. **Filter** — when there are more than 30 legal moves, the game
   selects the 30 most relevant: captures, checks, moves of attacked
   pieces, and center/development moves. This focuses Jev on tactically
   meaningful options instead of 40+ generic repositioning choices.
3. **Question** — a single `Choice` question is POSTed to the TypeSafe
   System One API (model `jev-latest`) through the local proxy: one
   option per candidate move (labelled `e2e4`-style), each annotated
   with its tactical effects (captures, check, checkmate, escapes
   check, rescues an attacked piece, promotion, castling, development,
   the destination square's safety), plus a 1-ply lookahead showing
   the opponent's best reply. There is no pass option — chess has no
   passing.
4. **Decision** — Jev returns the chosen move, a probability
   distribution over all options, and a confidence score. No text
   generation — one typed round trip per turn.
5. **Pick** — the game plays the highest-probability legal option from
   the distribution: Jev's best move, with no randomness.
6. **Retry** — on timeout (10s) or error, the game retries up to 3
   times before showing an error message. There is no fallback on low
   confidence or errors — Jev always plays its best move. The only
   fallback is when no API key is set: White is played by the local
   heuristic instead.

```
board state + piece threats -> text -> filter to 30 candidates
            -> POST /jev -> choice + probabilities + confidence
            -> argmax over legal options -> White plays
```

Press **L** in-game to watch the decisions live. In the browser
console, `window.jevLog()` returns the last 200 decisions and
`window.jevClear()` empties the log.

## Autoplay mode

Press **0** to toggle autoplay: Jev (White) plays against the local
heuristic AI (Black), with no human input. Each side moves on a ~700ms
cadence, and when the game ends the result appears in large red letters
across the board for a few seconds before a new game starts
automatically. The result line names the AIs instead of "you" — **Local
AI** (Black) vs **Jev** (White) — so you can watch Jev's best moves
against the greedy heuristic's captures-and-material play. Without an
API key, autoplay is local AI vs local AI — both sides use the
heuristic.

Toggling autoplay off mid-game returns control: you play Black from
whatever position the board is in. Undo is disabled while autoplay
runs.

## Architecture

```
jev-chess.html  — entire game (single file, no dependencies)
server.js       — local Node.js server + Jev CORS proxy (run: node server.js)
index.html      — redirect to jev-chess.html, so GitHub Pages serves the game
```

The game logic (moves, castling, en passant, check, mate/draw
detection) is pure functions over an 8x8 array; the Jev integration
mirrors the pattern used in
[Go](https://github.com/dagfinndybvig/Go) and
[Fight](https://github.com/dagfinndybvig/Fight).
