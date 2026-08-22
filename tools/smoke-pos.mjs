// Native smoke for a positive: node tools/smoke-pos.mjs positives/x.pos.mjs
// The conversion sweep's self-check. Three gates:
//   1. the emitter accepts the walk (no refusals, valid subset)
//   2. the CPU evaluator runs it at several lever settings and clocks
//      without NaN, Infinity, or absurd coordinates
//   3. light actually lands (the measure is not empty), and declines
//      stay within reason
// This does NOT prove conformance - the browser bench does that,
// centrally - but a positive that fails here is not worth benching.
import { emitPlate } from "../core/emit.mjs";
import { evaluate, leverDefaults, hashu, u2f } from "../core/measure.mjs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const target = process.argv[2];
if (!target) { console.error("usage: node tools/smoke-pos.mjs positives/<id>.pos.mjs"); process.exit(2); }
const mod = await import(pathToFileURL(resolve(target)).href);
const pos = mod.default;
if (!pos || pos.kind !== "positive") { console.error("not a positive"); process.exit(2); }

let failed = 0;
const say = (ok, name, detail) => {
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "   " + detail : ""));
  if (!ok) failed++;
};

// gate 1: emission
try {
  const { glsl } = emitPlate(pos);
  say(true, "emits", `${glsl.split("\n").length} GLSL lines`);
} catch (e) {
  say(false, "emits", e.message);
  console.log("\nsmoke failed at emission; fix the walk or report the missing construct");
  process.exit(1);
}

// lever settings: defaults plus two hashed-but-lawful settings
function snapped(lv, u) {
  const raw = lv.min + u * (lv.max - lv.min);
  const s = Math.round((raw - lv.min) / lv.step) * lv.step + lv.min;
  return Math.min(lv.max, Math.max(lv.min, s));
}
function leverSet(seed) {
  // half the levers stay at their defaults each draw, so the setting
  // explores without wandering into every degenerate corner at once
  const P = {};
  pos.leverNames.forEach((n, i) => {
    const u = u2f(hashu((seed ^ Math.imul(i + 1, 2654435761)) >>> 0));
    const u2 = u2f(hashu((seed ^ Math.imul(i + 101, 40503)) >>> 0));
    P[n] = u2 < 0.5 ? pos.levers[i].def : snapped(pos.levers[i], u);
  });
  return P;
}
const configs = [
  { name: "defaults", P: leverDefaults(pos), t: 0 },
  { name: "defaults t=1.7", P: leverDefaults(pos), t: 1.7 },
  { name: "hashed levers A", P: leverSet(0xA11CE), t: 0.6 },
  { name: "hashed levers B", P: leverSet(0xB0B), t: 2.9 },
];

const N = 20000;
for (const cfg of configs) {
  let bad = 0, declines = 0, lum = 0, far = 0;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  let threw = null;
  for (let i = 0; i < N; i++) {
    let dep;
    try { dep = evaluate(pos, cfg.P, i, cfg.t); }
    catch (e) { threw = e.message; break; }
    if (dep === null) { declines++; continue; }
    const vals = [dep.x, dep.y, dep.z, dep.r, dep.g, dep.b];
    if (vals.some(v => typeof v !== "number" || !isFinite(v))) { bad++; continue; }
    if (Math.abs(dep.x) > 24 || Math.abs(dep.y) > 24 || Math.abs(dep.z) > 24) far++;
    lum += Math.max(0, 0.299 * dep.r + 0.587 * dep.g + 0.114 * dep.b);
    minX = Math.min(minX, dep.x); maxX = Math.max(maxX, dep.x);
    minY = Math.min(minY, dep.y); maxY = Math.max(maxY, dep.y);
  }
  if (threw) { say(false, cfg.name, "threw: " + threw); continue; }
  const kept = N - declines;
  // a windowed positive can be over-magnified into a lawfully empty
  // window (the plates do the same); that is a warning, not a failure
  const hasLoupe = pos.levers.some(l => l.label === "MAGNIFY");
  if (kept === 0 && hasLoupe) {
    console.log("WARN  " + cfg.name + "   all points declined (window likely over-magnified past the lattice; lawful)");
    continue;
  }
  const ok = bad === 0 && kept > N * 0.05 && lum > 0 && far < N * 0.02;
  say(ok, cfg.name,
    `${kept}/${N} deposit (${declines} decline), ${bad} malformed, ${far} far-out, ` +
    `x [${minX.toFixed(2)}, ${maxX.toFixed(2)}] y [${minY.toFixed(2)}, ${maxY.toFixed(2)}], mean lum ${(lum / Math.max(kept, 1)).toFixed(3)}`);
}

console.log(failed ? `\nsmoke: ${failed} FAILURES` : "\nsmoke passes");
process.exit(failed ? 1 : 0);
