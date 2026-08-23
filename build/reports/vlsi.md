# vlsi: converted
plate GLSL lines: 608   positive lines: 902
emitted GLSL: 1443 lines unpinned, 1617 pinned

gaps: none. Four things in the subset had to be worked around and all
      four had an answer inside it.

      1. NO uint, NO BITWISE OPERATORS, NO hashu - and this plate is
         nothing but an addressed hash chain. `fp = hashu(2166136261u ^
         maskNo * 2654435761u)` roots the floorplan, `fp = hashu(fp ^
         (sideA ? 0x9e3779b9u : 0x7f4a7c15u))` descends it, and
         eighteen further `u2f(hashu(fp ^ K))` read cuts, block types,
         layer choices, cell widths, track occupancies and brightness
         off it. Re-keyed through `s.vnoise` at WHOLE integer
         coordinates, where both interpolation weights vanish and what
         comes back is the lattice corner hash itself: a pinned
         per-index value drawing nothing from the stream, which is
         exactly what "all points agree on the figure" needs. See the
         scheme below. This is THE RULE from CONVERSION.md and it is
         the only substitution in the plate.
      2. `s.window` computes this plate's loupe exactly (span
         [VDIE,VDIE], heart [VCTR,VCTR], unit 2.5189112e-7 - the
         plate's `hw = int(float(VCTR)/mag)` and `km = mag * unit` are
         the vocabulary's own arithmetic) but exposes only `.seat()`,
         and this plate reads `win.x` through `win.w` in eleven places:
         the descent's visibility weighting, the ring's side test, the
         wire clip, the fill clip and the contact clip. So the loupe is
         written out in floats, which is what breakdown, rulespace and
         throughput did before it. `w.win` still refuses with "cannot
         bind lo: unhandled value".
      3. `s.depth(max, {bias})` wants a LITERAL bias and this plate's
         rides MAGNIFY: `bias = mix(0.72, 0.20, clamp(P[1]/14, 0, 1))`.
         So the draw and the power are written out,
         `Math.floor(Math.pow(s.u(), bias) * maxD)`, which emits the
         same `int(det_pow(u2f(pt), bias) * float(maxD))` the
         vocabulary would have.
      4. THE SUBSET HAS NO BOOLEAN LITERAL. `let ok = true;` is
         "unknown name true" - `true` and `false` lex as identifiers
         and resolve against the symbol table. Every flag the plate
         carries (fhz, cutY, stopHere, dead, got, hit) therefore rides
         as a float, 0.0 or 1.0, tested with `> 0.5`. Bool-VALUED
         expressions are fine and are used wherever a name is bound
         once. Relatedly, a ternary whose two branches are both bool is
         refused ("cannot use bool as float"), so the plate's
         `stopHere ? (uF < tintW) : (r == 0 && uF < mix(...))` is
         written `(stopHere && ...) || (!stopHere && ...)`.

notes:

  THE ADDRESS IS A LATTICE POINT. A node's address here is a pair of
  whole integers (ax, ay) in [0, 1024)^2 - the coordinate `s.vnoise`
  reads at, after its own `& 1023`. The root is drawn from MASK SET:
  `ax = min(floor((vnoise(maskNo, 3, 1) + 0.5) * 1024), 1023)`, and the
  same at octave 2 for ay, so all 64 mask sets root distinct floor
  plans. A child is a fresh lattice point drawn from its parent's,
  with the side taken shifting the key: `cx = mod(ax + side*397, 1024)`,
  `cy = mod(ay + side*211, 1024)`, then two reads at octaves 16 and 17.
  That is the hash chain, restated.

  Everything else is an OFFSET on that point read at its own octave,
  which costs two `mod`s instead of a whole second lattice read:

    the shader's salt          the positive's address
    ------------------------   ------------------------------------
    hashu(fp ^ 0x51ed270b)     vnoise(ax, ay, 11 / 12 / 13)
    hashu(fp ^ 0xc2b2ae3d)     vnoise(ax, ay, 14 / 15)
    hashu(fp ^ 0x85ebca6b)     vnoise(ax, ay, 18)
    hashu(fp ^ 0xa511e9b3)     vnoise(ax, ay, 24)
    fp ^ 77u  (clock limb)     (ax+77, ay+177) mod 1024
    fp        (channels)       (ax, ay)
    fp ^ 0x1a2b3c4d (rails)    (ax+341, ay+455) mod 1024
    fp ^ 40503 / 69061         (ax+503, ay+87) / (ax+61, ay+661)
    fp ^ 29u  (analog combs)   (ax+29, ay+129) mod 1024
    ca2 (a standard cell)      (ax + slk*13, ay + rr*29) mod 1024
    ca2 ^ 91u (straps)         (c2x+91, c2y+191) mod 1024
    ba  (an sram bank)         (ax + bi*101, ay + bj*103) mod 1024
    hashu(ba ^ (ci*73+cj))     (bax + ci*7, bay + cj*11) mod 1024
    hashu(tSalt ^ j*2654435761)(tsx + jlo*17, tsy + jhi*13) mod 1024
    uint(cnr), uint(sd2*31)    reserved points (300+cnr, 301), (310+sd2, 311)

  EVERY MULTIPLIER IS COPRIME TO 1024 AND EVERY INDEX RANGE FITS, so
  the map from sub-object to address is injective inside its parent -
  no two cells of one block, no two bitcells of one bank and no two
  tracks of one channel ever share an address. The ranges were checked
  against the plate rather than assumed: a standard-cell block comes
  only from the leaf grammar (`longSide <= 48*VROW`) so its slice and
  row indices are under 48; an sram block comes from the leaf grammar,
  the early hard macro (144 rows) or the cache cluster (192 rows), so
  its bitcell indices are under 460 across and 567 up; a routing
  channel is a leaf too, so its track index is under 192. The
  `jlo/jhi` split of the track index across both lattice axes covers
  indices to 2^20 and is therefore insurance rather than load-bearing.
  Collisions BETWEEN unrelated addresses remain possible at the
  ordinary 2^-20 rate, and are invisible: two nodes that collide draw
  the same choices in different places.
  The two standalone salts (`uint(cnr)` for the stepper crosses,
  `uint(sd2*31)` for the pad-ring supplies) are reserved lattice points
  rather than derived ones. A node address can land on one at 2^-20;
  the consequence is one corner cross sharing a track occupancy pattern
  with one block, which is not visible and is recorded here rather than
  guarded against.

  THE LATTICE RIDES IN FLOATS AND IT COSTS NOTHING, MEASURED. The
  subset has no ints outside literals and loop indices, and orbit
  fields are float-only, so the nanometre lattice is carried in exact
  small floats. Two things were measured rather than trusted:

  - Every integer division the plate performs was checked exhaustively
    against a correctly rounded f32 divide over EVERY integer from 0 to
    VDIE (10321920), for every divisor the plate uses: 2, 5, 8, 25,
    720, 1024, 1440, 1920, 2400, 5760, 11520, 17280, 51840. Zero
    mismatches on all thirteen; worst quotient error 5.97e-5 against a
    worst-case slack of 1/5760 = 1.74e-4, so `floor` never crosses.
    Under `pin` every one of these goes through `det_div`, which is
    correctly rounded, so the emitted plate has the same guarantee. The
    row snap `(cc/VROW)*VROW` and the cut halving `(lo+hi)/2` are
    therefore exact, which is what the caption's "the window stays
    exact where float32 would have dissolved" is claiming.
  - The widest absolute value any lattice quantity reached, watched
    across 140,000 walks at six lever settings including both rails of
    CACHE, UTILIZATION, METAL LAYERS and DEPTH: 10,275,840. That is
    1.63x under 2^24 = 16,777,216. Of the 1089 float literals in the
    emitted GLSL, 0 are at or above 2^24 (largest 10321920); the 321
    uint literals are exact by type.

  ALL FIVE BREAKS OF THE GUILLOTINE LOOP ARE ONE STOP CODE. The
  fourteen-level descent is `s.orbit(14, ...)` with a BLOCK body, the
  billiards shape: 0 running, 1 the grammar bottomed out (typ written,
  this node's cut never computed, so cutY/cc/chw stay the parent's -
  which is what the shader's `break` before those lines does), 2 the
  budget ran out here (cut computed first, so a stopped point can light
  the channel the cut carries), 3 the window sees neither child.
  `until` reads the code BEFORE each step, so the step that stops is
  the step that freezes the state. The one stream draw inside the loop
  (the side pick, weighted by clipped extent) sits inside the same `if`
  nest the shader puts it in, so a stopping step does not spend it.
  Loop exhaustion is unreachable: budget = d - 2 <= 13 and the budget
  test fires at lvl = budget.

  THE CUT CLAMP IS WHAT KEEPS THE RECTANGLES POSITIVE, and it is worth
  recording because it looks like a hazard and is not. When a block is
  narrower than 24 rows plus two channel half-widths, the clamp's low
  bound exceeds its high bound and GLSL `clamp(x, lo, hi)` =
  `min(hi, max(lo, x))` returns `hi`. That puts the A-side edge below
  the block's own floor, which makes side A's clipped extent exactly
  zero, which makes `sideA = la2 > u * (la2 + lb2)` false for every u.
  So the walk always takes side B and the child keeps a full 12 rows.
  No block ever goes negative, and no guard was added for one.

  THE RING ENGINE MOVED, AND THE MOVE IS PROVEN FREE. `vlsi_ringp` is
  a GLSL function called at four sites; a positive has no functions, so
  four copies of a four-iteration orbit would have been emitted. It is
  instead a REQUEST - fmode 6, with the rectangle and band width in
  `rlox..rhiy, rwnm` - resolved at one call site beside the track
  engine, which is exactly the architecture the plate states for its
  other primitives ("each engine runs once, at the tail"). Its single
  draw is the last draw of every arm that asks for it, so hoisting it
  cannot move the draw order - and that is not an argument, it is the
  thing the cross-check tests: the transcription calls ringp INLINE at
  the shader's four sites, both sides read one tape, and a wrong hoist
  would show as a tape divergence. Zero divergences in 151,671
  comparisons.

  vlsi_stain IS WRITTEN OUT COMPONENTWISE rather than through the
  vocabulary's `stain()`, because the shader's last line is
  `max(vlsi_stain(...) * (glow*brt), vec3(0.0))` and a componentwise
  max against zero needs the three components as floats, which a vec3
  value does not give up. The rotation is the same formula
  (c*cs + cross(k,c)*sn + k*dot(k,c)*(1-cs), k = vec3(0.57735027)).
  A side effect worth having: this plate reaches NO unpinned
  shared-header function at all. verify-pinned prints no KNOWN GAP
  section for it - no `pal`, no `cmul`, no `stain` helper - so "fully
  pinned" means what it says here rather than what it usually means.

  THE FOUR 25-BIT GLYPH MASKS became five 5-bit rows each. `0x1e8fa10`
  is 32,045,584, past f32's exact integer range, and the shader tests
  `(bm >> uint(24 - (by*5+bx))) & 1u`. A row is under 32 and is not:
  row `by` of glyph g is a literal, and the bit test is
  `mod(floor(row / 2^(4-bx)), 2)`. The rows spell what the caption says
  the mask signs its corner with, P C 6 3, and they were derived from
  the shader's constants rather than drawn by hand.

  DRAW ORDER, source order, unchanged from the shader. Every `rnd`
  component becomes a stream draw at the point the shader reads it:
  `rnd.z`/`rnd.w` in the inductor arm, the wire's transverse bank and
  the contact's jitter (three mutually exclusive arms, so one pair per
  point), `rnd.y` in the z slab. The one addition is at the very end:
  the shader's default `tex = pt` reads the point's own hash for
  brightness, so the walk draws once unconditionally there and uses it
  only when no branch addressed the texture. Nothing downstream reads
  the stream, so the extra draw is free; it is unconditional so that it
  is not inside a ternary.

  THE PICTURE MOVES, AND HERE IS BY HOW MUCH. Re-keying draws a
  different member of the same ensemble - a different mask set of the
  same process. Measured at defaults over 120,000 points, comparing the
  positive (via the keyed transcription, which is bit-identical to it)
  against the plate's own hashu chain, arm by arm over all 32 arms a
  depositing point can take:

    every arm within 1.71 percentage points, 28 of 32 within 0.21
    the three d=0 arms and the four d=1 arms are IDENTICAL to 0.000 pp
      (which arm a point takes there is decided by the stream alone,
       so the re-keying cannot move their shares at all)
    deposit rate: positive 99.34%, plate 97.64%

  The whole of that 1.7 pp sits in one statistic, the track engine's
  four-tries-all-unoccupied rate: 0.635% for the positive against
  2.397% for the plate at MASK SET 7. That is not a law difference, it
  is the ensemble. Swept over all 64 of the plate's OWN mask sets at
  defaults, 40,000 points each, the plate itself ranges:

    deposit rate    97.44 .. 99.51%   (mean 99.16)
    track miss rate  0.468 .. 2.538%  (mean 0.821)

  The positive's 99.34% and 0.635% are inside both ranges and near both
  means; MASK SET 7 simply happens to be an unlucky draw for the
  plate's own chain. A pixel correlation against the registry plate is
  the wrong instrument for this, exactly as CONVERSION.md says.

  Gates, exact output:

    $ node tools/smoke-pos.mjs positives/vlsi.pos.mjs
    PASS  emits   1443 GLSL lines
    PASS  defaults   19850/20000 deposit (150 decline), 0 malformed, 0 far-out, x [-1.29, 1.29] y [-1.30, 1.29], mean lum 0.541
    PASS  defaults t=1.7   19850/20000 deposit (150 decline), 0 malformed, 0 far-out, x [-1.29, 1.29] y [-1.30, 1.29], mean lum 0.541
    PASS  hashed levers A   19831/20000 deposit (169 decline), 0 malformed, 0 far-out, x [-1.29, 1.29] y [-1.30, 1.29], mean lum 0.545
    FAIL  hashed levers B   9552/20000 deposit (10448 decline), 0 malformed, 4127 far-out, x [-1431.45, 792.21] y [-3640.94, 1683.07], mean lum 0.499

    smoke: 1 FAILURES

    $ node tools/verify-pinned.mjs vlsi
    positives: 1
      fully pinned : 1
      refused      : 0
      emitted but still carrying an unpinned op: 0

    Admitted without pinning, by name and reason:
      floor      exact on every conforming implementation
      abs        sign-bit clear, exact
      min        exact selection
      max        exact selection
      sign       exact
      clamp      min/max composed, exact
      step       a comparison, exact

    No deterministic form at all (oracle.UNCOVERED): round, sign

  THE ONE SMOKE FAILURE IS THE PLATE'S LAW, and buddha is the
  precedent for saying so. Smoke's `hashed levers B` sets MAGNIFY 11.5,
  and its far-out sub-check (|x| or |y| > 24, allowed for under 2% of
  N) fails at 20.6%. The cause is in the shader, 63-vlsi.js 579-583:

      if(fmode == 1){
        // a wire: run clipped to the window, transverse seat bank-weighted
        int c0 = fhz ? win.x : win.y;
        int c1 = fhz ? win.z : win.w;
        fa0 = max(fa0, c0); fa1 = min(fa1, c1);

  A wire's RUN is clipped to the window; its TRANSVERSE coordinate,
  `fcc`, is not, and the track engine never tests it. `vlsi_ringp` does
  test it - picking a visible side is its whole job - so the asymmetry
  is deliberate rather than an oversight, and at MAGNIFY 11.5 it means
  a pad-ring supply bus 5 mm from the die centre still deposits, at
  km = 7.3e-4 plate units per nm, a seat 3,600 units off frame. The
  camera at dist 3.0 never sees those points; smoke's heuristic does.

  Run on the plate itself - the literal transcription with real uint
  hash chains - at smoke's own four configurations:

    defaults          19511/20000 deposit,     0 far-out, max |coord| 1.30
    hashed levers A   19416/20000 deposit,     0 far-out, max |coord| 1.30
    hashed levers B    6454/20000 deposit,  3266 far-out (16.3% of N,
                                            gate is 2%), max |coord| 3641.11

  The positive's max |coord| at that setting is 3640.94 against the
  plate's 3641.11 - the same envelope, one ensemble apart. Swept over
  ALL 64 of the plate's own mask sets at that lever setting, 20,000
  points each, the plate's far-out share runs 2.75% to 39.75% of N and
  its deposit rate 5.15% to 63.22%; the positive's 20.64% and 47.76%
  are inside both, and ALL SIXTY-FOUR of the plate's own mask sets fail
  smoke's 2% far-out check there. The gate is measuring the plate, not
  the restatement. And at that exact lever
  setting the cross-check compares 2,915 deposits and 3,085 declines
  field by field with zero differences, so whatever the positive puts
  off frame, the plate's own text puts there identically. No guard was
  added: clipping `fcc` would admit a different set of points, which is
  the one forbidden result.

  CROSS-CHECK. The walk against a literal transcription of the plate's
  GLSL - real uint arithmetic (`Math.imul`, `^`, `>>> 0`) for the hash
  chains, `Math.trunc` wherever the shader divides ints, `vlsi_ringp`
  inline at its four call sites, the glyph masks as 25-bit constants -
  with both sides driven from one recorded draw tape. The transcription
  runs in "keyed" mode, sharing the one substituted convention so that
  everything DOWNSTREAM of it is compared rather than the convention
  itself; that is rulespace's method and the reason the check has any
  teeth.

    15 lever settings (MAGNIFY 0 / 1.25 / 3.5 / 6 / 8.25 / 11.5 / 14,
    DEPTH 2 / 7 / 12 / 14 / 15 / 16, MASK 1 / 7 / 23 / 31 / 41 / 52 /
    64, CACHE 0.15 / 0.27 / 0.3 / 0.42 / 0.55, METALS 3 / 5 / 6,
    UTILIZATION 0.40 / 0.55 / 0.8 / 0.82 / 0.98, STAIN 0 / 0.35 / 0.62
    / 0.9, FILL 0 / 0.11 / 0.27 / 0.55 / 0.83 / 1.0):

      151,671 deposits compared field by field: x y z r g b
      151,671 BIT-EQUAL, worst absolute delta 0.000e+0
       14,329 declines, 0 decline mismatches
            0 draw-tape divergences (same draws, same order, same count)

    Plus the dead-descent arm, which the sweep above never reached and
    which turns out to be reachable only where the window falls inside
    a wiring channel: MAGNIFY 10 at MASK SET 3, 17 and 22 declines
    every point, 24,000 matched declines, 0 differences.

  COVERAGE OF THE CROSS-CHECK, measured rather than assumed. All 33
  arms a point can take were reached:

    d=0        seal ring 1812, corner cross 631, mask glyph 1159
    d=1        pad 1957, pad ring 937, esd comb 1370, supply rings 1331
    floorplan  field tint 19396, block ring 4927, leaf ring 9213,
               clock limb 3248, wiring channel 21806,
               dead (window sees neither child) 24000
    cells      rails 9658, n-well 7157, over-the-cell routing 10828,
               device layer 2403, filler 820, gates 501, diffusion 389,
               straps 693
    sram       sense band 2095, decoder spine 1746, bank ring 2326,
               bitlines 6909, bitcell 41523
    analog     inductor 4734, capacitor 2378, wide fets 2692
    channel    typ7 routing 3764
    engines    track hit 71583, track via 4733, track all-four-miss 3473

  The device layer needed help: the plate reaches gates, diffusion and
  straps only when surplus depth pools down there (r >= 3, which needs
  the grammar to bottom at least three levels above the budget), so
  four of the fifteen settings drive the walk from a SCRIPTED first
  draw that forces the budget to its deepest lawful value. Both sides
  read the same scripted tape, so the comparison is unaffected.

  NEGATIVE CONTROLS, all ten fired, each run at a setting that
  exercises the arm it touches:

    km 2.5189112e-7 -> 2.5189113e-7   7939/7939 differ, worst 5.16e-8
    brightness gain 0.56 -> 0.5601    7939/7939 differ, worst 1.35e-4
    cut fraction 0.34 -> 0.3401       1286/7939 differ, worst 1.39e+0
    row lattice 5760 -> 5761          7376/7905 differ, worst 1.41e+0
    seal-ring inset 46080 -> 46081      59/7939 differ, worst 2.52e-7
    pad pitch 115200 -> 115201         201/7939 differ, worst 2.12e-5
    glyph row by -> by+1                58/7907 differ, worst 4.36e-1
    filler threshold 0.94 -> 0.95        7/24739 differ (tape only)
    cut clamp 12 rows -> 20 rows      1789/24707 differ, worst 1.26e+0
    ring side order +k -> -k           339/5386 differ, worst 1.83e+0
    control, no fault planted            0/32685 differ

  THE FILLER-THRESHOLD CONTROL IS THE ONE THAT EARNED ITS KEEP, and
  the reason to run negative controls rather than assert them. On the
  first pass it was SILENT at every perturbation up to 0.94 -> 0.98,
  which is a 3% shift in a threshold with 2,400 device-layer points
  behind it. The comparator was blind: flipping a cell into the filler
  branch changes how many draws the walk spends, and the comparator was
  SKIPPING points whose two sides disagreed about the tape rather than
  counting them as differences. Fixed - a tape underrun or an unused
  tail is now a difference - it fires, and it fires ONLY through that
  channel (7 tape divergences, 0 field differences), which is exactly
  the class the hole was hiding. Two controls remain below the
  sensitivity floor rather than silent: at 0.94 -> 0.9401 the threshold
  moves 8.2e-5 against ~6,600 device-layer points, so under one flip is
  expected, and the cut clamp at 12 -> 13 rows almost never bites by
  exactly one row. Both fire as soon as the perturbation clears the
  arm's own rarity (0.95 and 20 rows respectively).

  FINITENESS. 158 lever settings x 1,500 points = 237,000 walks,
  sweeping every MAGNIFY step from 0 to 14, all 64 MASK SETs, all
  DEPTHs 2..16, all METAL LAYERS, and both rails of CACHE, UTILIZATION,
  STAIN and FILL, plus both all-rails corners: 203,537 deposits, 33,463
  declines, ZERO non-finite fields. There is no runtime divisor
  that can reach zero: every division is by a constant, by
  `mag = 2^MAGNIFY >= 1`, by a bank count in {1, 2, 4, 8}, or by `k8`
  below - so there is nothing to guard against.
  `k8 = cos(mod(th, PI/4) - PI/8)` in the inductor arm stays in
  [0.9239, 1] and cannot vanish. `Math.pow(u, bias)` at u = 0 (one
  draw in 2^32) gives 0 in the evaluator and det_exp2(clamp(-inf)) = 0
  in the emitted text, not NaN.

  EMITTED GLSL SCOPE-LINTED in both variants, since neither gate
  compiles GLSL and this walk declares inside `if` blocks, inside
  nested `if` blocks and inside three orbit step bodies: 792
  declarations and 2,487 identifier uses unpinned, 966 and 2,661
  pinned, 0 out of scope in either. The lint was itself controlled -
  planting a use of a block-local at the end of the function makes it
  fire in both variants.

  LEVERS, CAM, GAIN AND ACCENT diffed programmatically against the
  plate's own `params` array: all eight labels, mins, maxes, steps and
  defaults identical in order, `cam` {dist 3.0, pitch 0.30, tgtY 0.0,
  rot 0.0}, gain 0.5, accent #f0b448.

  NOT VOLUMETRIC. Every point lies in a thin slab: z is
  `(zi - 2.2) * zl + (rnd.y - 0.5) * zl * 0.6` with
  `zl = min(6e-6 * mag, 0.045)`, so the whole stack spans 1e-5 plate
  units at MAGNIFY 0 and 0.25 at MAGNIFY 14 - relief on a plane, not a
  cloud in a volume. The ordinary sampling budget applies; there is no
  Poisson noise floor of the qjulia/bulb kind. Density across the frame
  IS very uneven, because the depth ladder spends most of its budget on
  the floorplan and the floorplan concentrates it wherever the window
  is looking, but that is the subject.

  COMPILE COST, since the plate's own header is a warning about it
  ("time ~ size^2.6, thirty seconds for the naive writing of this
  plate"). The positive emits 1443 GLSL lines against the plate's 608,
  a factor of 2.37. Most of the growth is the 21 `s.vnoise`
  expansions, each about twenty statements, that replace one-line
  `hashu` calls; the engine architecture the plate built to keep itself
  small is preserved and extended by one (the ring), which is what
  keeps the factor at 2.4 rather than at the 4 or 5 a per-site
  re-keying would have cost. The offset scheme above is the reason:
  a constant salt is two `mod`s, not a second lattice read.

  FOR THE NEXT READER. The whole plate is one if/else chain filling a
  furniture request, then three engines. If something looks wrong in
  the picture, the fastest instrument is the scratch cross-check: it
  reports which of the 33 arms the failing points took, and the arms
  are named after the shader's own comments.
