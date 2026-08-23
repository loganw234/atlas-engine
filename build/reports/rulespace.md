# rulespace: converted
plate GLSL lines: 135   positive lines: 255
gaps: none. The subset has no bitwise operators at all - the lexer has
      no `&`, `|`, `^`, `~`, `<<` or `>>` token - and this plate's toll
      is written entirely in them: a 128 cell ring in four uint words,
      stepped 32 cells at a time by eight neighbourhood masks. All of
      it is said in arithmetic on exact small floats, the collatz
      idiom. The ring rides as EIGHT SIXTEEN-BIT words instead of four
      thirty-two-bit ones, because 2^32 is past f32's exact integer
      range and 2^16 is not: every intermediate here stays under 2^17
      (a word is under 65536, the left-neighbour fold doubles it before
      the modulus, the running place value doubles to 32768), so both
      backends are exact. The identities: `x << 1` is `x * 2`,
      `x >> 1` is `floor(x / 2)`, `x & 0xFFFF` is `mod(x, 65536)`, the
      top bit of a word is `floor(w / 32768)` and the bottom bit is
      `mod(w, 2)`. The eight masks are not translated one by one. The
      shader ORs in mask 4L+2C+R exactly when bit 4L+2C+R of the rule
      is set, so the new state of a cell IS bit 4L+2C+R of the rule,
      and the place value 2^(4L+2C+R) is the product
      (1+15L)(1+3C)(1+R) over the three neighbour bits, which needs no
      pow and no table. The population count of `nw ^ row` is counted
      where the new bit differs from the old, one cell at a time,
      which is the same number.
notes: THE COST. Bit-parallel becomes bit-serial: three nested orbits,
       rows then words then bits, 128 cell updates per row against the
       shader's four word updates. At DEPTH 9 that is 512 * 128 =
       65,408 innermost steps for a point that draws the deepest row.
       Nothing was dropped or approximated to avoid it; smoke's 80,000
       points run in 29 s. This is the plate the orbit block body was
       built for, and it is the first three-deep nest in the set.
       THE SEED ROW IS THE ONE SUBSTITUTION. The shader addresses it
       with a hashu chain off the WORLD lever and the tile's own rule
       number (`sa = hashu(world ^ rule*668265263u ^ 0xA11Cu)`, then
       `sa = hashu(sa)` per seed), and the vocabulary cannot hash - it
       is the blocker nodal was stopped on. It CAN address, though:
       s.vnoise at whole integer coordinates has both interpolation
       weights vanish and returns the lattice corner hash itself, a
       pinned per-index value drawing nothing from the stream, which
       is exactly what "every point that lands on this tile must grow
       the same automaton" needs. Seed s of the tile for rule r under
       WORLD w reads s.vnoise(r, 16w + s, 0). The 64 * 16 (WORLD, seed)
       pairs land on 1024 DISTINCT lattice rows after the primitive's
       & 1023 (checked: 1024 of 1024), so nothing aliases, and rule
       0..255 is inside the mask on the other axis. What comes back is
       the corner hash minus 0.5 rounded to f32, so `+ 0.5` recovers
       it to within one ulp - plenty for an index into 128 cells, and
       the same class of float-to-int hazard the shader's own
       `int(u2f(sa) * 128.0)` already carries.
       Seeds collide (16 seeds on 128 cells is more likely than not to
       collide at SEEDING 16) and the shader ORs, so the bit is added
       only where it was not already standing; a plain sum would have
       carried into the next cell.
       DRAW ORDER, source order, unchanged from the shader: the two
       axis picks, the row, the cell, then fox and foy, then the slab.
       `rnd.y` becomes the seventh draw. The three declines are the
       shader's three far sentinels, in the same places: an empty
       window, a tile with no visible row or cell, and a dark cell.
       Declines are the majority (about 60 percent at defaults) and
       that is the subject - most cells of most automata are dead.
       No s.window. The vocabulary's window computes the same thing
       (span/heart/magnify/unit map onto this plate exactly, ctr
       585728, heart 1064960 by 122880), but it exposes only .seat, and
       this plate needs win.x through win.w four more times, for the
       per-tile clipped extents and the row and cell clipping. So the
       loupe is written out in floats. Its one truncation of a negative
       value, `int(float(heart.y - ctr.y) * (1 - 1/mag))`, is a
       subtracted floor rather than a floor, since GLSL's int()
       truncates toward zero and the y offset is always negative here.
       exp2 arrives as Math.pow(2.0, P.magnify), which pins to
       det_pow(2.0, x) = det_exp2(x * det_log2(2.0)). det_log2(2.0) is
       exactly 1.0 by inspection of core/detlib.glsl.template (e = 1,
       m = 1, s = 0, and the return is fma(0, LOG2E, 1.0)), so this is
       the same det_exp2 the window vocabulary would have emitted.
       2^DEPTH is reached by doubling in an orbit rather than by a
       power, so the row pitch that divides 65536 is exact by
       construction rather than by trust.
       LAWFULLY EMPTY ABOVE MAGNIFY 11. Tile weights are counted in
       cells (`>> 9`), so once the window is narrower than one cell's
       512 units every weight quantises to zero and the sheet declines
       everything. That threshold is the plate's, not the walk's: the
       literal transcription empties at the same MAGNIFY 11.25, 0
       decline mismatches on either side of it. Smoke would WARN, not
       fail, if a hashed setting landed there.
       Cross-check (scratchpad, this session): the walk against a
       literal f64 transcription of the plate's GLSL, using real JS
       uint arithmetic (>>>, ~, Math.imul) for the four-word toll and
       the shader's own rsp_pop, both driven from one recorded draw
       tape, with the seed positions shared so that everything
       downstream is compared rather than the one substituted
       convention. 5 settings x 4000 points, covering DEPTH 5/7/8/9,
       MAGNIFY 0/1.5/5.25, SEEDING 1/5/11/13/16, WORLD 1/5/7/41/64:
       8536 deposits compared field by field, worst absolute delta
       1.110e-16, worst relative 8.853e-15, 0 decline mismatches. Two
       of the five settings were bit-equal in every field.
       Negative control fired on all four planted faults: km 2.85 ->
       2.8501 (5.0e-5), cell fill 0.94 -> 0.9401 (1.2e-7), heat gain
       2.6 -> 2.61 (8.2e-3), palette hue 0.62 -> 0.6201 (4.4e-4).
       Coverage of the cross-check, measured rather than assumed: at
       DEPTH 9 over 60,000 points, 27,330 deposits compared, 242 of
       256 rules reached, deepest row evolved 511, largest activity
       count 4096 which is the maximum 32 rows * 128 cells, worst
       delta 0.000e+0. The 14 rules never reached are exactly the
       annihilating ones (0, 8, 32, 40, 64, 96, 104, 128, 136, 160,
       168, 192, 200, 224); they deposit nothing in the shader either.
       So the toll was checked separately and exhaustively: driving
       the walk from a SCRIPTED stream fixes the tile, the row and the
       cell, and sweeping the cell over 0..127 reads the positive's
       whole 128-bit ring back out from the outside (deposit is live,
       decline is dead). All 256 rules at rows 1, 2, 3 and 32, at
       SEEDING 13: 131,072 cells compared, 55,895 live, 0 rings
       differing. Negative control on that check: giving the
       transcription's toll `rule ^ 4` breaks 252 of 256 rings (the
       four survivors are rules whose neighbourhood 010 never occurs
       on that seed row within three steps).
       Emitted GLSL scope-linted in both variants, since neither gate
       compiles GLSL and a three-deep nest's one real hazard is an
       inner local escaping its brace scope: 0 out-of-scope uses in
       the walk body of either variant.
       Levers, cam, gain and accent diffed programmatically against
       the plate: all eight labels, mins, maxes, steps and defaults
       match, as do cam, gain 0.5 and accent #c9b8ff.
       Note for the bench: smoke's own hashed lever settings leave
       DEPTH and SEEDING at their defaults, so smoke never exercises
       DEPTH 9 or a multi-seeded row. Those live only in the
       cross-check above. Not volumetric - the sheet is a plane, one
       deposit per live cell, with a 0.02 slab of jitter in z.
