# cursum: converted
plate GLSL lines: 68   positive lines: 85
gaps: none
notes: The finite-difference loop is ideal orbit material: every
       right-hand side in the shader's iteration reads pre-iteration
       values, so the simultaneous update is exact, with Sprev
       riding as px, py (written from v.sx, v.sy) and dLast as dl.
       The loop bound N depends on q.x, which staticBoundOf cannot
       accept, so the orbit takes the literal bound 768 (the
       shader's own cap) and carries n as a state field for
       until (v) => v.n > Nf, the shader's `if (n > N) break` in the
       same pre-step position. The unchanged third difference must
       still be written each step (d3: v.d3) because the CPU orbit
       replaces the whole state record with the step's return.
       N's int cast is floor (nonnegative argument), kept as the
       float Nf; float(N - 1) is Nf - 1.0, exact integers under 768.
       One spelling substitution as in zeta: the vocabulary has no
       inversesqrt, so the soft radial clamp is 1.0 / Math.sqrt(...),
       which can differ from the builtin by an ulp on some GPUs.
       The KIND arms are an if / else if chain assigning th, d1, d2,
       d3 exactly in the shader's arm order (1, 2, 3, else), all
       constants verbatim. uT appears in the pen-stroke highlight
       and becomes the walk's t. No draws at all and no sentinel, so
       zero declines, which smoke confirms. Verified beyond smoke:
       the walk matches a direct f64 transliteration of the whole
       shader bitwise (worst abs diff 0) over 16000 points across
       all four KIND arms at a nonzero PHASE.
