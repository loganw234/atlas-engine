// Plate LXI The Vortex Tangle, as a positive. Below the lambda point
// helium stops negotiating: circulation comes only in whole units of
// h over m, so the turbulence is not a smear of eddies but a tangle of
// discrete filaments, each a closed loop carrying exactly one quantum.
// A point lands on one filament and takes one seat along it. The
// filament's own address decides everything about the curve: how big
// the loop is, where its centre sits in the tangle ball, which plane
// it turns in, and the harmonics that give it writhe.
//
// THE CATALOGUE IS A FIELD, NOT A SEQUENCE, and that decides the shape
// of this walk. In the shader every attribute of a filament hangs off
// `fa`, a hash of the filament index alone, so the thousands of points
// that draw the same index agree about the same loop. The stream
// cannot say that: it is the point's own budget, and two points asking
// it for a size get two sizes, which would leave a fog in the tangle
// ball rather than filaments in it. s.vnoise is the engine's field,
// and it answers identically for every point that lands in the same
// cell however many draws came before them, which is the property a
// filament needs. Sampled at whole lattice coordinates its
// interpolation weights are zero and what it returns is the corner
// hash itself, a uniform on [-0.5, 0.5) addressed by the cell and the
// octave and by nothing else. The filament index rides as the cell
// (fid - 32 floor(fid/32), floor(fid/32)) so that even a two thousand
// filament tangle stays well inside the lattice's period of 1024, and
// the attributes are separated by OCTAVE rather than by cell, so no
// two attributes of any two filaments can collide.
//
// What the point draws for itself is what the shader draws from `pt`
// and `rnd`: which filament it rides, the angle of its seat along the
// loop, and the two numbers that scatter it off the line into the
// quantized core. Those are stream draws. Their values differ from the
// shader's and their law does not.
//
// The harmonic sum is the orbit, carrying the seat as three float
// fields because orbit fields are floats. The plate's k starts at two,
// so the first correction is an ellipse rather than a translation of
// the whole loop, and the 1/k^2 falloff is what keeps a loop a loop.
// HARMONICS is an integer lever, so it is the orbit's bound directly
// and the emitted loop breaks exactly where the shader's
// `if (k >= nh + 2) break;` does.
//
// FLATTEN IS DEAD IN THE SHIPPED PLATE, and it stays dead here. The
// shader flattens z with P[7] while its seventh lever is P[6], and
// both renderers hand the shape function a zero-filled array of eight
// floats (Float32Array(8) in the browser, np.zeros(8) in the
// darkroom), so (1.0 - P[7] * 0.8) is exactly 1.0 in every render this
// plate has ever had. The lever is declared because the lever table is
// compared against the registry's; the multiply is omitted because
// writing it against P.flatten would squash every z by a fifth and
// make a picture the registry has never shown. Plates ship as they
// are.
import { positive, lever, pal, mul3, len3, TAU } from "../core/measure.mjs";

export default positive("tangle_pos", {
  fils:   lever("FILAMENTS", 40,  2000, 10,   700),
  law:    lever("SIZE LAW",  0.8, 2.6,  0.02, 1.7),
  harm:   lever("HARMONICS", 2,   6,    1,    4),
  writhe: lever("WRITHE",    0,   1,    0.01, 0.55),
  ball:   lever("TANGLE R",  0.4, 1.4,  0.01, 0.95),
  core:   lever("CORE GLOW", 0,   1,    0.01, 0.6),
  flat:   lever("FLATTEN",   0,   1,    0.01, 0.25),
  cam: { dist: 3.0, pitch: 0.35, tgtY: 0.0, rot: 0.06 },
  gain: 0.55, accent: "#8fe08f",
},
(P, s) => {
  // which filament this point rides, uniform over the population
  const nf = Math.floor(P.fils + 0.5);
  const fid = Math.floor(s.u() * nf);

  // its cell in the catalogue lattice. The split is by 32, a power of
  // two, so both coordinates are exact for every filament index the
  // lever can reach.
  const fy = Math.floor(fid * 0.03125);
  const fx = fid - 32.0 * fy;

  // size: a power law between scales, small loops plentiful, so the
  // zoom's window always holds loops at its own scale
  const su = s.vnoise(fx, fy, 3) + 0.5;
  const size = 0.02 + 0.9 * Math.pow(su, P.law);

  // the centre, uniform inside the tangle ball
  const ctrx = s.vnoise(fx, fy, 5) * 2.0 * P.ball;
  const ctry = s.vnoise(fx, fy, 7) * 2.0 * P.ball;
  const ctrz = s.vnoise(fx, fy, 11) * 2.0 * P.ball;

  // the plane the loop turns in: e1 its axis, addressed by two angles
  const a1 = TAU * (s.vnoise(fx, fy, 13) + 0.5);
  const a2 = TAU * (s.vnoise(fx, fy, 17) + 0.5);
  const e1x = Math.cos(a1) * Math.cos(a2);
  const e1y = Math.sin(a1) * Math.cos(a2);
  const e1z = Math.sin(a2);

  // e2 is the plate's fixed vector crossed into that axis and made a
  // unit, written out because normalize() has no deterministic form.
  // The floor on the length is what the shader lacks: a filament whose
  // axis hashes parallel to (0.31, 0.71, 0.63) has a vanishing cross
  // product there, and a normalize of it is a NaN, which is where the
  // spec stops promising two cards the same answer.
  const kx = e1y * 0.63 - e1z * 0.71;
  const ky = e1z * 0.31 - e1x * 0.63;
  const kz = e1x * 0.71 - e1y * 0.31;
  const kl = Math.max(len3(kx, ky, kz), 1.0e-6);
  const e2x = kx / kl;
  const e2y = ky / kl;
  const e2z = kz / kl;
  const e3x = e1y * e2z - e1z * e2y;
  const e3y = e1z * e2x - e1x * e2z;
  const e3z = e1x * e2y - e1y * e2x;

  // the seat along the loop is the point's own, so a filament is drawn
  // by the whole population that shares it rather than by one point
  const th = TAU * s.u();
  const cth = Math.cos(th);
  const sth = Math.sin(th);

  // the closed Fourier curve: a base circle in the addressed plane,
  // then the filament's own harmonics, each falling as 1/k^2
  const amp = size * 0.45 * P.writhe;
  const H = s.orbit(P.harm, {
    px: ctrx + size * (cth * e2x + sth * e3x),
    py: ctry + size * (cth * e2y + sth * e3y),
    pz: ctrz + size * (cth * e2z + sth * e3z),
  }, (v, k) => {
    const kf = k + 2.0;
    const ph = TAU * (s.vnoise(fx, fy, 101 + k) + 0.5);
    const wk = amp * ((s.vnoise(fx, fy, 211 + k) + 0.5) - 0.3) / (kf * kf);
    const ck = Math.cos(kf * th + ph);
    const sk = Math.sin(kf * th + ph);
    return {
      px: v.px + wk * (ck * e1x + sk * e2x),
      py: v.py + wk * (ck * e1y + sk * e2y),
      pz: v.pz + wk * (ck * e1z + sk * e2z),
    };
  });

  // the quantized core: the 2.4 power hugs the light to the line and
  // leaves a breath of halo standing off it
  const rj = s.u();
  const rr = Math.pow(Math.abs(2.0 * rj - 1.0), 2.4) * size * 0.06;
  const ra = TAU * s.u();
  const cra = Math.cos(ra);
  const sra = Math.sin(ra);

  // colour reads the filament's own scale, so the tangle is graded by
  // the power law that made it rather than by depth
  const sz = 1.0 - su;
  return s.deposit({
    xyz: [H.px + rr * (cra * e1x + sra * e2x),
          H.py + rr * (cra * e1y + sra * e2y),
          H.pz + rr * (cra * e1z + sra * e2z)],
    col: mul3(pal(0.30 + 0.35 * su,
                  [0.42, 0.5, 0.44], [0.4, 0.5, 0.42],
                  [0.85, 1.0, 0.9], [0.2, 0.45, 0.6]),
              0.4 + 1.6 * sz * sz * (0.5 + P.core)),
  });
});
