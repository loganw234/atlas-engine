// Plate XXXVI The Three-Body Ballet, as a positive. Three equal masses
// under Newtonian gravity, carried from exact initial conditions to a
// random fraction of the period, so brightness is dwell time and the
// slow arcs of the choreography glow brightest. MODE 0 is Moore's
// figure eight, MODE 1 is Lagrange's rotating triangle, and PERTURB
// nudges all twelve state components: the eight only thickens, the
// triangle scatters into escape.
//
// The shader takes four Runge Kutta stages per step and each stage
// reads the stage before it, which an orbit step cannot do, since a
// step is one expression per field with no local to bind. So each step
// becomes eight passes. An evaluating pass reads the three pairwise
// forces at the probe and leaves them in fA, fB, fC; an advancing pass
// spends them, weighs the probe velocity and the acceleration into the
// two running sums, and chooses the next probe. The sums visit
// 0, k1, k1+2k2, k1+2k2+2k3 and the fourth advance adds k4 and scales
// once by h/6, which is the shader's own left to right sum.
import { positive, lever, pal, fract, len2 } from "../core/measure.mjs";

export default positive("threebody_pos", {
  mode:    lever("MODE",      0,   1,   1,    0),
  steps:   lever("STEPS",     60,  320, 1,    200),
  perturb: lever("PERTURB",   0,   2,   0.01, 0),
  lift:    lever("TIME LIFT", 0,   1.5, 0.01, 0),
  scale:   lever("SCALE",     0.4, 1.4, 0.01, 1.0),
  glow:    lever("GLOW",      0,   1,   0.01, 0.6),
  cam: { dist: 3.1, pitch: 0.5, tgtY: 0.0, rot: 0.03 },
  gain: 0.85, accent: "#ffd070",
},
(P, s, q, t) => {
  const md = Math.floor(P.mode + 0.5);
  const nst = Math.floor(P.steps + 0.5);
  const amp = P.perturb * 0.01;

  // the two exact choreographies, each with the time it takes to close
  let p1x = 0.0, p1y = 0.0, p2x = 0.0, p2y = 0.0, p3x = 0.0, p3y = 0.0;
  let v1x = 0.0, v1y = 0.0, v2x = 0.0, v2y = 0.0, v3x = 0.0, v3y = 0.0;
  let span = 0.0;
  if (md == 0.0) {
    // Moore's figure eight: exact initial conditions, period 6.32591398
    p1x = 0.97000436; p1y = -0.24308753;
    p2x = -p1x; p2y = -p1y;
    p3x = 0.0; p3y = 0.0;
    v3x = -0.93240737; v3y = -0.86473146;
    v1x = -0.5 * v3x; v1y = -0.5 * v3y;
    v2x = v1x; v2y = v1y;
    span = 6.32591398;
  } else {
    // Lagrange 1772: an equilateral triangle of unit side turning at
    // omega = sqrt(3), each body at radius 1/sqrt(3) and unit speed,
    // shown for two turns
    const rr = 0.5773502692;
    p1x = rr * 1.0; p1y = rr * 0.0;
    v1x = 0.0; v1y = 1.0;
    p2x = rr * -0.5; p2y = rr * 0.8660254038;
    v2x = -0.8660254038; v2y = -0.5;
    p3x = rr * -0.5; p3y = rr * -0.8660254038;
    v3x = 0.8660254038; v3y = -0.5;
    span = 7.2551974570;
  }

  // the per-point nudge, one uniform on each of the twelve components.
  // At PERTURB zero every point rides the true orbit.
  p1x += s.centered() * amp;
  p1y += s.centered() * amp;
  p2x += s.centered() * amp;
  p2y += s.centered() * amp;
  p3x += s.centered() * amp;
  p3y += s.centered() * amp;
  v1x += s.centered() * amp;
  v1y += s.centered() * amp;
  v2x += s.centered() * amp;
  v2y += s.centered() * amp;
  v3x += s.centered() * amp;
  v3y += s.centered() * amp;

  // how far around the period this point flies, drifting with the clock
  // so the ballet runs; the step is the flight divided by the count
  const ph = fract(q.x + t * 0.025);
  const tstar = ph * span;
  const h = tstar / Math.max(nst, 1.0);

  // the flight. p and v are the state at the top of the step, w and u
  // the probe the current stage looks at, fA fB fC the three softened
  // pairwise terms read there, cp and cv the two running weighted sums.
  const o = s.orbit(2560, {
    p1x: p1x, p1y: p1y, p2x: p2x, p2y: p2y, p3x: p3x, p3y: p3y,
    v1x: v1x, v1y: v1y, v2x: v2x, v2y: v2y, v3x: v3x, v3y: v3y,
    w1x: p1x, w1y: p1y, w2x: p2x, w2y: p2y, w3x: p3x, w3y: p3y,
    u1x: v1x, u1y: v1y, u2x: v2x, u2y: v2y, u3x: v3x, u3y: v3y,
    fAx: 0.0, fAy: 0.0, fBx: 0.0, fBy: 0.0, fCx: 0.0, fCy: 0.0,
    cp1x: 0.0, cp1y: 0.0, cp2x: 0.0, cp2y: 0.0, cp3x: 0.0, cp3y: 0.0,
    cv1x: 0.0, cv1y: 0.0, cv2x: 0.0, cv2y: 0.0, cv3x: 0.0, cv3y: 0.0,
    g: 0.0, leg: 0.0, n: 0.0,
  }, (z) => ({
    // the evaluating pass: the softened term (b - a)/(|b - a|^2 + eps^2)^(3/2)
    // for the pairs one to two, two to three, three to one
    fAx: (z.leg == 0.0)
      ? ((z.w2x - z.w1x) * (1.0 / Math.sqrt((z.w2x - z.w1x) * (z.w2x - z.w1x)
          + (z.w2y - z.w1y) * (z.w2y - z.w1y) + 1.0e-6)
          / ((z.w2x - z.w1x) * (z.w2x - z.w1x)
          + (z.w2y - z.w1y) * (z.w2y - z.w1y) + 1.0e-6)))
      : z.fAx,
    fAy: (z.leg == 0.0)
      ? ((z.w2y - z.w1y) * (1.0 / Math.sqrt((z.w2x - z.w1x) * (z.w2x - z.w1x)
          + (z.w2y - z.w1y) * (z.w2y - z.w1y) + 1.0e-6)
          / ((z.w2x - z.w1x) * (z.w2x - z.w1x)
          + (z.w2y - z.w1y) * (z.w2y - z.w1y) + 1.0e-6)))
      : z.fAy,
    fBx: (z.leg == 0.0)
      ? ((z.w3x - z.w2x) * (1.0 / Math.sqrt((z.w3x - z.w2x) * (z.w3x - z.w2x)
          + (z.w3y - z.w2y) * (z.w3y - z.w2y) + 1.0e-6)
          / ((z.w3x - z.w2x) * (z.w3x - z.w2x)
          + (z.w3y - z.w2y) * (z.w3y - z.w2y) + 1.0e-6)))
      : z.fBx,
    fBy: (z.leg == 0.0)
      ? ((z.w3y - z.w2y) * (1.0 / Math.sqrt((z.w3x - z.w2x) * (z.w3x - z.w2x)
          + (z.w3y - z.w2y) * (z.w3y - z.w2y) + 1.0e-6)
          / ((z.w3x - z.w2x) * (z.w3x - z.w2x)
          + (z.w3y - z.w2y) * (z.w3y - z.w2y) + 1.0e-6)))
      : z.fBy,
    fCx: (z.leg == 0.0)
      ? ((z.w1x - z.w3x) * (1.0 / Math.sqrt((z.w1x - z.w3x) * (z.w1x - z.w3x)
          + (z.w1y - z.w3y) * (z.w1y - z.w3y) + 1.0e-6)
          / ((z.w1x - z.w3x) * (z.w1x - z.w3x)
          + (z.w1y - z.w3y) * (z.w1y - z.w3y) + 1.0e-6)))
      : z.fCx,
    fCy: (z.leg == 0.0)
      ? ((z.w1y - z.w3y) * (1.0 / Math.sqrt((z.w1x - z.w3x) * (z.w1x - z.w3x)
          + (z.w1y - z.w3y) * (z.w1y - z.w3y) + 1.0e-6)
          / ((z.w1x - z.w3x) * (z.w1x - z.w3x)
          + (z.w1y - z.w3y) * (z.w1y - z.w3y) + 1.0e-6)))
      : z.fCy,

    // the advancing pass. The derivative of a position is the probe
    // velocity itself, the derivative of a velocity is the sum of the
    // two pairwise terms that pull on that body, and the weights of the
    // scheme are one, two, two, one.
    cp1x: (z.leg == 0.0) ? z.cp1x
      : ((z.g == 3.0) ? 0.0 : (z.cp1x + ((z.g == 0.0) ? 1.0 : 2.0) * z.u1x)),
    cp1y: (z.leg == 0.0) ? z.cp1y
      : ((z.g == 3.0) ? 0.0 : (z.cp1y + ((z.g == 0.0) ? 1.0 : 2.0) * z.u1y)),
    cp2x: (z.leg == 0.0) ? z.cp2x
      : ((z.g == 3.0) ? 0.0 : (z.cp2x + ((z.g == 0.0) ? 1.0 : 2.0) * z.u2x)),
    cp2y: (z.leg == 0.0) ? z.cp2y
      : ((z.g == 3.0) ? 0.0 : (z.cp2y + ((z.g == 0.0) ? 1.0 : 2.0) * z.u2y)),
    cp3x: (z.leg == 0.0) ? z.cp3x
      : ((z.g == 3.0) ? 0.0 : (z.cp3x + ((z.g == 0.0) ? 1.0 : 2.0) * z.u3x)),
    cp3y: (z.leg == 0.0) ? z.cp3y
      : ((z.g == 3.0) ? 0.0 : (z.cp3y + ((z.g == 0.0) ? 1.0 : 2.0) * z.u3y)),
    cv1x: (z.leg == 0.0) ? z.cv1x
      : ((z.g == 3.0) ? 0.0 : (z.cv1x + ((z.g == 0.0) ? 1.0 : 2.0) * (z.fAx - z.fCx))),
    cv1y: (z.leg == 0.0) ? z.cv1y
      : ((z.g == 3.0) ? 0.0 : (z.cv1y + ((z.g == 0.0) ? 1.0 : 2.0) * (z.fAy - z.fCy))),
    cv2x: (z.leg == 0.0) ? z.cv2x
      : ((z.g == 3.0) ? 0.0 : (z.cv2x + ((z.g == 0.0) ? 1.0 : 2.0) * (z.fBx - z.fAx))),
    cv2y: (z.leg == 0.0) ? z.cv2y
      : ((z.g == 3.0) ? 0.0 : (z.cv2y + ((z.g == 0.0) ? 1.0 : 2.0) * (z.fBy - z.fAy))),
    cv3x: (z.leg == 0.0) ? z.cv3x
      : ((z.g == 3.0) ? 0.0 : (z.cv3x + ((z.g == 0.0) ? 1.0 : 2.0) * (z.fCx - z.fBx))),
    cv3y: (z.leg == 0.0) ? z.cv3y
      : ((z.g == 3.0) ? 0.0 : (z.cv3y + ((z.g == 0.0) ? 1.0 : 2.0) * (z.fCy - z.fBy))),

    // the step closes on the fourth advance, both sums spent at once
    p1x: (z.leg == 1.0 && z.g == 3.0) ? (z.p1x + h / 6.0 * (z.cp1x + 1.0 * z.u1x)) : z.p1x,
    p1y: (z.leg == 1.0 && z.g == 3.0) ? (z.p1y + h / 6.0 * (z.cp1y + 1.0 * z.u1y)) : z.p1y,
    p2x: (z.leg == 1.0 && z.g == 3.0) ? (z.p2x + h / 6.0 * (z.cp2x + 1.0 * z.u2x)) : z.p2x,
    p2y: (z.leg == 1.0 && z.g == 3.0) ? (z.p2y + h / 6.0 * (z.cp2y + 1.0 * z.u2y)) : z.p2y,
    p3x: (z.leg == 1.0 && z.g == 3.0) ? (z.p3x + h / 6.0 * (z.cp3x + 1.0 * z.u3x)) : z.p3x,
    p3y: (z.leg == 1.0 && z.g == 3.0) ? (z.p3y + h / 6.0 * (z.cp3y + 1.0 * z.u3y)) : z.p3y,
    v1x: (z.leg == 1.0 && z.g == 3.0) ? (z.v1x + h / 6.0 * (z.cv1x + 1.0 * (z.fAx - z.fCx))) : z.v1x,
    v1y: (z.leg == 1.0 && z.g == 3.0) ? (z.v1y + h / 6.0 * (z.cv1y + 1.0 * (z.fAy - z.fCy))) : z.v1y,
    v2x: (z.leg == 1.0 && z.g == 3.0) ? (z.v2x + h / 6.0 * (z.cv2x + 1.0 * (z.fBx - z.fAx))) : z.v2x,
    v2y: (z.leg == 1.0 && z.g == 3.0) ? (z.v2y + h / 6.0 * (z.cv2y + 1.0 * (z.fBy - z.fAy))) : z.v2y,
    v3x: (z.leg == 1.0 && z.g == 3.0) ? (z.v3x + h / 6.0 * (z.cv3x + 1.0 * (z.fCx - z.fBx))) : z.v3x,
    v3y: (z.leg == 1.0 && z.g == 3.0) ? (z.v3y + h / 6.0 * (z.cv3y + 1.0 * (z.fCy - z.fBy))) : z.v3y,

    // and the next probe: half a step along this reading twice, a whole
    // step along the third, and the freshly moved state once it closes
    w1x: (z.leg == 0.0) ? z.w1x
      : ((z.g == 3.0) ? (z.p1x + h / 6.0 * (z.cp1x + 1.0 * z.u1x))
        : (z.p1x + ((z.g == 2.0) ? h : 0.5 * h) * z.u1x)),
    w1y: (z.leg == 0.0) ? z.w1y
      : ((z.g == 3.0) ? (z.p1y + h / 6.0 * (z.cp1y + 1.0 * z.u1y))
        : (z.p1y + ((z.g == 2.0) ? h : 0.5 * h) * z.u1y)),
    w2x: (z.leg == 0.0) ? z.w2x
      : ((z.g == 3.0) ? (z.p2x + h / 6.0 * (z.cp2x + 1.0 * z.u2x))
        : (z.p2x + ((z.g == 2.0) ? h : 0.5 * h) * z.u2x)),
    w2y: (z.leg == 0.0) ? z.w2y
      : ((z.g == 3.0) ? (z.p2y + h / 6.0 * (z.cp2y + 1.0 * z.u2y))
        : (z.p2y + ((z.g == 2.0) ? h : 0.5 * h) * z.u2y)),
    w3x: (z.leg == 0.0) ? z.w3x
      : ((z.g == 3.0) ? (z.p3x + h / 6.0 * (z.cp3x + 1.0 * z.u3x))
        : (z.p3x + ((z.g == 2.0) ? h : 0.5 * h) * z.u3x)),
    w3y: (z.leg == 0.0) ? z.w3y
      : ((z.g == 3.0) ? (z.p3y + h / 6.0 * (z.cp3y + 1.0 * z.u3y))
        : (z.p3y + ((z.g == 2.0) ? h : 0.5 * h) * z.u3y)),
    u1x: (z.leg == 0.0) ? z.u1x
      : ((z.g == 3.0) ? (z.v1x + h / 6.0 * (z.cv1x + 1.0 * (z.fAx - z.fCx)))
        : (z.v1x + ((z.g == 2.0) ? h : 0.5 * h) * (z.fAx - z.fCx))),
    u1y: (z.leg == 0.0) ? z.u1y
      : ((z.g == 3.0) ? (z.v1y + h / 6.0 * (z.cv1y + 1.0 * (z.fAy - z.fCy)))
        : (z.v1y + ((z.g == 2.0) ? h : 0.5 * h) * (z.fAy - z.fCy))),
    u2x: (z.leg == 0.0) ? z.u2x
      : ((z.g == 3.0) ? (z.v2x + h / 6.0 * (z.cv2x + 1.0 * (z.fBx - z.fAx)))
        : (z.v2x + ((z.g == 2.0) ? h : 0.5 * h) * (z.fBx - z.fAx))),
    u2y: (z.leg == 0.0) ? z.u2y
      : ((z.g == 3.0) ? (z.v2y + h / 6.0 * (z.cv2y + 1.0 * (z.fBy - z.fAy)))
        : (z.v2y + ((z.g == 2.0) ? h : 0.5 * h) * (z.fBy - z.fAy))),
    u3x: (z.leg == 0.0) ? z.u3x
      : ((z.g == 3.0) ? (z.v3x + h / 6.0 * (z.cv3x + 1.0 * (z.fCx - z.fBx)))
        : (z.v3x + ((z.g == 2.0) ? h : 0.5 * h) * (z.fCx - z.fBx))),
    u3y: (z.leg == 0.0) ? z.u3y
      : ((z.g == 3.0) ? (z.v3y + h / 6.0 * (z.cv3y + 1.0 * (z.fCy - z.fBy)))
        : (z.v3y + ((z.g == 2.0) ? h : 0.5 * h) * (z.fCy - z.fBy))),

    g: (z.leg == 0.0) ? z.g : ((z.g == 3.0) ? 0.0 : (z.g + 1.0)),
    leg: (z.leg == 0.0) ? 1.0 : 0.0,
    n: (z.leg == 1.0 && z.g == 3.0) ? (z.n + 1.0) : z.n,
  }), {
    until: (z) => z.n >= nst
      || z.p1x * z.p1x + z.p1y * z.p1y + z.p2x * z.p2x + z.p2y * z.p2y
       + z.p3x * z.p3x + z.p3y * z.p3y > 1.0e6,
  });

  // one of the three bodies is plotted, chosen by a draw
  const body = s.pick(3);
  let pwx = 0.0, pwy = 0.0, sp = 0.0;
  if (body == 0) {
    pwx = o.p1x; pwy = o.p1y; sp = len2(o.v1x, o.v1y);
  } else if (body == 1) {
    pwx = o.p2x; pwy = o.p2y; sp = len2(o.v2x, o.v2y);
  } else {
    pwx = o.p3x; pwy = o.p3y; sp = len2(o.v3x, o.v3y);
  }

  // an escaper is hidden. The shader asks isnan or isinf or a radius
  // past four; the one test below answers the same on all three, since
  // a NaN fails the comparison and an infinity exceeds the bound.
  if (!(pwx * pwx + pwy * pwy <= 16.0)) {
    return s.decline();
  }

  // the body's own band of the palette, nudged by its speed, and
  // TIME LIFT unrolls the phase upward
  const bt = body / 3.0 + 0.05 * Math.min(sp * 0.3, 1.0);
  return s.deposit({
    xyz: [pwx * P.scale, (ph - 0.5) * P.lift, pwy * P.scale],
    col: pal(bt, [0.55, 0.45, 0.40], [0.42, 0.35, 0.32],
             [1.0, 1.0, 1.0], [0.02, 0.18, 0.42]),
    glow: 0.4 + 0.8 * P.glow,
  });
});
