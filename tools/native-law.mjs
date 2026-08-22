// Native law test: the positive against the plate, as distributions.
// The positive draws its own hash chains, so nothing is hash-exact;
// what must agree is the LAW - the biased depth draw, the six-try
// percolation survival, the wash-vs-lace brightness. The plate's walk
// is transcribed here from 58-critical.js verbatim (same hash, same
// u2f), both walks are instrumented identically, and the same
// quantity (glow) is binned on both sides.
import def from "../positives/critical.pos.mjs";
import { leverDefaults, hashu, u2f, Stream } from "../core/measure.mjs";

const WORLDS = 120, NPW = 6000;
const N = WORLDS * NPW;
const P = leverDefaults(def);
const b = Math.round(P.b), maxD = Math.round(P.depth);

// ---- the plate's walk, transcribed from its GLSL -------------------
function plateWalk(i, root) {
  let pt = hashu(hashu(i ^ 0x517E) ^ Math.imul(i, 40503) >>> 0);
  const draw = () => { pt = hashu(pt); return u2f(pt); };
  const d = Math.trunc(Math.pow(draw(), 0.65) * maxD);
  let scale = 1, addr = root >>> 0;
  let cellX = 0, cellY = 0, reached = 0;
  for (let l = 0; l < 22; l++) {
    if (l >= d) break;
    let moved = false;
    for (let k = 0; k < 6; k++) {
      const cx = Math.trunc(draw() * b), cy = Math.trunc(draw() * b);
      const caddr = hashu((addr ^ (cy * 97 + cx + 1)) >>> 0);
      if (u2f(caddr) < P.occupancy) {
        cellX += (cx * scale) / b - scale * 0.5 * (1 - 1 / b);
        cellY += (cy * scale) / b - scale * 0.5 * (1 - 1 / b);
        scale /= b; addr = caddr; reached += 1; moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  let jx = draw() - 0.5, jy = draw() - 0.5;
  const rim = Math.max(Math.abs(jx), Math.abs(jy)) * 2;
  if (u2f(hashu(pt ^ 77)) < P.hull && rim < 0.62) {
    const f = 0.92 / Math.max(rim, 1e-3);
    jx *= f; jy *= f;
  }
  const lv = reached / maxD;
  return { x: (cellX + jx * scale) * 1.9, y: (cellY + jy * scale) * 1.9,
           reached, glow: 0.12 + 1.9 * lv * lv };
}

// ---- the positive's walk, instrumented the same way ----------------
function positiveWalk(i, root) {
  const seed = hashu(hashu((i >>> 0) ^ 0xA5F15EED) ^ Math.imul(i, 2654435761) >>> 0);
  const s = new Stream(seed, root);
  const d = s.depth(P.depth, { bias: 0.65 });
  const fall = s.descend({ kind: "grid2", b }, d, {
    tries: 6,
    child: (a) => a.child(s.pick(P.b), s.pick(P.b)),
    keep: (c) => c.coin(P.occupancy),
  });
  let j = s.jitter2();
  const rim = j.chebyshev() * 2.0;
  if (s.u() < P.hull && rim < 0.62) j = j.scale(0.92 / Math.max(rim, 1e-3));
  const lv = fall.reached / maxD;
  const xy = fall.cell.at(j).scale(1.9);
  return { x: xy.x, y: xy.y, reached: fall.reached, glow: 0.12 + 1.9 * lv * lv };
}

// ---- run both, bin identically -------------------------------------
const GRID = 81;
const posReached = new Array(23).fill(0), plaReached = new Array(23).fill(0);
const posGrid = new Float64Array(GRID * GRID), plaGrid = new Float64Array(GRID * GRID);
const binOf = (x2) => Math.min(GRID - 1, Math.max(0, Math.trunc((x2 / 1.9 + 0.5) * GRID)));

let idx = 0;
for (let w = 0; w < WORLDS; w++) {
  const root = hashu(Math.imul(w + 1, 2654435761) ^ 0x5EED);
  for (let i = 0; i < NPW; i++, idx++) {
    const a = positiveWalk(idx, root);
    posReached[a.reached]++;
    posGrid[binOf(a.y) * GRID + binOf(a.x)] += a.glow;
    const q = plateWalk(idx, root);
    plaReached[q.reached]++;
    plaGrid[binOf(q.y) * GRID + binOf(q.x)] += q.glow;
  }
}

// ---- compare -------------------------------------------------------
let fails = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "PASS  " : "FAIL  ") + name + "   " + detail);
  if (!ok) fails++;
};

let l1 = 0;
for (let k = 0; k <= 22; k++) l1 += Math.abs(posReached[k] - plaReached[k]) / N;
console.log("  reached histogram (positive vs plate, % of points):");
for (let k = 0; k <= 15; k++) {
  const a = 100 * posReached[k] / N, q = 100 * plaReached[k] / N;
  if (a > 0.05 || q > 0.05)
    console.log(`    ${String(k).padStart(2)}: ${a.toFixed(2).padStart(6)}  ${q.toFixed(2).padStart(6)}  ${(a - q) >= 0 ? "+" : ""}${(a - q).toFixed(2)}`);
}
check("depth-of-death law agrees", l1 < 0.02,
  `L1 distance ${(l1 * 100).toFixed(2)}% (noise floor ~0.7% at this N)`);

const meanPos = posReached.reduce((s2, v, k) => s2 + v * k, 0) / N;
const meanPla = plaReached.reduce((s2, v, k) => s2 + v * k, 0) / N;
check("mean walk depth agrees", Math.abs(meanPos - meanPla) < 0.05,
  `positive ${meanPos.toFixed(3)} vs plate ${meanPla.toFixed(3)}`);

const sp = [...posGrid].sort((x2, y2) => x2 - y2);
const sq = [...plaGrid].sort((x2, y2) => x2 - y2);
const totP = sp.reduce((x2, y2) => x2 + y2, 0), totQ = sq.reduce((x2, y2) => x2 + y2, 0);
let qerr = 0, qn = 0;
for (let q = 10; q <= 95; q += 5) {
  const ip = Math.trunc((q / 100) * sp.length);
  const vp2 = sp[ip] / totP, vq = sq[ip] / totQ;
  if (vq > 1e-9) { qerr += Math.abs(vp2 - vq) / vq; qn++; }
}
check("cell-glow distribution agrees", qerr / qn < 0.08,
  `mean quantile error ${(100 * qerr / qn).toFixed(1)}% over ${qn} quantiles (same quantity both sides)`);

console.log(fails ? `\n${fails} FAILURES` : "\nnative law tests pass");
process.exit(fails ? 1 : 0);
