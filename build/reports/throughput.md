# throughput: converted
plate GLSL lines: 773   positive lines: 1062
gaps: one, and it is the whole of what follows. The plate addresses its
      city with `hashu` over packed uint keys and reads bitfields off
      each word. The subset has no bitwise operators, no uint type and
      no `hashu`, so every addressed hash is restated as `s.vnoise` at a
      whole lattice site. That preserves the LAW of the addressing
      exactly and the BITS not at all, which for this plate moves the
      city rather than the furniture. Measured below. Two smaller
      things were wanted and worked around rather than lacked: a
      float-to-int conversion (the lattice is carried in floats and
      floored, which is exact here) and a readable `win` on a window
      value (the loupe is transcribed instead of taken from `s.window`).

notes:

  WHAT THE PLATE IS. A survey of whole numbers with no loop anywhere.
  A tile is 4096 units, a city block is a hundred tiles, the map is
  3200 tiles, a belt slot is a quarter tile. A point draws a depth,
  picks a visible block, learns that block's district, and then takes
  one seat inside whatever furniture the district names. The whole
  file is therefore wide rather than deep: eleven district types, seven
  depth strata and five placement engines, all of it straight-line.
  Nothing here needed `sum`, `s.orbit` or `s.descend`.

  THE HASHES, AND WHAT THE SUBSTITUTION COSTS. Seventeen hash sites in
  the shader are functions of an address rather than of the point:
  the WORLD word that sizes the core, the block word that decides a
  district, the TYPE word that stamps an interior, the lake, outpost,
  ore, nest, train, solar cell, bus group, splitter, station consist
  and item slot words. Every point that lands on a block must agree
  about what that block is, so none of this is stochastic texture the
  brief lets differ in value. `s.vnoise` read at whole coordinates is
  the engine's one addressed field, and each key becomes a lattice site
  plus an octave. Octave allocation, all disjoint:

    1101 1102          core width and height, at (0, WORLD)
    1201               district mixture, at (bx + 32 by, WORLD)
    1202 1203 1204     seam rail, pavement, radar, same site
    1205 1206 1207     station platform, parked consist, landing pad
    1210               the block's own ten bit key, folded to `bkey`
    1211 1212          bus lane key and machine lane key, at (lane, bkey)
    1213 1214 1215     item slot, jam group, slot side, at (i, lanekey)
    1216 1217          splitter survival and position, at (lane, bkey)
    1302               the smelter's plate-or-copper bit, at (TYPE, WORLD)
    1306               ribbon run occupancy, at (k, 4 WORLD + salt)
    1310 1311 1312     solar cell kind and offset, at (7-lattice cell, WORLD)
    1401..1404         lake centre, radius, lobe phase
    1501 1502          outpost position, shared with the ore patch
    1503 1504          outpost ore kind and aspect
    1601..1604         wild ore centre, kind, aspect
    1701 1702          nest centre; 1703..1705 nest member and radius
    1801 1802 1803     train presence, nose position, side
    1901 1902          bus lane item class and occupancy

  Three of these have to agree with each other and do. The outpost at
  1501/1502 is read from both the ore stratum and the spur stratum, so
  a mine still stands over its own ore. The ribbon occupancy at 1306
  is read by the d=3 ribbon engine, by the d=4 resolved lane and by
  the d>=6 flow, so the surviving bus groups stay the nested set the
  shader builds by salting one word three ways. The block key at 1210
  is folded to ten bits precisely because a lane needs a third index
  and `s.vnoise` has only two coordinates: the block goes through the
  fold and the lane rides beside it, which is a two-level hash exactly
  as `hashu(uint(lx2) ^ uint(i) * 2654435761u ^ world)` is.

  THE COST, MEASURED, because this is the part a reader must not have
  to guess at. The LAW is intact: over all 64 worlds and every block of
  every core, the district mixture agrees with the shader's own hashed
  mixture to better than half a percentage point on all eleven types
  (smelt 32.08 against 32.47, assembly 14.22 against 14.09, bus 8.08
  against 7.81, hub 7.85 against 7.69, solar 7.31 against 7.35, oil
  0.41 against 0.35, and the plan-determined types to within 0.08).
  The ARRANGEMENT is not. At the default WORLD 11 the shader's core is
  20 blocks by 24 and the positive's is 18 by 27, so the city is a
  different size and every block in it sits somewhere else; across the
  64 worlds the two plans coincide once, which is what chance would
  give. Where a plan does coincide, 62.0% of blocks keep their district,
  and 38.1% of that is the deterministic skeleton (ring, the two
  stations, the bus columns, the nuclear cap, the corner office) which
  is decided by the plan and never hashed.

  SO THE PICTURE CHECK WILL SEE TWO DIFFERENT CITIES OF THE SAME KIND.
  Same bus down the middle with the same taper, same smelting west and
  assembly east, same rails on the same seams, same belt lattice, same
  item density law, same palette, and a different floor plan. A pixel
  correlation against the original is not the instrument for that and
  a low reading is not a defect in the walk. What would be a defect is
  a difference in the mixture or the taper, and those are measured
  above and in the cross-check below.

  THE CONSTRUCT THAT WOULD CLOSE IT, named precisely. Not a re-seedable
  sub-stream: the plate does not take successive draws off a chain, it
  reads BITFIELDS of one word, and three of the district tests read
  overlapping fields of the same word (`dk % 16u`, `dk & 3u`,
  `dk & 7u`, where `dk = bk >> 6`). What is needed is a uint-typed
  expression in the subset: `hashu` over an int expression, `^ & | >>
  << %` on uints, and `u2f`. The emitter already writes all of those
  into its own output for `s.vnoise` and for the descend chain, and
  `hashu`/`u2f` are already exported from `core/measure.mjs`, so the
  work is a type in `emit`'s expression walk and five tokens in its
  lexer rather than any new numerical claim. With that, this file's
  seventeen substitutions become seventeen transcriptions and the
  plate is verbatim. Recorded as the same wish `breakdown`, `drainage`,
  `tangle` and `dissipation` have each written down; this is the plate
  where it costs the most.

  Two smaller wants, worth naming while the reader is here:
    - `w.win.x` and friends. `s.window` computes exactly this plate's
      loupe, but a window value exposes only `seat`, and the plate
      reads its bounds about thirty times, because clipping the INDEX
      range of every grid stage is half of what MAGNIFY means here.
      Recovering the bounds through `seat` means dividing them back
      out, and running the loupe formula twice invites the copies to
      disagree, so the loupe is transcribed in floats and the same four
      numbers do the clipping and the seating. `det_exp2(P[1])` becomes
      `det_pow(2.0, P[1])` as a result, which is the one place the
      emitted arithmetic differs in spelling from what `s.window` would
      have written.
    - `thr_span(base, pitch, n, w0, w1)`, the plate's own helper, is a
      windowed-vocabulary primitive in everything but name: which
      absolute index range of a regular grid can the frame see. It is
      inlined seven times here. It belongs beside `s.window`.

  THE LATTICE IS CARRIED IN FLOATS AND THAT IS EXACT. Every coordinate
  the plate can name is below 13,107,200 and every intermediate below
  it, well inside the 16,777,216 where a float32 still counts by ones,
  so an integer is an integer either way. The plate's integer divisions
  become `Math.floor` of a division that `det_div` rounds correctly,
  and that cannot round up past the integer: if `n = floor(a/b)` then
  `n b <= a < 2^24`, and rounding up would need `n b > 2^24`. Truncation
  toward zero, which `int()` does and `floor` does not, is spelled out
  as `sign(x) * floor(abs(x))` at the three places the argument can be
  negative: the two window centre offsets and the two `ivec2(fo)`
  anchors in the land stratum.

  RESTRUCTURINGS FORCED BY THE DRAW DISCIPLINE, all of them shape and
  none of them mathematics. GLSL short-circuits `&&` and `?:` exactly
  as JavaScript does, so the shader's draws behind those operators are
  conditional draws, and the emitter refuses them. Six sites:
    - the three arms of d=5 are `typ == 9 && thr_u(pt) < 0.6` and its
      two successors. Each becomes `if (typ == 9) { const u = s.u();
      if (u < 0.6) {...} else { fmode = 0; } }`. The chain is
      equivalent because a failed arm falls through to tests that are
      false for that district anyway.
    - `typ == 10 && thr_u(pt) < 0.45`, the hub's chest field, the same
      shape.
    - `int g = (lane < 0) ? 0 : gs.x + int(thr_u(pt) * ...)` in the
      flow stratum, twice, where the shader spends no draw on the dead
      branch. Written as an `if (lane >= 0)` that guards the draw.
    - `tDot > 0.0 && thr_u(pt) < tDot` in the ribbon engine, where the
      shader spends the dot draw only for a ribbon that has dots and
      then spends a second draw if the dot test fails.
  The cross-check asserts the draw count matches point for point, so
  each of these is measured rather than argued: 210,000 points, zero
  disagreements.

  Three more places where the spelling moved and the value did not.
  `vec2(thr_u(pt), thr_u(pt))` is written as two named draws, since
  argument evaluation order is the one thing GLSL does not promise.
  The `d > 8` depth fold reads `hashu(pt ^ 0x9E37u) % 8u`, a bitfield
  of the point's own state that costs the shader no draw; it becomes
  one ordinary `s.u()`, which is the same uniform on 0..7 and shifts
  everything after it by one draw, which the brief's licence for
  stochastic texture covers. The PC64 lamp bitmap's `(rows >> b) & 1u`
  becomes a divide by `2^b` built from two four-way ternaries over
  exact powers of two, then `mod(x, 2.0)`; every step is exact because
  the divisor is a power of two and `rows` is below 2^15.

  THE PLATE'S OWN QUIRKS, KEPT. Three, and none of them is fixed here.
    - `lx == busL` compares a CORE-LOCAL block coordinate against an
      ABSOLUTE one (`busL = cx0 + cw/2 - 1`, while `lx = bx - cx0`).
      The bus columns therefore sit at absolute blocks `cx0 + busL`
      and one east of it, not at the middle of the core, and the
      MAGNIFY heart, which is aimed at absolute block `busL + 1`, never
      lands on a bus block at all. The consequence is visible in the
      coverage below: at MAGNIFY 9 and deeper the window holds a
      production block rather than the bus. The caption says the dive
      pans into the thick of the bus. It does not. Plates ship as they
      are.
    - `onRing` is spelled twice, once per axis, and the two spellings
      name the same set, which is `ring`. Written once here with a
      comment saying so.
    - the spur arm computes `fa0 = min(ox, cx0*FBLK)` and
      `fa1 = max(ox, (cx0+cw)*FBLK)` and then overwrites both in every
      branch of the `if (west)` that follows. Dropped as dead.

  UNREACHABLE IN THE PLATE, and so unreachable here. Three places.

  The `!coreVis` cull, which the shader spends a whole depth arm on and
  tests again inside the land stratum, never fires. `coreVis` asks
  whether the window overlaps the core at all, and the window is a box
  that shrinks toward a heart which is itself inside the core, so it
  always does. Enumerated over all 64 worlds at every quarter step of
  MAGNIFY, 3,648 combinations: zero. The arm is written out anyway,
  because the plate writes it and because a future heart outside the
  core would need it.

  The item
  silhouette has four shapes and the fourth, the disc for what pours
  and what bubbles, needs `cls == 6` or `cls == 8`. Only a bus lane can
  carry those classes, and the silhouette needs `mag > 300`, at which
  magnification the window is under eleven tiles wide and, by the
  quirk above, never contains a bus block. Swept over MAGNIFY 9, 10 and
  12 across all 64 worlds: shape 0 and shape 1 and shape 2 all appear,
  shape 3 never does. The code for it is present and agrees with the
  shader's; nothing enters it. `lay == 12`, the solar panel colour in
  `thr_lay`, is dead the same way, since the solar arm sets its colour
  directly and leaves `lay` at -1.

  GUARDS, and whether any of them binds. Every divisor in the file is
  either a nonzero constant (the tile lattice, `FIT`, the grid pitches)
  or already floored by the shader (`max(a1 - a0, 1)`, `max(ch - 4, 1)`).
  Two were added:
    - `Math.pow(Math.max(du, 1e-30), bias)` for the depth draw. `bias`
      lies in [0.20, 0.72] and is never zero, so `pow(0, bias)` is 0
      rather than NaN even unguarded, but `det_pow` reaches it through
      `det_log2`, which answers minus infinity at zero, and the floor
      keeps the multiply finite. At 1e-30 the result still floors to
      the same depth, so nothing moves.
    - every `% n` that the substitution replaces with `floor(u * n)` is
      capped at `n - 1`. `u2f` can return exactly 1.0 at the top of its
      range, where the shader's modulo cannot overflow its bound, so
      the cap restores the shader's guarantee rather than changing it.
  Sweep of all 256 lever corners at 400 points each, 102,400 points at
  a moving clock: zero non-finite fields, zero points beyond the far-out
  bound, x in [-1.295, 1.270], y in [-1.218, 1.223], colour channels in
  [0.013, 2.349]. The map is 3200 tiles at 1.9836426e-7 plate units per
  map unit, which is 2.6 across, so the extremes are the map edges
  exactly.

  DECLINES ARE THE SUBJECT, NOT AN ERROR. The shader returns the far
  sentinel whenever the chosen furniture misses the window or the
  district has nothing at that stratum, so `s.decline` is the right
  answer and the rate is high: 55% at the defaults, 72% averaged over
  the lever corners, and 100% at the deepest corners where the loupe
  has magnified past everything the map contains. At default levers the
  deposit rate falls smoothly from 1323 in 3000 at MAGNIFY 0 to 85 at
  MAGNIFY 13 and reaches zero at 13.25, which is the lawfully empty
  window smoke already knows to warn about rather than fail. Every one
  of those declines is the shader's own: the cross-check compares
  deposit against decline point by point and found no disagreement in
  210,000 points.

  CROSS-CHECK. `64-throughput.js` transcribed literally into JS with
  integer semantics kept (`int()` truncating toward zero, `/` between
  ints truncating, `&&` and `?:` short-circuiting as the shader's do),
  driven by a draw-recording stream, with the positive's own `s.vnoise`
  values handed in at the seventeen substituted hash sites and the
  plate's expressions computing everything else. Seven lever settings
  at 30,000 points each, 210,000 points, 70,442 deposits and 139,558
  declines:

    defaults                                          worst rel 0
    MAGNIFY 6, WORLD 41, SCIENCE 2.0                  worst rel 0
    MAGNIFY 11, BACKPRESSURE 1, TRAINS 1              worst rel 0
    DEPTH 5, WORLD 3, NIGHT 0, STAIN 1, SCIENCE 0.2   worst rel 0
    MAGNIFY 9, WORLD 2 (slab silhouette)              worst rel 0
    MAGNIFY 9, WORLD 1 (pin-grid silhouette)          worst rel 0
    WORLD 7, SCIENCE 0.6, BACKPRESSURE 0.9 (oil)      worst rel 0

  Worst relative and worst absolute delta over x, y, r, g and b: both
  exactly zero. Deposit-against-decline disagreements: zero. Draw-count
  disagreements: zero. The zero is not vacuous and it is not luck. The
  CPU evaluator runs doubles, the transcription runs doubles, and
  nothing in the walk was reassociated, so where `breakdown` measured
  5.9e-15 for having spelled its arithmetic differently, this file
  spells it the same way and lands on the same bits. The negative
  control is what makes that reading evidence.

  NEGATIVE CONTROL. Eleven constants perturbed one at a time in the
  transcription, split by how each enters the subject. Seven reach a
  coordinate or a colour continuously and were moved in the fourth or
  fifth significant figure: km 1.9836426e-7, the depth bias 0.72, the
  bus taper 0.55, the saturation amplitude 0.90, the lake lobe 0.18,
  the ore radius step 0.16, the slab half-width 380. Four appear ONLY
  inside a comparison, where a fifth-figure nudge has no observable
  until it moves a point across its own gate, so each was moved far
  enough to do that: the bus occupancy gain 1.35 to 1.20, the train
  gate 0.55 to 0.40, the accumulator share 0.44 to 0.30, the jam
  weight 0.85 to 0.40. All eleven were caught, the continuous ones as
  deltas from 3.0e-7 to 4.9e-1 (six to thirteen orders above a floor
  of exactly zero), the gate ones as deposit-against-decline and
  draw-count disagreements, from 20 to 353 points out of 8,000 per
  setting. Nothing was missed.

  COVERAGE, counted in the transcription over the same 210,000 points.
  All seven depth strata (d=0 land 19,605, d=1 rail 8,023, d=2
  furniture 9,968, d=3 districts 43,283, d=4 feed 29,728, d=5 walls
  22,869, d>=6 flow 76,524). All five placement
  engines (wire 14,277, box 19,910, disc 73,683, seated 40,424, ribbon
  1,718). All eleven district types at d=3, down to oil at 86 and the
  corner office at 199. Three of four item silhouettes, the fourth
  unreachable for the reason given above.

  NOT VOLUMETRIC, AND NOT A VOLUME AT ALL. The shader returns
  `vec3(rel.x, rel.y, 0.0)`; every point lies in one plane, seen flat
  from a camera at dist 3.0 with pitch 0.22. The per-cell density is a
  plane density and the ordinary sampling budget applies. What the rig
  WILL see is a very uneven density across the frame, because the depth
  ladder spends most of its budget on the flow and the flow lives on a
  quarter-tile lattice inside production blocks, so belt lanes carry
  orders of magnitude more points per unit area than the ground does.
  That is the subject. It is also why the far-out count is zero: every
  engine clips to the window before it seats, so no point can land more
  than the window half-width plus one furniture radius from the centre.

  All eight levers are live and correctly indexed, and the lever block
  was diffed against the plate's `params` array: label, min, max, step
  and def identical in order for all eight, `cam` and `gain` and
  `accent` copied.

  Gates, exact output:

    $ node tools/smoke-pos.mjs positives/throughput.pos.mjs
    PASS  emits   2565 GLSL lines
    PASS  defaults   9065/20000 deposit (10935 decline), 0 malformed, 0 far-out, x [-1.30, 1.30] y [-1.25, 1.22], mean lum 0.648
    PASS  defaults t=1.7   9065/20000 deposit (10935 decline), 0 malformed, 0 far-out, x [-1.30, 1.30] y [-1.25, 1.22], mean lum 0.648
    PASS  hashed levers A   8682/20000 deposit (11318 decline), 0 malformed, 0 far-out, x [-1.30, 1.30] y [-1.25, 1.22], mean lum 0.583
    PASS  hashed levers B   1118/20000 deposit (18882 decline), 0 malformed, 0 far-out, x [-1.26, 1.26] y [-1.09, -0.09], mean lum 0.965

    smoke passes

    $ node tools/verify-pinned.mjs throughput
    positives: 1
      fully pinned : 1
      refused      : 0
      emitted but still carrying an unpinned op: 0

  The clock is unread. The plate takes `uT` nowhere, so the walk is the
  two-parameter form and `defaults` and `defaults t=1.7` are identical
  by construction, as the smoke rows show.

  One last thing about the emitted text, since it is the largest in the
  set. 2,565 lines unpinned and 3,128 pinned, of which roughly a
  thousand are the forty-eight `s.vnoise` expansions at twenty lines
  each. A static pass over the pinned output found 1,942 declared
  locals, 719 assignments, no float local assigned an int-typed
  expression, no identifier used before it is declared, and no name
  colliding with a GLSL reserved word. That is a text check and not a
  compiler, so it says what it says and no more.
