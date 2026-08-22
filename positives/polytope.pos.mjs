// Plate XXIV Regular Polytopes in 4D, as a positive. Each point picks
// a random edge of the chosen polytope, seats itself along it at q.x,
// rides the whole figure through two independent rotation planes, and
// falls through a projection into space. The shader burns a seed hash
// chain for the edge choice; here every choice is a stream draw of the
// same law (pick a corner, pick an axis, flip a coin). The tesseract's
// corner bits come out of the pick by integer division where the
// shader masks bits, the same sixteen-way map. Hue carries w, the
// coordinate we cannot see.
import { positive, lever, pal, mix } from "../core/measure.mjs";

export default positive("polytope_pos", {
  poly:   lever("POLYTOPE",   0,    2,    1,     0),
  spinXW: lever("SPIN XW",   -0.5,  0.5,  0.005, 0.17),
  spinYZ: lever("SPIN YZ",   -0.5,  0.5,  0.005, 0.11),
  proj:   lever("PROJECTION", 0,    1,    1,     0),
  scale:  lever("SCALE",      0.5,  1.4,  0.01,  0.9),
  body:   lever("EDGE BODY",  0,    0.08, 0.002, 0.02),
  glow:   lever("GLOW",       0,    1,    0.01,  0.6),
  cam: { dist: 3.4, pitch: 0.15, tgtY: 0.0, rot: 0.0 },
  gain: 0.7, accent: "#b8a0ff",
},
(P, s, q, t) => {
  const poly = Math.floor(P.poly + 0.5);
  let Ax = 0.0, Ay = 0.0, Az = 0.0, Aw = 0.0;
  let Bx = 0.0, By = 0.0, Bz = 0.0, Bw = 0.0;

  if (poly == 0.0) {
    // tesseract: a corner of {+-1}^4 from four bits of one draw, its
    // edge partner the same corner with one random axis flipped
    const vi = s.pick(16);
    Ax = (vi % 2 == 1) ? 1.0 : -1.0;
    Ay = (Math.trunc(vi / 2) % 2 == 1) ? 1.0 : -1.0;
    Az = (Math.trunc(vi / 4) % 2 == 1) ? 1.0 : -1.0;
    Aw = (Math.trunc(vi / 8) % 2 == 1) ? 1.0 : -1.0;
    const ax = s.pick(4);
    Bx = (ax == 0) ? -Ax : Ax;
    By = (ax == 1) ? -Ay : Ay;
    Bz = (ax == 2) ? -Az : Az;
    Bw = (ax == 3) ? -Aw : Aw;
  } else if (poly == 1.0) {
    // 16-cell: an edge between +-e_a and +-e_b with a and b distinct
    const a = s.pick(4);
    let b = s.pick(4);
    if (b == a) { b = (b + 1) % 4; }
    const sa = (s.u() < 0.5) ? 1.0 : -1.0;
    const sb = (s.u() < 0.5) ? 1.0 : -1.0;
    Ax = (a == 0) ? sa : 0.0;
    Ay = (a == 1) ? sa : 0.0;
    Az = (a == 2) ? sa : 0.0;
    Aw = (a == 3) ? sa : 0.0;
    Bx = (b == 0) ? sb : 0.0;
    By = (b == 1) ? sb : 0.0;
    Bz = (b == 2) ? sb : 0.0;
    Bw = (b == 3) ? sb : 0.0;
  } else {
    // 24-cell: vertices are the permutations of (+-1, +-1, 0, 0); the
    // neighbor shares one signed axis and swaps the other
    const i = s.pick(4);
    let j = s.pick(4);
    if (j == i) { j = (j + 1) % 4; }
    const si = (s.u() < 0.5) ? 1.0 : -1.0;
    const sj = (s.u() < 0.5) ? 1.0 : -1.0;
    Ax = ((i == 0) ? si : 0.0) + ((j == 0) ? sj : 0.0);
    Ay = ((i == 1) ? si : 0.0) + ((j == 1) ? sj : 0.0);
    Az = ((i == 2) ? si : 0.0) + ((j == 2) ? sj : 0.0);
    Aw = ((i == 3) ? si : 0.0) + ((j == 3) ? sj : 0.0);
    let k = s.pick(4);
    if (k == i) { k = (k + 1) % 4; }
    const sk = (s.u() < 0.5) ? 1.0 : -1.0;
    Bx = ((i == 0) ? si : 0.0) + ((k == 0) ? sk : 0.0);
    By = ((i == 1) ? si : 0.0) + ((k == 1) ? sk : 0.0);
    Bz = ((i == 2) ? si : 0.0) + ((k == 2) ? sk : 0.0);
    Bw = ((i == 3) ? si : 0.0) + ((k == 3) ? sk : 0.0);
  }

  // the point rides the edge at q.x
  const P4x = mix(Ax, Bx, q.x);
  const P4y = mix(Ay, By, q.x);
  const P4z = mix(Az, Bz, q.x);
  const P4w = mix(Aw, Bw, q.x);

  // two independent rotation planes, xw then yz, written out
  const r1 = P.spinXW * t;
  const r2 = P.spinYZ * t;
  const c1 = Math.cos(r1);
  const s1 = Math.sin(r1);
  const Q1x = c1 * P4x - s1 * P4w;
  const Q1w = s1 * P4x + c1 * P4w;
  const c2 = Math.cos(r2);
  const s2 = Math.sin(r2);
  const Q2y = c2 * P4y - s2 * P4z;
  const Q2z = s2 * P4y + c2 * P4z;

  // the shadow: perspective from w, or the flatter projection
  const proj = Math.floor(P.proj + 0.5);
  let p3x = 0.0, p3y = 0.0, p3z = 0.0;
  if (proj == 0.0) {
    p3x = Q1x * (1.0 / (2.6 - Q1w)) * 2.2;
    p3y = Q2y * (1.0 / (2.6 - Q1w)) * 2.2;
    p3z = Q2z * (1.0 / (2.6 - Q1w)) * 2.2;
  } else {
    p3x = Q1x / (2.4 - Q1w * 0.7);
    p3y = Q2y / (2.4 - Q1w * 0.7);
    p3z = Q2z / (2.4 - Q1w * 0.7);
  }
  p3x *= P.scale;
  p3y *= P.scale;
  p3z *= P.scale;

  // edge body: the shader jitters by rnd.zwz, so x and z share one
  // draw and the correlation is kept
  const j1 = s.centered();
  const j2 = s.centered();
  p3x += j1 * P.body;
  p3y += j2 * P.body;
  p3z += j1 * P.body;

  return s.deposit({
    xyz: [p3x, p3y, p3z],
    col: pal(Q1w * 0.22 + 0.5, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
             [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]),
    glow: 0.45 + 0.8 * P.glow,
  });
});
