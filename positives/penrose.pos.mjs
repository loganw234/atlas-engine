// Plate XXVIII Cut and Project, as a positive - rejection sampling
// restating rejection sampling. A random integer vector in Z^fold is
// projected two ways at once: onto the physical plane by the fold-th
// roots of unity, and onto the internal space by their conjugate
// winding, the angles doubled. Only points whose internal shadow
// lands inside the window survive the cut; the survivors are the
// quasicrystal. The lattice coordinate nk is one draw spent by both
// projections, so it rides the orbit state one step ahead of its
// use, the ifs coin pattern: the init draws the first, each step
// spends its predecessor and draws the next. One draw more than the
// plate in total; same law.
import { positive, lever, pal, TAU, len2 } from "../core/measure.mjs";

export default positive("penrose_pos", {
  sym:   lever("SYMMETRY",  5,   12,  1,    5),
  win:   lever("WINDOW",    0.6, 3,   0.02, 1.6),
  latm:  lever("LATTICE M", 2,   5,   1,    3),
  scale: lever("SCALE",     0.4, 1.6, 0.01, 1.0),
  lift:  lever("3D LIFT",   0,   1.2, 0.01, 0.0),
  glow:  lever("GLOW",      0,   1,   0.01, 0.6),
  cam: { dist: 3.2, pitch: 0.32, tgtY: 0.0, rot: 0.04 },
  gain: 0.75, accent: "#e0c890",
},
(P, s) => {
  // the shader rounds its fold and clamps it to [4, 12]; on the
  // lever's own domain, integers 5 through 12, the clamp is an
  // identity, and the orbit bound below repeats the same rounding
  // of the same lever for the step count
  const foldf = Math.max(4.0, Math.min(12.0, Math.floor(P.sym + 0.5)));
  const M = P.latm;

  // the first lattice coordinate, uniform on the integers -M..M
  const nk0 = Math.floor(s.u() * (2.0 * M + 1.0)) - M;

  // one step per crystallographic direction k: the same integer
  // coordinate winds at angle TAU k / fold physically and at twice
  // that angle internally
  const o = s.orbit(P.sym, { px: 0.0, py: 0.0, ix: 0.0, iy: 0.0, nk: nk0 },
  (v, k) => ({
    px: v.px + v.nk * Math.cos(TAU * k / foldf),
    py: v.py + v.nk * Math.sin(TAU * k / foldf),
    ix: v.ix + v.nk * Math.cos(2.0 * TAU * k / foldf),
    iy: v.iy + v.nk * Math.sin(2.0 * TAU * k / foldf),
    nk: Math.floor(s.u() * (2.0 * M + 1.0)) - M,
  }));

  // the cut: the internal shadow must land inside the window
  if (o.ix * o.ix + o.iy * o.iy > P.win * P.win) {
    return s.decline();
  }

  // hue is the internal bearing; the hidden coordinate lifts into z
  return s.deposit({
    xyz: [o.px * P.scale * 0.16, o.py * P.scale * 0.16,
          len2(o.ix, o.iy) * P.lift],
    col: pal(Math.atan2(o.iy, o.ix) / TAU + 0.5, [0.5, 0.5, 0.5],
             [0.5, 0.5, 0.5], [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]),
    glow: 0.5 + 0.7 * P.glow,
  });
});
