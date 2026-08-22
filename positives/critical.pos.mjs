// LVIII The Critical Point, as a positive.
// The plate (PrettyCloud atlas/js/plates/58-critical.js) remains the
// reference; this is the same subject in measure notation. Runs under
// node as the CPU evaluator; the emitter reads this same source and
// writes shape_critical_pos, or refuses.
import { positive, lever, grid2, pal } from "../core/measure.mjs";

export default positive("critical_pos", {
  occupancy: lever("OCCUPANCY p",  0.55, 0.98, 0.005, 0.76),
  b:         lever("SUBDIV b",     2,    4,    1,     3),
  depth:     lever("DEPTH",        4,    22,   1,     14),
  tint:      lever("CLUSTER TINT", 0,    1,    0.01,  0.55),
  slab:      lever("SLAB Z",       0,    0.5,  0.01,  0.10),
  hull:      lever("HULL BIAS",    0,    1,    0.01,  0.35),
  cam: { dist: 3.0, pitch: 0.34, tgtY: 0.0, rot: 0.0 },
  gain: 0.5, accent: "#7ad9c0",
},
(P, s) => {
  // the budget: coarse levels are honest flat washes, and equal light
  // there fogs the lace - the deep receives more, by a stated power
  const d = s.depth(P.depth, { bias: 0.65 });

  // the descent: fractal percolation, addressed - a child is kept or
  // void identically for every point that ever looks, so the
  // accumulation is one object. The walk stops where the cluster
  // dies, and deposits on its dust.
  const fall = s.descend(grid2(P.b), d, {
    tries: 6,
    child: (a) => a.child(s.pick(P.b), s.pick(P.b)),
    keep:  (child) => child.coin(P.occupancy),
  });

  // the seat: light crowds the rim when asked, where the cluster
  // boundary lives
  let j = s.jitter2();
  const rim = j.chebyshev() * 2.0;
  if (s.u() < P.hull && rim < 0.62) j = j.scale(0.92 / Math.max(rim, 1e-3));

  // the slab: fine structure lies flat, so depth parallax cannot
  // smear the lace it took levels to reach
  const z = (fall.addr.u(0x2611) - 0.5 + s.centered() * 0.3)
          * P.slab * (0.25 + 3.0 * fall.cell.scale);

  const lv = fall.reached / P.depth;
  return s.deposit({
    xy:   fall.cell.at(j).scale(1.9),
    z,
    col:  pal(0.32 + fall.addr.u(0) * P.tint * 0.5 + lv * 0.12,
              [0.45, 0.5, 0.47], [0.42, 0.5, 0.45],
              [0.9, 1.0, 0.85], [0.15, 0.42, 0.6]),
    glow: 0.12 + 1.9 * lv * lv,
  });
});
