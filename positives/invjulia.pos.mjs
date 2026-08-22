// Plate XXIII The Julia Set, Run Backwards, as a positive. Forward
// orbits on the Julia set are chaotic; backwards, every point has
// two preimages, plus or minus sqrt(z - c), and choosing between
// them at random is a chaos game whose attractor is exactly the set.
// The stream cannot be drawn inside a branch, so the record carries
// the coin one step ahead: field u is drawn this step and spends
// itself on the next step's sign. Every flip still rides its own
// independent draw, one draw per step like the shader's hash chain,
// and the law of the signs is unchanged. The shader's br is a dead
// store and is not carried.
import { positive, lever, pal, TAU, clamp, mix, csqrt, v2 } from "../core/measure.mjs";

export default positive("invjulia_pos", {
  cre:   lever("C · RE",        -1,   1,   0.005, -0.40),
  cim:   lever("C · IM",        -1,   1,   0.005,  0.60),
  iters: lever("ITERATIONS",     8,   60,  1,      40),
  scale: lever("SCALE",          0.6, 1.6, 0.01,   1.1),
  blend: lever("SPHERE ↔ FLAT",  0,   1,   0.01,   0.0),
  glow:  lever("GLOW",           0,   1,   0.01,   0.6),
  cam: { dist: 3.2, pitch: 0.28, tgtY: 0.0, rot: 0.05 },
  gain: 0.7, accent: "#ff8fbf",
},
(P, s) => {
  // any start lands on the set within a few steps
  const j = s.jitter2().scale(2.0);
  const o = s.orbit(P.iters, { x: j.x, y: j.y, u: s.u() }, (z) => ({
    x: ((z.u < 0.5) ? -1.0 : 1.0) * csqrt(v2(z.x - P.cre, z.y - P.cim)).x,
    y: ((z.u < 0.5) ? -1.0 : 1.0) * csqrt(v2(z.x - P.cre, z.y - P.cim)).y,
    u: s.u(),
  }));

  // the two seatings: the flat plane, and the Riemann sphere by
  // inverse stereographic projection, blended by the lever
  const dd = o.x * o.x + o.y * o.y;
  const bl = clamp(P.blend, 0.0, 1.0);
  const px = mix(o.x * P.scale, 2.0 * o.x / (dd + 1.0) * (P.scale * 1.1), bl);
  const py = mix(o.y * P.scale, 2.0 * o.y / (dd + 1.0) * (P.scale * 1.1), bl);
  const pz = mix(0.0, (dd - 1.0) / (dd + 1.0) * (P.scale * 1.1), bl);

  // hue rides the argument of the landing point
  return s.deposit({
    xyz: [px, py, pz],
    col: pal(Math.atan2(o.y, o.x) / TAU + 0.5,
             [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
             [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]),
    glow: 0.5 + 0.65 * P.glow,
  });
});
