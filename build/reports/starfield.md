# starfield: blocked
plate GLSL lines: 159   positive lines: 0 (none written)
gaps: a stream re-seeded from a runtime integer. The walk can draw from
      its own stream and it can address a subdivision through
      `s.descend`, but it cannot say "hash THIS index and read four
      uniforms off the chain", which is how the plate gives every point
      that lands on a star the same star.
notes: This plate has no loops at all. Every other construct in it
       translates: the blackbody fit and the magma ramp are
       mix/smoothstep/pow/log on scalars, the yaw is four products, the
       aberration map is scalar with `length(vec2)` as len2 and a
       componentwise vec2 mix, `starfield_basis` is cross3 / add3 /
       normalize3 with the vec3 mix as mix3, and `c * sqrt(c)` is three
       scalar products. The graticule and the microwave shell convert
       whole: their hashes (`hashu(seed + 0x2545F491u)` and its
       successor, plus rnd.x and rnd.y) are per-point, so they are four
       ordinary draws, and the shell reads only q. Those two
       populations are 25% and 20% of the budget at the default levers.

       The remaining 55%, the stars themselves, is the block:

         int  nst = int(clamp(P[3], 1000.0, 8000.0) + 0.5);
         uint si  = hashu(seed) % uint(nst);
         uint s1  = hashu(si*2654435761u + 101u);
         uint s2  = hashu(s1);
         uint s3  = hashu(s2);
         uint s4  = hashu(s3);
         float a1 = u2f(s1), a2 = u2f(s2), a3 = u2f(s3), a4 = u2f(s4);

       a1 and a2 are the star's direction, a3 its temperature, a4 its
       absolute magnitude. The index draw itself has a spelling:
       `hashu(seed) % uint(nst)` is a uniform integer, and while
       `s.pick(P.count)` refuses (measured: "lever count used where an
       integer is required, but it is not an integer lever", STAR COUNT
       having step 100), `Math.floor(s.u() * nst)` emits and is the
       same law, which is what ifs already does. What cannot be said is
       the chain hanging off si. This is not stochastic texture that
       the brief lets differ in value but not in law: si is a catalogue
       key, the whole subject is that some thousands of points pile
       onto each of nst discrete stars and agree about where it is and
       what colour it is, and a different hash chain gives a different
       sky. Points would still land on stars, but not on THESE stars,
       and a picture check against the original would see two unrelated
       skies.

       Measured refusals, so the next reader does not repeat them:
         hashu(si * 2654435761 + 101)      emit: unsupported call
         s.descend(grid2(2), 1, {...})     emit: descend cannot bound
             its loop: levels must come from s.depth or carry a lever
             maximum
       The second one closes the door that looked most promising. The
       chains mechanism lines the ARITHMETIC up exactly: pin
       `chains: { root: 0, childKey: [2654435761, 101] }` and one
       descend level with `child: (a) => a.child(0, si)` would write
       `hashu(0u ^ uint(si * 2654435761 + 0 + 101))`, which is the
       plate's s1 to the bit (checked against the plate's own
       arithmetic at si = 0, 37, 3999, 7999), and from there
       `addr.u(0)` is exactly u2f(s2) and `trail.u(0)` exactly u2f(s3),
       both verified numerically. But a descend cannot take a literal
       level count, `a.child` wants an int and the only ints available
       come from `s.pick` of a unit-step lever, and even granting all
       that it stops two attributes short: a1 = u2f(s1) is the
       address's own value, which nothing outside a descend keep's
       `coin` can read, and a4 needs a fourth link that no second level
       reaches, the child expression being emitted once and reused at
       every level so level two folds the same key in again and leaves
       the chain. Two of four attributes, which is no catalogue.

       The minimal construct that unblocks it, and it is a small one:
       a stream re-seeded from an expression. The plate's four
       attributes ARE the first four draws of a stream seeded at
       si*2654435761 + 101, exactly, because `Stream.u()` hashes and
       then converts, which is what lines 140-144 do four times.
       Verified: `new Stream((Math.imul(si, 2654435761) + 101) >>> 0)`
       yields a1, a2, a3, a4 bit for bit at every si tried. So

         const cat = s.reseed(si * 2654435761 + 101);
         const a1 = cat.u(), a2 = cat.u(), a3 = cat.u(), a4 = cat.u();

       would convert this plate with no other change, and in GLSL it is
       one more uint register beside `pt`: `uint pt2 = uint(...)` and
       the same `pt2 = hashu(pt2)` at each draw site the emitter
       already writes. It reads as what it is, a per-star budget drawn
       from the catalogue rather than from the point, and it keeps the
       draw discipline intact because the sub-stream's draws are still
       sequenced statements in source order. Anything else that hashes
       an integer would do as well; this is just the spelling that
       matches what the plate already means.

       Not volumetric. Every point is normalized and scaled to one of
       two concentric shells, R = 1.30 for the stars and graticule and
       R*1.06 for the microwave shell, with the camera at dist 0.5
       inside them. It is an all-sky surface seen from within, so the
       per-cell density is a surface density and the diffuse-plate
       sampling budget does not apply. Aberration does pile most of the
       points into a cone of half-angle arccos(beta), 26 degrees at the
       default SPEED, so cell occupancy is extremely uneven across the
       frame; that is the subject, not noise.
