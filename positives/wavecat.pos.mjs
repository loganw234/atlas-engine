// Plate L Wave Catastrophes, as a positive. Across a fold the intensity
// is Airy's function squared, and the plate draws three of them: the
// fold A2, Pearcey's cusp A3 quadratured per point, and the rainbow
// with the supernumeraries Airy built the function for.
//
// The shader binds Ai(x) as a helper called from two of the three arms.
// The walk has no helper functions, so the argument is settled first
// and the series evaluated once, after the cusp arm has already
// returned: forms 0 and 2 differ only in what each calls s, and s is
// the stream here, so that argument is sv.
//
// The quadrature is one orbit. Its abscissa rides the record one step
// ahead of its use, set from k + 1 and spent by the next step, so the
// window and the phase read a single bound value instead of the closed
// form four times over; the step counter i in the record is what the
// shader's `if(it >= NS) break` looks at, and until() checks it before
// each step exactly as the break does.
import { positive, lever, PI, mix, clamp, smoothstep, mul3, mix3, v3 } from "../core/measure.mjs";

export default positive("wavecat_pos", {
  form:    lever("FORM",         0,    2,   1,    0),
  fringe:  lever("FRINGE SCALE", 0.3,  3,   0.01, 1.0),
  drop:    lever("DROP SIZE",    0.15, 3,   0.01, 0.4),
  quality: lever("QUALITY",      96,   256, 8,    160),
  tint:    lever("TINT",         0,    1,   0.01, 0.85),
  glow:    lever("GLOW",         0,    1,   0.01, 0.5),
  cam: { dist: 3.0, pitch: 0.5, tgtY: 0.0, rot: 0.03 },
  gain: 0.95, accent: "#ffc287",
},
(P, s, q, t) => {
  const form = Math.floor(P.form + 0.5);
  const fs = P.fringe;
  const drop = Math.max(P.drop, 0.05);
  const tint = clamp(P.tint, 0.0, 1.0);
  const gl = 0.35 + 0.85 * P.glow;
  const warm = v3(1.00, 0.76, 0.53);

  // the sampled window across the caustic in Airy units: negative s is
  // the illuminated two-ray side, positive s the dark side
  const sMin = -(3.0 + 7.0 * fs);
  const sMax = 1.0 + 2.0 * fs;

  if (form == 1.0) {
    // THE CUSP (A3). P(X, Y) = int exp(i(t^4 + X t^2 + Y t)) dt by
    // direct midpoint quadrature per point. The stationary points
    // collide along X = -6t^2, Y = 8t^3, and that parametrization is
    // drawn as a wire rather than eliminated.
    const ps = 0.65 + 0.35 * fs;
    const sz = 1.30 / (4.75 * ps);
    const sy = 1.30 / (6.50 * ps);
    let X = 0.0, Y = 0.0;
    let cv = v3(0.0, 0.0, 0.0);

    const coin = s.u();
    if (coin < 0.03) {
      const tp = mix(-1.15, 1.15, q.x);
      X = -6.0 * tp * tp;
      Y = 8.0 * tp * tp * tp;
      cv = mul3(mul3([0.62, 0.78, 1.00], 0.055), gl);
    } else {
      X = mix(-6.5, 3.0, q.x) * ps;
      Y = mix(-6.5, 6.5, q.y) * ps;
      // truncation T is tied to the step count so the fastest phase
      // advance stays below Nyquist, and the window exp(-(t/T)^8)
      // removes the truncation ringing
      const NS = clamp(Math.floor(P.quality + 0.5), 8.0, 256.0);
      const T = clamp(Math.pow(0.275 * NS, 0.25), 2.0, 3.2);
      const dt = 2.0 * T / NS;
      const T2 = T * T;
      const acc = s.orbit(256, { sr: 0.0, si: 0.0, tt: -T + 0.5 * dt, i: 0.0 }, (v, k) => ({
        sr: v.sr + Math.exp(-(((v.tt * v.tt) / T2) * ((v.tt * v.tt) / T2))
                             * (((v.tt * v.tt) / T2) * ((v.tt * v.tt) / T2)))
                 * Math.cos((v.tt * v.tt) * (v.tt * v.tt) + X * (v.tt * v.tt) + Y * v.tt),
        si: v.si + Math.exp(-(((v.tt * v.tt) / T2) * ((v.tt * v.tt) / T2))
                             * (((v.tt * v.tt) / T2) * ((v.tt * v.tt) / T2)))
                 * Math.sin((v.tt * v.tt) * (v.tt * v.tt) + X * (v.tt * v.tt) + Y * v.tt),
        tt: -T + ((k + 1) + 0.5) * dt,
        i: v.i + 1.0,
      }), { until: (v) => v.i >= NS });
      const sr = acc.sr * dt;
      const si = acc.si * dt;
      // |P(0,0)|^2 = 4 Gamma(5/4)^2 = 3.2863 normalizes the field, and
      // the soft knee holds the cusp focus near 1.08 so the brightest
      // point of this form stays inside budget even at GLOW = 1
      const Ir = (sr * sr + si * si) / 3.29;
      const Ip = Ir / (1.0 + 0.46 * Ir);
      cv = mul3(mul3(mul3(mix3([0.85, 0.50, 0.26], [1.02, 0.86, 0.66], clamp(Ip, 0.0, 1.0)),
                          Ip), gl), 1.05);
    }

    // the field fills exactly +-1.30 in both axes; the wire is
    // parametrized in (X, Y) rather than in q, so it is the only thing
    // this clip ever cuts
    const wpx = Y * sy;
    const wpz = (X + 1.75 * ps) * sz;
    if (Math.abs(wpx) > 1.305 || Math.abs(wpz) > 1.305) { return s.decline(); }
    return s.deposit({ xyz: [wpx, 0.0, wpz], col: cv });
  }

  // The fold and the rainbow both read Ai at their own place across the
  // caustic. wrf carries the fold's wire coin as a flag, since the
  // subset has no boolean that survives a declaration.
  let sv = 0.0, wrf = 0.0, lt = 0.0;
  if (form == 2.0) {
    lt = s.u();
    sv = mix(sMin, sMax, q.y);
  } else {
    const coin = s.u();
    wrf = (coin < 0.02) ? 1.0 : 0.0;
    sv = (wrf > 0.5) ? 0.0 : mix(sMin, sMax, q.y);
  }

  // Ai(x) by its power series, Ai = c1 f - c2 g. The series is used
  // only on -7 < x < 3; beyond that it is not the truncation that
  // fails but float32, the largest interior term reaching ~2e4 at
  // x = -7, so the asymptotics take over and are blended in over
  // -7 < x < -6.
  const ax = Math.max(Math.abs(sv), 1.0e-8);
  const z = 0.66666667 * Math.pow(ax, 1.5);
  const am = 1.0 / (1.77245385 * Math.pow(ax, 0.25));
  const cq = 5.0 / (72.0 * Math.max(z, 1.0e-3));
  let ai = 0.0;
  if (sv > 3.0) {
    ai = 0.5 * am * Math.exp(-Math.min(z, 60.0)) * (1.0 - cq);
  } else if (sv < -7.0) {
    ai = am * (Math.sin(z + 0.25 * PI) - cq * Math.cos(z + 0.25 * PI));
  } else {
    const x3 = sv * sv * sv;
    const se = s.orbit(24, { f: 1.0, af: 1.0, g: sv, bg: sv }, (v, k) => ({
      af: v.af * (x3 / ((3.0 * k + 2.0) * (3.0 * k + 3.0))),
      f: v.f + v.af * (x3 / ((3.0 * k + 2.0) * (3.0 * k + 3.0))),
      bg: v.bg * (x3 / ((3.0 * k + 3.0) * (3.0 * k + 4.0))),
      g: v.g + v.bg * (x3 / ((3.0 * k + 3.0) * (3.0 * k + 4.0))),
    }));
    const ser = 0.3550280539 * se.f - 0.2588194038 * se.g;
    if (sv > -6.0) {
      ai = ser;
    } else {
      ai = mix(ser, am * (Math.sin(z + 0.25 * PI) - cq * Math.cos(z + 0.25 * PI)), -sv - 6.0);
    }
  }

  if (form == 2.0) {
    // THE RAINBOW, DRESSED. Descartes' k = 1 bow with the Cauchy fit
    // spreading the rainbow angle from 40.51 to 42.37 degrees, and the
    // Airy width scaling as (lambda/a)^(2/3): fine drops, wide fringes.
    const lam = mix(400.0, 700.0, lt);
    const nr = 1.3247 + 3088.5 / (lam * lam);
    const bR = Math.sqrt(Math.max((4.0 - nr * nr) / 3.0, 1.0e-6));
    const i0 = Math.asin(clamp(bR, 0.0, 0.999999));
    const t0 = Math.asin(clamp(bR / nr, 0.0, 0.999999));
    const thR = 4.0 * t0 - 2.0 * i0;
    const wRf = 0.0044 * Math.pow(1.0 / drop, 0.66666667);
    const cw = Math.pow(lam / 600.0, 0.66666667);
    const wA = wRf * cw;
    const th = thR + sv * wA;
    const lo = 0.70694 + sMin * wRf * 1.12;
    const hi = 0.73949 + sMax * wRf * 1.12;
    const Mg = 0.84 / Math.max(hi - lo, 1.0e-3);
    const rho = 0.97 + Mg * (th - 0.5 * (lo + hi));
    const phi = mix(-1.05, 1.05, q.x);
    const I2 = ai * ai / 0.28693;
    const p0 = 1.0 * Math.sin(0.22 * t);
    const swp = 0.30 * Math.exp(-(phi - p0) * (phi - p0) / 0.03);

    // wavelength to rgb, 400 nm to 700 nm, as sums of smoothsteps that
    // are never negative
    const lc = clamp(lt, 0.0, 1.0);
    const cr = smoothstep(0.42, 0.66, lc) + 0.26 * (1.0 - smoothstep(0.0, 0.20, lc));
    const cg = smoothstep(0.12, 0.40, lc) * (1.0 - smoothstep(0.58, 0.90, lc));
    const cb = 1.0 - smoothstep(0.24, 0.52, lc);

    // two measure factors, both needed for brightness to stay an
    // intensity: rho because sampling is uniform in (phi, rho), and cw
    // because each wavelength is sampled uniformly in its own s and so
    // smeared over a band of width proportional to wA
    const cA = mul3(mix3(warm, [cr, cg, cb], tint), I2);
    const cB = mul3(mul3(cA, rho), cw);
    const cv = mul3(mul3(mul3(cB, 0.66), gl), 1.0 + swp);

    const jy = s.u();
    const wpx = rho * Math.sin(phi);
    const wpy = (jy - 0.5) * 0.05;
    const wpz = rho * Math.cos(phi) - 0.83;
    if (Math.abs(wpx) > 1.48 || Math.abs(wpy) > 1.48 || Math.abs(wpz) > 1.48) { return s.decline(); }
    return s.deposit({ xyz: [wpx, wpy, wpz], col: cv });
  }

  // THE FOLD (A2). A shallow arc stands in for the caustic, with the
  // light on its concave side. Points lie on the normal offset,
  // uniform in the Airy coordinate and weighted by Ai(s)^2, so the
  // geometrical line is not the brightest place: the main lobe sits at
  // s = -1.019, a little inside it. The offset map's Jacobian is
  // carried so brightness stays a density.
  const u = mix(-1.0, 1.0, q.x);
  const Cx = 1.20 * u;
  const Cy = 0.42 * u * u;
  // length(dC) written as GLSL defines it, sqrt of the dot product.
  // Math.hypot would emit length() but computes a scaled, more
  // accurate value on the CPU, and the two evaluators would part
  // company in the last bits over a third of this arc.
  const sp = Math.sqrt(1.20 * 1.20 + (0.84 * u) * (0.84 * u));
  const nvx = -(0.84 * u) / Math.max(sp, 1.0e-6);
  const nvy = 1.20 / Math.max(sp, 1.0e-6);
  const kp = 1.008 / (sp * sp * sp);
  const nn = -sv * (0.95 / (3.0 + 7.0 * fs));
  const I0 = ai * ai / 0.28693;
  const jc = sp * Math.max(1.0 - kp * nn, 0.04);
  const u0 = 1.05 * Math.sin(0.22 * t);
  const sw = 0.30 * Math.exp(-(u - u0) * (u - u0) / 0.03);

  let tn = warm;
  if (wrf > 0.5) { tn = v3(0.42, 0.58, 0.88); }
  const amp = (wrf > 0.5) ? 0.10 : I0 * jc * 0.66;
  const cv = mul3(mul3(mul3(tn, amp), gl), 1.0 + sw);

  const jr = s.u();
  const wpx = (Cx + nn * nvx) * 0.95;
  const wpy = (jr - 0.5) * 0.05;
  const wpz = (Cy + nn * nvy - 0.46) * 0.95;
  if (Math.abs(wpx) > 1.48 || Math.abs(wpy) > 1.48 || Math.abs(wpz) > 1.48) { return s.decline(); }
  return s.deposit({ xyz: [wpx, wpy, wpz], col: cv });
});
