# universal: converted
plate GLSL lines: 187   positive lines: 359
gaps: none blocking. Two constructs were wanted and lacked, and both
      belong to the windowed-sheet family rather than to this plate.
      (1) `s.window` computes the loupe as an integer lattice and hands
      back only `seat()`; the walk cannot read `win` or `wc`
      (core/emit.mjs emitMember returns a `windowmethod` and emitCall
      answers `seat` alone, so `const lo = w.win;` refuses with "cannot
      bind lo: unhandled value", and `w.win[0]` does not even lex - the
      grammar has no index expression). universal needs `win.x/y/z/w`
      to weigh its columns by visible area and to bound the row and
      cell draws. (2) There is no float to int conversion at all:
      `Math.trunc` is in the subset only as `trunc(int / int)`, and the
      only int-producing draws, `s.pick` and `s.depth`, take a literal
      or a lever and not a runtime bound. So the plate's own
      `tl = rlo + int(u2f(pt) * float(rhi - rlo + 1))` cannot be an
      int, which means `seat()` could not have been fed even if `win`
      were readable. The two together are why the sheet lattice is in
      floats here, exactly as LXVIII rulespace already writes it. It is
      measured rather than assumed, below.
notes: THE ROW IS BITS AND ORBIT FIELDS ARE FLOATS, and this plate has
       the largest ring in the family. The shader keeps 448 cells in
       fourteen uint words and steps thirty-two at a time with
       `(cw << 1) | (lw >> 31)`, `(cw >> 1) | (rw << 31)` and
       `(cw | R) & ~(L & cw & R)`. The vocabulary has no bitwise
       operator anywhere, so the ring rides as THIRTY-TWO FOURTEEN-BIT
       WORDS, the collatz idiom, and the word is the ether tile itself:
       448 = 14 * 32, so the pure vacuum is 0x3b23 in every one of the
       thirty-two and the seed row is one constant instead of the
       shader's fourteen. The law becomes a polynomial on bits,
       (c + r - cr)(1 - lcr), which is `(c or r) and not (l and c and
       r)` and nothing else.

       EXACTNESS, MEASURED. Instrumented over 33 rows at six settings
       of DEPTH, WORLD and DEFECTS, the largest intermediate anywhere
       in the toll is 131,056: a tile is under 16384, the
       neighbourhood window that spans three tiles is under 65536, and
       the doubling that shifts it reaches 2 * 65528. That is under
       2^17 and 128 times under f32's 2^24, so every value is an exact
       integer on both backends with eight bits to spare. The same 33
       rows were converted back to the shader's fourteen uint words and
       compared word for word against a literal uint32 transliteration
       of the plate: zero mismatches, at t = 0, 1, 2, 3, 5, 11, 29,
       113, 447, 448 and rowsT-1, with 0, 1, 6, 24 and 48 defects.

       THE RING IS WALKED RATHER THAN INDEXED. rulespace selects its
       word out of eight with a ternary chain, three chains per word
       for the word and its two neighbours. At thirty-two words that is
       ninety-six selects per word per row, 3072 per row, and the row
       is stepped up to 32767 times. A ring does not need indexing: the
       inner orbit rotates the register one tile per step, the new tile
       enters at the tail, and after thirty-two steps it is back in
       alignment holding the next row. `prev` carries the tile just
       consumed and `first` the old tile zero, which the last step
       needs after its seat in the register has been overwritten - the
       standard in-place cyclic update. Measured against the chain
       form: 8.4 us per row step against roughly 25, which is the
       difference between a smoke run of three and a half minutes and
       one of ten. Indexing is still used where it is cheap and happens
       once, for the two tiles the phrase spans.

       THE TOLL IS THE PLATE AND IT IS NOT CHEAP. Rule 110 is
       irreducible and the shader pays full fare; the positive pays
       thirty-two times that fare, because it spends one arithmetic
       cell where the shader spends one thirty-two-cell word op. The
       emitted loop is `for (ok_105 < 32768) { if (n >= tabs) break; }`
       around 32 tiles around 14 cells - the emitter's static bound
       where the plate writes `for (it = 0; it < t; it++)`. At DEPTH 15
       that is up to 14.7 million innermost iterations per vertex
       against the shader's 459 thousand. Nothing in the vocabulary can
       narrow it: the only thing that would is a bitwise operator, and
       the whole point of the subset is that it has none. The lead
       should expect this plate to be slow to bench and should not read
       slowness as a defect. The CPU evaluator costs about 8.4 us per
       row step, so smoke takes three and a half minutes rather than
       the usual seconds.

       THE SHEET LATTICE IS IN FLOATS, AND HERE IS WHAT THAT COSTS.
       The plate holds its loupe in ivec2/ivec4 throughout. With
       `s.window` unreadable and no float to int conversion, the
       positive holds it in floats: `Math.pow(2.0, P.magnify)` for
       exp2, `Math.floor` for the truncations toward zero (every value
       truncated is non-negative, so floor is trunc), and the seat as
       `(cellx - wcx + fox * 1024.0 * 0.94) * km`. Enumerated over the
       WHOLE lever grid - DEPTH 7..15, MAGNIFY 0..14 by 0.25, COLUMNS
       1..16, 8208 settings, with f32 rounding applied at every
       operation the GPU would round - the float window differs from
       the plate's integer window in 15 of 16416 `wc` components,
       always by exactly one lattice unit, and all 15 are at DEPTH 15
       with COLUMNS 1, the one place where HU = 33,554,432 exceeds
       f32's exact-integer range and an odd `wc.y` cannot be held. The
       decisions the window actually makes - the visible ROW range and
       the visible CELL range - are IDENTICAL at all 8208 settings, so
       no cell the plate can light is gained or lost anywhere on the
       grid. What one lattice unit moves is the seat, by 1/1024 of a
       cell. If the sheet family is to be exact rather than merely
       indistinguishable, the fix is not in this file: it is `win` on
       the window and an int-producing draw with a runtime bound.

       THE DEFECTS ARE ADDRESSED, NOT DRAWN, and this is the one thing
       in the file that is not verbatim. The shader folds
       `da = hashu(da)` from `hashu(world ^ 0xD3F3)`, so the defect set
       is a function of WORLD alone and every point that visits this
       sheet must find the same one. A stream draw would give each
       point its own vacuum and there would be no automaton at all,
       only a fog. `s.vnoise(d, WORLD, 110)` at whole lattice
       coordinates is the field: the interpolation weights vanish and
       what comes back is the corner hash itself, keyed by the defect's
       index and the world and by nothing else. Index under 48 and
       world under 65, both far inside the lattice's period of 1024, so
       no two defects of any two worlds collide. Values differ from the
       shader's chain; the law, DEFECTS cells uniform on the ring
       flipped by exclusive or (so two defects on one cell still
       cancel, as `row[w] ^= pb` does), does not. Same substitution the
       tangle catalogue, the drainage basin and the rulespace seed row
       make, for the same reason.

       POWERS OF TWO COME FROM DOUBLING, NEVER FROM pow. rowsT is
       `s.orbit(P.depth, {n: 1}, v => ({n: v.n * 2}))`, the bit place of
       a defect and the phrase shift are the same construct bounded by
       `until`. det_pow is det_exp2(y * det_log2(x)) and is not exact at
       integer arguments, and every one of these decides an integer.
       The single exception is MAGNIFY, where `Math.pow(2.0,
       P.magnify)` is what the plate's `exp2(P[1])` wants:
       det_log2(2.0) returns exactly 1.0 (e = 1, m = 1, the series term
       is 0, fma(0, LOG2E, 1.0)), so det_pow(2.0, x) IS det_exp2(x),
       character for character with what `s.window` would have emitted.

       THE PHRASE, AND ONE READING THE PLATE MAKES TWICE. The
       surrounding phrase is fourteen cells from x-6, and tiles are the
       ether's own fourteen, so it spans exactly two of them and the
       shift is a power of two. The drawn cell is bit six of that
       phrase, which is the same bit the shader reads separately out of
       its word before building the phrase at all; reading it once is
       the same bit, not a different one. The fourteen rotations of
       0x3b23 are all distinct (the tile is aperiodic: bits 0..6 are 35
       and bits 7..13 are 118), so the plate's break-less loop that
       keeps the LAST match keeps the only match.

       DRAW ORDER, unchanged from the shader: the column pick, the row,
       the cell, then - only after the dark cell, the fabric and the
       domain declines have had their chance - the two seat offsets and
       the z jitter. `rnd.y` becomes `s.centered()`, value differs, law
       does not. Four declines, matching the shader's four far
       sentinels: empty row range, empty column weight, empty cell
       range, and a dark cell; plus the two the fabric and domain
       levers make when turned to zero. About 43% of points decline at
       defaults, which is the ether's own density read back: the tile
       has 8 of 14 bits set, 57.1%, and the deposit rate is 56.9%.
       The three channels at defaults over 4000 points: particle
       12.1%, fabric 11.2%, domain 34.1%.

       CROSS-CHECK (scratchpad, this session). 67-universal.js
       transcribed literally into f64 JS - uint words as Uint32Array,
       GLSL integer division as trunc toward zero - the walk driven by
       a draw-recording stream, the transcription replayed on the same
       tape. The transcription takes the walk's own defect oracle so
       the comparison covers everything EXCEPT the substitution and
       isolates it rather than hiding it. Five settings (defaults, both
       hashed lever sets, DEPTH 12 / COLUMNS 4 / MAGNIFY 3 / DEFECTS 24
       / WORLD 41, and DEPTH 7 / COLUMNS 16 / DEFECTS 0 / WORLD 64),
       300 points each, 680 deposits, 4080 field comparisons: worst
       relative delta 0.000e+0, every field bit-equal, and zero shape
       disagreements (never one declining where the other deposits).
       Exact rather than wave one's 1e-16 because the walk and the
       transcription do the same f64 operations in the same
       association.

       NEGATIVE CONTROLS, three, all fired: the seat jitter 0.94 to
       0.9401 (worst rel 4.5e-4), the ether tile 0x3b23 to 0x3b22
       (4.7e+0 - it moves the whole particle/domain classification),
       and the domain hue 0.55 to 0.5501 (5.4e-4). The tile control
       matters most: it is the one that shows the comparator is
       actually reading the phrase and the toll that produced it, and
       not just the seat.

       LAWFULLY EMPTY AT HASHED LEVERS B, and checked rather than
       waved through. MAGNIFY 11.5 with COLUMNS 1 leaves a window of
       rows 447..448 by cells 223..224, four cells, and all four are
       dark. Smoke calls this a WARN because the plate has a MAGNIFY
       lever. It is the plate's own behaviour, not the substitution's:
       the literal transcription run with the PLATE'S OWN hashu chain
       deposits 0 of 3000 there too.

       NOT VOLUMETRIC. The sheet is flat, z is the jitter alone at
       +-0.01, and points lie on a lattice rather than through a
       volume, so the qjulia/bulb shot-noise argument does not apply
       and the usual point budget is the right one.

       Levers, cam, gain and accent diffed programmatically against
       67-universal.js: eight levers, labels, min, max, step and def
       all match, cam {3.0, 0.22, 0.0, 0.0}, gain 0.55, accent
       #e09a6f. The emitted GLSL has exactly ten loops, as the plate
       does, nested three deep at the toll (32768, then 32, then 14).

       Gates:
         node tools/smoke-pos.mjs positives/universal.pos.mjs
           PASS  emits   553 GLSL lines
           PASS  defaults   11387/20000 deposit (8613 decline), 0
                 malformed, 0 far-out, x [-1.30, 1.30] y [-1.48,
                 1.49], mean lum 0.256
           PASS  defaults t=1.7   11387/20000 deposit (8613 decline),
                 0 malformed, 0 far-out, x [-1.30, 1.30] y [-1.48,
                 1.49], mean lum 0.256
           PASS  hashed levers A   11373/20000 deposit (8627 decline),
                 0 malformed, 0 far-out, x [-1.30, 1.30] y [-0.01,
                 0.01], mean lum 0.174
           WARN  hashed levers B   all points declined (window likely
                 over-magnified past the lattice; lawful)
           smoke passes
         node tools/verify-pinned.mjs universal
           positives: 1
             fully pinned : 1
             refused      : 0
             emitted but still carrying an unpinned op: 0
       The whole corpus reads 66 of 66 fully pinned, 0 refused, with
       this plate in it.
