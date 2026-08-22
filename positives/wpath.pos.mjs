// Plate XLI Monsters of Analysis, as a positive. Three pathological
// sums share one recurrence: the phase lives in turns, t_{n+1} =
// fract(b t_n) with integer b, so cos(b^n pi x) is cos(TAU t_n) and
// b^n itself is never formed. The depth axis is the truncation: q.y
// sets a fractional N and the newest term fades in through the weight
// w = clamp(nf - i, 0, 1), so roughness arrives scale by scale. The
// walk is one orbit carrying the phase, the envelope, the partial sum,
// the Takagi recentering mean, and the newest-term glow; the loop
// counter rides in the state because the stop condition needs it.
// No draws anywhere: the plate reads neither rnd nor seed, so the
// same point and clock reproduce the same stroke exactly.
import { positive, lever, pal, fract, mix, clamp, TAU, PI } from "../core/measure.mjs";

export default positive("wpath_pos", {
  func:   lever("FUNCTION",  0,    2,    1,     0),
  terms:  lever("TERMS",     1,    24,   1,     18),
  amp:    lever("AMPLITUDE", 0.3,  0.95, 0.01,  0.5),
  freq:   lever("FREQ",      2,    9,    1,     7),
  zoom:   lever("ZOOM",      0,    2.5,  0.01,  0),
  cenx:   lever("CENTER X",  -1,   1,    0.001, 0),
  height: lever("HEIGHT",    0.2,  1.8,  0.01,  1.0),
  glow:   lever("GLOW",      0,    1,    0.01,  0.6),
  cam: { dist: 3.4, pitch: 0.35, tgtY: 0.0, rot: 0.03 },
  gain: 0.95, accent: "#d8c8a8",
},
(P, s, q, t) => {
  // 0 Weierstrass, 1 Takagi, 2 Riemann; the lever is exact at its steps
  const fsel = Math.floor(P.func + 0.5);
  const a = P.amp;
  const b = P.freq;

  // the sample window is 10^-ZOOM wide about CENTER X, panned gently
  // on the clock at a speed scaled to the window itself
  const halfw = Math.pow(10.0, -P.zoom);
  const x = P.cenx + 0.05 * halfw * Math.sin(0.16 * t) + (q.x - 0.5) * 2.0 * halfw;

  // fractional truncation N along the depth axis
  const nf = 1.0 + q.y * (P.terms - 1.0);

  // phase in turns: t_0 is frac(x/2) so that cos(TAU t) = cos(pi x),
  // except Takagi, which runs b = 2 from frac(x) and measures the
  // distance to the nearest integer as min(t, 1 - t)
  const tn0 = (fsel == 1.0) ? fract(x) : fract(0.5 * x);
  const bb = (fsel == 1.0) ? 2.0 : b;

  // the sum, term by term. Every field reads the previous state, which
  // is exactly the shader's ordering: term and rel from the incoming
  // amp and phase, then the envelope decays and the phase advances.
  // The Riemann arm ignores the recurrence and takes sin(pi n^2 x)
  // directly; its envelope and phase still tick, unused, as they do
  // in the shader. The stop repeats the shader's break: the loop ends
  // where the weight would reach zero.
  const o = s.orbit(24, { tn: tn0, amp: 1.0, ps: 0.0, mc: 0.0, g: 0.0, i: 0.0 }, (st) => ({
    tn: fract(bb * st.tn),
    amp: st.amp * ((fsel == 1.0) ? 0.5 : a),
    ps: st.ps + clamp(nf - st.i, 0.0, 1.0) *
        ((fsel == 0.0) ? st.amp * Math.cos(TAU * st.tn)
       : (fsel == 1.0) ? st.amp * Math.min(st.tn, 1.0 - st.tn)
       : Math.sin(PI * (st.i + 1.0) * (st.i + 1.0) * x) / (PI * (st.i + 1.0) * (st.i + 1.0))),
    mc: st.mc + ((fsel == 1.0) ? 0.25 * st.amp * clamp(nf - st.i, 0.0, 1.0) : 0.0),
    g: mix(st.g,
           (fsel == 0.0) ? Math.abs(Math.cos(TAU * st.tn))
         : (fsel == 1.0) ? 2.0 * Math.min(st.tn, 1.0 - st.tn)
         : Math.abs(Math.sin(PI * (st.i + 1.0) * (st.i + 1.0) * x)),
           clamp(nf - st.i, 0.0, 1.0)),
    i: st.i + 1.0,
  }), { until: (st) => nf - st.i <= 0.0 });

  // per-function vertical normalizer: sum a^n stays under 1/(1 - a),
  // Takagi under 2/3, Riemann under pi/6
  const vsc = (fsel == 0.0) ? (1.0 - a) : ((fsel == 1.0) ? 1.4 : 1.8);

  return s.deposit({
    xyz: [(q.x - 0.5) * 2.6, P.height * vsc * (o.ps - o.mc), (q.y - 0.5) * 1.6],
    col: pal(0.55 - 0.45 * o.g + 0.05 * q.y,
             [0.50, 0.45, 0.38], [0.42, 0.36, 0.28],
             [1.0, 1.0, 1.0], [0.00, 0.06, 0.18]),
    glow: 0.30 + 0.25 * o.g + P.glow * (0.30 + 1.05 * o.g),
  });
});
