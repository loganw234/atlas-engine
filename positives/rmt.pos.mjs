// Plate XXII Spectra of Random Matrices, as a positive. Nothing is
// diagonalized: each ensemble is drawn from its exact finite-N law.
// Ginibre radii come by Kostlan's theorem, |lambda|^2 = Gamma(k)/N
// with k uniform in 1..N, so the walk draws k and then sums k
// exponentials; the sum is an orbit carrying its own counter, because
// the budget k is a computed draw and the loop vocabulary bounds only
// on levers or literals. Wigner and Marchenko-Pastur are direct
// density curtains in the point's own coordinate. Three MODE arms on
// the ENSEMBLE lever, one deposit.
import { positive, lever, pal, mix, clamp, TAU, PI } from "../core/measure.mjs";

export default positive("rmt_pos", {
  ensemble: lever("ENSEMBLE",  0,    2,   1,    0),
  size:     lever("SIZE N",    8,    100, 1,    60),
  aspect:   lever("MP ASPECT", 0.05, 1,   0.01, 0.4),
  scale:    lever("SCALE",     0.6,  1.6, 0.01, 1.1),
  height:   lever("HEIGHT",    0,    1.5, 0.01, 0.8),
  glow:     lever("GLOW",      0,    1,   0.01, 0.6),
  cam: { dist: 3.2, pitch: 0.42, tgtY: 0.0, rot: 0.03 },
  gain: 0.8, accent: "#a0e0d0",
},
(P, s, q, t) => {
  const ens = Math.floor(P.ensemble + 0.5);
  const scl = P.scale;
  let px = 0.0, py = 0.0, pz = 0.0, shade = 0.0;

  if (ens == 0.0) {
    // Ginibre's circular law by Kostlan: a Gamma(k) radius, k uniform
    const Nf = Math.max(4.0, Math.min(100.0, Math.floor(P.size)));
    const kf = 1.0 + Math.floor(s.u() * Nf);
    const g = s.orbit(100, { i: 0.0, acc: 0.0 }, (v) => ({
      i: v.i + 1.0,
      acc: v.acc - Math.log(Math.max(1.0e-6, s.u())),
    }), { until: (v) => v.i >= kf });
    const rad = Math.sqrt(g.acc / Nf);
    const th = TAU * q.x;
    px = rad * Math.cos(th) * scl;
    py = s.centered() * 0.03;
    pz = rad * Math.sin(th) * scl;
    shade = rad;
  } else if (ens == 1.0) {
    // Wigner's semicircle, a curtain over the density itself
    const x = 2.0 * q.x - 1.0;
    const rho = (2.0 / PI) * Math.sqrt(Math.max(0.0, 1.0 - x * x));
    px = x * 1.35 * scl;
    py = (q.y - 0.5) * 2.0 * rho * P.height;
    pz = s.centered() * 0.04;
    shade = rho;
  } else {
    // Marchenko-Pastur between its hard edges lm and lp
    const g = clamp(P.aspect, 0.05, 1.0);
    const sg = Math.sqrt(g);
    const lm = (1.0 - sg) * (1.0 - sg);
    const lp = (1.0 + sg) * (1.0 + sg);
    const x = mix(lm, lp, q.x);
    const rho = Math.sqrt(Math.max(0.0, (lp - x) * (x - lm))) / (TAU * g * Math.max(x, 1.0e-3));
    px = (x - 0.5 * (lp + lm)) * 0.9 * scl;
    py = (q.y - 0.5) * 2.0 * rho * P.height;
    pz = s.centered() * 0.04;
    shade = rho;
  }

  return s.deposit({
    xyz: [px, py, pz],
    col: pal(clamp(shade, 0.0, 1.0) * 0.7 + 0.1, [0.5, 0.45, 0.5], [0.5, 0.45, 0.45],
             [1.0, 0.95, 0.9], [0.1, 0.25, 0.5]),
    glow: 0.45 + 0.85 * P.glow,
  });
});
