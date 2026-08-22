// Plate XXXVIII How Light Leaves an Antenna, as a positive. In a
// meridian plane the field lines of the oscillating dipole are level
// curves of one flux function F(rho, theta); each point samples the
// annulus uniformly, picks a hashed contour rung, and Newton-slides
// along grad F onto its level, so a line's brightness estimates the
// area draining onto it and the pinch-off lights itself. The shader's
// helper returning vec3(F, dF/drho, dF/dtheta) cannot be a function
// here, so the Newton orbit carries the flux and both gradient
// components inline, verbatim copies of the helper's expressions
// sharing one step length; the after-loop residual test recomputes
// them once more as bound constants, exactly as the shader calls the
// helper one last time.
import { positive, lever, mix, clamp, mix3, mul3, v3, PI, TAU }
  from "../core/measure.mjs";

export default positive("dipole_pos", {
  range:    lever("RANGE",        4,  14, 0.1,  9),
  contours: lever("CONTOURS",     4,  24, 1,    12),
  newton:   lever("NEWTON STEPS", 1,  4,  1,    3),
  spread:   lever("SPREAD 3D",    0,  1,  0.01, 1.0),
  wave:     lever("WAVE SPEED",   0,  3,  0.01, 1.2),
  glow:     lever("GLOW",         0,  1,  0.01, 0.5),
  cam: { dist: 3.3, pitch: 0.15, tgtY: 0.0, rot: 0.05 },
  gain: 0.9, accent: "#90c8ff",
},
(P, s, q, t) => {
  const rng = Math.max(P.range, 2.0);
  const tt = t * P.wave;

  // a uniform sample of the meridian annulus, the axis cut away
  const rho0 = mix(0.6, rng, q.x);
  const th0 = mix(0.05, PI - 0.05, q.y);
  if (Math.abs(Math.sin(th0)) < 0.05) {
    return s.decline();
  }

  // the hashed ladder of contour levels in [-0.9, 0.9]; c = 0 exactly
  // is the degenerate axis and node set, so an exact-zero rung is
  // nudged half a rung
  const nC = Math.max(Math.floor(P.contours + 0.5), 1.0);
  const fj = Math.min(Math.floor(s.u() * nC), nC - 1.0);
  let cj = -0.9 + 1.8 * (fj + 0.5) / nC;
  if (Math.abs(cj) < 1.0e-4) {
    cj = 0.9 / nC;
  }

  // Newton projection of the scalar constraint F = cj along grad F.
  // Each field reads: the residual F - cj over the squared gradient
  // plus 1e-6 is the step length, and it moves rho along dF/drho and
  // theta along dF/dtheta, rho clamped back into the annulus. F is
  // sin^2(theta) times (cos(tau)/rho + sin(tau)) with tau = rho - t,
  // and the two gradient factors restate the helper term for term.
  const o = s.orbit(P.newton, { rho: rho0, th: th0 }, (z) => ({
    rho: clamp(z.rho
      - ((Math.sin(z.th) * Math.sin(z.th))
           * (Math.cos(z.rho - tt) * (1.0 / z.rho) + Math.sin(z.rho - tt)) - cj)
        / ((Math.sin(z.th) * Math.sin(z.th))
             * (-Math.sin(z.rho - tt) * (1.0 / z.rho)
                - Math.cos(z.rho - tt) * (1.0 / z.rho) * (1.0 / z.rho)
                + Math.cos(z.rho - tt))
           * ((Math.sin(z.th) * Math.sin(z.th))
                * (-Math.sin(z.rho - tt) * (1.0 / z.rho)
                   - Math.cos(z.rho - tt) * (1.0 / z.rho) * (1.0 / z.rho)
                   + Math.cos(z.rho - tt)))
           + (2.0 * Math.sin(z.th) * Math.cos(z.th)
                * (Math.cos(z.rho - tt) * (1.0 / z.rho) + Math.sin(z.rho - tt)))
             * (2.0 * Math.sin(z.th) * Math.cos(z.th)
                  * (Math.cos(z.rho - tt) * (1.0 / z.rho) + Math.sin(z.rho - tt)))
           + 1.0e-6)
        * ((Math.sin(z.th) * Math.sin(z.th))
             * (-Math.sin(z.rho - tt) * (1.0 / z.rho)
                - Math.cos(z.rho - tt) * (1.0 / z.rho) * (1.0 / z.rho)
                + Math.cos(z.rho - tt))),
      0.35, rng + 0.8),
    th: z.th
      - ((Math.sin(z.th) * Math.sin(z.th))
           * (Math.cos(z.rho - tt) * (1.0 / z.rho) + Math.sin(z.rho - tt)) - cj)
        / ((Math.sin(z.th) * Math.sin(z.th))
             * (-Math.sin(z.rho - tt) * (1.0 / z.rho)
                - Math.cos(z.rho - tt) * (1.0 / z.rho) * (1.0 / z.rho)
                + Math.cos(z.rho - tt))
           * ((Math.sin(z.th) * Math.sin(z.th))
                * (-Math.sin(z.rho - tt) * (1.0 / z.rho)
                   - Math.cos(z.rho - tt) * (1.0 / z.rho) * (1.0 / z.rho)
                   + Math.cos(z.rho - tt)))
           + (2.0 * Math.sin(z.th) * Math.cos(z.th)
                * (Math.cos(z.rho - tt) * (1.0 / z.rho) + Math.sin(z.rho - tt)))
             * (2.0 * Math.sin(z.th) * Math.cos(z.th)
                  * (Math.cos(z.rho - tt) * (1.0 / z.rho) + Math.sin(z.rho - tt)))
           + 1.0e-6)
        * (2.0 * Math.sin(z.th) * Math.cos(z.th)
             * (Math.cos(z.rho - tt) * (1.0 / z.rho) + Math.sin(z.rho - tt))),
  }));

  // the helper called once more on the landing: the residual gate and
  // the gradient magnitude that heats the near zone
  const ta = o.rho - tt;
  const sn = Math.sin(o.th);
  const cs = Math.cos(o.th);
  const s2 = sn * sn;
  const ct = Math.cos(ta);
  const st = Math.sin(ta);
  const ir = 1.0 / o.rho;
  const base = ct * ir + st;
  const F = s2 * base;
  const gr = s2 * (-st * ir - ct * ir * ir + ct);
  const gth = 2.0 * sn * cs * base;

  if (Math.abs(F - cj) > 0.02) {
    return s.decline();
  }
  const snth = Math.sin(o.th);
  if (Math.abs(snth) < 0.05) {
    return s.decline();
  }
  if (o.rho < 0.5 || o.rho > rng) {
    return s.decline();
  }

  // revolve about the dipole axis; a hashed half-turn shows both
  // sides of the meridian at SPREAD 3D = 0 and is measure-neutral
  // at 1
  const az = s.u() * TAU * P.spread;
  const cn = s.u();
  const mir = (cn < 0.5) ? 1.0 : -1.0;
  const scl = 1.4 / rng;
  const rs = o.rho * snth * mir * scl;

  // sign of the level in two complementary hues; |grad F| heats the
  // near zone where the loops are being made
  const gm = Math.hypot(gr, gth);
  const heat = 1.0 - Math.exp(-0.8 * gm);
  let colv = v3(1.0, 0.60, 0.30);
  if (cj > 0.0) {
    colv = v3(0.32, 0.58, 1.0);
  }
  colv = mul3(colv, 0.55 + 0.75 * heat);
  colv = mix3(colv, [1.0, 0.97, 0.90], 0.30 * heat * heat);
  colv = mul3(colv, 0.55 + 0.9 * P.glow);
  return s.deposit({
    xyz: [rs * Math.cos(az), o.rho * Math.cos(o.th) * scl, rs * Math.sin(az)],
    col: colv,
  });
});
