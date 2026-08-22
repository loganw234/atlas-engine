# chladni: converted
plate GLSL lines: 12   positive lines: 36
gaps: none
notes: A pure coordinate map, the simplest of the batch; 4-param walk
       for q and t, no draws, no glow (rnd unused). The degenerate
       mode pair, the Gaussian node highlight exp(-(f*f)*P3*P3), and
       the relief y = P4*f*cos(2.2 t) are verbatim. Lever key for
       "MIX ±" is pm; label copied exactly. Levers/cam/gain/accent
       diffed programmatically: match. Smoke passes, zero declines
       (the near-zero y span on hashed set A is RELIEF drawn to 0,
       lawful). A literal JS port of the shader matches the walk to
       4e-16 over 3 settings x 4000 points.
