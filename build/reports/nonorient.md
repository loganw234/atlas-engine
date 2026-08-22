# nonorient: converted
plate GLSL lines: 26   positive lines: 80
gaps: none
notes: A pure parametrization: q.x and q.y are the two patch
       coordinates, no clock is read, so the walk takes the 3-param
       form (P, s, q). The shader binds one vec3 pos and fills it in
       whichever SURFACE arm runs; a name declared inside an emitted
       if-block is not readable after it, so the walk declares px, py,
       pz and shade as mutable scalars before the branch and assigns
       into them. The 0.0 seeds those four carry are never observable:
       every arm of the if/else-if/else writes all four, exactly as the
       shader's uninitialized vec3 is always written.

       MODE arms are floor(P.surface + 0.5) compared against 0.0 and
       1.0, the tpms/kleinian precedent, which keeps the selector a
       float and avoids int typing entirely. The shader's local float
       named t in the Klein arm is the lemniscate's tube radius, not
       the clock; it is renamed tube so that t keeps its one meaning
       across the corpus.

       THICKNESS is three centered draws applied after the branch, in
       the shader's x, y, z order, so every arm consumes the same three
       draws in the same place. rnd.xyz are three independent uniforms
       in the shared header (u2f of h1, h2, h3), so three s.centered()
       calls are the same law. Association preserved throughout:
       (tube * cos u) * 0.5, ((2 * dx) * dz) * 1.15, and col * (0.5 +
       0.7 * GLOW) as the deposit's single glow factor.

       CUTAWAY declines. The plate's far sentinel is vec3(0., -999., 0.)
       where the registry contract emits -20000, the same divergence
       qjulia flagged; both are off-frustum discards. At the default
       CUTAWAY of 1 no point declines, since q.y < 1 always.

       Identity probe: a literal f64 transcription of the shader, driven
       by the walk's recorded draws, over 6 configurations covering all
       three SURFACE arms at four clocks, 4000 points each (117,354
       fields compared, 0 decline mismatches). Worst relative delta
       4.686e-14, and it is entirely one modelling choice: the Roman
       arm's shade is length(pos), which the core's vocabulary spells
       Math.hypot. Model length() as Math.hypot in the transcription too
       and every field of every configuration is bit-identical (worst
       rel 0.0); model it as sqrt(dot) and the 4.7e-14 appears only in
       the three colour fields of the Roman arm, never in the geometry.
       Negative controls both fired: a 1 percent perturbation of the
       Roman arm's 2.3 diffs at 1.1e+2 in that arm and stays exact in
       the other two, and a 0.0005 perturbation of the shared palette
       offset diffs at 9.4e-1 to 5.0e+0 in all three arms, so the
       comparator sees a planted fault wherever it is planted.

       Not volumetric: every point lands on a two-dimensional surface,
       spread only by the THICKNESS shell, so per-cell density should
       be as tight as any other surface plate.
