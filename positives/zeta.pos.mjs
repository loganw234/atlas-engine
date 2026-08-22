// Plate XI The Critical Line, as a positive - each point is one
// partial sum of zeta(1/2 + it): q.y seats the height t on the line,
// q.x decides how many terms of the walk 1 + 2^-s + 3^-s + ... the
// strand has taken, and the fractional last term is feathered in by
// a clamp so the strand is continuous along its length. This plate
// never reads the clock; its own t is the height, named h here.
import { positive, lever, pal, mul3, clamp } from "../core/measure.mjs";

export default positive("zeta_pos", {
  height: lever("HEIGHT t", 2,   120, 0.1,  21),
  span:   lever("SPAN Δt",  5,   80,  0.5,  30),
  terms:  lever("TERMS",    8,   64,  1,    48),
  scale:  lever("SCALE",    0.2, 1.2, 0.01, 0.55),
  column: lever("COLUMN",   1,   4,   0.05, 2.4),
  cam: { dist: 3.6, pitch: 0.15, tgtY: 0.0, rot: 0.05 },
  gain: 0.8, accent: "#c8b8ff",
},
(P, s, q, t) => {
  const h = P.height + (q.y - 0.5) * P.span;
  const kf = 1.0 + q.x * (P.terms - 1.0);

  // the walk: term n contributes n^(-1/2) at angle -t ln n, weighted
  // to zero past kf. The term index fn rides as a state field so the
  // until can restate the shader's break at fn > kf + 1.
  const o = s.orbit(64, { sx: 0.0, sy: 0.0, fn: 1.0 }, (z) => ({
    sx: z.sx + clamp(kf - z.fn + 1.0, 0.0, 1.0) * (1.0 / Math.sqrt(z.fn))
             * Math.cos(h * Math.log(z.fn)),
    sy: z.sy + clamp(kf - z.fn + 1.0, 0.0, 1.0) * (1.0 / Math.sqrt(z.fn))
             * (-Math.sin(h * Math.log(z.fn))),
    fn: z.fn + 1.0,
  }), { until: (z) => z.fn > kf + 1.0 });

  // the strand's endpoint glows: brightness rises as the cube of the
  // position along the walk
  return s.deposit({
    xyz: [(o.sx - 1.2) * P.scale, (q.y - 0.5) * P.column, o.sy * P.scale],
    col: mul3(pal(q.x * 0.7, [0.42, 0.40, 0.55], [0.40, 0.38, 0.42],
                  [1.0, 0.95, 0.85], [0.62, 0.45, 0.20]),
              0.35 + 1.25 * Math.pow(q.x, 3.0)),
  });
});
