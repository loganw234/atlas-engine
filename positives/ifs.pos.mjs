// Plate VII The Chaos Game, as a positive - the orbit construct
// playing Barnsley's game on a sphere of vertices. A hashed start
// steps a fraction P.contr toward a randomly chosen vertex, twists
// about the y axis, and repeats; the orbit's closure is the IFS
// attractor. The n vertices sit on a golden spiral over the sphere,
// and that vertex is inlined into each coordinate of the step: orbit
// fields are single expressions, so the spiral formula repeats where
// the shader's helper function bound it once, with identical values.
//
// The coin rides the state one step ahead of its use: kv is drawn at
// the end of a step and spent by the next one, because a field cannot
// both draw and be shared by its siblings. The init draws the first
// coin, each step draws the next, and last trails one behind so it
// finishes on the vertex the final move actually used, exactly the
// shader's last. One draw more than the plate in total; same law.
import { positive, lever, pal, mix, mix3, len3 } from "../core/measure.mjs";

export default positive("ifs_pos", {
  verts: lever("VERTICES",     3,    8,    1,     4),
  contr: lever("CONTRACTION",  0.25, 0.75, 0.005, 0.5),
  twist: lever("TWIST / STEP", -0.7, 0.7,  0.005, 0),
  iters: lever("ITERATIONS",   6,    28,   1,     18),
  hue:   lever("HUE: RADIUS↔ADDRESS", 0, 1, 0.01, 0.7),
  cam: { dist: 3.2, pitch: 0.30, tgtY: 0.0, rot: 0.05 },
  gain: 0.7, accent: "#b8f78f",
},
(P, s) => {
  const n = Math.max(P.verts, 3.0);
  const ca = Math.cos(P.twist);
  const sa = Math.sin(P.twist);

  // a hashed starting point in the cube, and the first coin
  const x0 = s.u() * 2.0 - 1.0;
  const y0 = s.u() * 2.0 - 1.0;
  const z0 = s.u() * 2.0 - 1.0;
  const k0 = Math.floor(s.u() * n);

  // each step: move toward vertex kv of the golden spiral, whose
  // height is 1 - 2(kv + 1/2)/n, radius the circle at that height,
  // bearing kv turns of the golden angle; then the y-axis twist
  const g = s.orbit(P.iters, { x: x0, y: y0, z: z0, kv: k0, last: 0.0 }, (v) => ({
    x: ca * mix(v.x, Math.sqrt(Math.max(0.0,
           1.0 - (1.0 - 2.0 * (v.kv + 0.5) / n) * (1.0 - 2.0 * (v.kv + 0.5) / n)))
           * Math.cos(v.kv * 2.39996322973), P.contr)
     - sa * mix(v.z, Math.sqrt(Math.max(0.0,
           1.0 - (1.0 - 2.0 * (v.kv + 0.5) / n) * (1.0 - 2.0 * (v.kv + 0.5) / n)))
           * Math.sin(v.kv * 2.39996322973), P.contr),
    y: mix(v.y, 1.0 - 2.0 * (v.kv + 0.5) / n, P.contr),
    z: sa * mix(v.x, Math.sqrt(Math.max(0.0,
           1.0 - (1.0 - 2.0 * (v.kv + 0.5) / n) * (1.0 - 2.0 * (v.kv + 0.5) / n)))
           * Math.cos(v.kv * 2.39996322973), P.contr)
     + ca * mix(v.z, Math.sqrt(Math.max(0.0,
           1.0 - (1.0 - 2.0 * (v.kv + 0.5) / n) * (1.0 - 2.0 * (v.kv + 0.5) / n)))
           * Math.sin(v.kv * 2.39996322973), P.contr),
    kv: Math.floor(s.u() * n),
    last: v.kv,
  }));

  // hue traces either the radius or the last symbolic address
  const byRad = pal(len3(g.x, g.y, g.z) * 0.8,
                    [0.40, 0.50, 0.35], [0.35, 0.40, 0.30],
                    [1.0, 0.9, 0.8], [0.30, 0.15, 0.45]);
  const byAdr = pal(g.last / n, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
                    [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]);
  return s.deposit({
    xyz: [g.x * 1.15, g.y * 1.15, g.z * 1.15],
    col: mix3(byRad, byAdr, P.hue),
  });
});
