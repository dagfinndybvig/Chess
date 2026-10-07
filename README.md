<img width="333" height="425" alt="chesschonk2" src="https://github.com/user-attachments/assets/b6724a7d-9f40-4413-a6d7-4ce149bf092f" />
<img width="395" height="234" alt="chesschonk3png" src="https://github.com/user-attachments/assets/84b7b38d-fe12-4de6-b83f-d68986f44f33" />


# Chess Harness

A single-file chess game built as a **general-purpose harness for
testing AI models at chess**. The White pieces are driven by whichever
model backend the server is configured with — you plug a model in,
play against it, or watch it benchmark itself in autoplay. You play
Black.

Two backends have been tried with it so far:

| Backend | Kind | How it chooses a move |
| --- | --- | --- |
| [Jev](https://www.typesafe.ai) (TypeSafe "System One", `jev-latest`) | Decision model | A single typed `Choice` question over the annotated candidate moves; returns a choice, probabilities, and confidence |
| Le Chonk ([Mistral Large 4](https://console.mistral.ai)) | Chat model, via the built-in chat adapter | Each decision question is adapted to one chat completion with structured outputs, constrained to the legal move labels; its reasoning trace is shown live in the thinking panel |
| Local AI | Built-in greedy heuristic | Capture value, opponent-reply penalty, center bias — no search |

The local heuristic is the constant of the harness: it plays Black in
autoplay (the benchmark opponent), and it plays White whenever no
backend is configured — the harness always works, with or without any
API key. This follows the same architecture as
[Go](https://github.com/dagfinndybvig/Go) and
[Fight](https://github.com/dagfinndybvig/Fight) in the same Arcade
collection, both of which use the same pattern.

Why chess as a model test? The models being tested are general-purpose
decision or chat models, not dedicated chess engines. The harness gives
them a text description of the board and one move per turn — no search
tree, no minimax, no evaluation function beyond what the prompt
describes. It is one of the oldest dreams of AI ("the Turing test of
game-playing"), and modern LLM-based models play chess roughly at
weak-club level at best: they know how pieces move and spot simple
tactics, but the harness's deliberately weak one-ply heuristic (capture
value, opponent-reply capture penalty, center bias, no positional
understanding) is a fair baseline — autoplay games between a backend
and the heuristic are a genuine benchmark of whether the model can
play goal-directed chess, not a strong chess exhibition.

### Measured results: reaching beginner level (Jev)

Jev started far below beginner level and was iterated to it. Each
iteration was measured with headless autoplay games (Jev White vs the
local heuristic Black, through the live TypeSafe API; the same protocol
as the Go repo's measurements). Summary — game-by-game detail in
DESIGN.md:

| Iteration | Record (W-D-L) | What changed / what it fixed |
| --- | --- | --- |
| Baseline | 0-2-0 | Both games drawn by threefold repetition at 19-33 plies (Jev shuffled instead of playing); Jev also hung its queen to the black king |
| 1: repetition awareness + quantified exchanges | 1-0-2 | No more instant-repetition draws; Jev stopped most recapture blunders and won one game |
| 2: BAD MOVE flags, defender-abandonment, anti-shuffle | 5-2-0 across two batches (3/3, then 2.5/4) | Jev stopped choosing annotated blunders; won on material and mate |
| 3: endgame mating technique coaching | 4-0-0 | Jev converts winning endgames (an iteration-2 game was up 11-0 against a bare king and still drew); all four wins by checkmate in 49-111 plies |

Overall across iterations 2-3: 9.5/11 (~86%). Jev now takes free
material, keeps its pieces defended, develops, castles, and mates with
a material lead — competent beginner chess, clearly above the
deliberately weak baseline. Against strong human beginners it would
still lose (no search, no positional play) — the honest ceiling of a
one-decision-per-turn model choosing among annotated options.

**Fresh confirmation run (8 games, same protocol).** Re-measured after
the line-ending/git cleanup to confirm the level still holds: **6.5/8
(~81%)** — 6 wins by checkmate, 1 stalemate draw, 1 game that hit the
250-ply cap while Jev was down on material. Batch 1 was 2.5/4 (the
stalemate came with Jev up 10-1; the capped game had Jev down 1-6);
batch 2 was a clean 4/4, all checkmate. The stalemate-in-a-winning-
position was the one recurring weakness — Jev drives the king to the
edge but does not always avoid stalemating it.

**Stalemate avoidance (iteration 4).** Fixed in two layers: every move
that stalemates the opponent is annotated `BAD MOVE` when Jev is ahead
(so it is never chosen), and — the hard guarantee — such moves are
removed from the candidate set entirely before Jev is queried, so it
physically cannot play one in a winning position. Re-measured over 12
games: **7.5/12 (~63%)** — 6 wins, 3 draws, 3 losses, and **no
stalemate** (a 10-0 lead was converted to checkmate). The score is
lower than the 81% confirmation run because of variance: three quick
blunder losses (Jev hung material and got mated) and one failure to
convert (drew by repetition while up 10-6). The stalemate itself is
gone; the remaining weaknesses are conversion and blunder avoidance
(see TODO).

**Le Chonk (Mistral Large 4)** has been tried through the chat adapter
but not put through the same 12-game measurement batch: full reasoning
takes 1–3 minutes per move, which exceeds the local bench harness's 90s
per-move deadline, so this backend is verified with single-move
replays rather than a benchmark run. Its synthetic peaked probabilities
are not model confidences, so its games are not comparable with the
Jev benchmarks above even when it does play them.

The game is also served from GitHub Pages:
**https://dagfinndybvig.github.io/Chess/** — no backend can run on
Pages (the APIs send no CORS headers, so the browser blocks direct
calls even with a browser key). On Pages (or when opening
`jev-chess.html` directly without a server) White is played by the
local heuristic AI — the harness still works, just without a model.
To play against a model, run `node server.js` locally.

## Rules

Full chess rules on an 8x8 board: all piece moves, castling, en passant,
pawn promotion — the models and the local AI consider all four
promotion pieces and are coached to prefer the queen (your own
click-promotion plays a queen), check, checkmate, and stalemate. Draws
are detected for the fifty-move rule, threefold repetition, and
insufficient material (K vs K, K+minor vs K). There is no pass in
chess — White opens every game, so the machine (the configured model
or the local AI) always plays the first move.

## Controls

| Action | Input |
| --- | --- |
| Move a piece | Click the piece, then click its destination (legal targets are dotted) |
| Undo | Undo button (returns to your turn, taking back the last full move pair) |
| New game | New game button |
| Set a TypeSafe API key (Jev) | `J` |
| Toggle log panel | `L` |
| Toggle autoplay (model vs local AI) | `0` |
| Toggle the model's reasoning (Le Chonk backend) | **Reasoning: on/off** button |

All of these are also visible as buttons above the board: **Autoplay:
off/on (0)**, **API key (J)**, **Log (L)**, and — when the Mistral
backend is active — the colour-coded **Reasoning** button.

## Running

The harness is a zero-dependency Node.js server. Install
[Node.js 18 or newer](https://nodejs.org), clone, and start it with
whichever backend you want to test (or with no backend at all):

```
git clone https://github.com/dagfinndybvig/Chess
cd Chess
node server.js
```

Open **http://localhost:3001** in your browser.

**Backend 1: Mistral Le Chonk (chat adapter).** Set `MISTRAL_MODEL`
(for example `mistral-large-4`, the Mistral Large 4 "Le Chonk"
preview) plus `MISTRAL_API_KEY` (from
[console.mistral.ai](https://console.mistral.ai)) in the environment
and run the same server:

```
# Windows (cmd.exe)
set "MISTRAL_MODEL=mistral-large-4" && set "MISTRAL_API_KEY=yourkey" && node server.js

# Windows (PowerShell)
$env:MISTRAL_MODEL="mistral-large-4"; $env:MISTRAL_API_KEY="yourkey"; node server.js

# macOS / Linux
MISTRAL_MODEL=mistral-large-4 MISTRAL_API_KEY=yourkey node server.js
```

The server converts each decision request into one
`api.mistral.ai/v1/chat/completions` request with structured outputs
(a JSON schema constraining the reply to one of the listed move labels,
with every option's tactical annotation included in the prompt), then
reshapes the reply. So White is played by a general chat model, not a
decision model. This is a chat-adapter policy, like the Go repo's:
it is metered (cloud), needs no local model, takes precedence over the
Jev backend (a browser key does not override it), and its synthetic
peaked probabilities are not model confidences — its games are not
comparable with the Jev benchmarks above.

Speed: Le Chonk reasons over every annotated option, so with full
thinking a move takes 1–3 minutes on dense positions (the game's
timeout is 300 seconds for this backend). The **Reasoning: on /
Reasoning: off** button in the controls (green / red) switches at
runtime — off skips the reasoning trace entirely and, measured, drops
moves to about a second, at the cost of the thinking panel's content
(and likely some play quality). The default is full reasoning;
`MISTRAL_REASONING=none` at server start gives fast sessions.
`mistral-large-4` accepts only `high` or `none`.

When this backend is active, the page gets a **Le Chonk** skin: a
banner with the Mistral Large 4 release art (the voxel cat,
`le-chonk.webp`) in the release's dark-blue/orange palette, and a
**thinking panel** that shows the model's actual reasoning trace for
its most recent move — the server passes the hybrid model's
`thinking` content parts through with each answer.

**Backend 2: Jev (TypeSafe System One).** The TypeSafe API does not
send CORS headers, so browser-to-API calls are blocked; the included
proxy handles that. Run the server with `TYPESAFE_API_KEY` in its
environment (check `GET /jevstatus`), or press **J** in-game and paste
a key from [console.typesafe.ai](https://console.typesafe.ai). A
browser key always takes precedence over the server-side key. The key
is stored in `localStorage`.

```
# macOS / Linux
TYPESAFE_API_KEY=yourkey node server.js

# Windows (cmd.exe)
set TYPESAFE_API_KEY=yourkey && node server.js

# Windows (PowerShell)
$env:TYPESAFE_API_KEY="yourkey"; node server.js
```

**No backend:** run `node server.js` with no keys, or open
`jev-chess.html` directly in a browser. White is played by the local
heuristic AI. No build step, no external assets.

Backend precedence while the server runs: a Mistral chat backend
(`MISTRAL_MODEL` + `MISTRAL_API_KEY`) takes precedence over Jev while
set — `POST /jev` goes to Mistral, and a browser key does not override
it. With no backend at all, White falls back to the local heuristic.

The port is **3001**, not 3000, because the Go repo's server
(`Arcade/Go`) uses 3000 — both games can run at the same time.

The HUD shows who is playing at all times:

- A yellow **matchup line** under the title with stone glyphs, e.g.
  `● You (Black)  vs  ○ Mistral (White)`,
  `● You (Black)  vs  ○ Jev (White)`,
  `● You (Black)  vs  ○ Local AI (White)` (no key),
  `● Local AI (Black)  vs  ○ Jev (White)` (autoplay with key), or
  `● Local AI 1 (Black)  vs  ○ Local AI 2 (White)` (autoplay without key),
  naming the actual driver of each colour.
- A bordered **player combinations** panel listing the possible
  matchups and how to switch between them.
- The indicator in the bottom-right corner:

- **green WHITE: JEV** — the Jev backend is active and choosing
  White's moves
- **green WHITE: MISTRAL <model>** — the Mistral chat backend
  (`MISTRAL_MODEL`) is active and choosing White's moves
- **red WHITE: LOCAL AI** — no backend configured; the local
  heuristic is playing White. Press J to enter a key (Jev needs
  `node server.js` on localhost; the Mistral backend is configured
  entirely on the server).

### Starting, stopping, restarting the server

**Start** — from the game folder (wherever you cloned it):

```
cd Chess
node server.js
```

It prints a banner, the game URL, and which backend (if any) it
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

**If the server stops mid-game** — decision calls fail and White stops
moving (the HUD turns red). The game retries up to 3 times before
showing an error. Once the server is running again, the model resumes
automatically on White's next turn — no page reload needed, as long
as the server had a backend configured when the page was loaded. If the
page was loaded while the server was down, either reload the page after
starting the server, or press `J` and enter a key.

## How it works

The same pipeline drives every backend — only the question format
changes. On each White turn:

1. **State** — the game builds a text description: the board diagram
   (ranks 8→1, files a-h), material captured by both sides, both
   players' last moves, the material balance with an ahead/behind
   judgment, check status, and a scan of "pieces in danger" (own
   undefended or cheaper-attacked pieces; opponent pieces that can be
   captured for free) so the model sees threats.
2. **Filter** — when there are more than 30 legal moves, the game
   selects the 30 most relevant: captures, checks, moves of attacked
   pieces, and center/development moves. This focuses the model on
   tactically meaningful options instead of 40+ generic repositioning
   choices.
3. **Question** — a single `Choice` question with one option per
   candidate move (labelled `e2e4`-style), each annotated with a
   quantified exchange verdict (WINS MATERIAL / even trade / BAD MOVE
   — loses N points), checkmate and check flags, defender abandonment
   warnings, two-move tactic warnings, repetition warnings, rescue and
   development notes, and — in bare-king endgames — king-squeeze
   progress toward mate. There is no pass option — chess has no
   passing. The annotations are the coaching: they were iterated
   against the heuristic until Jev reached beginner level, and they
   are included verbatim in the Mistral chat prompt too.
4. **Decision** — the backend answers the question. Jev returns a
   choice, a probability distribution over all options, and a
   confidence score; the Mistral adapter returns a structured choice
   plus, for hybrid reasoning models, the thinking trace. One round
   trip per turn either way — no free-form text generation is trusted
   for the move.
5. **Pick** — the game plays the highest-probability legal option from
   the distribution: the model's best move, with no randomness.
6. **Retry** — on timeout (10s for Jev; 300s for the Mistral chat
   backend) or error, the game retries up to 3 times before showing an
   error message. There is no fallback on low confidence or errors —
   the model always plays its best move. The only fallback is when no
   backend is configured: White is played by the local heuristic
   instead.

```
board state + piece threats -> text -> filter to 30 candidates
            -> POST /jev -> choice + probabilities + confidence
            -> argmax over legal options -> White plays
```

Press **L** in-game to watch the decisions live. In the browser
console, `window.jevLog()` returns the last 200 decisions and
`window.jevClear()` empties the log.

## Autoplay mode

Press **0** to toggle autoplay: the configured model (White) plays
against the local heuristic AI (Black), with no human input. Each side
moves on a ~700ms cadence, and when the game ends the result appears in
large red letters across the board for a few seconds before a new game
starts automatically. The result line names the players instead of
"you" — **Local AI** (Black) vs **Jev** or **Mistral** (White) — so you
can watch the model's best moves against the greedy heuristic's
captures-and-material play. Without a backend, autoplay is local AI vs
local AI — both sides use the heuristic.

Toggling autoplay off mid-game returns control: you play Black from
whatever position the board is in. Undo is disabled while autoplay
runs.

## Architecture

```
jev-chess.html  — entire harness: game, engine, prompt, UI (single file, no dependencies)
server.js       — local Node.js server + decision proxy + Mistral chat adapter (run: node server.js)
le-chonk.webp   — Mistral Large 4 release art, shown by the Le Chonk skin
index.html      — redirect to jev-chess.html, so GitHub Pages serves the game
```

The game logic (moves, castling, en passant, check, mate/draw
detection) is pure functions over an 8x8 array, validated against
standard perft references (start, Kiwipete, positions 3 and 4). The
model integration mirrors the pattern used in
[Go](https://github.com/dagfinndybvig/Go) and
[Fight](https://github.com/dagfinndybvig/Fight); the chat adapter
policy is documented in DESIGN.md.
