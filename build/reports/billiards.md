# billiards: blocked
plate GLSL lines: 212   positive lines: 0 (none written)
gaps: a local binding inside an orbit step. `s.orbit`'s step arrow is a
      single object literal whose every field is one expression, and a
      field may read only the previous state record and the loop
      counter. There is no way to name a value once and use it twice
      inside a step, and orbits do not nest, so a step whose body is a
      DAG must be written out as a tree. `billiards_hit` is such a DAG
      and it re-expands multiplicatively.
notes: The bounce loop (33-billiards.js lines 202-219) is an orbit in
       the ordinary way: the state is the ray (ro, dir) plus the running
       chord sum, `until` reads a stop code, and the shader's two breaks
       become the code's two values (2 for the miss `t <= 0.0 || t > 4.0`,
       1 for arrival at `j == kk`), with every field frozen on the
       stopping step so the post-orbit state is the ray at bounce kk.
       That much was built and emitted as a probe and it is sound: the
       levers, `billiards_start`, AIM/SPREAD, the coin, the hue arms,
       LIFT and the pulse all translate, and the probe emits 56 GLSL
       lines with no refusal. The block is one function.

       `billiards_hit` (lines 29-113) is called once per step and returns
       TWO things, `t` and the out-parameter `nrm`, through 12 local
       bindings and six conditional best-updates. Six state fields need
       one or both (rx, ry need t and nrm; dx, dy need nrm; ac and the
       stop code need t), so the whole function is written out once per
       field. Measured, with the leaves already as cheap as an orbit
       field allows (bare state fields, table constants hoisted):

         table            hit t     +nrm     one orbit step
         circle           0.1 KB    0.2 KB     ~2 KB
         ellipse          0.2 KB    0.5 KB     ~4 KB
         Sinai            1.7 KB    5.7 KB    14.7 KB
         Bunimovich       12.2 KB   42.7 KB   109.1 KB

       The stadium is the one that ends it. Its cost is the cap arm,
       lines 69-92, where every binding has two consumers and the
       consumers stack:

         float disc = B*B - C;
         if(disc > 0.0){
           float sq = sqrt(disc);
           float t1 = -B - sq;
           float t2 = -B + sq;
           float hx1 = ro.x + rd.x*t1;
           float hx2 = ro.x + rd.x*t2;
           bool v1 = t1 > 0.0 && (side == 0 ? hx1 >= L - 1.0e-6 : hx1 <= -L + 1.0e-6);
           bool v2 = t2 > 0.0 && (side == 0 ? hx2 >= L - 1.0e-6 : hx2 <= -L + 1.0e-6);
           float t = v1 ? t1 : (v2 ? t2 : -1.0);
           if(t > 0.0 && t < best){
             best = t;
             vec2 h = ro + rd*t;
             nrm = (vec2(cx, 0.0) - h)/r;
           }
         }

       B appears in disc and in both roots, sq in both roots, each root
       in its own gate twice and again as the result, and the winner is
       then re-expanded in the `t < best` comparison and again in the
       normal. One cap candidate is 2.9 KB; the two caps and two walls
       min-selected with the plate's strict `<` ordering make t 12.2 KB
       and the normal 15 KB per component. Both roots are live (a ray
       crossing the cap circle from inside the stadium enters at hx1 < L
       and leaves at hx2 >= L), so neither can be dropped.

       Pipelining does not rescue it. Carrying t and nrm one step ahead
       cuts the copies from six to three, but then the hit's leaves
       become the advanced ray, and the reflect-and-renormalize
       expression is ~200 characters standing where `ob_dx` stood:
       measured, hit t alone goes to 55.7 KB. Only a hand-scheduled
       three-phase pipeline (phase one binds B and disc per cap into
       state fields, phase two the candidates, phase three the winner
       and the ray advance) brings it back under ~4 KB, at 120 orbit
       steps per point and a walk that reads as microcode rather than as
       a billiard table. That is a walk nobody could check against the
       shader by eye, which is the failure mode the brief forbids, and
       the same tree has to be typed by hand into the .pos.mjs source,
       where the copies are what a transcription error hides in.

       Any ONE of these unblocks it, smallest first:
       (a) a statement body for the orbit step:
           `(st, k) => { const B = ...; const sq = ...; return {...}; }`
           with const bindings emitted ahead of the field temps, which
           the emitter already does for every other statement;
       (b) nested orbits, so the four-surface min-selection can be its
           own two-step orbit inside the bounce orbit;
       (c) callable pure helpers, so `billiards_hit` stays one function.
       (a) alone would take the stadium step from 109 KB to about 2 KB
       and let the walk keep the shader's own shape.

       Nothing else about the plate is unusual. The two seed hashes
       (`hashu(seed ^ 0x51ed270bu) & 1u` for the launch handedness and
       `hashu(seed ^ 0x7f4a7c15u) % uint(Nb)` for the deposited chord)
       are a fair coin and a uniform int, so `s.u() < 0.5` and
       `s.pick(P.bounce)` say them; source order is rnd.z, then the
       coin, then the chord. `int Nb = int(P[1] + 0.5); if(Nb < 1) Nb = 1;`
       is vacuous, BOUNCES having minimum 1. `normalize(v)` has no
       vocabulary spelling and becomes v / length(v), which the ellipse
       normal and the per-bounce renormalize both want. The far sentinel
       is `vec3(0.0, -999.0, 0.0)`, the same one collatz and primes
       already convert to `s.decline()`. The table is flat in the
       xz-plane with LIFT lifting bounce index into y, so the subject is
       a stack of planes, not a volume; sampling can be budgeted as for
       any surface plate.
