# wavecat: converted
plate GLSL lines: 188   positive lines: 223
gaps: none
notes: The shader binds Ai(x) as a helper and calls it from two of the
       three arms. There are no helper functions here, so rather than
       write the series twice the argument is settled first and the
       function evaluated once: the cusp arm returns before it, and the
       fold and the rainbow reach the same stanza differing only in
       what each calls s (sv here, since s is the stream). The wire
       coin the fold draws has to survive that stanza, and the subset
       has no boolean literal to declare a bool with, so it is carried
       as the float flag wrf and tested wrf > 0.5.
       The Airy power series is one orbit over {f, af, g, bg}. The
       shader writes af *= x3/D then f += af, so the new term is
       af * (x3 / D) with that grouping, and the record's f field
       repeats the whole product rather than reading the sibling af,
       which simultaneous update would give it one step stale.
       Pearcey's quadrature is one orbit carrying the abscissa one step
       ahead: tt is set from k + 1 and spent by the next step, so the
       window exp(-(t/T)^8) and the phase t^4 + X t^2 + Y t each read a
       single bound value instead of the closed form four and seven
       times over. The init is the shader's own it = 0 abscissa
       (-T + 0.5 dt, and (float(0) + 0.5) is exactly 0.5, so the two
       agree). The record also carries the step counter i, because
       until() sees only the record, and it is what the shader's
       `if(it >= NS) break` looks at; until checks before each step
       exactly as the break does, so the sum runs over exactly NS
       terms in the shader's own order. QUALITY is step 8, not step 1,
       so it cannot be an orbit's bound: the bound is the literal 256
       the shader itself loops to, and i does the breaking.
       The fold's length(dC) is written as Math.sqrt of the dot
       product rather than Math.hypot. Math.hypot emits length(), but
       on the CPU it runs a scaled algorithm that is more accurate than
       sqrt(dot) and therefore disagrees: over this arm's u in [-1, 1],
       sampled at 200001 points, the two differ on 68171 of them, worst
       4.4e-16. That is the same residue HEAD (218ef3a) just removed
       from length3, normalize3 and csqrt, and the Math.hypot mapping
       in the emitter still has it. Fourteen already-landed positives
       call Math.hypot; worth a sweep.
       The col ternary in the fold arm selects a vec3, which the
       emitter refuses (it cannot unify vec3 branches), so tn is
       declared as warm and reassigned in an if. The brightness
       ternary is a float and stays a ternary, as the shader wrote it.
       Colour products keep the shader's left-to-right grouping through
       nested mul3, including the rainbow's six-factor chain, which is
       laddered over three lines rather than folded into one scalar.
       No far sentinel is reachable in the cusp arm's field, and the
       three window clips are the only declines: 51 in 36000 sampled
       points, all in FORM 1 where the wire runs past the frame.
       Smoke passes all four rows with zero declines at defaults.
       Levers, cam, gain, accent diffed against the plate
       programmatically: match, six levers.
       Identity probe: a literal f64 transcription of the shader,
       replayed on the walk's own recorded draws, matches every deposit
       field bit for bit, worst |delta| exactly 0 over nine configs x
       4000 points (35949 deposits compared, 51 shared declines, 0
       decline mismatches) covering all three FORM arms, QUALITY 96 /
       160 / 256, FRINGE SCALE 0.3 / 1.0 / 2.0 / 2.4 / 3.0, DROP SIZE
       0.15 / 0.4 / 3.0, TINT 0 / 0.2 / 0.85 / 1.0 and t = 0 / 0.6 /
       1.1 / 1.7 / 2.9. Negative control fired three times, once per
       arm and each in its own arm only: 1.008 -> 1.0081 moves only
       FORM 0 (worst 2.7e-5), 3.29 -> 3.2901 moves only FORM 1 (worst
       1.6e-5), 3088.5 -> 3088.6 moves only FORM 2 (worst 1.5e-5). So
       the probe sees all three arms and is not reading one of them
       three times.
       Volume: not volumetric. All three arms are planar. FORM 1 sets
       y to exactly 0.0; FORM 0 and FORM 2 carry only a +-0.025
       jitter on y. Sampling can be budgeted as for a flat plate.
