// A fixture, not a plate: it exists so `s.vnoise` can be checked on a
// GPU against the CPU evaluator over inputs chosen to hit the corners
// the primitive actually has - negative coordinates, exact lattice
// points, and the 1023 wrap.
import { positive, lever, pal } from "../../core/measure.mjs";

export default positive("vnoise_fixture", {
  oc: lever("OCTAVE", 0, 16, 1, 3),
  freq: lever("FREQ", 0.5, 8, 0.1, 2.0),
  scale: lever("SCALE", 0.5, 1.6, 0.01, 1.0),
  cam: { dist: 3.0, pitch: 0.0, tgtY: 0.0, rot: 0.0 },
  gain: 0.8, accent: "#88aaff",
},
(P, s, q, t) => {
  // spread the samples across negatives, integers and the wrap
  const x = (q.x * 2.0 - 1.0) * 600.0;
  const y = (q.y * 2.0 - 1.0) * 600.0;
  const n = s.vnoise(x * P.freq, y * P.freq, 3);
  return s.deposit({
    xyz: [n * P.scale, n * P.scale * 0.5, 0.0],
    col: pal(0.5 + n, [0.5, 0.5, 0.5], [0.42, 0.42, 0.42],
             [1.0, 1.0, 1.0], [0.02, 0.36, 0.70]),
  });
});
