# ifs: converted
plate GLSL lines: 27   positive lines: 69
gaps: none
notes: The chaos game is the orbit construct with the coin in the
       state. An orbit field cannot both draw and be shared by its
       siblings, so the walk draws the coin kv one step ahead: the
       init draws the first coin (after the three start draws that
       restate rnd.xyz), each step spends st.kv on the move and draws
       the next, and last trails one behind so it finishes on the
       vertex the final move used, exactly the shader's last. This
       costs one trailing draw the shader does not make (never spent),
       and shifts which hash in the chain feeds which coin; the brief
       licenses that (law over draw sequence). In fact the alignment
       is exact: a literal JS port of the shader consuming the same
       stream in its natural order uses the very same draws, and
       matches the walk to 7e-16 over 3 settings x 4000 points,
       including ITERATIONS 28 and TWIST -0.55.
       The golden-spiral vertex (helper ifs_vertex in the plate) is
       inlined into each affected field because orbit fields are
       single expressions; the radical is recomputed four times per
       step in the emitted GLSL, identical values, CSE fodder.
       floor(u*n) is kept unclamped exactly as the shader (no pick());
       n = max(P[0], 3.0) stays float. The walk is the 2-param form:
       the shader reads neither q nor uT. Levers/cam/gain/accent
       diffed programmatically: match ("HUE: RADIUS↔ADDRESS" verbatim).
       Smoke passes, zero declines.
