# allpaths: converted
plate GLSL lines: 126   positive lines: 165
gaps: none
notes: Three voices, one draw. `g = u2f(hashu(seed ^ 0x5bf03635u))` is a
       uniform, so it is `s.u()`, and it decides between the phasor
       inset, the dim surface line and a path exactly as the shader's
       doPh/doSurf pair does; the flags are kept as written (doSurf
       carries its `!doPh`) so the two can be read side by side. rnd.x
       is one given the shader spends in whichever branch it reaches, so
       each branch draws it for itself: the walk spends two draws on
       every point, g then the jitter, and the decline tests sit ahead
       of the jitter draw exactly where the shader's early returns do.

       The phasor sum is an orbit over the same 320-cell quadrature the
       paths are drawn from. Six fields, not eight: the shader keeps Sa
       and Sb bracketing the M-th phasor, and Sb is Sa plus that phasor,
       which the state already carries as covM and phM. Sb is therefore
       computed after the orbit as Sa + covM*(cos, sin)(TAU*phM), the
       same multiply and add on the same numbers the loop performs, so
       it is bit-identical and not an approximation; the cross-check
       covers it (480 phasor points per setting, all exact). Sa is
       captured before the add and the running sum after it, which the
       orbit's simultaneous update gives for free.

       `x0 = -H + float(j)*dxs` is written out in every field that needs
       it rather than accumulated in the state, because repeated
       addition is a different number. The coverage integral appears
       three times and the phase four; that repetition is the price of
       an orbit field being one expression, and it is what the
       cross-check is for.

       `int(q.x*float(STEPS))` becomes `Math.floor`, identical here
       because q.x is never negative; the shader's two clamps on M are
       kept even though the R2 sequence cannot reach them. `M` and the
       loop counter compare as floats. `inversesqrt(x)` has no
       vocabulary spelling and becomes `1.0 / Math.sqrt(x)`, which the
       emitter writes as `(1.0 / sqrt(x))`: the same number to within
       whatever a GPU's inversesqrt costs, and the one place this
       positive cannot be bit-identical to the original plate by
       construction. `col *= glow * k` is spelled `mul3(col, glow)` with
       the deposit's glow carrying k, so the multiplications associate
       the way the shader's do.

       Written first against the previous core and cross-checked at
       5.5e-14, which turned out to be the core's own mix, not the
       walk's: commit 218ef3a had just made mix the GLSL spec form and
       added len2/len3, and the comparator was still using the old
       shapes. With the comparator on GLSL semantics and Math.hypot
       replaced by len2 throughout (nine sites; measure.mjs now says
       plainly that Math.hypot is the wrong function because length is
       sqrt of a dot product), agreement is EXACT: worst delta 0.0
       across five settings x 4000 points x six deposit fields, all
       three branches and both decline paths exercised, no decline
       mismatches. Negative control fired: perturbing the detector's
       0.06 orbit radius to 0.061 in the transcription moves the worst
       delta to 5.1e-2. Levers, cam, gain and accent diffed
       programmatically against the plate: match.

       Not volumetric. The scene is drawn in a plane and laid flat into
       world xz with a jitter of +-0.012 in y, so the subject is a plane
       and its inset, and sampling can be budgeted as for any flat
       plate. The grating arm declines about 55% of points at the
       default duty, which is the strips, not a fault.
