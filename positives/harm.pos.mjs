// Plate II Spherical Harmonics, as a positive - a pure coordinate map
// on the sphere: q seats the point uniformly, four harmonics
// superpose, and the surface draws its own radius. No chains, no
// stream beyond the shell fuzz: a law alone.
import { positive, lever, mix3, step, TAU } from "../core/measure.mjs";

export default positive("harm_pos", {
  w20:  lever("WEIGHT Y₂⁰", -1.2, 1.2, 0.01, 1.0),
  w32:  lever("WEIGHT Y₃²", -1.2, 1.2, 0.01, 0.7),
  w43:  lever("WEIGHT Y₄³", -1.2, 1.2, 0.01, 0.6),
  w55:  lever("WEIGHT Y₅⁵", -1.2, 1.2, 0.01, 0.5),
  drift: lever("DRIFT",     0, 1,    0.01,  0.6),
  amp:   lever("AMPLITUDE", 0, 1.2,  0.01,  0.62),
  fuzz:  lever("SHELL FUZZ",0, 0.35, 0.005, 0.05),
  cam: { dist: 3.0, pitch: 0.28, tgtY: 0.0, rot: 0.06 },
  gain: 1.1, accent: "#ffb066",
},
(P, s, q, t) => {
  // uniform on the sphere: cos(theta) linear in q.x, phi round q.y
  const ct = 1.0 - 2.0 * q.x;
  const st = Math.sqrt(Math.max(0.0, 1.0 - ct * ct));
  const ph = TAU * q.y;
  const s2 = st * st;

  const Y20 = 0.5 * (3.0 * ct * ct - 1.0);
  const Y32 = 2.2 * s2 * ct * Math.cos(2.0 * ph);
  const Y43 = 3.4 * s2 * st * ct * Math.cos(3.0 * ph);
  const Y55 = 4.2 * s2 * s2 * st * Math.cos(5.0 * ph);

  const w0 = P.w20 + P.drift * Math.cos(0.19 * t);
  const w1 = P.w32 + P.drift * Math.cos(0.23 * t + 2.1);
  const w2 = P.w43 + P.drift * Math.cos(0.17 * t + 4.2);
  const w3 = P.w55 + P.drift * Math.cos(0.13 * t + 1.1);
  const f = 0.30 * (w0 * Y20 + w1 * Y32 + w2 * Y43 + w3 * Y55);

  let r = 0.58 + P.amp * f;
  r = r * (1.0 + P.fuzz * s.centered());
  const rr = Math.max(r, 0.03) * 1.05;

  return s.deposit({
    xyz: [st * Math.cos(ph) * rr, ct * rr, st * Math.sin(ph) * rr],
    col: mix3([0.22, 0.58, 1.0], [1.0, 0.55, 0.20], step(0.0, f)),
    glow: 0.20 + 1.6 * Math.abs(f),
  });
});
