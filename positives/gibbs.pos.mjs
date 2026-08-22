// Plate IX The Gibbs Phenomenon, as a positive - convergence itself
// as a surface. q.y is the harmonic budget: nf harmonics deep, the
// partial Fourier sum of a square wave or a sawtooth rebuilds the jump
// and overshoots it by the same stubborn nine percent at every depth.
// The orbit carries the partial sum; until restates the shader's break
// at the top of each turn, and the last harmonic fades in through the
// clamp weight so the surface is continuous in q.y. The parity gate
// odd appears twice inside the accumulator field, its ternary inlined
// where the shader bound it once: orbit fields are single expressions,
// and the repeats are the same pure value.
import { positive, lever, TAU, PI, mod, clamp, mix, fract, smoothstep,
         mix3, add3, mul3 } from "../core/measure.mjs";

export default positive("gibbs_pos", {
  harmonics: lever("HARMONICS",   1,   64,  1,    24),
  saw:       lever("SQUARE↔SAW",  0,   1,   0.01, 0),
  speed:     lever("PHASE SPEED", 0,   2,   0.01, 0.6),
  depthax:   lever("DEPTH AXIS",  0.5, 4,   0.01, 2.6),
  amp:       lever("AMPLITUDE",   0.2, 1.6, 0.01, 0.9),
  cam: { dist: 3.4, pitch: 0.35, tgtY: 0.0, rot: 0.03 },
  gain: 1.1, accent: "#7fb4ff",
},
(P, s, q, t) => {
  // one period and a little more across the plate; nf is the
  // fractional harmonic count this row of the surface may keep
  const x = (q.x - 0.5) * TAU * 1.05;
  const nf = 1.0 + q.y * (P.harmonics - 1.0);
  const ph = P.speed * t;
  const xi = mod(x - ph + PI, TAU) - PI;
  const A = 0.75;

  // the partial sum: odd harmonics build the square wave, alternating
  // signs build the sawtooth, and the weight fades the last one in
  const o = s.orbit(64, { fk: 1.0, sn: 0.0 }, (w) => ({
    fk: w.fk + 1.0,
    sn: w.sn + clamp(nf - w.fk + 1.0, 0.0, 1.0)
        * mix(((fract(w.fk * 0.5) > 0.25) ? 1.0 : 0.0) * (4.0 * A / PI) / w.fk,
              (2.0 * A / PI)
                * (((((fract(w.fk * 0.5) > 0.25) ? 1.0 : 0.0)) > 0.5) ? 1.0 : -1.0)
                / w.fk,
              P.saw)
        * Math.sin(w.fk * xi),
  }), { until: (w) => w.fk > nf + 1.0 });

  // the limit function, for measuring the overshoot; the hot ridges
  // flanking each jump are the deviation refusing to die
  const lim = mix(A * Math.sign(Math.sin(xi)), A * xi / PI, P.saw);
  const dev = Math.abs(o.sn - lim);
  const y = P.amp * 0.65 * o.sn;
  const base = mix3([0.10, 0.26, 0.50], [0.55, 0.75, 1.0], 0.5 + 0.55 * o.sn);
  return s.deposit({
    xyz: [x * 0.42, y, (q.y - 0.5) * P.depthax * 0.8],
    col: add3(mul3(base, 0.55),
              mul3([1.0, 0.42, 0.12], smoothstep(0.03, 0.28, dev) * 1.5)),
  });
});
