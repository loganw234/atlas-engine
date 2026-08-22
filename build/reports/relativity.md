# relativity: converted
plate GLSL lines: 39   positive lines: 109
gaps: none
notes: The lightest of the three flow plates and the only one that did
       not need a two pass Runge Kutta step. The whole derivative is the
       probe's own w and `3.0*u*u - u`, so recomputing it costs four
       short copies rather than a field and a second pass. Each step is
       four passes of the orbit, one per stage: the pass weighs its
       reading into the running sum and chooses the next probe, and the
       fourth commits. Nine float fields, 64 lines of GLSL, static bound
       4 * 360 = 1440, which is the shader's 360 step cap to the pass.
       The two sums visit 0, k1, k1+2k2, k1+2k2+2k3 and the fourth pass
       forms (c + 1.0*k4) inside `x + dphi/6.0*(...)`, exactly the
       shader's left to right sum and its single scaling; the
       cross-check measured exactly zero, not a small number.

       The interesting piece is `dead`. The shader carries a flag set
       inside the loop after an update, and the flag is the whole
       difference between a drawn ray and a hidden one. It restates as a
       final state test: u and w move only when a step closes, so if the
       loop ran to its count then the last update passed both tests, and
       if it stopped early then the final state satisfies one of them.
       So `dead` after the walk is exactly
       `u > 0.47 || (w < 0.0 && u < 0.0285714)` read off the orbit's
       result, with no need for `.escaped` (which would also be true of
       the ordinary `j >= k` exit). The arriving ray cannot trip either
       test, since u always starts at 1/30, which is why the `until`
       may carry both tests even though the shader does not check them
       before the first step. `phi` rides as a state field rather than
       being reconstructed as phi0 + n*dphi, because the shader adds
       dphi once per step and repeated addition is not the same float as
       one multiply.

       This plate legitimately declines most of its points: 58 percent
       at defaults, 64 percent across the cross-check sweep. That is the
       subject, not a fault. Rays that dive inside the horizon and rays
       that have already escaped past r = 35 are both hidden, and the
       shader's `vec3(0.0, -999.0, 0.0)` is the atlas's usual far
       sentinel, so `s.decline()` is the right spelling. The literal
       port declined exactly the same points, every time.

       Small restatements: `int(q.y*P[2])` becomes
       `floor(q.y * P.steps)`, identical because both factors are non
       negative, and `Math.trunc` is only in the subset as integer
       division. `rnd.z` becomes one `s.centered()` draw, taken after
       the decline as the shader takes it after its own early return.
       The shader's local `t` (the palette coordinate) is renamed `tc`
       in the walk because `t` is the clock. `col *= A * B` becomes the
       deposit's `glow`, which multiplies col in exactly that way.
       Levers, cam, gain and accent diffed programmatically: all match.

       Cross-check: a literal JS port of the plate GLSL replayed on the
       walk's own recorded draw, 5 lever and clock settings x 900
       points = 4500 cases, spanning both ends of BEAM CENTER and
       BEAM WIDTH plus a narrow beam parked on the critical impact
       parameter 5.196 where the winding is longest. Worst relative
       delta 0.000e+0, exact in every setting, 2865 mutual declines and
       zero decline-kind mismatches. Negative controls fired on both
       halves of the walk: perturbing the geodesic equation
       (3.0 to 3.0000001) moved the geometry in every setting, worst
       3.2e-5 on the near critical beam; and moving the two death
       thresholds (0.47 to 0.40, 0.0285714 to 0.031) produced 122
       decline-kind mismatches, which is the control that matters here
       because it is the `dead` restatement it tests. A first attempt at
       that control (0.47 to 0.4700001) flipped nothing and reported
       clean; u leaps well past the threshold in one step near the
       horizon, so the small perturbation was not a plantable fault
       rather than an invisible one.

       Volumetric: no, a shell. PLANE 3D tilts each ray's orbit plane
       about the beam axis, so the deposits sweep a two dimensional
       surface of revolution through three dimensions; at PLANE 3D 0
       they collapse to a plane curve family. Sampling should behave
       like a surface plate, not like bulb.
