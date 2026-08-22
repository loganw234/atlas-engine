// Plate XXXII Roulettes & Knots, as a positive - four curves that draw
// themselves, each a single point swept by one parameter. A
// harmonograph hangs a pen from decaying pendulums and lets their beats
// interfere; a spirograph rolls one circle inside another; a Lissajous
// figure listens to two tones at once; a torus knot winds p times the
// long way for q times the short way and cannot be untied. The sweep
// parameter is the point's own coordinate, so the curve is drawn by the
// cloud rather than traced in time, and brightness follows the pace on
// its own: where the curve lingers, more points land.
//
// The four arms are an if/else-if chain on the MODE lever writing one
// let-bound triple, and the filament's thickness follows as three
// centered draws in the shader's own rnd.xyz order, outside every
// branch, so both evaluators spend the same draws in the same place.
import { positive, lever, pal, TAU, PI } from "../core/measure.mjs";

export default positive("curves_pos", {
  mode:  lever("MODE",        0,   3,   1,     3),
  fa:    lever("FREQ A / r",  1,   5,   0.01,  3),
  fb:    lever("FREQ B / p",  1,   5,   0.01,  2),
  fc:    lever("FREQ C / q",  1,   5,   0.01,  3),
  tube:  lever("TUBE",        0,   0.1, 0.002, 0.03),
  scale: lever("SCALE",       0.5, 1.6, 0.01,  1.0),
  glow:  lever("GLOW",        0,   1,   0.01,  0.6),
  cam: { dist: 3.2, pitch: 0.25, tgtY: 0.0, rot: 0.06 },
  gain: 0.85, accent: "#c8a0ff",
},
(P, s, q) => {
  const md = Math.floor(P.mode + 0.5);
  let cx = 0.0, cy = 0.0, cz = 0.0;

  if (md < 0.5) {
    // the damped harmonograph: three pendulums, one decay, and the
    // beats between their frequencies are the whole figure
    const d = P.fa * 0.02;
    const th = TAU * q.x * 6.0;
    cx = Math.sin(P.fa * th) * Math.exp(-d * th);
    cy = Math.sin(P.fb * th + 1.0) * Math.exp(-d * th);
    cz = Math.cos(P.fc * th + 2.0) * Math.exp(-d * th);
  } else if (md < 1.5) {
    // the hypotrochoid: a circle of radius r rolling inside the unit
    // circle, with the pen held at distance dd from its centre, so the
    // pen turns (R - r)/r times for every turn of the roll
    const R = 1.0;
    const r = P.fa * 0.15 + 0.15;
    const dd = P.fb * 0.4;
    const th = TAU * q.x * 12.0;
    const k = (R - r) / r;
    cx = ((R - r) * Math.cos(th) + dd * Math.cos(k * th)) * 0.9;
    cy = ((R - r) * Math.sin(th) - dd * Math.sin(k * th)) * 0.9;
    cz = 0.0 * 0.9;
  } else if (md < 2.5) {
    // the Lissajous figure, one tone to an axis, the quarter turn on
    // the second putting the figure out of phase with itself
    const th = TAU * q.x;
    cx = Math.sin(P.fa * th);
    cy = Math.sin(P.fb * th + PI * 0.5);
    cz = Math.sin(P.fc * th + 1.0);
  } else {
    // the (p, q) torus knot, wound on a torus of radii 1 and 0.42
    const th = TAU * q.x;
    const pp = P.fb;
    const qq = P.fc;
    const R = 1.0;
    const rr = 0.42;
    cx = ((R + rr * Math.cos(qq * th)) * Math.cos(pp * th)) * 0.9;
    cy = (rr * Math.sin(qq * th)) * 0.9;
    cz = ((R + rr * Math.cos(qq * th)) * Math.sin(pp * th)) * 0.9;
  }

  // the thickness that makes a curve read as a filament in space
  const jx = s.centered();
  const jy = s.centered();
  const jz = s.centered();

  return s.deposit({
    xyz: [(cx + jx * P.tube) * P.scale,
          (cy + jy * P.tube) * P.scale,
          (cz + jz * P.tube) * P.scale],
    col: pal(q.x * 0.8 + 0.05,
             [0.5, 0.45, 0.5], [0.5, 0.45, 0.45],
             [1.0, 0.9, 0.85], [0.1, 0.3, 0.5]),
    glow: 0.5 + 0.7 * P.glow,
  });
});
