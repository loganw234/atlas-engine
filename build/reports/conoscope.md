# conoscope: converted
plate GLSL lines: 115   positive lines: 179   emitted GLSL: 111
gaps: none blocking. One substitution: GLSL `radians()` is not in the
      vocabulary, so the three angle levers become `x * PI / 180.0`
      with the shared header's own PI. Measured cost below.
notes: No loops anywhere in this plate, so no orbit and no sum: the
       walk is one straight run from q, with all four helpers
       (conoscope_spec, conoscope_tilt, conoscope_az, conoscope_gam)
       inlined. conoscope_az appears three times (twice in the biaxial
       arm, once uniaxial) and its early return becomes the ternary
       `(px*px + py*py < 1.0e-12) ? 0.0 : atan2(py, px)`; no draw is
       involved, so the emitter is content. conoscope_tilt on the z
       axis collapses to (0, -sin tilt, cos tilt), which is what the
       helper computes for that argument and is written out as such.

       Two CRYSTAL arms, split on `Math.floor(P.crystal + 0.5)`
       compared against 2.0 as a float, the shader's int(P[0] + 0.5)
       (the rmt pattern). Inside the uniaxial arm the calcite/quartz
       index pairs stay as ternaries on cry == 1.0, exactly as written.

       One draw only. The shader's `rnd.x` feeds a ternary
       (`(mono == 1) ? 589.0 : mix(400, 700, rnd.x)`), which would be a
       refusal, so the draw is hoisted to `const rx = s.u();` above the
       ternary. That is not a reordering: rnd is computed by the shared
       vertex header for every point whether the arm reads it or not.

       No far sentinel in this plate and none in the walk: zero
       declines, 20000/20000 deposits on all four smoke rows. Points
       land on a spherical cap (a surface, not a volume), x and y
       inside [-0.95, 0.95] and [-0.20, 0.20].

       Colour is deposited as `col` times `glow`, with glow carrying
       I*vig*(0.55 + 1.15*GLOW) and col carrying the spectrum times its
       own dimming factor. That reassociates nothing: the emitter
       writes `col = col * glow` and the shader writes the same product
       in the same order.

       Identity probe: a literal f64 transcription of the plate's GLSL,
       replayed on the walk's recorded draws, agrees BIT FOR BIT
       (worst |delta| 0.000e+0, worst relative 0.000e+0) over 5 lever
       settings x 4000 points covering all three CRYSTAL values, MONO
       both ways, TILT at 0 / 8.5 / 22.5 / 40, and THICKNESS at both
       ends. Three negative controls fired: perturbing the cap angle
       0.78 by 1e-4 diffs at 9.6e-5 absolute, perturbing the spectrum's
       0.28 by 0.01 diffs at 9.0e-3, and perturbing the biaxial 0.12 by
       0.001 diffs at 4.4e-1.

       Re-run after commit 218ef3a moved the core mid-session (draws
       now bound at their site, mix re-associated to GLSL's
       x*(1-a) + y*a): still bit for bit, with the comparator's mix
       switched to the GLSL form as well. The mix here is
       mix(400, 700, rnd.x) and it is exact under both associations
       because u2f hands back a float32, so 300*u and 400*(1-u) and
       700*u all fit their sums without rounding. A plate mixing wider
       values would not be so lucky, which is worth knowing.

       The radians substitution, sized: rerunning the transcription
       with the true pi instead of the header's PI (3.14159265359)
       moves the deposit by at most 8.9e-12 absolute, 9.5e-8 relative,
       and only at TILT 40 with THICKNESS 300, where the retardation
       phase is around 550 radians and amplifies everything upstream of
       it. At TILT 0, the default, the two are identical because
       0*anything is 0. On the GPU this sits below the f32 rounding the
       plate already carries in a phase that large, but a reader
       chasing a last-digit difference in the ring positions at extreme
       TILT should look here first.

       Levers/cam/gain/accent copied verbatim from the plate, same
       count, same order, same labels ("AXIAL ANGLE" and "MONO"
       included).
