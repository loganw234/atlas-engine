# rainbow: converted
plate GLSL lines: 103   positive lines: 160
gaps: none
notes: The plate binds a helper, rainbow_wl2rgb, and calls it once in
       each MODE arm on the same argument lt, so the walk hoists the
       spectrum out of the arms entirely and says it once after them;
       value-identical, and it removes the only helper call. The
       shader's refraction angle is named t, which is the clock's name
       in a positive, so it is renamed tr here and nowhere else does
       the plate's t survive.

       Both MODE arms fold into one deposit. The arms differ in seat
       and in the weight w only, since colour is
       wl2rgb(lt) * w * (0.35 + 0.85 * GLOW) in both, so the walk
       carries px, py, pz and w out of the if/else and multiplies the
       spectrum in once. Grouping is preserved left to right:
       ((c * cw) * w) * tone reproduces the shader's
       (vec3(r,g,b) * scale) * w * tone exactly, which is why the
       cross-check reads zero rather than an ulp.

       Everything the shader keeps as an int is carried as a float
       whose value is an exact integer: kf = 1 + floor(u*u*M) replaces
       int k, nseg = kf + 3, and sIdx = floor(rnd.z * nseg * 0.99999).
       This is legal because every one of those int() casts is applied
       to a non-negative quantity, where GLSL truncation and floor
       agree, and it avoids Math.trunc, which the subset only accepts
       as integer division. The `if (k > 4) k = 4` guard is kept
       verbatim even though M <= 3.999 makes it unreachable.

       Draws: the emitter's s.u() returns a live reference to pt, so
       two draws inside one expression would read the same hash twice.
       The plate's triangular sun jitter u2f(hA) + u2f(hB) - 1 is
       therefore bound as two consts, gA and gB, before it is summed.
       Draw counts differ by arm, which is fine because both backends
       take the same branch for a given point: MODE 0 spends four
       draws (order pick, the two jitter draws, the azimuth), MODE 1
       spends three (wavelength, order pick, segment pick). The
       shader's lt ternary hides a draw on one side, so it is said as
       `let lt = q.y; if (mode != 0.0) { lt = s.u(); }`.

       Not volumetric in the diffuse sense. MODE 0 seats every point
       on a sphere of radius 1.25 (a surface), MODE 1 on a planar
       polyline at z = 0. Both are thin sets, so the ordinary point
       budget should correlate normally.

       Cross-check: a literal transcription of the plate's GLSL,
       replayed on the walk's own recorded draws, agrees on all six
       deposit fields to |delta| exactly 0 over 4 configs x 4000
       points (defaults; MODE 1 at t = 1.7; MODE 0 with ORDERS 4,
       DISPERSION 2.5, SUN WIDTH 3, FRESNEL 0.4; MODE 1 with ORDERS 4
       and FRESNEL 0). Coverage inside those runs: all three segment
       arms (entry beam 835-919, internal chords 2135-2314, exit ray
       851-946 of 4000) and all four bounce counts k = 1..4. Two
       negative controls both fired: perturbing the spectrum's 0.62
       to 0.63 diffs 15998/16000 points at 1.6e-2, and perturbing the
       seat scales 1.25 and 0.72 in their seventh decimal diffs
       16000/16000 at 1.4e-7.
