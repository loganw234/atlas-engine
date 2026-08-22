# zeta: converted
plate GLSL lines: 18   positive lines: 41
gaps: none
notes: The shader's fixed 64-pass loop with `if(fn > kf + 1.0) break`
       is an orbit with literal bound 64 and an until on the same
       condition; until checks before each step, exactly where the
       shader breaks. The term index fn rides as a state field
       counting 1, 2, 3... (the shader derives it as float(nn) from
       the int loop var; same exact values). Two substitutions of
       spelling, not of value: `inversesqrt(fn)` is written
       `1.0 / Math.sqrt(fn)` because the vocabulary has no
       inversesqrt (the GLSL builtin is defined as 1/sqrt(x); the
       emitted code computes that expression, which can differ from
       the builtin by an ulp on some GPUs), and the vec2 accumulation
       `S += w*amp*vec2(cos, -sin)` is restated as the two scalar
       fields sx, sy with the same multiplication order
       ((w*amp)*cos). The plate's local `t` is the height on the
       critical line, named h in the walk; the clock param t is
       unused because the shader never reads uT.
