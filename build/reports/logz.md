# logz: converted
plate GLSL lines: 17   positive lines: 45
gaps: none
notes: A pure coordinate map, no draws, no loops; the walk takes the
       4-param form for q and t. The plate never reads rnd, so there
       is no glow term. The second lever's label is copied verbatim
       including the Unicode ("ℂ² ROTATION"); the lever table, cam,
       gain, and accent were diffed programmatically against the
       plate and match field for field. Emit and smoke pass, zero
       declines. Beyond smoke, the walk was compared point for point
       against an independent literal JS port of the shader (GLSL-spec
       mix) over 3 lever/clock settings x 4000 points: worst delta
       2e-14, and the comparator flags a deliberately perturbed
       constant at 2e-2, so the match is meaningful.
