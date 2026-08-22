# ford: converted
plate GLSL lines: 79   positive lines: 129
gaps: log2 is not in the Math subset; said as Math.log(x) / Math.log(2.0)
      as mand did, an exact identity carrying about 1e-15 relative
      difference in f64 (a couple of f32 ULPs on the GPU), and only on
      the palette argument, never on geometry.
notes: The helper ford_gcd is Euclid's algorithm as an orbit: state
       {a, b}, step {b, mod(a, b)}, until b == 0, bound 14, exactly the
       shader's fourteen divisions. until checks before the step, so the
       walk never evaluates mod(a, 0). All the integers are small (q at
       most 80 in MODE 0, mediant denominators at most 49792 measured at
       TREE DEPTH 24, all well inside f32's exact range) and ride as
       floats, so the shader's a - (a/b)*b is mod(a, b) and its int()
       casts, on non-negative values only, are Math.floor.
       The two MODE arms are an if/else over floor(P[0] + 0.5) writing
       let-bound px, py, pz, tint and bright, with a single deposit at
       the end; col *= <scalar> in both arms is that deposit's glow.
       One decline site, the plate's -999 flavour of the far sentinel.
       MODE 1's descent bits are hashu(seed)'s bit window in the shader
       and stream draws here, the coin riding one step ahead of the move
       it decides (the ifs pattern: init draws the first, each step
       spends the one it was handed and draws the next, one trailing
       draw never spent). kSel is one draw before the orbit. The orbit
       bound is P.depth itself, whose lever range is exactly [2, 24], so
       the shader's D = max(2, min(24, D)) is a no-op on it; the clamp
       is still written out where D feeds kSel.
       Draw counts differ by arm (2 in MODE 0, 2 + TREE DEPTH in MODE 1);
       both evaluators branch identically on the lever and no draw sits
       in a ternary or behind a short circuit.
       Cross-check (scratchpad, this session): the walk and a literal f64
       transcription of the plate's GLSL driven off one recorded draw
       tape, 4000 points x 6 lever/clock settings covering both arms,
       19400 deposits compared field by field. Worst relative delta
       4.24e-15 (MODE 1, TREE DEPTH 24), zero structural mismatches, and
       the decline sets agree point for point. Negative control fired:
       perturbing the sampler exponent 0.45454545 to 0.45454540 and the
       kSel phase 1.7 to 1.70001 moved the worst delta to 1.41e-4.
       An independent property probe (not the transcription) confirms
       the number theory: at q.x = 0 every MODE 1 endpoint is an exact
       p/q in lowest terms at all four depths, and every MODE 0 survivor
       is a reduced fraction with q <= Q MAX, all 40 denominators seen.
       Levers, cam, gain and accent diffed programmatically against the
       plate: all match, labels included.
       Not volumetric: MODE 0 is circles in the y = 0 plane lifted only
       by LIFT (default 0), MODE 1 a chord between two circle tops.
