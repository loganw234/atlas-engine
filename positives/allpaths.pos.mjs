// Plate LV The Sum Over Paths, as a positive. Every point is one
// two-segment route from source to detector by way of the surface, and
// the hue is that route's optical phase in turns, so where Fermat's
// condition holds a whole neighbourhood shares a colour and the paths
// add. Three voices split the point budget on one draw: the paths, a
// dim line for the surface itself, and the phasor inset, which is the
// only place the sum is actually taken. That sum is an orbit over the
// same 320-cell x quadrature the paths are drawn from, carrying the
// running phasor and, captured at this point's own cell, the partial
// sum before the M-th phasor with that phasor's coverage and phase.
// The state stops at six fields because the sum after the M-th phasor
// is the sum before it plus that phasor, which the state already
// holds: Sb = Sa + covM * (cos, sin) of the M-th phase, the same two
// operations on the same numbers the loop would have performed.
import { positive, lever, pal, mul3, fract, mix, clamp, len2, TAU } from "../core/measure.mjs";

export default positive("allpaths_pos", {
  mode:   lever("MODE",         0,    2,   1,     0),
  zoom:   lever("PHASE ZOOM",   1,    18,  0.05,  10),
  nratio: lever("N RATIO",      1,    2,   0.01,  1.5),
  period: lever("STRIP PERIOD", 0.02, 0.5, 0.005, 0.12),
  duty:   lever("DUTY",         0.05, 1,   0.01,  0.45),
  spiral: lever("SPIRAL",       0,    1,   1,     1),
  glow:   lever("GLOW",         0,    1,   0.01,  0.55),
  cam: { dist: 2.9, pitch: 0.85, tgtY: 0.0, rot: 0.02 },
  gain: 0.9, accent: "#9effdf",
},
(P, s, q, t) => {
  // 0 mirror, 1 refraction, 2 grating. Only the refraction arm gives the
  // lower medium an index, and only the grating arm deletes surface.
  const md = Math.floor(P.mode + 0.5);
  const kw = P.zoom;
  const nn = (md == 1.0) ? Math.max(P.nratio, 1.0) : 1.0;
  const per = Math.max(P.period, 0.02);
  const duty = clamp(P.duty, 0.02, 1.0);
  const gl = 0.30 + 0.85 * P.glow;

  // the surface spans scene x in [-H, H] and lies on world z = ZOFF;
  // the inset sits behind it at SPZ, and the quadrature is 320 cells
  const H = 1.3;
  const ZOFF = -0.15;
  const SPZ = 0.92;
  const dxs = 2.0 * H / 320.0;

  // the source is fixed and the detector wanders a little on the clock,
  // which is enough to sweep the calm band's colour right through
  const Ax = -0.8, Ay = 0.75;
  const bx = 0.8 + 0.06 * Math.cos(0.21 * t);
  const by = 0.55 + 0.06 * Math.sin(0.21 * t);
  const By = (md == 1.0) ? -by : by;

  // one draw names this point's voice
  const g = s.u();
  let doPh = 0.0, doSurf = 0.0;
  if (P.spiral > 0.5 && g < 0.12) { doPh = 1.0; }
  if (doPh < 0.5 && g >= 0.12 && g < 0.145) { doSurf = 1.0; }

  if (doSurf > 0.5) {
    // the surface, drawn where it survives the strips
    const xsurf = mix(-H, H, q.x);
    if (md == 2.0 && fract(xsurf / per) >= duty) {
      return s.decline();
    }
    return s.deposit({
      xyz: [xsurf, s.centered() * 0.024, ZOFF],
      col: mul3([0.20, 0.24, 0.26], gl),
      glow: 0.30,
    });
  }

  if (doPh > 0.5) {
    // this point's cell in the quadrature, from its own x
    const mraw = Math.floor(q.x * 320.0);
    const mhi = (mraw > 319.0) ? 319.0 : mraw;
    const mm = (mhi < 0.0) ? 0.0 : mhi;

    // The phasor sum. Each cell contributes its surviving fraction times
    // the unit phasor at the cell's midpoint, the coverage being the
    // exact integral of the strip square wave over the cell so the
    // strips never beat against the grid. The capture fields take the
    // running sum, the coverage and the phase at cell M, before that
    // cell's phasor is added.
    const o = s.orbit(320, {
      Sx: 0.0, Sy: 0.0, Sax: 0.0, Say: 0.0, covM: 0.0, phM: 0.0,
    }, (z, j) => ({
      Sax: (j == mm) ? z.Sx : z.Sax,
      Say: (j == mm) ? z.Sy : z.Say,
      covM: (j == mm)
        ? ((md != 2.0) ? 1.0
           : clamp(per * ((Math.floor((-H + j * dxs + dxs) / per) * duty
                           + Math.min(fract((-H + j * dxs + dxs) / per), duty))
                        - (Math.floor((-H + j * dxs) / per) * duty
                           + Math.min(fract((-H + j * dxs) / per), duty)))
                   / Math.max((-H + j * dxs + dxs) - (-H + j * dxs), 1.0e-6), 0.0, 1.0))
        : z.covM,
      phM: (j == mm)
        ? fract(kw * (len2(-H + j * dxs + 0.5 * dxs - Ax, 0.0 - Ay)
                    + nn * len2(-H + j * dxs + 0.5 * dxs - bx, 0.0 - By)))
        : z.phM,
      Sx: z.Sx
        + ((md != 2.0) ? 1.0
           : clamp(per * ((Math.floor((-H + j * dxs + dxs) / per) * duty
                           + Math.min(fract((-H + j * dxs + dxs) / per), duty))
                        - (Math.floor((-H + j * dxs) / per) * duty
                           + Math.min(fract((-H + j * dxs) / per), duty)))
                   / Math.max((-H + j * dxs + dxs) - (-H + j * dxs), 1.0e-6), 0.0, 1.0))
          * Math.cos(TAU * fract(kw * (len2(-H + j * dxs + 0.5 * dxs - Ax, 0.0 - Ay)
                                     + nn * len2(-H + j * dxs + 0.5 * dxs - bx, 0.0 - By)))),
      Sy: z.Sy
        + ((md != 2.0) ? 1.0
           : clamp(per * ((Math.floor((-H + j * dxs + dxs) / per) * duty
                           + Math.min(fract((-H + j * dxs + dxs) / per), duty))
                        - (Math.floor((-H + j * dxs) / per) * duty
                           + Math.min(fract((-H + j * dxs) / per), duty)))
                   / Math.max((-H + j * dxs + dxs) - (-H + j * dxs), 1.0e-6), 0.0, 1.0))
          * Math.sin(TAU * fract(kw * (len2(-H + j * dxs + 0.5 * dxs - Ax, 0.0 - Ay)
                                     + nn * len2(-H + j * dxs + 0.5 * dxs - bx, 0.0 - By)))),
    }));

    if (o.covM <= 0.0) {
      return s.decline();
    }

    // q.y walks the M-th phasor head to tail, so the curve is drawn at
    // uniform arc length; the total centres the figure and the soft
    // clamp keeps the rim from running off the plate
    const Sbx = o.Sax + o.covM * Math.cos(TAU * o.phM);
    const Sby = o.Say + o.covM * Math.sin(TAU * o.phM);
    const sc = 1.1 / (320.0 / 3.0);
    const wx = (mix(o.Sax, Sbx, q.y) - 0.5 * o.Sx) * sc;
    const wy = (mix(o.Say, Sby, q.y) - 0.5 * o.Sy) * sc;
    const rw = len2(wx, wy);
    const soft = 1.0 / Math.sqrt(1.0 + (rw / 0.55) * (rw / 0.55));
    return s.deposit({
      xyz: [wx * soft, s.centered() * 0.020, SPZ + wy * soft],
      col: mul3(pal(o.phM, [0.48, 0.52, 0.50], [0.42, 0.40, 0.44],
                    [1.0, 1.0, 1.0], [0.15, 0.42, 0.68]), gl),
      glow: 0.055,
    });
  }

  // one path: q.x picks the surface point anywhere on the surface, not
  // the specular one, and q.y walks the bent polyline at uniform arc
  // length
  const xs = mix(-H, H, q.x);
  if (md == 2.0 && fract(xs / per) >= duty) {
    return s.decline();
  }
  const d1 = len2(xs - Ax, 0.0 - Ay);
  const d2 = len2(xs - bx, 0.0 - By);
  const tt = q.y * (d1 + d2);
  const spx = (tt < d1) ? mix(Ax, xs, tt / Math.max(d1, 1.0e-5))
                        : mix(xs, bx, (tt - d1) / Math.max(d2, 1.0e-5));
  const spy = (tt < d1) ? mix(Ay, 0.0, tt / Math.max(d1, 1.0e-5))
                        : mix(0.0, By, (tt - d1) / Math.max(d2, 1.0e-5));

  // hue is the whole route's optical phase in turns
  const th = fract(kw * (d1 + nn * d2));
  return s.deposit({
    xyz: [spx, s.centered() * 0.016, ZOFF - spy],
    col: pal(th, [0.48, 0.52, 0.50], [0.42, 0.40, 0.44],
             [1.0, 1.0, 1.0], [0.15, 0.42, 0.68]),
    glow: gl,
  });
});
