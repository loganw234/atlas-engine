# qjulia: converted
plate GLSL lines: 29   positive lines: 61
gaps: none
notes: The quaternion is a four-field record {x, y, z, w}; the square
      is componentwise scalar math, dot(zq.yzw, zq.yzw) written as the
      left-associated sum. esc maps like mand: the shader checks
      dot > 16 after each update, so esc = count - 1 when the final
      magnitude is past 16, else -1, which also covers an escape on
      the last allowed step. rnd.x becomes one s.u() draw for the
      ball radius (same law); the 0.33333 cube-root exponent is
      verbatim. The fast-escape discard returns s.decline(): the
      plate's far sentinel is vec3(0., -999., 0.) where the registry
      contract emits -20000; both are off-frustum discards, but flag
      it if any harness path treats the two sentinels differently.
      Smoke: defaults pass; hashed levers A FAILS the 5 percent
      deposit-rate gate at 419/20000 kept. That row is plate-lawful,
      not a conversion error: config A lands SLICE w = -0.895 and
      SHELL CUT = 0.54, and a direct f64 simulation of the ORIGINAL
      shader at those exact levers keeps 2.08 percent (mine keeps
      2.10). Most of that slice is dust and the shader discards it
      too. Identity probe: all deposits and all decline decisions
      bit-equal to the literal shader transcription across 4 configs.
