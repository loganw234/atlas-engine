// Plate XLIII Ford Circles, as a positive - the rationals given radii.
// Above every reduced p/q hangs a circle of radius 1/(2q^2) tangent to
// the number line, and the plate offers two ways of visiting them.
// MODE 0 samples a fraction and rides its circle; MODE 1 falls down the
// Stern-Brocot tree by mediants and draws the chord between two
// successive circle tops.
//
// Two things are copied with particular care. The importance sampler's
// compensation, because the brightness IS a counting measure on the
// rationals and any change to those weights would change the claim.
// And the rejection that keeps only reduced fractions, which is
// Euclid's algorithm said as an orbit: the state is the pair, the step
// replaces it by (b, a mod b), and until stops at the first zero, the
// same fourteen divisions the shader allows for q up to 80. All the
// integers here are small and ride as exact floats, so int remainder
// and mod() are the same function.
//
// The tree's descent bits and its chosen level are hashes of the seed
// in the shader; here they are stream draws of the same law. The coin
// rides the state one step ahead of the move it decides, because an
// orbit field cannot both draw and be read by its siblings: the init
// draws the first coin, each step spends the coin it was handed and
// draws the next. One trailing draw more than the plate, same law.
import { positive, lever, pal, mix, mod, v3, TAU } from "../core/measure.mjs";

export default positive("ford_pos", {
  mode:   lever("MODE",       0,   1,  1,    0),
  qmax:   lever("Q MAX",      12,  80, 1,    40),
  weight: lever("WEIGHT",     0,   1,  0.01, 0.5),
  depth:  lever("TREE DEPTH", 2,   24, 1,    12),
  xscale: lever("X SCALE",    0.6, 2,  0.01, 1.3),
  lift:   lever("LIFT",       0,   1.2, 0.01, 0),
  glow:   lever("GLOW",       0,   1,  0.01, 0.6),
  cam: { dist: 2.9, pitch: 0.2, tgtY: 0.25, rot: 0.03 },
  gain: 0.8, accent: "#f0e090",
},
(P, s, q, t) => {
  const md = Math.floor(P.mode + 0.5);
  const QM = P.qmax;
  const xs = P.xscale * 2.0;            // the isotropic map x in [0,1] -> [-P4, P4]
  const lift = P.lift * 0.32;
  const gl = 0.5 + 0.7 * P.glow;

  let px = 0.0, py = 0.0, pz = 0.0;
  let tint = v3(0.0, 0.0, 0.0);
  let bright = 0.0;

  if (md < 0.5) {
    // a denominator drawn with importance bias toward small q, then a
    // numerator; the pair survives only if it is already in lowest terms
    const ub = Math.pow(s.u(), 2.2);
    const qd = 1.0 + Math.floor(ub * (QM - 0.001));
    const pn = Math.floor(s.u() * (qd + 1.0));
    const pd = (pn > qd) ? qd : pn;
    const g = s.orbit(14, { a: pd, b: qd }, (v) => ({
      a: v.b,
      b: mod(v.a, v.b),
    }), { until: (v) => v.b == 0.0 });
    if (g.a > 1.0) {
      return s.decline();
    }

    // the circle itself: centre height equal to radius, so the touch at
    // the rational is exact rather than nearly so
    const r = 0.5 / (qd * qd);
    const fx = pd / qd;
    const ang = q.x * TAU;
    const cx = fx + r * Math.sin(ang);
    const cy = r * (1.0 - Math.cos(ang));

    // exact compensation of the sampler: nq is the per-fraction hit
    // probability, and the ratio against a reference denominator turns
    // it back into equal light per circle or equal light per arc length
    const ex = 0.45454545;
    const pq = Math.pow(qd / QM, ex) - Math.pow(Math.max((qd - 1.0) / QM, 1.0e-9), ex);
    const nq = Math.max(pq / (qd + 1.0), 1.0e-7);
    const q0 = Math.sqrt(QM);
    const n0 = (Math.pow(q0 / QM, ex) - Math.pow(Math.max((q0 - 1.0) / QM, 1.0e-9), ex)) / (q0 + 1.0);
    const ratio = n0 / nq;
    const wC = Math.min(ratio, 32.0);
    const wA = Math.min(ratio * q0 * q0 / (qd * qd), 32.0);
    const w = mix(wC, wA, P.weight);

    px = (cx - 0.5) * xs;
    py = cy * xs;
    pz = lift * Math.log(qd);
    tint = pal(Math.log(qd) / Math.log(2.0) * 0.16,
               [0.55, 0.48, 0.40], [0.35, 0.33, 0.30],
               [1.0, 0.9, 0.7], [0.0, 0.15, 0.35]);
    // a horocycle glint, one brightness wave circulating each circle
    bright = w * gl * (1.0 + 0.25 * Math.sin(ang - t * (0.4 + 0.08 * Math.min(qd, 25.0))));
  } else {
    // the Stern-Brocot flight: from the neighbours 0/1 and 1/1 each
    // coin sends the interval left or right of its mediant, and the
    // tree lists every positive rational exactly once. Two successive
    // mediants at a drawn level give the segment this point lights.
    const D = Math.max(2.0, Math.min(24.0, Math.floor(P.depth + 0.5)));
    const ks = Math.min(Math.floor(s.u() * (D - 1.0)), D - 2.0);
    const fl = s.orbit(P.depth, {
      pl: 0.0, ql: 1.0, pr: 1.0, qr: 1.0,
      pA: 1.0, qA: 2.0, pB: 1.0, qB: 2.0, coin: s.u(),
    }, (v, k) => ({
      pl: (v.coin < 0.5) ? v.pl : (v.pl + v.pr),
      ql: (v.coin < 0.5) ? v.ql : (v.ql + v.qr),
      pr: (v.coin < 0.5) ? (v.pl + v.pr) : v.pr,
      qr: (v.coin < 0.5) ? (v.ql + v.qr) : v.qr,
      pA: (k == ks) ? (v.pl + v.pr) : v.pA,
      qA: (k == ks) ? (v.ql + v.qr) : v.qA,
      pB: (k == ks + 1.0) ? (v.pl + v.pr) : v.pB,
      qB: (k == ks + 1.0) ? (v.ql + v.qr) : v.qB,
      coin: s.u(),
    }));

    // the chord from the top of circle A to the top of circle B
    const tt = q.x;
    const xA = fl.pA / fl.qA;
    const xB = fl.pB / fl.qB;
    px = mix((xA - 0.5) * xs, (xB - 0.5) * xs, tt);
    py = mix(xs / (fl.qA * fl.qA), xs / (fl.qB * fl.qB), tt);
    pz = mix(lift * Math.log(fl.qA), lift * Math.log(fl.qB), tt);
    const hq = mix(fl.qA, fl.qB, tt);
    tint = pal(Math.log(hq) / Math.log(2.0) * 0.16,
               [0.55, 0.48, 0.40], [0.35, 0.33, 0.30],
               [1.0, 0.9, 0.7], [0.0, 0.15, 0.35]);
    bright = gl * (0.65 + 0.35 * Math.sin(TAU * tt - t * 1.1 + ks * 1.7));
  }

  return s.deposit({ xyz: [px, py, pz], col: tint, glow: bright });
});
