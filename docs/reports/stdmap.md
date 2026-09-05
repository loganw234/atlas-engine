# stdmap: converted
plate GLSL lines: 28   positive lines: 72
gaps: none
notes: Rotor and tangent live in one orbit record {th, p, ux, uy,
       acc}. The shader binds per-step locals (c, ddp, ddth, nl); an
       orbit step holds no statements, so those bindings are inlined
       into the next-state fields as the same expression trees in
       the same order: ddp = uy + (K*cos(TAU*th))*ux, ddth = ux +
       ddp, nl = length(vec2(ddth, ddp)), then ddth/nl, ddp/nl, and
       acc += log(nl + 1e-9). The norm expression is therefore
       written out three times (ux, uy, acc fields); identical
       arithmetic, just repeated. The state sequencing is the
       shader's exactly: p advances with the old theta and theta
       with the new p, written as the nested
       fract(th + fract(p + (K/TAU)*sin(TAU*th))). The tangent seed
       normalize(rnd.xy - 0.5 + vec2(1e-3, 7e-4)) becomes jitter2
       (same law) plus the verbatim nudges, over Math.hypot, which
       emits length(vec2(...)). ftle divides by P.iters where the
       shader divides by float(N), N = int(P[1]); equal for snapped
       integer lever values. Flat-to-torus is componentwise mix with
       R = 1.2, rr = 0.5 verbatim.
