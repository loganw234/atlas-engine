// Plate VI The Mandelbrot Set, as a positive. Every point asks the
// one question of a random c inside the current window: does the
// orbit of z*z + c escape? The smooth escape time nu grades the
// answer into relief and colour, the interior keeps a fixed ember,
// and the walk plots in the window frame so the view stays put
// while the levers zoom.
import { positive, lever, pal, mix, clamp, fract, v3, mul3 } from "../core/measure.mjs";

export default positive("mand_pos", {
  iters:  lever("ITERATIONS",    16,   120, 1,     60),
  zoom:   lever("ZOOM",          1,    60,  0.1,   1),
  cre:    lever("CENTER RE",     -2.2, 0.8, 0.001, -0.70),
  cim:    lever("CENTER IM",     -1.2, 1.2, 0.001, 0.0),
  height: lever("HEIGHT",        0,    1.6, 0.01,  0.8),
  cycle:  lever("PALETTE CYCLE", 0,    3,   0.01,  0.9),
  cam: { dist: 3.4, pitch: 0.52, tgtY: 0.30, rot: 0.03 },
  gain: 0.9, accent: "#ffc069",
},
(P, s, q, t) => {
  const K = P.iters;

  // sample c at random inside the current window: the infinitely
  // intricate boundary anti-aliases itself
  const j = s.jitter2();
  const wx = mix(-1.55, 1.55, q.x) + j.x * 0.002;
  const wy = (q.y - 0.5) * 2.6 + j.y * 0.002;
  const cx = P.cre + wx / P.zoom;
  const cy = P.cim + wy / P.zoom;

  // iterate z*z + c from the origin, stopping the step after |z|^2
  // first exceeds 40
  const o = s.orbit(P.iters, { x: 0.0, y: 0.0 }, (z) => ({
    x: z.x * z.x - z.y * z.y + cx,
    y: 2.0 * z.x * z.y + cy,
  }), { until: (z) => z.x * z.x + z.y * z.y > 40.0 });

  // the shader stamps n on the step that escaped, checking after
  // every update including the last, so the final magnitude decides:
  // past 40 the orbit left on step count - 1, otherwise n = K marks
  // a prisoner
  const m2 = o.x * o.x + o.y * o.y;
  const n = (m2 > 40.0) ? (o.count - 1.0) : K;

  let hgt = 0.0;
  let tint = v3(0.0, 0.0, 0.0);
  if (n >= K) {
    // the set itself: full height, a dim ember
    hgt = P.height;
    tint = mul3([0.60, 0.16, 0.05], 0.5);
  } else {
    // the smooth escape time nu, graded into height and palette;
    // log2 is said as log over log 2, the vocabulary has no log2
    const nu = n + 1.0 - Math.log(Math.max(1.0, 0.5 * Math.log(m2))) / Math.log(2.0);
    const x = clamp(nu / K, 0.0, 1.0);
    hgt = P.height * Math.pow(x, 2.0);
    tint = mul3(pal(fract(P.cycle * x + 0.02 * t),
                    [0.50, 0.33, 0.20], [0.50, 0.38, 0.30],
                    [1.0, 1.0, 1.0], [0.00, 0.12, 0.30]),
                0.22 + 1.15 * x);
  }

  // plot in the window frame so the view stays put while zooming
  return s.deposit({ xyz: [wx * 0.72, hgt, wy * 0.72], col: tint });
});
