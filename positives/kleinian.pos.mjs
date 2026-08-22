// Plate XVII Indra's Pearls, as a positive. A ring of nc circles of
// common radius cr, centres on a circle of radius ring; the walk
// reflects a hashed starting point in one randomly chosen circle per
// step, and the orbit condenses onto the limit set of the inversion
// group. The chosen index rides the state one step ahead of its use,
// as in the chaos game: a step's inversion centre comes from the kv
// the previous step drew, because a single draw cannot feed several
// sibling fields. One draw more than the plate in total; same law.
// The finished point is blended between the flat plane and its
// inverse stereographic image on the sphere.
import { positive, lever, pal, mix, clamp, TAU, PI } from "../core/measure.mjs";

export default positive("kleinian_pos", {
  circles: lever("CIRCLES",       3,   6,    1,     3),
  ring:    lever("RING",          0.6, 1.6,  0.01,  1.0),
  radius:  lever("RADIUS ×tan", 0.6, 1.25, 0.005, 1.0),
  iters:   lever("ITERATIONS",    6,   40,   1,     22),
  scale:   lever("SCALE",         0.6, 1.8,  0.01,  1.2),
  flat:    lever("SPHERE ↔ FLAT", 0, 1,  0.01,  1.0),
  glow:    lever("GLOW",          0,   1,    0.01,  0.55),
  cam: { dist: 3.2, pitch: 0.20, tgtY: 0.0, rot: 0.06 },
  gain: 0.7, accent: "#f6a6ff",
},
(P, s) => {
  // the ring: nc circles at bearing k/nc turns, radius cr chosen as a
  // multiple of the tangency radius ring sin(pi/nc)
  const ncf = Math.max(3.0, Math.min(6.0, Math.floor(P.circles + 0.5)));
  const ring = P.ring;
  const cr = P.radius * ring * Math.sin(PI / ncf);

  // a hashed start in the square, and the first coin
  const j = s.jitter2();

  // each step inverts z in circle kv of the ring: centre C at bearing
  // kv/nc of the circle of radius ring, z maps to C + cr^2 (z-C)/|z-C|^2.
  // The centre and difference are inlined per coordinate because orbit
  // fields are single expressions; the values are identical.
  const g = s.orbit(P.iters, {
    zx: j.x * 2.0 * ring,
    zy: j.y * 2.0 * ring,
    kv: Math.floor(s.u() * ncf),
    last: 0.0,
  }, (v) => ({
    zx: ring * Math.cos(v.kv / ncf * TAU)
      + cr * cr * (v.zx - ring * Math.cos(v.kv / ncf * TAU))
        / ((v.zx - ring * Math.cos(v.kv / ncf * TAU)) * (v.zx - ring * Math.cos(v.kv / ncf * TAU))
         + (v.zy - ring * Math.sin(v.kv / ncf * TAU)) * (v.zy - ring * Math.sin(v.kv / ncf * TAU)) + 1.0e-6),
    zy: ring * Math.sin(v.kv / ncf * TAU)
      + cr * cr * (v.zy - ring * Math.sin(v.kv / ncf * TAU))
        / ((v.zx - ring * Math.cos(v.kv / ncf * TAU)) * (v.zx - ring * Math.cos(v.kv / ncf * TAU))
         + (v.zy - ring * Math.sin(v.kv / ncf * TAU)) * (v.zy - ring * Math.sin(v.kv / ncf * TAU)) + 1.0e-6),
    kv: Math.floor(s.u() * ncf),
    last: v.kv,
  }));

  // the plane, and the sphere by inverse stereographic projection;
  // the SPHERE lever blends between them per coordinate
  const dd = g.zx * g.zx + g.zy * g.zy;
  const cl = clamp(P.flat, 0.0, 1.0);
  const px = mix(g.zx * P.scale, 2.0 * g.zx / (dd + 1.0) * (P.scale * 1.15), cl);
  const py = mix(g.zy * P.scale, 2.0 * g.zy / (dd + 1.0) * (P.scale * 1.15), cl);
  const pz = mix(0.0, (dd - 1.0) / (dd + 1.0) * (P.scale * 1.15), cl);

  // hue follows the last circle the orbit touched
  return s.deposit({
    xyz: [px, py, pz],
    col: pal(g.last / ncf * 0.9 + 0.05, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
             [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]),
    glow: 0.5 + 0.7 * P.glow,
  });
});
