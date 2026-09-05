# tpms: converted
plate GLSL lines: 33   positive lines: 225
gaps: none
notes: The shader binds tpms_F and tpms_grad as helpers; the walk has
      no helper functions, so the four-surface selector ternary repeats
      at every probe of F (35 expansions), value-identical at each
      site. The Newton loop needs bound intermediates (f, the three
      gradient components, the shared denominator dot(g,g)+1e-4),
      which an expression-bodied orbit step cannot hold, so the four
      bounded iterations are unrolled as four guarded if-stanzas on
      float(it) < NEWTON STEPS, each the loop body verbatim; no draws
      inside, so the unroll cannot diverge across backends. rnd.x (the
      probe's third coordinate) is one s.u() draw, the only draw.
      Deposit x-range runs past the naive +-1.3 block (seen to +-7.8):
      near-critical gradients make Newton jump cells, and the landed
      point still passes the residual gate. That is the plate's own
      law, confirmed by an independent literal f64 port of the
      original GLSL: 16000 points x 4 settings (all four surfaces,
      NEWTON STEPS 1/2/3/4, slab cuts on and off), zero decline
      disagreements, zero component mismatches, worst |delta| exactly
      0. Far sentinel: plate says -999, registry contract emits
      -20000; both off-frustum, flag if any harness path treats them
      differently. Smoke passes all four rows; hashed levers B keeps
      21 percent (SLAB CUT drawn high declines most of the block,
      lawful: threshold (0.5 - slab) * 5.2 crosses the block's z-span
      near slab 0.75 and empties it entirely above ~0.87).
