# threebody: converted
plate GLSL lines: 112   positive lines: 253
gaps: none
notes: The same restructure flows needed, at four times the width. The
       state is twelve floats and every Runge Kutta stage reads the one
       before it, so each step becomes eight passes of the orbit: an
       evaluating pass reads the three softened pairwise terms at the
       probe and leaves them in fA, fB, fC, and an advancing pass spends
       them. Keeping the pair terms rather than the three accelerations
       is what makes the walk readable: the shader's own
       `a11 = fA - fC; a21 = fB - fA; a31 = fC - fB` then appears as
       written, each pairwise term is transcribed exactly once, and the
       twelve force evaluations per step match the shader's twelve. The
       orbit carries 45 float fields, which is a lot to look at but
       emits to 264 lines and 15.9 KB of GLSL, and the static bound is
       8 * 320 = 2560, exactly the shader's 320 step cap to the pass.

       Two accumulators run, one per order: cp weighs the probe
       velocities (the position derivative is the velocity itself, so no
       field is needed for it) and cv weighs the accelerations. Both
       visit 0, k1, k1+2k2, k1+2k2+2k3 and the fourth advance forms
       (c + 1.0*k4) inside `x + h/6.0*(...)`, so the shader's left to
       right sums and its two single scalings are reproduced without any
       reassociation. The cross-check measured exactly zero, which is
       the evidence that this is the same arithmetic and not merely the
       same formula.

       Both loop exits ride in one `until`: `j >= nst` at the top and
       the runaway guard `dot(p1,p1)+dot(p2,p2)+dot(p3,p3) > 1.0e6` at
       the bottom. Positions change only on the fourth advance, so the
       seven intermediate `until` tests repeat one that already passed
       and the test before each new step is exactly the shader's pair.
       The guard cannot fire on the initial condition either: both
       choreographies sit at radius about one.

       Three restatements to know about. `inversesqrt(s)` has no
       vocabulary spelling, so `d * (inversesqrt(s) / s)` becomes
       `d * (1.0 / sqrt(s) / s)`, which is the same value up to the two
       ULP that GLSL ES allows inversesqrt; every other engine plate
       already lives with a wider float32 to float64 gap than that.
       `int(P[0] + 0.5)` and `int(P[1] + 0.5)` become
       `floor(P + 0.5)` compared as floats, the move lyap made.
       And `any(isnan(pw)) || any(isinf(pw)) || dot(pw, pw) > 16.0`
       becomes the single test `!(pw.x*pw.x + pw.y*pw.y <= 16.0)`, which
       is not an approximation but exactly equivalent: a NaN fails the
       comparison, an infinity squares past the bound, and a finite pair
       inside the bound passes. This path is live, not theoretical. At
       MODE 1 with PERTURB 2 the Lagrange triangle really does scatter,
       and the cross-check found 19 points that both the walk and the
       literal port declined, with no case where only one of them did.

       `int(hb % 3u)`, the hash that picks which body to plot, becomes
       `s.pick(3)`: a uniform integer draw in [0, 3), which is what the
       modulus is in law. The twelve `rnd` and `hp` chain components of
       the PERTURB nudge become twelve `s.centered()` draws in the
       shader's own order, p1, p2, p3, v1, v2, v3. The walk takes the
       four parameter form because the shader reads `q.x` for the
       flight phase and `uT` to drift it. Levers, cam, gain and accent
       diffed programmatically against the plate: all match.

       Cross-check: a literal JS port of the plate GLSL replayed on the
       walk's own recorded draws, 6 lever and clock settings x 700
       points = 4200 deposits, every field compared, both MODE arms and
       both ends of STEPS and PERTURB. Worst relative delta 0.000e+0,
       exact in every setting, 19 mutual declines and zero
       decline-kind mismatches. Negative controls both fired in every
       setting: a perturbed initial condition (0.97000436 to 0.97000437
       on the eight, 0.5773502692 to ...93 on the triangle) and a
       perturbed Runge Kutta divisor (6.0 to 6.0000001) each drove the
       comparison to order one on the unstable triangle and to 1e-5 or
       worse even on the stable eight.

       Core moved under this conversion while it was being written. The
       mix and draw-temp changes do not touch this plate, but the
       Math.hypot retirement does: `length(v)` for the plotted body's
       speed is now `len2`, migrated by hand rather than by
       tools/migrate-hypot.mjs, which would have rewritten other agents'
       positives too. The sweep above is the run after all of that
       landed, transcription included, and still reads exactly zero.

       Volumetric: no. Every deposit lands on a plane, with the third
       coordinate carrying only the flight phase through TIME LIFT, so
       at the default TIME LIFT 0 the whole plate is a flat curve in y
       and at higher lift it is that curve extruded. Smoke sees it as
       y [0.00, 0.00] at defaults. Sampling should behave like a curve
       plate, not like bulb.
