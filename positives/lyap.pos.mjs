// Plate XXXV Lyapunov's Garden, as a positive - the logistic map
// driven by two growth rates a and b taken in turns. The point's
// coordinate picks (a, b) in the pan-and-zoom window, the forcing
// rhythm walks its period, and the Lyapunov accumulator averages
// log|r(1-2x)| over the recorded steps: the swallow bays rise where
// the alternation tames the map, the chaotic sea lies low.
//
// The shader's 424-pass loop with its 40 transient steps is two
// successive orbits, the recorded one seeded from the warm-up's
// final fields. The step index mod the period, m, rides as a state
// field advanced by mod(m + 1, per), because a step cannot bind
// locals to recompute it from j; the values are the same exact
// small integers. The six-way useA selection on SEQUENCE is the
// shader's chain restated with float leaves (a or b directly),
// since the emitter refuses bool-armed ternaries inside a step.
import { positive, lever, pal, mix3, mul3, clamp, smoothstep, mod }
  from "../core/measure.mjs";

export default positive("lyap_pos", {
  seq:    lever("SEQUENCE", 0,   5,   1,     0),
  steps:  lever("STEPS",    60,  384, 1,     250),
  height: lever("HEIGHT",   0,   1.5, 0.01,  1.0),
  amin:   lever("A MIN",    2.4, 3.2, 0.001, 2.4),
  win:    lever("WINDOW",   0.4, 1.6, 0.001, 1.6),
  tint:   lever("TINT",     0,   1,   0.01,  0.5),
  glow:   lever("GLOW",     0,   1,   0.01,  0.6),
  cam: { dist: 3.4, pitch: 0.55, tgtY: 0.25, rot: 0.03 },
  gain: 0.9, accent: "#c0e068",
},
(P, s, q, t) => {
  // the rhythm: AB, then AAB ABB at period three, then AABB AAAB
  // ABBB at period four; the lever is integral, compared as its
  // snapped float
  const sq = P.seq;
  let per = 0;
  if (sq == 0.0) { per = 2; }
  else if (sq <= 2.0) { per = 3; }
  else { per = 4; }

  // the (a, b) window: A MIN pans, WINDOW zooms, the span clamped so
  // the map stays inside [0, 1]; a whisper of jitter unsticks the
  // lattice, then both rates clamp to the lawful range
  const aLo = P.amin;
  const span = Math.min(P.win, 4.0 - aLo);
  const jt = s.jitter2();
  const a = clamp(aLo + (q.x + jt.x * 0.0015) * span, 2.4, 4.0);
  const b = clamp(aLo + (q.y + jt.y * 0.0015) * span, 2.4, 4.0);

  const x0 = 0.25 + 0.5 * s.u();

  // the transient: forty unrecorded steps forget the start. Each
  // step takes rate a or b by the rhythm's slot m, and the iterate
  // is clamped away from the absorbing endpoints, as the shader does
  const oA = s.orbit(40, { x: x0, m: 0.0 }, (z) => ({
    x: clamp((sq == 0.0 ? (z.m == 0.0 ? a : b)
            : sq == 1.0 ? (z.m < 2.0 ? a : b)
            : sq == 2.0 ? (z.m == 0.0 ? a : b)
            : sq == 3.0 ? (z.m < 2.0 ? a : b)
            : sq == 4.0 ? (z.m < 3.0 ? a : b)
            : (z.m == 0.0 ? a : b)) * z.x * (1.0 - z.x),
             1.0e-6, 1.0 - 1.0e-6),
    m: mod(z.m + 1.0, per),
  }));

  // the recorded pass, seeded from the transient's landing: the
  // accumulator sums log|r(1-2x)| at the same x the step consumes
  const oB = s.orbit(P.steps, { x: oA.x, m: oA.m, acc: 0.0 }, (z) => ({
    x: clamp((sq == 0.0 ? (z.m == 0.0 ? a : b)
            : sq == 1.0 ? (z.m < 2.0 ? a : b)
            : sq == 2.0 ? (z.m == 0.0 ? a : b)
            : sq == 3.0 ? (z.m < 2.0 ? a : b)
            : sq == 4.0 ? (z.m < 3.0 ? a : b)
            : (z.m == 0.0 ? a : b)) * z.x * (1.0 - z.x),
             1.0e-6, 1.0 - 1.0e-6),
    m: mod(z.m + 1.0, per),
    acc: z.acc + Math.log(Math.max(Math.abs(
           (sq == 0.0 ? (z.m == 0.0 ? a : b)
          : sq == 1.0 ? (z.m < 2.0 ? a : b)
          : sq == 2.0 ? (z.m == 0.0 ? a : b)
          : sq == 3.0 ? (z.m < 2.0 ? a : b)
          : sq == 4.0 ? (z.m < 3.0 ? a : b)
          : (z.m == 0.0 ? a : b)) * (1.0 - 2.0 * z.x)), 1.0e-12)),
  }));
  const lam = clamp(oB.acc / Math.max(oB.count, 1.0), -4.0, 4.0);

  // the graph of lambda: the window renormalised to the unit square,
  // the bays rising as gold hills of height -lambda
  const u = (a - aLo) / Math.max(span, 1.0e-6);
  const v = (b - aLo) / Math.max(span, 1.0e-6);
  const relief = clamp(-lam, -1.0, 2.5);

  // stable bays warm gold-green graded by -lambda; the chaotic sea
  // cold, dim blue, dimmer the deeper lambda runs positive
  const bay = 1.0 - smoothstep(-0.06, 0.06, lam);
  const rise = clamp(-lam * 0.4, 0.0, 1.0);
  const warm = mul3(pal(0.15 + 0.35 * rise + 0.3 * (P.tint - 0.5),
                        [0.46, 0.50, 0.16], [0.36, 0.42, 0.12],
                        [1.0, 1.0, 1.0], [0.54, 0.50, 0.0]),
                    0.55 + 0.75 * rise);
  const cold = mul3([0.09, 0.14, 0.30],
                    1.0 - 0.4 * clamp(lam * 0.8, 0.0, 1.0));
  return s.deposit({
    xyz: [(u - 0.5) * 2.4, relief * P.height * 0.4, (v - 0.5) * 2.4],
    col: mul3(mix3(cold, warm, bay), 0.4 + 0.9 * P.glow),
  });
});
