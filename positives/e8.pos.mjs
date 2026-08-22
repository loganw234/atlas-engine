// Plate XLIV The Shape of E8, as a positive. Each point hashes to one
// of the 240 roots, decoded by arithmetic, never looked up: integer
// roots +-e_i +- e_j by the subtract idiom (an orbit here, exactly the
// shader's loop), half-integer roots by bits, with the eighth sign the
// parity of the other seven. The Coxeter-plane basis is four fixed
// 8-vectors held as scalar constants and dotted out by hand. MODE 1
// and the MODE 2 coin trace edges: a search orbit proposes fresh
// candidate roots and accepts the first with inner product one. The
// decode cannot ride inside that orbit (orbits do not nest), so the
// step tests the candidate through its inner product with root A,
// which collapses to sgnI * A[ii] + sgnJ * A[jj] for integer roots
// and a signed half-sum for half roots; the thresholds on m = r/4
// become thresholds on r itself. That is the shader's own loop laid
// flat, and the probe checks it against all 240 roots exhaustively.
import { positive, lever, pal, mix, mod, TAU } from "../core/measure.mjs";

export default positive("e8_pos", {
  mode:   lever("MODE",     0,   2,   1,    2),
  turn:   lever("4D TURN",  0,   1,   0.01, 0.15),
  zdepth: lever("Z DEPTH",  0,   1,   0.01, 0.35),
  hue:    lever("RING HUE", 0,   1,   0.01, 0.55),
  scale:  lever("SCALE",    0.6, 1.3, 0.01, 1.15),
  glow:   lever("GLOW",     0,   1,   0.01, 0.6),
  cam: { dist: 3.0, pitch: 0.1, tgtY: 0.0, rot: 0.03 },
  gain: 0.8, accent: "#d4b8ff",
},
(P, s, q, t) => {
  // the Coxeter-plane basis, verbatim: u1/u2 span the Petrie
  // eigenplane, u3/u4 the exponent-7 plane used for depth. Coordinates
  // 0..3 are the shader's "a" vec4, 4..7 its "b".
  const u1c0 = 0.0,         u1c1 = 0.11911770,  u1c2 = 0.19273649,  u1c3 = 0.21763887,
        u1c4 = 0.19273649,  u1c5 = 0.11911770,  u1c6 = 0.0,         u1c7 = 0.92193306;
  const u2c0 = -0.09689907, u2c1 = -0.46350566, u2c2 = -0.23693033, u2c3 = 0.0,
        u2c4 = 0.23693033,  u2c5 = 0.46350566,  u2c6 = 0.66982357,  u2c7 = 0.0;
  const u3c0 = 0.0,         u3c1 = 0.38336132,  u3c2 = -0.23693033, u3c3 = -0.74996791,
        u3c4 = -0.23693033, u3c5 = 0.38336132,  u3c6 = 0.0,         u3c7 = 0.17704341;
  const u4c0 = -0.15941060, u4c1 = 0.11911770,  u4c2 = 0.56978596,  u4c3 = 0.0,
        u4c4 = -0.56978596, u4c5 = -0.11911770, u4c6 = 0.54488358,  u4c7 = 0.0;

  // this point's root, uniform over the 240
  const r = s.pick(240);

  // decode root r into eight coordinates. Integer roots (r < 112):
  // m = r/4 names the pair (i, j) with i < j through the subtract
  // idiom, r's two low bits are the signs. Half roots: seven sign
  // bits and a parity eighth, the XOR of bits said as a sum mod 2.
  let a0 = 0.0, a1 = 0.0, a2 = 0.0, a3 = 0.0,
      a4 = 0.0, a5 = 0.0, a6 = 0.0, a7 = 0.0;
  if (r < 112) {
    const fa = s.orbit(7, { m: Math.trunc(r / 4), i: 0 }, (st) => ({
      m: st.m - (7.0 - st.i),
      i: st.i + 1.0,
    }), { until: (st) => st.m < 7.0 - st.i });
    const ii = fa.i;
    const jj = fa.i + 1.0 + fa.m;
    const sgi = (r % 2 != 0) ? -1.0 : 1.0;
    const sgj = (Math.trunc(r / 2) % 2 != 0) ? -1.0 : 1.0;
    a0 = (ii == 0.0) ? sgi : ((jj == 0.0) ? sgj : 0.0);
    a1 = (ii == 1.0) ? sgi : ((jj == 1.0) ? sgj : 0.0);
    a2 = (ii == 2.0) ? sgi : ((jj == 2.0) ? sgj : 0.0);
    a3 = (ii == 3.0) ? sgi : ((jj == 3.0) ? sgj : 0.0);
    a4 = (ii == 4.0) ? sgi : ((jj == 4.0) ? sgj : 0.0);
    a5 = (ii == 5.0) ? sgi : ((jj == 5.0) ? sgj : 0.0);
    a6 = (ii == 6.0) ? sgi : ((jj == 6.0) ? sgj : 0.0);
    a7 = (ii == 7.0) ? sgi : ((jj == 7.0) ? sgj : 0.0);
  } else {
    const sb = r - 112;
    const k0 = sb % 2;
    const k1 = Math.trunc(sb / 2) % 2;
    const k2 = Math.trunc(sb / 4) % 2;
    const k3 = Math.trunc(sb / 8) % 2;
    const k4 = Math.trunc(sb / 16) % 2;
    const k5 = Math.trunc(sb / 32) % 2;
    const k6 = Math.trunc(sb / 64) % 2;
    const par = (k0 + k1 + k2 + k3 + k4 + k5 + k6) % 2;
    a0 = (k0 != 0) ? -0.5 : 0.5;
    a1 = (k1 != 0) ? -0.5 : 0.5;
    a2 = (k2 != 0) ? -0.5 : 0.5;
    a3 = (k3 != 0) ? -0.5 : 0.5;
    a4 = (k4 != 0) ? -0.5 : 0.5;
    a5 = (k5 != 0) ? -0.5 : 0.5;
    a6 = (k6 != 0) ? -0.5 : 0.5;
    a7 = (par != 0) ? -0.5 : 0.5;
  }

  // Petrie projection of root A, and the nearest of the eight exact
  // ring radii names the ring
  const ax = u1c0 * a0 + u1c1 * a1 + u1c2 * a2 + u1c3 * a3
           + u1c4 * a4 + u1c5 * a5 + u1c6 * a6 + u1c7 * a7;
  const ay = u2c0 * a0 + u2c1 * a1 + u2c2 * a2 + u2c3 * a3
           + u2c4 * a4 + u2c5 * a5 + u2c6 * a6 + u2c7 * a7;
  const rr = Math.sqrt(ax * ax + ay * ay);
  let bd = Math.abs(rr - 0.238235);
  let ring = 0.0;
  let dd = Math.abs(rr - 0.385473);
  if (dd < bd) { bd = dd; ring = 1.0; }
  dd = Math.abs(rr - 0.473861);
  if (dd < bd) { bd = dd; ring = 2.0; }
  dd = Math.abs(rr - 0.572925);
  if (dd < bd) { bd = dd; ring = 3.0; }
  dd = Math.abs(rr - 0.704294);
  if (dd < bd) { bd = dd; ring = 4.0; }
  dd = Math.abs(rr - 0.766723);
  if (dd < bd) { bd = dd; ring = 5.0; }
  dd = Math.abs(rr - 0.927011);
  if (dd < bd) { bd = dd; ring = 6.0; }
  dd = Math.abs(rr - 1.139572);
  if (dd < bd) { bd = dd; ring = 7.0; }

  // depth breathes through the second eigenplane; the xy silhouette
  // keeps its 30-fold symmetry no matter what the clock does
  const cw = Math.cos(t * P.turn);
  const sw = Math.sin(t * P.turn);

  // MODE 0 orbs, MODE 1 all edges, MODE 2 a fair coin per point
  let edge = 0.0;
  if (P.mode > 0.5 && P.mode < 1.5) { edge = 1.0; }
  if (P.mode > 1.5) {
    const coin = s.u();
    if (coin < 0.5) { edge = 1.0; }
  }

  let px = 0.0, py = 0.0, pz = 0.0;
  if (edge > 0.5) {
    // Neighbor search: candidates from fresh draws, accept when
    // <A, B> = 1 (56 of 240 qualify). The state pipelines one step:
    // ip carries the inner product of the candidate drawn last step
    // (held in prc), so each step tests one candidate and proposes
    // the next. Init ip = 0 accepts nothing, so step 1 is a warm-up
    // and steps 2..25 test candidates 1..24, the shader's 24 tries.
    // For an integer-root candidate the dot collapses onto the two
    // signed coordinates of A that the candidate touches; the range
    // tests on m = rc/4 appear here as range tests on rc itself.
    const nb = s.orbit(25, { found: 0.0, acc: 0.0, ip: 0.0, prc: 0.0, rc: s.pick(240) }, (st) => ({
      found: (st.found > 0.5 || (st.ip > 0.5 && st.ip < 1.5)) ? 1.0 : 0.0,
      acc: (st.found < 0.5 && st.ip > 0.5 && st.ip < 1.5) ? st.prc : st.acc,
      ip: (st.rc < 112.0)
        ? (((mod(st.rc, 2.0) != 0.0) ? -1.0 : 1.0)
             * ((st.rc < 28.0) ? a0 : (st.rc < 52.0) ? a1 : (st.rc < 72.0) ? a2
              : (st.rc < 88.0) ? a3 : (st.rc < 100.0) ? a4 : (st.rc < 108.0) ? a5 : a6)
           + ((mod(Math.floor(st.rc / 2.0), 2.0) != 0.0) ? -1.0 : 1.0)
             * ((st.rc < 28.0)
                  ? ((st.rc < 4.0) ? a1 : (st.rc < 8.0) ? a2 : (st.rc < 12.0) ? a3
                   : (st.rc < 16.0) ? a4 : (st.rc < 20.0) ? a5 : (st.rc < 24.0) ? a6 : a7)
                : (st.rc < 52.0)
                  ? ((st.rc < 32.0) ? a2 : (st.rc < 36.0) ? a3 : (st.rc < 40.0) ? a4
                   : (st.rc < 44.0) ? a5 : (st.rc < 48.0) ? a6 : a7)
                : (st.rc < 72.0)
                  ? ((st.rc < 56.0) ? a3 : (st.rc < 60.0) ? a4
                   : (st.rc < 64.0) ? a5 : (st.rc < 68.0) ? a6 : a7)
                : (st.rc < 88.0)
                  ? ((st.rc < 76.0) ? a4 : (st.rc < 80.0) ? a5 : (st.rc < 84.0) ? a6 : a7)
                : (st.rc < 100.0)
                  ? ((st.rc < 92.0) ? a5 : (st.rc < 96.0) ? a6 : a7)
                : (st.rc < 108.0)
                  ? ((st.rc < 104.0) ? a6 : a7)
                : a7))
        : (a0 * ((mod(st.rc - 112.0, 2.0) != 0.0) ? -0.5 : 0.5)
         + a1 * ((mod(Math.floor((st.rc - 112.0) / 2.0), 2.0) != 0.0) ? -0.5 : 0.5)
         + a2 * ((mod(Math.floor((st.rc - 112.0) / 4.0), 2.0) != 0.0) ? -0.5 : 0.5)
         + a3 * ((mod(Math.floor((st.rc - 112.0) / 8.0), 2.0) != 0.0) ? -0.5 : 0.5)
         + a4 * ((mod(Math.floor((st.rc - 112.0) / 16.0), 2.0) != 0.0) ? -0.5 : 0.5)
         + a5 * ((mod(Math.floor((st.rc - 112.0) / 32.0), 2.0) != 0.0) ? -0.5 : 0.5)
         + a6 * ((mod(Math.floor((st.rc - 112.0) / 64.0), 2.0) != 0.0) ? -0.5 : 0.5)
         + a7 * ((mod(mod(st.rc - 112.0, 2.0)
                    + mod(Math.floor((st.rc - 112.0) / 2.0), 2.0)
                    + mod(Math.floor((st.rc - 112.0) / 4.0), 2.0)
                    + mod(Math.floor((st.rc - 112.0) / 8.0), 2.0)
                    + mod(Math.floor((st.rc - 112.0) / 16.0), 2.0)
                    + mod(Math.floor((st.rc - 112.0) / 32.0), 2.0)
                    + mod(Math.floor((st.rc - 112.0) / 64.0), 2.0), 2.0) != 0.0) ? -0.5 : 0.5)),
      prc: st.rc,
      rc: s.pick(240),
    }), { until: (st) => st.found > 0.5 });
    if (nb.found < 0.5) {
      return s.decline();
    }

    // decode the accepted neighbour exactly as root A was decoded; the
    // index arrives as a float, so the bit arithmetic runs in floats,
    // exact for integers this small
    let b0 = 0.0, b1 = 0.0, b2 = 0.0, b3 = 0.0,
        b4 = 0.0, b5 = 0.0, b6 = 0.0, b7 = 0.0;
    if (nb.acc < 112.0) {
      const fb = s.orbit(7, { m: Math.floor(nb.acc / 4.0), i: 0.0 }, (st) => ({
        m: st.m - (7.0 - st.i),
        i: st.i + 1.0,
      }), { until: (st) => st.m < 7.0 - st.i });
      const bii = fb.i;
      const bjj = fb.i + 1.0 + fb.m;
      const bsi = (mod(nb.acc, 2.0) != 0.0) ? -1.0 : 1.0;
      const bsj = (mod(Math.floor(nb.acc / 2.0), 2.0) != 0.0) ? -1.0 : 1.0;
      b0 = (bii == 0.0) ? bsi : ((bjj == 0.0) ? bsj : 0.0);
      b1 = (bii == 1.0) ? bsi : ((bjj == 1.0) ? bsj : 0.0);
      b2 = (bii == 2.0) ? bsi : ((bjj == 2.0) ? bsj : 0.0);
      b3 = (bii == 3.0) ? bsi : ((bjj == 3.0) ? bsj : 0.0);
      b4 = (bii == 4.0) ? bsi : ((bjj == 4.0) ? bsj : 0.0);
      b5 = (bii == 5.0) ? bsi : ((bjj == 5.0) ? bsj : 0.0);
      b6 = (bii == 6.0) ? bsi : ((bjj == 6.0) ? bsj : 0.0);
      b7 = (bii == 7.0) ? bsi : ((bjj == 7.0) ? bsj : 0.0);
    } else {
      const sb2 = nb.acc - 112.0;
      const h0 = mod(sb2, 2.0);
      const h1 = mod(Math.floor(sb2 / 2.0), 2.0);
      const h2 = mod(Math.floor(sb2 / 4.0), 2.0);
      const h3 = mod(Math.floor(sb2 / 8.0), 2.0);
      const h4 = mod(Math.floor(sb2 / 16.0), 2.0);
      const h5 = mod(Math.floor(sb2 / 32.0), 2.0);
      const h6 = mod(Math.floor(sb2 / 64.0), 2.0);
      const parb = mod(h0 + h1 + h2 + h3 + h4 + h5 + h6, 2.0);
      b0 = (h0 != 0.0) ? -0.5 : 0.5;
      b1 = (h1 != 0.0) ? -0.5 : 0.5;
      b2 = (h2 != 0.0) ? -0.5 : 0.5;
      b3 = (h3 != 0.0) ? -0.5 : 0.5;
      b4 = (h4 != 0.0) ? -0.5 : 0.5;
      b5 = (h5 != 0.0) ? -0.5 : 0.5;
      b6 = (h6 != 0.0) ? -0.5 : 0.5;
      b7 = (parb != 0.0) ? -0.5 : 0.5;
    }

    // the projection is linear, so mixing in 8D before projecting
    // samples the projected segment uniformly in q.y
    const m0 = mix(a0, b0, q.y);
    const m1 = mix(a1, b1, q.y);
    const m2 = mix(a2, b2, q.y);
    const m3 = mix(a3, b3, q.y);
    const m4 = mix(a4, b4, q.y);
    const m5 = mix(a5, b5, q.y);
    const m6 = mix(a6, b6, q.y);
    const m7 = mix(a7, b7, q.y);
    const ex = u1c0 * m0 + u1c1 * m1 + u1c2 * m2 + u1c3 * m3
             + u1c4 * m4 + u1c5 * m5 + u1c6 * m6 + u1c7 * m7;
    const ey = u2c0 * m0 + u2c1 * m1 + u2c2 * m2 + u2c3 * m3
             + u2c4 * m4 + u2c5 * m5 + u2c6 * m6 + u2c7 * m7;
    const ez = (cw * (u3c0 * m0 + u3c1 * m1 + u3c2 * m2 + u3c3 * m3
                    + u3c4 * m4 + u3c5 * m5 + u3c6 * m6 + u3c7 * m7)
              + sw * (u4c0 * m0 + u4c1 * m1 + u4c2 * m2 + u4c3 * m3
                    + u4c4 * m4 + u4c5 * m5 + u4c6 * m6 + u4c7 * m7)) * P.zdepth;
    px = ex + s.centered() * 0.006;
    py = ey + s.centered() * 0.006;
    pz = ez + s.centered() * 0.006;
  } else {
    // orb: a tight uniform ball around the projected root
    const oz = (cw * (u3c0 * a0 + u3c1 * a1 + u3c2 * a2 + u3c3 * a3
                    + u3c4 * a4 + u3c5 * a5 + u3c6 * a6 + u3c7 * a7)
              + sw * (u4c0 * a0 + u4c1 * a1 + u4c2 * a2 + u4c3 * a3
                    + u4c4 * a4 + u4c5 * a5 + u4c6 * a6 + u4c7 * a7)) * P.zdepth;
    const ct = 1.0 - 2.0 * q.x;
    const sn = Math.sqrt(Math.max(0.0, 1.0 - ct * ct));
    const ph = TAU * q.y;
    const ob = 0.024 * Math.pow(s.u() + 1.0e-6, 0.33333);
    px = ax + sn * Math.cos(ph) * ob;
    py = ay + ct * ob;
    pz = oz + sn * Math.sin(ph) * ob;
  }
  px *= P.scale;
  py *= P.scale;
  pz *= P.scale;

  return s.deposit({
    xyz: [px, py, pz],
    col: pal(ring * 0.125 + P.hue, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
             [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]),
    glow: (0.30 + 0.95 * P.glow) * (0.85 + 0.3 * s.u()),
  });
});
