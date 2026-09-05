# flows: converted
plate GLSL lines: 58   positive lines: 164
gaps: none
notes: The whole plate is one Runge Kutta integration, and the only
       thing that would not translate directly is the shape of the
       inner loop. `flows_deriv` is called four times per step and each
       call reads the previous call's result, but an orbit step is one
       expression per field and cannot bind a local, so a literal
       inlining of k1..k4 nests the six armed field chain three levels
       deep. Measured on the arms as written, that is roughly 1.7 MB of
       GLSL for the x field alone (each field component substitutes its
       three arguments about twenty times, and 20^3 compounds), so it
       is not a size worry, it is impossible. The walk spends eight
       passes on each Runge Kutta step instead: four evaluating passes
       read the field once at the probe and store it in kx, ky, kz, and
       four advancing passes spend that reading, weigh it into the
       accumulator and choose the next probe. Consequences worth
       knowing: the derivative arms are written exactly once in the
       source (the lowest transcription risk of the shapes I tried),
       the emitted GLSL is 108 lines and 7.2 KB, and the loop's static
       bound is 8 * 380 = 3040 with the same twelve field evaluations
       per step the shader makes. The orbit runs at most 380 completed
       steps, exactly the shader's `for(int j = 0; j < 380; j++)` cap,
       because 3040 passes is 380 steps to the pass.

       The accumulation is bit exact, not merely equivalent. Starting
       from a = 0 the advancing passes visit 0 + 1.0*k1, then
       k1 + 2.0*k2, then (k1+2k2) + 2.0*k3, and the fourth advance
       forms (a + 1.0*k4) inside `x + dt/6.0*(...)`. That is the
       shader's own left to right sum and its single scaling, so no
       reassociation enters; the cross-check below measured exactly
       zero difference, not a small one, which is the tell that the
       arithmetic is the same and not just close.

       Both of the shader's loop exits ride in one `until`. The shader
       tests `float(j) >= steps` at the top and `dot(s,s) > 1.0e6`
       after the update; `until` runs before every pass, but n and x
       change only on the fourth advance, so the seven intermediate
       tests repeat a test that already passed and the test before each
       new step is exactly the shader's pair. The one test the shader
       does not make is the divergence guard on the initial condition,
       and it cannot fire there: `icS` is at most 24, so dot(s,s) starts
       under 1800.

       Two restatements to know about. `int(P[0] + 0.5)` becomes
       `floor(P[0] + 0.5)` compared as a float (sys == 0.0, sys == 1.0,
       ...), identical for lawful integer lever values and the same
       move lyap made. And `any(isnan(s)) || any(isinf(s))` has no
       vocabulary spelling, so the walk asks
       `!(abs(x) + abs(y) + abs(z) < 1.0e30)`, which is true for a NaN
       (the comparison fails), true for an infinity, and true for a
       finite magnitude past 1e30 where the shader would still deposit.
       That last band is the only disagreement and it is unreachable:
       9000 points per system across three settings including the
       (dt 0.02, STEPS 380, SPREAD 1) corner produced zero declines in
       every one of the six systems, because all six seeded clouds sit
       on bounded attractors. If the vocabulary ever grows an
       `isFinite`, this is the line to revisit.

       Everything else is verbatim. The five PARAM spans (rho, cc,
       Thomas b, Halvorsen a, Chua alpha), the Aizawa constant block
       and Chua's two slopes are hoisted out of the loop because they
       depend only on the lever, which changes no number. rnd.xyz and
       rnd.w become three `s.centered()` draws and one `s.u()` in that
       order; outC has a nonzero component only in z, so the walk
       carries `outZ` alone and the x and y `+ outC * 0.5` terms, which
       are literally plus zero, are dropped. The camera swizzle
       `vec3(p.x, p.z, p.y)` is written into the deposit's xyz. Levers,
       cam, gain and accent diffed programmatically against the plate:
       all four match.

       Cross-check: a literal JS port of the plate GLSL replayed on the
       walk's own recorded draws, 6 systems x 4 lever settings x 500
       points = 12000 deposits, every field compared. Worst relative
       delta 0.000e+0, exact in every system arm and with zero
       decline-kind mismatches. Negative controls both fired: a
       perturbed Chua slope (-1.143 to -1.1430001) moved system 5 by
       2.0e-2 and left the other five at zero, and a perturbed Runge
       Kutta divisor (6.0 to 6.0000001) moved all six, worst 2.7e-3 on
       Halvorsen.

       Core moved under this conversion twice while it was being
       written: mix became GLSL's own a*(1-t) + b*t, every draw now
       binds its own temp, and Math.hypot gave way to len2/len3. All
       three touch this plate (mix carries the five PARAM spans, and the
       speed reading is a three argument length), so the walk was
       migrated to len3 by hand rather than by tools/migrate-hypot.mjs,
       which would have rewritten other agents' positives too. The
       sweep above is the run after all three landed, transcription
       included, and it still reads exactly zero.

       Volumetric: yes, in the sense that matters for the picture
       check. The deposits fill a three dimensional cloud rather than a
       surface or a curve, and the SRB measure is very unevenly
       concentrated, so per-cell counts carry shot noise. It is not a
       rejection sampled volume like qjulia or bulb (nothing is thrown
       away, every point deposits), and the attractors are near two
       dimensional sets, so expect the correlation to sit between the
       surface plates and bulb, and to climb with point count.
