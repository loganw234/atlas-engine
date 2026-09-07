// Builds detlib.glsl from the VERIFIED constants, and proves it is the
// same library the darkroom already runs.
//
// The darkroom's gendetlib.py computes its constants inline in numpy at
// build time: nothing checks them, and a mistyped coefficient becomes a
// shipped one. Here the same template is filled from core/constants.json
// — a record that has to pass provenance, transcription against mpmath
// at 50 digits, measured behavioural bounds, a sha256 seal over every
// bit pattern, and a cross-check against that very generator.
//
// The template is EXTRACTED from gendetlib.py, never retyped. Its
// function bodies are the proven ones, whose cross-vendor hashes
// (27c0f355…, a71fe904…) are the pinned reference; re-deriving them
// here would be a silent version bump wearing a tidy-up's clothes.
//
// AND THE CHECK THAT MAKES THIS WORTH DOING: the generated file - the
// template filled from the record, then unfused exactly as gendetlib.py
// unfuses it (core/unfuse.mjs, since 2026-09-04) - must be byte-identical
// to tools/determinism/detlib.glsl in the darkroom. Not
// equivalent, not equal after normalisation of the interesting parts —
// identical. That single comparison proves the record reproduces the
// deployed library exactly, so every guarantee the darkroom has earned
// for detlib.glsl transfers to anything the engine emits from the same
// constants.
//
// A SECOND TARGET, since 2026-09-07: `--target cft` turns the same
// library into sequencer instruction sequences for cft-fp256's orbit
// sequencer (that project's docs/SEQUENCER.md), writing the machine-
// readable core/detlib.cft.json and a human-readable listing. It reads
// the SHIPPED text - substituted and unfused, exactly what the byte
// comparison above proves - because that is what the cards compute and
// therefore what a second backend has to reproduce. The verification
// that it does is tools/verify-cft-detlib.mjs; this file only writes
// the images.
//
//   node tools/gen-detlib.mjs            build and check
//   node tools/gen-detlib.mjs --write    also write build/detlib.glsl
//   node tools/gen-detlib.mjs --target cft [--isa-ext]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { substitute, names, record } from "../core/oracle.mjs";
import { unfuse, noFmaLeft } from "../core/unfuse.mjs";
import { shippedText } from "../core/detlib-text.mjs";
import { HEADER_SRC, HEADER_PROVENANCE } from "../core/glsl-header.mjs";
import { DetLib } from "../core/glsl-f32.mjs";
import { lowerFunction, EXPANSIONS, bitsF32 } from "../core/cft-lower.mjs";
import { decode, disasm, imageBytes, NREG, KREG, IMEM_D, MAXD, KMEM_D,
         RND_NAME, OP_NAME } from "../core/cft-isa.mjs";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TEMPLATE = join(ROOT, "core", "detlib.glsl.template");
const OUT = join(ROOT, "build", "detlib.glsl");

// The darkroom is a sibling by default. A missing one is reported, not
// skipped silently — the byte comparison is the whole point of this
// file, and a run that quietly did not make it has proven nothing.
const DARKROOM = process.env.DARKROOM || join(ROOT, "..", "atlas-darkroom");
const PROVEN = join(DARKROOM, "tools", "determinism", "detlib.glsl");

const lf = s => s.replace(/\r\n/g, "\n");

function main(argv) {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const used = new Set([...tpl.matchAll(/@([A-Z][A-Z0-9_]*)/g)].map(m => m[1]));
  const have = new Set(names());

  const out = substitute(tpl);          // throws on any unknown name
  const left = out.match(/@[A-Z][A-Z0-9_]*/g);
  if (left) throw new Error(`unsubstituted placeholders: ${left.join(" ")}`);

  // THE LIBRARY SHIPS UNFUSED. gendetlib.py rewrites every fma() to a
  // multiply and an add after substitution (2026-08-24), because five
  // of eleven measured stacks collapse the fused form regardless of
  // `precise` and the unfused one is what they all compute identically.
  // The same rewrite, ported, so the byte comparison below stays the
  // check it was: core/unfuse.mjs.
  const { text: outUnfused, count } = unfuse(out);
  if (!noFmaLeft(outUnfused)) throw new Error("an fma call survived the rewrite");
  console.log(`  ${count} fma call(s) rewritten - the library ships fma-free`);

  console.log(`detlib: ${out.length.toLocaleString()} chars (fused source) from ` +
              `${used.size} constants`);

  // A constant in the record that the library never uses is not an
  // error, but it is worth saying: it means something was pinned for a
  // consumer that does not exist yet, or one that went away.
  const unused = [...have].filter(n => !used.has(n));
  if (unused.length)
    console.log(`  in the record but unused here: ${unused.join(" ")}`);
  const missing = [...used].filter(n => !have.has(n));
  if (missing.length)
    throw new Error(`template needs constants the record lacks: ` +
                    missing.join(" "));

  if (argv.includes("--write")) {
    mkdirSync(join(ROOT, "build"), { recursive: true });
    writeFileSync(OUT, outUnfused, "utf8");
    console.log(`  wrote ${OUT}`);
  }

  if (!existsSync(PROVEN)) {
    console.log(`\n  NOT CHECKED: no proven library at ${PROVEN}`);
    console.log("  Set DARKROOM, or accept that this run proved nothing " +
                "beyond the template parsing.");
    return 1;
  }
  const proven = lf(readFileSync(PROVEN, "utf8"));
  const mine = lf(outUnfused);
  if (mine === proven) {
    console.log(`\n  IDENTICAL to the darkroom's proven detlib.glsl ` +
                `(${proven.length.toLocaleString()} chars).`);
    console.log("  The verified record reproduces the deployed library " +
                "exactly.");
    return 0;
  }

  // Locate the first divergence, because "they differ" is not a bug
  // report.
  let i = 0;
  while (i < mine.length && i < proven.length && mine[i] === proven[i]) i++;
  const line = mine.slice(0, i).split("\n").length;
  const near = s => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
  console.log(`\n  DIFFERS from the proven library at line ${line}:`);
  console.log(`    proven:    ${near(proven)}`);
  console.log(`    generated: ${near(mine)}`);
  console.log(`  lengths ${proven.length} vs ${mine.length}`);
  return 1;
}

// ---------------------------------------------------------- the cft target
//
// The same library, compiled for cft-fp256's orbit sequencer instead of
// for a driver. Nothing here re-derives an arithmetic decision: the
// text comes from core/detlib-text.mjs, the lowering from
// core/cft-lower.mjs, and this function's whole job is to lay the
// result out as a record - per function, the instructions in
// docs/SEQUENCER.md's encoding, the constants with their exact bit
// patterns, the register map and the deposit schema.

// The order a reader wants: the pieces before the things built on them,
// so the instruction counts add up on the page rather than in a note.
const CFT_ORDER = ["det_split12", "det_scale48", "det_twoprod", "det_recip",
                   "det_div", "det_sqrt", "det_exp2", "det_log2_ef", "det_log2",
                   "det_sincos", "det_sin", "det_cos", "det_tan", "det_atan",
                   "det_acos", "det_mod", "det_pow", "u2f", "hashu"];

/** The record's name for a bit pattern, where it has one. A constant
 *  bank slot that can say SQRT2 rather than 0x3FB504F3 is a slot a
 *  reader can check against core/constants.json. */
function nameOfBits(bits) {
  for (const n of names()) if (Number.parseInt(record(n).bits, 16) === bits) return n;
  return null;
}

function cftMain(argv) {
  const isaExt = argv.includes("--isa-ext");
  const { text, fmaCount } = shippedText();
  const lib = new DetLib(text + HEADER_SRC);

  const functions = {};
  const skipped = {};
  for (const name of CFT_ORDER) {
    if (!lib.byName.has(name)) continue;
    let prog;
    try {
      prog = lowerFunction(lib, name, { isaExt });
    } catch (e) {
      skipped[name] = e.message.replace(/^cft-lower: /, "");
      continue;
    }
    const consts = prog.consts.map((bits, i) => ({
      index: i,
      bits: "0x" + bits.toString(16).toUpperCase().padStart(8, "0") + "u",
      f32: String(bitsF32(bits)),
      u32: bits >>> 0,
      name: nameOfBits(bits),
      addressable: i < KREG ? "operand field" : "needs kx (OPT-D 1.1)",
    }));
    const kname = consts.map(c => (c.name ? `k${c.index}:${c.name}` : `k${c.index}`));
    const hexw = (w) => "0x" + w.toString(16).padStart(16, "0");
    const instructions = prog.insns.map((ins, pc) => {
      const w = prog.words ? prog.words[pc] : null;
      return {
        pc,
        word: w === null ? null : hexw(w),
        op: OP_NAME[ins.op] ?? `op${ins.op}`,
        rd: ins.rd, ra: ins.ra, rb: ins.rb, rc: ins.rc,
        ka: ins.ka, kb: ins.kb, kc: ins.kc, kx: ins.kx, imm: ins.imm,
        rnd: RND_NAME[ins.rnd],
        from: ins.tag,
        asm: w === null
          ? `${OP_NAME[ins.op] ?? ins.op} r${ins.rd}, r${ins.ra}, r${ins.rb}, r${ins.rc}`
          : disasm(decode(w), kname),
      };
    });
    const control = prog.results.map((d, i) => ({
      pc: prog.insns.length + i, asm: `deposit r${d.reg}`,
      word: prog.words ? hexw(prog.words[prog.insns.length + i]) : null,
      slot: i, name: d.name, reg: d.reg,
    }));
    control.push({ pc: prog.insns.length + prog.results.length, asm: "halt",
                   word: prog.words ? hexw(prog.words[prog.words.length - 1]) : null });

    // The bytes the host would DMA, and their digest. docs/SEQUENCER.md
    // makes a point of the program being readable back "so what
    // executed can be attested rather than assumed - the same reason a
    // bitstream carries a hash"; this is that hash, and it is also the
    // only thing here that exercises the header layout.
    let image = null;
    if (prog.words) {
      const bytes = imageBytes({
        insns: prog.words, consts: prog.consts,
        maxDeposits: prog.results.length, precisionCode: 0, width: 32,
      });
      image = { bytes: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex") };
    }

    functions[name] = {
      arguments: prog.args,
      image,
      registers: {
        peak: prog.regsUsed,
        available: NREG,
        fits: prog.encodable,
        inputs: prog.args.map(a => `r${a.reg} = ${a.name} (stream ${a.stream})`),
        results: prog.results.map(d => `r${d.reg} = ${d.name}`),
        note: "r0.." + `r${Math.max(0, prog.args.length - 1)}` + " arrive from " +
              "the input streams; every other register is a temporary, " +
              "allocated by linear scan over the chosen schedule, and a " +
              "result stays where it was computed until its DEPOSIT.",
      },
      deposits: prog.results.map((d, i) => ({ slot: i, name: d.name, register: d.reg })),
      constants: consts,
      instructions,
      control,
      counts: prog.counts,
      needs: prog.needs,
      gaps: prog.gaps,
      schedules: prog.schedules,
      schedulePicked: prog.schedulePicked,
      encodable: prog.encodable,
    };
  }

  const out = {
    schema: 1,
    generated: new Date().toISOString().slice(0, 10),
    source: {
      template: "core/detlib.glsl.template",
      record: "core/constants.json",
      form: "shipped: substituted, then unfused",
      fmaRewritten: fmaCount,
      header: HEADER_PROVENANCE,
      why: "The library ships fma-free. The bits four GPU vendors agree on " +
           "are the bits of a multiply and an add, so the sequences here are " +
           "MUL and ADD and not FMA; tools/verify-cft-detlib.mjs --fused " +
           "measures what emitting FMA instead would cost.",
    },
    isa: {
      target: "cft-fp256 orbit sequencer, docs/SEQUENCER.md",
      precision: "fp32 (PREC_CODE 0)",
      rounding: "rne on every instruction except the two directed adds in the " +
                "floor expansion",
      capacities: { registers: NREG, addressableConstants: KREG,
                    constantMemory: KMEM_D, instructions: IMEM_D, deposits: MAXD },
      extensions: {
        kx: "instruction bit 30, 8-bit constant indices in imm - " +
            "OPT-D-contract.md 1.1, not in the ISA today",
        imul: "opcode 30, 32-bit low product - OPT-D-contract.md 1.2, not in " +
              "the ISA today",
      },
      isaExtEmitted: isaExt,
    },
    expansions: EXPANSIONS,
    functions,
    notEmitted: skipped,
  };

  const jsonPath = join(ROOT, "core", "detlib.cft.json");
  writeFileSync(jsonPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`wrote ${jsonPath}`);

  const L = [];
  L.push("# The det library as cft-fp256 sequencer programs");
  L.push(`# generated ${out.generated} from ${out.source.form}, ` +
         `${fmaCount} fma rewritten`);
  L.push(`# ${NREG} registers, ${KREG} addressable constants, ${IMEM_D} ` +
         `instructions, ${MAXD} deposits per lane`);
  L.push("");
  for (const [name, f] of Object.entries(functions)) {
    L.push("=".repeat(72));
    L.push(`${name}(${f.arguments.map(a => `${a.type} ${a.name}`).join(", ")})` +
           `   ${f.counts.alu} ALU + ${f.counts.control} control = ` +
           `${f.counts.total} of ${IMEM_D}`);
    L.push(`  registers  ${f.registers.peak} of ${NREG}` +
           (f.registers.fits ? "" : "   DOES NOT FIT") +
           `   [${f.registers.inputs.join(", ")}]`);
    L.push(`  schedule   ${f.schedulePicked}   ` +
           f.schedules.map(t => `${t.policy}=${t.peak}`).join(" "));
    L.push(`  needs      ${f.needs.length ? f.needs.join(", ") : "nothing beyond the ISA"}`);
    L.push(`  deposits   ${f.deposits.map(d => `${d.slot}:${d.name}=r${d.register}`).join(" ")}`);
    L.push("  constants");
    for (const c of f.constants)
      L.push(`    k${String(c.index).padStart(3)}  ${c.bits}  ` +
             `${String(c.u32).padStart(10)}  ${c.f32}` +
             (c.name ? `   ${c.name}` : "") + (c.index >= KREG ? "   [kx]" : ""));
    L.push("  program");
    for (const i of f.instructions)
      L.push(`    ${String(i.pc).padStart(4)}  ${i.asm.padEnd(42)} ; ${i.from}`);
    for (const c of f.control)
      L.push(`    ${String(c.pc).padStart(4)}  ${c.asm}`);
    L.push("");
  }
  if (Object.keys(skipped).length) {
    L.push("NOT EMITTED");
    for (const [k, v] of Object.entries(skipped)) L.push(`  ${k}: ${v}`);
  }
  mkdirSync(join(ROOT, "build"), { recursive: true });
  const listing = join(ROOT, "build", "detlib.cft.txt");
  writeFileSync(listing, L.join("\n") + "\n", "utf8");
  console.log(`wrote ${listing}`);

  const total = Object.values(functions).reduce((s, f) => s + f.counts.total, 0);
  console.log(`\n${Object.keys(functions).length} function(s), ${total} ` +
              `instructions in all; largest ` +
              `${Math.max(...Object.values(functions).map(f => f.counts.total))} ` +
              `of ${IMEM_D}`);
  const bad = Object.entries(functions).filter(([, f]) => !f.encodable).map(([n]) => n);
  if (bad.length) console.log(`  does not fit ${NREG} registers: ${bad.join(" ")}`);
  const kx = Object.entries(functions).filter(([, f]) => f.needs.includes("kx"));
  console.log(`  needs indexed constants: ${kx.length ? kx.map(([n]) => n).join(" ") : "none"}`);
  for (const [k, v] of Object.entries(skipped)) console.log(`  not emitted: ${k} - ${v}`);
  return 0;
}

const ARGV = process.argv.slice(2);
const ti = ARGV.indexOf("--target");
process.exit(ti >= 0 && ARGV[ti + 1] === "cft" ? cftMain(ARGV) : main(ARGV));

