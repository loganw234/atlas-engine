# wpath: converted
plate GLSL lines: 50   positive lines: 84
gaps: none
notes: One orbit, n = 24 literal (the shader's own fixed bound), with
       the loop counter carried in the state because until() sees only
       the state: the shader breaks when w = clamp(nf - i, 0, 1) hits
       zero, which is exactly nf - i <= 0, and until checks before
       each step just as the shader breaks before accumulating. The
       three FUNCTION arms live as value ternaries inside the orbit
       fields, selected by fsel = floor(P[0] + 0.5) held as a float
       and compared by equality; the lever is integer-stepped so the
       comparisons are exact. Simultaneous update matches the shader's
       ordering for free: term, rel, and the Takagi mean all read the
       incoming amp and phase, then the envelope decays and the phase
       advances. The shader's local `t` (phase in turns) is renamed
       `tn`; its `s` (partial sum) is `ps`. The Riemann arm ticks amp
       and tn unused, as the shader does. The plate reads neither rnd
       nor seed, so the walk makes zero draws and the pair is
       deterministic point for point: an f64 literal transcription of
       the shader matches the walk to max |diff| = 0 (bit-exact) over
       4 configs x 4000 points covering all three arms, deep ZOOM, and
       t = 0 / 1.7 / 2.9. Expression duplication from expression-bodied
       fields: clamp(nf - st.i, 0, 1) appears three times per step,
       value-identical. Levers, cam, gain, accent copied verbatim.
       Smoke passes, zero declines (shader has no far sentinel).
