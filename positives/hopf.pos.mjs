// Plate I The Hopf Fibration, as a positive - the classic-stratum
// experiment: can the notation speak a plate where the point IS a
// coordinate and nothing is addressed? No chains here, deliberately:
// this subject has no world, only a law, so the same inputs reproduce
// it by construction. The walk takes the two classic givens the Mk2
// strata never needed: q, the point's own coordinate, and t, the clock.
import { positive, lever, pal, TAU, PI } from "../core/measure.mjs";

export default positive("hopf_pos", {
  lobes:  lever("BAND LOBES",  0,    6,   1,     2),
  swing:  lever("BAND SWING",  0,    1.4, 0.01,  0.92),
  spinXW: lever("4D SPIN XW", -0.4,  0.4, 0.005, 0.11),
  spinYZ: lever("4D SPIN YZ", -0.4,  0.4, 0.005, 0.07),
  scale:  lever("SCALE",       0.15, 0.6, 0.005, 0.36),
  cam: { dist: 3.5, pitch: 0.32, tgtY: 0.0, rot: 0.05 },
  gain: 1.0, accent: "#8fd0ff",
},
(P, s, q, t) => {
  // the point is a coordinate: q.y seats it on the base curve over
  // S2, q.x on the fiber circle above that base point
  const along = q.y;
  const a = TAU * q.x;
  const phi = TAU * along;
  const theta = 0.5 * PI + P.swing * Math.sin(P.lobes * phi + 0.23 * t);

  // the fiber, on the 3-sphere
  const ch = Math.cos(0.5 * theta);
  const sh = Math.sin(0.5 * theta);
  const x = ch * Math.cos(a);
  const y = ch * Math.sin(a);
  const z = sh * Math.cos(a + phi);
  const w = sh * Math.sin(a + phi);

  // the churn: a rigid double rotation of the 3-sphere
  const c1 = Math.cos(P.spinXW * t);
  const s1 = Math.sin(P.spinXW * t);
  const c2 = Math.cos(P.spinYZ * t);
  const s2 = Math.sin(P.spinYZ * t);
  const rx = c1 * x - s1 * w;
  const ry = c2 * y - s2 * z;
  const rz = s2 * y + c2 * z;
  const rw = s1 * x + c1 * w;

  // stereographic projection to R3, the pole held off the plate
  const d = Math.max(1.0 - rw, 0.035);
  return s.deposit({
    xyz: [rx / d * P.scale, ry / d * P.scale, rz / d * P.scale],
    col: pal(along, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
             [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]),
    glow: 0.8 + 0.4 * s.u(),
  });
});
