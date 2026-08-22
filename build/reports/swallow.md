# swallow: converted
plate GLSL lines: 83   positive lines: 102
gaps: none
notes: A pure coordinate map with one coin in it, so the structure is
       the shader's own: three FORM arms as an if/else with a nested
       if/else inside the second, on floor(P.form + 0.5) against float
       literals. The shader declares world, a, aMin, aMax, uns and
       hilite before the branch and fills them inside it; the walk
       declares the same as eight mutable scalars (world flattened to
       wx, wy, wz) because a name bound inside an emitted if-block
       cannot be read after it. Their 0.0 seeds are unobservable except
       for hilite, whose 0.0 IS the shader's own initializer and is what
       both non-cusp arms leave standing.

       The one draw is the elliptic umbilic's sign coin, rnd.z < 0.5,
       which becomes s.u() < 0.5 in the ternary CONDITION, where a draw
       is legal and no branch of any ternary contains one. That draw
       happens only on the FORM 2 arm, so the draw count differs per
       arm (1 against 0); both evaluators branch on a lever, uniform
       across points, so they cannot disagree about it. The polytope
       precedent.

       Association is the shader's throughout, and it matters here
       because these are polynomials: 3.0*y*y - 3.0*x*x - 2.0*a*x is
       (((3y)y - (3x)x) - (2a)x), -4.0*x*x*x is (((-4)x)x)x, and
       3.0*x*x*x*x + a*x*x is ((((3x)x)x)x) + ((ax)x). The colour's two
       factors keep their grouping: the shader writes col *= (0.35 +
       0.85*glow)*(1.0 + hilite), one scalar formed first and then
       multiplied in, which is exactly the deposit's single glow field.
       Folding the highlight in separately would round differently.

       Two declines, both the plate's vec3(0., -999., 0.) emitted as the
       contract's -20000: the SECTION threshold sweeping down the a
       axis, and the box cut where any |w| exceeds 1.45, written as
       three comparisons joined by || since any(greaterThan(...)) has no
       name in the subset and no draw sits on a short-circuit side.
       Decline rates are large and lawful at the extremes: SECTION near
       1 leaves only a thin slab, and SPREAD 1.6 with SCALE 1.5 puts the
       whole cusp sheet outside the box.

       Identity probe: a literal f64 transcription of the shader driven
       by the walk's recorded draws, 6 configurations covering all three
       FORM arms twice each, SPREAD 0.5 to 1.6, SECTION 0 to 1, TINT 0
       and 1, four clocks, 4000 points each: 97,338 fields compared and
       7,777 declines with 0 decline mismatches, worst relative delta
       2.984e-16. Every delta is the definition of mix, which GLSL
       specifies as x*(1-a) + y*a while core/measure.mjs computes
       x + (y-x)*a; model mix the core's way and all six configurations
       are bit-identical at worst rel 0.0. The plate leans on mix four
       times (the x and a domains, the SECTION threshold, the ivory to
       slate blend), so this is where that corpus-wide difference shows.
       Negative controls both fired: raising the swallowtail's 3.0*x^4
       coefficient by half a percent diffs at 4.3e+1 in the two
       swallowtail configurations and also flips one point across the
       box cut, which the decline comparison caught, while leaving the
       cusp and umbilic configurations at noise, and perturbing the
       shared colour factor 0.35 to 0.351 diffs at 8.3e-4 to 2.8e-3 in
       all six.

       Not volumetric: every arm is a two-parameter patch. FORM 0 and 1
       map (x, a) onto a sheet, FORM 2 maps (radius, bearing) onto two
       cone sheets chosen by the coin. Density concentrates on the cusp
       ridges because the Jacobian collapses there, which is the plate's
       whole point, so expect high contrast rather than a noise floor.
