// Plate XII A Quaternion Julia Set, as a positive. The point is a
// uniform sample of a ball in the 3D slice; the orbit squares a
// quaternion and adds c, which is just a four-field record. Orbits
// that escape at once are declined off the frustum, late escapers
// trace the luminous boundary shell, prisoners fill the dim interior.
import { positive, lever, pal, TAU } from "../core/measure.mjs";

export default positive("qjulia_pos", {
  c1:    lever("C · 1",      -1, 1,   0.005, -0.20),
  ci:    lever("C · i",      -1, 1,   0.005,  0.60),
  cj:    lever("C · j",      -1, 1,   0.005,  0.20),
  ck:    lever("C · k",      -1, 1,   0.005,  0.20),
  slice: lever("SLICE w",    -1, 1,   0.005,  0.0),
  iters: lever("ITERATIONS",  6, 16,  1,      11),
  cut:   lever("SHELL CUT",   0, 0.9, 0.01,   0.45),
  cam: { dist: 3.4, pitch: 0.25, tgtY: 0.0, rot: 0.06 },
  gain: 0.55, accent: "#ff8f7a",
},
(P, s, q, t) => {
  // a uniform random point of a ball in the slice: q seats the
  // direction on the sphere, one draw cube-roots into the radius
  const ct = 1.0 - 2.0 * q.x;
  const st = Math.sqrt(Math.max(0.0, 1.0 - ct * ct));
  const ph = TAU * q.y;
  const rad = 1.35 * Math.pow(s.u(), 0.33333);
  const x0 = st * Math.cos(ph) * rad;
  const y0 = ct * rad;
  const z0 = st * Math.sin(ph) * rad;

  // the quaternion square, (a; b, c, d) with a the scalar part:
  // a becomes a^2 - |v|^2 and the vector part 2 a v, plus c
  const K = P.iters;
  const o = s.orbit(P.iters, { x: x0, y: y0, z: z0, w: P.slice }, (r) => ({
    x: r.x * r.x - (r.y * r.y + r.z * r.z + r.w * r.w) + P.c1,
    y: 2.0 * r.x * r.y + P.ci,
    z: 2.0 * r.x * r.z + P.cj,
    w: 2.0 * r.x * r.w + P.ck,
  }), { until: (r) => r.x * r.x + r.y * r.y + r.z * r.z + r.w * r.w > 16.0 });

  // the shader stamps esc on the step that pushed |q|^2 past 16,
  // checking after every update including the last, so the final
  // magnitude decides; esc stays -1 for a prisoner
  const q4 = o.x * o.x + o.y * o.y + o.z * o.z + o.w * o.w;
  const esc = (q4 > 16.0) ? (o.count - 1.0) : -1.0;

  // escaped fast: far outside the set, declined off the frustum
  if (esc >= 0.0 && esc < P.cut * K) {
    return s.decline();
  }

  // interior dim, shell bright
  const glow = (esc < 0.0) ? 0.35 : 1.5;
  const hue = (esc < 0.0) ? rad * 0.45 : esc / K;
  return s.deposit({
    xyz: [x0 * 0.95, y0 * 0.95, z0 * 0.95],
    col: pal(hue * 0.6 + 0.12,
             [0.42, 0.30, 0.50], [0.45, 0.35, 0.40],
             [1.0, 0.90, 0.70], [0.78, 0.52, 0.18]),
    glow: glow,
  });
});
