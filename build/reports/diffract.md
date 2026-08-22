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
