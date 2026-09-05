# lyap: converted
plate GLSL lines: 53   positive lines: 106
gaps: none
notes: The 424-pass loop (40 transient + STEPS charted) is two
       successive orbits, the recorded one seeded from the warm-up's
       final {x, m}. The step index mod the forcing period, m, rides
       as a state field advanced by mod(m + 1.0, per), because an
       orbit step cannot bind locals to recompute it from j; the
       values are the same exact small integers in both float32 and
       double, and after 40 warm-up steps oA.m is exactly 40 mod per,
       so the recorded pass continues the rhythm where the shader
       would. The six-way useA chain on SEQUENCE is the shader's
       chain restated with float leaves (a or b selected directly in
       each arm) since bool-armed ternaries refuse; it appears three
       times (warm-up x, recorded x, recorded acc), verbatim each
       time. int(P[0]+0.5) becomes float comparison against the
       snapped SEQUENCE lever (sq == 0.0, sq <= 2.0, ...); identical
       for lawful integer lever values. rnd.xy jitter and rnd.z
       start are jitter2 plus one u() draw, same law. Everything
       else is verbatim: the span clamp min(P[4], 4.0 - aLo), both
       2.4..4.0 rate clamps, the per-step iterate clamp to
       [1e-6, 1 - 1e-6], log(max(abs(r(1-2x)), 1e-12)),
       lam clamped to [-4, 4], and the whole colour grade.
       A native cross-check against a direct JS port of the plate's
       GLSL (1200 cases over all six rhythms) matched every deposit
       field bit for bit in doubles, as did the other four plates of
       this family.
