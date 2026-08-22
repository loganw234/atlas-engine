// Conformance between an original plate and its positive restatement:
//   node tools/verify-pair.mjs <plateId> [t]     one pair, verdict
//   node tools/verify-pair.mjs --all [t]         every built positive
// Renders both at the ORIGINAL's default levers on the bench-all page,
// bins both onto a cell grid, and scores per-cell correlation with
// clipped cells excluded. Also checks the lever contract: a positive
// must carry the same levers in the same order as its plate.
import { launchChrome, pageSession, evalIn } from "./cdp.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BENCH = "file:///" + join(root, "harness", "bench-all.html").replace(/\\/g, "/");
const PROFILE = "C:/Users/logan/AppData/Local/Temp/claude/C--Users-logan-source-repos-PrettyCloud/5bec1cbb-f19f-414e-ada6-4189040214dd/scratchpad/chrome-profile";
const PORT = 9223;
const GRID = 96, EXTENT = 1.55, RAD = 3;
// 2^22 distinct points at 30 frames: frames only re-expose the same
// point ids, so distinct-point count is what beats per-cell shot noise
// on volume measures (measured on qjulia: r 0.933 at 2^20, 0.991 at 2^23)
// Diffuse volumetric plates (qjulia, bulb) spread points thinly over a
// 3D measure, so per-cell Poisson noise sets a floor that falls as 1/N.
// Both converge on their originals at the shot-noise rate, so --points
// buys agreement rather than hiding disagreement: raise it, do not
// lower the threshold. Measured on bulb: r 0.864 / 0.962 / 0.980 at
// 2^20 / 2^22 / 2^23.
const DIFFUSE = { qjulia: 23, bulb: 23, hilbert: 23 };
const pArg = process.argv.indexOf("--points");
const POINTS = pArg > 0 ? parseInt(process.argv[pArg + 1]) : 0;
const fArg = process.argv.indexOf("--frames");
const FRAMES = fArg > 0 ? parseInt(process.argv[fArg + 1]) : 30;

const index = JSON.parse(readFileSync(join(root, "build", "bench-index.json"), "utf8"));
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
  const d = Math.sqrt(sxx * syy);
  return d > 0 ? sxy / d : 0;
}

async function gpuGrid(ws, idx, levers, t, frames = 60, exp = 22) {
  const still = await evalIn(ws,
    `window.__still(${idx}, ${JSON.stringify(levers)}, ${frames}, 1 << ${exp}, ${0.05 * 15 * 4} / (${frames} * (1 << (${exp} - 22))), ${t})`);
  if (!still.ok) throw new Error(`still failed for idx ${idx}: ${JSON.stringify(still)}`);
  const pts = [];
  for (let iy = 0; iy < GRID; iy++) for (let ix = 0; ix < GRID; ix++) pts.push(cellWorld(ix, iy));
  const s = await evalIn(ws, `window.__sample(${JSON.stringify(pts)}, ${RAD})`);
  const g = new Float64Array(GRID * GRID), sat = new Float64Array(GRID * GRID);
  s.out.forEach((o, i) => { g[i] = o[2] < 0 ? 0 : o[2]; sat[i] = o[3]; });
  return { g, sat };
}

async function verifyOne(ws, id, t) {
  const iO = index.originals[id];
  const iP = index.positives[id + "_pos"];
  if (iO === undefined) return { id, status: "no-original" };
  if (iP === undefined) return { id, status: "no-positive" };

  // lever contract: same count, labels, ranges, defaults, same order
  const contract = await evalIn(ws, `(function(){
    const a = Atlas.plates[${iO}].params, b = Atlas.plates[${iP}].params;
    if (a.length !== b.length) return "count " + a.length + " vs " + b.length;
    for (let i = 0; i < a.length; i++) {
      for (const k of ["label", "min", "max", "step", "def"]) {
        if (a[i][k] !== b[i][k]) return "lever " + i + " " + k + ": " + a[i][k] + " vs " + b[i][k];
      }
    }
    return "ok";
  })()`);

  const levers = await evalIn(ws, `Atlas.plates[${iO}].params.map(p => p.def)`);
  const exp = POINTS || DIFFUSE[id] || 22;
  const A = await gpuGrid(ws, iO, levers, t, FRAMES, exp);
  const B = await gpuGrid(ws, iP, levers, t, FRAMES, exp);
  const xs = [], ys = [];
  let clip = 0;
  for (let i = 0; i < GRID * GRID; i++) {
    if (A.sat[i] > 0 || B.sat[i] > 0) { clip++; continue; }
    xs.push(A.g[i]); ys.push(B.g[i]);
  }
  const r = corrOf(xs, ys);
  const ta = xs.reduce((s, v) => s + v, 0), tb = ys.reduce((s, v) => s + v, 0);
  const ratio = ta > 0 ? tb / ta : 0;
  const status = r >= 0.97 && ratio > 0.8 && ratio < 1.25 ? "PASS"
               : r >= 0.90 ? "WARN" : "FAIL";
  return { id, status, r: +r.toFixed(4), ratio: +ratio.toFixed(3),
           cells: xs.length, clipped: clip, contract, points: `2^${exp}` };
}

(async () => {
  const args = process.argv.slice(2);
  const all = args[0] === "--all";
  const t = parseFloat(args[all ? 1 : 1] || "1.3");
  const ids = all
    ? Object.keys(index.positives).map(k => k.replace(/_pos$/, "")).filter(k => index.originals[k] !== undefined)
    : [args[0]];

  let ws;
  try { ws = await pageSession(PORT, ""); }
  catch (e) {
    await launchChrome({ port: PORT, profile: PROFILE, url: BENCH });
    await settle(2000);
    ws = await pageSession(PORT, "bench-all");
  }
  await evalIn(ws, `location.href = ${JSON.stringify(BENCH)}; true`).catch(() => {});
  await settle(3000);
  if (!(await evalIn(ws, "window.__ready"))) { console.log("bench-all failed to init"); process.exit(2); }

  const results = [];
  for (const id of ids) {
    try {
      const r = await verifyOne(ws, id, t);
      results.push(r);
      console.log(`${(r.status || "?").padEnd(6)} ${id.padEnd(12)} r=${r.r ?? "-"} ratio=${r.ratio ?? "-"} ` +
                  `cells=${r.cells ?? "-"} clip=${r.clipped ?? "-"} levers=${r.contract ?? "-"}`);
    } catch (e) {
      results.push({ id, status: "ERROR", error: e.message });
      console.log(`ERROR  ${id.padEnd(12)} ${e.message}`);
    }
  }
  writeFileSync(join(root, "build", "conformance.json"), JSON.stringify({ t, results }, null, 2));
  const bad = results.filter(r => r.status !== "PASS").length;
  console.log(`\n${results.length - bad}/${results.length} PASS  (t=${t}); build/conformance.json written`);
  ws.close();
  process.exit(0);
})().catch(e => { console.error("verify-pair error:", e.message); process.exit(2); });
