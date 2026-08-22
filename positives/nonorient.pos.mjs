// Plate XXVII One-Sided Surfaces, as a positive. Three immersions of a
// one-sided surface into our three dimensions: the figure-eight Klein
// bottle, the Roman surface of Steiner as the product form (bc, ca, ab)
// on the sphere, and the cross-cap. The point is a coordinate: q.x runs
// one parameter of the patch and q.y the other, so the walk is a pure
// parametrization with no world behind it and no clock.
//
// The shader binds a vec3 pos and fills it in whichever arm the SURFACE
// lever selects; the walk carries the three coordinates as three
// scalars declared before the branch, because a name bound inside one
// arm cannot be read after it. The shell thickness is three centered
// draws applied after the branch, in the shader's own x, y, z order.
import { positive, lever, pal, TAU, len3 } from "../core/measure.mjs";

export default positive("nonorient_pos", {
  surface: lever("SURFACE",   0,   2,    1,     0),
  kleinR:  lever("KLEIN R",   2,   4,    0.01,  3),
  cutaway: lever("CUTAWAY",   0.3, 1,    0.01,  1),
  thick:   lever("THICKNESS", 0,   0.15, 0.002, 0.03),
  glow:    lever("GLOW",      0,   1,    0.01,  0.55),
  cam: { dist: 3.2, pitch: 0.26, tgtY: 0.0, rot: 0.05 },
  gain: 0.85, accent: "#8fe0c8",
},
(P, s, q) => {
  // which immersion, and the cutaway that peels the skin back by
  // discarding every point past a threshold in the second parameter
  const sf = Math.floor(P.surface + 0.5);
  if (q.y > P.cutaway) { return s.decline(); }

  let px = 0.0, py = 0.0, pz = 0.0, shade = 0.0;

  if (sf == 0.0) {
    // the figure-eight Klein bottle: a lemniscate cross-section of
    // radius tube is carried once around the circle in u while the
    // section itself half-turns, so the band closes onto its own back
    const u = TAU * q.x, v = TAU * q.y, uh = u * 0.5;
    const tube = P.kleinR + Math.cos(uh) * Math.sin(v) - Math.sin(uh) * Math.sin(2.0 * v);
    px = tube * Math.cos(u) * 0.5;
    py = tube * Math.sin(u) * 0.5;
    pz = (Math.sin(uh) * Math.sin(v) + Math.cos(uh) * Math.sin(2.0 * v)) * 0.5;
    shade = v / TAU;
  } else if (sf == 1.0) {
    // the Roman surface: the sphere's direction d sent to the three
    // products of its pairs, which identifies antipodes and so factors
    // through the projective plane
    const ct = 1.0 - 2.0 * q.x;
    const st = Math.sqrt(Math.max(0.0, 1.0 - ct * ct));
    const ph = TAU * q.y;
    const dx = st * Math.cos(ph), dy = ct, dz = st * Math.sin(ph);
    px = dx * dy * 2.3;
    py = dy * dz * 2.3;
    pz = dz * dx * 2.3;
    shade = len3(px, py, pz);
  } else {
    // the cross-cap: the same sphere, sent by a map whose last
    // coordinate is the difference of two squares, so the pinch line
    // where it crosses itself is the surface's own scar
    const ct = 1.0 - 2.0 * q.x;
    const st = Math.sqrt(Math.max(0.0, 1.0 - ct * ct));
    const ph = TAU * q.y;
    const dx = st * Math.cos(ph), dy = ct, dz = st * Math.sin(ph);
    px = 2.0 * dx * dz * 1.15;
    py = 2.0 * dy * dz * 1.15;
    pz = (dx * dx - dy * dy) * 1.15;
    shade = dz * 0.5 + 0.5;
  }

  // the skin is given a thickness, so the creases where two sheets
  // pile into one place read as doubled density rather than a seam
  px += s.centered() * P.thick;
  py += s.centered() * P.thick;
  pz += s.centered() * P.thick;

  return s.deposit({
    xyz: [px, py, pz],
    col: pal(shade * 0.8 + 0.05, [0.5, 0.45, 0.5], [0.5, 0.45, 0.45],
             [1.0, 0.9, 0.8], [0.1, 0.3, 0.5]),
    glow: 0.5 + 0.7 * P.glow,
  });
});
