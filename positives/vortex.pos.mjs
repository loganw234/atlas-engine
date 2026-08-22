// Plate LIII Light with a Twist, as a positive. A Laguerre-Gaussian
// beam sampled through the cylinder its own envelope sweeps out: the
// factor e^(i l phi) winds the wavefront into |l| helices and forces a
// phase singularity on the axis, so the intensity has to vanish there.
// Brightness estimates the line integral of |u|^2 and hue reads the
// phase, Gouy shift included.
//
// The shader has three helper functions and the walk has none. The
// associated Laguerre polynomial and the radial power s^|l| are both
// selections on an integer that the levers pin, so each becomes a
// ternary chain: the polynomial's four written-out cases verbatim, and
// the power's loop as the same left-to-right product the loop builds
// (t starts at 1.0 and 1.0 * s is exactly s, so the chain and the loop
// agree bit for bit). The peak sweep is an orbit; its sample point and
// that point's square root ride the record one step ahead of their
// use, set from k + 1 and spent by the next step, which keeps the
// radial factor readable instead of sixteen copies of a sqrt.
//
// One vocabulary gap, worked around exactly: the shader's Gouy phase
// is the one-argument atan(zp/zR), and the subset carries only the
// two-argument form. It is written Math.atan2(zp, zR), which is the
// same angle whenever zR > 0, and zR = 10 w0^2 with w0 at least 0.08
// is never anything else.
import { positive, lever, pal, mul3, TAU, PI, fract, clamp } from "../core/measure.mjs";

export default positive("vortex_pos", {
  charge:    lever("ℓ CHARGE", -5,   5,    1,     2),
  radial:    lever("p RADIAL",       0,   3,    1,     0),
  superpose: lever("SUPERPOSE",      0,   2,    1,     0),
  waist:     lever("WAIST",          0.15, 0.45, 0.005, 0.28),
  zrange:    lever("Z RANGE",        0.4, 1.5,  0.01,  1.2),
  spin:      lever("SPIN",           0,   3,    0.01,  1.0),
  glow:      lever("GLOW",           0,   1,    0.01,  0.55),
  cam: { dist: 3.1, pitch: 0.25, tgtY: 0.0, rot: 0.05 },
  gain: 0.9, accent: "#b9f2a1",
},
(P, s, q, t) => {
  // wavenumber in display units: the waist sits at the origin and
  // z_R = k w0^2 / 2, so the default w0 = 0.28 gives z_R = 0.784
  const KW = 20.0;

  const lf = Math.max(-5.0, Math.min(5.0, Math.floor(P.charge + 0.5)));
  const Lf = Math.abs(lf);
  const pnf = Math.max(0.0, Math.min(3.0, Math.floor(P.radial + 0.5)));
  const md = Math.max(0.0, Math.min(2.0, Math.floor(P.superpose + 0.5)));

  const w0 = Math.max(0.08, P.waist);
  const zR = 0.5 * KW * w0 * w0;
  const dz = s.u();
  const zp = P.zrange * (2.0 * dz - 1.0);
  const wz = w0 * Math.sqrt(1.0 + (zp / zR) * (zp / zR));

  // uniform in the cylinder that follows the beam envelope, with two
  // percent of the points dealt straight into the thread on the axis
  // so the core is always interrogated however wide the ring gets
  const envf = 2.6 + 0.4 * Lf + 0.35 * pnf;
  const Rmax = Math.min(envf * wz, 1.45);
  let rr = Rmax * Math.sqrt(q.x);
  const ph = TAU * q.y;
  const rc = 0.25 * wz;
  const core = s.u();
  if (core < 0.02) { rr = rc * Math.sqrt(s.u()); }

  const xv = 2.0 * rr * rr / (wz * wz);
  const sq = Math.sqrt(Math.max(xv, 0.0));
  const psi = Math.atan2(zp, zR);
  // k r^2 / 2R(z) in the form that stays regular at the waist, where
  // the radius of curvature itself runs off to infinity
  const curv = 0.5 * KW * rr * rr * zp / (zp * zp + zR * zR);
  const tw = t * (2.0 * P.spin);

  let inten = 0.0, phase = 0.0;

  if (md == 2.0) {
    // LG(0, l) + LG(1, l): a Gouy beat. The two radial orders are
    // normalized by the sum of their peaks. L_0^a is identically 1 and
    // L_1^a is 1 + a - x, so the polynomial selector collapses on both
    // arms to what the shader's first two cases return.
    const pkA = s.orbit(31, { m: 1.0e-6, xk: 0.0, sk: 0.0 }, (v, k) => ({
      m: Math.max(v.m, Math.abs(((Lf == 0.0) ? 1.0
        : (Lf == 1.0) ? v.sk
        : (Lf == 2.0) ? v.sk * v.sk
        : (Lf == 3.0) ? v.sk * v.sk * v.sk
        : (Lf == 4.0) ? v.sk * v.sk * v.sk * v.sk
        : v.sk * v.sk * v.sk * v.sk * v.sk) * Math.exp(-0.5 * v.xk))),
      xk: 0.2 * (k + 1),
      sk: Math.sqrt(Math.max(0.2 * (k + 1), 0.0)),
    }));
    const pkB = s.orbit(31, { m: 1.0e-6, xk: 0.0, sk: 0.0 }, (v, k) => ({
      m: Math.max(v.m, Math.abs(((Lf == 0.0) ? 1.0
        : (Lf == 1.0) ? v.sk
        : (Lf == 2.0) ? v.sk * v.sk
        : (Lf == 3.0) ? v.sk * v.sk * v.sk
        : (Lf == 4.0) ? v.sk * v.sk * v.sk * v.sk
        : v.sk * v.sk * v.sk * v.sk * v.sk)
        * (1.0 + Lf - v.xk) * Math.exp(-0.5 * v.xk))),
      xk: 0.2 * (k + 1),
      sk: Math.sqrt(Math.max(0.2 * (k + 1), 0.0)),
    }));
    const pk = pkA.m + pkB.m;
    const A0 = ((Lf == 0.0) ? 1.0
      : (Lf == 1.0) ? sq
      : (Lf == 2.0) ? sq * sq
      : (Lf == 3.0) ? sq * sq * sq
      : (Lf == 4.0) ? sq * sq * sq * sq
      : sq * sq * sq * sq * sq) * Math.exp(-0.5 * xv) / pk;
    const A1 = ((Lf == 0.0) ? 1.0
      : (Lf == 1.0) ? sq
      : (Lf == 2.0) ? sq * sq
      : (Lf == 3.0) ? sq * sq * sq
      : (Lf == 4.0) ? sq * sq * sq * sq
      : sq * sq * sq * sq * sq) * (1.0 + Lf - xv) * Math.exp(-0.5 * xv) / pk;
    // the two Gouy phases differ by exactly 2 arctan(z/z_R)
    const ux = A0 + A1 * Math.cos(2.0 * psi);
    const uy = -A1 * Math.sin(2.0 * psi);
    inten = ux * ux + uy * uy;
    const ex = (Math.abs(ux) + Math.abs(uy) > 1.0e-9) ? Math.atan2(uy, ux) : 0.0;
    phase = lf * ph + KW * zp + curv - (Lf + 1.0) * psi - tw + ex;
  } else {
    // the pure mode, and its mirror superposition: both read the same
    // amplitude, so they share one peak sweep. Every maximum for
    // p <= 3 and |l| <= 5 sits at x = 5 or below, so a 31-point sweep
    // of [0, 6] brackets it, and for p = 0 the grid lands on x = |l|
    // exactly.
    const pkC = s.orbit(31, { m: 1.0e-6, xk: 0.0, sk: 0.0 }, (v, k) => ({
      m: Math.max(v.m, Math.abs(((Lf == 0.0) ? 1.0
        : (Lf == 1.0) ? v.sk
        : (Lf == 2.0) ? v.sk * v.sk
        : (Lf == 3.0) ? v.sk * v.sk * v.sk
        : (Lf == 4.0) ? v.sk * v.sk * v.sk * v.sk
        : v.sk * v.sk * v.sk * v.sk * v.sk)
        * ((pnf <= 0.0) ? 1.0
           : (pnf == 1.0) ? 1.0 + Lf - v.xk
           : (pnf == 2.0) ? 0.5 * v.xk * v.xk - (Lf + 2.0) * v.xk + 0.5 * (Lf + 1.0) * (Lf + 2.0)
           : -v.xk * v.xk * v.xk / 6.0 + 0.5 * (Lf + 3.0) * v.xk * v.xk
             - 0.5 * (Lf + 2.0) * (Lf + 3.0) * v.xk
             + (Lf + 1.0) * (Lf + 2.0) * (Lf + 3.0) / 6.0)
        * Math.exp(-0.5 * v.xk))),
      xk: 0.2 * (k + 1),
      sk: Math.sqrt(Math.max(0.2 * (k + 1), 0.0)),
    }));
    const A = ((Lf == 0.0) ? 1.0
      : (Lf == 1.0) ? sq
      : (Lf == 2.0) ? sq * sq
      : (Lf == 3.0) ? sq * sq * sq
      : (Lf == 4.0) ? sq * sq * sq * sq
      : sq * sq * sq * sq * sq)
      * ((pnf <= 0.0) ? 1.0
         : (pnf == 1.0) ? 1.0 + Lf - xv
         : (pnf == 2.0) ? 0.5 * xv * xv - (Lf + 2.0) * xv + 0.5 * (Lf + 1.0) * (Lf + 2.0)
         : -xv * xv * xv / 6.0 + 0.5 * (Lf + 3.0) * xv * xv
           - 0.5 * (Lf + 2.0) * (Lf + 3.0) * xv
           + (Lf + 1.0) * (Lf + 2.0) * (Lf + 3.0) / 6.0)
      * Math.exp(-0.5 * xv) / pkC.m;

    if (md == 1.0) {
      // LG(p, l) + LG(p, -l): 2|l| petals, with a slight detuning
      const a2 = A * Math.cos(lf * ph + 0.15 * P.spin * t);
      inten = a2 * a2;
      phase = KW * zp + curv - (2.0 * pnf + Lf + 1.0) * psi - tw;
      if (a2 < 0.0) { phase += PI; }
    } else {
      inten = A * A;
      phase = lf * ph + KW * zp + curv - (2.0 * pnf + Lf + 1.0) * psi - tw;
      // radial nodes are pi phase jumps
      if (A < 0.0) { phase += PI; }
    }
  }

  // the sampling cylinder flares with the beam, so points thin out as
  // 1/Rmax^2; undo that and the accumulated brightness is the line
  // integral of the true intensity rather than of the point count.
  // dens is the density of the two samplers combined, so the core
  // probe sharpens the estimate on the axis without biasing it.
  const cw = Rmax / (envf * wz);
  const dens = 0.98 + ((rr < rc) ? 0.02 * Rmax * Rmax / (rc * rc) : 0.0);
  inten = clamp(inten, 0.0, 1.0) * cw * cw / dens;
  if (inten < 2.0e-4) { return s.decline(); }

  return s.deposit({
    xyz: [zp, rr * Math.cos(ph), rr * Math.sin(ph)],
    col: mul3(pal(fract(phase / TAU), [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
                  [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]), inten),
    glow: 0.45 + 0.9 * P.glow,
  });
});
