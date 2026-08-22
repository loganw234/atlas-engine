// Plate XIII The Buddhabrot, as a positive. Not the set but its
// ghost: for every escaping c, one uniformly chosen stop along the
// orbit is deposited, so brightness is exactly the density of
// visitation. The shader reservoir-samples that stop in a single
// pass, one coin per step; but the trajectory of z depends only on
// c, never on those coins, so the walk runs the orbit once for the
// escape time, draws the stop's index outright, and runs the same
// orbit again to capture it. Uniform over the m = esc + 1 visited
// iterates either way: the same law, said in two passes.
import { positive, lever, pal, mix, clamp, cmul, v2, mul3 } from "../core/measure.mjs";

export default positive("buddha_pos", {
  iters:  lever("ITERATIONS",    20,  400, 1,    200),
  minEsc: lever("MIN ESCAPE",    0,   80,  1,    3),
  scale:  lever("SCALE",         0.3, 1.4, 0.01, 0.72),
  lift:   lever("3D LIFT",       0,   1.2, 0.01, 0.0),
  cycle:  lever("PALETTE CYCLE", 0,   2,   0.01, 0.8),
  cam: { dist: 3.2, pitch: 0.62, tgtY: 0.0, rot: 0.02 },
  gain: 0.7, accent: "#ffcf8f",
},
(P, s, q, t) => {
  const K = P.iters;

  // sample c across the classic window, jittered for anti-aliasing
  const j = s.jitter2();
  const cx = mix(-2.1, 0.9, q.x) + j.x * 0.004;
  const cy = mix(-1.35, 1.35, q.y) + j.y * 0.004;

  // analytic interior cull: the main cardioid and the period-2 bulb
  // never escape
  const xq = cx - 0.25;
  const qb = xq * xq + cy * cy;
  if (qb * (qb + xq) < 0.25 * cy * cy ||
      (cx + 1.0) * (cx + 1.0) + cy * cy < 0.0625) {
    return s.decline();
  }

  // first pass: the escape time alone. The shader stamps esc on the
  // step that pushed |z|^2 past 16, checking after every update
  // including the last, so the final magnitude decides; esc stays -1
  // for a prisoner.
  const a = s.orbit(P.iters, { x: 0.0, y: 0.0 }, (z) => ({
    x: cmul(v2(z.x, z.y), v2(z.x, z.y)).x + cx,
    y: cmul(v2(z.x, z.y), v2(z.x, z.y)).y + cy,
  }), { until: (z) => z.x * z.x + z.y * z.y > 16.0 });
  const m2 = a.x * a.x + a.y * a.y;
  const esc = (m2 > 16.0) ? (a.count - 1.0) : -1.0;

  // keep only slow-escaping orbits
  if (esc < 0.0 || esc < P.minEsc) {
    return s.decline();
  }

  // the reservoir, restated: keeping each visited iterate with
  // probability 1/(j+1) leaves a uniform choice among all m of them,
  // so one draw picks the index outright, clamped at the top edge
  // the way the vocabulary's own pick is
  const mF = esc + 1.0;
  const idx = Math.min(Math.floor(s.u() * mF), mF - 1.0);

  // second pass: the identical orbit, capturing iterate idx + 1 as
  // it forms. The capture fields choose by value; the one draw
  // already happened above, outside every branch.
  const b = s.orbit(P.iters, { x: 0.0, y: 0.0, kx: cx, ky: cy }, (z, k) => ({
    x: cmul(v2(z.x, z.y), v2(z.x, z.y)).x + cx,
    y: cmul(v2(z.x, z.y), v2(z.x, z.y)).y + cy,
    kx: (k == idx) ? (cmul(v2(z.x, z.y), v2(z.x, z.y)).x + cx) : z.kx,
    ky: (k == idx) ? (cmul(v2(z.x, z.y), v2(z.x, z.y)).y + cy) : z.ky,
  }), { until: (z) => z.x * z.x + z.y * z.y > 16.0 });

  // late escapers ride the palette out; MIN ESCAPE already hollowed
  // the quick ones
  const tt = clamp(esc / K, 0.0, 1.0);
  const sc = P.scale;
  return s.deposit({
    xyz: [(b.kx + 0.5) * sc, P.lift * (tt - 0.3), b.ky * sc],
    col: mul3(pal(0.5 + P.cycle * tt,
                  [0.5, 0.42, 0.38], [0.5, 0.46, 0.5],
                  [1.0, 1.0, 1.0], [0.0, 0.18, 0.36]),
              0.45 + 1.0 * tt),
  });
});
