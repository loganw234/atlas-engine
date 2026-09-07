// Does the sequencer target compute the det library's bits?
//
// Function by function, on a sweep of arguments, two ways of evaluating
// the same source are compared:
//
//   THE REFERENCE. core/glsl-f32.mjs interprets the SHIPPED text -
//   core/detlib.glsl.template substituted from the verified constants
//   and unfused, which tools/gen-detlib.mjs proves byte-identical to
//   the darkroom's deployed detlib.glsl - with real branches, real
//   calls, and one binary32 rounding per operation.
//
//   THE SEQUENCE. core/cft-lower.mjs compiles the same parse into a
//   straight-line sequencer program: every call inlined, every branch
//   turned into SELECT, every ISA gap expanded; then core/cft-run.mjs
//   executes that program one instruction at a time through libcft's
//   cft_run, which is the arithmetic docs/SEQUENCER.md's P1 says a
//   program is a schedule over.
//
// So the two differ in EVERYTHING except the text they came from: an
// expression-tree interpreter in JavaScript against a register machine
// running C. Agreement is a statement about the emission and about two
// independent binary32 implementations at once. A disagreement is
// reported with the input that produced it, never summarised away.
//
//   node tools/verify-cft-detlib.mjs                 every function
//   node tools/verify-cft-detlib.mjs det_sqrt        just one
//   node tools/verify-cft-detlib.mjs --points 16384  a longer sweep
//   node tools/verify-cft-detlib.mjs --isa-ext       include hashu (IMUL)
//   node tools/verify-cft-detlib.mjs --fused         score the FUSED
//                                                    emission instead
//
// CFT_ROOT points at the cft-fp256 checkout; without it there is no
// libcft and nothing to verify.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { shippedText, fusedText } from "../core/detlib-text.mjs";
import { HEADER_SRC, HEADER_PROVENANCE } from "../core/glsl-header.mjs";
import { DetLib } from "../core/glsl-f32.mjs";
import { lowerFunction, EXPANSIONS } from "../core/cft-lower.mjs";
import { Machine, isStraightLine } from "../core/cft-run.mjs";
import { sweepFor, bitsF32, DOMAINS } from "../core/cft-sweep.mjs";
import { IMEM_D, KREG, NREG, MAXD } from "../core/cft-isa.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
const only = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--points")[0];
const POINTS = Number(opt("--points", "4096"));
const ISA_EXT = flag("--isa-ext");
const FUSED = flag("--fused");
const MINMAX_OPCODE = flag("--minmax-opcode");

const hex = (u) => "0x" + (u >>> 0).toString(16).padStart(8, "0");
const isNaNbits = (u) => ((u & 0x7f800000) === 0x7f800000) && (u & 0x007fffff) !== 0;

const { text: shipped, fmaCount } = shippedText();
const lib = new DetLib(shipped + HEADER_SRC);
const emitLib = FUSED ? new DetLib(fusedText() + HEADER_SRC) : lib;

// The order the doc reports in: the primitives first, then what is
// built on them, so a failure reads as a cause rather than a list.
const ORDER = ["det_split12", "det_scale48", "det_twoprod", "det_recip", "det_div",
               "det_sqrt", "det_exp2", "det_log2_ef", "det_log2", "det_sincos",
               "det_sin", "det_cos", "det_tan", "det_atan", "det_acos", "det_mod",
               "det_pow", "u2f", "hashu"];
const names = ORDER.filter(n => lib.byName.has(n)).filter(n => !only || n === only);

const M = await Machine.open();
const rows = [];
let failed = 0;

for (const name of names) {
  const decl = lib.byName.get(name);
  const ins = decl.params.filter(p => !p.out);
  const row = { name, args: ins.length };

  let prog;
  try {
    prog = lowerFunction(emitLib, name,
      { isaExt: ISA_EXT, fuse: FUSED, minmaxOpcode: MINMAX_OPCODE });
  } catch (e) {
    row.status = "not emitted";
    row.reason = e.message.replace(/^cft-lower: /, "");
    rows.push(row);
    continue;
  }
  Object.assign(row, {
    alu: prog.counts.alu, total: prog.counts.total, regs: prog.regsUsed,
    consts: prog.counts.consts, deposits: prog.results.length,
    needs: prog.needs, gaps: prog.gaps, encodable: prog.encodable,
    schedules: prog.schedules, schedulePicked: prog.schedulePicked,
    straightLine: isStraightLine(prog),
  });

  const { cols, n, why, literals } = sweepFor(lib, name, ins.map(p => p.type), POINTS);
  row.sweep = n;
  row.sweepRange = why;
  row.sweepLiterals = literals;

  // the reference, point by point
  const want = prog.results.map(() => new Uint32Array(n));
  const toArg = (u, t) => (t === "float" ? bitsF32(u) : u >>> 0);
  for (let i = 0; i < n; i++) {
    const a = ins.map((p, k) => toArg(cols[k][i], p.type));
    const r = lib.call(name, a);
    prog.results.forEach((d, k) => {
      const v = d.name === "return" ? r.value : r.outs[d.name];
      want[k][i] = bitsOf(v, typeOfResult(decl, d.name));
    });
  }

  // the sequence, all lanes at once
  const got = M.run(prog, cols);
  row.flags = M.base.flagNames(got.flags);
  row.emulatedInstructions = got.emulated;

  const dom = DOMAINS[name];
  row.domain = dom ? dom.says : "the whole binary32 format, both arguments";
  let bad = 0, nanOnly = 0, outside = 0, inDom = 0, first = null, firstOut = null;
  for (let i = 0; i < n; i++) if (!dom || dom.test(ins.map((p, j) => cols[j][i]))) inDom++;
  row.inDomain = inDom;
  for (let k = 0; k < prog.results.length; k++)
    for (let i = 0; i < n; i++) {
      const w = want[k][i] >>> 0, g = got.deposits[k][i] >>> 0;
      if (w === g) continue;
      if (isNaNbits(w) && isNaNbits(g)) { nanOnly++; continue; }
      const where = {
        slot: prog.results[k].name, index: i,
        args: ins.map((p, j) => `${p.name}=${hex(cols[j][i])}`).join(" "),
        want: hex(w), got: hex(g),
      };
      if (dom && !dom.test(ins.map((p, j) => cols[j][i]))) {
        outside++; if (!firstOut) firstOut = where; continue;
      }
      bad++;
      if (!first) first = where;
    }
  row.mismatch = bad;
  row.outsideDomain = outside;
  row.nanPayloadOnly = nanOnly;
  row.first = first;
  row.firstOutside = firstOut;
  row.identical = bad === 0;
  if (bad) failed++;
  rows.push(row);
}

function typeOfResult(decl, slot) {
  if (slot === "return") return decl.ret;
  return decl.params.find(p => p.name === slot).type;
}
function bitsOf(v, t) {
  if (t === "float") { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v, true); return d.getUint32(0, true) >>> 0; }
  return v >>> 0;
}

// ------------------------------------------------------------- report
const mode = FUSED ? "FUSED emission (an experiment, not what ships)" : "shipped, unfused";
console.log(`det library -> cft-fp256 sequencer: ${mode}`);
console.log(`  source     : core/detlib.glsl.template + the verified record, ` +
            `${fmaCount} fma rewritten`);
console.log(`  header     : ${HEADER_PROVENANCE.file} lines ${HEADER_PROVENANCE.lines}`);
console.log(`  libcft     : binary32 through cft_run, one call per instruction`);
console.log(`  capacities : ${NREG} registers, ${KREG} addressable constants, ` +
            `${IMEM_D} instructions, ${MAXD} deposits\n`);

const pad = (s, w) => String(s).padEnd(w);
const num = (s, w) => String(s).padStart(w);
console.log(`${pad("function", 14)} ${num("arg", 3)} ${num("sweep", 6)} ${num("in-dom", 7)} ` +
            `${num("alu", 5)} ${num("img", 5)} ${num("reg", 4)} ${num("k", 4)} ` +
            `${pad("bits", 6)} reason / needs`);
console.log("-".repeat(112));
for (const r of rows) {
  if (r.status === "not emitted") {
    console.log(`${pad(r.name, 14)} ${num(r.args, 3)} ${num("-", 6)} ${num("-", 7)} ` +
                `${num("-", 5)} ${num("-", 5)} ${num("-", 4)} ${num("-", 4)} ` +
                `${pad("-", 6)} not emitted: ${r.reason}`);
    continue;
  }
  const notes = [];
  if (!r.encodable) notes.push(`needs ${r.regs} registers, the lane has ${NREG}`);
  if (r.needs.includes("kx")) notes.push(`needs indexed constants (${r.consts} > ${KREG})`);
  if (r.needs.includes("imul"))
    notes.push(`needs IMUL (${r.emulatedInstructions} instruction(s) emulated here)`);
  if (r.nanPayloadOnly) notes.push(`${r.nanPayloadOnly} NaN-payload-only`);
  if (r.outsideDomain) notes.push(`${r.outsideDomain} outside the stated domain`);
  if (r.mismatch) notes.push(`MISMATCH x${r.mismatch}`);
  console.log(`${pad(r.name, 14)} ${num(r.args, 3)} ${num(r.sweep, 6)} ${num(r.inDomain, 7)} ` +
              `${num(r.alu, 5)} ${num(r.total, 5)} ${num(r.regs, 4)} ${num(r.consts, 4)} ` +
              `${pad(r.identical ? "yes" : "NO", 6)} ${notes.join("; ") || "-"}`);
  if (r.first)
    console.log(`${" ".repeat(15)}first at ${r.first.slot} #${r.first.index}: ` +
                `${r.first.args} -> want ${r.first.want}, got ${r.first.got}`);
  if (r.firstOutside)
    console.log(`${" ".repeat(15)}outside: ${r.firstOutside.args} -> want ` +
                `${r.firstOutside.want}, got ${r.firstOutside.got}`);
}

const nk = rows.filter(r => r.needs && r.needs.includes("kx")).map(r => r.name);
const nr = rows.filter(r => r.needs && r.needs.includes("registers")).map(r => r.name);
const ni = rows.filter(r => r.needs && r.needs.includes("imul")).map(r => r.name);
console.log(`\nWhat the ISA as it stands cannot hold:`);
console.log(`  indexed constants (OPT-D 1.1): ${nk.length ? nk.join(" ") : "none"}`);
console.log(`  more than ${NREG} registers     : ${nr.length ? nr.join(" ") : "none"}`);
console.log(`  IMUL (OPT-D 1.2)              : ${ni.length ? ni.join(" ") : "none"}` +
            (ISA_EXT ? "" : "   (hashu not emitted without --isa-ext)"));

console.log(`\nThe ISA gaps each function had to expand, and what each expansion costs:`);
for (const [k, v] of Object.entries(EXPANSIONS))
  console.log(`  ${pad(k, 12)} ${num(v.insns, 2)} insns   valid on ${v.domain}`);

mkdirSync(join(ROOT, "build"), { recursive: true });
const suffix = FUSED ? "-fused" : MINMAX_OPCODE ? "-minmax-opcode" : "";
const out = join(ROOT, "build", `cft-detlib-verify${suffix}.json`);
writeFileSync(out, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  mode: FUSED ? "fused" : MINMAX_OPCODE ? "minmax-opcode" : "shipped",
  points: POINTS, isaExt: ISA_EXT, fmaRewritten: fmaCount,
  capacities: { NREG, KREG, IMEM_D, MAXD },
  expansions: EXPANSIONS, rows,
}, null, 2) + "\n");
console.log(`\nwrote ${out}`);

M.close();
console.log(failed ? `\n  ${failed} function(s) did not reproduce the library's bits`
                   : `\n  every emitted function reproduces the library's bits`);
process.exit(failed ? 1 : 0);
