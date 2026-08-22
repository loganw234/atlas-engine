// Plate XV Hydrogen Orbitals, as a positive. The point is a genuine
// sample of |psi|^2: the direction comes off q as uniform measure on
// the sphere, the radius is importance-sampled from the exact R_nl
// envelope as a Gamma(2l+3, n/2) sum of exponential draws, and one
// rejection draw against amp^2 leaves the accepted cloud the true
// quantum density, radial nodes and all. The shader's two helper
// functions, the Laguerre recurrence and the spherical harmonic
// table, come inside the walk: the recurrence is a short orbit, the
// harmonic table a pure ternary chain on the snapped quantum numbers.
import { positive, lever, mix3, mul3, step, TAU }
  from "../core/measure.mjs";

export default positive("orbital_pos", {
  n:       lever("n (shell)",     1,    4,    1,     3),
  l:       lever("ℓ (subshell)", 0, 3,   1,     2),
  m:       lever("m",            -3,    3,    1,     0),
  size:    lever("SIZE",          0.02, 0.12, 0.001, 0.055),
  density: lever("DENSITY",       0.2,  4,    0.02,  1.6),
  glow:    lever("GLOW",          0,    1,    0.01,  0.6),
  cam: { dist: 3.0, pitch: 0.24, tgtY: 0.0, rot: 0.05 },
  gain: 1.0, accent: "#9fd0ff",
},
(P, s, q, t) => {
  // the quantum numbers, snapped and clamped exactly as the shader
  // clamps them: l under n, m within the l band, m rounded away from
  // zero on the negative side
  const nI = Math.max(1.0, Math.min(4.0, Math.floor(P.n + 0.5)));
  const lI = Math.max(0.0, Math.min(nI - 1.0, Math.floor(P.l + 0.5)));
  const mI = Math.max(-lI, Math.min(lI, Math.floor(P.m + ((P.m < 0.0) ? -0.5 : 0.5))));

  // the direction: cos(theta) uniform off q.x, azimuth off q.y
  const ct = 1.0 - 2.0 * q.x;
  const st = Math.sqrt(Math.max(0.0, 1.0 - ct * ct));
  const ph = TAU * q.y;
  const dirx = st * Math.cos(ph);
  const diry = ct;
  const dirz = st * Math.sin(ph);

  // the radius as Gamma(2l+3, n/2): kG exponential draws summed, one
  // per step, the j field counting the shader's early break
  const kG = 2.0 * lI + 3.0;
  const g = s.orbit(9, { r: 0.0, j: 0.0 }, (z) => ({
    r: z.r + (-Math.log(Math.max(1.0e-6, s.u()))),
    j: z.j + 1.0,
  }), { until: (z) => z.j >= kG });
  const r = g.r * (nI * 0.5);
  const x = 2.0 * r / nI;

  // associated Laguerre L_{n-l-1}^{2l+1}(x) by the upward recurrence;
  // orders p <= 0 are the constant 1, and the recurrence starts from
  // L0 = 1, L1 = 1 + a - x exactly as the shader seeds it
  const aL = 2.0 * lI + 1.0;
  const pL = nI - lI - 1.0;
  const lag = s.orbit(2, { lkm1: 1.0, lk: 1.0 + aL - x, j: 1.0 }, (z) => ({
    lkm1: z.lk,
    lk: ((2.0 * z.j + 1.0 + aL - x) * z.lk - (z.j + aL) * z.lkm1) / (z.j + 1.0),
    j: z.j + 1.0,
  }), { until: (z) => z.j >= pL });
  const Lv = (pL <= 0.0) ? 1.0 : lag.lk;

  // the real spherical harmonic: the azimuthal factor by the sign of
  // m, the polar table by l and |m|, verbatim from the shader
  const amI = Math.abs(mI);
  const az = (mI > 0.0) ? Math.cos(amI * ph)
           : ((mI < 0.0) ? Math.sin(amI * ph) : 1.0);
  const Pl = (lI == 0.0) ? 1.0
           : (lI == 1.0) ? ((amI == 0.0) ? ct : st)
           : (lI == 2.0) ? ((amI == 0.0) ? (1.5 * ct * ct - 0.5)
                          : ((amI == 1.0) ? st * ct : st * st))
           : ((amI == 0.0) ? (ct * (2.5 * ct * ct - 1.5))
           : ((amI == 1.0) ? st * (5.0 * ct * ct - 1.0)
           : ((amI == 2.0) ? st * st * ct : st * st * st)));
  const amp = Lv * (Pl * az);

  // the rejection: where |psi|^2 is small the cloud thins, and the
  // nodes go dark; DENSITY scales the acceptance
  if (s.u() > amp * amp * P.density) {
    return s.decline();
  }

  // warm lobes carry positive psi, cool lobes negative
  return s.deposit({
    xyz: [dirx * r * P.size, diry * r * P.size, dirz * r * P.size],
    col: mul3(mix3([0.25, 0.55, 1.0], [1.0, 0.52, 0.20], step(0.0, amp)),
              0.35 + 0.9 * P.glow),
  });
});
