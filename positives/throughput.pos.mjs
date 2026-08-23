// Plate LXIV Throughput, as a positive. A hundred-tile city grid with
// a two-column main bus down its middle, smelting on the west bank and
// assembly on the east, nuclear under the north cap, a corner office
// with the labs and the silo, rails on every seam and ore country
// outside the ring. Nothing here iterates: the plate is a survey of
// whole numbers, and a point's whole job is to choose an address in
// that survey and then take one seat inside whatever furniture the
// address names. So the walk is long rather than deep, and its length
// is the vocabulary of the city rather than any recursion.
//
// EVERYTHING IS AN INTEGER LATTICE, and that is the subject. A tile is
// 4096 units, a city block is 100 tiles, the map is 3200 tiles, a belt
// slot is a quarter tile. The shader carries all of it in int and
// ivec2; the subset has no float to int conversion outside s.pick and
// s.depth, so the positive carries the same numbers as floats and
// floors them. That is exact rather than approximate: every coordinate
// the plate can name is below 13,107,200, well inside the 16,777,216
// where a float32 still counts by ones, and every quotient the plate
// takes with integer division is reproduced by floor of a correctly
// rounded divide, which cannot round up past the integer because the
// divisor times the quotient is itself below that bound.
//
// THE WINDOW IS WRITTEN OUT rather than taken from s.window. The
// vocabulary's loupe computes exactly this arithmetic, but a window
// value exposes only seat(), and this plate reads its bounds about
// thirty times: every grid stage clips its INDEX range to what the
// frame can see, which is half of what MAGNIFY means here. Reaching
// the bounds through seat would have meant recovering them by
// division, and running the plate's formula twice invites the two
// copies to disagree. So the loupe is transcribed once, in floats, and
// the same four numbers do the clipping and the seating.
//
// THE HASHES ARE RE-KEYED, and this is the one thing in the file that
// is not verbatim. The shader addresses its city with hashu over
// packed uint keys: the block coordinate decides a district, the
// district TYPE stamps an interior, a lane index decides an item
// class, a slot address decides whether an item is there. None of that
// is stochastic texture the brief lets differ in value. Every point
// that lands on a block must agree about what that block is. The
// engine's one addressed field is s.vnoise, read at whole lattice
// coordinates where the interpolation weights are exactly zero and the
// value is the corner hash itself, so every one of those keys becomes
// a lattice site and an octave. The LAW is preserved exactly, the bits
// are not, and the report says what that costs.
import {
  positive, lever, stain, v2, v3, mix, clamp, mod, fract,
} from "../core/measure.mjs";

export default positive("throughput_pos", {
  depth:   lever("DEPTH",        2,   16,  1,    16),
  magnify: lever("MAGNIFY",      0,   14,  0.25, 0),
  world:   lever("WORLD",        1,   64,  1,    11),
  sci:     lever("SCIENCE",      0.2, 2.0, 0.05, 1.0),
  back:    lever("BACKPRESSURE", 0,   1,   0.01, 0.35),
  trn:     lever("TRAINS",       0,   1,   0.01, 0.55),
  night:   lever("NIGHT",        0,   1,   0.01, 0.65),
  st:      lever("STAIN",        0,   1,   0.01, 0.50),
  cam: { dist: 3.0, pitch: 0.22, tgtY: 0.0, rot: 0.0 },
  gain: 0.5, accent: "#5a86ff",
},
(P, s) => {
  // the survey, measured off a real blueprint book
  const FTL = 4096.0;                    // one tile
  const FBLK = 409600.0;                 // the hundred-tile city block
  const FDIE = 13107200.0;               // the map, 3200 tiles
  const FCTR = 6553600.0;                // map centre
  const FIT = 1024.0;                    // a belt slot, a quarter tile
  // the four quotients the shader takes with integer division, held as
  // constants so the truncation happens once where it can be read
  const FD32 = FDIE / 32.0;              // 409600, exact
  const FD12 = Math.floor(FDIE / 12.0);  // 1092266
  const FD30 = Math.floor(FDIE / 30.0);  // 436906
  const FD31 = Math.floor(FDIE / 31.0);  // 422806
  const FB2 = FBLK / 2.0;                // 204800, exact
  const FB3 = Math.floor(FBLK / 3.0);    // 136533

  const maxD = Math.floor(P.depth + 0.5);
  const mag = Math.pow(2.0, P.magnify);
  const wl = Math.floor(P.world + 0.5);
  const sci = P.sci;
  const back = P.back;
  const trn = P.trn;
  const night = P.night;
  const stn = (P.st - 0.50) * 2.2;

  // the city plan: how many blocks across and down the core runs,
  // hashed from WORLD and from nothing else, so one lever is one city
  const cw = 18.0 + Math.min(Math.floor((s.vnoise(0.0, wl, 1101) + 0.5) * 5.0), 4.0);
  const ch = 24.0 + Math.min(Math.floor((s.vnoise(0.0, wl, 1102) + 0.5) * 5.0), 4.0);
  const cwh = Math.floor(cw / 2.0);
  const chh = Math.floor(ch / 2.0);
  const cx0 = 16.0 - cwh;
  const cy0 = 16.0 - chh;
  const busL = cx0 + cwh - 1.0;          // two bus columns at centre
  const peak = cy0 + Math.floor(ch * 5.0 / 8.0);   // flow peaks south

  // the dive has a destination. Map centre is the road between the two
  // bus blocks, honest and empty, so as MAGNIFY deepens the window
  // pans into the thick of the bus. The centre is subtracted before
  // the scaling and the result truncated toward zero exactly as the
  // shader's int() does, which is why the negative arm is spelled out.
  const hw = Math.floor(FCTR / mag);
  const heartx = (busL + 1.0) * FBLK + 47.0 * FTL + FTL / 2.0;
  const hearty = peak * FBLK + 50.0 * FTL;
  const shrink = 1.0 - 1.0 / mag;
  const dhx = (heartx - FCTR) * shrink;
  const dhy = (hearty - FCTR) * shrink;
  const wcx = FCTR + Math.sign(dhx) * Math.floor(Math.abs(dhx));
  const wcy = FCTR + Math.sign(dhy) * Math.floor(Math.abs(dhy));
  const winx = wcx - hw, winy = wcy - hw;
  const winz = wcx + hw, winw = wcy + hw;
  const km = mag * 1.9836426e-7;         // plate units per map unit

  // the budget: how far into the city this point is allowed to look.
  // Deep magnification leans the exponent toward the fine strata,
  // since at that scale the coarse ones have nothing left to say.
  const bias = mix(0.72, 0.20, clamp(P.magnify / 14.0, 0.0, 1.0));
  const du = s.u();
  let d = Math.floor(Math.pow(Math.max(du, 1.0e-30), bias) * maxD);
  if (d > 8.0) {
    // fold spare depth back: mostly into the furniture and the flow,
    // one part in eight to the floor, which is most of any factory
    const fh = Math.min(Math.floor(s.u() * 8.0), 7.0);
    d = (fh > 6.5) ? 0.0 : 3.0 + mod(fh, 6.0);
  }

  // the furniture, as a small record the strata fill in and the
  // engines below read. Mode 0 culls, 1 is a wire, 2 a filled box,
  // 3 a disc, 4 a seat already placed, 5 a run of parallel ribbons.
  let fmode = 0.0;
  let fhz = 1.0;
  let fa0 = 0.0, fa1 = 0.0, fcc = 0.0, fw = 0.0;
  let flox = 0.0, floy = 0.0, fhix = 0.0, fhiy = 0.0;
  let fctx = 0.0, fcty = 0.0, frd = 0.0;
  let fax = 0.0, fay = 0.0;
  let fox = 0.0, foy = 0.0;
  let lay = 0.0;
  let glow = 1.0;
  let cr = 0.0, cg = 0.0, cb = 0.0;
  let tBase = 0.0, tPitch = 1.0, tN = 1.0;
  let tA0 = 0.0, tA1 = 0.0, tW = 0.0;
  let tOcc = 1.0, tDot = 0.0;
  let tHz = 0.0, tSalt = 0.0;

  // pick a block the window can see, uniform over the visible core.
  // The pair of draws is spent either way, so the stream stays in step
  // however the frame falls across the city.
  const b0x = Math.max(cx0, Math.floor(winx / FBLK));
  const b1x = Math.min(cx0 + cw - 1.0, Math.floor(winz / FBLK));
  const b0y = Math.max(cy0, Math.floor(winy / FBLK));
  const b1y = Math.min(cy0 + ch - 1.0, Math.floor(winw / FBLK));
  const coreVis = (b0x <= b1x) && (b0y <= b1y);
  const bux = s.u(), buy = s.u();
  let bx = b0x, by = b0y;
  if (coreVis) {
    bx = Math.min(b0x + Math.floor(bux * (b1x - b0x + 1.0)), b1x);
    by = Math.min(b0y + Math.floor(buy * (b1y - b0y + 1.0)), b1y);
  }
  const blox = bx * FBLK, bloy = by * FBLK;
  const lx = bx - cx0, ly = by - cy0;    // core-local block coordinates

  // the block's own lattice address, and a ten bit key folded off it
  // so a lane inside the block can be addressed without spending both
  // coordinates on the block itself
  const bkx = bx + 32.0 * by;
  const bkey = Math.min(Math.floor(1024.0 * (s.vnoise(bkx, wl, 1210) + 0.5)), 1023.0);

  // district: 0 rail ring, 1 station W, 2 smelt, 3 bus, 4 assembly,
  // 5 station E, 6 nuclear, 7 science and silo, 8 solar, 9 oil, 10 hub.
  // The four low bits of the block hash decide both banks, and the
  // shader reads them three ways off the one word, so the three tests
  // stay correlated here as well.
  const ring = (lx == 0.0) || (ly == 0.0) || (lx == cw - 1.0) || (ly == ch - 1.0);
  const dk = Math.min(Math.floor((s.vnoise(bkx, wl, 1201) + 0.5) * 16.0), 15.0);
  let typ = 4.0;
  if (ring) { typ = 0.0; }
  else if (lx == 1.0) { typ = 1.0; }
  else if (lx == cw - 2.0) { typ = 5.0; }
  else if (ly == 1.0) { typ = 6.0; }
  else if (lx == busL || lx == busL + 1.0) { typ = 3.0; }
  else if (ly <= 3.0 && lx >= cw - 6.0) { typ = 7.0; }
  else if (lx < busL) {
    // west bank: smelting country with company
    typ = (dk < 9.0) ? 2.0 : (dk < 12.0) ? 4.0 : (dk < 14.0) ? 10.0 : 8.0;
  } else {
    // east bank: assembly country, oil to the south
    if (ly >= ch - 8.0 && mod(dk, 4.0) < 0.5) { typ = 9.0; }
    else if (ly >= ch - 6.0 && mod(dk, 8.0) > 0.5 && mod(dk, 8.0) < 1.5) { typ = 8.0; }
    else { typ = (dk < 3.0) ? 10.0 : 4.0; }
  }

  // bus saturation, calibrated to the book's own belt census: the flow
  // is fullest a little south of centre and tapers both ways, and that
  // taper is the conservation law the whole plate is named for
  const tt = clamp(1.0 - Math.abs(by - peak) / (ch * 0.55), 0.0, 1.0);
  const sat = clamp((0.10 + 0.90 * tt * tt) * mix(0.7, 1.15, back) * sci, 0.04, 1.0);

  let u = s.u();

  if (d == 0.0) {
    // THE LAND: water, ore, spawner country at the rim. Magnified, the
    // rim is elsewhere, so the floor takes the ladder.
    u *= mix(1.0, 0.22, clamp(P.magnify / 8.0, 0.0, 1.0));
    if (u < 0.30) {
      // lakes: a few hashed pools, one lapping the core's southwest
      const k = Math.floor(s.u() * 4.0);
      const l1 = s.vnoise(k, wl, 1401) + 0.5;
      const l2 = s.vnoise(k, wl, 1402) + 0.5;
      const l3 = s.vnoise(k, wl, 1403) + 0.5;
      const l4 = s.vnoise(k, wl, 1404) + 0.5;
      let c2x = Math.min(Math.floor(l1 * 26.0), 25.0) * FD32 + FD12;
      let c2y = Math.min(Math.floor(l2 * 26.0), 25.0) * FD32 + FD12;
      if (k == 0.0) {
        c2x = cx0 * FBLK - FB2;
        c2y = (cy0 + ch) * FBLK - FBLK;
      }
      const rad = FBLK + Math.min(Math.floor(l3 * 7.0), 6.0) * FB3;
      const a = s.u() * 6.2831853;
      const rr = rad * (0.55 + 0.45 * s.u());
      const ph = Math.min(Math.floor(l4 * 9.0), 8.0);
      fox = c2x + Math.cos(a) * rr + Math.cos(a * 3.0 + ph) * rad * 0.18;
      foy = c2y + Math.sin(a) * rr + Math.sin(a * 2.0) * rad * 0.18;
      fmode = 4.0;
      fax = Math.sign(fox) * Math.floor(Math.abs(fox));
      fay = Math.sign(foy) * Math.floor(Math.abs(foy));
      lay = 1.0; glow = 0.5;
    } else if (u < 0.62) {
      // ore country: six patches sit under the six outposts, because a
      // mine digs where the ore is, and the rest lie wild and unworked
      const k = Math.floor(s.u() * 10.0);
      let c2x = 0.0, c2y = 0.0, okA = 0.0, okB = 0.0;
      if (k < 6.0) {
        const o1 = s.vnoise(k, wl, 1501) + 0.5;
        const o2 = s.vnoise(k, wl, 1502) + 0.5;
        okA = s.vnoise(k, wl, 1503) + 0.5;
        okB = s.vnoise(k, wl, 1504) + 0.5;
        const span = Math.max(ch - 4.0, 1.0);
        const west = mod(k, 2.0) < 0.5;
        const off = (3.0 + Math.min(Math.floor(o2 * 4.0), 3.0)) * FBLK;
        c2y = (cy0 + 2.0 + Math.min(Math.floor(o1 * span), span - 1.0)) * FBLK + FB2;
        c2x = west ? (cx0 * FBLK - off) : ((cx0 + cw) * FBLK + off);
      } else {
        const o1 = s.vnoise(k, wl, 1601) + 0.5;
        const o2 = s.vnoise(k, wl, 1602) + 0.5;
        okA = s.vnoise(k, wl, 1603) + 0.5;
        okB = s.vnoise(k, wl, 1604) + 0.5;
        c2x = Math.min(Math.floor(o1 * 29.0), 28.0) * FD30;
        c2y = Math.min(Math.floor(o2 * 29.0), 28.0) * FD30;
        const relx = c2x - FCTR, rely = c2y - FCTR;
        if (Math.abs(relx) < (cwh + 3.0) * FBLK && Math.abs(rely) < (chh + 3.0) * FBLK) {
          c2x = c2x + ((relx < 0.0) ? -1.0 : 1.0) * (cwh + 5.0) * FBLK;
        }
      }
      const a = s.u() * 6.2831853;
      const kind = Math.min(Math.floor(okA * 5.0), 4.0);
      const rr = Math.sqrt(s.u()) * FBLK * (0.5 + kind * 0.16);
      const asp = 0.7 + 0.006 * Math.min(Math.floor(okB * 64.0), 63.0);
      fox = c2x + Math.cos(a) * rr;
      foy = c2y + Math.sin(a) * rr * asp;
      fmode = 4.0;
      fax = Math.sign(fox) * Math.floor(Math.abs(fox));
      fay = Math.sign(foy) * Math.floor(Math.abs(foy));
      if (kind == 0.0) { cr = 0.45; cg = 0.55; cb = 0.72; }
      else if (kind == 1.0) { cr = 0.85; cg = 0.45; cb = 0.20; }
      else if (kind == 2.0) { cr = 0.22; cg = 0.22; cb = 0.26; }
      else if (kind == 3.0) { cr = 0.66; cg = 0.58; cb = 0.44; }
      else { cr = 0.35; cg = 0.90; cb = 0.25; }
      lay = -1.0; glow = (kind == 4.0) ? 1.6 : 0.9;
    } else if (u < 0.80) {
      // spawner country: nests and worm dots far from the wall-less core
      const k = Math.floor(s.u() * 12.0);
      const n1 = s.vnoise(k, wl, 1701) + 0.5;
      const n2 = s.vnoise(k, wl, 1702) + 0.5;
      let c2x = Math.min(Math.floor(n1 * 31.0), 30.0) * FD31;
      const c2y = Math.min(Math.floor(n2 * 31.0), 30.0) * FD31;
      const relx = c2x - FCTR;
      if (Math.abs(relx) < (cwh + 6.0) * FBLK) {
        c2x = (relx < 0.0) ? (FBLK * 3.0) : (FDIE - FBLK * 3.0);
      }
      const m = Math.floor(s.u() * 8.0);
      const mi = k * 8.0 + m;
      const m1 = s.vnoise(mi, wl, 1703) + 0.5;
      const m2 = s.vnoise(mi, wl, 1704) + 0.5;
      const m3 = s.vnoise(mi, wl, 1705) + 0.5;
      fctx = c2x + Math.min(Math.floor(m1 * 20481.0), 20480.0) - 10240.0;
      fcty = c2y + Math.min(Math.floor(m2 * 20481.0), 20480.0) - 10240.0;
      fmode = 3.0;
      frd = 1600.0 + Math.min(Math.floor(m3 * 2400.0), 2399.0);
      cr = 0.78; cg = 0.36; cb = 0.30;
      lay = -1.0; glow = 0.85;
    } else {
      // ground grain inside the core: concrete pale, grass dark
      if (!coreVis) { fmode = 0.0; }
      else {
        const g0x = Math.max(blox, winx), g0y = Math.max(bloy, winy);
        const g1x = Math.min(blox + FBLK, winz), g1y = Math.min(bloy + FBLK, winw);
        const ju = s.u(), jw = s.u();
        fctx = g0x + Math.floor(ju * (g1x - g0x));
        fcty = g0y + Math.floor(jw * (g1y - g0y));
        fmode = 3.0; frd = 220.0;
        const pvv = s.vnoise(bkx, wl, 1203) + 0.5;
        const pave = (typ == 3.0) || (typ == 7.0) || (pvv < 0.25);
        if (pave) { cr = 0.20; cg = 0.20; cb = 0.21; }
        else { cr = 0.07; cg = 0.10; cb = 0.07; }
        lay = -1.0; glow = mix(1.1, 0.5, night);
      }
    }
  } else if (d == 1.0) {
    // RAILS ON THE SEAMS, spurs, and trains where the hash parks them
    if (u < 0.55 && coreVis) {
      // the ring and every seam: double track three tiles either side
      // of the block edge, exactly the book's geometry
      const hu = s.u();
      const hz2 = (hu < 0.5) ? 1.0 : 0.0;
      const seam = ((hz2 > 0.5) ? by : bx) * FBLK + FBLK;
      const iu = s.u();
      const cc = seam + ((iu < 0.5) ? -3.0 : 3.0) * FTL;
      // the shader spells the ring test twice, once for each axis, and
      // the two spellings name the same set, which is the ring already
      const rv = s.vnoise(bkx, wl, 1202) + 0.5;
      const seamRail = ring || (rv < 0.25);
      if (!seamRail) { fmode = 0.0; }
      else {
        fmode = 1.0; fhz = hz2; fcc = cc; fw = 340.0;
        fa0 = ((hz2 > 0.5) ? bx : by) * FBLK;
        fa1 = fa0 + FBLK;
        lay = 2.0; glow = 1.25;
        const su = s.u();
        if (su < 0.30) {
          // sleepers: the two-tile tie cadence reads as rail at distance
          const along = fa0 + (Math.floor(s.u() * 50.0) * 2.0 + 1.0) * FTL;
          if (hz2 > 0.5) { fctx = along; fcty = cc; }
          else { fctx = cc; fcty = along; }
          fmode = 3.0; frd = 700.0; glow = 0.55;
        }
      }
    } else if (u < 0.75 && coreVis) {
      // a train: locomotive and four wagons, 28 tiles nose to tail
      const hu = s.u();
      const hz2 = (hu < 0.5) ? 1.0 : 0.0;
      const seam = ((hz2 > 0.5) ? by : bx) * FBLK + FBLK;
      const ta = (hz2 > 0.5) ? by : bx;
      const tb = (hz2 > 0.5) ? bx : by;
      const tix = ta * 32.0 + tb;
      const t1 = s.vnoise(tix, wl, 1801) + 0.5;
      if (t1 > trn * 0.55) { fmode = 0.0; }
      else {
        const t2 = s.vnoise(tix, wl, 1802) + 0.5;
        const t3 = s.vnoise(tix, wl, 1803) + 0.5;
        const nose = tb * FBLK + Math.min(Math.floor(t2 * 294912.0), 294911.0);
        const car = Math.floor(s.u() * 5.0);
        const a0 = nose + car * 7.0 * FTL;
        const a1 = a0 + 6.0 * FTL;
        const cc = seam + ((t3 < 0.5) ? -3.0 : 3.0) * FTL;
        if (hz2 > 0.5) {
          flox = a0; floy = cc - FTL; fhix = a1; fhiy = cc + FTL;
        } else {
          flox = cc - FTL; floy = a0; fhix = cc + FTL; fhiy = a1;
        }
        fmode = 2.0; lay = -1.0;
        if (car == 0.0) { cr = 1.0; cg = 0.78; cb = 0.30; }
        else { cr = 0.62; cg = 0.50; cb = 0.92; }
        glow = (car == 0.0) ? 1.2 : 0.8;
      }
    } else {
      // spur to a walled mining outpost, drills on the 3-and-4 pitch.
      // The outpost hash is the ore patch hash, so a mine stands over
      // its own ore rather than beside it.
      const k = Math.floor(s.u() * 6.0);
      const o1 = s.vnoise(k, wl, 1501) + 0.5;
      const o2 = s.vnoise(k, wl, 1502) + 0.5;
      const span = Math.max(ch - 4.0, 1.0);
      const oy = (cy0 + 2.0 + Math.min(Math.floor(o1 * span), span - 1.0)) * FBLK + FB2;
      const off = (3.0 + Math.min(Math.floor(o2 * 4.0), 3.0)) * FBLK;
      const west = mod(k, 2.0) < 0.5;
      const ox = west ? (cx0 * FBLK - off) : ((cx0 + cw) * FBLK + off);
      const uu = s.u();
      if (uu < 0.34) {
        // the spur itself, running from the ring out to the outpost
        fmode = 1.0; fhz = 1.0; fw = 340.0;
        fcc = oy + (west ? -3.0 : 3.0) * FTL;
        if (west) { fa0 = ox; fa1 = cx0 * FBLK; }
        else { fa0 = (cx0 + cw) * FBLK; fa1 = ox; }
        lay = 2.0; glow = 0.8;
      } else if (uu < 0.62) {
        // the outpost wall: a 113-tile ring of teeth
        const side = Math.floor(s.u() * 4.0);
        const hw2 = 56.0 * FTL;
        const hz3 = (side < 2.0) ? 1.0 : 0.0;
        const ec = (side == 0.0) ? (oy - hw2) : (side == 1.0) ? (oy + hw2)
                 : (side == 2.0) ? (ox - hw2) : (ox + hw2);
        const anch = (hz3 > 0.5) ? ox : oy;
        fmode = 1.0; fhz = hz3; fcc = ec; fw = 900.0;
        fa0 = anch - hw2; fa1 = anch + hw2;
        lay = 9.0; glow = 0.7;
        const tu = s.u();
        if (tu < 0.22) {
          // a turret file every second tile, one row inside the wall
          const along = fa0 + 2.0 * FTL * Math.floor(s.u() * 56.0);
          if (hz3 > 0.5) {
            fctx = along; fcty = ec + ((side == 0.0) ? 3.0 : -3.0) * FTL;
          } else {
            fctx = ec + ((side == 2.0) ? 3.0 : -3.0) * FTL; fcty = along;
          }
          fmode = 3.0; frd = 800.0; lay = 10.0; glow = 1.4;
        }
      } else {
        // the drill field: three-tile drills in mirrored pairs
        const r = Math.floor(s.u() * 15.0);
        const c = Math.floor(s.u() * 16.0);
        const gx = ox - 27.0 * FTL + Math.floor(c / 2.0) * 7.0 * FTL + mod(c, 2.0) * 3.0 * FTL;
        const gy = oy - 22.0 * FTL + r * 3.0 * FTL;
        flox = gx; floy = gy; fhix = gx + 3.0 * FTL; fhiy = gy + 3.0 * FTL;
        fmode = 2.0; lay = -1.0;
        cr = 1.0; cg = 0.68; cb = 0.28; glow = 0.75;
      }
    }
  } else if (!coreVis) {
    fmode = 0.0;
  } else if (d == 2.0) {
    // BLOCK FURNITURE the whole city shares, whatever the district
    const rv = s.vnoise(bkx, wl, 1204) + 0.5;
    if (u < 0.30) {
      // the lamp ring: pairs riding the road, warm at night
      const side = Math.floor(s.u() * 4.0);
      const k = Math.floor(s.u() * 8.0);
      const acr = ((mod(side, 2.0) < 0.5) ? -1.0 : 1.0) * (13.0 * FTL / 2.0);
      const hz2 = (side < 2.0) ? 1.0 : 0.0;
      const base = ((hz2 > 0.5) ? bloy : blox)
                 + (((side == 0.0) || (side == 2.0)) ? 0.0 : FBLK);
      const along = ((hz2 > 0.5) ? blox : bloy) + (k * 25.0 + 5.0) * FTL / 2.0;
      if (hz2 > 0.5) { fctx = along; fcty = base + acr; }
      else { fctx = base + acr; fcty = along; }
      fmode = 3.0; frd = 300.0; lay = 8.0; glow = mix(0.25, 2.2, night);
    } else if (u < 0.52) {
      // big poles at the book's 30/10 cadence, wire implied by cadence
      const side = Math.floor(s.u() * 4.0);
      const k = Math.floor(s.u() * 6.0);
      const off = (k == 0.0) ? -5.0 : (k == 1.0) ? 5.0 : (k == 2.0) ? 35.0
                : (k == 3.0) ? 65.0 : (k == 4.0) ? 95.0 : 105.0;
      const hz2 = (side < 2.0) ? 1.0 : 0.0;
      const base = ((hz2 > 0.5) ? bloy : blox)
                 + (((side == 0.0) || (side == 2.0)) ? 0.0 : FBLK);
      const along = ((hz2 > 0.5) ? blox : bloy) + off * FTL;
      if (hz2 > 0.5) { fctx = along; fcty = base; }
      else { fctx = base; fcty = along; }
      fmode = 3.0; frd = 520.0; lay = 7.0; glow = 0.8;
    } else if (u < 0.72) {
      // roboports: a two by two at 25 and 75, coverage exactly tiling
      const k = Math.floor(s.u() * 4.0);
      fctx = blox + ((mod(k, 2.0) < 0.5) ? 25.0 : 75.0) * FTL;
      fcty = bloy + ((k < 2.0) ? 25.0 : 75.0) * FTL;
      fmode = 3.0; frd = 1500.0; lay = 13.0; glow = 0.85;
      const cu = s.u();
      if (cu < 0.5) { frd = 700.0; glow = 1.3; }   // the charging lights
    } else if (u < 0.80 && ((typ == 0.0) || (rv < 0.125))) {
      // one radar per road block, the book's corner habit
      const t10 = Math.floor(FTL / 10.0);
      fctx = blox + 925.0 * t10;
      fcty = bloy + 75.0 * t10;
      fmode = 3.0; frd = 1100.0; lay = 15.0; glow = 1.1;
    } else if (u < 0.92) {
      // medium poles inside production blocks on the 7-tile lattice
      if (typ == 3.0 || typ == 0.0) { fmode = 0.0; }
      else {
        const gx = Math.floor(s.u() * 14.0);
        const gy = Math.floor(s.u() * 14.0);
        fctx = blox + 3.0 * FTL + gx * 7.0 * FTL;
        fcty = bloy + 3.0 * FTL + gy * 7.0 * FTL;
        fmode = 3.0; frd = 260.0; lay = 7.0; glow = 0.65;
      }
    } else {
      // the operator's habit: PC64 written in lamps by the silo. Each
      // glyph is a sixteen bit row bundle and the bit is read by
      // dividing by its own power of two, which is exact.
      if (typ != 7.0) { fmode = 0.0; }
      else {
        const ch2 = Math.floor(s.u() * 4.0);
        const rows = (ch2 == 0.0) ? 32031.0 : (ch2 == 1.0) ? 10903.0
                   : (ch2 == 2.0) ? 25167.0 : 4415.0;   // 7D1F 2A97 624F 113F
        const rr2 = Math.floor(s.u() * 4.0);
        const cc2 = Math.floor(s.u() * 4.0);
        const p1 = (rr2 == 0.0) ? 1.0 : (rr2 == 1.0) ? 16.0
                 : (rr2 == 2.0) ? 256.0 : 4096.0;
        const p2 = (cc2 == 0.0) ? 1.0 : (cc2 == 1.0) ? 2.0
                 : (cc2 == 2.0) ? 4.0 : 8.0;
        const bit = mod(Math.floor(rows / (p1 * p2)), 2.0);
        if (bit < 0.5) { fmode = 0.0; }
        else {
          fctx = blox + 58.0 * FTL + ch2 * 6.0 * FTL + cc2 * FTL;
          fcty = bloy + 88.0 * FTL + rr2 * FTL;
          fmode = 3.0; frd = 240.0; lay = 8.0; glow = mix(0.3, 2.4, night);
        }
      }
    }
  } else if (d == 3.0) {
    // EACH DISTRICT'S PRIMARY FURNITURE, stamped from its type
    if (typ == 3.0) {
      // THE BUS: fourteen groups of four express lanes on a five-tile
      // pitch. The salt is global and the occupancy is the local
      // saturation, so the surviving groups are a nested set: lanes
      // die off away from the peak exactly as the belt census does,
      // and the taper is structure rather than shading.
      fmode = 5.0; tHz = 0.0;
      tBase = blox + 15.0 * FTL + 3.0 * FTL / 2.0;
      tPitch = 5.0 * FTL; tN = 14.0;
      tA0 = bloy + 4.0 * FTL; tA1 = bloy + FBLK - 4.0 * FTL;
      tW = 3.0 * FTL + FTL / 2.0;
      tOcc = clamp(sat * 1.35, 0.05, 1.0); tDot = 0.0;
      tSalt = 0.0; lay = 3.0; glow = 0.55 + 0.75 * sat;
    } else if (typ == 2.0) {
      // smelter: paired furnace rows on the measured 3-7-3 rhythm.
      // Both index ranges clip to the window while the index itself
      // stays absolute, so a furnace keeps its identity as the frame
      // crops it.
      const sb = bloy + 3.0 * FTL, sp = 10.0 * FTL;
      const sw0 = winy - 6.0 * FTL;
      const pi0 = (sw0 <= sb) ? 0.0 : Math.floor((sw0 - sb) / sp);
      const pi1 = (winw < sb) ? -1.0 : Math.min(9.0, Math.floor((winw - sb) / sp));
      const cnt = 2.0 + Math.floor(24.0 * Math.min(sci, 1.25));
      const nb = blox + 4.0 * FTL, np = 3.0 * FTL;
      const nw0 = winx - 3.0 * FTL;
      const ci0 = (nw0 <= nb) ? 0.0 : Math.floor((nw0 - nb) / np);
      const ci1 = (winz < nb) ? -1.0 : Math.min(cnt - 1.0, Math.floor((winz - nb) / np));
      if (pi0 > pi1 || ci0 > ci1) { fmode = 0.0; }
      else {
        const pr = pi0 + Math.floor(s.u() * (pi1 - pi0 + 1.0));
        const ru = s.u();
        const row = Math.min(pr, pi1) * 10.0 + ((ru < 0.5) ? 3.0 : 6.0);
        const cc2 = Math.min(ci0 + Math.floor(s.u() * (ci1 - ci0 + 1.0)), ci1);
        flox = blox + 4.0 * FTL + cc2 * 3.0 * FTL;
        floy = bloy + row * FTL;
        fhix = flox + 3.0 * FTL; fhiy = floy + 3.0 * FTL;
        fmode = 2.0; lay = -1.0;
        cr = 0.44; cg = 0.39; cb = 0.36; glow = 0.95;
        const mu = s.u();
        if (mu < 0.5) {
          // the mouth glows with the charge it is working
          fctx = flox + 3.0 * FTL / 2.0;
          fcty = floy + 3.0 * FTL / 2.0;
          fmode = 3.0; frd = 520.0; lay = 4.0;
          glow = mix(1.1, 2.3, night) * (0.4 + 0.6 * sat);
        }
      }
    } else if (typ == 4.0 || typ == 10.0) {
      // assembly: machine rows with working lights, hub blocks denser
      const sb = bloy + 5.0 * FTL, sp = 12.0 * FTL;
      const sw0 = winy - 3.0 * FTL;
      const pi0 = (sw0 <= sb) ? 0.0 : Math.floor((sw0 - sb) / sp);
      const pi1 = (winw < sb) ? -1.0 : Math.min(7.0, Math.floor((winw - sb) / sp));
      const cnt = 2.0 + Math.floor(20.0 * Math.min(sci, 1.25));
      const nb = blox + 5.0 * FTL, np = 4.0 * FTL;
      const nw0 = winx - 3.0 * FTL;
      const ci0 = (nw0 <= nb) ? 0.0 : Math.floor((nw0 - nb) / np);
      const ci1 = (winz < nb) ? -1.0 : Math.min(cnt - 1.0, Math.floor((winz - nb) / np));
      if (pi0 > pi1 || ci0 > ci1) { fmode = 0.0; }
      else {
        const pr = pi0 + Math.floor(s.u() * (pi1 - pi0 + 1.0));
        const row = 5.0 + Math.min(pr, pi1) * 12.0;
        const cc2 = Math.min(ci0 + Math.floor(s.u() * (ci1 - ci0 + 1.0)), ci1);
        flox = blox + 5.0 * FTL + cc2 * 4.0 * FTL;
        floy = bloy + row * FTL;
        fhix = flox + 3.0 * FTL; fhiy = floy + 3.0 * FTL;
        fmode = 2.0; lay = -1.0;
        cr = 0.24; cg = 0.44; cb = 0.42; glow = 1.1;
        const mu = s.u();
        if (mu < 0.35) {
          fctx = flox + 3.0 * FTL / 2.0;
          fcty = floy + 3.0 * FTL / 2.0;
          fmode = 3.0; frd = 380.0; lay = 5.0; glow = 1.8;
        }
        if (typ == 10.0) {
          // the hub's chest field, which only a hub block carries
          const hu = s.u();
          if (hu < 0.45) {
            fctx = blox + Math.floor(s.u() * 90.0 + 5.0) * FTL;
            fcty = bloy + Math.floor(s.u() * 20.0 + 75.0) * FTL;
            fmode = 3.0; frd = 300.0; lay = 13.0; glow = 1.0;
          }
        }
      }
    } else if (typ == 6.0) {
      // nuclear: reactor pair, heat cross, turbine banks
      const uu = s.u();
      if (uu < 0.22) {
        const ru = s.u();
        flox = blox + 45.0 * FTL + ((ru < 0.5) ? 0.0 : 5.0) * FTL;
        floy = bloy + 40.0 * FTL;
        fhix = flox + 5.0 * FTL; fhiy = floy + 5.0 * FTL;
        fmode = 2.0; lay = -1.0;
        cr = 0.30; cg = 0.85; cb = 0.45; glow = 1.8;
      } else if (uu < 0.50) {
        const hu = s.u();
        const hz2 = (hu < 0.5) ? 1.0 : 0.0;
        fmode = 1.0; fhz = hz2;
        fcc = ((hz2 > 0.5) ? (bloy + 42.0 * FTL) : (blox + 47.0 * FTL))
            + Math.floor(s.u() * 3.0) * FTL;
        fa0 = ((hz2 > 0.5) ? blox : bloy) + 8.0 * FTL;
        fa1 = fa0 + 84.0 * FTL;
        fw = 700.0; lay = 14.0; glow = 1.6;
      } else {
        fmode = 5.0; tHz = 1.0;
        tBase = bloy + 8.0 * FTL; tPitch = 4.0 * FTL; tN = 8.0;
        tA0 = blox + 8.0 * FTL; tA1 = blox + 92.0 * FTL;
        tW = 3.0 * FTL; tOcc = 0.85; tDot = 0.15;
        tSalt = 1.0; lay = 7.0; glow = 0.6;
      }
    } else if (typ == 7.0) {
      // the corner office: labs, the silo, the landing pad
      const pd = s.vnoise(bkx, wl, 1207) + 0.5;
      const uu = s.u();
      if (uu < 0.14 && (pd < 0.25)) {
        flox = blox + 60.0 * FTL; floy = bloy + 30.0 * FTL;
        fhix = flox + 9.0 * FTL; fhiy = floy + 9.0 * FTL;
        fmode = 2.0; lay = 15.0; glow = 1.5;
      } else if (uu < 0.6) {
        const r = Math.floor(s.u() * 6.0);
        const c = Math.floor(s.u() * 12.0);
        flox = blox + 5.0 * FTL + c * 4.0 * FTL;
        floy = bloy + 8.0 * FTL + r * 8.0 * FTL;
        fhix = flox + 3.0 * FTL; fhiy = floy + 3.0 * FTL;
        fmode = 2.0; lay = -1.0;
        cr = 0.34; cg = 0.15; cb = 0.26; glow = 0.8;
        const mu = s.u();
        if (mu < 0.4) {
          fctx = flox + 3.0 * FTL / 2.0;
          fcty = floy + 3.0 * FTL / 2.0;
          fmode = 3.0; frd = 420.0; lay = 6.0; glow = 1.5;
        }
      } else {
        fctx = blox + Math.floor(s.u() * 40.0 + 5.0) * FTL;
        fcty = bloy + Math.floor(s.u() * 18.0 + 76.0) * FTL;
        fmode = 3.0; frd = 300.0; lay = 13.0; glow = 0.95;
      }
    } else if (typ == 8.0) {
      // solar: the 7-lattice tiling, panels against accumulators 25:21
      const gp = 7.0 * FTL;
      const xw0 = winx - gp;
      const gi0 = (xw0 <= blox) ? 0.0 : Math.floor((xw0 - blox) / gp);
      const gi1 = (winz < blox) ? -1.0 : Math.min(13.0, Math.floor((winz - blox) / gp));
      const yw0 = winy - gp;
      const hi0 = (yw0 <= bloy) ? 0.0 : Math.floor((yw0 - bloy) / gp);
      const hi1 = (winw < bloy) ? -1.0 : Math.min(13.0, Math.floor((winw - bloy) / gp));
      if (gi0 > gi1 || hi0 > hi1) { fmode = 0.0; }
      else {
        const gx = gi0 + Math.min(Math.floor(s.u() * (gi1 - gi0 + 1.0)), gi1 - gi0);
        const gy = hi0 + Math.min(Math.floor(s.u() * (hi1 - hi0 + 1.0)), hi1 - hi0);
        const cix = blox + gx * gp + 3.0 * FTL / 2.0;
        const ciy = bloy + gy * gp + 3.0 * FTL / 2.0;
        const ci = gx * 14.0 + gy;
        const k1 = s.vnoise(ci, wl, 1310) + 0.5;
        const k2 = s.vnoise(ci, wl, 1311) + 0.5;
        const k3 = s.vnoise(ci, wl, 1312) + 0.5;
        const acc = k1 < 0.44;                     // eleven cells in twenty-five
        flox = cix + Math.min(Math.floor(k2 * 3.0), 2.0) * FTL;
        floy = ciy + Math.min(Math.floor(k3 * 3.0), 2.0) * FTL;
        const sz = acc ? (2.0 * FTL) : (3.0 * FTL);
        fhix = flox + sz; fhiy = floy + sz;
        fmode = 2.0; lay = -1.0;
        if (acc) { cr = 0.48; cg = 0.48; cb = 0.62; }
        else { cr = 0.32; cg = 0.30; cb = 0.60; }
        glow = acc ? 0.95 : mix(1.2, 0.7, night);
      }
    } else if (typ == 9.0) {
      // oil: refinery pentagons as five-tile bodies, tanks, pipe runs
      const uu = s.u();
      if (uu < 0.30) {
        const r = Math.floor(s.u() * 3.0);
        const c = Math.floor(s.u() * 6.0);
        flox = blox + 6.0 * FTL + c * 8.0 * FTL;
        floy = bloy + 8.0 * FTL + r * 10.0 * FTL;
        fhix = flox + 5.0 * FTL; fhiy = floy + 5.0 * FTL;
        fmode = 2.0; lay = -1.0;
        cr = 0.42; cg = 0.32; cb = 0.55; glow = 0.85;
      } else if (uu < 0.55) {
        const r = Math.floor(s.u() * 2.0);
        const c = Math.floor(s.u() * 5.0);
        fctx = blox + 10.0 * FTL + c * 9.0 * FTL;
        fcty = bloy + 48.0 * FTL + r * 9.0 * FTL;
        fmode = 3.0; frd = 1100.0; lay = 11.0; glow = 0.7;
      } else {
        const hu = s.u();
        tHz = (hu < 0.5) ? 1.0 : 0.0;
        fmode = 5.0;
        tBase = ((tHz > 0.5) ? bloy : blox) + 62.0 * FTL;
        tPitch = 2.0 * FTL; tN = 9.0;
        tA0 = ((tHz > 0.5) ? blox : bloy) + 4.0 * FTL;
        tA1 = tA0 + 92.0 * FTL;
        tW = FTL / 2.0; tOcc = 0.7; tDot = 0.3;
        tSalt = 2.0; lay = 11.0; glow = 0.65;
      }
    } else if (typ == 1.0 || typ == 5.0) {
      // station: platforms, chest files, and the parked consist
      const pf = s.vnoise(bkx, wl, 1205) + 0.5;
      const pk = s.vnoise(bkx, wl, 1206) + 0.5;
      const uu = s.u();
      const py = bloy + 12.0 * FTL + Math.min(Math.floor(pf * 3.0), 2.0) * 24.0 * FTL;
      if (uu < 0.30) {
        const su = s.u();
        fmode = 1.0; fhz = 0.0;
        fcc = blox + ((typ == 1.0) ? 30.0 : 70.0) * FTL + ((su < 0.5) ? -3.0 : 3.0) * FTL;
        fa0 = bloy + 4.0 * FTL; fa1 = bloy + 96.0 * FTL;
        fw = 340.0; lay = 2.0; glow = 0.9;
      } else if (uu < 0.62) {
        const k = Math.floor(s.u() * 24.0);
        const cx2 = blox + ((typ == 1.0) ? 34.0 : 62.0) * FTL;
        const su = s.u();
        fctx = cx2 + ((su < 0.5) ? 0.0 : 2.0 * FTL);
        fcty = bloy + (8.0 + Math.floor(k * 7.0 / 2.0)) * FTL;
        fmode = 3.0; frd = 340.0; lay = 13.0; glow = 0.95;
      } else {
        if (pk > trn) { fmode = 0.0; }
        else {
          const car = Math.floor(s.u() * 5.0);
          const a0 = py + car * 7.0 * FTL;
          const cc2 = blox + ((typ == 1.0) ? 30.0 : 70.0) * FTL - 3.0 * FTL;
          flox = cc2 - FTL; floy = a0;
          fhix = cc2 + FTL; fhiy = a0 + 6.0 * FTL;
          fmode = 2.0; lay = -1.0;
          if (car == 0.0) { cr = 1.0; cg = 0.78; cb = 0.30; }
          else { cr = 0.62; cg = 0.50; cb = 0.92; }
          glow = 0.95;
        }
      }
    } else { fmode = 0.0; }
  } else if (d == 4.0) {
    // THE FEED LAYER: belts into machines, inserters, splitters
    if (typ == 2.0 || typ == 4.0 || typ == 10.0 || typ == 7.0) {
      const uu = s.u();
      const rp = (typ == 2.0) ? 10.0 : ((typ == 4.0) || (typ == 10.0)) ? 12.0 : 8.0;
      const rows = (typ == 2.0) ? 10.0 : 8.0;
      const pr = Math.floor(s.u() * rows);
      if (uu < 0.5) {
        // in and out lanes hugging the machine rows
        const su = s.u();
        fmode = 1.0; fhz = 1.0;
        fcc = bloy + (pr * rp + ((su < 0.5) ? 1.0 : (rp - 1.0))) * FTL + FTL / 2.0;
        fa0 = blox + 4.0 * FTL; fa1 = blox + 96.0 * FTL;
        fw = 700.0; lay = 3.0; glow = 0.6 + 0.6 * sat;
      } else {
        // the inserter files between, amber wrists at work
        const cc2 = Math.floor(s.u() * 30.0);
        fctx = blox + (4.0 + cc2 * 3.0) * FTL + FTL / 2.0;
        fcty = bloy + (pr * rp + 2.0) * FTL + FTL / 2.0;
        fmode = 3.0; frd = 240.0; lay = -1.0;
        cr = 0.35; cg = 0.95; cb = 0.45; glow = 1.3;
      }
    } else if (typ == 3.0) {
      // the bus resolved: one lane, its undergrounds, its splitters,
      // under the same nested survival as the ribbons above
      const g = Math.floor(s.u() * 14.0);
      const l = Math.floor(s.u() * 4.0);
      const lx2 = blox + 15.0 * FTL + g * 5.0 * FTL + l * FTL + FTL / 2.0;
      const gv = s.vnoise(g, wl * 4.0, 1306) + 0.5;
      if (gv > clamp(sat * 1.35, 0.05, 1.0)) { fmode = 0.0; }
      else {
        const uu = s.u();
        if (uu < 0.72) {
          fmode = 1.0; fhz = 0.0; fcc = lx2;
          fa0 = bloy + 4.0 * FTL; fa1 = bloy + 96.0 * FTL;
          fw = 760.0; lay = 3.0; glow = 0.45 + 0.75 * sat;
        } else if (uu < 0.88) {
          // the underground dive at the seam: two arrows, a held breath
          const su = s.u();
          fctx = lx2; fcty = bloy + ((su < 0.5) ? 2.0 : 98.0) * FTL;
          fmode = 3.0; frd = 400.0; lay = 3.0; glow = 1.1;
        } else {
          const s1 = s.vnoise(g * 4.0 + l, bkey, 1216) + 0.5;
          if (s1 >= 0.125) { fmode = 0.0; }
          else {
            const s2 = s.vnoise(g * 4.0 + l, bkey, 1217) + 0.5;
            fctx = lx2;
            fcty = bloy + (Math.min(Math.floor(s2 * 88.0), 87.0) + 6.0) * FTL;
            fmode = 3.0; frd = 520.0; lay = 3.0; glow = 1.3;
          }
        }
      }
    } else { fmode = 0.0; }
  } else if (d == 5.0) {
    // WALLS where the map needs teeth, pipes, platform lamps. The
    // shader guards each arm with a draw behind a short circuit, so
    // the draw is spent only where the district matches; the nesting
    // here says the same thing in statements.
    if (typ == 9.0) {
      const gu = s.u();
      if (gu < 0.6) {
        const hu = s.u();
        const hz2 = (hu < 0.5) ? 1.0 : 0.0;
        fmode = 1.0; fhz = hz2;
        fcc = ((hz2 > 0.5) ? bloy : blox) + Math.floor(s.u() * 90.0 + 5.0) * FTL;
        const a0 = ((hz2 > 0.5) ? blox : bloy) + Math.floor(s.u() * 40.0) * FTL;
        fa0 = a0; fa1 = a0 + Math.floor(s.u() * 30.0 + 6.0) * FTL;
        fw = 420.0; lay = 11.0; glow = 0.6;
      } else { fmode = 0.0; }
    } else if (typ == 1.0 || typ == 5.0) {
      const gu = s.u();
      if (gu < 0.5) {
        const k = Math.floor(s.u() * 12.0);
        fctx = blox + ((typ == 1.0) ? 27.0 : 73.0) * FTL;
        fcty = bloy + (8.0 * k + 6.0) * FTL;
        fmode = 3.0; frd = 240.0; lay = 8.0; glow = mix(0.3, 1.8, night);
      } else { fmode = 0.0; }
    } else if (typ == 2.0) {
      const gu = s.u();
      if (gu < 0.5) {
        // steel chests catching plates at the row ends
        const pr = Math.floor(s.u() * 10.0);
        const su = s.u();
        fctx = blox + ((su < 0.5) ? 3.0 : 97.0) * FTL;
        fcty = bloy + (pr * 10.0 + 4.0) * FTL;
        fmode = 3.0; frd = 330.0; lay = 13.0; glow = 0.9;
      } else { fmode = 0.0; }
    } else { fmode = 0.0; }
  } else {
    // THE FLOW ITSELF: item slots under the hash. A lane is slots
    // every quarter tile, and a slot is occupied when its address
    // hashes under the local saturation. BACKPRESSURE mixes the slot's
    // own draw toward its group's, which clumps the survivors into
    // runs of eight the way a jam does.
    let lane = 0.0, lx2 = 0.0, la0 = 0.0, la1 = 0.0;
    let cls = 0.0, occ = 0.0, lkey = 0.0;
    if (typ == 3.0) {
      const gb = blox + 15.0 * FTL, gp = 5.0 * FTL;
      const gw0 = winx - gp;
      const gi0 = (gw0 <= gb) ? 0.0 : Math.floor((gw0 - gb) / gp);
      const gi1 = (winz < gb) ? -1.0 : Math.min(13.0, Math.floor((winz - gb) / gp));
      if (gi0 > gi1) { fmode = 0.0; lane = -1.0; }
      let g = 0.0;
      if (lane >= 0.0) {
        g = Math.min(gi0 + Math.floor(s.u() * (gi1 - gi0 + 1.0)), gi1);
      }
      const l = Math.floor(s.u() * 4.0);
      lx2 = blox + 15.0 * FTL + g * 5.0 * FTL + l * FTL + FTL / 2.0;
      la0 = bloy + 4.0 * FTL; la1 = bloy + 96.0 * FTL;
      const c1 = s.vnoise(g * 4.0 + l, wl, 1901) + 0.5;
      const c2v = s.vnoise(g * 4.0 + l, wl, 1902) + 0.5;
      cls = Math.min(Math.floor(c1 * 8.0), 7.0);
      // backpressure acts on occupancy itself: a jam packs the lane
      // even where the taper already runs full
      occ = sat * (0.55 + 0.55 * c2v) * mix(0.80, 1.40, back);
      const gv = s.vnoise(g, wl * 4.0, 1306) + 0.5;
      if (gv > clamp(sat * 1.35, 0.05, 1.0)) { occ = 0.0; }
      if (lane == 0.0) { lane = 1.0; }
      lkey = Math.min(Math.floor(1024.0 * (s.vnoise(g * 4.0 + l, bkey, 1211) + 0.5)), 1023.0);
    } else if (typ == 2.0 || typ == 4.0 || typ == 10.0) {
      const rp = (typ == 2.0) ? 10.0 : 12.0;
      const sp = rp * FTL;
      const sw0 = winy - sp;
      const pi0 = (sw0 <= bloy) ? 0.0 : Math.floor((sw0 - bloy) / sp);
      const pi1 = (winw < bloy) ? -1.0 : Math.min(9.0, Math.floor((winw - bloy) / sp));
      if (pi0 > pi1) { fmode = 0.0; lane = -1.0; }
      let pr = 0.0;
      if (lane >= 0.0) {
        pr = Math.min(pi0 + Math.floor(s.u() * (pi1 - pi0 + 1.0)), pi1);
      }
      const iu = s.u();
      const inLane = iu < 0.5;
      lx2 = bloy + (pr * rp + (inLane ? 1.0 : (rp - 1.0))) * FTL + FTL / 2.0;
      la0 = blox + 4.0 * FTL; la1 = blox + 96.0 * FTL;
      cls = (typ == 2.0) ? (inLane ? 0.0 : 5.0)
          : ((typ == 10.0) ? 7.0 : (inLane ? 2.0 : 3.0));
      const tf = s.vnoise(2.0, wl, 1302) + 0.5;
      if (typ == 2.0 && tf >= 0.5) { cls = 1.0; }
      occ = clamp(sat * (inLane ? 1.0 : 0.75) * mix(0.80, 1.40, back), 0.05, 1.0);
      if (lane == 0.0) { lane = 2.0; }
      lkey = Math.min(Math.floor(1024.0
           * (s.vnoise(pr * 2.0 + (inLane ? 0.0 : 1.0), bkey, 1212) + 0.5)), 1023.0);
    } else { fmode = 0.0; }
    if (lane > 0.0) {
      // slots are absolute addresses and the window clips the index
      // range, so the same slot is the same item at every zoom
      const wa0 = (lane == 1.0) ? winy : winx;
      const wa1 = (lane == 1.0) ? winw : winz;
      const slots = Math.floor((la1 - la0) / FIT);
      const q0 = (wa0 <= la0) ? 0.0 : Math.floor((wa0 - la0) / FIT);
      const q1 = (wa1 < la0) ? -1.0 : Math.min(slots - 1.0, Math.floor((wa1 - la0) / FIT));
      if (q1 < q0) { lane = 0.0; fmode = 0.0; }
      else {
        const i = q0 + Math.min(Math.floor(s.u() * (q1 - q0 + 1.0)), q1 - q0);
        const ikv = s.vnoise(i, lkey, 1213) + 0.5;
        const gkv = s.vnoise(Math.floor(i / 8.0), lkey, 1214) + 0.5;
        const keep = mix(ikv, gkv, back * 0.85);
        if (keep > occ) { fmode = 0.0; }
        else {
          const sv = s.vnoise(i, lkey, 1215) + 0.5;
          const along = la0 + i * FIT + FIT / 2.0;
          const jit = ((sv < 0.5) ? -1.0 : 1.0) * (FTL / 4.0);
          let c2x = along, c2y = lx2 + jit;
          if (lane == 1.0) { c2x = lx2 + jit; c2y = along; }
          if (d >= 7.0 && mag > 300.0) {
            // close enough to matter: the item grows its silhouette,
            // slabs for plates, a pin-grid board for circuits, teeth
            // for the gear, a disc for what pours and what bubbles
            const shape = (cls == 7.0) ? 2.0
                        : ((cls >= 2.0 && cls <= 4.0) ? 1.0
                        : ((cls == 6.0 || cls == 8.0) ? 3.0 : 0.0));
            const p = s.u();
            if (shape == 0.0) {
              const hx = 380.0, hy = 260.0;
              if (p < 0.25) { fox = c2x + mix(-hx, hx, p * 4.0); foy = c2y - hy; }
              else if (p < 0.5) { fox = c2x + hx; foy = c2y + mix(-hy, hy, (p - 0.25) * 4.0); }
              else if (p < 0.75) { fox = c2x + mix(hx, -hx, (p - 0.5) * 4.0); foy = c2y + hy; }
              else { fox = c2x - hx; foy = c2y + mix(hy, -hy, (p - 0.75) * 4.0); }
            } else if (shape == 1.0) {
              if (p < 0.55) {
                const e = (p / 0.55) * 4.0;
                const eg = fract(e) * 600.0 - 300.0;
                const side = Math.floor(e);
                if (side == 0.0) { fox = c2x + eg; foy = c2y - 300.0; }
                else if (side == 1.0) { fox = c2x + 300.0; foy = c2y + eg; }
                else if (side == 2.0) { fox = c2x + eg; foy = c2y + 300.0; }
                else { fox = c2x - 300.0; foy = c2y + eg; }
              } else {
                const gx = Math.floor(s.u() * 3.0) - 1.0;
                const gy = Math.floor(s.u() * 3.0) - 1.0;
                fox = c2x + gx * 170.0; foy = c2y + gy * 170.0;
              }
            } else if (shape == 2.0) {
              const au = s.u();
              const tu = s.u();
              const tooth = tu < 0.35;
              let a = au * 6.2831853;
              if (tooth) { a = (Math.floor(a * 1.2732395) + 0.5) * 0.7853982; }
              const rad = tooth ? 400.0 : 290.0;
              fox = c2x + Math.cos(a) * rad;
              foy = c2y + Math.sin(a) * rad;
            } else {
              const a = s.u() * 6.2831853;
              fox = c2x + Math.cos(a) * 280.0;
              foy = c2y + Math.sin(a) * 280.0;
            }
            fmode = 4.0; fax = c2x; fay = c2y;
          } else {
            fctx = c2x; fcty = c2y; fmode = 3.0;
            frd = (mag > 300.0) ? 90.0 : 230.0;
          }
          lay = -1.0;
          // what rides the belts, keyed by the district's recipe
          if (cls == 0.0) { cr = 0.62; cg = 0.70; cb = 0.86; }
          else if (cls == 1.0) { cr = 0.95; cg = 0.52; cb = 0.22; }
          else if (cls == 2.0) { cr = 0.30; cg = 0.95; cb = 0.42; }
          else if (cls == 3.0) { cr = 0.95; cg = 0.30; cb = 0.30; }
          else if (cls == 4.0) { cr = 0.35; cg = 0.55; cb = 1.00; }
          else if (cls == 5.0) { cr = 0.80; cg = 0.84; cb = 0.90; }
          else if (cls == 6.0) { cr = 0.92; cg = 0.92; cb = 0.80; }
          else if (cls == 7.0) { cr = 0.55; cg = 0.58; cb = 0.62; }
          else { cr = 0.85; cg = 0.30; cb = 0.80; }
          glow = 1.7;
        }
      }
    }
  }

  // ── the engines: one call site each ──
  let hit = 0.0;
  let xyx = 0.0, xyy = 0.0;
  if (fmode == 1.0) {
    // the wire samples only the stretch the window can see
    const lo = Math.max(fa0, (fhz > 0.5) ? winx : winy);
    const hi = Math.min(fa1, (fhz > 0.5) ? winz : winw);
    if (lo < hi) {
      const along = lo + Math.floor(s.u() * (hi - lo));
      const c2x = (fhz > 0.5) ? along : fcc;
      const c2y = (fhz > 0.5) ? fcc : along;
      if (c2x >= winx && c2x <= winz && c2y >= winy && c2y <= winw) {
        const across = (s.u() - 0.5) * fw;
        if (fhz > 0.5) { xyx = c2x; xyy = c2y + across; }
        else { xyx = c2x + across; xyy = c2y; }
        hit = 1.0;
      }
    }
  } else if (fmode == 2.0) {
    const clox = Math.max(flox, winx), cloy = Math.max(floy, winy);
    const chix = Math.min(fhix, winz), chiy = Math.min(fhiy, winw);
    if (clox < chix && cloy < chiy) {
      const ju = s.u(), jw = s.u();
      xyx = clox + ju * (chix - clox);
      xyy = cloy + jw * (chiy - cloy);
      hit = 1.0;
    }
  } else if (fmode == 3.0) {
    if (fctx + frd >= winx && fctx - frd <= winz
        && fcty + frd >= winy && fcty - frd <= winw) {
      const a = s.u() * 6.2831853;
      const rr2 = Math.sqrt(s.u()) * frd;
      xyx = fctx + Math.cos(a) * rr2;
      xyy = fcty + Math.sin(a) * rr2;
      hit = 1.0;
    }
  } else if (fmode == 4.0) {
    xyx = fox; xyy = foy;
    if (fax >= winx && fax <= winz && fay >= winy && fay <= winw) { hit = 1.0; }
  } else if (fmode == 5.0) {
    // runs and their indexes both clip to the window, and the run
    // keeps its absolute index so occupancy stays addressed
    const kw0 = ((tHz > 0.5) ? winy : winx) - tW;
    const kw1 = ((tHz > 0.5) ? winw : winz) + tW;
    const ki0 = (kw0 <= tBase) ? 0.0 : Math.floor((kw0 - tBase) / tPitch);
    const ki1 = (kw1 < tBase) ? -1.0
              : Math.min(tN - 1.0, Math.floor((kw1 - tBase) / tPitch));
    const a0 = Math.max(tA0, (tHz > 0.5) ? winx : winy);
    const a1 = Math.min(tA1, (tHz > 0.5) ? winz : winw);
    if (ki0 <= ki1 && a0 < a1) {
      const k = Math.min(ki0 + Math.floor(s.u() * (ki1 - ki0 + 1.0)), ki1);
      const cc2 = tBase + k * tPitch;
      const rk = s.vnoise(k, wl * 4.0 + tSalt, 1306) + 0.5;
      if (rk <= tOcc) {
        const along = a0 + Math.floor(s.u() * Math.max(a1 - a0, 1.0));
        const c2x = (tHz > 0.5) ? along : cc2;
        const c2y = (tHz > 0.5) ? cc2 : along;
        if (c2x >= winx && c2x <= winz && c2y >= winy && c2y <= winw) {
          let dotHit = 0.0;
          if (tDot > 0.0) {
            const dv = s.u();
            if (dv < tDot) { dotHit = 1.0; }
          }
          if (dotHit > 0.5) {
            xyx = c2x; xyy = c2y; hit = 1.0; glow *= 1.5;
          } else {
            const across = (s.u() - 0.5) * tW;
            if (tHz > 0.5) { xyx = c2x; xyy = c2y + across; }
            else { xyx = c2x + across; xyy = c2y; }
            hit = 1.0;
          }
        }
      }
    }
  }

  if (hit < 0.5) { return s.decline(); }

  // the map-view night palette, by structure class
  if (lay >= 0.0) {
    if (lay == 0.0) { cr = 0.055; cg = 0.055; cb = 0.065; }        // ground
    else if (lay == 1.0) { cr = 0.10; cg = 0.16; cb = 0.34; }      // water
    else if (lay == 2.0) { cr = 0.58; cg = 0.58; cb = 0.58; }      // rail
    else if (lay == 3.0) { cr = 0.30; cg = 0.47; cb = 1.00; }      // express belt
    else if (lay == 4.0) { cr = 1.00; cg = 0.45; cb = 0.12; }      // furnace glow
    else if (lay == 5.0) { cr = 0.35; cg = 0.78; cb = 0.72; }      // assembler
    else if (lay == 6.0) { cr = 1.00; cg = 0.45; cb = 0.75; }      // lab
    else if (lay == 7.0) { cr = 0.82; cg = 0.76; cb = 0.58; }      // pole, turbine
    else if (lay == 8.0) { cr = 1.00; cg = 0.95; cb = 0.70; }      // lamp
    else if (lay == 9.0) { cr = 0.70; cg = 0.78; cb = 0.68; }      // wall
    else if (lay == 10.0) { cr = 1.00; cg = 0.28; cb = 0.36; }     // laser turret
    else if (lay == 11.0) { cr = 0.34; cg = 0.64; cb = 0.68; }     // pipe
    else if (lay == 12.0) { cr = 0.24; cg = 0.22; cb = 0.48; }     // solar panel
    else if (lay == 13.0) { cr = 1.00; cg = 0.66; cb = 0.25; }     // chest
    else if (lay == 14.0) { cr = 1.00; cg = 0.34; cb = 0.20; }     // heat pipe
    else { cr = 0.93; cg = 0.93; cb = 0.98; }                      // silo, radar
  }
  cr *= glow; cg *= glow; cb *= glow;
  // night pulls the ambient classes down and lets the lit ones carry
  if (lay == 0.0 || lay == 1.0 || lay == 12.0) {
    const dim = mix(1.0, 0.45, night);
    cr *= dim; cg *= dim; cb *= dim;
  }

  return s.deposit({
    xy: v2((xyx - wcx) * km, (xyy - wcy) * km),
    col: stain(v3(cr, cg, cb), stn),
  });
});
