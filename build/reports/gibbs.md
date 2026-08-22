# gibbs: converted
plate GLSL lines: 25   positive lines: 56
gaps: none
notes: The harmonic loop (k = 1..64, break when fk > nf + 1 at the
       top) is an orbit over state {fk, sn} with until restating the
       break: until checks before each step exactly where the shader
       checks before accumulating, so the term count is identical,
       including the clamp weight fading the last harmonic in. The
       parity gate odd is a ternary the shader binds once and uses
       twice; orbit fields are single expressions, so it is inlined
       into both the square and sawtooth coefficients, and the
       shader's (odd > 0.5) ? 1 : -1 is kept as written (comparing
       the inlined ternary against 0.5) rather than simplified to the
       equivalent direct condition. A = 0.75 is a walk-level const
       the arrows close over, like jong's dials. mod is the GLSL mod.
       No draws, no glow (rnd unused). Levers/cam/gain/accent diffed
       programmatically: match ("SQUARE↔SAW" verbatim). Smoke passes,
       zero declines; a literal JS port of the shader matches the
       walk to 2e-15 over 3 settings x 4000 points, including
       HARMONICS 64 with a moving phase.
