# vortex: converted
plate GLSL lines: 99   positive lines: 186
gaps: one, worked around exactly and worth the lead's attention.
       The vocabulary has no one-argument atan. Math.atan2 is mapped to
       GLSL's two-argument atan, and Math.atan is refused outright
       ("Math.atan is not in the subset"). The shader's Gouy phase is
       the one-argument form:
           float psi  = atan(zp/zR);                       /* Gouy   */
       written here as Math.atan2(zp, zR), which is the same angle for
       any zR > 0, and zR = 0.5 * vortex_K * w0^2 = 10 w0^2 with
       w0 = max(0.08, P[3]) can only be at least 0.064. The
       cross-check was run twice, once with the port transcribing the
       shader's atan(zp/zR) literally and once with atan2, and both
       give |delta| exactly 0 over 32000 sampled deposits, so the
       substitution costs nothing even at f64. On the GPU the two
       builtins could differ in the last f32 ulp of a hue; nothing else
       reads psi. If a one-argument atan is ever added to the
       vocabulary, this is the site.
notes: The shader's three helpers become expressions. vortex_lag is a
       ternary chain of its four written-out cases, verbatim including
       the n <= 0 test rather than n == 0. vortex_rad's power loop
       (t = 1.0, multiplied by sqrt(max(x,0)) exactly L times) is a
       ternary chain on |l| = 0..5 building the same left-to-right
       product; 1.0 * s is exactly s in IEEE, so the chain and the loop
       agree bit for bit rather than nearly.
       vortex_peak is an orbit over the shader's 31-point sweep of
       [0, 6]. Its sample point xk and that point's square root sk ride
       the record one step ahead of use, set from 0.2 * (k + 1) and
       spent by the next step, with the init the shader's own i = 0
       sample (0.0, and sqrt(max(0,0)) is exactly 0). Without the lag
       the radial factor would carry sixteen copies of the sqrt in one
       expression; with it, each reads a bound field.
       Arm order is changed and the reason matters: SUPERPOSE 0 and 1
       read the same amplitude A = rad(pn, L, x) / peak(pn, L), so
       they are nested under one peak sweep, and the beat arm
       (SUPERPOSE 2) is lifted out first. No draws live in any arm, so
       the reordering cannot move the stream; it saves a whole 31-step
       sweep of GLSL per point in the beat arm. In that arm the
       polynomial selector is specialized because the shader itself
       passes literals: vortex_lag(0, a, x) is identically 1.0 and
       vortex_lag(1, a, x) is 1.0 + a - x, and the first is dropped as
       a factor rather than written as * 1.0.
       The core probe's draw sits inside its if, as the shader's
       rnd.z does not; both evaluators sequence the draw identically
       inside the block, so this is a draw-count difference from the
       plate and not a law difference.
       Levers, cam, gain, accent diffed against the plate
       programmatically: match, seven levers, and the label
       "ℓ CHARGE" carries its Unicode verbatim.
       Smoke passes all four rows. Declines are the plate's own
       intensity floor (inten < 2e-4), which is what makes the dark
       core dark; about 34 percent at defaults, and that is lawful,
       not an error.
       Identity probe: a literal f64 transcription of the shader,
       replayed on the walk's own recorded draws, matches every
       deposit field bit for bit, worst |delta| exactly 0 over eight
       configs x 4000 points (26281 deposits compared, 5719 shared
       declines, 0 decline mismatches) covering all three SUPERPOSE
       arms, l = -5, -4, 0, 1, 2, 3, 5, p = 0..3, WAIST 0.15 / 0.28 /
       0.4 / 0.45, Z RANGE 0.4 / 1.2 / 1.5, SPIN 0 / 1 / 3 and
       t = 0 / 0.6 / 1.1 / 1.7 / 2.9. Negative control fired three
       times: 0.15 -> 0.1501 in the petal detuning moves only the two
       SUPERPOSE 1 configs (worst 6.0e-4, and it also flips two points
       across the intensity floor, so the decline test sees it too),
       2.0 -> 2.0001 in the Gouy beat moves only the three SUPERPOSE 2
       configs (worst 5.9e-5), and 0.02 -> 0.020001 in the shared
       core-probe density moves configs in all three arms (worst
       8.1e-6), which is the arm coverage the other two do not give.
       VOLUMETRIC. This plate genuinely fills a 3D volume: the deposit
       is (zp, rr cos ph, rr sin ph) with zp uniform across
       +-Z RANGE and rr swept through the beam envelope, so the cloud
       is a solid cylinder rather than a sheet with a jitter. Budget
       sampling accordingly; a low correlation at 2^20 points is more
       likely the per-cell Poisson floor than a defect, and it should
       fall at the shot-noise rate as the point count rises.
