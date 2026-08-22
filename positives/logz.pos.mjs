// Plate III The Riemann Surface of log z, as a positive - a pure
// coordinate map. q.x samples the annulus area-uniformly, q.y runs the
// point along P.sheets turns of the helicoid, and the graticule is the
// conformal image of the w-plane grid. The C2 rotation trades height
// between Im log z and Re log z on the clock; hue repeats each turn
// while height does not, which is the monodromy the plate is about.
import { positive, lever, pal, TAU, fract, mix, smoothstep, add3, mul3 }
  from "../core/measure.mjs";

export default positive("logz_pos", {
  sheets: lever("SHEETS",           1,    8,   1,     5),
  rot:    lever("ℂ² ROTATION", 0, 0.6, 0.005, 0.22),
  grat:   lever("GRATICULE",        0,    3,   0.01,  1.0),
  inner:  lever("INNER RADIUS",     0.02, 0.4, 0.005, 0.07),
  outer:  lever("OUTER RADIUS",     0.6,  2.0, 0.01,  1.45),
  height: lever("HEIGHT",           0.2,  2.0, 0.01,  1.0),
  cam: { dist: 3.3, pitch: 0.34, tgtY: 0.0, rot: 0.05 },
  gain: 1.15, accent: "#a3adff",
},
(P, s, q, t) => {
  // area-uniform sampling of the annulus, spread over P.sheets sheets
  const rho = Math.sqrt(mix(P.inner * P.inner, P.outer * P.outer, q.x));
  const th = (q.y - 0.5) * TAU * P.sheets;

  // w = log z: the real part from the modulus, the imaginary from the
  // unwrapped argument, then the C2 rotation mixes them into height
  const re = Math.log(rho);
  const im = th;
  const beta = P.rot * t;
  const y = (Math.cos(beta) * 0.115 * im + Math.sin(beta) * 0.55 * re) * P.height;

  // the conformal image of the w-plane grid, glowing where either
  // family of grid lines passes
  const gx = Math.abs(fract(re * 2.2 * P.grat) - 0.5);
  const gy = Math.abs(fract(im * 0.7 * P.grat) - 0.5);
  const line = smoothstep(0.12, 0.02, Math.min(gx, gy));

  // hue names the argument mod one turn; the graticule rides on top
  const wheel = pal(fract(th / TAU), [0.48, 0.48, 0.48], [0.42, 0.42, 0.42],
                    [1.0, 1.0, 1.0], [0.02, 0.36, 0.70]);
  return s.deposit({
    xyz: [rho * Math.cos(th) * 0.95, y * 0.95, rho * Math.sin(th) * 0.95],
    col: add3(mul3(wheel, 0.30), mul3([0.90, 0.92, 1.0], line * 0.95)),
  });
});
