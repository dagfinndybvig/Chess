# Design

Detailed design notes for *Chess Harness*, an 8x8 chess game whose White
pieces are played by [Jev](https://www.typesafe.ai), TypeSafe AI's
"System One" decision model.

## Overview

The player is Black; the machine is White. White is driven by Jev when
an API key is available, with a local greedy heuristic as fallback when
no key is set. The heuristic also drives Black in autoplay mode, so you
can watch Jev's decisions against a greedy material baseline. The local
heuristic is deliberately kept simple — one-ply capture counting, no
search, no positional evaluation — as a baseline for comparison.

This design follows the architecture of
[*Fight*](https://github.com/dagfinndybvig/Fight) and
[*Go*](https://github.com/dagfinndybvig/Go) in the same Arcade
collection — a one-file game whose AI opponent is driven by Jev through
a local CORS proxy. The Jev integration pattern (state text, `Choice`
question, argmax move selection, retry-on-error) originates there; this
repo adapts it to chess. Unlike the Go game, chess has no pass, so there
is no pass criterion — Jev must always choose one of the listed moves.
And because White moves first in chess, the machine (Jev or the
heuristic) opens every game.

## Why Jev is weak at chess

Jev is a general-purpose decision model, not a dedicated chess engine.
It receives a text description of the board and returns one move per
turn — no minimax, no alpha-beta search, no learned evaluation. Chess
engines reach master level through exactly the machinery Jev lacks:
deep search over millions of positions with a hand-tuned or learned
evaluation function.

In practice, expect three patterns (mirroring what the Go repo
measured):

- **Tactical awareness without strategy.** Jev finds captures, checks,
  and mate-in-one when they are described in the move criteria — these
  map to clear local reasoning. But it does not plan king safety,
  pawn structure, or piece coordination beyond the immediate move.
- **Reactive play.** In quiet positions a decision model tends to
  shuffle pieces or chase the opponent's last move rather than build a
  coherent position. Against a greedy heuristic that always grabs
  material, this loses games on accumulated small losses.
- **Low confidence.** Expect average confidence well under 0.5, with
  high-confidence picks concentrated on captures and checks.

The state text includes a material balance, a pieces-in-danger scan,
check status, and a 1-ply lookahead per candidate move (the opponent's
best reply: best capture value, or check, or no immediate threat).
These measures mirror the Go repo's improvements: they fix the most
obvious blunders — walking into free captures, ignoring mate — but
there is a ceiling on how much prompt context can compensate for a
model that does not search.

#### Measured results — the iteration to beginner level

Jev was measured against the local heuristic in headless autoplay
(Jev White, heuristic Black, live TypeSafe API through the proxy), the
same protocol as the Go repo. It took three iterations to reach
beginner-level play.

**Baseline (2 games).** Both drawn by threefold repetition — 33 and 19
plies. Jev did not lose every piece (material 26-33, then 36-38) but
wasn't playing chess: it shuffled until the position repeated three
times. In game 1 it also hung its queen to the black king (Qf5 next to
Ke6) and the heuristic's king ate 13 points of White material.
Diagnosis: recapture risk was described only as prose ("opponent can
capture 9 points in reply"), and nothing told Jev that repeating
positions ends the game.

**Iteration 1 — repetition awareness + quantified exchanges (3 games):
1 win, 2 losses.** Every move now carries a 3-ply exchange verdict
(WINS MATERIAL / LOSES MATERIAL / even trade / materially safe) computed
from the opponent's best recapture and my best re-recapture, and moves
that would repeat a position for the third time are flagged as drawing.
The repetition draws vanished. But Jev still lost 202- and 66-ply games
by checkmate while ahead of where it used to be: in game 2 it chose a
bishop grab annotated "LOSES MATERIAL: about -2" anyway, and in long
endgames it shuffled passively (Rf1-e1-f1-e2...) while the heuristic
queen ate the board.

**Iteration 2 — BAD MOVE prefixes, defender abandonment, anti-shuffle
(3 + 4 games): 5 wins, 2 draws, 0 losses.** Net-negative moves now
begin with "BAD MOVE." on the whole description and the instructions
forbid them outright; moves that leave an own piece newly hanging are
named ("abandons your knight at f3"); moving a piece straight back to
a recently-vacated square is flagged as a passive shuffle. Results:
3/3 in the first batch (material 34-19, 23-9, 16-1, zero-to-minimal
hanging), then a 4-game stability batch: one close 88-ply loss (12-13
material, a real game), one draw, and two wins. The draw was the
revealing failure: Jev was up **11-0 against a bare king** (R+B vs K)
and still could not finish — 242 plies of shuffling until threefold
repetition.

**Iteration 3 — endgame mating technique (4 games): 4 wins, 0 draws,
0 losses.** When the opponent has (almost) no material and we are
clearly ahead, the state text teaches the technique (drive the king to
an edge, use your own king, checks only when they push toward mate,
never repeat, fifty-move clock) and each move is annotated with its
effect on the enemy king's escape squares ("squeezes the enemy king:
2 escape squares remain" / "gives the enemy king MORE room"). All four
games ended in checkmate in 49-111 plies with Jev ahead on material
throughout (17-7, 16-12, 23-11, 28-21). Sample first game: Jev grabbed
a hung e5 pawn on move 3, traded into a winning endgame, and mated —
no shuffling, no repetition.

**Overall:** 9.5/11 (~86%) across iterations 2-3. What beginner level
means here, concretely: Jev takes free material, does not choose
annotated blunders, keeps pieces defended, develops and castles, and
converts material leads into checkmates. What it still cannot do:
plan beyond the annotated horizon — two-move tactics, pawn structure,
king safety under sustained attack — and any game where the
opponent out-calculates it will still be close (the 88-ply loss). This
is the honest beginner: solid on tactics that are described, blind to
strategy that is not.

**Fresh confirmation run (8 games, same protocol).** Re-measured after
the git line-ending cleanup to confirm the level still holds. Result:
**6.5/8 (~81%)** — 6 checkmate wins, 1 stalemate draw, 1 game that hit
the 250-ply cap with Jev down on material.

- Batch 1 (2.5/4): game 1 was a **stalemate draw** with Jev up 10-1
  (219 plies) — the kingHuntMode coaching drove the king to the edge
  but did not avoid stalemating it; game 2 a 165-ply checkmate (31-0);
  game 3 a 77-ply checkmate (18-16); game 4 hit the 250-ply cap with
  Jev down 1-6 (it had lost the material battle and shuffled).
- Batch 2 (4/4): all checkmate — 41 plies (31-13), 207 plies (10-0,
  a converted bare-king endgame), 77 plies (24-13), 53 plies (22-4).

**Stalemate avoidance (iteration 4).** The batch-1 stalemate was the
one recurring weakness: in a winning endgame Jev sometimes stalemated
the enemy king instead of mating it. Fixed in two layers:

1. **Annotation** in `describeMove`: a move that stalemates the
   opponent (no legal moves, no check) is prefixed `BAD MOVE` when Jev
   is ahead on material; when behind it stays a neutral "good escape".
2. **Hard constraint** in `chooseMove`: when Jev is ahead on material,
   any candidate that stalemates the opponent is filtered out before
   the position is sent to Jev, so it physically cannot choose one in a
   winning position.

The annotation alone was insufficient — in an annotation-only batch Jev
was up 12-0 and still picked the stalemating move as its argmax. The
hard constraint guarantees it cannot. Re-measured over 12 games:
**7.5/12 (~63%)** — 6 wins, 3 draws, 3 losses, and **no stalemate** (a
10-0 lead was converted to checkmate). The score is lower than the
fresh run because of variance, not the fix: the losses were blunders
(one mate in 26 plies while up 33-32, one in 18 plies while down
35-38, one in 122 plies while down 0-9) and two draws were failures to
convert a winning position (drew by repetition while up 10-6). The
stalemate itself is gone.

## Rules implementation

The board is an 8x8 array, `board[y][x]`, with `y=0` at rank 1 (White's
back rank). Pieces are single characters: uppercase for White
(`PNBRQK`), lowercase for Black, `''` for empty. All rules are pure
functions over that array — no game state lives in the DOM.

### Move generation

`genPseudo(bd, color, castle, ep)` generates pseudo-legal moves for
every piece: pawn pushes (single and double from the start rank),
pawn captures, en passant captures, knight jumps, sliding rays for
bishop/rook/queen, king steps, and castling. Castling is generated
only when the rights flag is set, the king is on its home square, the
path squares are empty, and the king's start, transit, and destination
squares are not attacked (a king may not castle out of, through, or
into check).

`makeMove(bd, m)` applies a move to a copy of the board: it handles the
en passant capture (removing the pawn on the origin rank), the castling
rook relocation, and promotion. Promotion is **auto-queen** — one move
per promotion instead of four (Q/R/B/N). This keeps the option list
small for Jev and matches how beginners play; under-promotion is
documented as a deliberate simplification.

`legalMoves(bd, color, castle, ep)` filters pseudo-legal moves by
applying each on a copy and rejecting any that leave the mover's king
attacked (`attackScan` from the king's square with the king included as
an attacker of adjacent squares). This handles pins, checks, and the
tricky en-passant-through-a-pin case correctly, because the whole
resulting board is inspected.

`attackScan(bd, x, y, by, includeKing)` returns the value of the
cheapest piece of color `by` attacking square `(x,y)`, or `Infinity`
when the square is not attacked. It scans pawn diagonals, knight jumps,
and the eight sliding rays. With `includeKing=true` the king counts
(check detection); with `includeKing=false` it does not (used for the
"pieces in danger" analysis, where a king "attacking" a defended square
is not a real threat). One function serves both check detection and
hanging-piece analysis.

### Game state and end detection

`applyMove(m, color)` pushes a full snapshot (board, turn, castle
rights, en-passant square, halfmove clock, last move) onto `history`,
then updates all derived state: castle rights (king or rook moves, and
rook captures on corner squares), the en-passant target (double pawn
pushes), the halfmove clock (reset by pawn moves and captures), the
repetition table, and the capture list. It then checks the side to move
now:

- no legal moves + in check → **checkmate** (game over, winner named)
- no legal moves, no check → **stalemate** (draw)
- halfmove clock ≥ 100 → **fifty-move rule** (draw)
- insufficient material (no pawns/rooks/queens and at most one minor
  piece total) → draw
- position occurred three times (board + turn + castle rights + ep,
  counted in `repMap`) → **threefold repetition** (draw)

Draw adjudication is deliberately standard-FIDE-simple. KB vs KB with
same-color bishops is not auto-drawn (it plays on); that matches most
casual implementations.

### Undo

`undo()` scans `history` backwards for the most recent snapshot where
Black was to move, releases the repetition counts of the popped
positions, restores the snapshot, and bumps `moveSeq`. Because `moveSeq`
is captured by any pending Jev decision, a late-arriving Jev answer
after an undo is discarded instead of being played on the wrong
position. Undo takes back a full move pair (White's move and Black's
move), returning to the human's turn — in chess, undoing only White's
move would leave the human with nothing to take back.

## Jev integration

On each White turn, `whiteMove()` computes the legal moves and hands
them to `Jev.chooseMove`:

1. `filterMoves` reduces >30 legal moves to 30 candidates (captures,
   checks, moves of attacked pieces, center bias, slight randomness).
2. `buildState` writes the state text: board diagram, captured
   material, last moves, material balance with advice, check status,
   pieces in danger (own pieces attacked-and-undefended or attacked by
   cheaper pieces; opponent pieces that can be captured for free), and
   instructions ordering the priorities (mate, escape check, win
   material, rescue attacked pieces, develop).
3. `describeMove` annotates every candidate with its tactical effects,
   computed by simulating the opponent's legal replies — pure
   JavaScript, no extra Jev calls. The annotations, in priority order:
   a quantified 3-ply exchange verdict (my capture, their most
   damaging recapture, my re-recapture → WINS MATERIAL / even trade /
   BAD MOVE — loses N points), defender abandonment (moves that leave
   an own piece newly hanging), repetition warnings (a third occurrence
   of a position draws), check/checkmate/stalemate flags, rescue of an
   attacked piece, development and castling notes, passive-shuffle
   flags, and — in kingHuntMode (opponent nearly bare and we are
   ahead) — king-squeeze progress toward mate.
4. A single `Choice` question is POSTed; the answer's probability
   distribution is argmaxed over the legal labels. Illegal labels and
   the text choice are ignored; if the argmax yields no legal move, or
   the request fails, White retries up to 3 times.

`Jev.ready()` gates the first move of the game: because White opens in
chess, the opening move must wait until `/jevstatus` has resolved (on
localhost) so the game knows whether a server key exists before
choosing between Jev and the heuristic.

### Mistral chat backend (opt-in, Le Chonk)

When the server is started with `MISTRAL_MODEL` set (for example
`mistral-large-4`, the Mistral Large 4 "Le Chonk" preview) plus
`MISTRAL_API_KEY`, it takes precedence over Jev: `POST /jev` is
answered by the server itself instead of the TypeSafe proxy. The
adapter, mirroring the Go repo's, converts the single `Choice` question
into one `api.mistral.ai/v1/chat/completions` request with structured
outputs — a strict JSON schema with one required string constrained to
the legal move labels — and reshapes the parsed reply into the decision
response. Because chess's move annotations are load-bearing (they carry
the entire coaching: exchange verdicts, BAD MOVE flags, repetition
warnings), the adapter includes every option's description in the
prompt, not just the labels. The reply's choice is returned with
synthetic peaked probabilities (0.5 for the pick, the rest shared) and
a fixed 0.9 confidence, so the browser's argmax plays the model's pick
deterministically. Upstream status codes are forwarded, the browser uses
a 120-second timeout for this backend, and a browser key does not
override it. This is a chat-adapter policy: it is metered, and its
results are not comparable with the Jev measurements above.

Because Le Chonk is a hybrid reasoning model, its reply carries a
reasoning trace; the adapter extracts the `thinking` content parts
(`mistralThinkingText`) and passes them through as
`answers.move.thinking`. The browser displays the latest trace in the
Le Chonk thinking panel after each of its moves, alongside a Le Chonk
banner using the Mistral Large 4 release art (`le-chonk.webp`) and the
release's dark-blue/orange palette; both are shown only while the
Mistral backend is active.

### Local heuristic

`heuristicPick(moves, color)` scores each legal move: capture value
×100, minus the opponent's best capture in reply ×80 (a 1-ply
don't-hang-material lookahead), +30 for check, ±100000 for
checkmate/stalemate, a mild center bias, and random tie-breaking. It
cannot pass (there is no pass in chess); with no good moves it still
plays the least-bad one. Three heuristic-vs-heuristic headless games
all ended in checkmate within 72 plies.

## Rendering and input

The canvas draws the 8x8 board, the last move's squares (gold tint),
kings in check (red tint), the selected piece (green tint), dotted
legal targets, and pieces as Unicode chess glyphs (the solid set for
both colors, white pieces filled light with a dark outline). Input is
two-click: select a Black piece, then click a dotted target. The DOM is
a write-only output surface — all game state lives in plain variables,
which is what makes headless testing possible.
