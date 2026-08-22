// Plate XVIII Caustics, as a positive. Each point is one spot on one
// ray of a one-parameter family; nothing computes the caustic curve,
// it ignites as the density where neighbouring rays crowd. Three
// FAMILY arms: reflection off a circular mirror (nephroid sliding to
// cardioid as SOURCE moves the light from a parallel beam to a point
// on the rim), the trammel of Archimedes (astroid), and chords of a
// circle. A pure coordinate map: q.y picks the ray, q.x walks along
// it, and no draw is ever made.
import { positive, lever, pal, mul3, mix, TAU, PI, len2 } from "../core/measure.mjs";

export default positive("caustic_pos", {
  family: lever("FAMILY",     0,   2,   1,    0),
  source: lever("SOURCE",     0,   1,   0.01, 0.0),
  ray:    lever("RAY LENGTH", 0.3, 2.6, 0.01, 1.6),
  scale:  lever("SCALE",      0.5, 1.6, 0.01, 1.0),
  glow:   lever("GLOW",       0,   1,   0.01, 0.4),
  cam: { dist: 3.0, pitch: 0.55, tgtY: 0.0, rot: 0.02 },
  gain: 0.8, accent: "#ffe08a",
},
(P, s, q, t) => {
  const fam = Math.floor(P.family + 0.5);
  const src = P.source;

  let posx = 0.0, posy = 0.0;
  if (fam == 0.0) {
    // reflection off the mirror arc: the incoming direction blends
    // from the parallel beam dpar toward the ray from the rim source
    // Src, both fixed at (-1, 0); the 1e-4 is the plate's own nudge
    const theta = mix(0.5, 2.5, q.y) * PI;
    const ax = Math.cos(theta);
    const ay = Math.sin(theta);
    const dsx = ax + 1.0 + 1.0e-4;
    const dsy = ay + 1.0e-4;
    const dl = len2(dsx, dsy);
    const mx = mix(-1.0, dsx / dl, src);
    const my = mix(0.0, dsy / dl, src);
    const ml = len2(mx, my);
    const dinx = mx / ml;
    const diny = my / ml;
    // the interior normal is -A; reflect, then walk RAY LENGTH along
    const nx = -ax;
    const ny = -ay;
    const dd = dinx * nx + diny * ny;
    const rx = dinx - 2.0 * dd * nx;
    const ry = diny - 2.0 * dd * ny;
    posx = ax + rx * (q.x * P.ray);
    posy = ay + ry * (q.x * P.ray);
  } else if (fam == 1.0) {
    // the trammel: a unit ladder sliding from wall to floor
    const b = q.y * PI * 0.5 + 0.002;
    posx = mix(Math.cos(b), 0.0, q.x);
    posy = mix(0.0, Math.sin(b), q.x);
  } else {
    // chords from angle a to mf*a: cardioid at mf = 2, nephroid at 3
    const a = q.y * TAU;
    const mf = mix(2.0, 3.0, src);
    posx = mix(Math.cos(a), Math.cos(mf * a), q.x);
    posy = mix(Math.sin(a), Math.sin(mf * a), q.x);
  }

  return s.deposit({
    xyz: [posx * P.scale, posy * P.scale, 0.0],
    col: mul3(pal(q.y * 0.6 + 0.08, [0.5, 0.46, 0.4], [0.5, 0.45, 0.42],
                  [1.0, 0.96, 0.85], [0.05, 0.2, 0.42]),
              0.3 + 0.5 * P.glow),
  });
});
