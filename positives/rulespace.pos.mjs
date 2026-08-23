// Plate LXVIII The Rule Space, as a positive - the whole book of
// elementary automata on one sheet. Two states and three neighbours
// admit exactly 2^(2^3) = 256 laws, and the sheet lays them out by
// Wolfram number, high nibble down and low nibble across. Nothing is
// a thumbnail: each tile is grown live on its own ring of one hundred
// twenty-eight cells from its own seed row, and the tint is measured
// from the activity the opening rows actually exhibit, so Wolfram's
// four classes sort themselves by behaviour rather than by citation.
//
// THE ROW IS BITS AND THE ORBIT IS FLOATS. The shader keeps the ring
// in four uint words and steps all thirty-two cells of a word at once
// with eight neighbourhood masks, which is the one thing the
// vocabulary cannot say: it has no bitwise operators at all, not even
// in its lexer. So the ring rides as eight sixteen-bit words in exact
// small floats, the collatz idiom, and the mask arithmetic becomes
// arithmetic on one cell at a time. Every intermediate stays under
// 2^17 and so is exact on both backends: a word is under 65536, the
// left neighbour word doubles it before the modulus, and the running
// place value doubles up to 32768. The three loops that used to be
// bit parallel are now rows, then words, then bits, which is why this
// plate needed the orbit step to accept a block body.
//
// The neighbourhood is the same one the masks encode. The shader ORs
// in mask 4L+2C+R when bit 4L+2C+R of the rule is set, so the cell's
// new state IS bit 4L+2C+R of the rule, and the place value 2^(4L+2C+R)
// is the product (1+15L)(1+3C)(1+R) over bits, which needs no pow.
//
// The seed row is the one hashed convention. Every point that lands on
// a tile must grow the SAME automaton, so the seed positions cannot be
// stream draws; they are addressed, from s.vnoise at whole lattice
// coordinates, where the interpolation weights vanish and what comes
// back is the lattice corner hash itself, keyed by the tile's rule
// number, the WORLD lever, and the seed's own index.
import { positive, lever, pal, mul3, stain, mod, clamp, sum } from "../core/measure.mjs";

export default positive("rulespace_pos", {
  depth:   lever("DEPTH",   5, 9,  1,    7),
  magnify: lever("MAGNIFY", 0, 12, 0.25, 0),
  seeding: lever("SEEDING", 1, 16, 1,    1),
  world:   lever("WORLD",   1, 64, 1,    1),
  tint:    lever("TINT",    0, 1,  0.01, 0.6),
  flare:   lever("FLARE",   0, 1,  0.01, 0.35),
  ink:     lever("INK",     0, 1,  0.01, 0.5),
  st:      lever("STAIN",   0, 1,  0.01, 0.5),
  cam: { dist: 3.0, pitch: 0.30, tgtY: 0.0, rot: 0.0 },
  gain: 0.5, accent: "#c9b8ff",
},
(P, s) => {
  // rows per tile, 2^DEPTH, reached by doubling so the power is exact
  // rather than trusted to a transcendental. The tile is 65536 lattice
  // units tall whatever the depth, so the row pitch divides exactly.
  const RT = s.orbit(P.depth, { n: 1.0 }, (v) => ({ n: v.n * 2.0 }));
  const rowsT = RT.n;
  const rowPitch = 65536.0 / rowsT;

  // The survey sheet is sixteen by sixteen tiles of 65536 units on a
  // pitch of 73728, so it spans 16 * 73728 - 8192 = 1171456 units, and
  // its centre is 585728. The dive leans on rule thirty's tile, which
  // sits at column fourteen of row one; the offsets from centre are
  // 479232 across and 462848 up, the second negative, which is why its
  // truncation toward zero is written as a subtracted floor.
  const mag = Math.pow(2.0, P.magnify);
  const shrink = 1.0 - 1.0 / mag;
  const wcx = 585728.0 + Math.floor(479232.0 * shrink);
  const wcy = 585728.0 - Math.floor(462848.0 * shrink);
  const hw = Math.floor(585728.0 / mag);
  const winx = wcx - hw;
  const winy = wcy - hw;
  const winz = wcx + hw;
  const winw = wcy + hw;
  const km = 2.85 / 1171456.0 * mag;

  // The grid is separable, so the two axes weigh independently by the
  // extent of each tile the window still shows, counted in cells.
  const accx = sum(16, (g) => Math.floor(Math.max(0.0,
    Math.min(winz, g * 73728.0 + 65536.0) - Math.max(winx, g * 73728.0)) / 512.0));
  const accy = sum(16, (g) => Math.floor(Math.max(0.0,
    Math.min(winw, g * 73728.0 + 65536.0) - Math.max(winy, g * 73728.0)) / 512.0));
  if (accx <= 0.0 || accy <= 0.0) {
    return s.decline();
  }

  // one draw per axis, spent on the clipped extents; the run walks the
  // sixteen columns and keeps the one the draw fell inside
  const px2 = Math.floor(s.u() * accx);
  const GX = s.orbit(16, { run: 0.0, g: 0.0 }, (v, k) => {
    const a0 = Math.max(winx, k * 73728.0);
    const a1 = Math.min(winz, k * 73728.0 + 65536.0);
    const wk = Math.floor(Math.max(0.0, a1 - a0) / 512.0);
    const nr = v.run + wk;
    return { run: nr, g: (px2 >= v.run && px2 < nr && wk > 0.0) ? (k + 0.0) : v.g };
  });
  const py2 = Math.floor(s.u() * accy);
  const GY = s.orbit(16, { run: 0.0, g: 0.0 }, (v, k) => {
    const b0 = Math.max(winy, k * 73728.0);
    const b1 = Math.min(winw, k * 73728.0 + 65536.0);
    const wk = Math.floor(Math.max(0.0, b1 - b0) / 512.0);
    const nr = v.run + wk;
    return { run: nr, g: (py2 >= v.run && py2 < nr && wk > 0.0) ? (k + 0.0) : v.g };
  });

  // the tile's Wolfram number, high nibble down and low nibble across
  const rule = GY.g * 16.0 + GX.g;
  const tlox = GX.g * 73728.0;
  const tloy = GY.g * 73728.0;

  // row and cell inside the tile, clipped to what the window shows.
  // The column was only kept where its clipped extent was positive, so
  // the far edges are inside the window and the divisions that could
  // have gone negative cannot.
  const rlo = Math.max(0.0, Math.floor((winy - tloy) / rowPitch));
  const rhi = Math.min(rowsT - 1.0, Math.floor((winw - tloy) / rowPitch));
  const k0 = Math.max(0.0, Math.floor((winx - tlox) / 512.0));
  const k1 = Math.min(127.0, Math.floor((winz - tlox) / 512.0));
  if (rhi < rlo || k1 < k0) {
    return s.decline();
  }
  const trow0 = rlo + Math.floor(s.u() * (rhi - rlo + 1.0));
  const trow = Math.min(trow0, rhi);
  const xc0 = k0 + Math.floor(s.u() * (k1 - k0 + 1.0));
  const xcell = Math.min(xc0, k1);

  // THE SEED ROW, addressed rather than drawn. The first seed is
  // always the middle cell; the rest are the lattice corner hashes at
  // whole coordinates, which is a field and not a sequence, so every
  // point that lands on this tile builds the same opening row. Seeds
  // may collide, and the shader ORs its bit in, so the bit is added
  // only where it was not already standing.
  const wbase = Math.floor(P.world + 0.5) * 16.0;
  const SEED = s.orbit(P.seeding, {
    w0: 0.0, w1: 0.0, w2: 0.0, w3: 0.0, w4: 0.0, w5: 0.0, w6: 0.0, w7: 0.0,
  }, (v, k) => {
    const hk = s.vnoise(rule, wbase + k, 0) + 0.5;
    const sx = (k == 0) ? 64.0 : Math.min(Math.floor(hk * 128.0), 127.0);
    const swi = Math.floor(sx / 16.0);
    const sbi = sx - swi * 16.0;
    const PW = s.orbit(16, { p: 1.0, j: 0.0 },
      (a) => ({ p: a.p * 2.0, j: a.j + 1.0 }), { until: (a) => a.j >= sbi });
    const cur = (swi == 0.0) ? v.w0 : (swi == 1.0) ? v.w1 : (swi == 2.0) ? v.w2
              : (swi == 3.0) ? v.w3 : (swi == 4.0) ? v.w4 : (swi == 5.0) ? v.w5
              : (swi == 6.0) ? v.w6 : v.w7;
    const add = (1.0 - mod(Math.floor(cur / PW.p), 2.0)) * PW.p;
    return {
      w0: (swi == 0.0) ? v.w0 + add : v.w0,
      w1: (swi == 1.0) ? v.w1 + add : v.w1,
      w2: (swi == 2.0) ? v.w2 + add : v.w2,
      w3: (swi == 3.0) ? v.w3 + add : v.w3,
      w4: (swi == 4.0) ? v.w4 + add : v.w4,
      w5: (swi == 5.0) ? v.w5 + add : v.w5,
      w6: (swi == 6.0) ? v.w6 + add : v.w6,
      w7: (swi == 7.0) ? v.w7 + add : v.w7,
    };
  });

  // THE TOLL. Rows outward, words across the ring, bits along a word.
  // The left neighbour word gives up its top bit and the right one its
  // bottom bit, which is the shader's (cw << 1) | (lw >> 31) and
  // (cw >> 1) | (rw << 31) at sixteen bits instead of thirty-two. The
  // ring closes: word zero's left is word seven and word seven's right
  // is word zero. Activity is counted where the new bit differs from
  // the old, which is the population count of the shader's exclusive
  // or, and it is measured on the opening thirty-two rows only.
  const CA = s.orbit(512, {
    w0: SEED.w0, w1: SEED.w1, w2: SEED.w2, w3: SEED.w3,
    w4: SEED.w4, w5: SEED.w5, w6: SEED.w6, w7: SEED.w7,
    act: 0.0, actN: 0.0, it: 0.0,
  }, (v, k) => {
    const NW = s.orbit(8, {
      n0: 0.0, n1: 0.0, n2: 0.0, n3: 0.0, n4: 0.0, n5: 0.0, n6: 0.0, n7: 0.0,
      chg: 0.0,
    }, (u, w) => {
      const cw = (w == 0) ? v.w0 : (w == 1) ? v.w1 : (w == 2) ? v.w2
               : (w == 3) ? v.w3 : (w == 4) ? v.w4 : (w == 5) ? v.w5
               : (w == 6) ? v.w6 : v.w7;
      const lw = (w == 0) ? v.w7 : (w == 1) ? v.w0 : (w == 2) ? v.w1
               : (w == 3) ? v.w2 : (w == 4) ? v.w3 : (w == 5) ? v.w4
               : (w == 6) ? v.w5 : v.w6;
      const rw = (w == 0) ? v.w1 : (w == 1) ? v.w2 : (w == 2) ? v.w3
               : (w == 3) ? v.w4 : (w == 4) ? v.w5 : (w == 5) ? v.w6
               : (w == 6) ? v.w7 : v.w0;
      const L = mod(cw * 2.0 + Math.floor(lw / 32768.0), 65536.0);
      const R = Math.floor(cw / 2.0) + mod(rw, 2.0) * 32768.0;
      const B = s.orbit(16, {
        l: L, c: cw, r: R, acc: 0.0, p2: 1.0, chg: 0.0,
      }, (b) => {
        const lb = mod(b.l, 2.0);
        const cb = mod(b.c, 2.0);
        const rb = mod(b.r, 2.0);
        const pw = (1.0 + 15.0 * lb) * (1.0 + 3.0 * cb) * (1.0 + rb);
        const nb = mod(Math.floor(rule / pw), 2.0);
        return {
          l: Math.floor(b.l / 2.0),
          c: Math.floor(b.c / 2.0),
          r: Math.floor(b.r / 2.0),
          acc: b.acc + nb * b.p2,
          p2: b.p2 * 2.0,
          chg: b.chg + ((nb == cb) ? 0.0 : 1.0),
        };
      });
      return {
        n0: (w == 0) ? B.acc : u.n0,
        n1: (w == 1) ? B.acc : u.n1,
        n2: (w == 2) ? B.acc : u.n2,
        n3: (w == 3) ? B.acc : u.n3,
        n4: (w == 4) ? B.acc : u.n4,
        n5: (w == 5) ? B.acc : u.n5,
        n6: (w == 6) ? B.acc : u.n6,
        n7: (w == 7) ? B.acc : u.n7,
        chg: u.chg + B.chg,
      };
    });
    return {
      w0: NW.n0, w1: NW.n1, w2: NW.n2, w3: NW.n3,
      w4: NW.n4, w5: NW.n5, w6: NW.n6, w7: NW.n7,
      act: v.act + ((k < 32) ? NW.chg : 0.0),
      actN: v.actN + ((k < 32) ? 1.0 : 0.0),
      it: v.it + 1.0,
    };
  }, { until: (v) => v.it >= trow });

  // the drawn cell of the drawn row, dark cells declined
  const xwi = Math.floor(xcell / 16.0);
  const xbi = xcell - xwi * 16.0;
  const wsel = (xwi == 0.0) ? CA.w0 : (xwi == 1.0) ? CA.w1 : (xwi == 2.0) ? CA.w2
             : (xwi == 3.0) ? CA.w3 : (xwi == 4.0) ? CA.w4 : (xwi == 5.0) ? CA.w5
             : (xwi == 6.0) ? CA.w6 : CA.w7;
  const SH = s.orbit(16, { v: wsel, j: 0.0 },
    (a) => ({ v: Math.floor(a.v / 2.0), j: a.j + 1.0 }), { until: (a) => a.j >= xbi });
  if (mod(SH.v, 2.0) < 0.5) {
    return s.decline();
  }

  // the seat: the cell's low corner as an exact offset from the window
  // centre, the jitter after, in float, and the sheet hangs upside down
  const fox = s.u();
  const foy = s.u();
  const cellx = tlox + xcell * 512.0;
  const celly = tloy + trow * rowPitch;
  const seatx = (cellx - wcx + fox * 0.94 * 512.0) * km;
  const seaty = (celly - wcy + foy * 0.94 * rowPitch) * km;

  // activity per cell per sampled row, nothing for the stillborn and
  // about a half for the boiling, and it is the tile's whole colour
  const a = (CA.actN > 0.0) ? CA.act / (CA.actN * 128.0) : 0.0;
  const heat = clamp(a * 2.6, 0.0, 1.0);
  const base = pal(0.62 - 0.50 * heat * P.tint,
                   [0.46, 0.44, 0.50], [0.44, 0.42, 0.48],
                   [0.9, 0.85, 1.0], [0.10, 0.30, 0.55]);
  const col = stain(mul3(mul3(base, 0.45 + 1.3 * P.ink),
                         0.45 + P.flare * (0.25 + 1.5 * heat)),
                    (P.st - 0.5) * 2.2);
  const z = s.centered() * 0.02;

  return s.deposit({ xyz: [seatx, -seaty, z], col });
});
