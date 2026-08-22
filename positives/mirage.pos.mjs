// Plate LIV Mirage, as a positive. Stratified air conserves
// n(y) cos(alpha) along a ray, so with p = n sin(alpha) the ray obeys
// p^2 = n^2 - C^2, dy/dx = p/C and dp/dx = n n'(y)/C, and light bends
// toward the higher index. Each point is one spot on one ray, and
// where neighbouring rays crowd the caustic ignites unaided.
//
// Four MODE arms. Two of them trace: hot ground, where a shallow
// downgoing ray turns on the low-index layer and climbs again, and the
// inversion layer, where the ray is ducted and oscillates. The other
// two are exact lenses with nothing integrated at all: Maxwell's
// fisheye, where every ray from A is a circle through the conjugate
// point, and Luneburg's, where the interior is a harmonic oscillator
// and the straight run to the rim is a circle intersection.
//
// The leapfrog is an orbit. Its budget k is a computed value rather
// than a lever, so the bound is the shader's own 240 and the state
// carries its own counter j, with until stopping either when j reaches
// k or when the ray leaves the scene. That reads the range test one
// step later than the shader writes it, which is the same test: the
// shader checks after a completed step and breaks, and until checks
// the state a completed step produced. A ray that never stepped cannot
// be dead, which is why the alive test asks for j above zero.
//
// The two tracing arms are written out separately rather than sharing
// the shader's mirage_prof with its md branch inside. The profile is
// then a formula rather than a choice, once per arm, and the emitted
// loop carries no dead branch.
import { positive, lever, pal, clamp, mul3, TAU, PI }
  from "../core/measure.mjs";

export default positive("mirage_pos", {
  mode:  lever("MODE",          0,     3,    1,     0),
  exag:  lever("EXAGGERATE",    0.005, 0.08, 0.001, 0.035),
  objh:  lever("OBJECT HEIGHT", 0.05,  1.0,  0.01,  0.38),
  fan:   lever("FAN",           0.02,  0.40, 0.005, 0.16),
  layer: lever("LAYER HEIGHT",  0.05,  0.35, 0.005, 0.10),
  glow:  lever("GLOW",          0,     1,    0.01,  0.5),
  cam: { dist: 3.0, pitch: 0.75, tgtY: 0.0, rot: 0.02 },
  gain: 0.9, accent: "#f5d9a0",
},
(P, s, q, t) => {
  const md   = clamp(Math.floor(P.mode + 0.5), 0.0, 3.0);
  const dn   = Math.max(P.exag, 1.0e-4);     // the real contrast is near 1e-4
  const objh = P.objh;
  const fan  = P.fan;
  const h    = Math.max(P.layer, 0.03);      // held off zero: steps must resolve it
  const glow = 0.35 + 0.85 * P.glow;
  const jit  = (s.u() - 0.5) * 0.014;        // the sheet is given a thickness
  const vs   = 3.2;                          // vertical stretch, as in any mirage figure
  const aF   = 0.62;                         // Maxwell fisheye scale a
  const aL   = 0.72;                         // Luneburg radius a

  // two per cent of the points are scenery: the ground line, or the rim
  const scen = s.u();
  if (scen < 0.02) {
    let spx = 0.0, spz = 0.0;
    if (md < 2.0) {
      spx = -1.32 + 2.64 * q.x;
      spz = 0.6;
    } else {
      const aa = (md == 2.0) ? aF : aL;
      const thr = TAU * q.x;
      spx = aa * Math.cos(thr);
      spz = -aa * Math.sin(thr);
    }
    return s.deposit({
      xyz: [spx, jit, spz],
      col: mul3([0.028, 0.030, 0.038], glow),
    });
  }

  let posx = 0.0, posy = 0.0;   // figure coordinates, y already display-oriented
  let ct = 0.5;                 // colour parameter
  let w = 1.0;                  // weight
  let alive = 1.0;

  if (md < 2.0) {
    // A bar of sources at x = -1.3 and a fan of elevations. The bar is
    // 0.42 of OBJECT HEIGHT tall and the point of the object it speaks
    // for is the draw standing in for rnd.x.
    const yc = 0.30;
    const bar = 0.42 * objh;
    const hn = s.u();
    const dx = 2.6 / 240.0;
    const kk = Math.floor(q.y * 239.0);      // uniform along the ray
    let rayx = 0.0, rayy = 0.0, steps = 0.0;

    if (md == 0.0) {
      // Hot ground: n = 1 + dn(1 - exp(-y/h)), smallest at y = 0, so
      // the index climbs with height and a downgoing ray turns. The
      // launch aims mostly downward.
      const y0 = 0.08 + bar * hn;
      const a0 = fan * (1.35 * q.x - 1.0);
      const n0 = 1.0 + dn * (1.0 - Math.exp(-Math.max(y0, 0.0) / h));
      const C = Math.max(n0 * Math.cos(a0), 1.0e-3);
      const p0 = n0 * Math.sin(a0);

      // Each step is the shader's leapfrog written out: half a step in
      // y, the profile read at that midpoint, p advanced by n n'/C,
      // then the magnitude of p re-projected onto the exact invariant
      // wherever the ray is admissible so it never drifts, and set
      // outright up the index gradient in the forbidden band n < C,
      // which is the direction back out. The turning point n = C is
      // the one place the vertical direction flips. Orbit fields are
      // single expressions, so the midpoint, the profile and the new p
      // are written again in each field that needs them, identical
      // values in every copy.
      const g = s.orbit(240, { x: -1.3, y: y0, p: p0, j: 0.0 }, (v) => ({
        x: v.x + dx,
        y: (v.y + 0.5 * dx * v.p / C)
           + 0.5 * dx * ((((1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                 * (1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                 - C * C) > 0.0)
             ? ((v.p + dx * (1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                   * (dn * Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h) / h) / C < 0.0)
                 ? -1.0 : 1.0)
               * Math.sqrt((1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                   * (1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                   - C * C)
             : ((dn * Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h) / h < 0.0)
                 ? -1.0 : 1.0)
               * Math.abs(v.p + dx * (1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                   * (dn * Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h) / h) / C)) / C,
        p: (((1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
               * (1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
               - C * C) > 0.0)
           ? ((v.p + dx * (1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                 * (dn * Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h) / h) / C < 0.0)
               ? -1.0 : 1.0)
             * Math.sqrt((1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                 * (1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                 - C * C)
           : ((dn * Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h) / h < 0.0)
               ? -1.0 : 1.0)
             * Math.abs(v.p + dx * (1.0 + dn * (1.0 - Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h)))
                 * (dn * Math.exp(-Math.max((v.y + 0.5 * dx * v.p / C), 0.0) / h) / h) / C),
        j: v.j + 1.0,
      }), { until: (v) => v.j >= kk || v.y <= 0.0 || v.y > 0.60 });
      rayx = g.x; rayy = g.y; steps = g.j;
    } else {
      // The inversion layer: n = 1 + dn exp(-((y - yc)/h)^2), a ridge
      // of high index centred on yc. The bar sits inside it and
      // launches symmetrically, so rays are trapped and oscillate and
      // the images stack, which is the Fata Morgana.
      const y0 = yc + bar * (hn - 0.5);
      const a0 = fan * (2.0 * q.x - 1.0);
      const n0 = 1.0 + dn * Math.exp(-Math.min(((y0 - yc) / h) * ((y0 - yc) / h), 40.0));
      const C = Math.max(n0 * Math.cos(a0), 1.0e-3);
      const p0 = n0 * Math.sin(a0);

      // the same leapfrog, over the Gaussian profile and its
      // derivative -2 s dn exp(-s^2)/h with s = (y - yc)/h
      const g = s.orbit(240, { x: -1.3, y: y0, p: p0, j: 0.0 }, (v) => ({
        x: v.x + dx,
        y: (v.y + 0.5 * dx * v.p / C)
           + 0.5 * dx * ((((1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                 * (1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                 - C * C) > 0.0)
             ? ((v.p + dx * (1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                   * (-2.0 * (((v.y + 0.5 * dx * v.p / C) - yc) / h) * dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)) / h) / C < 0.0)
                 ? -1.0 : 1.0)
               * Math.sqrt((1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                   * (1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                   - C * C)
             : ((-2.0 * (((v.y + 0.5 * dx * v.p / C) - yc) / h) * dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)) / h < 0.0)
                 ? -1.0 : 1.0)
               * Math.abs(v.p + dx * (1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                   * (-2.0 * (((v.y + 0.5 * dx * v.p / C) - yc) / h) * dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)) / h) / C)) / C,
        p: (((1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
               * (1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
               - C * C) > 0.0)
           ? ((v.p + dx * (1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                 * (-2.0 * (((v.y + 0.5 * dx * v.p / C) - yc) / h) * dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)) / h) / C < 0.0)
               ? -1.0 : 1.0)
             * Math.sqrt((1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                 * (1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                 - C * C)
           : ((-2.0 * (((v.y + 0.5 * dx * v.p / C) - yc) / h) * dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)) / h < 0.0)
               ? -1.0 : 1.0)
             * Math.abs(v.p + dx * (1.0 + dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)))
                 * (-2.0 * (((v.y + 0.5 * dx * v.p / C) - yc) / h) * dn * Math.exp(-Math.min((((v.y + 0.5 * dx * v.p / C) - yc) / h) * (((v.y + 0.5 * dx * v.p / C) - yc) / h), 40.0)) / h) / C),
        j: v.j + 1.0,
      }), { until: (v) => v.j >= kk || v.y <= 0.0 || v.y > 0.60 });
      rayx = g.x; rayy = g.y; steps = g.j;
    }

    // absorbed by the ground, or off the top of the scene
    alive = (steps > 0.0 && (rayy <= 0.0 || rayy > 0.60)) ? 0.0 : 1.0;
    posx = rayx;
    posy = rayy * vs - 0.6;
    ct = 0.12 + 0.72 * hn;
    // one element of the bar is lit brighter and walks it, so the erect
    // and the inverted image are seen to travel in opposite directions
    const hl = 0.5 + 0.45 * Math.sin(0.22 * t);
    w = 0.62 * (1.0 + 0.8 * Math.exp(-(hn - hl) * (hn - hl) * 180.0));
  } else if (md == 2.0) {
    // Maxwell's fisheye, n = n0/(1 + r^2/a^2). Every ray is a circle,
    // and every ray leaving A returns to the conjugate point
    // A' = -A a^2/|A|^2, so the rays from A are exactly the pencil of
    // circles through A and A': centres run along the perpendicular
    // bisector of AA', one circle per launch angle, closed form with
    // nothing integrated. Such a circle meets r = a at antipodal
    // points, because the radical line collapses to a line through the
    // origin as soon as |A||A'| = a^2 with A' antiparallel to A.
    const sr = clamp(0.28 + 0.32 * objh, 0.28, 0.60);       // |A|
    const phm = 0.12 * t;                                   // the source drifts
    const ax = sr * Math.cos(phm), ay = sr * Math.sin(phm);
    const bx = -ax * (aF * aF / Math.max(sr * sr, 1.0e-6));
    const by = -ay * (aF * aF / Math.max(sr * sr, 1.0e-6));
    const mx = 0.5 * (ax + bx), my = 0.5 * (ay + by);
    // The shader's normalize and length are written out as the square
    // root of the dot product, which is what GLSL computes. Math.hypot
    // runs the careful algorithm instead and would hand the CPU walk a
    // different last bit from the one the emitted shader gets.
    const ex = bx - ax + 1.0e-12, ey = by - ay + 1.0e-12;
    const el = Math.sqrt(ex * ex + ey * ey);
    const ddx = ex / el, ddy = ey / el;
    const uux = -ddy, uuy = ddx;
    const hb = 0.5 * Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    const psi = (q.x - 0.5) * PI * 0.82;                    // launch angle at A
    const tc = hb * Math.tan(psi);
    const ccx = mx + tc * uux, ccy = my + tc * uuy;
    const rr = Math.sqrt(hb * hb + tc * tc);
    const thm = TAU * q.y;                                  // uniform in arc length
    const ppx = ccx + rr * Math.cos(thm);
    const ppy = ccy + rr * Math.sin(thm);
    if (ppx * ppx + ppy * ppy > 2.1) {
      alive = 0.0;
    }
    posx = ppx;
    posy = ppy;
    ct = 0.10 + 0.80 * (0.5 + psi / PI);
    w = 0.62;
  } else {
    // Luneburg's lens, n = sqrt(2 - r^2/a^2) inside r = a and 1
    // outside. Writing dr/dtau = T, dT/dtau = grad(n^2/2) = -r/a^2
    // inside and 0 outside keeps |T| = n and makes the interior an
    // exact harmonic oscillator, r(tau) = r0 cos(tau/a) + a T0
    // sin(tau/a). A ray entering the rim along d arrives at a d after
    // tau = a pi/2, the same rim point for every impact parameter,
    // which is the whole point of the lens. The straight run up to the
    // rim is the circle intersection done in closed form; leapfrog
    // does the rest and is exact again outside, where the force
    // vanishes. n is continuous at r = a, so there is no refraction to
    // apply.
    const phl = 0.25 * t;                  // the bundle swings; the focus rides
    const ddx = Math.cos(phl), ddy = Math.sin(phl);
    const uux = -ddy, uuy = ddx;
    const b = (2.0 * q.x - 1.0) * aL * 0.985;              // impact parameter
    const rin = Math.sqrt(Math.max(aL * aL - b * b, 1.0e-8));
    const lin = 1.30 - rin;                                // straight run to the rim
    const tin = aL * PI * 0.5 + 0.62;                      // through the lens, then onward
    const dtau = tin / 200.0;
    const tt = q.y * (lin + tin);
    let ppx = 0.0, ppy = 0.0;
    if (tt < lin) {
      ppx = (-1.30) * ddx + b * uux + tt * ddx;
      ppy = (-1.30) * ddy + b * uuy + tt * ddy;
    } else {
      // on the rim, where |pp| = a exactly and |T| = n = 1
      const kl = Math.floor((tt - lin) / dtau);
      const g = s.orbit(200,
        { x: (-rin) * ddx + b * uux, y: (-rin) * ddy + b * uuy,
          tx: ddx, ty: ddy, j: 0.0 },
        (v) => ({
          x: (v.x + 0.5 * dtau * v.tx)
             + 0.5 * dtau * ((((v.x + 0.5 * dtau * v.tx) * (v.x + 0.5 * dtau * v.tx)
                 + (v.y + 0.5 * dtau * v.ty) * (v.y + 0.5 * dtau * v.ty)) < aL * aL)
               ? v.tx - (dtau / (aL * aL)) * (v.x + 0.5 * dtau * v.tx)
               : v.tx),
          y: (v.y + 0.5 * dtau * v.ty)
             + 0.5 * dtau * ((((v.x + 0.5 * dtau * v.tx) * (v.x + 0.5 * dtau * v.tx)
                 + (v.y + 0.5 * dtau * v.ty) * (v.y + 0.5 * dtau * v.ty)) < aL * aL)
               ? v.ty - (dtau / (aL * aL)) * (v.y + 0.5 * dtau * v.ty)
               : v.ty),
          tx: ((((v.x + 0.5 * dtau * v.tx) * (v.x + 0.5 * dtau * v.tx)
                 + (v.y + 0.5 * dtau * v.ty) * (v.y + 0.5 * dtau * v.ty)) < aL * aL)
               ? v.tx - (dtau / (aL * aL)) * (v.x + 0.5 * dtau * v.tx)
               : v.tx),
          ty: ((((v.x + 0.5 * dtau * v.tx) * (v.x + 0.5 * dtau * v.tx)
                 + (v.y + 0.5 * dtau * v.ty) * (v.y + 0.5 * dtau * v.ty)) < aL * aL)
               ? v.ty - (dtau / (aL * aL)) * (v.y + 0.5 * dtau * v.ty)
               : v.ty),
          j: v.j + 1.0,
        }), { until: (v) => v.j >= kl });
      ppx = g.x;
      ppy = g.y;
    }
    if (ppx * ppx + ppy * ppy > 2.25) {
      alive = 0.0;
    }
    posx = ppx;
    posy = ppy;
    ct = 0.10 + 0.80 * (0.5 + 0.5 * b / aL);
    w = 0.62;
  }

  // The plate refuses a dead ray and any coordinate that is not a
  // number. The vocabulary has no isnan or isinf, so finiteness is
  // asked for as a magnitude the geometry can never reach: a NaN fails
  // the comparison and an infinity fails it too, and no lawful point
  // of this plate comes within thirty orders of magnitude of it.
  const fin = (Math.abs(posx) < 1.0e30 && Math.abs(posy) < 1.0e30) ? 1.0 : 0.0;
  if (alive < 0.5 || fin < 0.5) {
    return s.decline();
  }

  return s.deposit({
    xyz: [posx, jit, -posy],
    col: pal(ct, [0.72, 0.60, 0.46], [0.28, 0.26, 0.30],
             [1.0, 0.95, 0.85], [0.02, 0.18, 0.42]),
    glow: w * glow,
  });
});
