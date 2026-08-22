// Plate XIX The Feigenbaum Tree, as a positive - q.x sweeps the dial
// r across the sheet, each point runs one orbit of the chosen map,
// and where the orbit lands is where the light lands, so brightness
// is the invariant density. A Lyapunov accumulator sums log|f'(x)|
// over a short recorded tail after the burn-in, and reads out as
// depth and as the cool-to-warm grade.
//
// The shader's single 600-pass loop, recording only past BURN-IN, is
// restated as two successive orbits: the burn-in orbit forgets the
// hashed start, then the recorded orbit is seeded from its landing.
// The MAP arms (logistic, sine, tent) are if/else in the shader; an
// orbit step cannot hold statements, so they are the equivalent
// float-leaf ternary chain on the integer lever, applied identically
// in both orbits. Constants verbatim throughout.
import { positive, lever, mix3, mul3, mix, clamp, smoothstep, PI }
  from "../core/measure.mjs";

export default positive("bifurc_pos", {
  burn:   lever("BURN-IN",  100, 500, 1,     300),
  rmin:   lever("r MIN",    2.5, 4.0, 0.001, 2.8),
  rmax:   lever("r MAX",    2.5, 4.0, 0.001, 4.0),
  relief: lever("λ RELIEF", 0,   1.2, 0.01,  0.5),
  map:    lever("MAP",      0,   2,   1,     0),
  glow:   lever("GLOW",     0,   1,   0.01,  0.6),
  cam: { dist: 3.3, pitch: 0.18, tgtY: 0.0, rot: 0.03 },
  gain: 0.75, accent: "#ff9e7a",
},
(P, s, q, t) => {
  // the dial, and the per-map rates: rs drives the sine map, mu the
  // tent map, both fixed for the whole orbit
  const r = mix(P.rmin, P.rmax, q.x);
  const mt = P.map;
  const rs = r * 0.25;
  const mu = r * 0.5;

  // a hashed start on the interval, and a hashed tail length so the
  // recorded landings spread over the attractor instead of
  // stroboscoping one phase of a cycle
  const x0 = 0.2 + 0.6 * s.u();
  const extra = s.pick(60);

  // burn-in: the orbit forgets its start; nothing is recorded
  const o1 = s.orbit(P.burn, { x: x0 }, (z) => ({
    x: mt == 0.0 ? r * z.x * (1.0 - z.x)
     : mt == 1.0 ? rs * Math.sin(PI * z.x)
     : (z.x < 0.5 ? mu * z.x : mu * (1.0 - z.x)),
  }));

  // the recorded tail, seeded from the burn-in's landing: the
  // accumulator sums log|f'(x)| with the derivative taken at the
  // same x the step consumes, and n counts steps so the until can
  // stop at the hashed tail length
  const o2 = s.orbit(60, { x: o1.x, n: 0.0, acc: 0.0 }, (z) => ({
    x: mt == 0.0 ? r * z.x * (1.0 - z.x)
     : mt == 1.0 ? rs * Math.sin(PI * z.x)
     : (z.x < 0.5 ? mu * z.x : mu * (1.0 - z.x)),
    n: z.n + 1.0,
    acc: z.acc + Math.log(Math.abs(
           mt == 0.0 ? r * (1.0 - 2.0 * z.x)
         : mt == 1.0 ? rs * PI * Math.cos(PI * z.x)
         : (z.x < 0.5 ? mu : -mu)) + 1.0e-9),
  }), { until: (z) => z.n >= extra });

  // the exponent, and its readout: depth is clamped lambda scaled by
  // the relief lever; colour crosses cool to warm where lambda
  // changes sign
  const lam = o2.acc / Math.max(o2.count, 1.0);
  const pz = P.relief * clamp(lam, -1.0, 1.0);
  return s.deposit({
    xyz: [(q.x - 0.5) * 2.6, (o2.x - 0.5) * 2.2, pz],
    col: mul3(mix3([0.3, 0.6, 1.0], [1.0, 0.5, 0.2],
                   smoothstep(-0.12, 0.12, lam)),
              0.4 + 0.9 * P.glow),
  });
});
