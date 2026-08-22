// Plate X Modular Multiplication, as a positive - a pure coordinate
// map, no loops and no draws. The point IS a chord: q.y names the
// residue j on the circle, q.x runs along the chord from j to m*j
// mod n, and the envelope of all the chords is the epicycloid. The
// only clock use drifts the multiplier, wrapped mod n because m and
// m + n are the same map.
import { positive, lever, pal, mix3, mul3, mix, mod, fract, TAU, PI, len2 } from "../core/measure.mjs";

export default positive("modmul_pos", {
  mult:  lever("MULTIPLIER m", 1,  12,  0.01,  2),
  modn:  lever("MODULUS n",    24, 720, 1,     240),
  lift:  lever("HELIX LIFT",   0,  1.2, 0.01,  0),
  drift: lever("m DRIFT",      0,  0.3, 0.005, 0.05),
  hue:   lever("HUE: INDEX↔LENGTH", 0, 1, 0.01, 0.25),
  cam: { dist: 3.2, pitch: 0.35, tgtY: 0.0, rot: 0.04 },
  gain: 0.8, accent: "#f2a0ff",
},
(P, s, q, t) => {
  // the residue and its image: j maps to m*j mod n, both seated on
  // the unit circle. tc is the shader's own local t, the position
  // along the chord; the walk's t is the clock.
  const n = P.modn;
  const m = mod(P.mult + P.drift * t, n);
  const j = Math.floor(q.y * n);
  const tc = q.x;
  const f2 = fract(m * j / n);
  const a1 = TAU * j / n;
  const a2 = TAU * f2;
  const ax = Math.cos(a1);
  const ay = Math.sin(a1);
  const bx = Math.cos(a2);
  const by = Math.sin(a2);

  // the lift unrolls the circle into a helix, each endpoint raised by
  // its own position around the turn, so every chord becomes a strut
  const y1 = P.lift * (j / n - 0.5) * 2.0;
  const y2 = P.lift * (f2 - 0.5) * 2.0;

  // hue reads either the residue index or the chord's length, blended
  // by the lever; brightness swells toward the chord's middle
  const clen = len2(bx - ax, by - ay) * 0.5;
  const byIdx = pal(j / n, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
                    [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]);
  const byLen = pal(clen * 0.9, [0.52, 0.36, 0.30], [0.45, 0.36, 0.30],
                    [1.0, 0.9, 0.8], [0.05, 0.25, 0.50]);
  return s.deposit({
    xyz: [mix(ax, bx, tc) * 1.25, mix(y1, y2, tc) * 1.25,
          mix(ay, by, tc) * 1.25],
    col: mul3(mix3(byIdx, byLen, P.hue), 0.55 + 0.45 * Math.sin(PI * tc)),
  });
});
