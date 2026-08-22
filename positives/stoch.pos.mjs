// Plate XXXI The Bell Curve, Assembled, as a positive - the central
// limit theorem built one shove at a time. In the pyramid the point
// is a row: q.y says how many independent steps its partial sum has
// taken, an orbit spends one draw per step, and the bottom collapses
// binomial onto Normal unless the Cauchy law keeps its tails. In walk
// mode the same increments trace Brownian and Levy paths, and the
// point deposits wherever its walk stood at one hashed moment.
//
// The LAW arms are separate orbits under plain if/else: a law chosen
// inside a ternary would put draws in its branches, and the lever is
// uniform, so every point takes the same arm in the same order. In
// walk mode the three uniforms a step spends feed three record fields
// each, so the triple rides the state one step ahead: init draws the
// first, each step spends the previous and draws the next, and the
// final triple is never spent. The shader's target reuses the first
// hash of its own loop chain; here it is its own draw, decorrelated
// but identical in law. And rather than freeze the captured position
// in extra fields, the orbit simply stops after the target step: the
// walk beyond the capture never reaches the picture.
import { positive, lever, pal, v3, TAU, PI } from "../core/measure.mjs";

export default positive("stoch_pos", {
  mode:  lever("MODE",         0,   1,   1,    0),
  rows:  lever("ROWS / STEPS", 10,  200, 1,    120),
  bias:  lever("BIAS / α",     0,   1,   0.01, 0.5),
  law:   lever("LAW",          0,   2,   1,    0),
  scale: lever("SCALE",        0.4, 1.8, 0.01, 1.0),
  glow:  lever("GLOW",         0,   1,   0.01, 0.6),
  cam: { dist: 3.2, pitch: 0.3, tgtY: 0.0, rot: 0.03 },
  gain: 0.8, accent: "#9fc0ff",
},
(P, s, q) => {
  let px = 0.0, py = 0.0, pz = 0.0;
  let cv = v3(0.0, 0.0, 0.0);
  if (P.mode == 0.0) {
    // the Galton pyramid: row rr of the triangle, rr steps of the sum
    const rr = Math.floor(q.y * P.rows) + 1.0;
    let xr = 0.0;
    if (P.law == 0.0) {
      // a coin against BIAS: the binomial, leaning where it is bent
      const g = s.orbit(P.rows, { x: 0.0, j: 0.0 }, (v) => ({
        x: v.x + ((s.u() < P.bias) ? 1.0 : -1.0),
        j: v.j + 1.0,
      }), { until: (v) => v.j >= rr });
      xr = g.x;
    } else if (P.law == 1.0) {
      // a flat step of finite variance: the theorem still holds
      const g = s.orbit(P.rows, { x: 0.0, j: 0.0 }, (v) => ({
        x: v.x + (s.u() - 0.5) * 3.4,
        j: v.j + 1.0,
      }), { until: (v) => v.j >= rr });
      xr = g.x;
    } else {
      // the Cauchy step: no variance, and no bell ever forms
      const g = s.orbit(P.rows, { x: 0.0, j: 0.0 }, (v) => ({
        x: v.x + Math.tan(PI * (s.u() - 0.5)) * 0.5,
        j: v.j + 1.0,
      }), { until: (v) => v.j >= rr });
      xr = g.x;
    }
    px = xr * P.scale * 0.12;
    py = (0.5 - q.y) * 2.2;
    pz = 0.0;
    cv = pal(q.y * 0.6 + 0.1, [0.5, 0.45, 0.5], [0.5, 0.45, 0.45],
             [1.0, 0.95, 0.9], [0.1, 0.25, 0.5]);
  } else {
    // the walk in space: the point is a moment. One draw names the
    // step the deposit remembers; the orbit ends right after it.
    const target = Math.floor(s.u() * P.rows);
    let ex = 0.0, ey = 0.0, ez = 0.0;
    if (P.law == 0.0) {
      // Brownian: two Box-Muller normals from u1 and u2, a third
      // from u3 and u1, each increment scaled to a small diffusion
      const g = s.orbit(P.rows, {
        u1: s.u(), u2: s.u(), u3: s.u(),
        x: 0.0, y: 0.0, z: 0.0, j: 0.0,
      }, (v) => ({
        x: v.x + Math.sqrt(-2.0 * Math.log(Math.max(1.0e-6, v.u1))) * Math.cos(TAU * v.u2) * 0.1,
        y: v.y + Math.sqrt(-2.0 * Math.log(Math.max(1.0e-6, v.u1))) * Math.sin(TAU * v.u2) * 0.1,
        z: v.z + Math.sqrt(-2.0 * Math.log(Math.max(1.0e-6, v.u3))) * Math.cos(TAU * v.u1) * 0.1,
        u1: s.u(), u2: s.u(), u3: s.u(),
        j: v.j + 1.0,
      }), { until: (v) => v.j > target });
      ex = g.x; ey = g.y; ez = g.z;
    } else {
      // Levy: a heavy-tailed jump length against alpha and a uniform
      // direction on the sphere; one big flight owns the picture
      const g = s.orbit(P.rows, {
        u1: s.u(), u2: s.u(), u3: s.u(),
        x: 0.0, y: 0.0, z: 0.0, j: 0.0,
      }, (v) => ({
        x: v.x + Math.pow(Math.max(1.0e-6, v.u1), -1.0 / Math.max(0.5, P.bias + 0.5)) * 0.02
             * (Math.sqrt(Math.max(0.0, 1.0 - (1.0 - 2.0 * v.u2) * (1.0 - 2.0 * v.u2))) * Math.cos(TAU * v.u3)),
        y: v.y + Math.pow(Math.max(1.0e-6, v.u1), -1.0 / Math.max(0.5, P.bias + 0.5)) * 0.02
             * (1.0 - 2.0 * v.u2),
        z: v.z + Math.pow(Math.max(1.0e-6, v.u1), -1.0 / Math.max(0.5, P.bias + 0.5)) * 0.02
             * (Math.sqrt(Math.max(0.0, 1.0 - (1.0 - 2.0 * v.u2) * (1.0 - 2.0 * v.u2))) * Math.sin(TAU * v.u3)),
        u1: s.u(), u2: s.u(), u3: s.u(),
        j: v.j + 1.0,
      }), { until: (v) => v.j > target });
      ex = g.x; ey = g.y; ez = g.z;
    }
    px = ex * P.scale;
    py = ey * P.scale;
    pz = ez * P.scale;
    cv = pal(target / P.rows * 0.7 + 0.05, [0.45, 0.4, 0.55], [0.4, 0.4, 0.45],
             [1.0, 0.9, 0.85], [0.5, 0.35, 0.15]);
  }
  return s.deposit({ xyz: [px, py, pz], col: cv, glow: 0.5 + 0.7 * P.glow });
});
