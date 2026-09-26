# TODO

## Done — the road to beginner level

- [x] Full rules engine: legal move generation with castling, en
      passant, auto-queen promotion, check/checkmate/stalemate,
      fifty-move rule, threefold repetition, insufficient material
- [x] Perft validation against standard positions (start, Kiwipete,
      position 3) — all exact matches
- [x] Jev integration on the Go/Fight pattern: state text, move
      filtering to 30 candidates, argmax pick, 3 retries, no-key
      heuristic fallback
- [x] Baseline measured (0-2-0: instant repetition draws, queen hung
      to the king)
- [x] Iteration 1: repetition awareness (per-move third-occurrence
      warnings, position count and move history in state text) +
      quantified 3-ply exchange verdicts (1-0-2)
- [x] Iteration 2: BAD MOVE prefixes with a hard "never choose these"
      instruction, defender-abandonment detection, anti-shuffle
      annotations (5-2-0 over two batches)
- [x] Iteration 3: endgame mating technique coaching — kingHuntMode
      state text (box the king, use your own king, fifty-move clock)
      and king-squeeze annotations (4-0-0, all by checkmate)
- [x] Docs report the measured plays (README summary, DESIGN game
      detail)
- [x] Everything pushed to github.com/dagfinndybvig/Chess
- [x] Fresh confirmation run (8 games, 6.5/8) after the git cleanup —
      level holds; one stalemate-in-a-winning-position weakness noted
- [x] Iteration 4: stalemate avoidance — BAD MOVE annotation + hard
      constraint that filters stalemating moves when ahead (12 games,
      7.5/12, no stalemate)

Jev now plays at least beginner chess against the local heuristic:
takes free material, keeps pieces defended, develops, castles, and
converts winning endgames into checkmates (9.5/11 across iterations
2-3; 6.5/8 on the fresh re-measure; 7.5/12 with no stalemate after
iteration 4).

## Next steps

- [ ] Conversion: Jev drew by repetition while up 10-6 (batch 2, game
      1) — coach it to keep making progress instead of shuffling when
      ahead
- [ ] Blunder avoidance: 3 of 12 games were lost to tactical blunders
      (a mate in 26 plies while up 33-32, one in 18 plies while down
      35-38, one in 122 plies while down 0-9) — add two-move tactic
      warnings (opponent's reply that creates a NEW hanging piece)
- [ ] Measure against a stronger baseline: give the local heuristic a
      2-ply search or material+mobility evaluation, and see where Jev's
      beginner level actually caps out
- [ ] Play a human beginner and report honestly
- [ ] If more strength is wanted, candidate levers: pinned-piece
      annotations, king-safety summary (attackers near the king, open
      files) in the state text
- [ ] GitHub Pages deployment check (repo pushed; verify
      dagfinndybvig.github.io/Chess serves and falls back to the local
      AI for White)
- [ ] Optional: under-promotion support (currently auto-queen) —
      note that perft reference numbers in AGENTS.md assume
      auto-queen if this changes
