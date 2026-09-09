// Emit a positive as a cft-fp256 sequencer program.
//
//   node tools/emit-cft.mjs positives/hopf.pos.mjs     one, and its record
//   node tools/emit-cft.mjs --all                      every positive, as a table
//
// Writes, under build/cft/:
//
//   <id>.cftp          the image: header and instruction stream, BANK_EXT,
//                      exactly the bytes cft_program_load takes
//   <id>.default.bank  the bank for the lever defaults and uT = 0: the
//                      program's constants, then the per-run tail
//   <id>.cfta          the same program as the coprocessor's assembly text
//   <id>.cft.json      the record: inputs, tail, deposits, constants with
//                      names, the instructions with their source tags
//   <id>.cft.txt       the same to read
//
// build/ is a product and is not tracked.
//
// --all is a MEASUREMENT of the corpus against the ISA as it stands,
// and exits 0 whatever it finds: which positives lower, which fit the
// lane's registers and the tile's image, and which are refused by a
// construct this pass does not hold yet - named, and counted, so the
// asks on the coprocessor's side rest on numbers.
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { lowerPositive, TAIL, GLOBALS_PROVENANCE, constantNames } from "../core/emit-cft.mjs";
import { decode, disasm, OP_NAME, RND_NAME, NREG, NREG_REV1, KREG, KMEM_D, IMEM_D, MAXD } from "../core/cft-isa.mjs";
import { EXPANSIONS, bitsF32 } from "../core/cft-lower.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "build", "cft");
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const all = argv.includes("--all");
const targets = all
  ? readdirSync(join(ROOT, "positives")).filter(f => f.endsWith(".pos.mjs")).sort()
      .map(f => join(ROOT, "positives", f))
  : [argv.find(a => !a.startsWith("--")) || join(ROOT, "positives", "hopf.pos.mjs")];

const hex8 = (u) => "0x" + (u >>> 0).toString(16).toUpperCase().padStart(8, "0") + "u";
const sha = (b) => createHash("sha256").update(b).digest("hex");

function recordOf(L) {
  const { prog, pos } = L;
  const knames = constantNames(pos, prog);
  const consts = prog.consts.map((bits, i) => ({
    index: i,
    bits: hex8(bits), f32: String(bitsF32(bits)), u32: bits >>> 0,
    name: knames[i],
    kind: i >= prog.tailBase ? "per-run tail" : "program constant",
    addressable: i < KREG ? "operand field" : "kx",
  }));
  const kname = consts.map(c => (c.name ? `k${c.index}:${c.name.split(" ")[0]}` : `k${c.index}`));
  const hexw = (w) => "0x" + w.toString(16).padStart(16, "0");
  const instructions = prog.insns.map((ins, pc) => {
    const w = prog.words ? prog.words[pc] : null;
    if (ins.ctrl) return { pc, word: w === null ? null : hexw(w), ctrl: ins.ctrl, trip: ins.trip, ra: ins.ra,
                           asm: ins.ctrl === "repeat" ? `repeat ${ins.trip}` : ins.ctrl === "setact" ? `setact r${ins.ra}` : ins.ctrl,
                           from: ins.ctrl === "setact" ? "break" : "for" };
    return {
      pc, word: w === null ? null : hexw(w),
      op: OP_NAME[ins.op] ?? `op${ins.op}`, rd: ins.rd, ra: ins.ra, rb: ins.rb, rc: ins.rc,
      ka: ins.ka, kb: ins.kb, kc: ins.kc, kx: ins.kx, imm: ins.imm, rnd: RND_NAME[ins.rnd],
      from: ins.tag,
      asm: w === null ? `${OP_NAME[ins.op] ?? ins.op} r${ins.rd}, r${ins.ra}, r${ins.rb}, r${ins.rc}`
                      : disasm(decode(w), kname),
    };
  });
  const control = prog.results.map((d, i) => ({
    pc: prog.insns.length + i, asm: `deposit r${d.reg}`, slot: i, name: d.name, reg: d.reg,
    word: prog.words ? hexw(prog.words[prog.insns.length + i]) : null,
  }));
  control.push({ pc: prog.insns.length + prog.results.length, asm: "halt",
                 word: prog.words ? hexw(prog.words[prog.words.length - 1]) : null });
  return {
    schema: 2,
    generated: new Date().toISOString().slice(0, 10),
    positive: { id: pos.id, levers: pos.leverNames, source: `positives/${pos.id.replace(/_pos$/, "")}.pos.mjs` },
    source: {
      form: "the pinned shape function core/emit.mjs writes, over the shipped det library, " +
            "the unfused prelude and the shared header; vectors scalarised",
      fmaRewritten: L.unit.fmaRewritten,
      globals: GLOBALS_PROVENANCE,
      prologue: "the two stream-seed statements run on the host; the program starts at pt " +
                `(salt ${L.prologue.salt}u)`,
    },
    isa: {
      target: "cft-fp256 orbit sequencer, docs/SEQUENCER.md revision 2 (2026-09-08)",
      precision: "fp32 (PREC_CODE 0)",
      capacities: { registers: NREG, addressableConstants: KREG, constantMemory: KMEM_D,
                    instructions: IMEM_D, deposits: MAXD },
      needsCaps: L.needsCaps,
    },
    image: L.image ? { bytes: L.image.length, sha256: sha(L.image), flags: "BANK_EXT" } : null,
    bank: { bytes: L.bank.length, sha256: sha(L.bank), values: prog.consts.map(hex8) },
    digest: L.digest,
    fits: L.fits,
    inputs: L.inputs,
    tail: { base: prog.tailBase, size: prog.tail,
            layout: Object.fromEntries(knames.slice(prog.tailBase).map((n, i) => [i, n])),
            values: L.tailValues.map(hex8), uT: L.uT },
    registers: { peak: prog.regsUsed, available: NREG, fits: prog.encodable,
                 inputs: prog.args.map(a => `r${a.reg} = ${a.name} (stream ${a.stream})`),
                 schedule: prog.schedulePicked, tried: prog.schedules },
    loops: prog.loops, carried: prog.phis,
    deposits: prog.results.map((d, i) => ({ slot: i, name: d.name, register: d.reg })),
    counts: prog.counts,
    needs: prog.needs,
    gaps: prog.gaps,
    folds: prog.folds,
    constants: consts,
    instructions,
    control,
    expansions: EXPANSIONS,
  };
}

function listingOf(rec) {
  const L = [];
  L.push(`# ${rec.positive.id} as a cft-fp256 sequencer program (revision 2)`);
  L.push(`# generated ${rec.generated}; ${rec.counts.alu} ALU + ${rec.counts.loop} loop + ` +
         `${rec.counts.control - rec.counts.loop} deposit/halt = ${rec.counts.total} of ${IMEM_D}; ` +
         `registers ${rec.registers.peak} of ${NREG}` + (rec.registers.fits ? "" : " - DOES NOT FIT") +
         `; constants ${rec.counts.consts} (${rec.counts.fixedConsts} program + ${rec.tail.size} per-run tail); ` +
         `${rec.loops.length} loop(s), ${rec.carried} carried value(s)`);
  L.push(`# inputs: ${rec.registers.inputs.join("; ")}`);
  L.push(`# deposits: ${rec.deposits.map(d => `${d.slot}:${d.name}=r${d.register}`).join(" ")}`);
  L.push(`# needs: ${rec.needs.length ? rec.needs.join(", ") : "nothing beyond the ISA"}`);
  L.push(`# image sha256 ${rec.image ? rec.image.sha256 : "-"}; bank sha256 ${rec.bank.sha256}; digest ${rec.digest ?? "-"}`);
  L.push("");
  L.push("constants (the bank a run brings)");
  for (const c of rec.constants)
    L.push(`  k${String(c.index).padStart(3)}  ${c.bits}  ${String(c.u32).padStart(10)}  ` +
           `${c.f32}${c.name ? "   " + c.name : ""}${c.kind === "per-run tail" ? "   [tail]" : ""}`);
  L.push("");
  L.push("instructions");
  let depth = 0;
  for (const i of rec.instructions) {
    if (i.ctrl === "endrep") depth--;
    L.push(`  ${String(i.pc).padStart(4)}  ${i.word ?? "-".padEnd(18)}  ${("  ".repeat(depth) + i.asm).padEnd(34)} ; ${i.from}`);
    if (i.ctrl === "repeat") depth++;
  }
  for (const c of rec.control)
    L.push(`  ${String(c.pc).padStart(4)}  ${c.word ?? "-".padEnd(18)}  ${c.asm}`);
  return L.join("\n") + "\n";
}

const rows = [];
for (const t of targets) {
  const pos = (await import(pathToFileURL(resolve(t)).href)).default;
  const id = pos.id.replace(/_pos$/, "");
  let L;
  try {
    L = lowerPositive(pos);
  } catch (e) {
    const reason = String(e.message).replace(/^(cft-lower|emit-cft|glsl-sub|glsl-f32): /, "");
    rows.push({ id, refused: reason });
    writeFileSync(join(OUT, `${id}.cft.json`),
                  JSON.stringify({ schema: 2, positive: { id: pos.id }, refused: reason }, null, 2) + "\n");
    if (!all) { console.error(`${id}: REFUSED - ${reason}`); process.exit(1); }
    continue;
  }
  const rec = recordOf(L);
  writeFileSync(join(OUT, `${id}.cft.json`), JSON.stringify(rec, null, 2) + "\n");
  writeFileSync(join(OUT, `${id}.cft.txt`), listingOf(rec));
  writeFileSync(join(OUT, `${id}.default.bank`), L.bank);
  if (L.image) writeFileSync(join(OUT, `${id}.cftp`), L.image);
  if (L.cfta) writeFileSync(join(OUT, `${id}.cfta`), L.cfta);
  rows.push({ id, words: L.prog.counts.total, alu: L.prog.counts.alu, loops: L.prog.loops.length,
              regs: L.prog.regsUsed, consts: L.prog.counts.fixedConsts, tail: L.prog.tail,
              needs: L.prog.needs, fits: L.fits, gaps: L.prog.gaps,
              sha: rec.image ? rec.image.sha256.slice(0, 8) : "-", digest: L.digest });
  if (!all) {
    console.log(`${id}: ${L.prog.counts.total} words (${L.prog.counts.alu} ALU, ${L.prog.loops.length} loop(s), ` +
                `${L.prog.phis} carried), registers ${L.prog.regsUsed} of ${NREG}, constants ` +
                `${L.prog.counts.fixedConsts} + ${L.prog.tail} tail, needs ${L.prog.needs.join(", ") || "nothing"}; ` +
                `fits ${L.fits.all ? "yes" : "NO"}` +
                (L.image ? `; image ${L.image.length} bytes, digest ${L.digest.slice(0, 16)}` : ""));
    console.log(`  build/cft/${id}.cftp  .default.bank  .cfta  .cft.json  .cft.txt`);
  }
}

if (all) {
  const pad = (s, w) => String(s).padEnd(w), num = (s, w) => String(s).padStart(w);
  console.log(`positives -> cft-fp256 sequencer programs, against ${NREG} registers, ` +
              `${IMEM_D} words, ${MAXD} deposits (revision 2)\n`);
  console.log(`${pad("positive", 12)} ${num("words", 6)} ${num("alu", 5)} ${num("loops", 5)} ${num("regs", 4)} ` +
              `${num("k", 4)} ${pad("fits", 5)} ${pad("needs / refusal", 40)}`);
  console.log("-".repeat(96));
  let lowered = 0, fitsAll = 0, overRegs = 0, overImage = 0, over16 = 0, overBank = 0;
  const refusals = new Map();
  for (const r of rows) {
    if (r.refused) {
      const key = r.refused.split(" - ")[0].slice(0, 70);
      refusals.set(key, (refusals.get(key) || 0) + 1);
      console.log(`${pad(r.id, 12)} ${num("-", 6)} ${num("-", 5)} ${num("-", 5)} ${num("-", 4)} ${num("-", 4)} ` +
                  `${pad("-", 5)} refused: ${key}`);
      continue;
    }
    lowered++;
    if (r.fits.all) fitsAll++;
    if (!r.fits.registers) overRegs++;
    if (r.regs > NREG_REV1) over16++;
    if (!r.fits.image) overImage++;
    if (!r.fits.bank) overBank++;
    console.log(`${pad(r.id, 12)} ${num(r.words, 6)} ${num(r.alu, 5)} ${num(r.loops, 5)} ${num(r.regs, 4)} ` +
                `${num(r.consts, 4)} ${pad(r.fits.all ? "yes" : "NO", 5)} ` +
                `${r.needs.join(", ")}${!r.fits.registers ? "; over " + NREG + " registers" : ""}` +
                `${!r.fits.image ? `; over ${IMEM_D} words` : ""}${!r.fits.bank ? `; over the ${KMEM_D}-slot bank` : ""}`);
  }
  console.log(`\n${rows.length} positives: ${lowered} lowered, ${fitsAll} fit the tile at revision 2, ` +
              `${over16} need REGS32, ${overRegs} over ${NREG} registers, ${overImage} over ${IMEM_D} words, ` +
              `${overBank} over the ${KMEM_D}-slot bank, ` +
              `${rows.length - lowered} refused by a construct not lowered yet:`);
  for (const [k, n] of [...refusals].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(3)}  ${k}`);
  writeFileSync(join(OUT, "corpus.json"), JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    capacities: { NREG, IMEM_D, MAXD, KREG, KMEM_D }, rows,
  }, null, 2) + "\n");
  console.log(`\nwrote build/cft/corpus.json`);
}
