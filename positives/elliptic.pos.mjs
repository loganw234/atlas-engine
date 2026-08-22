// Plate XLV Elliptic Curves, as a positive. The chord-and-tangent group
// law drawn live over the reals, and the same cubic read through prime
// lenses. Three of the shader's loops are searches that stop on the
// first success, so each is an orbit whose until() inspects the
// candidate the previous step laid down: the record then finishes
// holding the accepted candidate, and escaped is the shader's break.
// The shader's helper functions have no counterpart here, so the
// Weierstrass right-hand side x^3 + ax + b is written out at every
// site, value-identical each time.
//
// Mode 1 is integer arithmetic in the shader and float arithmetic here.
// The vocabulary has no float-to-int conversion, and A and B are not
// integer levers, so the residue work is carried in floats: every value
// it touches is an exact integer well under 2^24 (the largest is
// xi*xi*xi < 97^3 = 912673), positive mod is GLSL's own mod(), and
// elliptic_pmod is the mathematical positive residue for both signs,
// so the two agree exactly rather than nearly.
import { positive, lever, pal, sum, mul3, fract, mix, clamp, mod } from "../core/measure.mjs";

export default positive("elliptic_pos", {
  mode:   lever("MODE",   0,   1,   1,    0),
  ca:     lever("A",      -4,  1.5, 0.01, -2),
  cb:     lever("B",      -2,  3,   0.01, 1),
  pmax:   lever("P MAX",  13,  97,  1,    61),
  chords: lever("CHORDS", 0,   1,   0.01, 0.35),
  win:    lever("WINDOW", 1.5, 4,   0.01, 2.6),
  glow:   lever("GLOW",   0,   1,   0.01, 0.6),
  cam: { dist: 3.2, pitch: 0.25, tgtY: 0.0, rot: 0.04 },
  gain: 0.9, accent: "#a0e8e0",
},
(P, s, q, t) => {
  const mode = Math.floor(P.mode + 0.5);
  const A = P.ca;
  const B = P.cb;
  const gl = 0.35 + 0.85 * P.glow;

  if (mode == 0.0) {
    // chords over R: the group law drawn live. The shader's scale s
    // is sc here, since s is the stream.
    const W = P.win;
    const sc = 1.15 / W;
    const stp = W / 32.0;

    // the marked point P patrols the window on a triangle sweep and is
    // pulled onto the real locus by a search that steps outward from
    // the sweep's x in alternating directions, 130 half-steps of W/32.
    // The candidate rides the record; until() weighs the one the last
    // step laid down, which is why the bound is 131 and not 130.
    const tc = t * 0.1;
    const tri = Math.abs(2.0 * fract(tc) - 1.0);
    const xr = mix(-W, W, tri);
    const lo = s.orbit(131, { x: 0.0, on: 0.0 }, (st, k) => ({
      x: clamp(((k - Math.trunc(k / 2) * 2) == 0)
                 ? xr + Math.trunc((k + 1) / 2) * stp
                 : xr - Math.trunc((k + 1) / 2) * stp, -W, W),
      on: 1.0,
    }), { until: (st) => st.on > 0.5
            && (st.x * st.x * st.x + A * st.x + B) >= 0.0
            && (st.x * st.x * st.x + A * st.x + B) <= W * W });

    let lx = 0.0, ly = -1.0;
    if (lo.escaped) {
      lx = lo.x;
      ly = Math.sqrt(lo.x * lo.x * lo.x + A * lo.x + B);
    }
    const sgn = (fract(tc) < 0.5) ? 1.0 : -1.0;
    const xP = lx;
    const yP = sgn * ly;
    const okP = ly >= 0.0;

    const deal = s.u();
    if (deal < P.chords) {
      // the chord pencil: a partner Q drawn on the visible curve, eight
      // tries, first success wins. Same shape of orbit as the locus.
      if (!okP) { return s.decline(); }
      const qs = s.orbit(9, { x: 0.0, on: 0.0 }, () => ({
        x: mix(-W, W, s.u()),
        on: 1.0,
      }), { until: (st) => st.on > 0.5
              && (st.x * st.x * st.x + A * st.x + B) >= 0.0
              && (st.x * st.x * st.x + A * st.x + B) <= W * W });
      if (!qs.escaped) { return s.decline(); }
      const xQ = qs.x;
      let yQ = Math.sqrt(xQ * xQ * xQ + A * xQ + B);
      const branch = s.u();
      if (branch < 0.5) { yQ = -yQ; }

      // slope: secant through P and Q, tangent when they coincide,
      // and no third point at all when the chord stands vertical over
      // a 2-torsion point, where the sum is the point at infinity
      let m = 0.0;
      const dx = xQ - xP;
      if (Math.abs(dx) > 1.0e-4) {
        m = (yQ - yP) / dx;
      } else if (Math.abs(yP) > 1.0e-4) {
        m = (3.0 * xP * xP + A) / (2.0 * yP);
      } else {
        return s.decline();
      }

      const x3 = m * m - xP - xQ;
      const y3 = m * (x3 - xP) + yP;

      const bead = s.u();
      if (bead < 0.14) {
        // the sum bead: P + Q is the third intersection reflected
        const j = s.jitter2();
        const smx = x3 + j.x * 0.05;
        const smy = -y3 + j.y * 0.05;
        if (Math.abs(smx) > W || Math.abs(smy) > W) { return s.decline(); }
        const jz = s.u();
        return s.deposit({
          xyz: [smx * sc, (jz - 0.5) * 0.03, smy * sc],
          col: mul3([0.63, 0.95, 0.90], 1.5),
          glow: gl,
        });
      }

      // the chord itself, spanning P, Q and the third hit with a little
      // overshoot, clipped hard to the window box
      const clo = Math.min(x3, Math.min(xP, xQ));
      const chi = Math.max(x3, Math.max(xP, xQ));
      const pad = 0.06 * (chi - clo) + 0.02;
      const xl = mix(clo - pad, chi + pad, q.y);
      const yl = m * (xl - xP) + yP;
      if (Math.abs(xl) > W || Math.abs(yl) > W) { return s.decline(); }
      const jw = s.u();
      return s.deposit({
        xyz: [xl * sc, (jw - 0.5) * 0.03, yl * sc],
        col: mul3([0.10, 0.17, 0.26], 0.85),
        glow: gl,
      });
    }

    const mark = s.u();
    if (mark < 0.006) {
      // the marked point itself
      if (!okP) { return s.decline(); }
      const j = s.jitter2();
      const jz = s.u();
      return s.deposit({
        xyz: [(xP + j.x * 0.08) * sc, (jz - 0.5) * 0.02, (yP + j.y * 0.08) * sc],
        col: mul3([1.25, 1.05, 0.70], 1.2),
        glow: gl,
      });
    }

    // the curve as filament: uniform in x, weighted toward constant
    // energy per arc length and capped at the vertical tangents
    const x = mix(-W, W, q.x);
    const r = x * x * x + A * x + B;
    if (r < 0.0) { return s.decline(); }
    let y = Math.sqrt(r);
    if (y > W) { return s.decline(); }
    const half = s.u();
    if (half < 0.5) { y = -y; }
    const dydx = (3.0 * x * x + A) / (2.0 * Math.max(Math.abs(y), 1.0e-3));
    const wt = clamp(Math.sqrt(1.0 + dydx * dydx), 1.0, 3.0);
    const jw = s.u();
    return s.deposit({
      xyz: [x * sc, (jw - 0.5) * 0.025, y * sc],
      col: mul3(mul3([1.00, 0.72, 0.40], 0.40), wt),
      glow: gl,
    });
  }

  // curtains over F_p: the same equation through prime lenses. A and B
  // are rounded to integers, the strata of q.y pick a curtain, and the
  // walk steps down at most twelve times to the prime at or below it
  // (the largest gap under 100 is eight wide).
  const PM = P.pmax;
  const Ai = Math.floor(A + 0.5);
  const Bi = Math.floor(B + 0.5);

  const p0 = Math.min(5.0 + Math.floor(q.y * (PM - 4.0)), Math.floor(PM + 0.5));
  const pw = s.orbit(12, { p: p0 }, (st) => ({ p: st.p - 1.0 }), {
    until: (st) => st.p >= 2.0
      && sum(8, (d) => ((((d + 2.0) * (d + 2.0)) <= st.p) && (mod(st.p, d + 2.0) == 0.0)) ? 1.0 : 0.0) == 0.0,
  });
  let p = pw.p;
  // trial division once more on what the walk landed on, exactly as the
  // shader tests the value its loop left behind
  const div = sum(8, (d) => ((((d + 2.0) * (d + 2.0)) <= p) && (mod(p, d + 2.0) == 0.0)) ? 1.0 : 0.0);
  if (p < 2.0 || div > 0.0) { p = 5.0; }

  let xi = Math.floor(q.x * p);
  if (xi > p - 1.0) { xi = p - 1.0; }
  const x2 = mod(xi * xi, p);
  const rh = mod(x2 * xi + Ai * xi + Bi, p);

  // y with y^2 = rh (mod p): the low half is scanned and the rest
  // mirrored. The orbit escapes either on a hit or on the shader's own
  // exhaustion test 2y > p, and the two are told apart afterwards.
  const ys0 = s.orbit(49, { y: 0.0 }, (st) => ({ y: st.y + 1.0 }), {
    until: (st) => (st.y + st.y > p) || (mod(st.y * st.y, p) == rh),
  });
  if (!ys0.escaped) { return s.decline(); }
  if (ys0.y + ys0.y > p) { return s.decline(); }
  const yf = ys0.y;
  let ys = yf;
  const mirror = s.u();
  if (yf > 0.0 && mirror < 0.5) { ys = p - yf; }

  const fp = p;
  const ty = (fp - 5.0) / Math.max(PM - 5.0, 1.0);
  const jx = s.u(), jy = s.u(), jz = s.u();
  return s.deposit({
    xyz: [(xi / fp - 0.5) * 2.2 + (jx - 0.5) * 0.018,
          (ty - 0.5) * 1.6 + (jy - 0.5) * 0.018,
          (ys / fp - 0.5) * 2.2 + (jz - 0.5) * 0.018],
    col: pal(ty * 0.8 + 0.05, [0.45, 0.55, 0.55], [0.40, 0.35, 0.35],
             [1.0, 1.0, 1.0], [0.60, 0.35, 0.25]),
    glow: 0.9 * gl,
  });
});
