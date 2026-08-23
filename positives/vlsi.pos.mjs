// Plate LXIII Very Large Scale Integration, as a positive. A die is a
// photograph: rectangles on a lattice of whole nanometres, stepped
// onto silicon. This one is 10.32 mm on a side, cut recursively by
// guillotine on the standard-cell row pitch into a pad ring, a cache
// and a floor of logic, and every cut, bus, cell, gate and contact
// hashes from its own address so that all points agree on the figure
// and no pass schedule can change the limit image.
//
// THE LATTICE RIDES IN FLOATS, AND IT COSTS NOTHING. The subset has
// no ints outside literals and loop indices, so the nanometre lattice
// is carried in exact small floats: every coordinate is a whole
// number below 10321920, and every intermediate below stays under
// 2^24, which f32 represents exactly. The plate's integer divisions
// are the only place that could have been lost, and they are not:
// over every integer from 0 to 10321920, floor(n / D) computed
// through a correctly rounded f32 divide agrees with the integer
// quotient for every divisor this plate uses (2, 5, 8, 25, 720, 1024,
// 1440, 1920, 2400, 5760, 11520, 17280, 51840) - zero mismatches,
// worst quotient error 6.0e-5 against a worst-case slack of 1/5760.
// So the window stays exact where the caption says it does.
//
// THE ADDRESS IS A LATTICE POINT, WHICH IS THE ONE RESTATEMENT. The
// shader keys its whole figure on a uint hash chain, fp = hashu(fp ^
// salt), and the subset has no uint, no bitwise operators and no
// hashu. It can address, though: s.vnoise read at WHOLE integer
// coordinates has both interpolation weights vanish and hands back
// the lattice corner hash itself, a pinned per-index value that draws
// nothing from the stream. So a node's address here IS a lattice
// point (ax, ay) in [0, 1024)^2, the root is drawn from MASK SET, a
// child is a fresh lattice point drawn from its parent and the side
// taken, and each of the shader's constant salts (fp ^ 77u, fp ^
// 0x1a2b3c4du, and the rest) becomes a constant offset on that point
// read at its own octave. Sub-addresses - a bank, a cell, a bitcell,
// a track - offset the node's point by their index times a multiplier
// coprime to 1024, which is injective over every index range this
// plate can produce, so no two children of one node ever share an
// address. That restates the law and draws a different member of the
// same ensemble: a different mask set of the same process.
//
// THE ENGINES. The plate builds its furniture vocabulary once and
// lets branches only fill in parameters, because D3D's compiler grows
// as the flattened program size to the 2.6. The positive keeps that
// architecture and extends it by one: vlsi_ringp, a function in the
// shader and therefore already single-sited there, becomes fmode 6, a
// ring REQUEST resolved at one call site beside the track engine. Its
// one draw is the last draw of every arm that asks for it, so hoisting
// it leaves the draw order exactly as the shader spends it.
import { positive, lever, mod, mix, clamp, fract } from "../core/measure.mjs";

export default positive("vlsi_pos", {
  depth:   lever("DEPTH",        2,    16,   1,    16),
  magnify: lever("MAGNIFY",      0,    14,   0.25, 0),
  mask:    lever("MASK SET",     1,    64,   1,    7),
  cache:   lever("CACHE",        0.15, 0.55, 0.01, 0.30),
  metals:  lever("METAL LAYERS", 3,    6,    1,    5),
  util:    lever("UTILIZATION",  0.40, 0.98, 0.01, 0.82),
  st:      lever("STAIN",        0,    1,    0.01, 0.35),
  fill:    lever("FILL",         0,    1,    0.01, 0.55),
  cam: { dist: 3.0, pitch: 0.30, tgtY: 0.0, rot: 0.0 },
  gain: 0.5, accent: "#f0b448",
},
(P, s) => {
  // the process, in whole nanometres: VROW 5760 the standard-cell row
  // pitch, VSITE 720 the poly gate pitch, VDIE 10321920 the die edge,
  // VPADB 184320 the pad band thirty-two rows deep, VCTR 5160960 the
  // die centre. They are written out at every use so that the reader
  // can weigh each one against the shader's line.
  const maxD   = Math.floor(P.depth + 0.5);
  const mag    = Math.pow(2.0, P.magnify);
  const maskNo = Math.floor(P.mask + 0.5);
  const cacheF = P.cache;
  const metals = Math.floor(P.metals + 0.5);
  const util   = P.util;
  const stAmt  = (P.st - 0.35) * 2.6;
  const fillL  = P.fill;

  // MAGNIFY is a window on the lattice, held in whole numbers. The
  // descent only walks nodes the window can see, so a deep dive
  // spends its whole budget inside the frame instead of on the die it
  // left.
  const hwin = Math.floor(5160960.0 / mag);
  const winx = 5160960.0 - hwin;
  const winy = 5160960.0 - hwin;
  const winz = 5160960.0 + hwin;
  const winw = 5160960.0 + hwin;
  const km   = mag * 2.5189112e-7;

  // depth drawn with the series' budget law, leaning deeper as the
  // window dives - the coarse furniture has left the frame by then.
  // s.depth cannot say it: its bias must be a literal and this one
  // rides MAGNIFY, so the same draw and the same power are written out.
  const bias = mix(0.72, 0.20, clamp(P.magnify / 14.0, 0.0, 1.0));
  const d = Math.floor(Math.pow(s.u(), bias) * maxD);

  // furniture requests: branches only fill these in; each engine runs
  // once, at the tail. fmode 0 cull, 1 wire, 2 fill, 3 dot, 4 seated,
  // 5 tracks, 6 ring request. Flags are floats because the subset has
  // no boolean literal to initialise one with.
  let fmode = 0.0;
  let fhz = 1.0;
  let fa0 = 0.0, fa1 = 0.0, fcc = 0.0, fw = 0.0;
  let flox = 0.0, floy = 0.0, fhix = 0.0, fhiy = 0.0;
  let fctx = 0.0, fcty = 0.0;
  let fax = 0.0, fay = 0.0;
  let fox = 0.0, foy = 0.0;
  let lay = 1.0;
  let glow = 1.0;
  // the brightness texture, addressed where a branch says so and
  // negative where the point's own stream should supply it
  let tex = -1.0;
  // the track engine: tN parallel runs at tPitch, occupancy addressed
  // from the salt point (tsx, tsy), optional trimmed runs, a via share
  // at the run ends
  let tBase = 0.0, tPitch = 1.0, tN = 1.0, tR0 = 0.0, tR1 = 0.0, tW = 0.0;
  let tLayA = 2.0, tLayB = 2.0, tTrim = 0.0;
  let tOcc = 1.0, tVia = 0.0;
  let tsx = 0.0, tsy = 0.0;
  // the ring request: a rectangle, an inward band width, and the four
  // sides tried in a rotation the point picks
  let rlox = 0.0, rloy = 0.0, rhix = 0.0, rhiy = 0.0, rwnm = 0.0;

  if (d == 0.0) {
    // ───── the die itself: seal, fiducials, the mask corner ─────
    const u0 = s.u();
    if (u0 < 0.52) {
      const outer = u0 < 0.38;
      const inset = outer ? 46080.0 : 69120.0;
      fmode = 6.0;
      rlox = inset; rloy = inset;
      rhix = 10321920.0 - inset; rhiy = 10321920.0 - inset;
      rwnm = outer ? 11520.0 : 5760.0;
      fw = rwnm;
      lay = outer ? Math.min(4.0, metals) : 1.0;
      glow = outer ? 1.1 : 1.0;
    } else if (u0 < 0.68) {
      // the stepper's alignment crosses, one per corner
      const ucn = s.u();
      const cnr = Math.floor(ucn * 4.0);
      const cc2x = (cnr == 1.0 || cnr == 3.0) ? (10321920.0 - 115200.0) : 115200.0;
      const cc2y = (cnr >= 2.0) ? (10321920.0 - 115200.0) : 115200.0;
      const uhz = s.u();
      fhz = (uhz < 0.5) ? 1.0 : 0.0;
      const m0 = (fhz > 0.5) ? cc2x : cc2y;
      fmode = 5.0;
      tBase = (fhz > 0.5) ? cc2y : cc2x;
      tN = 1.0;
      tR0 = m0 - 17280.0; tR1 = m0 + 17280.0; tW = 5760.0;
      tLayA = 0.0; tLayB = 0.0;
      // a standalone salt in the shader (uint(cnr)); here a reserved
      // lattice point, one per corner
      tsx = 300.0 + cnr; tsy = 301.0;
      glow = 1.2;
    } else {
      // the mask signs its corner in contact dots: P C 6 3. The four
      // 25-bit glyph masks are held as five 5-bit rows each, since a
      // 25-bit constant is past f32's exact range and a row is not.
      const ug = s.u();
      const g = Math.floor(ug * 4.0);
      const gx0 = 10075680.0 + g * 50400.0;
      const GLY = s.orbit(5, { on: 0.0, bx: 0.0, by: 0.0 }, () => {
        const ubx = s.u();
        const bx = Math.floor(ubx * 5.0);
        const uby = s.u();
        const by = Math.floor(uby * 5.0);
        const rw =
          (g == 0.0) ? ((by == 0.0) ? 30.0 : (by == 1.0) ? 17.0 : (by == 2.0) ? 30.0 : (by == 3.0) ? 16.0 : 16.0)
        : (g == 1.0) ? ((by == 0.0) ? 15.0 : (by == 1.0) ? 16.0 : (by == 2.0) ? 16.0 : (by == 3.0) ? 16.0 : 15.0)
        : (g == 2.0) ? ((by == 0.0) ? 14.0 : (by == 1.0) ? 16.0 : (by == 2.0) ? 30.0 : (by == 3.0) ? 17.0 : 14.0)
        :              ((by == 0.0) ? 30.0 : (by == 1.0) ?  1.0 : (by == 2.0) ? 14.0 : (by == 3.0) ?  1.0 : 30.0);
        const pw = (bx == 0.0) ? 16.0 : (bx == 1.0) ? 8.0 : (bx == 2.0) ? 4.0 : (bx == 3.0) ? 2.0 : 1.0;
        const bit = mod(Math.floor(rw / pw), 2.0);
        return { on: bit, bx: bx, by: by };
      }, { until: (v) => v.on > 0.5 });
      if (GLY.on > 0.5) {
        fmode = 3.0;
        fctx = gx0 + GLY.bx * 7200.0;
        fcty = 5040.0 + (4.0 - GLY.by) * 7200.0;
        fw = 2520.0;
      }
      lay = 8.0; glow = 1.3;
    }
  } else if (d == 1.0) {
    // ───── the pad ring: 85 pads a side, ESD teeth, ring buses ─────
    const usd = s.u();
    const sd2 = Math.floor(usd * 4.0);
    const u1 = s.u();
    const uk = s.u();
    const kp = Math.floor(uk * 85.0);
    const pc = 322560.0 + kp * 115200.0;
    if (u1 < 0.34) {
      // vlsi_smap folds a (along, across-from-edge) frame onto one of
      // the four sides; written out because it feeds two corners here
      const al0 = pc - 34560.0, ac0 = 57600.0;
      const al1 = pc + 34560.0, ac1 = 126720.0;
      const p0x = (sd2 == 0.0) ? al0 : (sd2 == 1.0) ? al0 : (sd2 == 2.0) ? ac0 : (10321920.0 - ac0);
      const p0y = (sd2 == 0.0) ? ac0 : (sd2 == 1.0) ? (10321920.0 - ac0) : al0;
      const p1x = (sd2 == 0.0) ? al1 : (sd2 == 1.0) ? al1 : (sd2 == 2.0) ? ac1 : (10321920.0 - ac1);
      const p1y = (sd2 == 0.0) ? ac1 : (sd2 == 1.0) ? (10321920.0 - ac1) : al1;
      fmode = 2.0;
      flox = Math.min(p0x, p1x); floy = Math.min(p0y, p1y);
      fhix = Math.max(p0x, p1x); fhiy = Math.max(p0y, p1y);
      lay = 6.0; glow = 1.35;
      tex = s.vnoise(sd2, kp, 23) + 0.5;
    } else if (u1 < 0.50) {
      const bl0 = pc - 40320.0, bc0 = 51840.0;
      const bl1 = pc + 40320.0, bc1 = 132480.0;
      const q0x = (sd2 == 0.0) ? bl0 : (sd2 == 1.0) ? bl0 : (sd2 == 2.0) ? bc0 : (10321920.0 - bc0);
      const q0y = (sd2 == 0.0) ? bc0 : (sd2 == 1.0) ? (10321920.0 - bc0) : bl0;
      const q1x = (sd2 == 0.0) ? bl1 : (sd2 == 1.0) ? bl1 : (sd2 == 2.0) ? bc1 : (10321920.0 - bc1);
      const q1y = (sd2 == 0.0) ? bc1 : (sd2 == 1.0) ? (10321920.0 - bc1) : bl1;
      fmode = 6.0;
      rlox = Math.min(q0x, q1x); rloy = Math.min(q0y, q1y);
      rhix = Math.max(q0x, q1x); rhiy = Math.max(q0y, q1y);
      rwnm = 5760.0; fw = 5760.0;
      lay = Math.min(5.0, metals);
    } else if (u1 < 0.76) {
      // the ESD farm behind each pad: a comb of contacts
      const ugi = s.u();
      const gi = Math.floor(ugi * 16.0);
      const ugj = s.u();
      const gj = Math.floor(ugj * 8.0);
      const eal = pc - 23040.0 + gi * 2880.0 + 1440.0;
      const eac = 138240.0 + gj * 2880.0 + 1440.0;
      fmode = 3.0;
      fctx = (sd2 == 0.0) ? eal : (sd2 == 1.0) ? eal : (sd2 == 2.0) ? eac : (10321920.0 - eac);
      fcty = (sd2 == 0.0) ? eac : (sd2 == 1.0) ? (10321920.0 - eac) : eal;
      fw = 1080.0;
      lay = 8.0; glow = 1.1;
    } else {
      // three supply rings run the whole side behind the pads
      const a2x = (sd2 == 0.0) ? 0.0 : (sd2 == 1.0) ? 0.0 : (sd2 == 2.0) ? 162720.0 : (10321920.0 - 162720.0);
      const a2y = (sd2 == 0.0) ? 162720.0 : (sd2 == 1.0) ? (10321920.0 - 162720.0) : 0.0;
      fmode = 5.0;
      fhz = (sd2 < 2.0) ? 1.0 : 0.0;
      tBase = (fhz > 0.5) ? a2y : a2x;
      tPitch = (sd2 == 0.0 || sd2 == 2.0) ? 8640.0 : -8640.0;
      tN = 3.0; tR0 = 230400.0; tR1 = 10091520.0; tW = 2880.0;
      tLayA = Math.min(5.0, metals); tLayB = Math.min(4.0, metals);
      tsx = 310.0 + sd2; tsy = 311.0;
      glow = 1.1;
    }
  } else {
    // ───── the floorplan: guillotine cuts on the row lattice ─────
    const budget = d - 2.0;
    // the root of the address chain is MASK SET's own lattice point
    const rt0 = s.vnoise(maskNo, 3.0, 1) + 0.5;
    const rt1 = s.vnoise(maskNo, 4.0, 2) + 0.5;
    const ax0 = Math.min(Math.floor(rt0 * 1024.0), 1023.0);
    const ay0 = Math.min(Math.floor(rt1 * 1024.0), 1023.0);

    // THE DESCENT IS THE ORBIT, and the shader's five breaks are one
    // stop code the until reads before each step, so the step that
    // stops is the step that freezes the state. 0 running, 1 the
    // grammar bottomed out (typ written, this node's cut never
    // computed), 2 the budget ran out here, 3 the window sees neither
    // child. typ: 0 mixed, 1 cache band, 2 sram cluster, 3 rows,
    // 4 datapath, 5 sram, 6 analog, 7 channel.
    const FP = s.orbit(14, {
      lox: 184320.0, loy: 184320.0, hix: 10137600.0, hiy: 10137600.0,
      ax: ax0, ay: ay0,
      typ: 0.0, lvl: 0.0, stop: 0.0,
      cutY: 0.0, cc: 0.0, chw: 0.0,
    }, (v) => {
      const w = v.hix - v.lox;
      const h = v.hiy - v.loy;
      const longSide = Math.max(w, h);
      // the node's three grammar draws and two cut draws, addressed
      // at its own lattice point under five distinct octaves
      const la0 = s.vnoise(v.ax, v.ay, 11) + 0.5;
      const la1 = s.vnoise(v.ax, v.ay, 12) + 0.5;
      const la3 = s.vnoise(v.ax, v.ay, 13) + 0.5;
      const ca0 = s.vnoise(v.ax, v.ay, 14) + 0.5;
      const ca1 = s.vnoise(v.ax, v.ay, 15) + 0.5;

      let nstop = 0.0;
      let ntyp = v.typ;
      let ncutY = v.cutY, ncc = v.cc, nchw = v.chw;
      let nlox = v.lox, nloy = v.loy, nhix = v.hix, nhiy = v.hiy;
      let nax = v.ax, nay = v.ay;
      let nlvl = v.lvl;

      // does the grammar bottom out here?
      if (v.typ == 2.0) {
        if (longSide <= 1105920.0) { ntyp = 5.0; nstop = 1.0; }
      } else if (v.typ == 0.0) {
        if (longSide <= 276480.0) {
          ntyp = (la0 < 0.56) ? 3.0 : (la0 < 0.72) ? 4.0 : (la0 < 0.84) ? 5.0
               : (la0 < 0.90) ? 6.0 : 7.0;
          nstop = 1.0;
        } else if (longSide <= 829440.0 && la1 < 0.09) {
          // a hard macro, early
          ntyp = (la3 < 0.6) ? 5.0 : 6.0;
          nstop = 1.0;
        }
      }

      if (nstop < 0.5) {
        // this node's cut is part of its identity: addressed, snapped
        // to the row lattice, computed before the budget is consulted
        // so a stopped point can light the channel the cut carries
        if (v.lvl == 0.0) {
          ncutY = 1.0;                      // the cache rides the top
          ncc = v.hiy - Math.floor(cacheF * h);
        } else if (v.typ == 1.0) {
          ncutY = 0.0;                      // the spine splits the halves
          ncc = Math.floor((v.lox + v.hix) / 2.0);
        } else {
          ncutY = (h > w) ? 1.0 : ((h == w && ca0 < 0.5) ? 1.0 : 0.0);
          const f = 0.34 + 0.32 * ca1;
          const span = (ncutY > 0.5) ? h : w;
          const foot = (ncutY > 0.5) ? v.loy : v.lox;
          ncc = foot + Math.floor(f * span);
        }
        ncc = Math.floor(ncc / 5760.0) * 5760.0;
        nchw = 5760.0 * ((v.lvl == 0.0) ? 4.0 : (v.lvl == 1.0) ? 3.0
                       : (v.lvl <= 3.0) ? 2.0 : 1.0);
        const e0 = (ncutY > 0.5) ? v.loy : v.lox;
        const e1 = (ncutY > 0.5) ? v.hiy : v.hix;
        ncc = clamp(ncc, e0 + 69120.0 + nchw, e1 - 69120.0 - nchw);

        if (v.lvl >= budget) {
          nstop = 2.0;
        } else {
          // descend one side, weighted by what the window can see
          const a1 = ncc - nchw;
          const b0 = ncc + nchw;
          const w0 = (ncutY > 0.5) ? winy : winx;
          const w1 = (ncutY > 0.5) ? winw : winz;
          const lA = Math.max(0.0, Math.min(a1, w1) - Math.max(e0, w0));
          const lB = Math.max(0.0, Math.min(e1, w1) - Math.max(b0, w0));
          if (lA + lB == 0.0) {
            nstop = 3.0;
          } else {
            const usd2 = s.u();
            const sideA = lA > usd2 * (lA + lB);
            if (ncutY > 0.5) {
              if (sideA) { nhiy = a1; } else { nloy = b0; }
            } else {
              if (sideA) { nhix = a1; } else { nlox = b0; }
            }
            if (v.lvl == 0.0) { ntyp = sideA ? 0.0 : 1.0; }
            if (v.typ == 1.0) { ntyp = 2.0; }
            // the child's address: a fresh lattice point drawn from
            // the parent's, the side taken shifting the key
            const sf = sideA ? 1.0 : 0.0;
            const cx = mod(v.ax + sf * 397.0, 1024.0);
            const cy = mod(v.ay + sf * 211.0, 1024.0);
            const ch0 = s.vnoise(cx, cy, 16) + 0.5;
            const ch1 = s.vnoise(cx, cy, 17) + 0.5;
            nax = Math.min(Math.floor(ch0 * 1024.0), 1023.0);
            nay = Math.min(Math.floor(ch1 * 1024.0), 1023.0);
            nlvl = v.lvl + 1.0;
          }
        }
      }
      return {
        lox: nlox, loy: nloy, hix: nhix, hiy: nhiy,
        ax: nax, ay: nay,
        typ: ntyp, lvl: nlvl, stop: nstop,
        cutY: ncutY, cc: ncc, chw: nchw,
      };
    }, { until: (v) => v.stop > 0.5 });

    const stopHere = FP.stop == 2.0;
    const dead = FP.stop == 3.0;
    const lox = FP.lox, loy = FP.loy, hix = FP.hix, hiy = FP.hiy;
    const ax = FP.ax, ay = FP.ay;
    const typ = FP.typ, lvl = FP.lvl, cutY = FP.cutY, cc = FP.cc, chw = FP.chw;
    const w = hix - lox;
    const h = hiy - loy;
    const r = stopHere ? -1.0 : Math.min(budget - lvl, 6.0);
    const uF = s.u();
    const tintW = mix(0.12, 0.40, fillL);

    if (dead) {
      // the window sees neither child: fmode stays 0 and the tail culls
      glow = glow * 1.0;
    } else if ((stopHere && uF < tintW) ||
               (!stopHere && r == 0.0 && uF < mix(0.30, 0.62, fillL))) {
      // a field tint: how the block photographs from above
      const tl = s.vnoise(ax, ay, 18) + 0.5;
      fmode = 2.0;
      flox = lox; floy = loy; fhix = hix; fhiy = hiy;
      lay = (typ == 2.0 || typ == 1.0 || typ == 5.0) ? 10.0
          : (typ == 6.0) ? 9.0
          : (tl < 0.30 && typ == 0.0) ? 9.0 : 11.0;
      glow = 0.24 + 0.40 * fillL;
      tex = s.vnoise(ax, ay, 24) + 0.5;
    } else if ((stopHere && uF < tintW + 0.12) || (!stopHere && r == 0.0)) {
      // the block's own ring: power at the interior nodes, a thin
      // boundary at the leaves
      const inset = stopHere ? 5760.0 : 0.0;
      fmode = 6.0;
      rlox = lox + inset; rloy = loy + inset;
      rhix = hix - inset; rhiy = hiy - inset;
      rwnm = stopHere ? 2880.0 : 1440.0;
      fw = rwnm;
      lay = stopHere ? Math.min(5.0, metals) : ((typ == 5.0) ? 3.0 : 1.0);
      glow = stopHere ? 1.05 : 0.9;
    } else if (stopHere && uF < tintW + 0.20) {
      // the clock's limb: centre toward a child centre, the hierarchy
      // distributing its own heartbeat
      const pcx = Math.floor((lox + hix) / 2.0);
      const pcy = Math.floor((loy + hiy) / 2.0);
      const t0 = (cutY > 0.5) ? loy : lox;
      const t1 = (cutY > 0.5) ? hiy : hix;
      const utg = s.u();
      const tgt = (utg < 0.5) ? Math.floor((t0 + cc - chw) / 2.0)
                              : Math.floor((cc + chw + t1) / 2.0);
      const c0 = (cutY > 0.5) ? pcy : pcx;
      fmode = 5.0;
      fhz = (cutY > 0.5) ? 0.0 : 1.0;
      tN = 1.0;
      tBase = (cutY > 0.5) ? pcx : pcy;
      tR0 = Math.min(c0, tgt); tR1 = Math.max(c0, tgt); tW = 1440.0;
      tLayA = Math.min(5.0, metals); tLayB = tLayA;
      tsx = mod(ax + 77.0, 1024.0); tsy = mod(ay + 177.0, 1024.0);
      glow = 1.35;
    } else if (stopHere) {
      // the wiring channel the cut carries: track counts written as
      // constant divisions so no integer-divide emulation is emitted
      const pitch = (lvl <= 1.0) ? 11520.0 : (lvl <= 3.0) ? 5760.0 : 1440.0;
      fmode = 5.0;
      fhz = cutY;
      tPitch = pitch;
      tN = (lvl <= 1.0) ? Math.floor((2.0 * chw) / 11520.0)
         : (lvl <= 3.0) ? Math.floor((2.0 * chw) / 5760.0)
         : Math.floor((2.0 * chw) / 1440.0);
      tBase = cc - chw + pitch * 0.5;
      tR0 = (cutY > 0.5) ? lox : loy;
      tR1 = (cutY > 0.5) ? hix : hiy;
      tW = pitch * 0.5;
      tLayA = (lvl <= 1.0) ? Math.min(5.0, metals)
            : (lvl <= 3.0) ? Math.min(4.0, metals) : 2.0;
      tLayB = (lvl <= 3.0) ? tLayA : 3.0;
      tOcc = util * 0.92; tTrim = 1.0; tVia = 0.14;
      tsx = ax; tsy = ay;
    } else if (typ == 3.0 || typ == 4.0) {
      // ───── rows of standard cells; a datapath repeats a slice ─────
      const dp = (typ == 4.0) ? 1.0 : 0.0;
      if (r == 1.0) {
        if (uF < 0.58) {
          // the supply rails: one bright line per row edge
          fmode = 5.0; fhz = 1.0;
          tBase = loy; tPitch = 5760.0;
          tN = Math.floor(h / 5760.0) + 1.0;
          tR0 = lox; tR1 = hix; tW = 720.0;
          tLayA = 1.0; tLayB = 1.0;
          tsx = mod(ax + 341.0, 1024.0); tsy = mod(ay + 455.0, 1024.0);
          glow = 1.3;
        } else {
          // the n-well: the top half of every other row
          const urr = s.u();
          const rr = Math.floor(urr * Math.floor(h / 5760.0));
          const y0 = loy + rr * 5760.0 + ((mod(rr, 2.0) == 0.0) ? 2880.0 : 0.0);
          fmode = 2.0;
          flox = lox; floy = y0; fhix = hix; fhiy = y0 + 2880.0;
          lay = 9.0; glow = 0.14 + 0.26 * fillL;
        }
      } else if (r == 2.0) {
        // over-the-cell routing: most of what a die shot shows
        const vert = uF < ((dp > 0.5) ? 0.80 : 0.55);
        fmode = 5.0;
        fhz = vert ? 0.0 : 1.0;
        tBase = (vert ? lox : loy) + 720.0;
        tPitch = 1440.0;
        tN = Math.floor((vert ? w : h) / 1440.0);
        tR0 = vert ? loy : lox;
        tR1 = vert ? hiy : hix;
        tW = 720.0;
        tLayA = vert ? 2.0 : 3.0; tLayB = tLayA;
        tOcc = util * (vert ? ((dp > 0.5) ? 0.95 : 0.60) : 0.45);
        tTrim = (dp > 0.5 && vert) ? 0.0 : 1.0;
        tVia = 0.12;
        if (vert) {
          tsx = mod(ax + 503.0, 1024.0); tsy = mod(ay + 87.0, 1024.0);
        } else {
          tsx = mod(ax + 61.0, 1024.0); tsy = mod(ay + 661.0, 1024.0);
        }
        glow = (dp > 0.5 && vert) ? 1.15 : 1.0;
      } else if (r >= 3.0) {
        // the device layer: gates, diffusion, straps and contacts share
        // one stage, so surplus depth pools its light down here. a
        // datapath hashes by position within the slice, so all slices
        // place the same cell - the regularity is honest
        const urr = s.u();
        const rr = Math.floor(urr * Math.floor(h / 5760.0));
        const usl = s.u();
        const sl = Math.floor(usl * Math.floor(w / 5760.0));
        const slm = mod(sl, 4.0);
        const slk = (dp > 0.5) ? slm : sl;
        // the cell's address: the node's lattice point offset by the
        // slice and the row, both multipliers coprime to 1024 and both
        // index ranges under 48, so the map is injective in this block
        const c2x = mod(ax + slk * 13.0, 1024.0);
        const c2y = mod(ay + rr * 29.0, 1024.0);
        const cfil = s.vnoise(c2x, c2y, 20) + 0.5;
        const cwid = s.vnoise(c2x, c2y, 21) + 0.5;
        const x0 = lox + sl * 5760.0;
        const y0 = loy + rr * 5760.0;
        if (cfil > util * 0.94) {
          fmode = 2.0;
          flox = x0; floy = y0; fhix = x0 + 5760.0; fhiy = y0 + 5760.0;
          lay = 11.0; glow = 0.10 + 0.18 * fillL;   // a filler cell
        } else {
          const ws = (2.0 + Math.floor(cwid * 3.0)) * 1440.0;
          const uc = s.u();
          if (uc < 0.34) {
            // the gates, with poly contacts at their feet
            fmode = 5.0; fhz = 0.0;
            tBase = x0 + 360.0; tPitch = 720.0;
            tN = Math.floor(ws / 720.0);
            tR0 = y0 + 480.0; tR1 = y0 + 5280.0; tW = 180.0;
            tLayA = 0.0; tLayB = 0.0; tVia = 0.22;
            tsx = c2x; tsy = c2y;
            glow = 1.05;
          } else if (uc < 0.56) {
            const uns = s.u();
            const nside = uns < 0.5;
            fmode = 2.0;
            flox = x0 + 240.0;
            floy = y0 + (nside ? 1080.0 : 3240.0);
            fhix = x0 + ws - 240.0;
            fhiy = y0 + (nside ? 2520.0 : 4680.0);
            lay = 7.0; glow = 0.55;
          } else {
            // metal-1 straps at the transistor rows, contacts at
            // their ends - the lattice's last word
            fmode = 5.0; fhz = 1.0;
            tBase = y0 + 1800.0; tPitch = 2160.0; tN = 2.0;
            tR0 = x0 + 240.0; tR1 = x0 + ws - 240.0; tW = 270.0;
            tLayA = 1.0; tLayB = 1.0; tVia = 0.34;
            tsx = mod(c2x + 91.0, 1024.0); tsy = mod(c2y + 191.0, 1024.0);
          }
        }
      }
    } else if (typ == 5.0) {
      // ───── sram: banks, bitlines, then the mirrored bitcell ─────
      // bank counts are powers of two so the bank width is a shift
      const bxs = (w >= 9953280.0) ? 3.0 : (w >= 4976640.0) ? 2.0 : (w >= 2488320.0) ? 1.0 : 0.0;
      const bys = (h >= 9953280.0) ? 3.0 : (h >= 4976640.0) ? 2.0 : (h >= 2488320.0) ? 1.0 : 0.0;
      const bxp = (bxs == 0.0) ? 1.0 : (bxs == 1.0) ? 2.0 : (bxs == 2.0) ? 4.0 : 8.0;
      const byp = (bys == 0.0) ? 1.0 : (bys == 1.0) ? 2.0 : (bys == 2.0) ? 4.0 : 8.0;
      const bw = Math.floor(w / bxp);
      const bh = Math.floor(h / byp);
      const ubi = s.u();
      const bi = Math.floor(ubi * bxp);
      const ubj = s.u();
      const bj = Math.floor(ubj * byp);
      const blox = lox + bi * bw;
      const bloy = loy + bj * bh;
      const bhix = blox + bw;
      const bhiy = bloy + bh;
      const ayb = bloy + 17280.0;
      // the bank's address: the node's point offset by the bank indices
      const bax = mod(ax + bi * 101.0, 1024.0);
      const bay = mod(ay + bj * 103.0, 1024.0);
      if (r == 1.0) {
        if (uF < 0.34) {
          // the sense band along the bank's foot
          fmode = 2.0;
          flox = blox; floy = bloy; fhix = bhix; fhiy = ayb;
          lay = 11.0; glow = 0.5;
          tex = s.vnoise(bax, bay, 22) + 0.5;
        } else if (uF < 0.62) {
          // the decoder spine up the middle: short wordline stubs
          const sx = Math.floor((blox + bhix) / 2.0);
          fmode = 5.0; fhz = 1.0;
          tBase = ayb + 720.0; tPitch = 1440.0;
          tN = Math.floor((bh - 17280.0) / 1440.0);
          tR0 = sx - 11520.0; tR1 = sx + 11520.0; tW = 480.0;
          tLayA = 0.0; tLayB = 0.0;
          tsx = mod(bax + 13.0, 1024.0); tsy = mod(bay + 113.0, 1024.0);
          glow = 0.9;
        } else {
          fmode = 6.0;
          rlox = blox; rloy = bloy; rhix = bhix; rhiy = bhiy;
          rwnm = 1440.0; fw = 1440.0;
          lay = 2.0;
        }
      } else if (r == 2.0) {
        // bitlines run the array; wordlines cross beneath them
        const bl = uF < 0.60;
        fmode = 5.0;
        fhz = bl ? 0.0 : 1.0;
        tBase = bl ? (blox + 1200.0) : (ayb + 960.0);
        tPitch = bl ? 2400.0 : 1920.0;
        tN = bl ? Math.floor(bw / 2400.0) : Math.floor((bhiy - ayb) / 1920.0);
        tR0 = bl ? ayb : blox;
        tR1 = bl ? bhiy : bhix;
        tW = bl ? 300.0 : 240.0;
        tLayA = bl ? 2.0 : 0.0; tLayB = tLayA;
        if (bl) {
          tsx = mod(bax + 3.0, 1024.0); tsy = mod(bay + 103.0, 1024.0);
        } else {
          tsx = mod(bax + 7.0, 1024.0); tsy = mod(bay + 107.0, 1024.0);
        }
        glow = bl ? 1.05 : 0.55;
      } else if (r >= 3.0) {
        // the bitcell, 2400 by 1920, mirrored with its neighbours
        // exactly as the mask mirrors them
        const uci = s.u();
        const ci = Math.floor(uci * Math.floor((bhix - blox) / 2400.0));
        const ucj = s.u();
        const cj = Math.floor(ucj * Math.floor((bhiy - ayb) / 1920.0));
        const cl0x = blox + ci * 2400.0;
        const cl0y = ayb + cj * 1920.0;
        const mx = mod(ci, 2.0) == 1.0;
        const my = mod(cj, 2.0) == 1.0;
        const uc2 = s.u();
        if (uc2 < 0.30) {
          // the gate pair: mirroring swaps the two lines, which is
          // the same pair, so the set needs no flip
          fmode = 5.0; fhz = 1.0; tPitch = 960.0; tN = 2.0;
          tBase = cl0y + 480.0;
          tR0 = cl0x + 240.0; tR1 = cl0x + 2160.0; tW = 180.0;
          tLayA = 0.0; tLayB = 0.0;
          tsx = mod(bax + ci * 7.0, 1024.0);
          tsy = mod(bay + cj * 11.0, 1024.0);
        } else if (uc2 < 0.60) {
          const ulx = s.u();
          const lx0 = (ulx < 0.5) ? 480.0 : 1500.0;
          const lx = mx ? (1980.0 - lx0) : lx0;
          fmode = 2.0;
          flox = cl0x + lx; floy = cl0y + 240.0;
          fhix = cl0x + lx + 420.0; fhiy = cl0y + 1680.0;
          lay = 7.0; glow = 0.6;
        } else {
          const ucx = s.u();
          const cx0 = (ucx < 0.5) ? 690.0 : 1710.0;
          const ucy = s.u();
          const cy0 = (ucy < 0.5) ? 480.0 : 1440.0;
          const cx2 = mx ? (2400.0 - cx0) : cx0;
          const cy2 = my ? (1920.0 - cy0) : cy0;
          fmode = 3.0;
          fctx = cl0x + cx2; fcty = cl0y + cy2; fw = 180.0;
          lay = 8.0; glow = 1.3;
        }
      }
    } else if (typ == 6.0 && r >= 1.0) {
      // ───── analog: the inductor, its capacitor, wide fingers ─────
      const c2x = Math.floor((lox + hix) / 2.0);
      const c2y = Math.floor((loy + hiy) / 2.0);
      const ro = Math.floor((Math.min(w, h) * 9.0) / 25.0);
      if (uF < 0.48) {
        // four octagonal turns spiralling inward: the one place on
        // the die that is not axis-aligned
        const uth = s.u();
        const th = uth * 25.13274;
        const k8 = Math.cos(mod(th, 0.7853982) - 0.3926991);
        const rr0 = (ro - th * ro * 0.0223) / k8;
        const uz1 = s.u();
        const uw1 = s.u();
        const v2 = 2.0 * uz1 - 1.0;
        const rr2 = rr0 + (Math.sign(v2) * Math.pow(Math.abs(v2), 0.35) * 0.5
                         + (uw1 - 0.5) * 0.3) * ro * 0.045;
        fmode = 4.0;
        fax = c2x; fay = c2y;
        fox = rr2 * Math.cos(th); foy = rr2 * Math.sin(th);
        lay = Math.min(5.0, metals); glow = 1.15;
        tex = s.vnoise(mod(ax + Math.floor(th * 8.0), 1024.0), ay, 25) + 0.5;
      } else if (uF < 0.72) {
        // the capacitor: a plate of plates
        const qx = c2x + 11520.0;
        const qy = c2y + 11520.0;
        const capS = Math.floor((Math.min(hix - qx, hiy - qy) - 5760.0) / 8.0);
        if (capS > 0.0) {
          const ugi = s.u();
          const gi = Math.floor(ugi * 8.0);
          const ugj = s.u();
          const gj = Math.floor(ugj * 8.0);
          fmode = 2.0;
          flox = qx + gi * capS; floy = qy + gj * capS;
          fhix = flox + Math.floor((capS * 3.0) / 5.0);
          fhiy = floy + Math.floor((capS * 3.0) / 5.0);
          lay = Math.min(4.0, metals); glow = 0.9;
        }
      } else {
        // wide transistors: poly fingers combed over one diffusion
        const f0x = lox + 11520.0;
        const f0y = loy + 11520.0;
        const fw2 = Math.floor(w / 2.0) - 17280.0;
        const fh2 = Math.floor(h / 2.0) - 17280.0;
        if (fw2 > 2880.0 && fh2 > 5760.0) {
          const ufg = s.u();
          if (ufg < 0.4) {
            fmode = 2.0;
            flox = f0x; floy = f0y; fhix = f0x + fw2; fhiy = f0y + fh2;
            lay = 7.0; glow = 0.5;
          } else {
            fmode = 5.0; fhz = 0.0;
            tBase = f0x + 720.0; tPitch = 1440.0;
            tN = Math.floor(fw2 / 1440.0);
            tR0 = f0y - 720.0; tR1 = f0y + fh2 + 720.0; tW = 240.0;
            tLayA = 0.0; tLayB = 0.0;
            tsx = mod(ax + 29.0, 1024.0); tsy = mod(ay + 129.0, 1024.0);
            glow = 1.05;
          }
        }
      }
    } else if (typ == 7.0 && r >= 1.0) {
      // ───── a routing channel wide enough to be its own block ─────
      const vert = h > w;
      fmode = 5.0;
      fhz = vert ? 0.0 : 1.0;
      tBase = (vert ? lox : loy) + 720.0;
      tPitch = 1440.0;
      tN = Math.floor((vert ? w : h) / 1440.0);
      tR0 = vert ? loy : lox;
      tR1 = vert ? hiy : hix;
      tW = 720.0; tLayA = 2.0; tLayB = 3.0;
      tOcc = util * 0.85; tTrim = 1.0; tVia = 0.12;
      tsx = ax; tsy = ay;
    }
  }

  // ───── the engines: each primitive has one call site ─────

  // the ring engine, vlsi_ringp: pick a visible side of a rectangle's
  // outline, band width rwnm inward, trying the four sides from a
  // rotation the point draws. Its draw is the last draw of every arm
  // that requests it, so standing here costs the order nothing.
  if (fmode == 6.0) {
    const usd3 = s.u();
    const side = Math.floor(usd3 * 4.0);
    const RG = s.orbit(4, { hz: 1.0, a0: 0.0, a1: 0.0, cc: 0.0, ok: 0.0 }, (v, k) => {
      const sd = mod(side + k, 4.0);
      const hz = (sd < 2.0) ? 1.0 : 0.0;
      const ec = (sd == 0.0) ? rloy : (sd == 1.0) ? rhiy : (sd == 2.0) ? rlox : rhix;
      const bc = ec + ((sd == 0.0 || sd == 2.0) ? rwnm : -rwnm) * 0.5;
      const off = (hz > 0.5) ? ((bc < winy || bc > winw) ? 1.0 : 0.0)
                             : ((bc < winx || bc > winz) ? 1.0 : 0.0);
      let nok = 0.0, nhz = v.hz, na0 = v.a0, na1 = v.a1, ncc = v.cc;
      if (off < 0.5) {
        nok = 1.0; nhz = hz; ncc = bc;
        na0 = (hz > 0.5) ? rlox : rloy;
        na1 = (hz > 0.5) ? rhix : rhiy;
      }
      return { hz: nhz, a0: na0, a1: na1, cc: ncc, ok: nok };
    }, { until: (v) => v.ok > 0.5 });
    if (RG.ok > 0.5) {
      fmode = 1.0; fhz = RG.hz; fa0 = RG.a0; fa1 = RG.a1; fcc = RG.cc;
    } else {
      fmode = 0.0;
    }
  }

  // the track engine: pick an occupied track, trim its run, maybe seat
  // on a via. The track's occupancy is addressed from the salt point
  // offset by the track index, split across both lattice axes so that
  // even a seven-thousand-track channel indexes injectively.
  if (fmode == 5.0) {
    const TK = s.orbit(4, { j: 0.0, kx: 0.0, ky: 0.0, got: 0.0 }, () => {
      const uj = s.u();
      const jj = Math.floor(uj * tN);
      const jhi = Math.floor(jj / 1024.0);
      const jlo = jj - jhi * 1024.0;
      const kx = mod(tsx + jlo * 17.0, 1024.0);
      const ky = mod(tsy + jhi * 13.0, 1024.0);
      const occ = s.vnoise(kx, ky, 50) + 0.5;
      return { j: jj, kx: kx, ky: ky, got: (occ < tOcc) ? 1.0 : 0.0 };
    }, { until: (v) => v.got > 0.5 });
    if (TK.got > 0.5) {
      fcc = tBase + TK.j * tPitch;
      fa0 = tR0; fa1 = tR1;
      if (tTrim == 1.0) {
        const q0 = s.vnoise(TK.kx, TK.ky, 55) + 0.5;
        const q1 = s.vnoise(TK.kx, TK.ky, 56) + 0.5;
        const rl = fa1 - fa0;
        const cut0 = Math.floor(Math.floor(q0 * 0.5 * rl) / 5760.0) * 5760.0;
        const cut1 = Math.floor(Math.floor(q1 * 0.5 * rl) / 5760.0) * 5760.0;
        const r1b = fa1 - cut1;
        fa0 = fa0 + cut0;
        fa1 = Math.max(r1b, fa0 + 5760.0);
      }
      lay = (mod(TK.j, 2.0) == 0.0) ? tLayA : tLayB;
      tex = s.vnoise(TK.kx, TK.ky, 57) + 0.5;
      const uvia = s.u();
      if (uvia < tVia) {
        fmode = 3.0; fw = tW;
        const endv = (uvia < tVia * 0.5) ? fa0 : fa1;
        fctx = (fhz > 0.5) ? endv : fcc;
        fcty = (fhz > 0.5) ? fcc : endv;
        lay = 8.0; glow = glow * 1.2;
      } else {
        fmode = 1.0; fw = tW;
      }
    } else {
      fmode = 0.0;
    }
  }

  let hit = 0.0;
  if (fmode == 1.0) {
    // a wire: run clipped to the window, transverse seat bank-weighted
    const c0 = (fhz > 0.5) ? winx : winy;
    const c1 = (fhz > 0.5) ? winz : winw;
    fa0 = Math.max(fa0, c0);
    fa1 = Math.min(fa1, c1);
    if (fa1 > fa0) {
      const ua = s.u();
      const along = fa0 + Math.floor(ua * (fa1 - fa0));
      const uz2 = s.u();
      const uw2 = s.u();
      const vv = 2.0 * uz2 - 1.0;
      const bank = Math.sign(vv) * Math.pow(Math.abs(vv), 0.35) * 0.5;
      const across = (bank + (uw2 - 0.5) * 0.30) * fw;
      fax = (fhz > 0.5) ? along : fcc;
      fay = (fhz > 0.5) ? fcc : along;
      fox = (fhz > 0.5) ? 0.0 : across;
      foy = (fhz > 0.5) ? across : 0.0;
      hit = 1.0;
    }
  } else if (fmode == 2.0) {
    // a fill: uniform in the rectangle, clipped to the window first
    flox = Math.max(flox, winx); floy = Math.max(floy, winy);
    fhix = Math.min(fhix, winz); fhiy = Math.min(fhiy, winw);
    if (fhix > flox && fhiy > floy) {
      fax = flox; fay = floy;
      const uf1 = s.u();
      const uf2 = s.u();
      fox = uf1 * (fhix - flox);
      foy = uf2 * (fhiy - floy);
      hit = 1.0;
    }
  } else if (fmode == 3.0) {
    // a contact or via: a small square, filled edge to edge
    if (fctx > winx - fw && fctx < winz + fw &&
        fcty > winy - fw && fcty < winw + fw) {
      fax = fctx; fay = fcty;
      const uz3 = s.u();
      const uw3 = s.u();
      fox = (uz3 - 0.5) * (2.0 * fw) * 0.92;
      foy = (uw3 - 0.5) * (2.0 * fw) * 0.92;
      hit = 1.0;
    }
  } else if (fmode == 4.0) {
    hit = 1.0;                    // seated inline (the inductor)
  }

  if (hit < 0.5) {
    return s.decline();
  }

  // exact to the nanometre at any magnification: the whole-number
  // offset from centre is taken before the only scaling to plate units
  const seatx = ((fax - 5160960.0) + fox) * km;
  const seaty = ((fay - 5160960.0) + foy) * km;

  // the stack has height: each layer floats a little above the last,
  // so the die reads flat from afar and grows relief as the window dives
  const zl = Math.min(6.0e-6 * mag, 0.045);
  const zi = (lay == 0.0) ? 0.5 : (lay <= 6.0) ? lay
           : (lay == 7.0) ? 0.0 : (lay == 8.0) ? 0.8 : -0.6;
  const uzz = s.u();
  const z = (zi - 2.2) * zl + (uzz - 0.5) * zl * 0.6;

  // the brightness texture: addressed where the figure said so, and
  // the point's own draw otherwise. The draw is unconditional because
  // it is the last thing in the walk and nothing downstream reads the
  // stream again.
  const utex = s.u();
  const texv = (tex < 0.0) ? utex : tex;
  const brt = 0.72 + 0.56 * texv;

  // false colour by layer, the way a die shot's interference stains
  // them: poly, five metals, bond pad, diffusion, contact, field and
  // well, array field, cell field
  const clr = (lay == 0.0) ? 0.95 : (lay == 1.0) ? 1.00 : (lay == 2.0) ? 0.35
            : (lay == 3.0) ? 0.16 : (lay == 4.0) ? 0.82 : (lay == 5.0) ? 0.45
            : (lay == 6.0) ? 1.00 : (lay == 7.0) ? 0.55 : (lay == 8.0) ? 1.00
            : (lay == 9.0) ? 0.10 : (lay == 10.0) ? 0.35 : 0.65;
  const clg = (lay == 0.0) ? 0.50 : (lay == 1.0) ? 0.72 : (lay == 2.0) ? 0.90
            : (lay == 3.0) ? 0.72 : (lay == 4.0) ? 0.16 : (lay == 5.0) ? 0.58
            : (lay == 6.0) ? 0.85 : (lay == 7.0) ? 0.16 : (lay == 8.0) ? 0.88
            : (lay == 9.0) ? 0.16 : (lay == 10.0) ? 0.09 : 0.42;
  const clb = (lay == 0.0) ? 0.10 : (lay == 1.0) ? 0.22 : (lay == 2.0) ? 0.38
            : (lay == 3.0) ? 0.62 : (lay == 4.0) ? 0.22 : (lay == 5.0) ? 1.00
            : (lay == 6.0) ? 0.45 : (lay == 7.0) ? 0.12 : (lay == 8.0) ? 0.55
            : (lay == 9.0) ? 0.42 : (lay == 10.0) ? 0.12 : 0.12;

  // STAIN turns the whole dielectric stack: a hue rotation about grey,
  // written componentwise because the clamp that follows it is
  // componentwise and the vocabulary's stain() answers as one vec3
  const csa = Math.cos(stAmt);
  const sna = Math.sin(stAmt);
  const kg = 0.57735027;
  const dkc = kg * (clr + clg + clb);
  const xr = kg * (clb - clg);
  const xg = kg * (clr - clb);
  const xb = kg * (clg - clr);
  const sr = clr * csa + xr * sna + kg * dkc * (1.0 - csa);
  const sg = clg * csa + xg * sna + kg * dkc * (1.0 - csa);
  const sb = clb * csa + xb * sna + kg * dkc * (1.0 - csa);
  const gb = glow * brt;

  return s.deposit({
    xyz: [seatx, seaty, z],
    col: [Math.max(sr * gb, 0.0), Math.max(sg * gb, 0.0), Math.max(sb * gb, 0.0)],
  });
});
