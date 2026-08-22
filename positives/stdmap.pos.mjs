// Plate XX The Chirikov Standard Map, as a positive - the kicked
// rotor. Each point starts at its own coordinate on the phase square
// (the low-discrepancy initial condition), the orbit iterates kick
// and drift, and a tangent vector carried in the same record measures
// the finite-time Lyapunov exponent: the Jacobian acts, the length is
// logged into the accumulator, the vector is renormalised.
//
// The shader binds per-step locals (c, ddp, ddth, nl); an orbit step
// cannot, so those bindings are inlined into the record's next-state
// fields as the same expression trees, evaluated in the same order:
// ddp = uy + c*ux, ddth = ux + ddp, nl = length(ddth, ddp), then
// dv/nl and log(nl + 1e-9). The state update keeps the shader's
// sequencing exactly: p advances with the old theta, theta advances
// with the new p (written as fract(th + fract(p + ...))).
import { positive, lever, mix3, mul3, mix, clamp, smoothstep, fract, TAU }
  from "../core/measure.mjs";

export default positive("stdmap_pos", {
  kick:     lever("KICK K",       0,   6,   0.005, 0.97),
  iters:    lever("ITERATIONS",   20,  400, 1,     220),
  blend:    lever("TORUS ↔ FLAT", 0,   1,   0.01,  0.0),
  ftleGain: lever("FTLE GAIN",    0.2, 3,   0.01,  1.0),
  glow:     lever("GLOW",         0,   1,   0.01,  0.55),
  cam: { dist: 3.2, pitch: 0.75, tgtY: 0.0, rot: 0.02 },
  gain: 0.7, accent: "#8fb8ff",
},
(P, s, q, t) => {
  const K = P.kick;

  // the tangent seed: a random direction nudged off zero, then unit
  // length, as the shader's normalize(rnd.xy - 0.5 + vec2(1e-3, 7e-4))
  const jt = s.jitter2();
  const ex = jt.x + 1.0e-3;
  const ey = jt.y + 7.0e-4;
  const en = Math.hypot(ex, ey);

  // rotor and tangent in one record; acc collects log of the growth
  const o = s.orbit(P.iters,
    { th: q.x, p: q.y, ux: ex / en, uy: ey / en, acc: 0.0 }, (z) => ({
    th: fract(z.th + fract(z.p + (K / TAU) * Math.sin(TAU * z.th))),
    p: fract(z.p + (K / TAU) * Math.sin(TAU * z.th)),
    ux: (z.ux + (z.uy + K * Math.cos(TAU * z.th) * z.ux))
      / Math.hypot(z.ux + (z.uy + K * Math.cos(TAU * z.th) * z.ux),
                   z.uy + K * Math.cos(TAU * z.th) * z.ux),
    uy: (z.uy + K * Math.cos(TAU * z.th) * z.ux)
      / Math.hypot(z.ux + (z.uy + K * Math.cos(TAU * z.th) * z.ux),
                   z.uy + K * Math.cos(TAU * z.th) * z.ux),
    acc: z.acc + Math.log(
           Math.hypot(z.ux + (z.uy + K * Math.cos(TAU * z.th) * z.ux),
                      z.uy + K * Math.cos(TAU * z.th) * z.ux) + 1.0e-9),
  }));
  const ftle = o.acc / P.iters;

  // the seat: the phase square laid flat, or wrapped onto the torus
  // it always was, blended by the lever
  const kk = clamp(P.blend, 0.0, 1.0);
  const fx = (o.th - 0.5) * 2.4;
  const fy = (o.p - 0.5) * 2.4;
  const aa = TAU * o.th;
  const bb = TAU * o.p;
  const R = 1.2;
  const rr = 0.5;
  const tx = (R + rr * Math.cos(bb)) * Math.cos(aa);
  const ty = rr * Math.sin(bb);
  const tz = (R + rr * Math.cos(bb)) * Math.sin(aa);
  return s.deposit({
    xyz: [mix(fx, tx, kk), mix(fy, ty, kk), mix(0.0, tz, kk)],
    col: mul3(mix3([0.3, 0.6, 1.0], [1.0, 0.5, 0.2],
                   smoothstep(0.0, 0.6, ftle * P.ftleGain)),
              0.4 + 0.8 * P.glow),
  });
});
