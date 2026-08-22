// Conformance probe for the first positive.
//   A  CPU vs GPU: the positive's two evaluators agree at cell level -
//      linearized per-cell luminance over the level-4 grid, Pearson
//      correlation and quantile ratios
//   B  addressed survivorship: level-4 cells the CPU calls kept vs
//      their dead siblings separate cleanly in GPU light
//   C  law vs the plate on the same bench: a loose sanity bound only,
//      because these are two SINGLE worlds - the pooled-world native
//      test (tools/native-law.mjs) is the law instrument
//   D  negative control: outside the object is dark
//
// Instrument notes, learned by failing:
// - gamma 1 and hue 0 let the tonemap invert exactly per channel:
//   h = -ln(1 - (c/255 - base*vig)/vig), vig from pixel position.
// - FOOTPRINTS MUST MATCH. The GPU sample is a 7x7 px window at the
//   cell centre; a survivor cell's light is not uniform inside the
//   cell (its own surviving subcells sit off-centre), so the CPU must
//   bin only deposits landing inside the same window, or the two
//   evaluators are being asked different questions.
import { launchChrome, pageSession, evalIn } from "./cdp.mjs";
import def from "../positives/critical.pos.mjs";
import { evaluate, leverDefaults, Address } from "../core/measure.mjs";

const BENCH = "file:///C:/Users/logan/source/repos/atlas-engine/harness/bench.html";
const PROFILE = "C:/Users/logan/AppData/Local/Temp/claude/C--Users-logan-source-repos-PrettyCloud/5bec1cbb-f19f-414e-ada6-4189040214dd/scratchpad/chrome-profile";
const PORT = 9223;

const GRID = 81, B = 3, SCALE = 1.9, EXT = 1.6, RAD = 3;
const P = leverDefaults(def);
const leverArr = def.leverNames.map(n => P[n]);
const plateLevers = [P.occupancy, P.b, P.depth, P.tint, P.slab, P.hull];

const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + "   " + detail);
}
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const settle = ms => new Promise(r => setTimeout(r, ms));

const cellWorld = (ix, iy) => [((ix + 0.5) / GRID - 0.5) * SCALE, ((iy + 0.5) / GRID - 0.5) * SCALE];

// survival of a level-L cell under the positive's own Address type
function survives(ix, iy, L) {
  let a = new Address(def.root);
  let px = ix, py = iy;
  const digs = [];
  for (let l = L - 1; l >= 0; l--) {
    const s = Math.pow(B, l);
    digs.push([Math.trunc(px / s), Math.trunc(py / s)]);
    px %= s; py %= s;
  }
  for (const [cx, cy] of digs) {
    const st = a.child(cx, cy);
    if (!st.coin(P.occupancy)) return false;
    a = new Address(st.h);
  }
  return true;
}

(async () => {
  // ---- the bench ---------------------------------------------------
  let ws;
  try { ws = await pageSession(PORT, "bench"); }
  catch (e) {
    try {
      ws = await pageSession(PORT, "");
    } catch (e2) {
      await launchChrome({ port: PORT, profile: PROFILE, url: BENCH });
      await settle(2000);
      ws = await pageSession(PORT, "bench");
    }
  }
  await evalIn(ws, `location.href = ${JSON.stringify(BENCH)}; true`).catch(() => {});
  await settle(2500);
  const ready = await evalIn(ws, "window.__ready");
  if (!ready) { console.log("bench failed to init GL"); process.exit(2); }

  const still = await evalIn(ws, `window.__still(1, ${JSON.stringify(leverArr)}, 90, 1 << 20, 0.08)`);
  if (!still.ok) { console.log("positive still failed: " + JSON.stringify(still)); process.exit(2); }
  console.log(`GPU exposure: ${still.frames} frames of 2^20, canvas ${still.w}px`);

  const pts = [];
  for (let iy = 0; iy < GRID; iy++) for (let ix = 0; ix < GRID; ix++) pts.push(cellWorld(ix, iy));
  const s1 = await evalIn(ws, `window.__sample(${JSON.stringify(pts)}, ${RAD})`);
  const gpu = new Float64Array(GRID * GRID);
  const satf = new Float64Array(GRID * GRID);
  s1.out.forEach((o, i) => { gpu[i] = o[2] < 0 ? 0 : o[2]; satf[i] = o[3]; });

  // ---- CPU exposure with the SAME footprint ------------------------
  // the sampler averages a (2R+1)^2 window at the rounded cell-centre
  // pixel; bin only deposits whose position lands inside that window
  const W = still.w;
  const pxPerWorld = W / (2 * EXT);
  const half = (RAD + 0.5) / pxPerWorld;   // window half-width, world units
  const M = 4_000_000;
  const cpu = new Float64Array(GRID * GRID);
  for (let i = 0; i < M; i++) {
    const dep = evaluate(def, P, i);
    const u = (dep.x / SCALE + 0.5) * GRID, v = (dep.y / SCALE + 0.5) * GRID;
    const bx = Math.trunc(u), by = Math.trunc(v);
    if (bx < 0 || by < 0 || bx >= GRID || by >= GRID) continue;
    const [cx, cy] = cellWorld(bx, by);
    if (Math.abs(dep.x - cx) > half || Math.abs(dep.y - cy) > half) continue;
    cpu[by * GRID + bx] += 0.299 * dep.r + 0.587 * dep.g + 0.114 * dep.b;
  }
  console.log(`CPU exposure: ${M} points, footprint-matched (${(2 * RAD + 1)}px window)`);

  // ---- A: correlation and quantiles --------------------------------
  // cells the film clipped are not read; they are counted instead
  {
    const xs = [], ys = [];
    let clipped = 0;
    for (let i = 0; i < GRID * GRID; i++) {
      if (satf[i] > 0) { clipped++; continue; }
      xs.push(cpu[i]); ys.push(gpu[i]);
    }
    console.log(`  ${clipped} of ${GRID * GRID} cells excluded as clipped`);
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) * (xs[i] - mx);
      syy += (ys[i] - my) * (ys[i] - my);
    }
    const corr = sxy / Math.sqrt(sxx * syy);
    report("A two evaluators agree per cell", corr > 0.99,
      `Pearson r = ${corr.toFixed(4)} over ${xs.length} level-4 cells`);

    const sx = [...xs].sort((a, b) => a - b), sy = [...ys].sort((a, b) => a - b);
    const tx = sx.reduce((a, b) => a + b, 0), ty = sy.reduce((a, b) => a + b, 0);
    const floorY = 0.05 * ty / sy.length;
    let qerr = 0, qn = 0;
    for (let q = 30; q <= 95; q += 5) {
      const i = Math.trunc(q / 100 * sx.length);
      qerr += Math.abs(sx[i] / tx - sy[i] / ty) / Math.max(sy[i] / ty, floorY / ty); qn++;
    }
    report("A2 light distributes identically", qerr / qn < 0.08,
      `mean quantile error ${(100 * qerr / qn).toFixed(2)}% over ${qn} quantiles`);
  }

  // ---- B: addressed survivorship in GPU light ----------------------
  {
    const kept = [], dead = [];
    for (let iy = 8; iy < GRID - 8; iy++) for (let ix = 8; ix < GRID - 8; ix++) {
      if (!survives(Math.trunc(ix / 3), Math.trunc(iy / 3), 3)) continue;
      (survives(ix, iy, 4) ? kept : dead).push(gpu[iy * GRID + ix]);
    }
    const mk = mean(kept), md = mean(dead);
    const thr = Math.sqrt(Math.max(mk, 1e-6) * Math.max(md, 1e-6));
    let mis = 0;
    kept.forEach(v => { if (v < thr) mis++; });
    dead.forEach(v => { if (v > thr) mis++; });
    const rate = 100 * (1 - mis / (kept.length + dead.length));
    report("B survivorship reads off the pixels", rate > 97 && kept.length > 200 && dead.length > 80,
      `${kept.length} kept at ${mk.toFixed(3)}, ${dead.length} dead at ${md.toFixed(3)}, ${rate.toFixed(1)}% classified`);
  }

  // ---- C: the law against the plate, loosely -----------------------
  {
    const st0 = await evalIn(ws, `window.__still(0, ${JSON.stringify(plateLevers)}, 90, 1 << 20, 0.08)`);
    if (!st0.ok) { report("C law vs plate", false, "plate still failed"); }
    else {
      const s0 = await evalIn(ws, `window.__sample(${JSON.stringify(pts)}, ${RAD})`);
      const pl = new Float64Array(GRID * GRID);
      s0.out.forEach((o, i) => { pl[i] = o[2] < 0 ? 0 : o[2]; });
      const sp = [...gpu].sort((a, b) => a - b), sq = [...pl].sort((a, b) => a - b);
      const tp = sp.reduce((a, b) => a + b, 0), tq = sq.reduce((a, b) => a + b, 0);
      let qerr = 0, qn = 0;
      for (let q = 30; q <= 95; q += 5) {
        const i = Math.trunc(q / 100 * sp.length);
        if (sq[i] / tq > 1e-9) { qerr += Math.abs(sp[i] / tp - sq[i] / tq) / (sq[i] / tq); qn++; }
      }
      report("C same law as the plate, loosely", qerr / qn < 0.45,
        `sorted-cell quantile error ${(100 * qerr / qn).toFixed(1)}% (single worlds; the pooled native test holds the law at 0.4%)`);
      report("C2 total light comparable", tp / tq > 0.8 && tp / tq < 1.25,
        `positive/plate linearized totals ${(tp / tq).toFixed(3)}`);
    }
  }

  // ---- D: darkness where the measure is not ------------------------
  {
    const off = [];
    for (let k = 0; k < 40; k++) off.push([1.15 + 0.3 * (k % 5) / 5, -1.4 + 2.8 * k / 40]);
    const sd = await evalIn(ws, `window.__sample(${JSON.stringify(off)}, 2)`);
    const vals = sd.out.filter(o => o[2] >= 0).map(o => o[2]);
    report("D dark beyond the object", Math.max(...vals) < 0.02,
      `max linearized luminance ${Math.max(...vals).toFixed(4)} over ${vals.length} points outside`);
  }

  const fails = results.filter(r => !r.ok).length;
  console.log(fails ? `\n${fails} FAILURES` : "\nall conformance probes pass");
  ws.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("probe error:", e.message); process.exit(2); });
