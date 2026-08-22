// Plate XIV Strange Attractors of Flow, as a positive. A cloud of
// initial conditions is integrated forward by the classical fourth
// order Runge Kutta scheme and each point forgets where it began, so
// where it finally sits is the SRB measure: brightness is the fraction
// of time the flow spends in a region, and colour is local speed.
//
// The shader's inner loop calls one derivative function four times per
// step. An orbit step is one expression per field and cannot bind a
// local, so a literal inlining of k1 through k4 would nest the six
// armed field chain three levels deep, roughly a megabyte of GLSL per
// component. The walk spends eight passes on each Runge Kutta step
// instead. Four evaluating passes read the field once at the probe,
// four advancing passes spend that reading: they weigh it into the
// accumulator and choose the next probe. The derivative just taken
// rides as a state field, so the six arms are written once, and the
// accumulator visits 0, k1, k1+2k2, k1+2k2+2k3 before the fourth
// advance adds k4 and multiplies the sum by dt/6, which is exactly the
// shader's left to right sum and its single scaling.
import { positive, lever, pal, clamp, mix, len3 } from "../core/measure.mjs";

export default positive("flows_pos", {
  system: lever("SYSTEM",    0,     5,    1,      0),
  steps:  lever("STEPS",     40,    380,  1,      170),
  dtL:    lever("dt",        0.002, 0.02, 0.0005, 0.008),
  spread: lever("SPREAD",    0,     1,    0.01,   0.7),
  param:  lever("PARAM",     0,     1,    0.005,  0.5),
  hue:    lever("SPEED HUE", 0,     3,    0.01,   1.0),
  cam: { dist: 3.4, pitch: 0.20, tgtY: 0.0, rot: 0.05 },
  gain: 0.55, accent: "#7ad9c4",
},
(P, s) => {
  const sys = Math.floor(P.system + 0.5);
  const dt = P.dtL, prm = P.param;

  // the one dial that walks the zoo: each system reads PARAM through
  // its own span, and the six spans are all the shader computes inside
  // its derivative before it reaches the vector field itself
  const rho = mix(20.0, 40.0, prm);          // Lorenz
  const cc = mix(4.0, 9.0, prm);             // Roessler
  const bT = mix(0.10, 0.21, prm);           // Thomas
  const aH = mix(1.4, 1.9, prm);             // Halvorsen
  const alpha = mix(9.0, 16.0, prm);         // Chua
  const aA = 0.95, bA = 0.7, cA = 0.6, dA = 3.5, eA = 0.25, fA = 0.1;
  const m0 = -1.143, m1 = -0.714;            // Chua's piecewise slopes

  // each attractor lives at its own size and around its own centre,
  // and only the third coordinate of that centre is ever nonzero
  const icS = (sys == 0.0) ? 24.0 : (sys == 1.0) ? 10.0 : (sys == 2.0) ? 1.4
            : (sys == 3.0) ? 7.0 : (sys == 4.0) ? 3.0 : 3.0;
  const outS = (sys == 0.0) ? 0.042 : (sys == 1.0) ? 0.075 : (sys == 2.0) ? 0.90
             : (sys == 3.0) ? 0.28 : (sys == 4.0) ? 0.13 : 0.20;
  const outZ = (sys == 0.0) ? 25.0 : (sys == 1.0) ? 3.0 : 0.0;

  // one initial condition out of the cloud, and its own flight time:
  // spreading the total time is what makes the transient fade instead
  // of banding
  const x0 = s.centered() * icS;
  const y0 = s.centered() * icS;
  const z0 = s.centered() * icS + outZ * 0.5;
  const steps = P.steps * (0.45 + 0.55 * s.u() * P.spread);

  // the flight. u is the probe the evaluating pass reads the field at,
  // k the reading it left behind, a the weighted sum being built, x the
  // point at the top of the current step and p the point at the top of
  // the one before it. The walk stops where the shader stops: before a
  // step once the flight time is spent, and after a step that has run
  // away past the divergence guard.
  const o = s.orbit(3040, {
    x: x0, y: y0, z: z0,
    px: x0, py: y0, pz: z0,
    ux: x0, uy: y0, uz: z0,
    kx: 0.0, ky: 0.0, kz: 0.0,
    ax: 0.0, ay: 0.0, az: 0.0,
    g: 0.0, ph: 0.0, n: 0.0,
  }, (v) => ({
    // the field, read at the probe: Lorenz, Roessler, Aizawa, Thomas,
    // Halvorsen, and Chua's double scroll, each verbatim
    kx: (v.ph == 0.0)
      ? ((sys == 0.0) ? 10.0 * (v.uy - v.ux)
        : (sys == 1.0) ? (-v.uy - v.uz)
        : (sys == 2.0) ? ((v.uz - bA) * v.ux - dA * v.uy)
        : (sys == 3.0) ? (Math.sin(v.uy) - bT * v.ux)
        : (sys == 4.0) ? (-aH * v.ux - 4.0 * v.uy - 4.0 * v.uz - v.uy * v.uy)
        : alpha * (v.uy - v.ux
            - (m1 * v.ux + 0.5 * (m0 - m1)
               * (Math.abs(v.ux + 1.0) - Math.abs(v.ux - 1.0)))))
      : v.kx,
    ky: (v.ph == 0.0)
      ? ((sys == 0.0) ? (v.ux * (rho - v.uz) - v.uy)
        : (sys == 1.0) ? (v.ux + 0.2 * v.uy)
        : (sys == 2.0) ? (dA * v.ux + (v.uz - bA) * v.uy)
        : (sys == 3.0) ? (Math.sin(v.uz) - bT * v.uy)
        : (sys == 4.0) ? (-aH * v.uy - 4.0 * v.uz - 4.0 * v.ux - v.uz * v.uz)
        : (v.ux - v.uy + v.uz))
      : v.ky,
    kz: (v.ph == 0.0)
      ? ((sys == 0.0) ? (v.ux * v.uy - 2.6666667 * v.uz)
        : (sys == 1.0) ? (0.2 + v.uz * (v.ux - cc))
        : (sys == 2.0) ? (cA + aA * v.uz - v.uz * v.uz * v.uz / 3.0
            - (v.ux * v.ux + v.uy * v.uy) * (1.0 + eA * v.uz)
            + fA * v.uz * v.ux * v.ux * v.ux)
        : (sys == 3.0) ? (Math.sin(v.ux) - bT * v.uz)
        : (sys == 4.0) ? (-aH * v.uz - 4.0 * v.ux - 4.0 * v.uy - v.ux * v.ux)
        : (-28.0 * v.uy))
      : v.kz,

    // the advancing pass weighs the reading into the sum, 1 2 2 1, and
    // empties the sum where the step closes
    ax: (v.ph == 0.0) ? v.ax
      : ((v.g == 3.0) ? 0.0 : (v.ax + ((v.g == 0.0) ? 1.0 : 2.0) * v.kx)),
    ay: (v.ph == 0.0) ? v.ay
      : ((v.g == 3.0) ? 0.0 : (v.ay + ((v.g == 0.0) ? 1.0 : 2.0) * v.ky)),
    az: (v.ph == 0.0) ? v.az
      : ((v.g == 3.0) ? 0.0 : (v.az + ((v.g == 0.0) ? 1.0 : 2.0) * v.kz)),

    // the step closes on the fourth advance, and the point moves by the
    // whole weighted sum at once
    x: (v.ph == 1.0 && v.g == 3.0) ? (v.x + dt / 6.0 * (v.ax + 1.0 * v.kx)) : v.x,
    y: (v.ph == 1.0 && v.g == 3.0) ? (v.y + dt / 6.0 * (v.ay + 1.0 * v.ky)) : v.y,
    z: (v.ph == 1.0 && v.g == 3.0) ? (v.z + dt / 6.0 * (v.az + 1.0 * v.kz)) : v.z,
    px: (v.ph == 1.0 && v.g == 3.0) ? v.x : v.px,
    py: (v.ph == 1.0 && v.g == 3.0) ? v.y : v.py,
    pz: (v.ph == 1.0 && v.g == 3.0) ? v.z : v.pz,

    // and the next probe: a half step along this reading, a whole step
    // along the third, and the freshly moved point once the step closes
    ux: (v.ph == 0.0) ? v.ux
      : ((v.g == 3.0) ? (v.x + dt / 6.0 * (v.ax + 1.0 * v.kx))
        : (v.x + ((v.g == 2.0) ? dt : 0.5 * dt) * v.kx)),
    uy: (v.ph == 0.0) ? v.uy
      : ((v.g == 3.0) ? (v.y + dt / 6.0 * (v.ay + 1.0 * v.ky))
        : (v.y + ((v.g == 2.0) ? dt : 0.5 * dt) * v.ky)),
    uz: (v.ph == 0.0) ? v.uz
      : ((v.g == 3.0) ? (v.z + dt / 6.0 * (v.az + 1.0 * v.kz))
        : (v.z + ((v.g == 2.0) ? dt : 0.5 * dt) * v.kz)),

    g: (v.ph == 0.0) ? v.g : ((v.g == 3.0) ? 0.0 : (v.g + 1.0)),
    ph: (v.ph == 0.0) ? 1.0 : 0.0,
    n: (v.ph == 1.0 && v.g == 3.0) ? (v.n + 1.0) : v.n,
  }), {
    until: (v) => v.n >= steps
      || v.x * v.x + v.y * v.y + v.z * v.z > 1.0e6,
  });

  // an integration that has left the numbers behind is no point at all.
  // The shader asks isnan or isinf; the vocabulary has neither, so the
  // walk asks the same question of the magnitude, which fails on a NaN
  // as well as on an infinity.
  const fin = Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.z);
  if (!(fin < 1.0e30)) {
    return s.decline();
  }

  // the last chord of the flight, divided by its time, is local speed,
  // and the bright cores are where the flow lingers
  const sp = len3(o.x - o.px, o.y - o.py, o.z - o.pz)
           / Math.max(dt, 1.0e-4);
  return s.deposit({
    xyz: [o.x * outS, (o.z - outZ) * outS, o.y * outS],
    col: pal(clamp(sp * 0.05 * P.hue, 0.0, 1.0) * 0.8 + 0.05,
             [0.42, 0.42, 0.55], [0.40, 0.40, 0.45],
             [1.0, 0.95, 0.85], [0.55, 0.40, 0.20]),
  });
});
