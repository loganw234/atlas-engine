// Plate V Interference, as a positive - point sources on a slowly
// turning ring, each radiating A/(c+r) sin(kr - wt) with its own
// wavenumber, and the surface is nothing but their sum. DISPERSION is
// the exponent in w = k^p. The j-th source's bearing and its distance
// to the point appear inlined several times inside the sum's term:
// the subset gives an arrow no bindings, and the repeats are the same
// pure expression, so both evaluators agree value for value.
import { positive, lever, TAU, sum, clamp, mix3, mul3, len2 } from "../core/measure.mjs";

export default positive("wave_pos", {
  sources: lever("SOURCES",     1,    6,   1,     3),
  wavenum: lever("WAVENUMBER",  2,    16,  0.05,  7),
  amp:     lever("AMPLITUDE",   0,    0.3, 0.005, 0.12),
  disp:    lever("DISPERSION",  0.05, 1,   0.01,  0.5),
  ring:    lever("SOURCE RING", 0,    1.8, 0.01,  1.05),
  damp:    lever("DAMPING",     0.1,  2,   0.01,  0.55),
  cam: { dist: 3.7, pitch: 0.55, tgtY: 0.0, rot: 0.04 },
  gain: 1.35, accent: "#7fe8dc",
},
(P, s, q, t) => {
  // the point on the water, centred and stretched to the basin
  const wx = (q.x - 0.5) * 3.6;
  const wy = (q.y - 0.5) * 3.6;

  // superposition: source j sits at bearing j/n of a turn plus the
  // slow drift 0.10 t, at ring radius; its wavenumber is P.wavenum
  // plus three per source, and its clock runs at 2.2 k^p
  const h = sum(P.sources, (j) =>
    P.amp / (P.damp + len2(
        wx - P.ring * Math.cos(j * TAU / Math.max(P.sources, 1.0) + 0.10 * t),
        wy - P.ring * Math.sin(j * TAU / Math.max(P.sources, 1.0) + 0.10 * t)))
    * Math.sin((P.wavenum + 3.0 * j) * len2(
        wx - P.ring * Math.cos(j * TAU / Math.max(P.sources, 1.0) + 0.10 * t),
        wy - P.ring * Math.sin(j * TAU / Math.max(P.sources, 1.0) + 0.10 * t))
      - 2.2 * Math.pow(P.wavenum + 3.0 * j, P.disp) * t));

  // deep water below, foam above, darkest at the still nodes
  const hn = clamp(h * 4.5, -1.0, 1.0);
  const shade = mix3([0.03, 0.30, 0.46], [0.80, 0.97, 1.0], hn * 0.5 + 0.5);
  return s.deposit({
    xyz: [wx, h * 1.05, wy],
    col: mul3(shade, 0.35 + 0.9 * Math.abs(hn)),
  });
});
