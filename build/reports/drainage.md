# drainage: converted
plate GLSL lines: 84   positive lines: 210
gaps: none blocking. One construct was wanted and lacked, and it is the
      same one LVII, LXI and LXII wanted: an orbit field that is an
      INTEGER, so a plate's own uint hash chain could be carried
      through a loop bit for bit. Orbit state is float throughout
      (core/emit.mjs emitOrbit declares every field `float`), `hashu`
      is not in the subset at all, and `s.descend` is the only iterated
      hasher but hands back only where the walk ended, so there is
      nowhere to put a per-level address. s.vnoise stands in, exactly
      as it does for the breakdown tree, the vortex catalogue and the
      dissipation cascade: it restates the LAW of the addressing and
      not its bits. That substitution is the one thing in this file
      that is not verbatim and the whole of the notes below is about
      measuring it.
notes: THE PLATE IS ADDRESSED AND THAT IS THE PLATE. Two hash chains
       run in the shader. `taddr` is seeded from a constant and folded
       per reach index, so the trunk river is one fixed river that
       every point sees. `addr` is seeded from `taddr` at the reach the
       point leaves from and folded per junction by which SIDE the
       point drew, so it is a PATH address: the thousands of points
       that walk the same tributary agree about where it bends.
       Neither is stochastic texture the brief lets differ in value.
       Replace either with stream draws and there are no streams at
       all, only a fog in the shape of a basin.

       WHAT RIDES WHERE. The trunk's reach index is the lattice cell,
       `s.vnoise(k, 0.0, 997)`, one octave for the one attribute. The
       tributary's path rides as a shift register over the side bits.
       The lattice folds at 1024 in each coordinate, so the two words
       together hold twenty bits and the register is laid across both:
       `nlo = mod(alo*2 + bit, 1024)` takes the new fork and
       `nhi = mod(ahi*2 + floor(alo/512), 1024)` catches the bit the
       low word is about to lose. The divisor is a power of two and
       every value is a small integer, so both words are exact on
       either backend. DEPTH reaches 22, so twenty junctions of every
       path are held exactly and only the last two can alias.

       The reach the basin hangs off and the ORDER of the junction ride
       in the OCTAVE, `oc = 4096 + segT*66 + 3*k`, with +1, +2 and +3
       for the junction jitter, the meander and the length ratio. The
       reach belongs in the address because the shader seeds this chain
       from the trunk's own address, so it is part of the address and
       not an attribute of it. The order must be in the address because
       path "1" at junction 0 and path "0,0,1" at junction 2 leave the
       same bits in the register and the shader's chain distinguishes
       them by its length. Enumerated over every lever setting: 1,585
       octaves the walk can name, trunk at 997 and tributaries over
       4097 to 5680, zero collisions between roles, and within a role
       the cell separates.

       WHAT THE TWENTY BIT REGISTER COSTS, stated rather than hidden.
       Only junctions 21 and 22 can alias, and they are far below the
       point where anything could be seen: measured at defaults over
       30,000 points, the mean reach length at junction 10 is already
       7.70e-4 against a span of 2.8, which is 0.56 of a pixel at 2048
       wide, and every junction after it is a little over half the one
       before. What aliases is not merely sub-pixel but sub-pixel by
       three orders of magnitude.

       THE TRUNK ORBIT CARRIES A COUNTER, field `n`, because `until`
       reads the state and not the loop index and the shader's break is
       `if (i >= segTarget)`. segTarget comes from `s.pick(24)`, which
       has no staticMax, so it cannot be an orbit bound directly. The
       emitted loop is `for (ok < 24) { if (n >= float(segT)) break; }`,
       which is the shader's loop. The tributary orbit needs no such
       thing: its bound is `d` from `s.depth(P.depth)`, whose staticMax
       is DEPTH's own max of 22, so it emits `for (ok < 22) { if (ok >=
       d) break; }` character for character with the plate.

       TWO GUARDS, both proved not to bind rather than merely added.
       The trunk's `normalize(mix(dir, vec2(1,0), 0.30))` takes a floor
       of 1e-9 on the length: mixing any unit vector three tenths of
       the way to (1, 0) gives 0.49 + 0.42*dir.x + 0.09 under the root,
       at least 0.16, so the length is at least 0.4 and the floor is a
       proof obligation discharged. The bank's `pow(abs(u), 0.35)`
       takes a floor of 1e-30 on the argument. u is 2*draw-1 and its
       smallest nonzero magnitude is about 6e-8, an f32 step at 0.5, so
       the floor changes no value the plate can take; what it removes
       is the one exact zero, where det_pow is det_exp2(0.35 *
       det_log2(0)) and the logarithm is minus infinity. sign(0) is 0
       in both languages, so bank is zero there either way, but 0 times
       NaN is not zero and that is the whole reason the floor is there.

       ONE PLACE WHERE THE ENGINE'S SPELLING IS NOT THE SHADER'S, and
       it is tiny. `segTarget` is `s.pick(24)`, which clamps with
       min(.., 23) where the shader writes a bare int(u2f * 24.0). They
       differ only when u2f returns exactly 1.0, which needs the hash
       in the top 128 of 2^32, about 3e-8 per point, and the clamp was
       never hit in 180,000 points per setting. In the one case it
       would bind, segTarget 24 and 23 differ by one trunk reach for
       one point in tens of millions.

       There was a second, and it closed under this plate while the
       conversion was running, which is worth recording because it bore
       directly here. `s.depth` used to emit pow(u, 1.0) where the
       shader has no pow, and that pow DECIDES AN INTEGER: on this
       plate a last-place move flips which tributary a point rides,
       not how brightly it shades. The agent converting breakdown
       measured it (det_pow at exponent 1 moves 16.27% of inputs by up
       to 10 ULP, so the two backends disagreed about depth for about
       one point in a million) and core/emit.mjs now writes the bare
       multiply at the default bias. Verified against the current core:
       the emitted line is `int depth_3 = int(u2f(pt) *
       float(li_depth));` against the plate's `int d = int(u2f(pt) *
       float(maxD));`, character for character. Every gate and every
       number in this report was re-run against that core.

       CROSS-CHECK (scratchpad, this session). 59-drainage.js
       transcribed literally into f64 JS, the walk driven by a
       draw-recording stream, the transcription replayed on the same
       tape. The transcription takes an ADDRESS ORACLE so it can be run
       two ways: with the shader's own hashu chains, which is the
       literal reading, or with the walk's vnoise reads and nothing
       else changed. The walk is compared against the second, so the
       comparison covers the trunk rotation and its normalise, both
       junction rotations, the length and width recursions, the seat
       along the reach, the bank power, the keel and its lived == 0
       arm, the relief and the whole palette verbatim, and isolates the
       substitution instead of hiding it. Six settings (defaults, t =
       1.7, two hashed lever sets, DEPTH 22 with SPAN 3.2 and KEEL 1,
       DEPTH 4 with MEANDER 1 and JUNCTION 85), 30,000 points each,
       1,080,000 field comparisons: worst relative delta 0.000e+0,
       every field bit-equal. That is exact rather than the 1e-16 to
       1e-14 wave one saw because the walk and the transcription do the
       same f64 operations in the same association, which was written
       for deliberately.

       NEGATIVE CONTROLS, nine, all fired. Constants: angRad 0.0174533
       to 0.0174534 (1.5e-3), the trunk's pull 0.30 to 0.3001 (7.0e-2),
       the y squash 0.92 to 0.9201 (1.1e-4), the width decay 0.60 to
       0.6001 (6.4e-4). And five on the address itself, so a comparator
       that were somehow not reading the substituted values could not
       pass: jitter scale 0.55 to 0.5501 (6.3e-3), trunk octave 997 to
       998 (2.0e+0), junction octave +1 to +2 (2.0e+0), the register's
       HIGH WORD dropped so it holds ten bits instead of twenty
       (2.0e-1), and the reach dropped out of the octave (2.0e+0). The
       last two matter most: they are the controls that show the second
       register word and the reach are load-bearing rather than
       decorative.

       THE SUBSTITUTION'S OWN CLAIM, checked. s.vnoise at whole integer
       coordinates equals fround(u2f(hashu(oc ^ hashu(...))) - 0.5)
       bit-exactly, 65,536 of 65,536 over 1,024 octaves, max difference
       0: the interpolation weights are exactly zero and what comes
       back IS the corner hash recentred, which is precisely the
       shader's own (u2f(addr) - 0.5). Range over every address the
       walk can reach: [-0.499998, 0.499998].

       FOR THE PICTURE CHECK, and this is the part that saves a
       diagnosis. The substitution gives a DIFFERENT MEMBER OF THE SAME
       ENSEMBLE, not the plate's own basin. The trunk is a single
       twenty four sample realisation shared by every point, so a
       different addressed sequence is a river drifting a little north
       or south of the original, and per-pixel correlation against
       59-drainage will read low for a reason that is not a defect.
       The right instrument is the pooled-world one tools/native-law.mjs
       already uses for LVIII, so it was run: 120 worlds of the plate's
       own chain (root perturbed) against 120 worlds of the field
       (octave base perturbed), 4,000 points each.

         quantity   plate chains          the field            z
         mean x     -0.04584 +- 0.00385   -0.04569 +- 0.00372  0.30
         mean y     -0.00536 +- 0.06106   -0.00748 +- 0.05864  0.27
         sd x        0.80059 +- 0.00312    0.80123 +- 0.00300  1.61
         sd y        0.09092 +- 0.01031    0.09000 +- 0.00966  0.71
         mean lum    0.76794 +- 0.00000    0.76794 +- 0.00000  0.00

       The +- is the spread ACROSS worlds, which is how far the plate's
       own picture moves if you change its root constant, and it is
       0.061 in mean y. That is the size of the difference the
       substitution can make, and the two families are
       indistinguishable at 120 worlds. Colour cannot move at all: the
       palette argument and the glow depend only on `lived`, which is
       `d`, which is a stream draw, so mean luminance has world spread
       exactly zero. If the rig wants the plate's basin rather than a
       sibling of it, the fix is not in this file; it is the integer
       orbit field named at the top.

       NOT VOLUMETRIC, and not square either. The basin is a thin
       ribbon: at defaults x runs [-1.50, 1.40] and y only [-0.14,
       0.35], with z bounded by RELIEF at 0.12. Points lie on curves
       rather than through a volume, so the diffuse-plate sampling
       argument does not apply, but a fixed square view spends most of
       itself on empty ground.

       Levers, cam, gain and accent diffed programmatically against
       59-drainage.js: eight levers, labels, min, max, step and def all
       match, cam {3, 0.2, 0, 0}, gain 0.55, accent #6fb3e0.
       Zero declines at every setting, which is right: the shader has
       no far sentinel.

       Gates:
         node tools/smoke-pos.mjs positives/drainage.pos.mjs
           PASS  emits   197 GLSL lines
           PASS  defaults   20000/20000 deposit (0 decline), 0
                 malformed, 0 far-out, x [-1.50, 1.40] y [-0.14, 0.35],
                 mean lum 0.768
           PASS  defaults t=1.7   20000/20000 deposit (0 decline), 0
                 malformed, 0 far-out, x [-1.50, 1.40] y [-0.14, 0.35],
                 mean lum 0.768
           PASS  hashed levers A   20000/20000 deposit (0 decline), 0
                 malformed, 0 far-out, x [-1.50, 1.40] y [-0.14, 0.33],
                 mean lum 0.796
           PASS  hashed levers B   20000/20000 deposit (0 decline), 0
                 malformed, 0 far-out, x [-1.40, 1.28] y [-0.13, 0.21],
                 mean lum 0.768
           smoke passes
         node tools/verify-pinned.mjs drainage
           positives: 1
             fully pinned : 1
             refused      : 0
             emitted but still carrying an unpinned op: 0
       The whole corpus still reads 63 of 63 fully pinned, 0 refused.

       ONE HOUSEKEEPING NOTE FOR THE LEAD. Commit 032c448 swept up a
       mid-flight version of positives/drainage.pos.mjs (190 lines,
       192 emitted) whose register was ten bits on one lattice
       coordinate with the reach on the other. The file has since been
       widened to the twenty bit form described above, to match what
       breakdown does with the same construct and to shrink the aliased
       tail from twelve junctions to two. Every number in this report
       is from the current file.
