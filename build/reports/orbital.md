# orbital: converted
plate GLSL lines: 47   positive lines: 97
gaps: none
notes: The seed-chained Gamma sampler (kG = 2l+3 exponential draws
       with an early break) is an orbit of literal bound 9 drawing
       once per step, a carried j field standing in for the shader's
       loop index since a computed kG cannot be an orbit bound. Same
       law as the hashu chain on seed, different hashes. The Laguerre
       helper is a two-step orbit seeded L0 = 1, L1 = 1 + a - x with
       the recurrence verbatim; the p <= 0 early return of the helper
       is a pure ternary that ignores the orbit's landing (the orbit
       still runs, drawless, in both backends). The Ylm table is the
       shader's nested ternary chain restated on snapped floats; the
       quantum-number clamps (l under n, m within the l band, the
       away-from-zero rounding of m) are verbatim. The rejection
       rnd.w > amp*amp*P[4] is a u() draw hoisted into a plain if,
       declining where the plate returns its -999 far sentinel (this
       family's sentinel is vec3(0, -999, 0), not -20000; decline is
       the restatement either way). Declines in smoke are the
       rejection sampler working: 30 to 92 percent depending on
       DENSITY, deposits stay above the gate at every checked
       setting. Levers verbatim including the unicode "ℓ (subshell)"
       label; cam, gain, accent copied.
