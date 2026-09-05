# penrose: converted
plate GLSL lines: 22   positive lines: 60
gaps: none
notes: The per-direction lattice coordinate nk is one draw spent by
       both projections (physical and internal), so it rides the
       orbit state one step ahead of its use, the ifs coin pattern:
       init draws the first, each step spends its predecessor and
       draws the next. One draw more than the plate per point; same
       law (uniform on the integers -M..M, i.i.d. across k). The
       shader's fold clamp `max(4, min(12, int(P[0]+0.5)))` is an
       identity on the lever domain (integers 5..12); the clamp
       survives verbatim in foldf, which feeds the angles, while the
       orbit bound is the lever itself, which the emitter converts
       with the same `int(P[0] + 0.5)` rounding and bounds statically
       at 12, exactly the shader's `for(k<12){if(k>=fold)break;}`.
       The rejection sentinel in this plate is vec3(0.0, -999.0, 0.0)
       rather than the canonical -20000; s.decline() emits -20000.
       Both are the far void, well off any camera, but the constant
       differs from the plate's, worth knowing before conformance.
       dot(intr, intr) is restated componentwise as ix*ix + iy*iy
       (the same products and sum). Declines are the subject here,
       cut-and-project IS rejection sampling: about 11% of points
       deposit at defaults, and smoke passes all rows.
