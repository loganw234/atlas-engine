// Plate XXV Newton's Fractal, as a positive. From each start the
// root-finder for z^d - 1 runs to one of the d roots of unity; the
// basin decides the colour, the iteration count becomes relief along
// the Wada boundary, and over-relaxation shears the whole structure
// into spirals. The shader raises z to d - 1 in a tiny inner loop;
// loops are vocabulary here, so that power is written out as the
// same cmul chain per degree, three MODE arms on the integer lever,
// each arm one orbit with the identical update law. The record
// carries f2, the |z^d - 1|^2 of the state each step read, so the
// orbit stops one update past convergence exactly as the shader's
// break after the update does; the init f2 of 1.0 is a sentinel that
// keeps the first check from firing before any step, which the
// shader never did.
//
// AND A DIVERGENCE BAIL, which the shader does not have and which
// is the difference between this plate being portable and not. The
// orbit stopped only on CONVERGENCE, so a start whose iterate runs
// away kept stepping: at degree 5 the derivative is d z^4, and once
// |z| passes a few thousand that squares past float32's range
// inside cdiv's modulus. Inf/Inf is NaN, and NaN is where the
// specification stops promising two implementations the same
// answer - measured, one sample in roughly 65 million, NVIDIA
// against radeonsi, and the whole of why this plate still split
// after four others were fixed by emitting.
//
// |z|^2 > 1e6 is |z| > 1000, which keeps d z^4 and its square
// finite at every degree the lever offers, and no Newton iterate
// that reaches it was ever going to find a root. Points that used
// to produce NaN - and be zeroed on the way to the image, which is
// what tools/bookcrops.py has always done for this plate - now
// take the did-not-converge arm and deposit a defined colour.
import { positive, lever, pal, TAU, clamp, mod, mul3, cmul, cdiv, v2 } from "../core/measure.mjs";

export default positive("newton_pos", {
  degree: lever("DEGREE d",     3,   5,   1,     3),
  relax:  lever("OVER-RELAX a", 0.3, 1.6, 0.005, 1.0),
  zoom:   lever("ZOOM",         0.4, 8,   0.05,  1),
  iters:  lever("ITERATIONS",   8,   80,  1,     40),
  relief: lever("RELIEF",       0,   1.2, 0.01,  0.6),
  glow:   lever("GLOW",         0,   1,   0.01,  0.6),
  cam: { dist: 3.4, pitch: 0.5, tgtY: 0.2, rot: 0.03 },
  gain: 0.9, accent: "#ffb84d",
},
(P, s, q, t) => {
  const d = Math.floor(P.degree + 0.5);
  const relax = P.relax;
  const K = P.iters;

  // the window, and a jittered start inside it
  const wx = q.x - 0.5;
  const wy = q.y - 0.5;
  const j = s.jitter2();
  const zx = wx * (4.0 / P.zoom) + j.x * 0.003;
  const zy = wy * (4.0 / P.zoom) + j.y * 0.003;

  // Newton's step z - a (z^d - 1) / (d z^(d-1)), one arm per degree.
  // In each arm the derivative's power z^(d-1) is the inner cmul
  // chain and z^d extends it by one factor, exactly the products the
  // shader's cpow accumulates.
  let ox = 0.0, oy = 0.0, itv = 0.0;
  if (d == 3.0) {
    const o = s.orbit(P.iters, { x: zx, y: zy, f2: 1.0 }, (z) => ({
      x: z.x - relax * cdiv(
           v2(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0,
              cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).y),
           v2(d * cmul(v2(z.x, z.y), v2(z.x, z.y)).x,
              d * cmul(v2(z.x, z.y), v2(z.x, z.y)).y)).x,
      y: z.y - relax * cdiv(
           v2(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0,
              cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).y),
           v2(d * cmul(v2(z.x, z.y), v2(z.x, z.y)).x,
              d * cmul(v2(z.x, z.y), v2(z.x, z.y)).y)).y,
      f2: (cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0)
        * (cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0)
        + cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).y
        * cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).y,
    }), { until: (z) => z.f2 < 1.0e-6 || (z.x * z.x + z.y * z.y) > 1.0e6 });
    ox = o.x;
    oy = o.y;
    itv = (o.f2 < 1.0e-6) ? (o.count - 1.0) : K;
  } else if (d == 4.0) {
    const o = s.orbit(P.iters, { x: zx, y: zy, f2: 1.0 }, (z) => ({
      x: z.x - relax * cdiv(
           v2(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0,
              cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y),
           v2(d * cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).x,
              d * cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).y)).x,
      y: z.y - relax * cdiv(
           v2(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0,
              cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y),
           v2(d * cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).x,
              d * cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)).y)).y,
      f2: (cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0)
        * (cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0)
        + cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y
        * cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y,
    }), { until: (z) => z.f2 < 1.0e-6 || (z.x * z.x + z.y * z.y) > 1.0e6 });
    ox = o.x;
    oy = o.y;
    itv = (o.f2 < 1.0e-6) ? (o.count - 1.0) : K;
  } else {
    const o = s.orbit(P.iters, { x: zx, y: zy, f2: 1.0 }, (z) => ({
      x: z.x - relax * cdiv(
           v2(cmul(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0,
              cmul(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y),
           v2(d * cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x,
              d * cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y)).x,
      y: z.y - relax * cdiv(
           v2(cmul(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0,
              cmul(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y),
           v2(d * cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x,
              d * cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y)).y,
      f2: (cmul(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0)
        * (cmul(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).x - 1.0)
        + cmul(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y
        * cmul(cmul(cmul(cmul(v2(z.x, z.y), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)), v2(z.x, z.y)).y,
    }), { until: (z) => z.f2 < 1.0e-6 || (z.x * z.x + z.y * z.y) > 1.0e6 });
    ox = o.x;
    oy = o.y;
    itv = (o.f2 < 1.0e-6) ? (o.count - 1.0) : K;
  }

  // which root of unity the landing angle belongs to, folded into
  // [0, d) with the shader's own offset
  const ang = Math.atan2(oy, ox);
  const kk = Math.floor(mod(ang / TAU * d + 0.5 + d, d));
  const rootFrac = kk / d;
  const shade = clamp(itv / K, 0.0, 1.0);

  // ridges rise where the method dithers along the basin boundary
  return s.deposit({
    xyz: [wx * 2.4, P.relief * (1.0 - shade), wy * 2.4],
    col: mul3(pal(rootFrac,
                  [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
                  [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]),
              0.3 + 1.3 * (1.0 - shade)),
    glow: 0.55 + 0.7 * P.glow,
  });
});
