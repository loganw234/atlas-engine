// Plate LXV Rule Thirty, as a positive. Every point of light re-lives
// the whole history: a seed row addressed from WORLD, then the rule
// itself, a row at a time, down to the row the point means to light.
// Rule 30 is computationally irreducible, so there is no shortcut to
// row t that does not run the t rows before it, and DEPTH prices that
// honesty in powers of two.
//
// THE CARRIED STATE IS A ROW OF BITS. The collatz idiom carries it:
// up to 512 cells ride as thirty-two exact small floats of sixteen
// cells each. Everything stays an exact integer under 2^24 on both
// evaluators, so the arithmetic here IS the shader's uint arithmetic,
// wrap included.
//
// THIS HEADER USED TO SAY "AND THE VOCABULARY HAS NO BITS", and the
// rule was written as arithmetic because of it: with l, c and r the
// three neighbours as zero or one, c OR r was the saturation
// min(c + 2r, 1) read off a sliding eighteen-bit window and l XOR that
// was l + o - 2lo, sixteen of them building the new chunk one cell at
// a time from its top down.
//
// The vocabulary has bits now (2026-08-24), and the rule is the rule:
// `l ^ (c | r)` on a whole chunk, three shifts and three logical
// operations for all sixteen cells at once. Integer operations carry
// no ULP latitude, so nothing here needs a det_ form and it is exact
// on every conforming implementation by definition.
//
// The two forms were proved the same function exhaustively - all
// 65,536 chunks at each of the four (below, above) corners, 262,144
// cases, zero disagreements - before the replacement was made, and
// the census confirmed it after: not one hash moved anywhere, on any
// card. 110.0s to 7.0s at the cpu rung.
//
// THE RING TURNS UNDER A FIXED HEAD. The shader wires each word's
// neighbours statically and pays a runtime select only at the ring's
// two ends. A positive cannot index a named field at all, so the
// register rotates by one chunk per step instead and the rule is
// written once, at the head. The ring's two ends ride as prev and
// first: the same two selects the shader pays, spelled differently.
//
// TWO RE-AUTHORINGS, both named rather than hidden.
//
// The seed row. The shader walks a chain of hashu from WORLD, and a
// point-independent hash chain is not in the vocabulary. s.vnoise read
// at whole integer coordinates is exactly one pinned hash of (index,
// WORLD) that draws nothing from the stream, which is what a seed row
// must be: the same row for every point, or the points are not living
// one history and the accumulation is not one object. At SEEDS 1,
// where the editions sit, the row is the single centre cell and the
// two agree exactly; above it the realisation differs and the law does
// not.
//
// The window. s.window holds the integer lattice with its rounding
// discipline, and this plate cannot reach it: the span it needs is
// built from CELLS, whose step is 32, and the emitter mints an integer
// lever only where the step is 1. So the lattice is written out here
// in floats, verbatim from the shader, and measured against the
// shader's integer arithmetic over all 30,096 lever settings the
// selected row and cell ranges agree at every one. docs/reports has
// the numbers and the two places where a float is not an int.
import { positive, lever, pal, stain, mul3, mod, bits } from "../core/measure.mjs";

export default positive("rule30_pos", {
  depth:   lever("DEPTH",   7,   17,  1,    8),
  magnify: lever("MAGNIFY", 0,   14,  0.25, 0),
  cells:   lever("CELLS",   128, 512, 32,   512),
  cols:    lever("COLUMNS", 1,   16,  1,    1),
  seeds:   lever("SEEDS",   1,   48,  1,    1),
  world:   lever("WORLD",   1,   64,  1,    1),
  ink:     lever("INK",     0,   1,   0.01, 0.5),
  st:      lever("STAIN",   0,   1,   0.01, 0.5),
  cam: { dist: 3.0, pitch: 0.22, tgtY: 0.0, rot: 0.0 },
  gain: 0.55, accent: "#e8c84a",
},
(P, s) => {
  // The sheet: COLUMNS columns of the one run, side by side. rowsT is
  // reached by doubling rather than by pow because it decides integers.
  // Rows per column, the last column's short tail and the colour band
  // all come off it, so a last-place error would move the whole sheet.
  const RT = s.orbit(P.depth, { v: 1.0 }, (a) => ({ v: a.v * 2.0 }));
  const rowsT = RT.v;
  const C = P.cells;
  const V = P.cols;
  const rpp = Math.floor((rowsT + V - 1.0) / V);
  const colW = (C + 24.0) * 1024.0;
  const WU = V * colW - 24576.0;
  const HU = rpp * 1024.0;

  // MAGNIFY is the site's loupe and the editions expose at 0, where
  // the window is the whole sheet. The dive lands on the freshest
  // chaos, the foot of the last column.
  const mag = Math.pow(2.0, P.magnify);
  const ctrx = Math.floor(WU / 2.0);
  const ctry = Math.floor(HU / 2.0);
  const heartx = (V - 1.0) * colW + Math.floor(C * 1024.0 / 2.0);
  const hearty = HU - Math.floor(HU / 8.0);
  const shrink = 1.0 - 1.0 / mag;
  const wcx = ctrx + Math.floor((heartx - ctrx) * shrink);
  const wcy = ctry + Math.floor((hearty - ctry) * shrink);
  const hwx = Math.floor(ctrx / mag);
  const hwy = Math.floor(ctry / mag);
  const winx = wcx - hwx;
  const winy = wcy - hwy;
  const winz = wcx + hwx;
  const winw = wcy + hwy;
  // plate units per lattice unit; the sheet fills a 2.6 by 3.0 frame
  const km = Math.min(2.6 / WU, 3.0 / HU) * mag;

  // Choose a visible cell uniformly over VISIBLE area, so brightness
  // stays a measure under the loupe: the columns are weighted by what
  // the window can see of each, and row and cell are uniform inside
  // it. Dead cells cull afterwards, which is what keeps the figure a
  // figure rather than a filled rectangle.
  const rlo = Math.max(0.0, Math.floor(winy / 1024.0));
  const rhi0 = Math.min(rpp - 1.0, Math.floor(winw / 1024.0));
  if (rhi0 < rlo) {
    return s.decline();
  }

  // the visible area, weighed once for the total and once again to
  // find the column the draw lands in: the shader keeps the sixteen
  // weights in an array and the vocabulary has none, so the weight is
  // said twice rather than stored
  const AC = s.orbit(16, { acc: 0.0 }, (v, c) => {
    const x0 = Math.max(winx, c * colW);
    const x1 = Math.min(winz, c * colW + C * 1024.0);
    const tmaxc = Math.min(rpp, rowsT - c * rpp);
    const rr = Math.min(rhi0, tmaxc - 1.0) - rlo + 1.0;
    const wt = (c < V && x1 > x0 && rr > 0.0)
      ? Math.floor((x1 - x0) / 1024.0) * rr : 0.0;
    return { acc: v.acc + wt };
  });
  if (AC.acc <= 0.0) {
    return s.decline();
  }
  const pick = Math.floor(s.u() * AC.acc);
  const CS = s.orbit(16, { run: 0.0, cidx: 0.0 }, (v, c) => {
    const x0 = Math.max(winx, c * colW);
    const x1 = Math.min(winz, c * colW + C * 1024.0);
    const tmaxc = Math.min(rpp, rowsT - c * rpp);
    const rr = Math.min(rhi0, tmaxc - 1.0) - rlo + 1.0;
    const wt = (c < V && x1 > x0 && rr > 0.0)
      ? Math.floor((x1 - x0) / 1024.0) * rr : 0.0;
    return {
      run: v.run + wt,
      cidx: (pick >= v.run && pick < v.run + wt && wt > 0.0) ? (c + 0.0) : v.cidx,
    };
  });
  const cidx = CS.cidx;

  const tmax = Math.min(rpp, rowsT - cidx * rpp);
  const rhi = Math.min(rhi0, tmax - 1.0);
  const tl = Math.min(rlo + Math.floor(s.u() * (rhi - rlo + 1.0)), rhi);
  const tt = cidx * rpp + tl;                  // absolute row of the run

  const xbase = cidx * colW;
  const k0 = Math.max(0.0, Math.floor((winx - xbase) / 1024.0));
  const k1 = Math.min(C - 1.0, Math.floor((winz - xbase) / 1024.0));
  if (k1 < k0) {
    return s.decline();
  }
  const x = Math.min(k0 + Math.floor(s.u() * (k1 - k0 + 1.0)), k1);

  // Before the cone meets itself round the ring the vacuum is dead for
  // certain, so that point culls without paying the toll at all.
  if (P.seeds == 1.0 && 2.0 * tt < C
      && (x < Math.floor(C / 2.0) - tt || x > Math.floor(C / 2.0) + tt)) {
    return s.decline();
  }

  // THE SEED ROW, addressed from WORLD and SEEDS alone, so every point
  // that walks to row t rebuilds the identical row t. The bit goes in
  // with an OR rather than an add: two seeds may hash to one cell, and
  // a cell is black or it is not.
  const S0 = s.orbit(48, {
    c0: 0.0,  c1: 0.0,  c2: 0.0,  c3: 0.0,  c4: 0.0,  c5: 0.0,  c6: 0.0,  c7: 0.0,
    c8: 0.0,  c9: 0.0,  c10: 0.0,  c11: 0.0,  c12: 0.0,  c13: 0.0,  c14: 0.0,  c15: 0.0,
    c16: 0.0,  c17: 0.0,  c18: 0.0,  c19: 0.0,  c20: 0.0,  c21: 0.0,  c22: 0.0,  c23: 0.0,
    c24: 0.0,  c25: 0.0,  c26: 0.0,  c27: 0.0,  c28: 0.0,  c29: 0.0,  c30: 0.0,  c31: 0.0,
    j: 0.0,
  }, (v, k) => {
    const h = s.vnoise(k + 1.0, P.world, 0x51ED) + 0.5;
    const sx = (k == 0) ? Math.floor(C / 2.0)
                        : Math.min(Math.floor(h * C), C - 1.0);
    const cj = Math.floor(sx / 16.0);
    const PW = s.orbit(16, { p: 1.0, i: 0.0 },
      (a) => ({ p: a.p * 2.0, i: a.i + 1.0 }),
      { until: (a) => a.i >= sx - cj * 16.0 });
    const pw = PW.p;
    return {
      c0: (cj == 0.0) ? v.c0 + pw * (1.0 - mod(Math.floor(v.c0 / pw), 2.0)) : v.c0,
      c1: (cj == 1.0) ? v.c1 + pw * (1.0 - mod(Math.floor(v.c1 / pw), 2.0)) : v.c1,
      c2: (cj == 2.0) ? v.c2 + pw * (1.0 - mod(Math.floor(v.c2 / pw), 2.0)) : v.c2,
      c3: (cj == 3.0) ? v.c3 + pw * (1.0 - mod(Math.floor(v.c3 / pw), 2.0)) : v.c3,
      c4: (cj == 4.0) ? v.c4 + pw * (1.0 - mod(Math.floor(v.c4 / pw), 2.0)) : v.c4,
      c5: (cj == 5.0) ? v.c5 + pw * (1.0 - mod(Math.floor(v.c5 / pw), 2.0)) : v.c5,
      c6: (cj == 6.0) ? v.c6 + pw * (1.0 - mod(Math.floor(v.c6 / pw), 2.0)) : v.c6,
      c7: (cj == 7.0) ? v.c7 + pw * (1.0 - mod(Math.floor(v.c7 / pw), 2.0)) : v.c7,
      c8: (cj == 8.0) ? v.c8 + pw * (1.0 - mod(Math.floor(v.c8 / pw), 2.0)) : v.c8,
      c9: (cj == 9.0) ? v.c9 + pw * (1.0 - mod(Math.floor(v.c9 / pw), 2.0)) : v.c9,
      c10: (cj == 10.0) ? v.c10 + pw * (1.0 - mod(Math.floor(v.c10 / pw), 2.0)) : v.c10,
      c11: (cj == 11.0) ? v.c11 + pw * (1.0 - mod(Math.floor(v.c11 / pw), 2.0)) : v.c11,
      c12: (cj == 12.0) ? v.c12 + pw * (1.0 - mod(Math.floor(v.c12 / pw), 2.0)) : v.c12,
      c13: (cj == 13.0) ? v.c13 + pw * (1.0 - mod(Math.floor(v.c13 / pw), 2.0)) : v.c13,
      c14: (cj == 14.0) ? v.c14 + pw * (1.0 - mod(Math.floor(v.c14 / pw), 2.0)) : v.c14,
      c15: (cj == 15.0) ? v.c15 + pw * (1.0 - mod(Math.floor(v.c15 / pw), 2.0)) : v.c15,
      c16: (cj == 16.0) ? v.c16 + pw * (1.0 - mod(Math.floor(v.c16 / pw), 2.0)) : v.c16,
      c17: (cj == 17.0) ? v.c17 + pw * (1.0 - mod(Math.floor(v.c17 / pw), 2.0)) : v.c17,
      c18: (cj == 18.0) ? v.c18 + pw * (1.0 - mod(Math.floor(v.c18 / pw), 2.0)) : v.c18,
      c19: (cj == 19.0) ? v.c19 + pw * (1.0 - mod(Math.floor(v.c19 / pw), 2.0)) : v.c19,
      c20: (cj == 20.0) ? v.c20 + pw * (1.0 - mod(Math.floor(v.c20 / pw), 2.0)) : v.c20,
      c21: (cj == 21.0) ? v.c21 + pw * (1.0 - mod(Math.floor(v.c21 / pw), 2.0)) : v.c21,
      c22: (cj == 22.0) ? v.c22 + pw * (1.0 - mod(Math.floor(v.c22 / pw), 2.0)) : v.c22,
      c23: (cj == 23.0) ? v.c23 + pw * (1.0 - mod(Math.floor(v.c23 / pw), 2.0)) : v.c23,
      c24: (cj == 24.0) ? v.c24 + pw * (1.0 - mod(Math.floor(v.c24 / pw), 2.0)) : v.c24,
      c25: (cj == 25.0) ? v.c25 + pw * (1.0 - mod(Math.floor(v.c25 / pw), 2.0)) : v.c25,
      c26: (cj == 26.0) ? v.c26 + pw * (1.0 - mod(Math.floor(v.c26 / pw), 2.0)) : v.c26,
      c27: (cj == 27.0) ? v.c27 + pw * (1.0 - mod(Math.floor(v.c27 / pw), 2.0)) : v.c27,
      c28: (cj == 28.0) ? v.c28 + pw * (1.0 - mod(Math.floor(v.c28 / pw), 2.0)) : v.c28,
      c29: (cj == 29.0) ? v.c29 + pw * (1.0 - mod(Math.floor(v.c29 / pw), 2.0)) : v.c29,
      c30: (cj == 30.0) ? v.c30 + pw * (1.0 - mod(Math.floor(v.c30 / pw), 2.0)) : v.c30,
      c31: (cj == 31.0) ? v.c31 + pw * (1.0 - mod(Math.floor(v.c31 / pw), 2.0)) : v.c31,
      j: v.j + 1.0,
    };
  }, { until: (v) => v.j >= P.seeds });

  // THE TOLL: tt applications of the rule, none of them skippable. The
  // register turns once per row under a fixed head, so the chunk at
  // the head always has its left neighbour in prev and its right in
  // the next field, and the ring closes on first at the last step.
  const last = Math.floor(C / 16.0) - 1.0;
  const R = s.orbit(131072, {
    c0: S0.c0,  c1: S0.c1,  c2: S0.c2,  c3: S0.c3,  c4: S0.c4,  c5: S0.c5,
    c6: S0.c6,  c7: S0.c7,  c8: S0.c8,  c9: S0.c9,  c10: S0.c10,  c11: S0.c11,
    c12: S0.c12,  c13: S0.c13,  c14: S0.c14,  c15: S0.c15,  c16: S0.c16,  c17: S0.c17,
    c18: S0.c18,  c19: S0.c19,  c20: S0.c20,  c21: S0.c21,  c22: S0.c22,  c23: S0.c23,
    c24: S0.c24,  c25: S0.c25,  c26: S0.c26,  c27: S0.c27,  c28: S0.c28,  c29: S0.c29,
    c30: S0.c30,  c31: S0.c31,
    j: 0.0,
  }, (v) => {
    const tail = (last == 0.0) ? v.c0 : (last == 1.0) ? v.c1 :
                (last == 2.0) ? v.c2 : (last == 3.0) ? v.c3 :
                (last == 4.0) ? v.c4 : (last == 5.0) ? v.c5 :
                (last == 6.0) ? v.c6 : (last == 7.0) ? v.c7 :
                (last == 8.0) ? v.c8 : (last == 9.0) ? v.c9 :
                (last == 10.0) ? v.c10 : (last == 11.0) ? v.c11 :
                (last == 12.0) ? v.c12 : (last == 13.0) ? v.c13 :
                (last == 14.0) ? v.c14 : (last == 15.0) ? v.c15 :
                (last == 16.0) ? v.c16 : (last == 17.0) ? v.c17 :
                (last == 18.0) ? v.c18 : (last == 19.0) ? v.c19 :
                (last == 20.0) ? v.c20 : (last == 21.0) ? v.c21 :
                (last == 22.0) ? v.c22 : (last == 23.0) ? v.c23 :
                (last == 24.0) ? v.c24 : (last == 25.0) ? v.c25 :
                (last == 26.0) ? v.c26 : (last == 27.0) ? v.c27 :
                (last == 28.0) ? v.c28 : (last == 29.0) ? v.c29 :
                (last == 30.0) ? v.c30 : (last == 31.0) ? v.c31 : 0.0;
    const M = s.orbit(32, {
      c0: v.c0,  c1: v.c1,  c2: v.c2,  c3: v.c3,  c4: v.c4,  c5: v.c5,
      c6: v.c6,  c7: v.c7,  c8: v.c8,  c9: v.c9,  c10: v.c10,  c11: v.c11,
      c12: v.c12,  c13: v.c13,  c14: v.c14,  c15: v.c15,  c16: v.c16,  c17: v.c17,
      c18: v.c18,  c19: v.c19,  c20: v.c20,  c21: v.c21,  c22: v.c22,  c23: v.c23,
      c24: v.c24,  c25: v.c25,  c26: v.c26,  c27: v.c27,  c28: v.c28,  c29: v.c29,
      c30: v.c30,  c31: v.c31,
      prev: tail, first: v.c0, k: 0.0,
    }, (w, k) => {
      const rr = (k == last) ? w.first : w.c1;
      // THE WHOLE CHUNK AT ONCE. Sixteen cells were sixteen steps of
      // an orbit because, as the header above says, the vocabulary had
      // no bits: `l XOR (c OR r)` was spelled `l + o - 2lo` and walked
      // one cell at a time down an eighteen-bit window.
      //
      // It has bits now. Rule 30 on a whole word is three shifts and
      // three logical operations, and it is the SAME FUNCTION - proved
      // exhaustively over all 65,536 chunks at each of the four
      // (below, above) corners, 262,144 cases, zero disagreements,
      // before this replaced anything.
      //
      //   l = C[k-1]   (the chunk shifted up, the cell below at bit 0)
      //   c = C[k]     (the chunk)
      //   r = C[k+1]   (the chunk shifted down, the cell above at 15)
      //
      // Integer operations carry no ULP latitude, so nothing here
      // needs a det_ form and the arithmetic is exact on every
      // conforming implementation by definition - measured across four
      // cards before the operators were added at all.
      //
      // AND THE ANTI-UNROLL WORRY GOES WITH THE LOOP. The `until` and
      // the bound written as 4096 existed because sixteen copies
      // inside a 32 inside a 131072 met NVIDIA's `too many
      // instructions`. There is no inner loop left to unroll.
      // named blw/wrd/abv and not P/W/N: P is the lever namespace and
      // shadowing it emits as `P used bare`, which reads like a
      // vocabulary gap rather than a name clash
      const blw = bits(w.prev) >> 15;       // the cell below the chunk
      const wrd = bits(w.c0);               // the chunk
      const abv = bits(rr) & 1;             // the cell above it
      const lw = ((wrd << 1) | blw) & 65535;
      const rw = (wrd >> 1) | (abv << 15);
      const nc = (lw ^ (wrd | rw)) & 65535;
      return {
        c0: (0.0 == last) ? nc : w.c1,  c1: (1.0 == last) ? nc : w.c2,
        c2: (2.0 == last) ? nc : w.c3,  c3: (3.0 == last) ? nc : w.c4,
        c4: (4.0 == last) ? nc : w.c5,  c5: (5.0 == last) ? nc : w.c6,
        c6: (6.0 == last) ? nc : w.c7,  c7: (7.0 == last) ? nc : w.c8,
        c8: (8.0 == last) ? nc : w.c9,  c9: (9.0 == last) ? nc : w.c10,
        c10: (10.0 == last) ? nc : w.c11,  c11: (11.0 == last) ? nc : w.c12,
        c12: (12.0 == last) ? nc : w.c13,  c13: (13.0 == last) ? nc : w.c14,
        c14: (14.0 == last) ? nc : w.c15,  c15: (15.0 == last) ? nc : w.c16,
        c16: (16.0 == last) ? nc : w.c17,  c17: (17.0 == last) ? nc : w.c18,
        c18: (18.0 == last) ? nc : w.c19,  c19: (19.0 == last) ? nc : w.c20,
        c20: (20.0 == last) ? nc : w.c21,  c21: (21.0 == last) ? nc : w.c22,
        c22: (22.0 == last) ? nc : w.c23,  c23: (23.0 == last) ? nc : w.c24,
        c24: (24.0 == last) ? nc : w.c25,  c25: (25.0 == last) ? nc : w.c26,
        c26: (26.0 == last) ? nc : w.c27,  c27: (27.0 == last) ? nc : w.c28,
        c28: (28.0 == last) ? nc : w.c29,  c29: (29.0 == last) ? nc : w.c30,
        c30: (30.0 == last) ? nc : w.c31,  c31: (31.0 == last) ? nc : 0.0,
        prev: w.c0, first: w.first, k: w.k + 1.0,
      };
    }, { until: (w) => w.k >= last + 1.0 });
    return {
      c0: M.c0,  c1: M.c1,  c2: M.c2,  c3: M.c3,  c4: M.c4,  c5: M.c5,
      c6: M.c6,  c7: M.c7,  c8: M.c8,  c9: M.c9,  c10: M.c10,  c11: M.c11,
      c12: M.c12,  c13: M.c13,  c14: M.c14,  c15: M.c15,  c16: M.c16,  c17: M.c17,
      c18: M.c18,  c19: M.c19,  c20: M.c20,  c21: M.c21,  c22: M.c22,  c23: M.c23,
      c24: M.c24,  c25: M.c25,  c26: M.c26,  c27: M.c27,  c28: M.c28,  c29: M.c29,
      c30: M.c30,  c31: M.c31,
      j: v.j + 1.0,
    };
  }, { until: (v) => v.j >= tt });

  // The cell, and its two shoulders for a whisper of texture. The head
  // visits all three in turn so the chunk select is written once: the
  // bits come out newest first, so the cell itself ends in b2.
  const xl = (x == 0.0) ? C - 1.0 : x - 1.0;
  const xr = (x == C - 1.0) ? 0.0 : x + 1.0;
  const TH = s.orbit(3, {
    i0: x, i1: xl, i2: xr, b0: 0.0, b1: 0.0, b2: 0.0,
  }, (v) => {
    const cj = Math.floor(v.i0 / 16.0);
    const sel = (cj == 0.0) ? R.c0 : (cj == 1.0) ? R.c1 : (cj == 2.0) ? R.c2 :
                (cj == 3.0) ? R.c3 : (cj == 4.0) ? R.c4 : (cj == 5.0) ? R.c5 :
                (cj == 6.0) ? R.c6 : (cj == 7.0) ? R.c7 : (cj == 8.0) ? R.c8 :
                (cj == 9.0) ? R.c9 : (cj == 10.0) ? R.c10 : (cj == 11.0) ? R.c11 :
                (cj == 12.0) ? R.c12 : (cj == 13.0) ? R.c13 :
                (cj == 14.0) ? R.c14 : (cj == 15.0) ? R.c15 :
                (cj == 16.0) ? R.c16 : (cj == 17.0) ? R.c17 :
                (cj == 18.0) ? R.c18 : (cj == 19.0) ? R.c19 :
                (cj == 20.0) ? R.c20 : (cj == 21.0) ? R.c21 :
                (cj == 22.0) ? R.c22 : (cj == 23.0) ? R.c23 :
                (cj == 24.0) ? R.c24 : (cj == 25.0) ? R.c25 :
                (cj == 26.0) ? R.c26 : (cj == 27.0) ? R.c27 :
                (cj == 28.0) ? R.c28 : (cj == 29.0) ? R.c29 :
                (cj == 30.0) ? R.c30 : (cj == 31.0) ? R.c31 : 0.0;
    const PB = s.orbit(16, { p: 1.0, i: 0.0 },
      (a) => ({ p: a.p * 2.0, i: a.i + 1.0 }),
      { until: (a) => a.i >= v.i0 - cj * 16.0 });
    return {
      i0: v.i1, i1: v.i2, i2: v.i0,
      b0: mod(Math.floor(sel / PB.p), 2.0), b1: v.b0, b2: v.b1,
    };
  });
  if (TH.b2 < 0.5) {
    return s.decline();
  }
  const nbh = TH.b1 * 2.0 + TH.b0;

  // Seat inside the cell square, exact to the lattice: the offset from
  // the window centre is taken before the one multiply into the frame.
  const fox = s.u();
  const foy = s.u();
  const seatx = ((xbase + x * 1024.0 - wcx) + fox * 1024.0 * 0.94) * km;
  const seaty = ((tl * 1024.0 - wcy) + foy * 1024.0 * 0.94) * km;

  const band = tt / rowsT;
  const tone = 0.55 + 0.45 * nbh / 3.0;
  return s.deposit({
    xyz: [seatx, -seaty, s.centered() * 0.02],
    col: stain(mul3(mul3(pal(0.12 + 0.10 * band + 0.06 * nbh,
                             [0.52, 0.46, 0.36], [0.46, 0.42, 0.34],
                             [1.0, 0.9, 0.65], [0.05, 0.18, 0.42]),
                         tone),
                    0.55 + 1.5 * P.ink),
               (P.st - 0.5) * 2.2),
  });
});
