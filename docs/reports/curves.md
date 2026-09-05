# curves: converted
plate GLSL lines: 27   positive lines: 85
gaps: none
notes: The plainest of the three. Four MODE arms as an if/else-if chain
       on floor(P[0] + 0.5) compared against 0.5, 1.5 and 2.5, each
       writing one let-bound triple, and a single deposit after. Each
       arm keeps its own sweep parameter (named th here, since the
       shader's local t is not the clock); the walk takes the 3-param
       form because the plate reads q and never reads uT, as bulb and
       tpms do.
       rnd.xyz is three centered draws in source order, taken outside
       every branch exactly where the shader adds them, so all four
       arms spend the same three draws. No draw sits in a ternary or
       behind a short circuit, and no expression holds two draws.
       Every constant is verbatim, including the grouping: the arms
       that end in vec3(...)*0.9 multiply each component by 0.9
       separately, and the hypotrochoid's third component is written
       0.0 * 0.9 rather than 0.0 so the vector-times-scalar shape stays
       visible. The seat keeps the shader's own grouping too,
       (c + jitter*TUBE)*SCALE rather than c*SCALE + jitter*TUBE*SCALE.
       Cross-check (scratchpad, this session): the walk against a
       literal f64 transcription of the plate's GLSL on one recorded
       draw tape, 4000 points x 8 settings, two per MODE arm. 32000
       deposits compared field by field, worst relative delta 0.000e+0,
       every field bit-equal. Negative control fired in all four arms:
       one constant perturbed per arm (the harmonograph's damping
       0.02, the spirograph's rolling radius 0.15, the Lissajous
       quarter turn, the knot's tube radius 0.42) moved the worst delta
       to 8.4e-1.
       Levers, cam, gain and accent diffed programmatically against the
       plate: all match, labels included ("FREQ A / r" and its two
       siblings verbatim). Smoke passes 4/4 with zero declines, which
       is right for a shader with no far sentinel.
       Not volumetric: each MODE is a one-dimensional curve given
       thickness by TUBE, at most 0.1 world units before SCALE, so the
       measure is a filament and not a cloud.
