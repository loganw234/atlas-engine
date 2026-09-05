# mirage: converted
plate GLSL lines: 172   positive lines: 314   emitted GLSL: 213
gaps: one construct genuinely missing, worked around and measured.
      GLSL `isnan`/`isinf` have no vocabulary. The plate's last gate is
        `if(!alive || any(isnan(pos)) || any(isinf(pos))){ ... }`
      and the walk asks for finiteness as a magnitude instead:
        `const fin = (Math.abs(posx) < 1.0e30 && Math.abs(posy) < 1.0e30) ? 1.0 : 0.0;`
      A NaN fails that comparison and an infinity fails it too, in both
      JS and GLSL, so the two predicates differ only for a finite
      coordinate at or beyond 1e30. Measured: over 400 lever settings x
      600 points (240000 walks) no deposit component is ever non-finite
      and the largest one anywhere is 1.4757, a factor 6.8e29 below the
      threshold. If the vocabulary ever grows a finiteness test, this
      is the line to revisit.
notes: Four MODE arms. The two tracing arms (hot ground and inversion
       layer) are written out SEPARATELY rather than sharing the
       shader's mirage_prof with its `if(md == 0)` inside. Same
       mathematics, one profile per arm: the emitted loop then carries
       no dead branch, and the mode-0 leapfrog never evaluates the
       Gaussian. The negative control confirms the split is honest, the
       perturbation of the -2.0 in the Gaussian derivative moves MODE 1
       and leaves MODE 0 alone.

       The leapfrog is s.orbit with a literal bound of 240, the
       shader's own loop cap, and a counter j in the state, because the
       step budget k = int(q.y*239.0) is a computed value and the loop
       vocabulary bounds only on levers or literals (the rmt pattern).
       `until` therefore carries both stopping conditions:
       `v.j >= kk || v.y <= 0.0 || v.y > 0.60`.

       That reads the range test one step later than the shader writes
       it, and it is the same test. The shader checks after a completed
       step and breaks; until checks the state a completed step
       produced, before spending the next. The one case the shift could
       have changed is a ray that dies on its very last permitted step,
       where until never gets to look: so alive is taken from the final
       state rather than from escaped,
       `alive = (steps > 0.0 && (rayy <= 0.0 || rayy > 0.60)) ? 0.0 : 1.0`,
       and the `steps > 0.0` guard reproduces the shader exactly for
       k = 0, where the shader completes no step and so can never
       declare the ray dead however y0 falls. Verified: 0 decline
       decision mismatches in 32000 cross-checked points.

       Orbit fields are single expressions, so the midpoint, the
       profile, its derivative and the re-projected p are written again
       in every field that needs them. Each mode-0 field holds nine
       copies of the profile exponential and each mode-1 field holds
       nine of the Gaussian; the values are identical in every copy and
       the GLSL compiler's CSE is meant to collapse them, exactly as
       the ifs conversion noted for its golden-spiral radical. The
       longest emitted line is 2236 characters (the mode-1 p field). If
       a driver ever refuses to CSE this, the fix is to carry the
       midpoint as a fifth orbit field, which shrinks each profile
       reference to one name at the cost of two more copies of the new
       p; that variant was measured as more CPU work, not less, and was
       not taken.

       The Luneburg arm carries a second orbit, bound 200, inside the
       `else` of the `tt < lin` split, with counter j and
       `until: v.j >= kl`. It has no range test, so escaped and the
       budget coincide there. The interior force is applied to the
       half-updated position, as the shader writes it, and the
       `if(dot(pp,pp) < aL*aL)` becomes a ternary on the same
       half-updated position in each of the four fields.

       The fisheye arm's `normalize(B - A + vec2(1e-12))` and
       `length(B - A)` are written as `Math.sqrt(x*x + y*y)`, NOT as
       Math.hypot, even though the brief's table offers Math.hypot for
       length. GLSL's length is the square root of the dot product;
       Math.hypot runs the careful algorithm and returns a different
       last bit for about 38 per cent of argument pairs at this scale,
       worst relative 4.4e-16. The CPU evaluator would then disagree
       with its own emitted shader for no reason, which is the fault
       commit 218ef3a went after in csqrt and normalize3. Written as
       sqrt of the dot, both sides compute the same thing. Worth
       carrying into the brief: every Math.hypot in an existing
       positive is a last-bit divergence between the evaluators.

       Draw order: jit (rnd.z) and the scenery coin (rnd.w) are drawn
       unconditionally at the top, in that source order, and the object
       point hn (rnd.x) is drawn inside the md < 2 arm only. MODE is a
       lever, so both backends take the same arm for every point and
       the draw sequence cannot diverge. The permutation relative to
       the shader's rnd.z/rnd.w/rnd.x slots is value-only, which the
       brief licenses.

       The scenery arm returns its own deposit, so the walk has two
       deposit sites and one decline site. `bool alive` is a float flag
       (1.0/0.0) because the subset has no boolean literals to assign.

       Identity probe: a literal f64 transcription of the plate's GLSL,
       including mirage_prof and mirage_trace as written, replayed on
       the walk's recorded draws, agrees BIT FOR BIT (worst |delta|
       0.000e+0, worst relative 0.000e+0) over 8 lever settings x 4000
       points, 29979 compared deposits plus 632 scenery points,
       covering all four MODE arms, both branches of the Luneburg
       straight-run split, both ends of EXAGGERATE, OBJECT HEIGHT, FAN
       and LAYER HEIGHT, and clocks 0 through 5. Five negative controls
       All of it re-run after the core moved under the session (commit
       218ef3a, which binds every draw at its site and re-associates
       mix): identical results, still bit for bit, with the comparator
       using GLSL's own length. Five negative controls
       fired, each in the arm it targets: bar 0.42 -> 0.4201 diffs at
       2.1e-2, dx 2.6 -> 2.601 at 2.3e-2, the Gaussian derivative's
       -2.0 -> -2.01 at 1.6e-2 in MODE 1 only, the fisheye's 0.82 ->
       0.8201 at 7.3e-4, and the Luneburg 0.985 -> 0.9851 at 9.0e-3.

       Not volumetric. Every arm lays points on a sheet in the plane
       y = jit, a band 0.014 thick, with z = -pos.y. The conformance
       rig should not expect a diffuse plate here.

       Levers/cam/gain/accent copied verbatim, same count, same order,
       same labels.
