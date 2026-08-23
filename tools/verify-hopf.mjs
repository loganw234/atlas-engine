// Conformance probe for the classic-stratum experiment: the Hopf
// fibration as a positive.
//   A  two evaluators agree: CPU exposure over the SAME vertex ids as
//      one GPU frame, per-cell correlation at a fixed clock
//   A2 same picture as the plate: hopf_pos GPU vs hopf GPU, cell for
//      cell - the map is deterministic in q, so this is near-exact
//   T  the clock is real: the same positive at t=0 vs t=2.4 must
//      differ, while each matches the plate at its own t
//   E  absence: cells the CPU says are empty read as background
// No chains and no world here: the subject is a law alone.
import { launchChrome, pageSession, evalIn, benchUrl, chromeProfile }
  from "./cdp.mjs";
import def from "../positives/hopf.pos.mjs";
import { evaluate, leverDefaults } from "../core/measure.mjs";

const BENCH = benchUrl();
const PROFILE = chromeProfile();
const PORT = 9223;

const GRID = 96, EXTENT = 1.55, EXT = 1.6, RAD = 3;
const P = leverDefaults(def);
const levers = def.leverNames.map(n => P[n]);   // same order as the plate
const T1 = 2.4;

const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + "   " + detail);
}
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const settle = ms => new Promise(r => setTimeout(r, ms));
const cellWorld = (ix, iy) => [((ix + 0.5) / GRID - 0.5) * 2 * EXTENT,
                              ((iy + 0.5) / GRID - 0.5) * 2 * EXTENT];

function corrOf(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
    syy += (ys[i] - my) * (ys[i] - my);
  }
  return sxy / Math.sqrt(sxx * syy);
}

async function gpuGrid(ws, idx, t) {
  const still = await evalIn(ws, `window.__still(${idx}, ${JSON.stringify(levers)}, 60, 1 << 20, 0.05, ${t})`);
  if (!still.ok) throw new Error("still failed: " + JSON.stringify(still));
  const pts = [];
  for (let iy = 0; iy < GRID; iy++) for (let ix = 0; ix < GRID; ix++) pts.push(cellWorld(ix, iy));
  const s = await evalIn(ws, `window.__sample(${JSON.stringify(pts)}, ${RAD})`);
  const g = new Float64Array(GRID * GRID), sat = new Float64Array(GRID * GRID);
  s.out.forEach((o, i) => { g[i] = o[2] < 0 ? 0 : o[2]; sat[i] = o[3]; });
  return { g, sat, w: s.w };
}

function cpuGrid(t, W) {
  const pxPerWorld = W / (2 * EXT);
  const half = (RAD + 0.5) / pxPerWorld;
  const cpu = new Float64Array(GRID * GRID);
  const M = 1 << 20;                   // the same ids as one GPU frame
  for (let i = 0; i < M; i++) {
    const dep = evaluate(def, P, i, t);
    const u = (dep.x / (2 * EXTENT) + 0.5) * GRID, v = (dep.y / (2 * EXTENT) + 0.5) * GRID;
    const bx = Math.trunc(u), by = Math.trunc(v);
    if (bx < 0 || by < 0 || bx >= GRID || by >= GRID) continue;
    const [cx, cy] = cellWorld(bx, by);
    if (Math.abs(dep.x - cx) > half || Math.abs(dep.y - cy) > half) continue;
    cpu[by * GRID + bx] += 0.299 * dep.r + 0.587 * dep.g + 0.114 * dep.b;
  }
  return cpu;
}

(async () => {
  let ws;
  try { ws = await pageSession(PORT, "bench"); }
  catch (e) {
    try { ws = await pageSession(PORT, ""); }
    catch (e2) {
      await launchChrome({ port: PORT, profile: PROFILE, url: BENCH });
      await settle(2000);
      ws = await pageSession(PORT, "bench");
    }
  }
  await evalIn(ws, `location.href = ${JSON.stringify(BENCH)}; true`).catch(() => {});
  await settle(2500);
  if (!(await evalIn(ws, "window.__ready"))) { console.log("bench failed"); process.exit(2); }

  // GPU: the positive and the plate at T1, and the positive at 0
  const gPos = await gpuGrid(ws, 3, T1);
  const gPla = await gpuGrid(ws, 2, T1);
  const gPos0 = await gpuGrid(ws, 3, 0);
  console.log(`GPU exposures done (canvas ${gPos.w}px)`);
  const cpu = cpuGrid(T1, gPos.w);
  console.log(`CPU exposure done (2^20 ids, footprint-matched)`);

  // exclusions: clipped cells in any grid under comparison
  const keepAB = [], keep0 = [];
  for (let i = 0; i < GRID * GRID; i++) {
    keepAB.push(gPos.sat[i] === 0 && gPla.sat[i] === 0);
    keep0.push(gPos.sat[i] === 0 && gPos0.sat[i] === 0);
  }
  const nClip = keepAB.filter(k => !k).length;
  console.log(`  ${nClip} of ${GRID * GRID} cells excluded as clipped`);

  {
    const xs = [], ys = [];
    for (let i = 0; i < GRID * GRID; i++) if (keepAB[i]) { xs.push(cpu[i]); ys.push(gPos.g[i]); }
    const r = corrOf(xs, ys);
    report("A two evaluators agree per cell", r > 0.99,
      `Pearson r = ${r.toFixed(4)} over ${xs.length} cells at t=${T1}`);
  }
  {
    const xs = [], ys = [];
    for (let i = 0; i < GRID * GRID; i++) if (keepAB[i]) { xs.push(gPos.g[i]); ys.push(gPla.g[i]); }
    const r = corrOf(xs, ys);
    report("A2 same picture as the plate", r > 0.995,
      `Pearson r = ${r.toFixed(4)} GPU-to-GPU at equal levers and clock`);
  }
  {
    const xs = [], ys = [];
    for (let i = 0; i < GRID * GRID; i++) if (keep0[i]) { xs.push(gPos.g[i]); ys.push(gPos0.g[i]); }
    const r = corrOf(xs, ys);
    report("T the clock moves the object", r < 0.9,
      `corr(t=0, t=${T1}) = ${r.toFixed(4)} - the churn is real`);
  }
  {
    const dark = [];
    for (let i = 0; i < GRID * GRID; i++) {
      if (cpu[i] === 0 && keepAB[i]) dark.push(gPos.g[i]);
    }
    const mx = Math.max(...dark);
    report("E empty cells read as background", dark.length > 2000 && mx < 0.03,
      `${dark.length} CPU-empty cells, max GPU linearized ${mx.toFixed(4)}`);
  }

  const fails = results.filter(r => !r.ok).length;
  console.log(fails ? `\n${fails} FAILURES` : "\nall hopf probes pass");
  ws.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("probe error:", e.message); process.exit(2); });
