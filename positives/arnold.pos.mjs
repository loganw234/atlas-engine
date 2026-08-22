// Plate XXXIV Arnold Tongues, as a positive. Each point is one orbit
// of the circle map: the drive frequency comes off q.x, the coupling
// off q.y or the K MAX slice by MODE, and the mean advance per kick,
// the winding number, is what the surface plots. The shader's single
// loop with its 64 discarded kicks is restated as two successive
// orbits, the recorded one seeded from the warm-up's landing; the
// advance d moves the phase and feeds the accumulator as two verbatim
// copies of the same expression, value-identical by purity. The Farey
// search for the locked denominator, a break-out loop in the shader,
// is an orbit that carries its first find and stops on it.
import { positive, lever, pal, fract, clamp, mix3, mul3, v3, TAU }
  from "../core/measure.mjs";

export default positive("arnold_pos", {
  mode:   lever("MODE",        0,   1,    1,     0),
  kmax:   lever("K MAX",       0,   1.2,  0.005, 1.0),
  steps:  lever("STEPS",       50,  336,  1,     200),
  height: lever("HEIGHT",      0,   2,    0.01,  1.0),
  tint:   lever("TONGUE TINT", 0,   1,    0.01,  0.85),
  glow:   lever("GLOW",        0,   1,    0.01,  0.6),
  cam: { dist: 3.0, pitch: 0.5, tgtY: 0.0, rot: 0.04 },
  gain: 0.8, accent: "#ffb0c8",
},
(P, s, q, t) => {
  const ml = Math.floor(P.mode + 0.5);

  // the drive in turns, and the coupling: the whole plane in MODE 0,
  // the K MAX slice in MODE 1
  const Om = q.x;
  const K = (ml == 0.0) ? q.y * P.kmax : P.kmax;

  // a hashed phase forgets itself over 64 unrecorded transient kicks
  const th0 = s.u();
  const o1 = s.orbit(64, { th: th0 }, (z) => ({
    th: fract(z.th + (Om + (K / TAU) * Math.sin(TAU * z.th))),
  }));

  // the recorded kicks: the same advance d, read before the phase
  // moves, both accumulates the unwrapped winding and wraps the phase
  const o2 = s.orbit(P.steps, { th: o1.th, acc: 0.0 }, (z) => ({
    th: fract(z.th + (Om + (K / TAU) * Math.sin(TAU * z.th))),
    acc: z.acc + (Om + (K / TAU) * Math.sin(TAU * z.th)),
  }));

  const stepsl = Math.floor(P.steps + 0.5);
  const fsteps = Math.max(stepsl, 1.0);
  const rho = o2.acc / fsteps;

  // Farey classification: the lowest denominator whose rational sits
  // within tol of the measured winding claims the orbit; the bq field
  // keeps the first find and the until stops on it, as the break did
  const tol = 1.2 / fsteps;
  const fa = s.orbit(8, { qi: 1.0, bq: 0.0 }, (z) => ({
    qi: z.qi + 1.0,
    bq: (z.bq > 0.0) ? z.bq
      : ((Math.abs(rho - Math.floor(rho * z.qi + 0.5) / z.qi) < tol) ? z.qi : 0.0),
  }), { until: (z) => z.bq > 0.0 });

  // locked orbits tint by denominator, quasiperiodic ones stay the
  // dim grey-blue
  let col = v3(0.22, 0.28, 0.42);
  if (fa.bq > 0.0) {
    col = mix3([0.8, 0.76, 0.8],
               pal(fa.bq * 0.125, [0.62, 0.45, 0.52], [0.38, 0.32, 0.38],
                   [1.0, 1.0, 1.0], [0.0, 0.28, 0.6]),
               clamp(P.tint, 0.0, 1.0));
  }
  col = mul3(col, 0.4 + 0.9 * P.glow);

  // the two returns of the shader become one deposit: the tongue
  // surface over the plane in MODE 0, the staircase ribbon in MODE 1
  let px = 0.0, py = 0.0, pz = 0.0;
  if (ml == 0.0) {
    px = (Om - 0.5) * 2.4;
    py = (rho - Om) * P.height * 4.0;
    pz = (q.y - 0.5) * 2.4;
  } else {
    px = (Om - 0.5) * 2.6;
    py = (rho - 0.5) * P.height * 1.8;
    pz = s.centered() * 0.06;
  }
  return s.deposit({ xyz: [px, py, pz], col: col });
});
