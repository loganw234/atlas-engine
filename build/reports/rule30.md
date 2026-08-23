# rule30: converted
plate GLSL lines: 177   positive lines: 355
gaps: none blocking. Two were wanted and lacked, and both belong to the
      windowed-sheet family rather than to this plate; LXVII universal
      and LXVIII rulespace name the same two this session, independently,
      and the three files answer them the same way.
      (1) `s.window` builds the loupe as an integer lattice and hands
      back only `seat()`. Probed: `const lo = w.win;` refuses with
      "cannot bind lo: unhandled value", `w.win.x` with "cannot take .x
      here", and the grammar has no index expression at all. This plate
      reads `win.x/y/z/w` in five places, to weigh the columns by
      visible area and to bound the row and cell draws.
      (2) There is no float to int conversion in the subset, so even a
      readable `win` could not have fed `seat()`, whose lattice
      arguments must be int. And CELLS could not have built the span
      in any case: `s.window({span: [P.cells, ...]})` refuses with "an
      integer is required here", and reaching it through a loop bound
      refuses with "lever cells used where an integer is required, but
      it is not an integer lever" - the emitter mints an int lever only
      where step is 1, and CELLS steps by 32.
      The consequence is that the sheet lattice is in floats here. What
      that costs is enumerated over the whole lever grid below rather
      than asserted.
notes: THE CARRIED STATE IS A ROW OF BITS AND ORBIT FIELDS ARE FLOATS.
       The shader keeps up to 512 cells in sixteen uint words and steps
       thirty-two at a time with `(cw << 1) | (lw >> 31)`,
       `(cw >> 1) | (rw << 31)` and `L ^ (cw | R)`. The subset has no
       bitwise operator anywhere, so the ring rides as THIRTY-TWO
       SIXTEEN-BIT CHUNKS, the collatz idiom. Sixteen and not
       twenty-four: the chunk width has to divide 32 for the live count
       C/16 to be exact at every CELLS setting, and 32 itself does not
       fit in a float's exact integers.

       EXACTNESS, MEASURED RATHER THAN ASSUMED. A chunk is under 65536
       and the eighteen-bit window one step reads is
       `floor(prev/32768) + 2*chunk + 131072*bit`, at most
       1 + 131070 + 131072 = 262,143. That is 64 times under f32's
       2^24. The cross-check carried a guard that threw if the window
       ever left [0, 262145] or stopped being an integer, over 312,000
       word comparisons and a 4000-row toll, and it never fired; the
       largest packed value ever seen was 65,535.

       THE RULE IS ARITHMETIC, NOT BIT OPERATIONS. With l, c and r as
       zero or one, `c OR r` is the saturation `min(floor(g/2), 1)` read
       straight off the sliding window, since floor(g/2) is c + 2r and
       is zero exactly when both are, and `l XOR that` is l + o - 2lo.
       Sixteen of those build the new chunk from its top cell down, so
       the accumulation is `acc = 2 acc + bit`, an orbit and not a sum:
       a sum would need a power of two per term and det_pow names no
       power exactly.

       THE RING TURNS UNDER A FIXED HEAD. The shader wires each word's
       neighbours statically and pays a runtime select only at the
       ring's two ends. A positive cannot index a named field at all,
       so instead the register rotates one chunk per step, the new
       chunk enters at the tail, and after C/16 steps it is back in
       alignment holding the next row. `prev` carries the chunk just
       consumed and `first` the old chunk zero, which the last step
       needs after its seat in the register has been overwritten. Those
       two fields are the shader's two runtime selects, spelled
       differently. universal reached the same shape independently and
       measured the alternative: a ternary chain per neighbour per word
       is about three times slower.

       AND THE INSTRUMENT EARNED ITS KEEP HERE. The first version
       started `prev` at chunk zero rather than at the last live chunk,
       which is the ring's left end. Every row after the first was then
       wrong in cell 0 alone, by one bit, which no smoke gate would
       ever see: the deposit rate, the bounds and the luminance are all
       unchanged by one cell in 512. The word-for-word comparison
       against the uint32 transcription found it at row 1.

       THE TOLL IS THE PLATE AND IT IS NOT CHEAP. Rule 30 is
       computationally irreducible and the shader pays full fare; the
       positive pays 32 times that fare, one arithmetic cell where the
       shader spends one thirty-two-cell word op. Nothing in the
       vocabulary narrows it, and the only thing that would is a
       bitwise operator, which the subset exists to not have. The CPU
       evaluator costs about 13 us per row of 512 cells, so smoke takes
       2m58s rather than the usual seconds; that is the plate, not a
       defect. The lead should expect this plate to be slow to bench
       and should not read slowness as a defect.
       ONE THING FOR THE LEAD TO WATCH AT COMPILE TIME. The emitted
       toll is `for (ok_104 = 0; ok_104 < 131072; ok_104++)` with the
       break inside, because the emitter's static bound must be a
       literal or a lever max and rowsT reaches 2^17, where the plate
       writes `for (it = 0; it < t; it++)` with a runtime bound. Any
       driver that decided to unroll that constant bound would produce
       an enormous shader. If one does, the remedy needs no new
       vocabulary: split the toll into two nested orbits of 512 and 256
       with the same `until` on both, which caps any unrolling at 512
       and leaves the arithmetic untouched. universal already carries a
       32768 bound of the same species and compiles. Register pressure
       is the other thing to watch: the emitted text declares 326 float
       locals, most of them the register carried three times over, as
       the row state, as the turning state, and as the turn's temporary
       writeback.

       THE SHEET LATTICE IS IN FLOATS, AND HERE IS WHAT THAT COSTS.
       `Math.pow(2.0, P.magnify)` for exp2, `Math.floor` for the
       truncations (every truncated value is non-negative, and
       heart >= ctr in both components for every V, so floor is trunc),
       and the seat written out as
       `(xbase + x*1024 - wcx + fox*1024*0.94) * km`. Enumerated over
       DEPTH 7..17, COLUMNS 1..16, MAGNIFY 0..14 by 0.25 and CELLS
       128/256/512, which is 30,096 settings, with f32 rounding applied
       at every operation the GPU would round: the decisions the window
       actually makes, the visible ROW range and the visible CELL
       range, are IDENTICAL to the plate's integer window at ALL 30,096
       settings. No cell the plate can light is gained or lost anywhere
       on the grid. The window bounds themselves differ by at most 8
       lattice units, which is 8/1024 of a cell and never crosses a
       cell edge. The residue is CPU against GPU rather than positive
       against plate: evaluated natively at f64 the same expressions
       pick a different row range at 3 of the 30,096 settings, all
       three DEPTH 17 with COLUMNS 7 and MAGNIFY 2.5, and the
       difference is one row at the low edge of a 3311-row window.

       THE TWO PLACES WHERE A FLOAT IS NOT AN INT, named so the next
       reader does not have to find them.
         HU = rpp * 1024 reaches 2^27 at DEPTH 17 with COLUMNS 1, and
         6.3% of the lever grid has HU above f32's exact integers. Odd
         lattice values there cannot be held. The plate holds them in
         int.
         The visible-area weight is (cells across) times (rows down)
         and reaches 2^26 at DEPTH 17. Above 2^24 the running total is
         no longer exact, which can only move a column boundary by a
         few parts in 3e7. It needs rows-visible above 32768, so it can
         only arise at DEPTH 17 with COLUMNS 3 or fewer and at DEPTH 16
         with COLUMNS 1, and at COLUMNS 1 there is one column and the
         pick cannot go anywhere else.
       If the sheet family is to be exact rather than indistinguishable,
       the fix is not in this file: it is `win` on the window and an
       int-producing draw with a runtime bound.

       POWERS OF TWO COME FROM DOUBLING, NEVER FROM pow. rowsT is
       `s.orbit(P.depth, {v: 1.0}, a => ({v: a.v * 2.0}))`, and the bit
       place of a cell inside its chunk is the same construct bounded
       by `until`. Every one of those decides an integer, and
       det_pow is det_exp2(y * det_log2(x)), which is not exact at
       integer arguments in general. MAGNIFY is the one exception and
       it is exact: det_log2(2.0) returns exactly 1.0 (e = 1, m = 1, so
       the series term is 0 and the result is fma(0, LOG2E, 1.0)), so
       `Math.pow(2.0, P.magnify)` emits arithmetic identical to the
       `det_exp2(P[1])` that `s.window` would have written.

       THE SEED ROW IS ADDRESSED, NOT DRAWN, and this is the one thing
       in the file that is not verbatim. The shader folds
       `sa = hashu(sa)` from `hashu(world ^ 0x51ED)`, so the row is a
       function of WORLD and SEEDS alone and every point that walks to
       row t must rebuild the identical row t. A stream draw would give
       each point its own history and there would be no automaton at
       all. `s.vnoise(k + 1.0, P.world, 0x51ED)` at whole lattice
       coordinates is the field: the interpolation weights vanish and
       what comes back is the corner hash itself, keyed by the seed's
       index and the world and nothing else. Index under 49 and world
       under 65, both far inside the lattice's period of 1024, so no
       two seeds of any two worlds collide. AT SEEDS 1, WHERE THE
       EDITIONS SIT, THE TWO ROWS ARE THE SAME OBJECT: the shader's
       first seed is `C >> 1` with no hash at all, so the picture is
       identical and not merely statistically identical. Measured, the
       shader's chain against the walk's addresses over WORLD 1..64 by
       CELLS 128, 256 and 512: at SEEDS 1 the two rows agree at 192 of
       192, and at SEEDS 2, 3 and 48 at 0 of 192, so the substitution
       is exactly where it is claimed to be and nowhere else. The law
       is unchanged above 1: asking for 31 seeds over 64 worlds sets
       1940 cells under the shader's chain and 1935 under the walk's,
       the shortfall in both being seeds that collide on one cell.
       Same substitution nodal, tangle, drainage, rulespace and
       universal make, for the same reason.

       THE WEIGHTS ARE SAID TWICE. The shader keeps its sixteen column
       weights in `int wsum[16]` and reads them back in the second
       pass. The vocabulary has no array, so the weight expression is
       written out in both orbits, once to total and once to select.
       It is pure, so saying it twice is a cost and not a hazard.

       THE HEAD VISITS THE CELL AND ITS TWO SHOULDERS. Reading a cell
       out of a named register needs a thirty-two way ternary chain,
       and the shader reads three cells. Rather than write the chain
       three times, a three-step orbit rotates the three indices past
       one fixed read, so the chain and the bit-place orbit appear once
       each. The bits come out newest first, which is why the cell
       itself lands in b2 and its shoulders in b1 and b0.

       DRAW ORDER, unchanged from the shader: the column pick, the row,
       the cell, then, only after the cone cull and the dark cell have
       had their chance, the two seat offsets. `rnd.y` becomes
       `s.centered()` at the end, value differs and law does not. Five
       declines, matching the shader's five far sentinels exactly:
       empty row range, empty column weight, empty cell range, the
       vacuum outside the light cone, and a dark cell. The emitted GLSL
       has ten loops, as the plate has ten, nested three deep at the
       toll: 131072, then 32, then 16.

       CROSS-CHECK (scratchpad, this session), in two instruments.
       THE AUTOMATON. The shader's register, lines 126 to 166, was
       transcribed literally into uint32 JS and the float-packed
       register compared to it word for word: all thirteen CELLS widths
       (128 through 512 by 32), SEEDS 1, 3, 31 and 48, WORLD 1, 45 and
       64, 200 rows each, which is 312,000 word comparisons, every one
       exact, seed row included; then a single 4000-row toll on the
       512-cell ring, also exact. The negative control replaced
       `L ^ (cw | R)` with `L ^ (cw & R)` in the transcription and the
       comparator fired at row 1, word 7.
       THE WHOLE SHAPE FUNCTION. 65-rule30.js transcribed literally
       into f64 JS, integer division as trunc toward zero, the walk
       driven by a draw-recording stream and the transcription replayed
       on the same tape. The transcription takes the walk's own seed
       row so the comparison covers everything except the one
       substitution and isolates it rather than hiding it. Five
       settings (defaults; SEEDS 3; COLUMNS 6 with MAGNIFY 11.5, SEEDS
       31 and WORLD 45; CELLS 192 with DEPTH 10 and COLUMNS 3; CELLS
       320 with DEPTH 7, SEEDS 12, MAGNIFY 2.5 and COLUMNS 2), 1200
       points each, and four corner settings at 600 points each (the
       narrowest ring at the deepest toll, CELLS 128 with DEPTH 17,
       COLUMNS 16 and SEEDS 48; CELLS 128 under MAGNIFY 6; CELLS 160
       with SEEDS 2 and STAIN 1, the first setting at which the seed
       row holds more than one cell; and CELLS 512 with COLUMNS 16 at
       DEPTH 7, where every column is a stub of eight rows). Nine
       settings,
       3245 deposits, 16,225 field comparisons, worst relative delta
       0.00e+0, every field bit-equal, 5155 declines agreed and ZERO
       shape disagreements, never one declining where the other
       deposits. Exact rather than wave one's 1e-16 because the
       geometry here is integer and the two do the same f64 operations
       in the same association.
       NEGATIVE CONTROLS, three, all fired: the seat jitter 0.94 to
       0.93 (worst relative 3.3e+2), the tone slope 0.45 to 0.44
       (1.0e-2), and the hue base 0.12 to 0.11 (4.4e+1).

       NOT VOLUMETRIC. The sheet is flat, z is the jitter alone at
       +-0.01, and the points lie on a lattice rather than through a
       volume, so the qjulia and bulb shot-noise argument does not
       apply and the usual point budget is the right one.

       Levers, cam, gain and accent diffed programmatically against
       65-rule30.js: eight levers, labels, min, max, step and def all
       match in order; cam {3.0, 0.22, 0.0, 0.0}, gain 0.55, accent
       #e8c84a.

       Gates:
         node tools/smoke-pos.mjs positives/rule30.pos.mjs
           PASS  emits   541 GLSL lines
           PASS  defaults   4916/20000 deposit (15084 decline), 0
                 malformed, 0 far-out, x [-1.28, 1.26] y [-0.65, 0.63],
                 mean lum 0.159
           PASS  defaults t=1.7   4916/20000 deposit (15084 decline), 0
                 malformed, 0 far-out, x [-1.28, 1.26] y [-0.65, 0.63],
                 mean lum 0.159
           PASS  hashed levers A   7368/20000 deposit (12632 decline), 0
                 malformed, 0 far-out, x [-1.30, 1.30] y [-0.65, 0.64],
                 mean lum 0.139
           PASS  hashed levers B   6711/20000 deposit (13289 decline), 0
                 malformed, 0 far-out, x [1.09, 3.31] y [-0.76, 1.46],
                 mean lum 0.108
           smoke passes
         node tools/verify-pinned.mjs rule30
           positives: 1
             fully pinned : 1
             refused      : 0
             emitted but still carrying an unpinned op: 0
           and no KNOWN GAP section: under pin the palette emits as
           det_pal, so this plate reaches no unpinned shared-header body.
       The clock is unused, as the shader uses no uT, so t = 1.7 is the
       same picture as t = 0 by construction rather than by accident.
