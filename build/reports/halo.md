# halo: converted
plate GLSL lines: 155   positive lines: 272
gaps: none that block, three that cost words rather than meaning.

      (1) A vec3 has no components in this notation. emitMember serves
      .x and .y on a vec2 and nothing on a vec3, so a vec3 is an opaque
      value good only for col, for the vec3 helpers, and never for a
      seat, since deposit's xyz wants a literal three-element array.
      This plate is all vector geometry, so every vector rides as three
      named scalars, and cross products are written out. dot3 and
      Math.hypot are still used at every site where the shader says
      dot() and length(), because those emit the real builtins.

      (2) vec3 ternaries are refused (newton found the vec2 case). The
      plate has two: halo_basis's tangent pick and halo_snell's normal
      flip. Both became if/else on a let triple, which is what the
      brief asks for anyway and reads better than the shader.

      (3) No radians(). Written as (PI / 180.0) * degrees, which is
      the GLSL ES spec's own definition of the function. Measured
      cost: replacing it with the f64-exact pi/180 moves the worst
      field by 2.1e-12 relative over 20000 points, four orders below
      f32's resolution.

notes: The plate never reads uT. This walk takes (P, s, q) and has no
       clock, and smoke confirms it: defaults and defaults at t = 1.7
       give identical counts and identical mean luminance. It is a
       still subject.

       Three helpers are inlined. halo_spec and halo_ice are called
       once each. halo_basis is called at three sites (the sun frame,
       the wobble base, the c-axis) and halo_snell at two, so both
       repeat inline, the tpms pattern. halo_gauss is stochastic
       texture, a Box-Muller pair, and becomes two draws with the
       plate's own max(u1, 1.0e-7) guard kept.

       The shader names the light-propagation direction s, which is
       the stream's name here, so it is lx, ly, lz. The refraction
       normals keep their names.

       One deposit, five declines. The sun marker is an early return
       in the shader, so it becomes the if-arm of one if/else whose
       else holds the whole crystal, and the seat and colour are
       carried out to a single deposit. The four decline sites are
       early returns inside that else, which the emitter allows: the
       grazing-entry cut (dot(s, F1) > -1e-4), entry TIR, the
       "refracted ray must run toward face 2" cut, and exit TIR. The
       plate's sentinel is -999 and the registry contract emits
       -20000, both off-frustum, as tpms and buddha also recorded.
       Entry TIR can never fire physically, eta = 1/n < 1, but the
       test is kept because the plate keeps it.

       dot(s, F1) is computed three times in the shader, once before
       the face flip and twice after; the walk computes it twice, d1
       before and d2 after, and reuses d2 as the projected-area weight
       w = -d2, which is the shader's third computation of the same
       expression.

       Draw order, by arm: the sun gate always; then ORIENTATION 0
       spends two (z, azimuth), 1 spends three (the gauss pair, the
       roll), 2 spends four (its azimuth first); then FACE PAIR 2
       spends one on the 60-or-90 pick, use90 spends one on the basal
       sign, and the entry/exit swap always spends one. Different arms
       spend different counts, which is safe because both evaluators
       take the same branch for a given point.

       NOT volumetric, and measurably so: every deposit in every arm
       lands at |p| = 1.300000 exactly, over 20000 points at six lever
       settings. Sun marker and halo alike are directions normalised
       and scaled by 1.3, so the subject is a spherical shell. Budget
       it like a surface.

       Lawfully sparse corner: ORIENTATION 1 with WOBBLE 0, FACE PAIR
       1 and SUN ALT 0 keeps 315 of 20000, and 300 of those are the
       1.5 percent sun marker. With c exactly vertical and no wobble
       the basal-side pair cannot deliver a ray to the eye at that sun
       altitude, so the halo is empty and only the sun is left. This
       is the original's behaviour, not the restatement's: the
       cross-check at that setting agrees point for point, 57 kept of
       4000 and zero decline mismatches. Smoke's own four settings all
       clear the 5 percent gate at about 26 percent kept.

       Cross-check: a literal transcription of the plate's GLSL,
       replayed on the walk's recorded draws, over 5 configs x 4000
       points covering all three ORIENTATION arms, all three FACE PAIR
       arms, both Snell sites and the sun marker. Zero decline
       mismatches and zero field mismatches out of 20000 points. Worst
       |delta| 2.159e-14, and that residue is entirely the notation's
       own length() mapping: the transcription computed length as the
       spec's sqrt(x*x + y*y + z*z) while the walk says Math.hypot,
       which the emitter turns into length(). Transcribing length as
       Math.hypot too drops the worst delta to exactly 0 across all
       six fields and all 20000 points, so the restatement itself is
       bit-identical.

       Negative controls, both fired. Perturbing constants (the
       120-degree face offset 2.09439510 -> 2.09439511 and the ice
       index 1.3006667 -> 1.3006668) diffs 3404 of 20000 points at
       3.3e-5. Perturbing a branch threshold instead (the 90-pair
       pick, 0.30 -> 0.31) leaves the fields alone but throws 33
       decline mismatches, against zero in the clean run, so the
       comparator sees control-flow faults as well as arithmetic ones.
