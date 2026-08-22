# wave: converted
plate GLSL lines: 17   positive lines: 45
gaps: none
notes: The source loop (fixed bound 6, break at float(j) >= P[0])
       becomes sum(P.sources, ...); the emitter reproduces exactly
       that break against the rounded integer lever. The sum's term
       is one expression, so the source bearing fa appears four times
       and the distance r twice where the shader bound each once; the
       subset gives an arrow no bindings, the repeats are pure, and
       both evaluators compute identical values (this is the one
       draw-order-free duplication, not a divergence risk). The
       emitted GLSL therefore carries one very long accumulator line;
       any GLSL compiler will CSE it. No draws, no glow (rnd unused).
       Levers/cam/gain/accent diffed programmatically: match. Smoke
       passes with zero declines; a literal JS port of the shader
       matches the walk to 4e-16 over 3 settings x 4000 points.
