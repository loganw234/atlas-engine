# breakdown: converted
plate GLSL lines: 99   positive lines: 221
gaps: none. Every construct in the plate reaches the vocabulary. The
      two loops are the two orbits, the addressed hashes are s.vnoise,
      and nothing was dropped or approximated in the geometry.

notes:

  THE PLATE IS ADDRESSED, and that decides everything about the walk.
  Four hash sites in the shader are functions of a node's address and
  not of the point: the trunk's per-segment wander (`taddr`, a chain
  from a fixed FNV basis over the segment index alone), the survival
  draw `u2f(addr)`, the jitter `u2f(hashu(addr))`, and the channel
  texture `u2f(hashu(addr ^ uint(t*97.0)))`. Points that walk the same
  path must agree at all four or the figure stops being a tree. All
  four are s.vnoise read at whole lattice coordinates, where the
  interpolation weights are exactly zero and the value is the corner
  hash, a uniform on [-0.5, 0.5) addressed by cell and octave alone.
  `(u2f(h) - 0.5)` and `s.vnoise(...)` are the same quantity, so the
  trunk wander and the jitter are literal substitutions; the survival
  and texture sites want `u2f(h)` itself and take `s.vnoise(...) + 0.5`.

  THE ROLLING CELL, and what it costs. The shader's `addr` is a 32 bit
  chain: root = hashu(taddr ^ 0x12345678) keyed by the trunk segment,
  then addr = hashu(addr ^ side_constant) per level. The positive
  carries the same chain as a lattice cell that rolls forward, each
  level's (ax, ay) hashed from the previous cell and the fork just
  taken, with the LEVEL and the fork bit riding in the octave so
  attributes cannot collide and a recurring cell cannot make the chain
  periodic. Octave allocation, all disjoint: 101 trunk wander, 601/607
  root cell, 1000+l survival, 2000+2l+bit jitter, 3000+2l+bit child ax,
  4000+2l+bit child ay, 5000+tc texture.

  The lattice folds at 1024, so the carried address is 20 bits where
  the shader's is 32. Two nodes on different paths can therefore land
  on one cell and share a jitter and a survival draw. Their positions
  still differ, because position accumulates from each node's own path,
  so the visible effect is a pair of congruent twigs and never a
  doubled filament. At the default levers the surviving tree is a few
  thousand nodes against a million cells and collisions are a fraction
  of a percent. Driven to DEPTH 22 with BRANCH PROB 0.95 the tree
  outgrows the lattice and repeated motifs appear, all of them below
  the level a pixel resolves at the default camera. This is the same
  trade dissipation states for its shift register and it is imposed by
  the lattice, not chosen. If a future vocabulary gains a wider field
  or a re-seedable sub-stream, this is the one place the plate would
  want it.

  THE LOOP SHAPES ARE THE SHADER'S, checked in the emitted text. The
  trunk is `for (i < 24) { if (i >= segTarget) break; ... }` and the
  hierarchy is `for (l < 22) { if (l >= d) break; if (starved) break;
  ... }`. `d` is `s.depth(P.depth)`, which is the plate's
  `int(u2f(pt) * float(maxD))` and carries the lever's max as the
  static bound, so the orbit needs no counter field and breaks exactly
  where the shader does. One consequence worth recording: s.depth emits
  `det_pow(u, 1.0)` where the shader has a bare multiply, and although
  Math.pow(u, 1.0) is exactly u on the CPU side, a one ULP round trip
  through det_log2/det_exp2 on the GPU can flip d for points sitting on
  a boundary, roughly one in a million, each of which then walks a
  different path. That is the accepted behaviour of the primitive
  (dissipation and critical carry it too), not something this plate
  introduced.

  The starvation test is carried as a state field rather than
  recomputed, because `until` sees the state BEFORE the step, which is
  exactly where the shader tests a starved limb and dies. The step
  therefore reads the NEXT node's survival at the end of its own body.
  Both loops end through `until`, so neither runs its static bound: the
  average point reads about a dozen lattice sites on the trunk and four
  per surviving level, and the surviving level count is 2.6 on average
  at the defaults.

  TWO DRAWS WHERE THE SHADER SPENDS ONE. The shader draws one uniform
  `t` and takes `uint(t * 97.0)` as the texture cell. An octave must be
  int typed and the subset has no float to int conversion outside
  s.pick and s.depth, so the cell is drawn first as `s.pick(97)` and
  `t` is rebuilt as `(tc + s.u()) / 97.0`. That is the same joint law,
  uniform t with the cell as its 97ths, and the brief's licence for
  stochastic texture to differ in value but not in law covers the extra
  draw. Nothing else about the draw sequence moved: d, then segTarget,
  then one fork per level, then the seat, then bank, core and z, in the
  shader's own order.

  GUARDS, and which of them can bind. Two were added and neither binds
  at any reachable input, which is stated rather than assumed:
    - the mean-reversion renormalise divides by max(len2, 1e-6).
      Mixing a unit vector 0.78 of the way toward (1, 0) leaves a
      length of at least 0.56, so the floor is unreachable and only
      makes the division total.
    - `pow(abs(u), 0.30)` takes max(abs(u), 1e-30). u = 2*s.u() - 1 is
      either exactly zero or at least 1e-7 from it, and at exactly zero
      sign(u) already kills the term, so the value is unchanged. What
      the floor removes is det_pow being handed a logarithm of zero,
      which returns -inf and would make the product NaN on the GPU
      where the CPU says 0.
  Everything else is bounded by construction: len and width contract
  monotonically, the lattice coordinates are floored into [0, 1023],
  and there is no exp or log anywhere. A sweep of all 256 lever corners
  at 400 points each, 102,400 points, produced no non-finite field and
  no decline, range [-1.886, 2.762]. The plate has no far sentinel and
  the walk has no s.decline, as expected.

  All eight levers are live and correctly indexed; unlike tangle there
  is no dead lever here. KEEL ships at zero, where its subtraction is
  exactly nothing, and it is written out so an operator turning it up
  gets the shader's behaviour.

  CROSS-CHECK. 57-breakdown.js transcribed literally into JS, driven by
  a draw-recording stream, with the positive's own values handed in at
  the four substituted hash sites and the plate's expressions computing
  everything else. Over four lever settings at 5,000 points each
  (defaults; DEPTH 22 / PROB 0.95 / ANGLE 80; DEPTH 4 / PROB 0.35 /
  KEEL 1 / SPAN 1.2; WANDER 1 / CONTRACTION 0.86 / TIP 1 / SPAN 3.2)
  the worst relative delta over x, y, z, r, g, b was 5.947e-15, worst
  case 8.7e-16 at the defaults. The harness also asserts that the
  transcription consumes exactly the draws the walk made, which fails
  unless both took the same route down the tree; it never fired across
  all 20,000 points.

  NEGATIVE CONTROL. Twelve constants perturbed one at a time in the
  transcription, each in the fourth or fifth significant figure: width
  thinning 0.62, y squash 0.92, bank exponent 0.30, mean reversion
  0.22, jitter amplitude 0.7, wander amplitude 1.6, degrees 0.0174533,
  seat taper 0.62, core amplitude 0.35, initial width 0.012, texture
  base 0.7, and the palette's c.g 0.85. Every one of the twelve was
  caught, deltas from 1.1e-4 to 4.3e-2, eleven to twelve orders above
  the agreement floor.

  NOT VOLUMETRIC. The figure is a plane curve given a thin skin: z is
  a centred draw times 2 * wLocal, and wLocal never exceeds 0.014 at
  the trunk and halves with every level. The points lie in a sheet
  microns thick against a span of 2.6, so the conformance rig should
  read this as a plane figure at the ordinary budget. What it WILL see
  is a very uneven density across the frame, since equal light per
  level piles the same budget onto twigs that occupy a vanishing
  fraction of the area. That is the subject, not noise.

  Gates, exact output:

    $ node tools/smoke-pos.mjs positives/breakdown.pos.mjs
    PASS  emits   294 GLSL lines
    PASS  defaults   20000/20000 deposit (0 decline), 0 malformed, 0 far-out, x [-1.41, 1.28] y [-0.26, 0.15], mean lum 0.699
    PASS  defaults t=1.7   20000/20000 deposit (0 decline), 0 malformed, 0 far-out, x [-1.41, 1.28] y [-0.26, 0.15], mean lum 0.699
    PASS  hashed levers A   20000/20000 deposit (0 decline), 0 malformed, 0 far-out, x [-1.30, 1.19] y [-0.19, 0.18], mean lum 0.699
    PASS  hashed levers B   20000/20000 deposit (0 decline), 0 malformed, 0 far-out, x [-1.41, 1.35] y [-0.25, 0.14], mean lum 0.727

    smoke passes

    $ node tools/verify-pinned.mjs breakdown
    positives: 1
      fully pinned : 1
      refused      : 0
      emitted but still carrying an unpinned op: 0
