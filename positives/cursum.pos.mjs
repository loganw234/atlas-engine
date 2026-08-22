// Plate XLII Curlicues, as a positive - the running Weyl sum as an
// orbit of finite differences. The phase lives in turns and never
// sees its raw argument: each step adds the current increment and
// fracts, the increment adds the second difference, the second adds
// the third, so float32 keeps its precision out to n = 768 exactly
// as the shader arranged. The point's q.x deals it a prefix length
// N, its q.y a position along the N-th unit step, and the walk
// deposits on that filament; density is literally time spent. KIND
// picks the linear, quadratic, quadratic-plus-linear, or cubic
// phase by seeding the differences.
import { positive, lever, pal, fract, mix, TAU, len2 } from "../core/measure.mjs";

export default positive("cursum_pos", {
  kind:  lever("KIND",   0,    3,   1,      0),
  x:     lever("X",      0,    1,   0.0005, 0.4142135),
  phase: lever("PHASE",  0,    1,   0.0005, 0),
  len:   lever("LENGTH", 64,   768, 1,      384),
  scale: lever("SCALE",  0.3,  3,   0.01,   1.1),
  lift:  lever("LIFT",   0,    1.2, 0.01,   0.4),
  glow:  lever("GLOW",   0,    1,   0.01,   0.6),
  cam: { dist: 3.0, pitch: 0.9, tgtY: 0.15, rot: 0.02 },
  gain: 0.9, accent: "#98e8b8",
},
(P, s, q, t) => {
  const kind = Math.floor(P.kind + 0.5);
  const x = P.x;
  const y = P.phase;
  const LEN = P.len;

  // the point's own prefix length, dealt off q.x
  const Nf = 1.0 + Math.floor(q.x * (LEN - 1.0));

  // seed the phase (in turns) and its differences for each KIND;
  // the derivations are the shader's own comment, checked there
  // against the direct exponential
  let th = 0.0, d1 = 0.0, d2 = 0.0, d3 = 0.0;
  if (kind == 1.0) {
    th = fract(0.5 * x); d1 = fract(0.5 * x); d2 = 0.0; d3 = 0.0;
  } else if (kind == 2.0) {
    th = fract(0.5 * (x + y)); d1 = fract(1.5 * x + 0.5 * y); d2 = fract(x); d3 = 0.0;
  } else if (kind == 3.0) {
    th = fract(0.5 * x); d1 = fract(3.5 * x); d2 = fract(6.0 * x); d3 = fract(3.0 * x);
  } else {
    th = fract(0.5 * x); d1 = fract(1.5 * x); d2 = fract(x); d3 = 0.0;
  }

  // the walk: every step turns by the drifting rate and strides one
  // unit; the previous sum rides along so the N-th step survives as
  // a segment, and dl remembers the local turning rate for the hue
  const o = s.orbit(768, {
    n: 1.0, th: th, d1: d1, d2: d2, d3: d3,
    sx: 0.0, sy: 0.0, px: 0.0, py: 0.0, dl: d1,
  }, (v) => ({
    n: v.n + 1.0,
    th: fract(v.th + v.d1),
    d1: fract(v.d1 + v.d2),
    d2: fract(v.d2 + v.d3),
    d3: v.d3,
    sx: v.sx + Math.cos(TAU * v.th),
    sy: v.sy + Math.sin(TAU * v.th),
    px: v.sx,
    py: v.sy,
    dl: v.d1,
  }), { until: (v) => v.n > Nf });

  // the filament: q.y interpolates the N-th unit step; the adaptive
  // scale expects |S| near sqrt(N), and the soft radial clamp bounds
  // the excursions without bending directions
  const wx = mix(o.px, o.sx, q.y) * (P.scale / (3.0 + Math.sqrt(LEN)));
  const wy = mix(o.py, o.sy, q.y) * (P.scale / (3.0 + Math.sqrt(LEN)));
  const r = len2(wx, wy);
  const soft = 1.0 / Math.sqrt(1.0 + (r / 1.35) * (r / 1.35));
  const nf = (Nf - 1.0 + q.y) / LEN;

  // a slow pen-stroke highlight sweeps the walk on the clock
  let u = fract(nf - 0.045 * t);
  u = Math.min(u, 1.0 - u);

  return s.deposit({
    xyz: [wx * soft, nf * P.lift, wy * soft],
    col: pal(o.dl, [0.42, 0.55, 0.45], [0.38, 0.36, 0.34],
             [1.0, 1.0, 1.0], [0.35, 0.10, 0.62]),
    glow: (0.30 + 0.85 * P.glow) * (0.85 + 0.5 * Math.exp(-300.0 * u * u)),
  });
});
