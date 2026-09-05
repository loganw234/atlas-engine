# mand: converted
plate GLSL lines: 30   positive lines: 64
gaps: log2 is not in the Math subset; said as Math.log(x) / Math.log(2.0),
      an exact identity (measured f64 difference vs log2 is under 1e-15
      relative, a couple of f32 ULPs on the GPU, on the smooth-shading
      term nu only)
notes: The shader stamps n = j on the step that escaped, checking
      dot(z, z) > 40 after every update including the last. until()
      checks before each step, so the walk derives n from the final
      state instead: past 40 means n = count - 1, otherwise n = K.
      This covers the trailing case where the very last allowed step
      escapes (until never sees it, the final magnitude does). The
      jitter is s.jitter2() in place of rnd.xy, same law. The two
      colour arms are let-assignments in a plain if/else feeding one
      deposit, since the emitter has no vec3 ternary. All constants
      verbatim, including pow(x, 2.0) rather than x*x. Emit passes,
      smoke passes 4/4 with zero declines (the shader has no far
      sentinel). A native identity probe (scratchpad, this session)
      drove the walk and a literal f64 transcription of the shader
      with the same draws over 4000 points x 4 lever/clock configs:
      every deposit bit-equal.
