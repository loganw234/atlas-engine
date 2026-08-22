# invjulia: converted
plate GLSL lines: 20   positive lines: 48
gaps: none, but one law-level restatement to know about: the emitter
      refuses draws inside ternary branches, and an expression-bodied
      orbit step cannot bind one draw to two fields, so the branch
      coin cannot be drawn and spent in the same step.
notes: The chaos game's coin rides the record one step ahead: field u
      is drawn each step and spends itself on the NEXT step's sign,
      with the init drawing the first coin. Every flip still uses its
      own fresh independent uniform, one draw per step like the
      shader's hash chain, so the law of the sign sequence (iid fair
      coins independent of the start) is unchanged; only which
      backend-specific values arrive where differs, which is already
      true of every rnd-to-stream mapping. The final drawn u goes
      unspent, mirroring the shader's own br, a dead store that is
      not carried (it never touches the deposit there either). The
      sign applies as ((u < 0.5) ? -1.0 : 1.0) * component, an exact
      IEEE negation. csqrt(z - c) is recomputed for .x and .y in the
      expression-bodied step; pure and identical both times. Sphere
      blend is componentwise scalar mix, same associativity as the
      shader's vec ops. Emit passes, smoke passes 4/4 with zero
      declines (no far sentinel in the shader). Identity probe: with
      the walk's own coin sequence replayed into a literal f64
      transcription of the shader loop, every deposit bit-equal
      across 4 configs x 4000 points.
