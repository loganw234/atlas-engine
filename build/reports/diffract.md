# diffract: blocked
plate GLSL lines: 230   positive lines: 0 (no positive written)
gaps: two, independent, and both were confirmed against the emitter
      rather than guessed. Either one alone blocks the plate.

      GAP 1. A frame-constant hash of the clock. Every arm of this
      plate reads qs, not q:

        uint fh = hashu(uint(mod(max(uT, 0.0)*997.0, 16777216.0)) + 0x9e3779b9u);
        vec2 qs = fract(q + vec2(u2f(fh), u2f(hashu(fh))));

      This is a Cranley-Patterson rotation: ONE uniform shift per
      frame, shared by every point, so the R2 lattice keeps its
      stratification exactly and only slides. The vocabulary has no
      way to say it. hashu and u2f are not in the subset (`emit:
      unsupported call`); there are no bit operators, as the collatz
      conversion already recorded; and the clock cannot even become an
      integer to index anything, because Math.trunc is admitted only
      as trunc(int / int) (`emit: Math.trunc is only in the subset as
      trunc(int / int)`). The one hashing object the vocabulary does
      expose, an Address, is reachable only through s.descend, and
      s.descend refuses a lever or a literal as its level count
      (`emit: descend levels must be an int`, then `emit: descend
      cannot bound its loop: levels must come from s.depth or carry a
      lever maximum`), so the only admissible depth is s.depth(...),
      which is a per-point stream draw. Every road to a hash in this
      notation runs through the per-point stream.

      Substituting s.u() is NOT the brief's "differs in value but not
      in law" case. The shift is a sampling law, not stochastic
      texture: it translates the whole point set rigidly. Measured
      over 20000 points binned into 64 bins of qs.x, the quantity
      that sets the screen coordinate in every arm: the plate's
      rotated R2 sample gives chi-square 0.2 with the worst bin 0.5
      percent off uniform; a per-point draw gives chi-square 70.5
      with the worst bin 17.1 percent off. Same marginal, visibly
      different grain, and the caption sells that grain ("Raise
      TRAILS and the fringes assemble grain by grain"). Needed: a
      frame-constant given, or a hash primitive over the clock.

      GAP 2. Iteration with carried state inside another iteration.
      APERTURE 4, the Poisson-Arago disk, is a 160-node quadrature
      whose integrand calls a Bessel series that is itself a
      ten-term recurrence:

        for(int j = 0; j < 160; j++){
          float t   = 1.0 + (float(j) + 0.5)*dt;
          ...
          float al  = TAU*NF*W*sqrt(max(t, 1.0e-6));
          E += (g*diffract_J0(al))*ph;
          ph = cmul(ph, rot);
        }

        /* inside diffract_J0 */
        for(int k = 0; k < 10; k++){
          float kf = float(k) + 1.0;
          term = -term*y/(kf*kf);
          s += term;
        }

      Both loops carry state, so both are orbits, and orbits do not
      nest: s.orbit inside an orbit step is refused (`emit: s.orbit is
      not in the subset`), and an orbit step body must be a single
      expression, so the series cannot be written as statements either
      (`emit parse: expected id, got =`). sum() DOES nest inside an
      orbit step, confirmed, but sum wants a closed-form term and
      these are recurrences: term_k = (-y)^k/(k!)^2 needs a factorial
      and a power of a negative base, neither in the vocabulary, and
      computing it that way would be different arithmetic from the
      shader's, which the brief forbids. The outer accumulation is
      equally a recurrence, deliberately: the plate advances the phase
      by one complex multiply per step "instead of a sin/cos", so
      ph_j = (cos(p0 + j dph), sin(p0 + j dph)) is a re-derivation,
      not a restatement.

      Two hand-compilations exist and I did not take either. Unrolling
      the ten-term series into one expression inside the orbit step is
      about 3KB of nested arithmetic per site, written twice (init and
      step), and no reader could check it against the shader. Fusing
      the two loops into a single 1760-step machine keyed on k % 11
      would work, and is entirely unreadable. The brief's forbidden
      result is a positive that silently says something different from
      its shader, and both of those are the shape of that mistake.
      Needed: either nested orbits, or statements (local bindings)
      inside an orbit step.

notes: What DOES convert, for whoever picks this up once the gaps
       close. The scenery arm (rnd.z < 0.04, the aperture plane at
       z = -1) and APERTURE 0, 1, 2 are plain arithmetic: sinc2 and
       the N-slit array factor are both single expressions with a
       removable singularity guarded by a ternary, no draws inside,
       so they inline directly. diffract_af is called at two sites
       with different N, so it repeats twice inline, the tpms
       pattern. APERTURE 3 needs diffract_J1, whose ten-term
       recurrence IS a single top-level orbit and emits cleanly; I
       verified that shape against the emitter (`OK top-level
       recurrence orbit`). Only APERTURE 4 needs the nesting. So GAP 2
       costs one arm of five; GAP 1 costs the whole plate.

       Draw mapping, when it is written: rnd.z gates the scenery
       (< 0.04) and later picks the sampling branch; rnd.x picks
       uniform against Rayleigh in both 2D and 1D arms; rnd.y is the
       Gaussian's angle in the 1D arm. Three draws, all texture, all
       free to become s.u(). The plate's far sentinel is -999 (three
       sites: the opening between bars, rad > L, |s| > L), which is
       s.decline() by the registry contract.

       Not volumetric. Every arm seats its point on a plane: z = -1
       for the aperture scenery, z = 0.6 for the screen. Two flat
       sheets, so a normal point budget would do.

---

# diffract: converted
plate GLSL lines: 230   positive lines: 318
gaps: none. Both blockers above have closed, and each closed on a
      construct that did not exist when that report was written. The
      reasoning above was right at the time; it is superseded, not
      wrong.

      GAP 1, the frame-constant hash, is s.vnoise read at WHOLE
      integer coordinates. Its interpolation weights are exactly zero
      there, so the call returns the lattice corner itself: a pinned
      hash of (cell, octave) that takes nothing from the stream and so
      answers every point of a frame identically, which is the one
      property a per-point draw could never have. The index handed to
      it is the plate's own, floor(mod(max(t, 0)*997, 16777216)), and
      it is split across both lattice axes (x = index, y = index/1024)
      because the lattice wraps every 1024 cells and the index runs to
      sixteen million. The two octaves are 0x9E37 and 0x79B9, the
      halves of the golden-ratio constant the shader salts its own
      hash with.

      GAP 2, iteration with carried state inside another iteration, is
      an orbit inside an orbit step with a BLOCK body. APERTURE 4 is
      the exact shape the block body was added for: s.orbit(160, ...)
      carrying (ex, ey, phx, phy), and inside its step an s.orbit(10,
      ...) carrying (term, acc) for the J0 series, reached through a
      plain if/else on the ax < 5 join. Neither hand-compilation the
      earlier report rejected was needed, and nothing was unrolled.
      Confirmed in the pinned emission: the 10-step loop opens at line
      254 inside the 160-step loop spanning 229-295, and no float,
      vec2 or vec3 local anywhere in that nest is unqualified.

notes: THE ONE SUBSTITUTION, AND WHAT WAS MEASURED. The frame shift is
       the only quantity that is not the shader's own arithmetic. The
       plate takes hashu(uint(...) + 0x9e3779b9) and this takes two
       vnoise lattice corners, so the shift VALUE per frame differs.
       What had to survive is the law, since GAP 1 was refused
       precisely because a per-point draw changes the law. Measured
       the way the earlier report measured it, 20000 points binned
       into 64 bins of qs.x, the quantity that sets the screen
       coordinate in every arm:

         t        plate hashu   s.vnoise    per-point draw
         0        chi2 0.17     chi2 0.15   chi2 58.41
         0.37     chi2 0.19     chi2 0.15   chi2 58.41
         1.70     chi2 0.18     chi2 0.16   chi2 58.41
         4.25     chi2 0.20     chi2 0.20   chi2 58.41
         11.30    chi2 0.21     chi2 0.17   chi2 58.41

       Worst bin 0.5 to 0.8 percent off uniform for both rotations and
       12.6 percent for the draw. The vnoise shift is also constant
       across every point of a frame and across any number of prior
       stream draws (checked on 15000 points at three clocks), gives
       4000 distinct shifts over 4000 consecutive frames at 60 fps
       exactly as the plate's own hash does, and has a
       consecutive-frame correlation of -0.013. So the stratification
       slides and stays; the grain the caption sells is the plate's.

       THE CROSS-CHECK. The plate's GLSL was transcribed literally
       into JS (all five helpers and the whole shape body), the walk
       driven by a draw-recording stream, and the transcription
       replayed on the same draws with the walk's own frame shift
       injected for the one substituted quantity. Nine settings
       covering all five APERTURE arms and clocks 0 to 11.3, 4000
       points each: 35828 deposits compared, 0 decline/deposit
       disagreements, worst relative difference 0.000e+0 on every
       field. Bit-identical rather than merely close, because the
       association was copied as well as the constants.

       The comparator was validated against six planted faults, one
       per helper plus one global: 0.28 in wl2rgb (3854 fields), the
       6.0 in the sinc2 series (24 fields), the ax < 5 join in J0
       (15453), the (kf+2) denominator in the J1 recurrence (15054),
       the 60.0 phase budget in arago (34560), and the 0.9 in lift
       (107484). All six fired. A check that cannot see a planted
       fault is not evidence, and this one can see faults in both
       nested loops.

       ASSOCIATION IS COPIED, NOT JUST CONSTANTS. col = tint*(inten/
       max(pdf,1e-6))*K*lift is a vec3 times three scalars in source
       order, so it is written mul3(mul3(mul3(tint, bright), K),
       lift). Folding the scalars first would have been an ULP off and
       the cross-check would have said so. Same reason E *= 0.5*dt is
       E.ex * (0.5 * dtq).

       GUARDS: NONE ADDED. Every branch the shader writes as if/else
       is an if/else here rather than a ternary, so no dead arm is
       ever evaluated and there was nothing to bound. diffract_af's
       early return became the inverted guard if(abs(sp) >= 1e-4),
       same values. diffract_sinc2 keeps its two ternaries because the
       plate already made its divisor never zero. The only constant in
       the walk that is not the plate's is 0.0009765625, which is
       2^-10 and belongs to the frame-index split, not to the optics.
       A lever-corner sweep (five arms x three corners of all seven
       levers x seven clocks including -5 and 3600, 63000 points)
       found 0 non-finite fields and a largest field magnitude of 5.8.

       DRAWS. Three, spent unconditionally at the top of the walk in
       the shader's z, x, y order so no arm can change what a later
       arm sees: uz gates the scenery at 0.04, ux picks uniform
       against Rayleigh in both the 2D and 1D arms, uy is the
       Gaussian's angle in the 1D arm. All texture, all lawfully
       s.u(). The emitted plate therefore reads its own stream rather
       than rnd.zxy, which is the usual trade.

       ARMS. Scenery (uz < 0.04, the aperture plane at z = -1) and
       APERTURE 0, 1, 2 are plain arithmetic as the earlier report
       predicted. diffract_af is called at two sites with different N
       and is written out twice, the tpms pattern, under two separate
       ifs rather than an if/else because the shader uses two separate
       ifs. APERTURE 3 is one top-level 10-step orbit for J1.
       APERTURE 4 is the nest. The far sentinel -999 appears at three
       sites (an opening between the bars, rad > L, |s| > L) and all
       three are s.decline().

       ONE THING TO WATCH, and it is the plate's own. The frame index
       is a floor of t*997, so a last-place difference in that product
       changes the whole frame's shift, not one point's. The shader
       has exactly the same sensitivity through uint(mod(uT*997,...)),
       so this is inherited rather than introduced, but a frame-level
       picture diff that disagrees wholesale while every arm agrees
       bit for bit is this and nothing deeper.

       NOT VOLUMETRIC, confirming the earlier report. Every arm seats
       its point on a plane, z = -1 for the aperture scenery and
       z = 0.6 for the screen. Two flat sheets, so a normal point
       budget is right and no shot-noise allowance is needed.
