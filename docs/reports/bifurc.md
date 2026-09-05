# bifurc: converted
plate GLSL lines: 23   positive lines: 75
gaps: none
notes: The shader's one 600-pass loop (burn + extra iterations,
       recording past burn) is restated as two successive orbits:
       burn-in bound by the BURN-IN lever (static 500), then the
       recorded tail seeded from the burn-in's final x. The tail
       length floor(rnd.y*60) becomes s.pick(60), same law, and
       since an orbit bound cannot be a runtime draw, the tail orbit
       runs at literal bound 60 with an until on a step-counter
       field n; count then equals the recorded cnt, and
       lam = acc / max(count, 1.0) as in the shader, including the
       extra = 0 case where lam = 0. The MAP arms are the shader's
       if/else on int(P[4]+0.5); an orbit step holds no statements
       and bool-armed ternaries refuse, so they became the
       equivalent float-leaf ternary chain compared against the
       snapped MAP lever with float equality (mt == 0.0, mt == 1.0);
       identical for lawful lever values 0, 1, 2. The sine and tent
       rates rs = r*0.25 and mu = r*0.5 are hoisted out of the loop
       (the shader recomputes them per pass; loop-invariant, same
       values). Derivative and map formulas verbatim, including
       log(abs(d) + 1.0e-9). The x-record stays in [0, 1] for all
       three maps at r <= 4, so the burn-in orbit needs only {x}.
