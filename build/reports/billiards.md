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

---

# billiards: converted
plate GLSL lines: 212   positive lines: 385
gaps: none
notes: The block that stood above is closed by exactly the smallest of
       the three unblocks it asked for, (a), a statement body for the
       orbit step. `billiards_hit` is now what it is in the shader, a
       sequence of statements inside the step: a running `best`, a
       normal beside it, the four surfaces tested in the shader's own
       order under the same strict `<`, and each intermediate named
       once. Nothing is re-expanded, so the stadium step is ordinary
       text rather than the hundred kilobytes the earlier measurement
       found. The emitted plate is 375 GLSL lines unpinned, 536 pinned.

       THE ORBIT. State is the ray (rox, roy, dx, dy), the running
       chord sum acc, the seat (ptx, pty), the chord length tlen, and a
       stop code: 0 running, 1 arrival at bounce kk, 2 the miss or
       degenerate ray. `until` reads the code before each step, so the
       step that sets it is the step that freezes the record, and
       everything after the orbit reads the frozen ray. The bound is
       the BOUNCES lever itself, which emits `for (j = 0; j < 40; j++)`
       with `if (j >= li_bounce) break;`, the shader's loop line for
       line. `int Nb = int(P[1] + 0.5); if (Nb < 1) Nb = 1;` stays
       vacuous, BOUNCES having minimum 1.

       CHOICES THE NEXT READER SHOULD KNOW. The shader's
       `for (side = 0; side < 2; side++)` over the two stadium caps is
       written out twice rather than nested as an orbit; with a
       statement body each cap is fifteen statements and unrolling
       keeps the `side == 0 ? ... : ...` gates as the plain
       inequalities they are. Order still matters in principle, so the
       right cap is tested before the left, as in the plate. Draw
       order is the shader's source order, rnd.z then the coin then the
       chord: `s.centered()`, then `s.u() < 0.5` for the launch
       handedness, then `s.pick(P.bounce)`. `normalize` has no
       vocabulary spelling and no deterministic form, so every unit
       vector is v / length(v) through len2, which is what the pinned
       emitter wants and what the evaluator computes. The three colour
       multiplies stay three multiplies, `mul3(mul3(mul3(base, wgt),
       pulse), gain)`, because folding them into one factor would
       change the rounding. The far sentinel `vec3(0.0, -999.0, 0.0)`
       becomes `s.decline()` and emits as -20000, the same conversion
       collatz and primes already carry.

       s.vnoise IS NOT USED AND SHOULD NOT BE. This plate has no field:
       both seed hashes are consumed once by a single point and never
       asked for again by another, so they are a fair coin and a
       uniform integer, which the stream says directly. A catalogue
       entry would be answering a question nothing asks.

       GATES. `node tools/smoke-pos.mjs positives/billiards.pos.mjs`
       passes all four rows with zero declines and zero malformed.
       `node tools/verify-pinned.mjs billiards` reports 1 of 1 fully
       pinned, 0 refused, 0 unpinned ops, and no bare slash: every
       division in the walk goes through det_div.

       THE CROSS-CHECK. The plate's GLSL was transcribed literally into
       a throwaway JS function in the scratch area, the walk was driven
       by a draw-recording stream, and the transcription was replayed
       on the same three draws. Fourteen settings covering all four
       TABLE arms and eccentricity 0 through 1, 20,000 points each:
       279,998 deposits and 2 declines, no decline mismatches, and the
       worst relative delta over x, y, z, r, g, b was EXACTLY ZERO.
       That is stronger than wave one's 4e-16 to 2e-14 and it is not a
       surprise: the walk associates every expression the way the
       shader does, and both sides run in doubles under node, so there
       is nothing left to round differently. Branch coverage was
       counted rather than assumed: every stadium and Sinai surface,
       every start segment, both breaks and both declines were reached.

       NEGATIVE CONTROLS, six of eight fired. Perturbing the circle
       radius (4.5e-2), the ellipse semi-axis (1.8), the stadium radius
       (2.0), the Sinai half-width (2.0), the per-bounce nudge (2.0)
       and the pulse amplitude (3.9e-4) each showed up immediately, so
       the comparator sees a planted fault in every table arm and in
       the colour chain. Two did not fire, and both are facts about the
       plate rather than blindness in the instrument. Swapping the
       order of the two cap tests changes nothing because a running
       strict minimum is order-independent except on an exact tie, and
       no tie occurred. Raising the stadium wall floor from t > 0.0 to
       t > 1.0e-4 changed nothing either, which confirms the plate's
       own comment at lines 58-60: no wall hit in 280,000 walks
       arrived within 1e-4, so the EPS the plate refuses to use would
       indeed have rejected nothing here. Recorded because the comment
       asserts it and this measures it.

       ONE ARM OF THE SHADER IS DEAD. In the stadium cap the near root
       is taken when `v1` holds, and over 1.25 million accepted cap
       hits `v1` was never true: the far root won every time. That is
       geometry, not sampling. A ray whose origin is inside the stadium
       is either inside the cap circle, where t1 is behind it, or left
       of x = L, where it enters the circle at hx1 < L and fails the
       gate. The earlier report's reading that "both roots are live" is
       half right, in that neither can be dropped from the source
       without changing what the code says, but only t2 is ever
       selected. The positive carries the same arm under the same
       condition, so it says the same thing.

       FOR CONFORMANCE. The subject is not volumetric. The table lies
       in the xz-plane and LIFT is zero by default, so at defaults every
       deposit sits on the single plane y = 0 and the picture is a
       plane curve family; no shot-noise allowance of the qjulia or
       bulb kind is needed. Declines are lawful and rare, 2 in 280,000
       at these settings, and both evaluators decline the same points.
