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

- [x] Port the `mistralContentJson` fix to the Go repo's server.js
      (committed locally in Arcade/Go; push when convenient)
- [x] GitHub Pages deployment check — dagfinndybvig.github.io/Chess
      serves the game with the Chess Harness branding and the
      le-chonk.webp asset resolves (200)
- [x] Under-promotion support — all four promotion options are
      generated (Q/R/B/N, queen first; the human's click still
      promotes to a queen), with under-promotion annotations coaching
      queen-first; perft re-validated against standard references at
      new depths (start d4 = 197281, position 3 d5 = 674624,
      position 4 d2/d3 = 264/9467)
- [x] Blunder avoidance: two-move tactic warnings — an opponent quiet
      reply that leaves a NEW hanging White piece is named as a
      tactical risk on the candidate (warning, not BAD MOVE);
      mechanically validated; a 3-game smoke batch (1.5/3) is inside
      historical variance and too small to measure an effect
- [x] Conversion coaching when ahead by 4+ — CONVERSION state line
      and repetition/shuffle escalations; mechanically validated, but
      the smoke batch still hit the 250-ply cap while up 4-1, so the
      weakness is coached, not fixed
- [ ] Run the 12-game measurement batch for the iteration-5
      annotations (node bench-jev.js 12 <outfile>) and record the
      score honestly — wins, losses, and conversion failures alike
- [ ] Conversion: deeper levers if the coaching proves insufficient —
      a per-move progress metric (king distance, mobility, advanced
      pawns) rather than wording alone
- [ ] Measure against a stronger baseline: give the local heuristic a
      2-ply search or material+mobility evaluation, and see where
      Jev's beginner level actually caps out (needs paired,
      seed-balanced games — a methodology decision before spending
      API calls)
- [ ] Play a human beginner and report honestly
- [ ] If more strength is wanted, candidate levers: pinned-piece
      annotations, king-safety summary (attackers near the king, open
      files) in the state text
