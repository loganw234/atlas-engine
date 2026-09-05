# newton: converted
plate GLSL lines: 29   positive lines: 121
gaps: none, but the shader's inner cpow loop (z to the d-1, bound 4)
      has no nested-loop vocabulary inside an orbit step, and vec2
      ternaries are refused, so the power is unrolled per degree.
notes: Three MODE arms on the integer DEGREE lever (the brief's
      MODE-arm mapping), each arm one orbit with the identical update
      law and the power written as the exact cmul chain cpow
      accumulates: cmul((1,0), z) is bitwise z, so z^2 = cmul(z, z),
      z^3 = cmul(cmul(z, z), z), z^4 one deeper. z^d extends the
      derivative's chain by one factor, exactly cmul(zp, z). The
      convergence test is the shader's dot(f, f) < 1.0e-6 on the f of
      the state each step READ, checked after the update; the record
      carries f2 = |z^d - 1|^2 forward so until() sees it one step
      later, which reproduces the shader's stop one update PAST
      convergence, final z included. it = count - 1 when the final f2
      is under 1.0e-6, else K, covering convergence on the last
      allowed step. The init f2 = 1.0 is a sentinel, the one non-plate
      constant: it only suppresses a check the shader never makes
      before the first step. d is Math.floor(P.degree + 0.5), the
      shader's int(P[0] + 0.5) for positive values. The arm bodies
      repeat the chains inline because orbit steps are single
      expressions; ugly to read, bit-identical to compute. Emit
      passes (95 GLSL lines, only one arm's loop runs per point),
      smoke passes 4/4 with zero declines. Identity probe: against a
      literal f64 transcription WITH the cpow inner loop, every
      deposit bit-equal across 4 configs x 4000 points; a negative
      control (sim raised to z^d instead of z^(d-1)) diffs 99 percent
      of points, so the probe is sensitive to exactly this structure.
