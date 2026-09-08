// Does the sequencer program a positive lowers to compute the bits its
// emitted GLSL computes?
//
//   node tools/verify-cft-positive.mjs [positives/hopf.pos.mjs]
//        [--points 4096] [--golden 256] [--uT 0]
//
// Three evaluations of one positive are compared, sample by sample,
// deposit by deposit:
//
//   THE REFERENCE. core/glsl-f32.mjs interprets the pinned shape
//   function core/emit.mjs writes - with the shipped det library, the
//   unfused prelude and the shared header beneath it - at binary32,
//   one rounding per operation, real branches. Under the pinned
//   discipline that text is what a conforming driver computes, which
//   is the argument docs/CFT-DETLIB.md made for the library and makes
//   again one level up.
//
//   libcft. core/emit-cft.mjs lowers the same text to a program image
//   and cft_program_load / cft_program_run execute it - the coprocessor
//   project's own executor, reached through its node build. This is
//   the run that would go to a card unchanged.
//
//   THE GOLDEN MODEL. python/cft_golden/seq.py, "the definition of
//   correct for programs" in that project, runs the same image bytes
//   over a subset of the lanes (it is pure Python). The RTL is held to
//   it bit for bit, so agreement here is agreement with the tile's
//   specification rather than with one implementation of it.
//
// The samples are a frame's own points: q, rnd.x and seed derived from
// the sample index exactly as the atlas header derives them, half
// sequential from zero and half spread across the index range by the
// header's hash. The two prologue statements run on the host per
// sample, from the same parsed text (core/emit-cft.mjs says why that
// costs the parity claim nothing), and their result is the program's
// third stream.
//
// Beside the bit comparison, an ACCURACY column that is not a parity
// claim: the CPU evaluator (core/measure.mjs, float64) runs the same
// walk from the same stream state, and the distance between it and the
// binary32 reference is reported in ULPs of the reference. It says how
// far float32 is from the walk's meaning; it cannot say which
// implementation is right, and is not asked to.
//
// CFT_ROOT points at the cft-fp256 checkout; the sibling is the
// default. Without it there is no libcft and no golden model, and the
// run says so rather than passing.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { lowerPositive, hostPrologue } from "../core/emit-cft.mjs";
import { bits as f32bits, asF32 } from "../core/glsl-f32.mjs";
import { libcftEntry, Machine } from "../core/cft-run.mjs";
import { hashu, u2f, Stream, Vec2, leverDefaults } from "../core/measure.mjs";
import { NREG, IMEM_D } from "../core/cft-isa.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "build", "cft");
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
const target = argv.find((a, i) => !a.startsWith("--") && !["--points", "--golden", "--uT"].includes(argv[i - 1]))
             || join(ROOT, "positives", "hopf.pos.mjs");
const POINTS = Number(opt("--points", "4096"));
const GOLDEN = Number(opt("--golden", "256"));
const UT = Math.fround(Number(opt("--uT", "0")));

const hex = (u) => "0x" + (u >>> 0).toString(16).padStart(8, "0");
const isNaNbits = (u) => ((u & 0x7f800000) === 0x7f800000) && (u & 0x007fffff) !== 0;
const fr = Math.fround;

// ---- the positive, lowered
const pos = (await import(pathToFileURL(resolve(target)).href)).default;
const id = pos.id.replace(/_pos$/, "");
const L = lowerPositive(pos, { uT: UT });
const { prog } = L;
console.log(`${id} -> cft-fp256 sequencer program`);
console.log(`  words      : ${prog.counts.total} of ${IMEM_D} (${prog.counts.alu} ALU, ` +
            `${prog.counts.control} control)`);
console.log(`  registers  : ${prog.regsUsed} of ${NREG}${prog.encodable ? "" : "   DOES NOT FIT"}`);
console.log(`  constants  : ${prog.counts.fixedConsts} program + ${prog.tail} per-run tail ` +
            `(P[0..7], uT) = ${prog.counts.consts}`);
console.log(`  needs      : ${prog.needs.join(", ") || "nothing beyond the ISA"}`);
console.log(`  inputs     : ${prog.args.map(a => `${a.stream}=${a.name}`).join("  ")}`);
console.log(`  deposits   : ${prog.results.map((d, i) => `${i}:${d.name}`).join("  ")}`);
console.log(`  prologue   : on the host, salt ${L.prologue.salt}u; uT = ${UT}`);
// A program that needs more registers than the lane has cannot be
// loaded, and there is no image for it. Its ARITHMETIC can still be
// scored: core/cft-run.mjs issues the lowered instructions one at a
// time through cft_run on a lane as wide as the program asks, which is
// the same operations in the same order under the same attributes
// (docs/SEQUENCER.md P1). The report says which path ran, because
// "correct, and it does not fit" and "correct, on the executor that
// would go to a card" are two different sentences.
const WIDE = !L.image;
if (WIDE) {
  console.log(`\n  NO IMAGE: the program needs ${prog.regsUsed} registers and the lane has ${NREG}.`);
  console.log(`  Scoring the arithmetic on a widened lane through cft_run instead; nothing here`);
  console.log(`  went through cft_program_load, and the golden model is not run.`);
}

// ---- the samples: a frame's own points, from the index
const n = POINTS;
const qx = new Uint32Array(n), qy = new Uint32Array(n), rx = new Uint32Array(n), seed = new Uint32Array(n);
const ptc = new Uint32Array(n);
for (let i = 0; i < n; i++) {
  const ia = i < n / 2 ? i >>> 0 : hashu((i ^ 0xA7C4F3D1) >>> 0);
  const qxf = u2f(Math.imul(ia, 3242174889) >>> 0);
  const qyf = u2f(Math.imul(ia, 2447445414) >>> 0);
  const h1 = hashu(ia), h2 = hashu(h1), h3 = hashu(h2), h4 = hashu(h3);
  qx[i] = f32bits(qxf); qy[i] = f32bits(qyf); rx[i] = f32bits(u2f(h1)); seed[i] = h4;
  ptc[i] = hostPrologue(L.ref, L.prologue, { qx: qxf, qy: qyf, rndx: u2f(h1), seed: h4 });
}

// ---- the reference
const Pd = leverDefaults(pos);
const P8 = new Array(8).fill(0);
pos.leverNames.forEach((nm, i) => { P8[i] = fr(Pd[nm]); });
L.ref.setGlobal("uT", UT);
const slotOf = (name, r) => {
  const [what, comp] = name.split(".");
  const i = "xyzw".indexOf(comp);
  if (what === "return") return r.value[i];
  return r.outs[what][i];
};
const want = prog.results.map(() => new Uint32Array(n));
let declined = 0;
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const r = L.ref.call(L.name, [[asF32(qx[i]), asF32(qy[i])], [asF32(rx[i]), 0, 0, 0], seed[i], P8]);
  if (r.value[1] === -20000) declined++;
  prog.results.forEach((d, k) => { want[k][i] = f32bits(slotOf(d.name, r)) >>> 0; });
}
const tRef = Date.now() - t0;

// ---- libcft: the image through cft_program_load / cft_program_run,
// or the instructions one by one through cft_run when there is no image
const u8 = (arr) => new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
const D = prog.results.length;
const got = prog.results.map(() => new Uint32Array(n));
let run, tLib, countsOk;
if (!WIDE) {
  const { Context } = await import(libcftEntry());
  const ctx = await Context.open("fp32");
  const t1 = Date.now();
  const loaded = ctx.loadProgram(L.image);
  run = loaded.run(u8(qx), u8(qy), u8(ptc));
  tLib = Date.now() - t1;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < D; k++) got[k][i] = Number(run.deposits[i * D + k].bits) >>> 0;
  countsOk = Array.from(run.counts).every(c => c === D);
  loaded.free();
} else {
  const M = await Machine.open();
  const t1 = Date.now();
  const r = M.run(prog, [qx, qy, ptc]);
  tLib = Date.now() - t1;
  for (let k = 0; k < D; k++) got[k].set(r.deposits[k]);
  run = { flags: r.flags, status: `wide lane, ${r.emulated} emulated` };
  countsOk = true;
  M.close();
}

// ---- compare
const rows = [];
let failed = 0;
for (let k = 0; k < D; k++) {
  let bad = 0, nanOnly = 0, first = null;
  for (let i = 0; i < n; i++) {
    const w = want[k][i], g = got[k][i];
    if (w === g) continue;
    if (isNaNbits(w) && isNaNbits(g)) { nanOnly++; continue; }
    bad++;
    if (!first) first = { index: i, ia: i < n / 2 ? i : hex(hashu((i ^ 0xA7C4F3D1) >>> 0)),
                          q: `${hex(qx[i])} ${hex(qy[i])}`, pt: hex(ptc[i]), want: hex(w), got: hex(g) };
  }
  if (bad) failed++;
  rows.push({ slot: k, name: prog.results[k].name, mismatch: bad, nanPayloadOnly: nanOnly, first });
}

// ---- the golden model, on a subset
let golden = null;
if (GOLDEN > 0 && !WIDE) {
  const m = Math.min(GOLDEN, n);
  const inPath = join(OUT, `${id}.golden-in.json`), outPath = join(OUT, `${id}.golden-out.json`);
  const imgPath = join(OUT, `${id}.cftp`);
  writeFileSync(imgPath, L.image);
  writeFileSync(inPath, JSON.stringify({
    a: Array.from(qx.slice(0, m), hex), b: Array.from(qy.slice(0, m), hex), c: Array.from(ptc.slice(0, m), hex),
  }));
  const cftRoot = process.env.CFT_ROOT || join(ROOT, "..", "cft-fp256");
  const t2 = Date.now();
  let log;
  try {
    log = execFileSync("python", [join(HERE, "cft-golden-run.py"), imgPath, inPath, outPath,
                                  "--cft-root", cftRoot], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    log = null;
    golden = { lanes: m, error: String(e.stderr || e.message).trim().split("\n").slice(-3).join(" | ") };
  }
  if (log) {
    const res = JSON.parse((await import("node:fs")).readFileSync(outPath, "utf8"));
    let vsLib = 0, vsRef = 0, nanOnly = 0, first = null;
    for (let i = 0; i < m; i++)
      for (let k = 0; k < D; k++) {
        const g = Number.parseInt(res.deposits[i * D + k], 16) >>> 0;
        if (g !== got[k][i]) vsLib++;
        const w = want[k][i];
        if (g !== w) { if (isNaNbits(g) && isNaNbits(w)) nanOnly++; else { vsRef++; if (!first) first = { index: i, slot: prog.results[k].name, want: hex(w), golden: hex(g) }; } }
      }
    golden = { lanes: m, seconds: res.seconds, insnsExecuted: res.insns_executed, flags: res.flags,
               status: res.status, mismatchVsLibcft: vsLib, mismatchVsReference: vsRef, nanPayloadOnly: nanOnly, first,
               countsOk: res.counts.every(c => c === D) };
    if (vsLib || vsRef) failed++;
  }
}

// ---- accuracy against the float64 walk
//
// Two numbers per deposit, because one misleads. The absolute
// difference says how far binary32 moved a coordinate or a colour in
// the units the plate deposits in. The ULP distance says the same in
// units of the reference's own spacing, and near zero that spacing is
// tiny while the arithmetic error is not - a colour channel that is
// a + b*cos(w) passes through zero and its ULP count there is a fact
// about zero, not about the plate - so the ULP column is taken only
// where |reference| >= 2^-8 and says so.
const ulpOf = (x) => {
  const a = Math.abs(x);
  if (!Number.isFinite(a)) return NaN;
  if (a < 2 ** -126) return 2 ** -149;
  return 2 ** (Math.floor(Math.log2(a)) - 23);
};
const AWAY = 2 ** -8;
const acc = prog.results.map(d => ({ name: d.name, maxAbs: 0, sumAbs: 0, n: 0,
                                     maxUlp: 0, sumUlp: 0, nUlp: 0, atMax: null }));
for (let i = 0; i < n; i++) {
  const s = new Stream(ptc[i], pos.chains);
  const d = pos.walk(Pd, s, new Vec2(asF32(qx[i]), asF32(qy[i])), UT);
  if (!d) continue;
  const f64 = { "return.x": d.x, "return.y": d.y, "return.z": d.z, "col.x": d.r, "col.y": d.g, "col.z": d.b };
  prog.results.forEach((r, k) => {
    const w = asF32(want[k][i]);
    const v = f64[r.name];
    if (v === undefined || !Number.isFinite(w) || !Number.isFinite(v)) return;
    const a = acc[k];
    const dabs = Math.abs(v - w);
    if (dabs > a.maxAbs) { a.maxAbs = dabs; a.atMax = { f32: w, f64: v, index: i }; }
    a.sumAbs += dabs; a.n++;
    if (Math.abs(w) >= AWAY) {
      const u = dabs / ulpOf(w);
      if (u > a.maxUlp) a.maxUlp = u;
      a.sumUlp += u; a.nUlp++;
    }
  });
}

// ---- report
const pad = (s, w) => String(s).padEnd(w), num = (s, w) => String(s).padStart(w);
console.log(`\n  samples    : ${n} (half sequential from ia = 0, half spread by the header's hash)` +
            (declined ? `; ${declined} declined` : ""));
console.log(`  reference  : ${tRef} ms interpreting the text;  libcft: ${tLib} ms ` +
            (WIDE ? `instruction by instruction through cft_run on a ${prog.regsUsed}-register lane`
                  : `for cft_program_load and cft_program_run`) +
            `;  flags ${run.flags}, status ${run.status}, counts ${countsOk ? "all " + D : "NOT all " + D}`);
console.log(`\n  ${pad("deposit", 10)} ${num("mismatch", 9)} ${num("NaN-only", 9)}  first`);
for (const r of rows)
  console.log(`  ${pad(r.name, 10)} ${num(r.mismatch, 9)} ${num(r.nanPayloadOnly, 9)}  ` +
              (r.first ? `#${r.first.index} ia=${r.first.ia} q=${r.first.q} pt=${r.first.pt}: want ${r.first.want}, got ${r.first.got}` : "-"));
if (golden) {
  if (golden.error) console.log(`\n  golden model: NOT RUN - ${golden.error}`);
  else console.log(`\n  golden model (seq.py) on ${golden.lanes} lanes, ${golden.seconds} s, ` +
                   `${golden.insnsExecuted} instructions executed: ` +
                   `${golden.mismatchVsLibcft} deposits differ from libcft, ` +
                   `${golden.mismatchVsReference} from the reference` +
                   (golden.nanPayloadOnly ? ` (${golden.nanPayloadOnly} NaN-payload-only)` : "") +
                   `; flags ${golden.flags}, status ${golden.status}` +
                   (golden.first ? `; first: #${golden.first.index} ${golden.first.slot} want ${golden.first.want} golden ${golden.first.golden}` : ""));
}
console.log(`\n  accuracy of binary32 against the float64 walk (not a parity claim):`);
console.log(`  ${pad("deposit", 10)} ${num("max |d|", 11)} ${num("mean |d|", 11)}   ` +
            `${num("max ULP", 9)} ${num("mean ULP", 9)}  (ULPs where |ref| >= 2^-8)`);
for (const a of acc)
  console.log(`  ${pad(a.name, 10)} ${num(a.maxAbs.toExponential(2), 11)} ` +
              `${num((a.n ? a.sumAbs / a.n : 0).toExponential(2), 11)}   ` +
              `${num(a.maxUlp.toFixed(1), 9)} ${num((a.nUlp ? a.sumUlp / a.nUlp : 0).toFixed(2), 9)}  ` +
              `over ${a.nUlp} of ${a.n}` +
              (a.atMax ? `; at max: f32 ${a.atMax.f32.toPrecision(7)} f64 ${a.atMax.f64.toPrecision(9)}` : ""));

writeFileSync(join(OUT, `${id}.verify.json`), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10), positive: pos.id, points: n, uT: UT,
  program: { words: prog.counts.total, alu: prog.counts.alu, registers: prog.regsUsed,
             constants: prog.counts.consts, fixedConstants: prog.counts.fixedConsts, tail: prog.tail,
             needs: prog.needs, gaps: prog.gaps, schedule: prog.schedulePicked },
  libcft: { flags: run.flags, status: run.status, countsOk, ms: tLib }, deposits: rows, golden,
  accuracy: acc.map(a => ({ name: a.name, maxAbs: a.maxAbs, meanAbs: a.n ? a.sumAbs / a.n : 0, n: a.n,
                            maxUlpAway: a.maxUlp, meanUlpAway: a.nUlp ? a.sumUlp / a.nUlp : 0, nAway: a.nUlp,
                            atMax: a.atMax })),
  identical: failed === 0,
}, null, 2) + "\n");
console.log(`\n  wrote build/cft/${id}.verify.json`);
console.log(failed ? `\n  ${failed} deposit slot(s) or oracle(s) did not reproduce the text's bits`
                   : WIDE ? `\n  every deposit reproduces the emitted text's bits - on a widened lane, ` +
                            `instruction by instruction; the program does not load as it stands`
                          : `\n  every deposit reproduces the emitted text's bits, through libcft's ` +
                            `program executor` + (golden && !golden.error ? " and the golden model" : ""));
process.exit(failed ? 1 : WIDE ? 2 : 0);
