// What a positive's program costs a lane on the card, estimated from the
// program alone - the model the spiller and the other lowering choices are
// scored against before a card is involved.
//
//   node tools/cft-cost-model.mjs [--json out.json] [--no-trips] [positives/x.pos.mjs ...]
//
// THE MODEL is two numbers from the 2026-09-17 card day (docs/CFT-SILICON.md,
// "What one instruction costs on silicon"): an arithmetic instruction costs
// one unit a lane and every control-coded one measured - STL, LDL, STX, LDX,
// SETACT - four. Each instruction is weighted by how many times a lane block
// executes it: the product of its enclosing loops' trip counts, where a
// loop's trips are the slowest of 128 sampled lanes at the lever defaults
// (build/cft/gaps.json, measured by tools/measure-cft-gaps.mjs; a block of
// 128 lanes runs until its slowest lane leaves) or its literal bound when
// that measurement is missing or --no-trips is given.
//
// What it cannot see: a lane block that holds a slower lane than the 128
// sampled, and the per-run costs a run pays once. It is a ranking device,
// held to the card by the calibration it prints against the measured rates.

import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { lowerPositive } from "../core/emit-cft.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const JSON_OUT = opt("--json", null);
const NO_TRIPS = argv.includes("--no-trips");
const files = argv.filter((a, i) => a.endsWith(".pos.mjs") && argv[i - 1] !== "--json");
const targets = files.length ? files.map(f => resolve(f))
  : readdirSync(join(ROOT, "positives")).filter(f => f.endsWith(".pos.mjs")).sort().map(f => join(ROOT, "positives", f));

export const COST = { alu: 1, ctrl: 4 };                 // card day, 2026-09-17
const CONTROL_CODED = new Set(["stl", "ldl", "stx", "ldx", "setact"]);

const gapsPath = join(ROOT, "build", "cft", "gaps.json");
const gaps = !NO_TRIPS && existsSync(gapsPath) ? JSON.parse(readFileSync(gapsPath, "utf8")) : null;

/** Weighted instruction counts of one lowered program. `trips[k]` is the
 *  k-th REPEAT's measured trips, when known. */
export function costOf(prog, trips = null) {
  const stack = [];                         // weights of the open loops
  let loopIndex = 0;
  const w = () => stack.reduce((a, b) => a * b, 1);
  const tally = { alu: 0, scratch: 0, setact: 0, loopCtl: 0, cost: 0,
                  staticAlu: 0, staticScratch: 0, scratchInLoops: 0 };
  for (const ins of prog.insns) {
    if (ins.ctrl === "repeat") {
      const measured = trips && trips[loopIndex] !== undefined ? trips[loopIndex] : null;
      loopIndex++;
      stack.push(Math.max(1, measured ?? ins.trip));
      continue;
    }
    if (ins.ctrl === "endrep") { tally.loopCtl += w(); tally.cost += w() * COST.alu; stack.pop(); continue; }
    const kind = ins.ctrl ?? ins.mem ?? null;
    const weight = w();
    if (kind && CONTROL_CODED.has(kind)) {
      if (kind === "setact") tally.setact += weight; else { tally.scratch += weight; tally.staticScratch++; if (stack.length) tally.scratchInLoops++; }
      tally.cost += weight * COST.ctrl;
    } else if (!kind) {
      tally.alu += weight; tally.staticAlu++;
      tally.cost += weight * COST.alu;
    }
  }
  return tally;
}

function tripsFor(id) {
  if (!gaps) return null;
  const row = gaps.rows.find(r => r.id === id);
  if (!row || !row.trips || !row.trips.perLoop) return null;
  return row.trips.perLoop.map(p => (p.invocations ? p.startedMax : 0));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const rows = [];
  for (const f of targets) {
    const pos = (await import(pathToFileURL(f).href)).default;
    let L;
    try { L = lowerPositive(pos); } catch (e) { rows.push({ id: pos.id, error: e.message.split("\n")[0] }); continue; }
    const t = costOf(L.prog, tripsFor(pos.id));
    rows.push({ id: pos.id.replace(/_pos$/, ""), words: L.prog.counts.total, registers: L.prog.regsUsed,
                scratchSlots: L.prog.scratch.slots,
                hoisted: L.prog.hoist ? L.prog.hoist.count : 0,
                opsOffTheLane: L.prog.hoist ? L.prog.hoist.removed : 0,
                schedule: L.prog.schedulePicked, bank: L.prog.consts.length, ...t });
    const r = rows[rows.length - 1];
    console.log(`${r.id.padEnd(12)} words ${String(r.words).padStart(6)}  regs ${String(r.registers).padStart(2)}  ` +
                `static scratch ${String(r.staticScratch).padStart(5)} (${String(r.scratchInLoops).padStart(4)} in loops)  ` +
                `executed: alu ${r.alu.toExponential(2)}  scratch ${r.scratch.toExponential(2)}  setact ${r.setact.toExponential(2)}  ` +
                `cost ${r.cost.toExponential(3)}`);
  }
  // calibration against the card's measured rates for the images THIS
  // lowering writes - 2026-09-18, the single tile, 65,536 lanes (rule30
  // 4,096), docs/silicon/2026-09-18/cmp-rate-new-single.jsonl. The card
  // day's rates belong to the card day's images; comparing today's model
  // with them was comparing two programs.
  const measured = { psf: 0.200, hopf: 0.608, mand: 2.592, jong: 3.697, starfield: 4.724, throughput: 15.42,
                     stdmap: 81.35, nested: 147.18, threebody: 2617.0, rule30: 5103.2 };
  const cal = rows.filter(r => measured[r.id] !== undefined && r.cost);
  if (cal.length) {
    console.log("\ncalibration: model cost per lane against the card's measured microseconds a lane");
    for (const r of cal.sort((a, b) => a.cost - b.cost))
      console.log(`  ${r.id.padEnd(12)} model ${r.cost.toExponential(3).padStart(10)}  card ${String(measured[r.id]).padStart(9)} us  ` +
                  `ns per model unit ${(measured[r.id] * 1000 / r.cost).toFixed(3)}`);
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ model: COST, rows }, null, 2) + "\n");
}
