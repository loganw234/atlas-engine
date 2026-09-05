# nodal: blocked
plate GLSL lines: 79   positive lines: 0 (no positive written)
gaps: a point-independent hash CHAIN keyed by a lever and a loop index.
      The vocabulary has stream draws (per point) and addresses (built
      only by s.descend), and neither can say what this plate says.

The exact GLSL that will not translate, from 40-nodal.js:

    uint sbase = uint(P[3] + 0.5)*1000u + 77u;        /* shape_nodal   */

    vec4 nodal_field(vec3 p, int M, float k, int dim, uint sbase){
      ...
      for(int j = 0; j < 24; j++){
        if(j >= M) break;
        uint h1 = hashu(sbase + uint(j));
        uint h2 = hashu(h1);
        uint h3 = hashu(h2);
        uint h4 = hashu(h3);
        ...
        float a  = TAU*u2f(h1);                       /* dim == 2      */
        float cz = 2.0*u2f(h2) - 1.0;                 /* dim == 3      */
        float az = TAU*u2f(h1);
        float ph = TAU*u2f(h3) + uT*(0.05 + 0.1*u2f(h4));
      }
    }

Why it is a blocker and not a texture. The plate's own comment says
"Directions and phases are hashed only from the seed lever and j, so
every point sees the same ensemble", and the walk depends on that
twice over. The ensemble IS the subject: it fixes where the nodal
surfaces are, so a different realisation is a different picture at
r near zero even though it is the same law, and WAVE SEED is a lever
the operator turns expecting a particular figure. Worse, nodal_field
is evaluated five times per point (four Newton steps plus the landing
test), and those five evaluations must agree exactly or the projection
means nothing. Substituting s.u() would give each point its own
ensemble AND each evaluation its own field, so the cloud would fill
the ball instead of condensing onto the silent set. That is the
forbidden result, so nothing was written.

What the emitter says, probed directly:

  1. `u2f(hashu(sbase + j))` written straight into a sum
     ->  emit: unsupported call
     hashu and u2f are emitted BY core/emit.mjs into every shape
     function, but they are not callable from a walk.

  2. The nearest reachable form is an address from a zero-level
     descend. With `chains: { root: 0, childKey: [0, 0] }`,
     `const g = s.descend(grid2(2), lv.L, { child: (a) => a.child(0, 0),
     keep: (c) => c.u(0) >= 0.0 })` and `g.addr.u(sb + j)` inside a
     sum DOES emit, as
         u2f(hashu(dc_adr ^ uint(sb + float(j))))
     and that is not the plate's hash for three separate reasons:
       - the combination is XOR with an address, not the plate's
         addition to sbase, and the subset has no `^` operator to undo
         it (the lexer has no such token at all);
       - dc_adr is hashu applied L times to the root, where L is
         whatever `levels(2, <int lever>)` returns; it is only 0 when
         that lever is 0, and descend refuses a literal level count
         ("descend cannot bound its loop: levels must come from
         s.depth or carry a lever maximum"), while s.depth draws from
         the stream and would make the address per point;
       - even granting h1, the chain h2 = hashu(h1), h3 = hashu(h2),
         h4 = hashu(h3) is unreachable. `addr.u(salt)` is exactly one
         hashu, and there is no construct that hashes a value produced
         inside a sum. descend is the only iterated hasher and it is a
         statement-level form, so it cannot live inside sum where j
         exists.

  3. An address cannot even be given a name: `const a1 = g.addr;`
     ->  emit: cannot bind a1: unhandled value
     so addresses are usable only inline at the site that makes them.

  4. Minor, on the same line: `uint(P[3] + 0.5)*1000u + 77u` needs
     P[3] as an INT. Today an int lever variable is minted only by
     s.pick, s.depth, grid2, prime, levels and loop bounds; a bare
     `P.seed` in an arithmetic expression is a float. In the probe the
     salt came out as `uint(sb + float(sk))`, which is not the same
     integer for large seeds.

What would unblock it. Any one of these, smallest first:

  a. Make `hashu(x)` and `u2f(h)` callable over int expressions inside
     a walk. The emitter already writes both into its own output; the
     change is a case in emitCall plus an int/uint type for the
     result. Both evaluators already share the implementation in
     core/measure.mjs, so parity is free.

  b. An Address constructible from an int expression, plus one step:
     `addr(P.seed * 1000 + 77 + j)` and `.next()` for each further
     hashu, so h1..h4 can be written as four names.

  c. A named ensemble primitive, e.g. `ensemble(P.seed, j, slot)`
     giving the slot-th hash of the plate's own sbase + j.

Any of these also needs an int-typed lever read, so that
`P.seed * 1000 + 77` is integer arithmetic rather than float.

notes for whoever picks this up next: everything else in the plate is
       expressible, and it is worth knowing that before the vocabulary
       work is scoped.
       - nodal_field returns vec4 (grad in xyz, psi in w) and would be
         four separate `sum(P.waves, j => ...)` calls, one per
         component, since sum reduces to a float. The loop bound is the
         WAVES M lever, static max 24, matching the shader's own cap.
       - the Newton loop is s.orbit(P.newton, {x, y, z}, ...) with
         those four sums inlined into each field. sum inside an orbit
         step field does emit (it is put at statement level inside the
         orbit's loop), so the shape works; it is twelve sums per
         iteration plus four more for the landing evaluation, sixteen
         emitted loops of 24, with heavy CSE fodder.
       - `if(dim == 2) p.y = 0.0;` inside the loop is a ternary on the
         y field. `inversesqrt(0.5*float(M))` becomes
         `1.0 / Math.sqrt(0.5 * M)`, a substitution worth noting since
         GLSL's inversesqrt is allowed to be lower precision.
       - `normalize(fg.xyz + vec3(1.0e-6))` is normalize3 and
         `abs(nrm)` is componentwise. Two decline sites (unconverged or
         outside the window, and the slab cut) plus two deposits.
       - VOLUMETRIC. At the default DIMENSION 3 the plate seeds points
         uniformly through a ball of radius 1.3 and Newton-projects
         them onto nodal SURFACES, a two-dimensional set sampled thinly
         through a three-dimensional volume, which is the qjulia and
         bulb situation exactly. When this plate is eventually
         converted it should be benched at 2^22 or more, not at the
         default budget, and a low correlation at a small budget will
         be shot noise rather than a defect. DIMENSION 2 is a plane
         figure and does not need the extra points.
