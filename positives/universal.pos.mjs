// Plate LXVII The Universal Rule, as a positive - Cook's proof drawn
// rather than cited. Rule 110 runs on an ether, a fourteen-cell
// vacuum that reproduces itself shifted four cells per step, and the
// gliders that travel against that background are what carries the
// computation. The ring is 448 cells, exactly 32 ether tiles, so the
// vacuum closes seamlessly; DEFECTS flips single cells of it and
// everything afterwards is the rule's own doing. The light is the
// vacuum subtracted: a cell whose surrounding fourteen-cell phrase
// matches no rotation of the tile burns as particle, ether displaced
// from the reference phase reads as domain and is tinted by its own
// measured displacement, and undisturbed fabric barely glows.
//
// THE ROW IS BITS AND ORBIT FIELDS ARE FLOATS. The shader keeps the
// ring in fourteen uint words and steps thirty-two cells at a time
// with shifts, ands and ors, which is the one thing the vocabulary
// cannot say: it has no bitwise operators, not even in its lexer. So
// the ring rides as thirty-two fourteen-bit words in exact small
// floats, the collatz idiom, and the word-parallel algebra becomes
// arithmetic on one cell at a time. The word IS the ether tile, which
// is why the seed row is a single constant repeated: the pure vacuum
// is 0x3b23 in every one of the thirty-two. Every intermediate stays
// under 2^17 - a tile is under 16384, the neighbourhood window that
// spans three tiles is under 65536, and the doubling that shifts it
// reaches 131070 - so both backends are exact, eight bits clear of
// f32's 2^24.
//
// THE RING IS WALKED RATHER THAN INDEXED. rulespace selects its word
// out of eight with a ternary chain; at thirty-two words that chain
// would cost ninety-six selects per word per row, and the row is
// stepped up to 32767 times. A ring does not need indexing: the
// register rotates one tile per inner step, the new tile enters at the
// tail, and after thirty-two steps it is back in alignment holding the
// next row. The two neighbours ride as `prev`, the tile just consumed,
// and `first`, the old tile zero the last step needs after its seat in
// the register has been overwritten. That is the standard in-place
// cyclic update.
//
// It is written as TWO loops rather than three - one flat walk of
// tiles that ticks a row counter when it wraps, and the fourteen cells
// inside it - because a driver's unroller reads the bounds it is
// shown, and nested bounds of 32 and 14 expanded into four hundred and
// forty-eight copies of the cell step and put the plate over NVIDIA's
// instruction ceiling. Both remedies are at the loops that caused it
// and both are commented where they sit.
//
// THE DEFECTS ARE ADDRESSED, NOT DRAWN. The shader folds a hash chain
// from WORLD, so every point that visits this sheet must find the same
// defects; a stream draw would give each point its own vacuum and
// there would be no automaton at all, only a fog. s.vnoise at whole
// lattice coordinates is that field, the corner hash itself, keyed by
// the defect's index and the WORLD lever. Its values are not the
// shader's chain and its law is.
import { positive, lever, pal, mul3, stain, mod } from "../core/measure.mjs";

export default positive("universal_pos", {
  depth:   lever("DEPTH",   7, 15, 1,    9),
  magnify: lever("MAGNIFY", 0, 14, 0.25, 0),
  defects: lever("DEFECTS", 0, 48, 1,    6),
  world:   lever("WORLD",   1, 64, 1,    1),
  fab:     lever("FABRIC",  0, 1,  0.01, 0.30),
  dom:     lever("DOMAINS", 0, 1,  0.01, 0.40),
  cols:    lever("COLUMNS", 1, 16, 1,    1),
  st:      lever("STAIN",   0, 1,  0.01, 0.5),
  cam: { dist: 3.0, pitch: 0.22, tgtY: 0.0, rot: 0.0 },
  gain: 0.55, accent: "#e09a6f",
},
(P, s) => {
  // rows of the run, 2^DEPTH, reached by doubling so the power is
  // exact rather than trusted to a transcendental
  const RT = s.orbit(P.depth, { n: 1.0 }, (v) => ({ n: v.n * 2.0 }));
  const rowsT = RT.n;

  // the sheet, COLUMNS columns of the one run laid side by side, with
  // a twenty-one cell gutter between them. Every quantity here is a
  // whole number of lattice units and every division is by a power of
  // two, so the floors are exact.
  const V = Math.floor(P.cols + 0.5);
  const rpp = Math.floor((rowsT + V - 1.0) / V);
  const colW = (448.0 + 21.0) * 1024.0;
  const WU = V * colW - 21.0 * 1024.0;
  const HU = rpp * 1024.0;
  const ctrx = Math.floor(WU / 2.0);
  const ctry = Math.floor(HU / 2.0);

  // MAGNIFY is the site's loupe and the editions expose it at zero.
  // The dive lands on the freshest rows, the foot of the last column.
  const heartx = (V - 1.0) * colW + Math.floor((448.0 * 1024.0) / 2.0);
  const hearty = HU - Math.floor(HU / 8.0);
  const mag = Math.pow(2.0, P.magnify);
  const shrink = 1.0 - 1.0 / mag;
  const wcx = ctrx + Math.floor((heartx - ctrx) * shrink);
  const wcy = ctry + Math.floor((hearty - ctry) * shrink);
  const hwx = Math.floor(ctrx / mag);
  const hwy = Math.floor(ctry / mag);
  const winx = wcx - hwx;
  const winy = wcy - hwy;
  const winz = wcx + hwx;
  const winw = wcy + hwy;
  const km = Math.min(2.6 / WU, 3.0 / HU) * mag;

  // a visible cell, uniform over visible area, so that brightness
  // stays a measure: columns weighed by the area the window still
  // shows of them, then row and cell uniform inside the window
  const rlo = Math.max(0.0, Math.floor(winy / 1024.0));
  const rhi0 = Math.min(rpp - 1.0, Math.floor(winw / 1024.0));
  if (rhi0 < rlo) {
    return s.decline();
  }
  const WS = s.orbit(P.cols, { acc: 0.0 }, (v, k) => {
    const x0 = Math.max(winx, k * colW);
    const x1 = Math.min(winz, k * colW + 448.0 * 1024.0);
    const tmaxc = Math.min(rpp, rowsT - k * rpp);
    const rr = Math.min(rhi0, tmaxc - 1.0) - rlo + 1.0;
    const wt = (x1 > x0 && rr > 0.0) ? Math.floor((x1 - x0) / 1024.0) * rr : 0.0;
    return { acc: v.acc + wt };
  });
  if (WS.acc <= 0.0) {
    return s.decline();
  }
  const pk = Math.floor(s.u() * WS.acc);
  const CI = s.orbit(P.cols, { run: 0.0, g: 0.0 }, (v, k) => {
    const x0 = Math.max(winx, k * colW);
    const x1 = Math.min(winz, k * colW + 448.0 * 1024.0);
    const tmaxc = Math.min(rpp, rowsT - k * rpp);
    const rr = Math.min(rhi0, tmaxc - 1.0) - rlo + 1.0;
    const wt = (x1 > x0 && rr > 0.0) ? Math.floor((x1 - x0) / 1024.0) * rr : 0.0;
    const nr = v.run + wt;
    return { run: nr, g: (pk >= v.run && pk < nr && wt > 0.0) ? (k + 0.0) : v.g };
  });
  const cidx = CI.g;

  const tmax = Math.min(rpp, rowsT - cidx * rpp);
  const rhi = Math.min(rhi0, tmax - 1.0);
  const tl = Math.min(rlo + Math.floor(s.u() * (rhi - rlo + 1.0)), rhi);
  const tabs = cidx * rpp + tl;

  const xbase = cidx * colW;
  const k0 = Math.max(0.0, Math.floor((winx - xbase) / 1024.0));
  const k1 = Math.min(448.0 - 1.0, Math.floor((winz - xbase) / 1024.0));
  if (k1 < k0) {
    return s.decline();
  }
  const xc = Math.min(k0 + Math.floor(s.u() * (k1 - k0 + 1.0)), k1);

  // THE SEED ROW: the pure vacuum, thirty-two copies of the ether
  // tile, then DEFECTS single cells flipped. The flip is an exclusive
  // or of one bit, so two defects on one cell cancel, exactly as the
  // shader's `row[w] ^= pb` does. The bit's place comes from doubling;
  // the tile it lands in is chosen by a ternary over the register, the
  // one place indexing is cheap because it happens once per defect.
  const ETHER = 0x3b23;
  const D = s.orbit(P.defects, {
    r0: ETHER, r1: ETHER, r2: ETHER, r3: ETHER, r4: ETHER, r5: ETHER,
    r6: ETHER, r7: ETHER, r8: ETHER, r9: ETHER, r10: ETHER, r11: ETHER,
    r12: ETHER, r13: ETHER, r14: ETHER, r15: ETHER, r16: ETHER, r17: ETHER,
    r18: ETHER, r19: ETHER, r20: ETHER, r21: ETHER, r22: ETHER, r23: ETHER,
    r24: ETHER, r25: ETHER, r26: ETHER, r27: ETHER, r28: ETHER, r29: ETHER,
    r30: ETHER, r31: ETHER,
  }, (v, d) => {
    const hd = s.vnoise(d, Math.floor(P.world + 0.5), 110) + 0.5;
    const px = Math.min(Math.floor(hd * 448.0), 448.0 - 1.0);
    const j = Math.floor(px / 14.0);
    const b = px - j * 14.0;
    const PW = s.orbit(14, { p: 1.0, i: 0.0 },
      (a) => ({ p: a.p * 2.0, i: a.i + 1.0 }), { until: (a) => a.i >= b });
    const cur = (j == 0.0) ? v.r0 : (j == 1.0) ? v.r1 : (j == 2.0) ? v.r2
              : (j == 3.0) ? v.r3 : (j == 4.0) ? v.r4 : (j == 5.0) ? v.r5
              : (j == 6.0) ? v.r6 : (j == 7.0) ? v.r7 : (j == 8.0) ? v.r8
              : (j == 9.0) ? v.r9 : (j == 10.0) ? v.r10 : (j == 11.0) ? v.r11
              : (j == 12.0) ? v.r12 : (j == 13.0) ? v.r13 : (j == 14.0) ? v.r14
              : (j == 15.0) ? v.r15 : (j == 16.0) ? v.r16 : (j == 17.0) ? v.r17
              : (j == 18.0) ? v.r18 : (j == 19.0) ? v.r19 : (j == 20.0) ? v.r20
              : (j == 21.0) ? v.r21 : (j == 22.0) ? v.r22 : (j == 23.0) ? v.r23
              : (j == 24.0) ? v.r24 : (j == 25.0) ? v.r25 : (j == 26.0) ? v.r26
              : (j == 27.0) ? v.r27 : (j == 28.0) ? v.r28 : (j == 29.0) ? v.r29
              : (j == 30.0) ? v.r30 : v.r31;
    const flip = (1.0 - 2.0 * mod(Math.floor(cur / PW.p), 2.0)) * PW.p;
    return {
      r0: (j == 0.0) ? v.r0 + flip : v.r0,
      r1: (j == 1.0) ? v.r1 + flip : v.r1,
      r2: (j == 2.0) ? v.r2 + flip : v.r2,
      r3: (j == 3.0) ? v.r3 + flip : v.r3,
      r4: (j == 4.0) ? v.r4 + flip : v.r4,
      r5: (j == 5.0) ? v.r5 + flip : v.r5,
      r6: (j == 6.0) ? v.r6 + flip : v.r6,
      r7: (j == 7.0) ? v.r7 + flip : v.r7,
      r8: (j == 8.0) ? v.r8 + flip : v.r8,
      r9: (j == 9.0) ? v.r9 + flip : v.r9,
      r10: (j == 10.0) ? v.r10 + flip : v.r10,
      r11: (j == 11.0) ? v.r11 + flip : v.r11,
      r12: (j == 12.0) ? v.r12 + flip : v.r12,
      r13: (j == 13.0) ? v.r13 + flip : v.r13,
      r14: (j == 14.0) ? v.r14 + flip : v.r14,
      r15: (j == 15.0) ? v.r15 + flip : v.r15,
      r16: (j == 16.0) ? v.r16 + flip : v.r16,
      r17: (j == 17.0) ? v.r17 + flip : v.r17,
      r18: (j == 18.0) ? v.r18 + flip : v.r18,
      r19: (j == 19.0) ? v.r19 + flip : v.r19,
      r20: (j == 20.0) ? v.r20 + flip : v.r20,
      r21: (j == 21.0) ? v.r21 + flip : v.r21,
      r22: (j == 22.0) ? v.r22 + flip : v.r22,
      r23: (j == 23.0) ? v.r23 + flip : v.r23,
      r24: (j == 24.0) ? v.r24 + flip : v.r24,
      r25: (j == 25.0) ? v.r25 + flip : v.r25,
      r26: (j == 26.0) ? v.r26 + flip : v.r26,
      r27: (j == 27.0) ? v.r27 + flip : v.r27,
      r28: (j == 28.0) ? v.r28 + flip : v.r28,
      r29: (j == 29.0) ? v.r29 + flip : v.r29,
      r30: (j == 30.0) ? v.r30 + flip : v.r30,
      r31: (j == 31.0) ? v.r31 + flip : v.r31,
    };
  });

  // THE TOLL: tabs applications of rule 110, none of them skippable.
  // The orbit walks the ring one tile at a time and the inner one
  // walks that tile's fourteen cells from the top down, so
  // every divisor is a constant and the new tile accumulates by
  // doubling. The window W holds cell 14j-1 at bit 0, the tile at bits
  // 1 to 14 and cell 14j+14 at bit 15, which is the shader's
  // (cw << 1) | (lw >> 31) and (cw >> 1) | (rw << 31) said once
  // instead of twice. The law itself is the plate's line of boolean
  // algebra as a polynomial: (c or r) is c + r - cr, and the and-not
  // of all three is the factor 1 - lcr, both exact on bits.
  // ROWS AND TILES ARE ONE LOOP, and that is not tidiness - it is the
  // difference between a plate that links and one that does not.
  //
  // Written as rows containing tiles containing cells, the middle two
  // bounds are 32 and 14. Both sit under the driver's unroll threshold
  // and both get expanded, so the outer loop's body becomes 32 x 14 =
  // 448 copies of the cell step plus 32 copies of a thirty-four-field
  // register shuffle. NVIDIA's assembler stopped at 65,654
  // instructions: `too many instructions`, a hard ceiling and not a
  // clock. The plate could be emitted, smoke-tested and proved pinned,
  // and still not exist on a GPU.
  //
  // So the tile walk is FUSED into the row walk. One loop of a million
  // steps - far above any unroll threshold - advances the register by
  // exactly one tile and carries the tile phase in its own state, and
  // the row counter ticks only when that phase wraps. The body is now
  // one cell orbit and one shuffle, about a thirty-second of what it
  // was, and only the fourteen-cell orbit is left to unroll.
  //
  // The arithmetic is untouched. `prev` is the tile just consumed, and
  // at the wrap it must become the NEW row's last tile - the B.acc
  // this very step computed - because the register has by then rotated
  // into alignment and the next row reads its own tail. `first` is the
  // old tile zero the wrap step needs after its seat was overwritten,
  // and at the wrap it becomes the new tile zero, which is the r1 the
  // shift is about to move into r0. Getting either of those wrong
  // reproduces rule 110 faithfully for thirty-one tiles out of every
  // thirty-two, which is exactly the kind of fault that looks right.
  const O = s.orbit(1048576, {
    r0: D.r0, r1: D.r1, r2: D.r2, r3: D.r3, r4: D.r4, r5: D.r5,
    r6: D.r6, r7: D.r7, r8: D.r8, r9: D.r9, r10: D.r10, r11: D.r11,
    r12: D.r12, r13: D.r13, r14: D.r14, r15: D.r15, r16: D.r16, r17: D.r17,
    r18: D.r18, r19: D.r19, r20: D.r20, r21: D.r21, r22: D.r22, r23: D.r23,
    r24: D.r24, r25: D.r25, r26: D.r26, r27: D.r27, r28: D.r28, r29: D.r29,
    r30: D.r30, r31: D.r31, prev: D.r31, first: D.r0, ph: 0.0, n: 0.0,
  }, (v) => {
    const last = (v.ph == 31.0);
    const nx = last ? v.first : v.r1;
    const W = Math.floor(v.prev / 8192.0) + 2.0 * v.r0
            + 32768.0 * (nx - 2.0 * Math.floor(nx / 2.0));
    // FOURTEEN CELLS, WRITTEN AS FOUR THOUSAND AND NINETY-SIX, and
    // that is the second half of the same ceiling. The bound a driver
    // PRINTS is what its unroller reads: at 14 it expands the body
    // fourteen times inside a loop that runs a million, and NVIDIA's
    // assembler stops at `too many instructions` again - measured, by
    // raising this one number in the emitted text and re-linking. At
    // 4096 it declines to unroll and the plate links with the body
    // intact.
    //
    // So the count moves out of the bound and into the state, where it
    // is a float the compiler will not reason its way through, and the
    // orbit stops on it. Fourteen iterations either way: `until` is
    // checked before each step, i starts at zero, and the CPU
    // evaluator and the GPU walk the same fourteen. What changes is
    // only what the unroller is told, and the cost is one add and one
    // compare per cell.
    //
    // This rests on a HEURISTIC, not a guarantee, and it is measured
    // on these four columns rather than proved. If a driver ever
    // unrolls it anyway the failure is a link error at bake time, loud
    // and before any picture exists - which is the right way round.
    const B = s.orbit(4096, { v: W, acc: 0.0, i: 0.0 }, (b) => {
      const a = Math.floor(b.v / 16384.0);
      const rb = Math.floor(a / 2.0);
      const cb = a - 2.0 * rb;
      const lb = Math.floor(b.v / 8192.0) - 2.0 * a;
      return {
        v: 2.0 * b.v - 65536.0 * Math.floor((2.0 * b.v) / 65536.0),
        acc: b.acc * 2.0 + (cb + rb - cb * rb) * (1.0 - lb * cb * rb),
        i: b.i + 1.0,
      };
    }, { until: (b) => b.i >= 14.0 });
    return {
      r0: v.r1, r1: v.r2, r2: v.r3, r3: v.r4, r4: v.r5, r5: v.r6,
      r6: v.r7, r7: v.r8, r8: v.r9, r9: v.r10, r10: v.r11, r11: v.r12,
      r12: v.r13, r13: v.r14, r14: v.r15, r15: v.r16, r16: v.r17, r17: v.r18,
      r18: v.r19, r19: v.r20, r20: v.r21, r21: v.r22, r22: v.r23, r23: v.r24,
      r24: v.r25, r25: v.r26, r26: v.r27, r27: v.r28, r28: v.r29, r29: v.r30,
      r30: v.r31, r31: B.acc,
      prev: last ? B.acc : v.r0,
      first: last ? v.r1 : v.first,
      ph: last ? 0.0 : v.ph + 1.0,
      n: last ? v.n + 1.0 : v.n,
    };
  }, { until: (v) => v.n >= tabs });

  // THE SURROUNDING PHRASE: fourteen cells starting six to the left of
  // the drawn cell. Tiles are the ether's own fourteen, so the phrase
  // spans exactly two of them, and the shift is a power of two reached
  // by doubling. The drawn cell is bit six of that phrase, which is
  // the same bit the shader reads separately out of its word.
  const x0p = mod(xc - 6.0, 448.0);
  const jA = Math.floor(x0p / 14.0);
  const jB = mod(jA + 1.0, 32.0);
  const TA = (jA == 0.0) ? O.r0 : (jA == 1.0) ? O.r1 : (jA == 2.0) ? O.r2
           : (jA == 3.0) ? O.r3 : (jA == 4.0) ? O.r4 : (jA == 5.0) ? O.r5
           : (jA == 6.0) ? O.r6 : (jA == 7.0) ? O.r7 : (jA == 8.0) ? O.r8
           : (jA == 9.0) ? O.r9 : (jA == 10.0) ? O.r10 : (jA == 11.0) ? O.r11
           : (jA == 12.0) ? O.r12 : (jA == 13.0) ? O.r13 : (jA == 14.0) ? O.r14
           : (jA == 15.0) ? O.r15 : (jA == 16.0) ? O.r16 : (jA == 17.0) ? O.r17
           : (jA == 18.0) ? O.r18 : (jA == 19.0) ? O.r19 : (jA == 20.0) ? O.r20
           : (jA == 21.0) ? O.r21 : (jA == 22.0) ? O.r22 : (jA == 23.0) ? O.r23
           : (jA == 24.0) ? O.r24 : (jA == 25.0) ? O.r25 : (jA == 26.0) ? O.r26
           : (jA == 27.0) ? O.r27 : (jA == 28.0) ? O.r28 : (jA == 29.0) ? O.r29
           : (jA == 30.0) ? O.r30 : O.r31;
  const TB = (jB == 0.0) ? O.r0 : (jB == 1.0) ? O.r1 : (jB == 2.0) ? O.r2
           : (jB == 3.0) ? O.r3 : (jB == 4.0) ? O.r4 : (jB == 5.0) ? O.r5
           : (jB == 6.0) ? O.r6 : (jB == 7.0) ? O.r7 : (jB == 8.0) ? O.r8
           : (jB == 9.0) ? O.r9 : (jB == 10.0) ? O.r10 : (jB == 11.0) ? O.r11
           : (jB == 12.0) ? O.r12 : (jB == 13.0) ? O.r13 : (jB == 14.0) ? O.r14
           : (jB == 15.0) ? O.r15 : (jB == 16.0) ? O.r16 : (jB == 17.0) ? O.r17
           : (jB == 18.0) ? O.r18 : (jB == 19.0) ? O.r19 : (jB == 20.0) ? O.r20
           : (jB == 21.0) ? O.r21 : (jB == 22.0) ? O.r22 : (jB == 23.0) ? O.r23
           : (jB == 24.0) ? O.r24 : (jB == 25.0) ? O.r25 : (jB == 26.0) ? O.r26
           : (jB == 27.0) ? O.r27 : (jB == 28.0) ? O.r28 : (jB == 29.0) ? O.r29
           : (jB == 30.0) ? O.r30 : O.r31;
  const sh = x0p - jA * 14.0;
  const SP = s.orbit(14, { p: 1.0, i: 0.0 },
    (a) => ({ p: a.p * 2.0, i: a.i + 1.0 }), { until: (a) => a.i >= sh });
  const phrase = Math.floor(TA / SP.p)
               + (TB - SP.p * Math.floor(TB / SP.p)) * (16384.0 / SP.p);
  if (mod(Math.floor(phrase / 64.0), 2.0) < 0.5) {
    return s.decline();
  }

  // WHICH DISPLACEMENT OF THE VACUUM IS THIS, IF ANY. The phrase
  // matches offset o when it equals the tile rotated right by o, and
  // pure phase-zero ether at (t, x) matches x - 6 + 4t. The fourteen
  // rotations of 0x3b23 are all distinct, so the last match the loop
  // finds is the only one.
  const OM = s.orbit(14, { m: -1.0, rot: ETHER }, (v, o) => ({
    m: (phrase == v.rot) ? (o + 0.0) : v.m,
    rot: Math.floor(v.rot / 2.0) + mod(v.rot, 2.0) * 8192.0,
  }));
  const o0 = mod(xc - 6.0 + 4.0 * tabs, 14.0);

  let glow = 0.0;
  let hue = 0.0;
  if (OM.m < 0.0) {
    // particle: no displacement of the vacuum explains this cell
    glow = 2.1;
    hue = 0.06;
  } else {
    let delta = OM.m - o0;
    if (delta < 0.0) {
      delta = delta + 14.0;
    }
    if (delta == 0.0) {
      if (P.fab <= 0.003) {
        return s.decline();
      }
      glow = 0.16 * P.fab;
      hue = 0.62;
    } else {
      if (P.dom <= 0.003) {
        return s.decline();
      }
      // domain: tinted by its own measured displacement
      glow = 0.34 * P.dom;
      hue = 0.30 + 0.55 * delta / 14.0;
    }
  }

  // the seat inside the cell square, the integer offset from the
  // window centre taken before the jitter, and the sheet hangs upside
  // down so that row zero is the top
  const fox = s.u();
  const foy = s.u();
  const cellx = xbase + xc * 1024.0;
  const celly = tl * 1024.0;
  const seatx = (cellx - wcx + fox * 1024.0 * 0.94) * km;
  const seaty = (celly - wcy + foy * 1024.0 * 0.94) * km;
  const z = s.centered() * 0.02;

  return s.deposit({
    xyz: [seatx, -seaty, z],
    col: stain(mul3(pal(hue, [0.50, 0.44, 0.38], [0.48, 0.42, 0.40],
                        [1.0, 0.9, 0.7], [0.02, 0.22, 0.48]), glow),
               (P.st - 0.5) * 2.2),
  });
});
