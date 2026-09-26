# TODO

## Next steps

- [ ] Measure Jev vs the local heuristic in headless autoplay (a few
      games): results, material difference, average confidence, and
      whether the 1-ply lookahead changes Jev's play pattern (the Go
      repo's measurements are the honest prior — expect Jev to lose on
      material)
- [ ] Publish to GitHub Pages (needs the repo pushed with index.html)
- [ ] Consider, once measurements exist:
      - Reporting the opponent's best *checking* reply per move, so Jev
        avoids moves that walk into perpetual check pressure
      - A "king safety" summary in the state text (castled? open files?
        attacker count near the king) so Jev stops wandering king moves
      - Connection/coordination hints ("this move connects your rooks")
      analogous to the Go repo's "connects two groups" idea

## Done

- [x] Full rules engine: legal move generation with castling, en
      passant, auto-queen promotion, check/checkmate/stalemate,
      fifty-move rule, threefold repetition, insufficient material
- [x] Perft validation against standard positions (start, Kiwipete,
      position 3) — all exact matches
- [x] Jev integration on the Go/Fight pattern: state text, move
      filtering to 30 candidates, 1-ply lookahead annotations,
      argmax pick, 3 retries, no-key heuristic fallback
- [x] Local greedy heuristic (captures, opponent-reply penalty,
      center bias) driving Black in autoplay and White without a key
- [x] Autoplay mode with ~700ms cadence and automatic new game
- [x] Undo (full move pair) with pending-Jev invalidation via moveSeq
- [x] Jev.ready() gating so the opening move waits for /jevstatus
- [x] server.js proxy on port 3001 (3000 is the Go repo's)
- [x] Headless test suite: 40/40 passing (perft, special moves, end
      detection, undo, Jev mocked flow, heuristic game termination) —
      test script deleted after the run, per repo convention
