// Plate IV A Strange Attractor, as a positive - the orbit construct's
// pilot. Millions of hashed initial conditions forget their origins
// onto de Jong's attractor; the state record carries the previous
// point so depth (a Takens delay) and speed (the colour) fall out.
// No chains: an attractor's invariant measure is a law, not a world.
import { positive, lever, pal, clamp, len2 } from "../core/measure.mjs";

export default positive("jong_pos", {
  a:     lever("A",          -2.8, 2.8, 0.005,  1.40),
  b:     lever("B",          -2.8, 2.8, 0.005, -2.30),
  c:     lever("C",          -2.8, 2.8, 0.005,  2.40),
  d:     lever("D",          -2.8, 2.8, 0.005, -2.10),
  drift: lever("DRIFT",       0,   1,   0.01,   0.4),
  iters: lever("ITERATIONS",  4,   24,  1,      14),
  depth: lever("DEPTH",       0,   0.8, 0.01,   0.31),
  cam: { dist: 3.0, pitch: 0.22, tgtY: 0.0, rot: 0.04 },
  gain: 0.55, accent: "#ff9ed0",
},
(P, s, q, t) => {
  // the four dials, drifting on their own clocks when asked
  const a = P.a + 0.52 * P.drift * Math.sin(0.041 * t);
  const b = P.b + 0.37 * P.drift * Math.sin(0.033 * t + 1.4);
  const c = P.c + 0.36 * P.drift * Math.sin(0.037 * t + 2.9);
  const d = P.d + 0.41 * P.drift * Math.sin(0.029 * t + 4.2);

  // a hashed start, then the map, each step remembering its parent
  const x0 = s.u() * 4.0 - 2.0;
  const y0 = s.u() * 4.0 - 2.0;
  const o = s.orbit(P.iters, { x: x0, y: y0, px: x0, py: y0 }, (z) => ({
    x: Math.sin(a * z.y) - Math.cos(b * z.x),
    y: Math.sin(c * z.x) - Math.cos(d * z.y),
    px: z.x,
    py: z.y,
  }));

  const sp = len2(o.x - o.px, o.y - o.py);
  return s.deposit({
    xyz: [o.x * 0.62, o.y * 0.62, o.px * P.depth],
    col: pal(clamp(sp * 0.30, 0.0, 1.0),
             [0.46, 0.34, 0.55], [0.44, 0.33, 0.40],
             [1.0, 0.95, 0.80], [0.65, 0.40, 0.10]),
  });
});
