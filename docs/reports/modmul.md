# modmul: converted
plate GLSL lines: 20   positive lines: 52
gaps: none
notes: A pure coordinate map, no stream draws and no loops, so the
       restatement is one to one. The shader's local `t` (position
       along the chord) is renamed `tc` because the walk's clock
       param owns the name `t`; the plate's `uT` appears only in the
       multiplier drift and becomes the walk's `t` there. All
       constants verbatim, including the vec3(0.5) palette args
       expanded to [0.5, 0.5, 0.5]. The final vec3(...)*1.25 is
       restated componentwise in the deposit's xyz. No rnd use in
       the shader, so no glow term. Lever labels copied exactly,
       including "HUE: INDEX↔LENGTH" (the arrow written as a
       literal character in the .mjs).
