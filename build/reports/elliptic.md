# elliptic: converted
plate GLSL lines: 167   positive lines: 215
gaps: none for the picture, but one real absence worked around exactly.
       The subset has no float-to-int conversion (Math.trunc is only
       int/int, intLeverVar only accepts step-1 levers), and MODE 1 is
       integer arithmetic over F_p whose inputs are the non-integer
       levers A and B. The whole residue stanza is therefore carried in
       floats. It is exact rather than approximate: every value it
       touches is an integer well under 2^24 (the largest, xi*xi*xi,
       is under 97^3 = 912673), and elliptic_pmod is the mathematical
       positive residue for both signs of its argument, which is what
       GLSL mod(x, y) computes for y > 0, so the two agree bit for bit.
       Confirmed by the cross-check below, which exercises MODE 1 at
       P MAX 13, 61 and 97 and finds zero difference.
notes: Three of the shader's loops are searches that stop on the first
       success, and each becomes an orbit whose until() weighs the
       candidate the previous step laid down. The record then finishes
       holding the accepted candidate and escaped is the shader's
       break, which is why the bounds are one larger than the shader's
       (131 for elliptic_locus's 130 half-steps, 9 for the eight-try
       partner search). The extra trailing step, taken only when the
       search fails, computes a candidate nobody reads; in the partner
       search it also spends one draw the plate does not, and the walk
       declines immediately after, so nothing downstream sees it. When
       a search succeeds the draw counts match the plate exactly, try
       for try.
       The 49-step scan for y with y^2 = rh (mod p) folds the shader's
       two exits into one orbit: until() escapes on a hit OR on the
       shader's own exhaustion test 2y > p, and the two are told apart
       after the loop by re-testing 2y > p. Both give a decline.
       Trial division is sum(8, d => ...) over d = 2..9 with the
       shader's own d*d <= n guard, so exactly the divisors the
       shader's break lets it reach; it appears twice, once inside the
       prime-walk's until and once on what that walk left behind, which
       is the shader's own second isprime call.
       Renames: the shader's scale s is sc (s is the stream), its
       locus step st is stp (st is the orbit record), and its local
       clock t is tc (t is uT).
       Colour groupings are kept as the shader wrote them, using
       deposit's glow as the last factor: vec3(c)*1.5*glow becomes
       col: mul3([c], 1.5), glow: gl, so the products associate
       identically and no rounding is introduced.
       Levers, cam, gain, accent copied verbatim; seven levers, MODE
       and P MAX integer-stepped and compared as exact floats.
       Smoke passes all four rows. Declines are lawful and expected:
       the plate carries the far sentinel on nine paths (no visible
       locus twice, no partner on the curve, the vertical chord over a
       2-torsion point, two window clips, no real y at that x, y past
       the window, and a non-residue rh). Roughly 29 percent decline at
       defaults, 30 percent averaged over the cross-check's six
       configs.
       Identity probe: a literal f64 transcription of the shader,
       replayed on the walk's own recorded draws, matches every
       deposit field bit for bit, worst |delta| exactly 0 over six
       configs x 4000 points (13549 deposits compared, 10451 shared
       declines, 0 decline mismatches) covering both MODE arms, three
       P MAX settings, wide and narrow windows, and t = 0 / 0.6 / 1.1 /
       1.7 / 2.9. Negative control fired twice and separately: a MODE 0
       constant (1.15 -> 1.1501) moves only the three MODE 0 configs
       (worst 1.0e-4) and a MODE 1 constant (2.2 -> 2.2001) moves only
       the three MODE 1 configs (worst 5.0e-5), so the probe is looking
       at both arms and not at one of them twice.
       Volume: MODE 0 is planar, the y axis carrying only a +-0.015
       jitter. MODE 1 is a stack of thin curtains, one per prime, so
       it fills a box but sparsely, in planes; if central conformance
       reads MODE 1 low, budget more points before suspecting a defect.
