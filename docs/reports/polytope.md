# polytope: converted
plate GLSL lines: 49   positive lines: 125
gaps: none
notes: The shader's seed hash chain becomes stream draws of the same
      law: s.pick(16) for the tesseract corner, s.pick(4) for axes,
      s.u() < 0.5 coins for signs. No bitwise operators exist in the
      subset, so the corner's four sign bits come out of the pick by
      vi % 2 and Math.trunc(vi / 2^k) % 2, the same sixteen-way map
      the shader's bit masks read. The distinct-axis nudge (if b == a,
      b = (b+1) % 4) and the 24-cell's k adjusted only against i (so
      B can degenerate to A when k lands on j, as in the plate) are
      verbatim. poly_e(idx, val) inlines as per-component ternaries.
      vec4 rotations and both projections written out componentwise;
      col reads Q1w, the w after the xw rotation, which the yz plane
      never touches. Edge body jitter is two centered draws with the
      first reused on x and z, preserving the shader's rnd.zwz
      correlation. Draw counts differ per POLYTOPE arm (2/4/6 draws
      before the jitter pair); both evaluators branch identically on
      the lever, and no draws sit in ternary branches (coins draw in
      the ternary condition). MODE arms restructured as if/else-if on
      floor(P+0.5) compared to float literals. Smoke: all rows pass,
      zero declines, matching a shader with no far sentinel.
