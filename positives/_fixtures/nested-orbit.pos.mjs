// A throwaway positive that exists only to prove the block-bodied
// orbit step: a parcel advected through a per-step reduction, which
// is cascade's shape in miniature - an outer stateful loop whose body
// declares a nested sum over octaves before writing its fields.
import { positive, lever, pal, sum, TAU } from "../../core/measure.mjs";

export default positive("nested_orbit_fixture", {
  steps: lever("STEPS", 2, 12, 1, 7),
  octs: lever("OCTAVES", 1, 8, 1, 5),
  slope: lever("SLOPE", 0.2, 0.55, 0.005, 0.333),
  scale: lever("SCALE", 0.5, 1.6, 0.01, 1.0),
  cam: { dist: 3.0, pitch: 0.0, tgtY: 0.0, rot: 0.0 },
  gain: 0.8, accent: "#88aaff",
},
(P, s, q, t) => {
  const x0 = q.x * 2.0 - 1.0;
  const y0 = q.y * 2.0 - 1.0;

  // the outer loop carries a vec2 as two fields plus a height, and
  // its body declares a nested reduction first
  const o = s.orbit(P.steps, { px: x0, py: y0, h: 0.0 }, (v, k) => {
    const ax = sum(P.octs, (j) =>
      Math.sin((v.px + 0.7) * (1.0 + j)) * Math.pow(P.slope, j));
    const ay = sum(P.octs, (j) =>
      Math.cos((v.py - 0.3) * (1.0 + j)) * Math.pow(P.slope, j));
    const dt = 0.16 / 7.0;
    return {
      px: v.px + dt * ay,
      py: v.py - dt * ax,
      h: v.h + (ax * ax + ay * ay) * 0.25,
    };
  });

  return s.deposit({
    xyz: [o.px * P.scale, o.py * P.scale, 0.0],
    col: pal(0.3 + 0.25 * o.h, [0.5, 0.5, 0.5], [0.42, 0.42, 0.42],
             [1.0, 1.0, 1.0], [0.02, 0.36, 0.70]),
  });
});
