// What would close the gaps between the corpus and cft-fp256's tile, and
// by how much - measured on the programs as they lower today, so the
// next asks of that project are numbers rather than guesses.
//
//   node tools/measure-cft-gaps.mjs [--samples 128] [positives/x.pos.mjs ...]
//
// Per positive that lowers, from the scheduled graph core/cft-lower.mjs
// now returns beside the program:
//
//   HOISTING. A value that depends on nothing per-sample - only on the
//   levers, the clock and the program's constants - is the same on every
//   lane and in every iteration. Moved into the bank it needs no
//   register at all, since an operand can name a constant. The peak
//   register count is re-profiled over the same schedule with every such
//   value removed (an upper bound on what a re-schedule would reach),
//   and the bank it would need is counted, with the clock-dependent
//   share separately, because the clock is per sample when the darkroom's
//   shutter is open.
//
//   CALL. Every det function is inlined at each use. Each op carries the
//   function it came from, so the words a `CALL` would save are counted
//   per function: the copies beyond the first, less one call word and one
//   move per parameter and result at each site.
//
//   BREAK AS SETACT. Each loop with a `break` carries a running flag, and
//   every write in its body is selected against it. Were a lane that
//   left the loop simply inactive, those words go; and the loop's early
//   exit becomes real, so the tile runs each loop for as many trips as
//   its slowest ACTIVE lane needs rather than the literal bound. The
//   words are counted from the tags; the trips from the reference
//   interpreter over a block of samples at the lever defaults, per loop
//   invocation, with a block's cost as the maximum over its lanes.
//   Whether a loop with a break sits inside another loop is recorded,
//   because SETACT alone cannot express that today: a lane it turns off
//   stays off until ACTALL, and ACTALL is illegal inside a loop.
//
// Exits 0 whatever it finds; writes build/cft/gaps.json.

import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { lowerPositive } from "../core/emit-cft.mjs";
import { geometryOf, profileOf } from "../core/cft-lower.mjs";
import { DetLib, asF32, bits as f32bits } from "../core/glsl-f32.mjs";
import { hashu, u2f, leverDefaults } from "../core/measure.mjs";
import { NREG, IMEM_D, KMEM_D } from "../core/cft-isa.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "cft");
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SAMPLES = Number(flag("--samples", 128));
const files = argv.filter(a => a.endsWith(".pos.mjs")).map(f => resolve(f));
const targets = files.length ? files
  : readdirSync(join(ROOT, "positives")).filter(f => f.endsWith(".pos.mjs")).sort().map(f => join(ROOT, "positives", f));

// ---- the interpreter's loops, counted. The patched `for` mirrors the
// interpreter's own (core/glsl-f32.mjs stmt "for") and records, per loop
// and per invocation, how many trips began before the lane left.
const origStmt = DetLib.prototype.stmt;
let trips = null;                 // key -> { node, started[] } while measuring
const loopStack = [];
const nodeIds = new Map();
const idOf = (node) => { if (!nodeIds.has(node)) nodeIds.set(node, nodeIds.size); return nodeIds.get(node); };
DetLib.prototype.stmt = function (s, env) {
  if (s.n !== "for" || trips === null) return origStmt.call(this, s, env);
  this.stmt(s.init, env);
  const key = `${idOf(s)}@${loopStack.map(V => env.get(V)).join(",")}`;
  const V = s.init.decls[0].name;
  loopStack.push(V);
  let started = 0, ret = null;
  while (this.eval(s.cond, env)) {
    started++;
    const r = this.stmt(s.body, env);
    if (r && r.constructor && r.constructor.name === "Ret") { ret = r; break; }
    if (r && r.constructor && r.constructor.name === "Brk") break;
    this.stmt(s.step, env);
  }
  loopStack.pop();
  let rec = trips.get(key);
  if (!rec) { rec = { node: s, started: [] }; trips.set(key, rec); }
  rec.started.push(started);
  return ret;
};

const forsOf = (node, into) => {
  if (!node || typeof node !== "object") return into;
  if (node.n === "for") into.push(node);
  for (const k of ["body", "then", "els", "init", "step"]) {
    const c = node[k];
    if (Array.isArray(c)) c.forEach(x => forsOf(x, into)); else if (c && typeof c === "object") forsOf(c, into);
  }
  return into;
};

// ---- hoisting: the graph with every per-run value in the bank
function hoist(prog) {
  const { ops, order, geo, args, resultIds, phiNames } = prog.graph;
  const uni = new Uint8Array(ops.length), viaT = new Uint8Array(ops.length);
  for (const i of order) {
    const o = ops[i];
    if (o.ctrl || o.phiInit !== undefined || o.phiBack !== undefined || resultIds.ops.has(i)) continue;
    let u = 1, t = 0;
    for (const w of ["a", "b", "c"]) {
      const v = o[w];
      if (!v) continue;
      if (v.k !== undefined) continue;
      if (v.t !== undefined) { if (v.t === 8) t = 1; continue; }
      if (v.v !== undefined && uni[v.v]) { if (viaT[v.v]) t = 1; continue; }
      u = 0; break;
    }
    uni[i] = u; viaT[i] = u && t;
  }
  const keep = [];
  ops.forEach((o, i) => { if (!uni[i]) keep.push(i); });
  const newId = new Map(keep.map((id, k) => [id, k]));
  const newOps = keep.map(id => {
    const o = ops[id];
    if (o.ctrl) return o;
    const m = { ...o };
    for (const w of ["a", "b", "c"]) {
      const v = o[w];
      if (!v) continue;
      if (v.v !== undefined) m[w] = uni[v.v] ? { k: 0 } : { v: newId.get(v.v) };
    }
    return m;
  });
  const newOrder = order.filter(i => !uni[i]).map(i => newId.get(i));
  const geo2 = geometryOf(newOps, phiNames);
  const rid = { ops: new Set([...resultIds.ops].map(i => newId.get(i))), args: resultIds.args };
  const peak = profileOf(newOps, args, rid, newOrder, geo2).peak;
  let n = 0, nT = 0, inLoops = 0;
  ops.forEach((o, i) => { if (uni[i]) { n++; if (viaT[i]) nT++; if (geo.opLoop[i] >= 0) inLoops++; } });
  // THE FRONTIER: a per-run value some per-sample op reads. Only those
  // need a bank slot; the rest of the per-run sub-graph is computed on
  // the host or by an init program and never reaches the tile.
  const frontier = new Set();
  ops.forEach((o, i) => {
    if (o.ctrl || uni[i]) return;
    for (const w of ["a", "b", "c"]) { const v = o[w]; if (v && v.v !== undefined && uni[v.v]) frontier.add(v.v); }
  });
  let frontierViaClock = 0;
  for (const i of frontier) if (viaT[i]) frontierViaClock++;
  return { peak, hoisted: n, hoistedViaClock: nT, hoistedInLoops: inLoops,
           frontier: frontier.size, frontierViaClock, uni };
}

// ---- CALL: the words the inlined copies beyond the first cost
function callSaving(L, uni) {
  const { prog } = L;
  const byFn = new Map();
  prog.graph.ops.forEach((o, i) => { if (!o.ctrl && o.fn && !uni[i]) byFn.set(o.fn, (byFn.get(o.fn) || 0) + 1); });
  let saving = 0;
  const rows = [];
  for (const [fn, words] of byFn) {
    const sites = prog.callSites[fn] || 1;
    if (sites < 2) continue;
    const decl = L.low.byName.get(fn);
    const perCall = 1 + decl.params.length + 1;      // the call, the arguments in, the result out
    const s = words - Math.ceil(words / sites) - sites * perCall;
    if (s > 0) { saving += s; rows.push({ fn, words, sites, saving: s }); }
  }
  rows.sort((a, b) => b.saving - a.saving);
  return { saving, rows };
}

// ---- the running flag and its selects
const PRED_TAGS = new Set(["loop", "break", "phi-init __run", "phi-back __run"]);
function predication(prog) {
  const { ops, geo, phiNames } = prog.graph;
  let pred = 0, copies = 0;
  ops.forEach((o) => {
    if (o.ctrl) return;
    if (PRED_TAGS.has(o.tag)) pred++;
    else if (o.tag.startsWith("phi-init") || o.tag.startsWith("phi-back")) copies++;
  });
  // one AND of the path condition with the flag per loop that has one
  const loops = geo.loops.map((l, k) => {
    const rep = ops[l.repeatOp];
    const hasRun = rep.phis.some(ph => phiNames[ph] === "__run");
    const bodyOps = ops.reduce((n, o, i) => n + (!o.ctrl && geo.opLoop[i] === k ? 1 : 0), 0);
    return { trip: l.trip, depth: l.depth, hasRun, bodyOps };
  });
  pred += loops.filter(l => l.hasRun).length;
  return { pred, copies, loops, nestedBreakLoops: loops.filter(l => l.hasRun && l.depth > 1).length };
}

// ---- the trips a block runs: the literal bounds against the slowest lane
function tripsOf(L, loopsGeo) {
  const { pos, prog } = L;
  const fors = forsOf(L.ref.byName.get(L.name).body, []);
  if (fors.length !== loopsGeo.length) return { error: `${fors.length} for statements, ${loopsGeo.length} REPEATs` };
  for (let k = 0; k < fors.length; k++) {
    const bound = fors[k].cond.r.value | 0;
    if (bound !== loopsGeo[k].trip) return { error: `loop ${k}: bound ${bound}, REPEAT ${loopsGeo[k].trip}` };
  }
  const geoIndex = new Map(fors.map((f, k) => [f, k]));
  const P8 = new Array(8).fill(0);
  const Pd = leverDefaults(pos);
  pos.leverNames.forEach((nm, i) => { P8[i] = Math.fround(Pd[nm]); });
  L.ref.setGlobal("uT", 0);
  trips = new Map();
  const n = SAMPLES;
  for (let i = 0; i < n; i++) {
    const ia = i < n / 2 ? i >>> 0 : hashu((i ^ 0xA7C4F3D1) >>> 0);
    const qxf = u2f(Math.imul(ia, 3242174889) >>> 0);
    const qyf = u2f(Math.imul(ia, 2447445414) >>> 0);
    const h1 = hashu(ia), h2 = hashu(h1), h3 = hashu(h2), h4 = hashu(h3);
    L.ref.call(L.name, [[asF32(qxf), asF32(qyf)], [asF32(u2f(h1)), 0, 0, 0], h4, P8]);
  }
  const log = trips; trips = null;
  // a block's cost today: every trip of every loop, nested invocations
  // multiplied out. With the exit: per invocation, the slowest lane.
  const w = loopsGeo.map(l => l.bodyOps);
  let now = 0, withExit = 0;
  const perLoop = loopsGeo.map(() => ({ invocations: 0, startedMax: 0, startedMean: 0, bound: 0 }));
  loopsGeo.forEach((l, k) => {
    let outer = 1;
    for (let j = k - 1; j >= 0; j--) if (loopsGeo[j].depth < l.depth && (perLoop[j].bound = loopsGeo[j].trip)) { outer *= loopsGeo[j].trip; break; }
    perLoop[k].bound = l.trip;
  });
  // nested invocations under the current scheme: product of the bounds of
  // the enclosing loops, found by depth walking back
  const enclosingProduct = (k) => {
    let prod = 1, d = loopsGeo[k].depth;
    for (let j = k - 1; j >= 0 && d > 1; j--) if (loopsGeo[j].depth === d - 1) { prod *= loopsGeo[j].trip; d--; }
    return prod;
  };
  loopsGeo.forEach((l, k) => { now += enclosingProduct(k) * l.trip * w[k]; });
  let means = loopsGeo.map(() => [0, 0]);
  for (const [, rec] of log) {
    const k = geoIndex.get(rec.node);
    const mx = Math.max(...rec.started);
    withExit += mx * w[k];
    perLoop[k].invocations++;
    perLoop[k].startedMax = Math.max(perLoop[k].startedMax, mx);
    means[k][0] += rec.started.reduce((a, b) => a + b, 0); means[k][1] += rec.started.length;
  }
  perLoop.forEach((p, k) => { p.startedMean = means[k][1] ? +(means[k][0] / means[k][1]).toFixed(1) : 0; });
  return { samples: n, bodyWordsPerBlockNow: now, bodyWordsPerBlockWithExit: withExit,
           speedup: withExit ? +(now / withExit).toFixed(2) : null, perLoop };
}

const rows = [];
for (const f of targets) {
  const pos = (await import(pathToFileURL(f).href)).default;
  let L;
  try { L = lowerPositive(pos); } catch (e) { rows.push({ id: pos.id, refused: e.message.split("\n")[0].slice(0, 90) }); continue; }
  const { prog } = L;
  const h = hoist(prog);
  const c = callSaving(L, h.uni);
  const p = predication(prog);
  const t = prog.graph.geo.loops.length ? tripsOf(L, p.loops) : null;
  const words = prog.counts.total;
  const wordsAfter = words - h.hoisted - p.pred - c.saving;
  rows.push({
    id: pos.id, words, regs: prog.regsUsed, consts: prog.consts.length, loops: prog.loops.length,
    fits: L.fits,
    hoist: { peak: h.peak, values: h.hoisted, viaClock: h.hoistedViaClock, inLoops: h.hoistedInLoops,
             frontier: h.frontier, frontierViaClock: h.frontierViaClock,
             bank: prog.consts.length + h.frontier },
    call: { saving: c.saving, top: c.rows.slice(0, 4) },
    predication: { words: p.pred, phiCopies: p.copies, breakLoops: p.loops.filter(l => l.hasRun).length,
                   nestedBreakLoops: p.nestedBreakLoops },
    wordsAfter,
    trips: t,
  });
  const r = rows[rows.length - 1];
  console.log(`${pos.id.padEnd(14)} ${String(words).padStart(6)}w ${String(prog.regsUsed).padStart(4)}r ` +
              `hoist:${String(h.peak).padStart(4)}r ${String(h.hoisted).padStart(4)}v ${String(h.frontier).padStart(3)}f bank ${String(r.hoist.bank).padStart(3)} ` +
              `call:-${String(c.saving).padStart(5)} pred:-${String(p.pred).padStart(4)} copies ${String(p.copies).padStart(4)} ` +
              `after:${String(wordsAfter).padStart(6)}w  loops ${prog.loops.length} brk ${r.predication.breakLoops} nested ${p.nestedBreakLoops}` +
              (t && !t.error ? `  exit x${t.speedup}` : t && t.error ? `  trips: ${t.error}` : ""));
}

const lowered = rows.filter(r => !r.refused);
const over = lowered.filter(r => r.regs > NREG);
const sum = {
  positives: rows.length, lowered: lowered.length,
  overRegisters: over.length,
  overRegistersAfterHoist: over.filter(r => r.hoist.peak > NREG).length,
  over64AfterHoist: over.filter(r => r.hoist.peak > 64).length,
  overImage: lowered.filter(r => r.words > IMEM_D).length,
  overImageAfterAll: lowered.filter(r => r.wordsAfter > IMEM_D).length,
  overBankAfterHoist: lowered.filter(r => r.hoist.bank > KMEM_D).length,
  withBreakLoops: lowered.filter(r => r.predication.breakLoops > 0).length,
  withNestedBreakLoops: lowered.filter(r => r.predication.nestedBreakLoops > 0).length,
  callSavingTotal: lowered.reduce((a, r) => a + r.call.saving, 0),
  predicationTotal: lowered.reduce((a, r) => a + r.predication.words, 0),
  phiCopiesTotal: lowered.reduce((a, r) => a + r.predication.phiCopies, 0),
  hoistedTotal: lowered.reduce((a, r) => a + r.hoist.values, 0),
  speedups: lowered.filter(r => r.trips && r.trips.speedup).map(r => r.trips.speedup).sort((a, b) => a - b),
};
console.log("\n" + JSON.stringify(sum, null, 1));
writeFileSync(join(OUT, "gaps.json"), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), samples: SAMPLES, summary: sum, rows }, null, 2) + "\n");
console.log("wrote build/cft/gaps.json");
