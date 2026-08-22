# buddha: converted
plate GLSL lines: 33   positive lines: 82
gaps: two vocabulary pinches, both resolved by restructuring, neither
      a blocker: (1) draws are refused inside ternary branches, so the
      shader's per-step reservoir coin cannot be said in place; (2)
      s.pick only takes a lever or a literal, so the dynamic-bound
      index draw is said as Math.min(Math.floor(s.u() * mF), mF - 1.0),
      which is pick's own clamped law with a runtime bound.
notes: The reservoir is restated, same law: keeping each visited
      iterate with probability 1/(j+1) leaves a uniform choice among
      the m = esc + 1 visited iterates, and the trajectory of z
      depends only on c, never on those coins. So the walk runs the
      orbit once for the escape time, draws the stop's index outright,
      and runs the identical orbit again, capturing iterate idx + 1
      through record fields kx, ky that select by value ternaries on
      (k == idx). Draw order: two jitter draws, then the one index
      draw after both decline gates, so declined points spend two
      draws on both backends. The cardioid and period-2 bulb cull and
      the esc < 0 or esc < minEsc gate return s.decline() (plate
      sentinel is -999, registry emits -20000, both off-frustum).
      esc maps as count - 1 when the final magnitude is past 16, else
      -1, covering last-step escapes. The escaping iterate itself is
      a capture candidate exactly as in the shader, so occasional
      seats reach |x| near 13 at SCALE 0.72; smoke's far-out gate
      (24) is not touched. Smoke: 3/4 pass; hashed levers B FAILS the
      5 percent deposit-rate gate at 101/20000. Plate-lawful: config
      B sets MIN ESCAPE = 65, and a direct f64 simulation of the
      ORIGINAL shader law at those levers keeps 0.54 percent (mine
      0.51). The deep filaments are rare by design; the plate caption
      says MIN ESCAPE hollows out the quick escapers. Identity probe:
      all deposits and declines bit-equal to a literal shader
      transcription that consumes the same index draw, across 4
      configs x 4000 points. GPU cost note: the orbit runs twice, up
      to 2 x 400 iterations per point, versus one pass in the shader.
