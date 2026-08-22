// Plate XXX Collatz Coral, as a positive - the conjecture's descent
// spoken in halves. Each point owns one starting number and runs the
// only rule there is: halve it if even, triple and add one if odd.
// The shader records the last 32 parities in a uint bit window; the
// vocabulary has no bits, so the window rides as two 16-bit halves
// held in exact small floats, shifted left arithmetically on the way
// down and shifted right again on the replay. The same halves carry
// the Collatz value itself, whose flights pass f32's exact integer
// range for these starts, so the walk reproduces the shader's uint
// arithmetic exactly, wrap included: every intermediate is an exact
// integer under 2^24 on both backends. One drawn index picks which
// replayed segment this point lights; the paths align at their
// shared destination and the common tails braid into the coral.
import { positive, lever, pal, mod, PI } from "../core/measure.mjs";

export default positive("collatz_pos", {
  maxn:  lever("MAX n",     2000, 50000, 100,   15000),
  ebend: lever("EVEN BEND", 0,    0.5,   0.005, 0.12),
  obend: lever("ODD BEND",  0,    0.6,   0.005, 0.32),
  seg:   lever("SEGMENT",   0.02, 0.1,   0.002, 0.05),
  scale: lever("SCALE",     0.5,  1.6,   0.01,  1.0),
  glow:  lever("GLOW",      0,    1,     0.01,  0.6),
  cam: { dist: 3.2, pitch: 0.2, tgtY: 0.3, rot: 0.03 },
  gain: 0.8, accent: "#a8e08f",
},
(P, s, q, t) => {
  // the point's own starting number, 1 + floor(q.x MAX); it is
  // always under 2^16, so the high half starts empty
  const n0 = 1.0 + Math.floor(q.x * P.maxn);

  // the descent: m halves or triples, mod 2^32 exactly as the
  // shader's uint; the parity window (wlo, whi) shifts left each
  // step, newest parity into bit 0, bit 31 falling away
  const o = s.orbit(220, { lo: n0, hi: 0.0, wlo: 0.0, whi: 0.0 }, (v) => ({
    lo: (mod(v.lo, 2.0) < 0.5)
        ? Math.floor(v.lo / 2.0) + mod(v.hi, 2.0) * 32768.0
        : mod(3.0 * v.lo + 1.0, 65536.0),
    hi: (mod(v.lo, 2.0) < 0.5)
        ? Math.floor(v.hi / 2.0)
        : mod(3.0 * v.hi + Math.floor((3.0 * v.lo + 1.0) / 65536.0), 65536.0),
    wlo: mod(v.wlo * 2.0 + mod(v.lo, 2.0), 65536.0),
    whi: mod(v.whi * 2.0 + Math.floor((v.wlo * 2.0 + mod(v.lo, 2.0)) / 65536.0), 65536.0),
  }), { until: (v) => v.lo == 1.0 && v.hi == 0.0 });

  // keep at most 32 steps of tail; a start already at 1 has nothing
  const keepf = (o.count < 32) ? (o.count + 0.0) : 32.0;
  if (keepf <= 0.0) {
    return s.decline();
  }

  // the drawn segment index this point will light
  const target = Math.floor(s.u() * keepf);

  // the replay, from the shared destination outward: each step reads
  // parity from bit 0 and shifts the window right, bends the heading
  // one way for an even step and the other for an odd one, and walks
  // one segment; the step whose index is the target leaves its
  // endpoint and its depth behind for the deposit
  const r = s.orbit(32, {
    j: 0.0, wlo: o.wlo, whi: o.whi, dir: PI * 0.5,
    px: 0.0, py: 0.0, ox: 0.0, oy: 0.0, dep: 0.0,
  }, (v, k) => ({
    j: v.j + 1.0,
    wlo: Math.floor(v.wlo / 2.0) + mod(v.whi, 2.0) * 32768.0,
    whi: Math.floor(v.whi / 2.0),
    dir: v.dir + ((mod(v.wlo, 2.0) < 0.5) ? P.ebend : -P.obend),
    px: v.px + P.seg * Math.cos(v.dir + ((mod(v.wlo, 2.0) < 0.5) ? P.ebend : -P.obend)),
    py: v.py + P.seg * Math.sin(v.dir + ((mod(v.wlo, 2.0) < 0.5) ? P.ebend : -P.obend)),
    ox: (k == target)
        ? v.px + P.seg * Math.cos(v.dir + ((mod(v.wlo, 2.0) < 0.5) ? P.ebend : -P.obend))
        : v.ox,
    oy: (k == target)
        ? v.py + P.seg * Math.sin(v.dir + ((mod(v.wlo, 2.0) < 0.5) ? P.ebend : -P.obend))
        : v.oy,
    dep: (k == target) ? (k + 0.0) : v.dep,
  }), { until: (v) => v.j >= keepf });

  return s.deposit({
    xyz: [r.ox * P.scale, r.oy * P.scale, 0.0],
    col: pal(r.dep / keepf * 0.7 + 0.05, [0.4, 0.5, 0.4], [0.4, 0.45, 0.4],
             [1.0, 0.95, 0.8], [0.2, 0.35, 0.15]),
    glow: 0.5 + 0.7 * P.glow,
  });
});
