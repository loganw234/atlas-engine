// Conformance probe for the second positive: LXVI restated with the
// windowed vocabulary.
//   A  bit-exact patch vs direct Pascal-mod-2 iteration (D=11, M=5)
//   A2 bit-exact patch, p=3 (D=7, M=2)
//   E  bit-exact at ~16.7M rows vs the Lucas closed form (D=24, M=20)
//      - the theorem construct carrying the window at depth
//   F  the two evaluators: CPU evaluate() vs GPU cells (D=11, M=5)
//   C  same picture as the plate at MAGNIFY 0, cell for cell - the
//      support is a theorem's and the lineage fold is pinned, so the
//      whole image reproduces
// The layout replica below mirrors the window construct's integer
// math (which mirrors the plate's - the same formulas the LXVI plate
// probes verified on pixels).
import { launchChrome, pageSession, evalIn } from "./cdp.mjs";
import def from "../positives/nested.pos.mjs";
import { evaluate, leverDefaults, levels } from "../core/measure.mjs";

const BENCH = "file:///C:/Users/logan/source/repos/atlas-engine/harness/bench.html";
const PROFILE = "C:/Users/logan/AppData/Local/Temp/claude/C--Users-logan-source-repos-PrettyCloud/5bec1cbb-f19f-414e-ada6-4189040214dd/scratchpad/chrome-profile";
const PORT = 9223;
const fr = Math.fround;
const IDX_PLATE = 4, IDX_POS = 5;

const P0 = leverDefaults(def);
const leverArr = (over) => def.leverNames.map(n => (over && n in over) ? over[n] : P0[n]);

const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "   " + detail : ""));
}
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const settle = ms => new Promise(r => setTimeout(r, ms));

// ---- replica of the window construct's integer layout --------------
function layout({ D, M, p }) {
  const g = levels(p, D);
  const R = g.R;
  const WU = 2 * R - 1;
  const ctr = [Math.trunc(WU / 2), R];
  const heart = [Math.trunc(R / 64), 2 * R - Math.trunc(R / 32)];
  const mg = fr(Math.pow(2, M));
  const f = fr(1 - 1 / mg);
  const wc = [ctr[0] + Math.trunc(fr(fr(heart[0] - ctr[0]) * f)),
              ctr[1] + Math.trunc(fr(fr(heart[1] - ctr[1]) * f))];
  const hw = [Math.trunc(fr(ctr[0]) / mg), Math.trunc(fr(ctr[1]) / mg)];
  const win = [wc[0] - hw[0], wc[1] - hw[1], wc[0] + hw[0], wc[1] + hw[1]];
  const km = (2.85 / (2 * R)) * mg;
  return { p, L: g.L, R, wc, win, km };
}
function cellWorld(L, n, k) {
  const xu = 2 * k + (L.R - 1 - n);
  return [((xu + 1) - L.wc[0]) * L.km, -(((2 * n + 1) - L.wc[1]) * L.km), 0];
}
function visibleCells(L, margin = 6) {
  const cells = [];
  const nLo = Math.max(0, Math.ceil(L.win[1] / 2) + margin);
  const nHi = Math.min(L.R - 1, Math.floor(L.win[3] / 2) - margin);
  for (let n = nLo; n <= nHi; n++) {
    const kLo = Math.max(0, Math.ceil((L.win[0] - (L.R - 1 - n)) / 2) + margin);
    const kHi = Math.min(n, Math.floor((L.win[2] - (L.R - 1 - n)) / 2) - margin);
    for (let k = kLo; k <= kHi; k++) cells.push([n, k]);
  }
  return cells;
}
function pascalRows(p, N) {
  const rows = [new Uint8Array([1])];
  let row = rows[0];
  for (let n = 1; n <= N; n++) {
    const nr = new Uint8Array(n + 1);
    nr[0] = 1; nr[n] = 1;
    for (let k = 1; k < n; k++) nr[k] = (row[k - 1] + row[k]) % p;
    rows.push(nr); row = nr;
  }
  return rows;
}

async function still(ws, idx, lv, frames = 90, scale = 0.08) {
  const r = await evalIn(ws, `window.__still(${idx}, ${JSON.stringify(lv)}, ${frames}, 1 << 20, ${scale}, 0)`);
  if (!r.ok) throw new Error("still failed: " + JSON.stringify(r));
  return r;
}
async function sampleCells(ws, pts, rad = 2) {
  const s = await evalIn(ws, `window.__sample(${JSON.stringify(pts)}, ${rad})`);
  return s;
}

async function bitPatch(ws, L, refFn, label, rad = 2, margin = 6) {
  const cells = visibleCells(L, margin);
  const pts = cells.map(([n, k]) => cellWorld(L, n, k));
  const bits = cells.map(([n, k]) => (refFn(n, k) ? 1 : 0));
  const s = await sampleCells(ws, pts, rad);
  const keep = s.out.map(o => o[0] > 24 && o[1] > 24 && o[0] < s.w - 24 && o[1] < s.h - 24 && o[2] >= 0 && o[3] === 0);
  const lums = [], kbits = [];
  s.out.forEach((o, i) => { if (keep[i]) { lums.push(o[2]); kbits.push(bits[i]); } });
  const alive = lums.filter((_, i) => kbits[i] === 1), dead = lums.filter((_, i) => kbits[i] === 0);
  const am = mean(alive), dm = mean(dead);
  // linearized dead is truly ~0; the midpoint over-asks of rim cells
  // dimmed by clipped-ancestor weighting. The floor is the instrument's.
  const thr = Math.max(0.02, dm + 0.12 * (am - dm));
  let mism = 0;
  lums.forEach((l, i) => { if ((l > thr ? 1 : 0) !== kbits[i]) mism++; });
  report(label, mism === 0 && alive.length > 4 && dead.length > 4 && lums.length > 15,
    `${lums.length} cells (${alive.length}/${dead.length}), alive ${am.toFixed(3)} dead ${dm.toFixed(3)}, mismatches ${mism}`);
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

  // ---------- A: p=2, D=11, M=5 vs direct iteration ----------
  {
    await still(ws, IDX_POS, leverArr({ depth: 11, magnify: 5, nth: 1 }));
    const L = layout({ D: 11, M: 5, p: 2 });
    const rows = pascalRows(2, Math.min(L.R, 2100));
    await bitPatch(ws, L, (n, k) => rows[n][k] !== 0, "A bit-exact patch p=2 (direct iteration)");
  }

  // ---------- A2: p=3, D=7, M=2 ----------
  {
    await still(ws, IDX_POS, leverArr({ depth: 7, magnify: 2, nth: 2, tint: 0 }));
    const L = layout({ D: 7, M: 2, p: 3 });
    const rows = pascalRows(3, L.R);
    await bitPatch(ws, L, (n, k) => rows[n][k] !== 0, "A2 bit-exact patch p=3 (direct iteration)", 1);
  }

  // ---------- E: D=24, M=20 vs Lucas ----------
  {
    await still(ws, IDX_POS, leverArr({ depth: 24, magnify: 20, nth: 1 }));
    const L = layout({ D: 24, M: 20, p: 2 });
    console.log(`  deep window rows ${Math.ceil(L.win[1] / 2)}..${Math.floor(L.win[3] / 2)} of ${L.R}`);
    await bitPatch(ws, L, (n, k) => (n & k) === k, "E bit-exact at ~16.7M rows (Lucas closed form)", 3, 2);
  }

  // ---------- F: the two evaluators, CPU vs GPU cells ----------
  {
    await still(ws, IDX_POS, leverArr({ depth: 11, magnify: 5, nth: 1 }));
    const L = layout({ D: 11, M: 5, p: 2 });
    const cells = visibleCells(L);
    const pts = cells.map(([n, k]) => cellWorld(L, n, k));
    const s = await sampleCells(ws, pts, 2);
    const idxOf = new Map(cells.map(([n, k], i) => [n + ":" + k, i]));
    const cpu = new Float64Array(cells.length);
    const PF = { ...P0, depth: 11, magnify: 5, nth: 1 };
    const M = 1_200_000;
    let landed = 0;
    for (let i = 0; i < M; i++) {
      const dep = evaluate(def, PF, i);
      if (!dep) continue;
      // invert the seat to (n, k) on the continuous lattice: the cell
      // spans [2n, 2n+2) x [xu, xu+2), so floor, never round
      const yf = (-dep.y / L.km) + L.wc[1];
      const xf = (dep.x / L.km) + L.wc[0];
      const n = Math.floor(yf / 2);
      const k = Math.floor((xf - (L.R - 1 - n)) / 2);
      const key = n + ":" + k;
      if (idxOf.has(key)) { cpu[idxOf.get(key)] += 0.299 * dep.r + 0.587 * dep.g + 0.114 * dep.b; landed++; }
    }
    const gpu = s.out.map(o => (o[2] < 0 ? 0 : o[2]));
    const keep = s.out.map((o, i) => o[3] === 0);
    const xs = [], ys = [];
    for (let i = 0; i < cells.length; i++) if (keep[i]) { xs.push(cpu[i]); ys.push(gpu[i]); }
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) * (xs[i] - mx);
      syy += (ys[i] - my) * (ys[i] - my);
    }
    const corr = sxy / Math.sqrt(sxx * syy);
    report("F two evaluators agree per cell", corr > 0.98,
      `Pearson r = ${corr.toFixed(4)} over ${xs.length} cells (${landed} CPU deposits landed in patch)`);
  }

  // ---------- C: same picture as the plate at MAGNIFY 0 ----------
  {
    const GR = 96, EXTENT = 1.5;
    const pts = [];
    for (let iy = 0; iy < GR; iy++) for (let ix = 0; ix < GR; ix++)
      pts.push([((ix + 0.5) / GR - 0.5) * 2 * EXTENT, ((iy + 0.5) / GR - 0.5) * 2 * EXTENT]);
    await still(ws, IDX_POS, leverArr({ depth: 12, magnify: 0 }));
    const s1 = await sampleCells(ws, pts, 3);
    await still(ws, IDX_PLATE, leverArr({ depth: 12, magnify: 0 }));
    const s0 = await sampleCells(ws, pts, 3);
    const a = s1.out.map(o => (o[2] < 0 ? 0 : o[2]));
    const b = s0.out.map(o => (o[2] < 0 ? 0 : o[2]));
    const keep = s1.out.map((o, i) => o[3] === 0 && s0.out[i][3] === 0);
    const xs = [], ys = [];
    for (let i = 0; i < a.length; i++) if (keep[i]) { xs.push(a[i]); ys.push(b[i]); }
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) * (xs[i] - mx);
      syy += (ys[i] - my) * (ys[i] - my);
    }
    const corr = sxy / Math.sqrt(sxx * syy);
    const ta = xs.reduce((u, v) => u + v, 0), tb = ys.reduce((u, v) => u + v, 0);
    report("C same picture as the plate", corr > 0.99,
      `Pearson r = ${corr.toFixed(4)} unsorted over ${xs.length} cells at MAGNIFY 0`);
    report("C2 total light matches", ta / tb > 0.9 && ta / tb < 1.11,
      `positive/plate linearized totals ${(ta / tb).toFixed(3)}`);
  }

  const fails = results.filter(r => !r.ok).length;
  console.log(fails ? `\n${fails} FAILURES` : "\nall nested-positive probes pass");
  ws.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("probe error:", e.message); process.exit(2); });
