// Plate VIII Chladni Figures, as a positive - a coordinate map on the
// square plate. The mode function is the degenerate pair of standing
// waves, mixed by P.pm between the plus and minus combinations; sand
// gathers where it vanishes, as a Gaussian of the mode value whose
// width is the SHARPNESS lever, and RELIEF lets the plate itself rise
// and fall about its silent curves on the clock.
import { positive, lever, PI, mix3, add3, mul3 } from "../core/measure.mjs";

export default positive("chladni_pos", {
  n:      lever("MODE N",     1,   12,  1,     5),
  m:      lever("MODE M",     1,   12,  1,     2),
  pm:     lever("MIX ±",      -1,  1,   0.01,  1),
  sharp:  lever("SHARPNESS",  1,   14,  0.1,   6),
  relief: lever("RELIEF",     0,   0.5, 0.005, 0.12),
  size:   lever("PLATE SIZE", 1.5, 4,   0.01,  3.0),
  cam: { dist: 3.4, pitch: 0.70, tgtY: 0.0, rot: 0.03 },
  gain: 1.2, accent: "#e8d98a",
},
(P, s, q, t) => {
  // the plate coordinate, centred; f is the eigenmode
  const xx = q.x - 0.5;
  const yy = q.y - 0.5;
  const f = Math.cos(P.n * PI * xx) * Math.cos(P.m * PI * yy)
          + P.pm * Math.cos(P.m * PI * xx) * Math.cos(P.n * PI * yy);

  // sand collects where f = 0; the plate actually vibrating
  const node = Math.exp(-(f * f) * P.sharp * P.sharp);
  const y = P.relief * f * Math.cos(2.2 * t);

  // faint wave shading under the bright nodal sand
  const wavec = mix3([0.10, 0.35, 0.55], [0.90, 0.55, 0.25], 0.5 + 0.5 * f);
  return s.deposit({
    xyz: [xx * P.size, y, yy * P.size],
    col: add3(mul3(wavec, 0.10), mul3([0.95, 0.90, 0.75], node * 1.3)),
  });
});
