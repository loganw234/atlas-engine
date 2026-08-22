// Plate XLVIII The Catastrophe Machines, as a positive. Three of Thom's
// seven elementary catastrophes, drawn as their equilibrium sets. The
// cusp is the pleated sheet of V = x^4 + ax^2 + bx, the swallowtail the
// double-root set of the quartic, and the elliptic umbilic a
// three-cusped pillow whose sections are exact deltoids. Nothing traces
// their ridges: the parametrization's Jacobian collapses there, so
// uniform sampling piles density onto the singular edges by itself and
// brightness is measure.
//
// The point is a coordinate. FORM 2 reads q.x as an area-uniform radius
// and q.y as a bearing; the other two read q.x and q.y as the control
// x and the unfolding depth a. The shader declares world, a, the two
// bounds, uns and hilite before its branch and fills them inside it, so
// the walk declares the same eight scalars as mutable and assigns into
// them: a name bound inside one arm cannot be read after it.
import { positive, lever, mix, mix3, clamp, TAU } from "../core/measure.mjs";

export default positive("swallow_pos", {
  form:    lever("FORM",           0,   2,   1,    1),
  spread:  lever("SPREAD",         0.5, 1.6, 0.01, 1.0),
  section: lever("SECTION",        0,   1,   0.01, 0.0),
  tint:    lever("STABILITY TINT", 0,   1,   0.01, 0.75),
  scale:   lever("SCALE",          0.5, 1.5, 0.01, 1.0),
  glow:    lever("GLOW",           0,   1,   0.01, 0.5),
  cam: { dist: 3.3, pitch: 0.3, tgtY: 0.0, rot: 0.045 },
  gain: 0.9, accent: "#f09890",
},
(P, s, q, t) => {
  const form = Math.floor(P.form + 0.5);
  const tint = clamp(P.tint, 0.0, 1.0);

  // world, the unfolding depth a and its two bounds, the unstable flag,
  // and the highlight: all set inside the arms, so all declared first
  let wx = 0.0, wy = 0.0, wz = 0.0;
  let a = 0.0, aMin = 0.0, aMax = 0.0, uns = 0.0, hilite = 0.0;

  if (form == 2.0) {
    // Elliptic umbilic D4-: V = x^3 - 3xy^2 + a(x^2+y^2) + bx + cy, on
    // the set where the Hessian degenerates, which is a = +-3 sqrt(x^2
    // + y^2). The two signs are the two cones of the pillow, and the
    // section at fixed a is an exact deltoid whose speed vanishes at
    // its three cusps.
    const R = 0.8 * P.spread;
    const rad = R * Math.sqrt(q.x);
    const th = TAU * q.y;
    const x = rad * Math.cos(th), y = rad * Math.sin(th);
    const sg = (s.u() < 0.5) ? -1.0 : 1.0;
    a = sg * 3.0 * rad;
    const b = 3.0 * y * y - 3.0 * x * x - 2.0 * a * x;
    const c = 6.0 * x * y - 2.0 * a * y;
    wx = b * 0.35; wy = a * 0.35; wz = c * 0.35;
    aMin = -3.0 * R; aMax = 3.0 * R;
    // the trace of the Hessian is 4a, the eigenvalue that survives on
    // the degenerate set, so its sign tints one cone and not the other
    uns = (a < 0.0) ? 1.0 : 0.0;
  } else {
    // both remaining forms live on V' = 4x^3 + 2ax + b = 0, so the
    // control b is fixed by the state x and the depth a
    const x = mix(-1.0, 1.0, q.x) * P.spread;
    a = mix(-2.0, 1.0, q.y) * P.spread;
    aMin = -2.0 * P.spread; aMax = P.spread;
    const b = -4.0 * x * x * x - 2.0 * a * x;
    if (form == 1.0) {
      // Swallowtail A4: x is a double root of x^4 + ax^2 + bx + c, so b
      // is the derivative condition and c the back-substitution. The
      // Jacobian degenerates exactly on the two cusp ridges.
      const c = 3.0 * x * x * x * x + a * x * x;
      wx = a * 0.55; wy = c * 0.45 - 0.3; wz = b * 0.22;
      uns = (12.0 * x * x + 2.0 * a < 0.0) ? 1.0 : 0.0;
    } else {
      // Cusp A3: the equilibrium sheet itself. V'' = 12x^2 + 2a is
      // negative on the overhanging middle sheet, and crossing a fold
      // where it vanishes forces the jump that is hysteresis.
      wx = a * 0.55; wy = x * 0.8; wz = b * 0.28;
      uns = (12.0 * x * x + 2.0 * a < 0.0) ? 1.0 : 0.0;
      // Zeeman's machine: the control b sweeps back and forth, and the
      // equilibria available at the current control glow gently
      const bs = 1.1 * P.spread * Math.sin(t * 0.35);
      const dd = (b - bs) / (0.22 * P.spread + 1.0e-3);
      hilite = 0.4 * Math.exp(-dd * dd);
    }
  }

  // SECTION sweeps a threshold down the a axis until only a thin slab
  // is left, which is the classic plane figure of each catastrophe
  const thresh = mix(aMax, aMin + 0.06 * (aMax - aMin), clamp(P.section, 0.0, 1.0));
  if (a > thresh) { return s.decline(); }

  const sx = wx * P.scale, sy = wy * P.scale, sz = wz * P.scale;
  if (Math.abs(sx) > 1.45 || Math.abs(sy) > 1.45 || Math.abs(sz) > 1.45) {
    return s.decline();
  }

  // warm ivory where the equilibrium is stable, dim slate where it is
  // not, and the Zeeman highlight rides on the same single factor the
  // shader multiplies the colour by
  return s.deposit({
    xyz: [sx, sy, sz],
    col: mix3([1.02, 0.92, 0.74], [0.26, 0.31, 0.42], uns * tint),
    glow: (0.35 + 0.85 * P.glow) * (1.0 + hilite),
  });
});
