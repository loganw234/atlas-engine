// Plate XXI Domain Coloring, as a positive. A pure coordinate map:
// the point is a sample z of the input plane, the height is log|f(z)|
// and the hue is arg f(z), with contour bands riding the magnitude.
// Four FUNCTION arms: z^3 - 1, a rational map, the gamma function by
// Lanczos with reflection, and Weierstrass wp on the unit lattice.
// The shader's little complex library (cexp, clog, csin, cpowc) is
// written out componentwise here; cmul, cdiv, cinv are the shared
// header's own. The wp lattice double loop becomes one orbit over the
// 25 cells, the origin skipped by value, accumulating real and
// imaginary parts as two fields in the shader's own m-major order.
import { positive, lever, pal, fract, clamp, cmul, cdiv, cinv, v2, TAU, PI, len2 } from "../core/measure.mjs";

export default positive("domain_pos", {
  fn:       lever("FUNCTION",  0,   3,   1,    0),
  zoom:     lever("ZOOM",      0.4, 8,   0.05, 1),
  creal:    lever("CENTER RE", -2,  2,   0.01, 0),
  cimag:    lever("CENTER IM", -2,  2,   0.01, 0),
  relief:   lever("RELIEF",    0,   1.2, 0.01, 0.5),
  contours: lever("CONTOURS",  0,   4,   0.01, 1.5),
  cam: { dist: 3.4, pitch: 0.5, tgtY: 0.25, rot: 0.03 },
  gain: 0.9, accent: "#c0b0ff",
},
(P, s, q, t) => {
  const fn = Math.floor(P.fn + 0.5);

  // the window, and the jittered sample z inside it
  const wnx = q.x - 0.5;
  const wny = q.y - 0.5;
  const j = s.jitter2();
  const zx = P.creal + wnx * (6.0 / P.zoom) + j.x * 0.004;
  const zy = P.cimag + wny * (6.0 / P.zoom) + j.y * 0.004;

  let wr = 0.0, wi = 0.0;
  if (fn == 0.0) {
    // z^3 - 1: the three-fold pinwheel
    const z3 = cmul(cmul(v2(zx, zy), v2(zx, zy)), v2(zx, zy));
    wr = z3.x - 1.0;
    wi = z3.y;
  } else if (fn == 1.0) {
    // (z^2 - 1)/(z^2 + 1): zeros at +-1, poles at +-i
    const z2 = cmul(v2(zx, zy), v2(zx, zy));
    const rat = cdiv(v2(z2.x - 1.0, z2.y), v2(z2.x + 1.0, z2.y));
    wr = rat.x;
    wi = rat.y;
  } else if (fn == 2.0) {
    // the gamma function, Lanczos g = 7 with reflection for Re z < 1/2
    const refl = zx < 0.5;
    let gx = zx, gy = zy;
    if (refl) {
      gx = 1.0 - zx;
      gy = -zy;
    }
    gx = gx - 1.0;
    const c1 = cinv(v2(gx + 1.0, gy));
    const c2 = cinv(v2(gx + 2.0, gy));
    const c3 = cinv(v2(gx + 3.0, gy));
    const c4 = cinv(v2(gx + 4.0, gy));
    const c5 = cinv(v2(gx + 5.0, gy));
    const c6 = cinv(v2(gx + 6.0, gy));
    const c7 = cinv(v2(gx + 7.0, gy));
    const c8 = cinv(v2(gx + 8.0, gy));
    let ar = 0.99999999999980993, ai = 0.0;
    ar += 676.5203681218851 * c1.x;
    ai += 676.5203681218851 * c1.y;
    ar += -1259.1392167224028 * c2.x;
    ai += -1259.1392167224028 * c2.y;
    ar += 771.32342877765313 * c3.x;
    ai += 771.32342877765313 * c3.y;
    ar += -176.61502916214059 * c4.x;
    ai += -176.61502916214059 * c4.y;
    ar += 12.507343278686905 * c5.x;
    ai += 12.507343278686905 * c5.y;
    ar += -0.13857109526572012 * c6.x;
    ai += -0.13857109526572012 * c6.y;
    ar += 9.9843695780195716e-6 * c7.x;
    ai += 9.9843695780195716e-6 * c7.y;
    ar += 1.5056327351493116e-7 * c8.x;
    ai += 1.5056327351493116e-7 * c8.y;
    // t = z + 7.5, then t^(z + 1/2) as cexp(cmul(e, clog(t)))
    const tzx = gx + 7.5;
    const tzy = gy;
    const lgr = Math.log(len2(tzx, tzy) + 1.0e-30);
    const lgi = Math.atan2(tzy, tzx);
    const pw = cmul(v2(gx + 0.5, gy), v2(lgr, lgi));
    const pe = Math.exp(pw.x);
    // times cexp(-t), times the accumulator, times sqrt(2 pi)
    const ee = Math.exp(-tzx);
    const m1 = cmul(v2(pe * Math.cos(pw.y), pe * Math.sin(pw.y)),
                    v2(ee * Math.cos(-tzy), ee * Math.sin(-tzy)));
    const m2 = cmul(v2(m1.x, m1.y), v2(ar, ai));
    wr = 2.5066282746310002 * m2.x;
    wi = 2.5066282746310002 * m2.y;
    if (refl) {
      // Gamma(z) = pi / (sin(pi z) Gamma(1 - z)), csin componentwise
      const dn = cmul(v2(Math.sin(PI * zx) * Math.cosh(PI * zy),
                         Math.cos(PI * zx) * Math.sinh(PI * zy)),
                      v2(wr, wi));
      const rf = cdiv(v2(PI, 0.0), v2(dn.x, dn.y));
      wr = rf.x;
      wi = rf.y;
    }
  } else {
    // Weierstrass wp: 1/z^2 plus the lattice sum over m, n in [-2, 2],
    // the origin cell skipped, each term regularized by its own 1/w^2.
    // The cell index k spells m = k/5 - 2, n = k%5 - 2 in the shader's
    // loop order.
    const s0 = cinv(cmul(v2(zx, zy), v2(zx, zy)));
    const wp = s.orbit(25, { sr: s0.x, si: s0.y }, (v, k) => ({
      sr: (Math.trunc(k / 5) - 2 == 0 && k % 5 - 2 == 0) ? v.sr
        : v.sr + (cinv(cmul(v2(zx - (Math.trunc(k / 5) - 2), zy - (k % 5 - 2)),
                            v2(zx - (Math.trunc(k / 5) - 2), zy - (k % 5 - 2)))).x
                - cinv(cmul(v2(Math.trunc(k / 5) - 2, k % 5 - 2),
                            v2(Math.trunc(k / 5) - 2, k % 5 - 2))).x),
      si: (Math.trunc(k / 5) - 2 == 0 && k % 5 - 2 == 0) ? v.si
        : v.si + (cinv(cmul(v2(zx - (Math.trunc(k / 5) - 2), zy - (k % 5 - 2)),
                            v2(zx - (Math.trunc(k / 5) - 2), zy - (k % 5 - 2)))).y
                - cinv(cmul(v2(Math.trunc(k / 5) - 2, k % 5 - 2),
                            v2(Math.trunc(k / 5) - 2, k % 5 - 2))).y),
    }));
    wr = wp.sr;
    wi = wp.si;
  }

  // height is log magnitude clamped, hue is the argument, and the
  // contour bands cycle in log|f|
  const mag = len2(wr, wi);
  const arg = Math.atan2(wi, wr);
  const hh = clamp(Math.log(mag + 1.0e-4), -4.0, 4.0) * P.relief;
  const hue = arg / TAU + 0.5;
  const band = 0.5 + 0.5 * Math.cos(TAU * Math.log(mag + 1.0e-4) * P.contours);
  return s.deposit({
    xyz: [wnx * 2.4, hh, wny * 2.4],
    col: pal(fract(hue), [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
             [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]),
    glow: 0.4 + 0.95 * band,
  });
});
