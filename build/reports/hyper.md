# hyper: converted
plate GLSL lines: 79   positive lines: 156
gaps: none
notes: Three loops, three constructs. Raising Q until the tiling is
       hyperbolic is an orbit of {nq, cq} over the literal bound 8 whose
       until() is the shader's own break, and because every next field
       is computed from the previous state, cq: cos(PI / (v.nq + 1.0))
       lands on exactly the cos(PI/float(nq)) the shader computes after
       its nq += 1. The word is the second orbit, over the literal 24,
       stopped by a countdown field: left starts at klen and until()
       fires at zero, which is the plate's if (j >= klen) break.

       TWO things ride ahead of their use in the word orbit, because a
       field cannot both draw and be read by its siblings. m is the
       mirror this step applies, computed at the end of the previous
       step, and uu is the uniform that will choose the next one. The
       plate hashes once per letter and reads that hash two ways: as a
       three-way pick through u2f when there is no last mirror to avoid,
       and as the low bit's parity otherwise. The parity bit does not
       survive u2f, so the coin becomes uu < 0.5: a fair coin either
       way, the polytope precedent. Total draws are klen + 3 against the
       plate's klen + 1, two more, same law. Note the plate's own klen
       comes from rnd.w = u2f(h4) while its first hash is hashu(h4), so
       the plate correlates a point's word length with its first letter;
       the walk's draws are independent. Stochastic texture, not
       geometry.

       THE DRIFT CLAMP is the one real restructuring. The shader ends
       each letter with if (dot(z,z) > 0.998001) z *= 0.999 *
       inversesqrt(zz), a test on the value that step just made, which
       simultaneous update cannot see. So the orbit carries the RAW
       reflected point plus sc, the factor the clamp would have applied,
       and every read of z is zx * sc, zy * sc. Multiplying by a stored
       factor is bit-identical to having multiplied in place, and sc is
       exactly 1.0 when the clamp does not fire, so nothing is
       approximated. The price is that the two reflected coordinates are
       written out at five sites each (once as the new zx or zy, four
       times inside sc, whose squared norm appears in both the test and
       the sqrt), the way tpms writes its Newton stanzas. The file is
       generated from one copy of each expression so the five sites are
       textually identical by construction.

       inversesqrt has no name in the subset and is written 0.999 *
       (1.0 / sqrt(zz)), which keeps the shader's two roundings in the
       shader's order rather than folding them into one division.
       cmul and cdiv are the vocabulary's own, and they match the shared
       header's definitions exactly, epsilon included. Vec2 values never
       meet a bare + in the walk, since the core's Vec2 has no operator;
       vec2(1.0, 0.0) + cmul(...) is written componentwise as
       1.0 + cm.x and cm.y. That last one drops an exact 0.0 + which can
       only matter if cm.y is exactly negative zero.

       MODE arms are floor(P + 0.5) against float literals throughout,
       so no int typing enters and no int division can refuse.

       Two declines: the numerical wedge guard on the birth point, which
       fires about once in 4000, and the hyperboloid lift's |z| > 0.985
       cut, which only exists when MODEL > 0.001. Both are the plate's
       vec3(0., -999., 0.), emitted as the contract's -20000.

       Identity probe: a literal f64 transcription of the shader driven
       by the walk's recorded draws, 6 configurations covering the raise
       loop taken and not taken ({3,3}, {4,4}, {7,3} against {5,4},
       {8,8}), word lengths 2 through 24, MODEL at 0, 0.001, 0.5 and 1,
       four clocks, 4000 points each: 143,964 fields, 0 decline
       mismatches, worst relative delta 2.220e-16. Every one of those
       deltas is the definition of mix: GLSL specifies x*(1-a) + y*a
       while core/measure.mjs computes x + (y-x)*a. Model mix the core's
       way and all six configurations are bit-identical, worst rel 0.0,
       and the deltas appear only where MODEL is nonzero, which is where
       mix does any work. That difference is the core's corpus-wide, not
       this plate's. Negative controls both fired: a 1 percent
       perturbation of r*r in the arc inversion diffs at 4.3e-1 to
       1.1e+3 across all six configurations, and a 0.2 percent
       perturbation of the disk scale 1.2 diffs at 1.3e-3 to 2.0e-3 in
       the five configurations where the disk model is visible, staying
       at noise in the MODEL 1 configuration where the disk term is
       mixed entirely out, which is correct rather than blind.

       Not volumetric: the disk model is flat in xz and the hyperboloid
       lift is a surface, so points land on a two-dimensional set with
       no thickness at all. Expect a clean correlation at ordinary point
       counts.
