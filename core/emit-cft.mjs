// The emitter's second target: a positive as a program for cft-fp256's
// orbit sequencer.
//
// Step 3 of cft-fp256's docs/ATLAS.md, "the emitter target". Nothing
// here re-reads the walk. core/emit.mjs stays the one emitter and
// writes the one text - the pinned shape function the GPUs compile -
// and this file lowers THAT text, with the det library and the prelude
// beneath it, through core/cft-lower.mjs into an instruction image, a
// constant bank, an input block and a deposit schema. Two backends
// reading one text is the argument the det library port made
// (docs/CFT-DETLIB.md): the emitted GLSL is what a conforming driver
// computes under the pinned discipline, so a sequencer program that
// reproduces its bits reproduces the cards' bits, and the comparison in
// tools/verify-cft-positive.mjs is between that text interpreted at
// binary32 and that text lowered and run through libcft.
//
// THE INPUT BLOCK IS THREE STREAMS, AND THAT IS ENOUGH. The registry
// contract hands a shape function seven per-sample values - q.x, q.y,
// rnd.xyzw and seed - and the sequencer loads three. But an emitted
// plate reads only four of the seven, and three of those only in its
// first two lines: the stream state
//
//     uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
//                          ^ hashu(floatBitsToUint(q.y) * <salt>u));
//     pt = hashu(pt ^ floatBitsToUint(rnd.x));
//
// is the ONLY place seed and rnd.x appear (verify-pinned's inventory,
// and prologueOf below asserts it per plate), and the walk itself reads
// pt, q.x, q.y, the levers and the clock. So the program takes q.x, q.y
// and pt as its three streams, and those two lines - integer hashes,
// one integer multiply, two bit reinterpretations - run on the host per
// sample, evaluated from the SAME parsed statements by the same
// interpreter that scores the program. Integer arithmetic has no
// latitude, so the partition costs the parity claim nothing: the tile
// computes what the card computes from pt onward, and pt is the same
// bits by definition.
//
// THE IMAGE CARRIES NO CONSTANTS. Since the coprocessor's revision 2
// (2026-09-08) an image may set BANK_EXT and take its whole constant
// bank per run; this target always does, because the last nine slots of
// that bank - P[0] through P[7], then uT - are the darkroom's data,
// changing per lever setting, per frame, per pass. The program's own
// constants come first in the bank, in first-use order; the tail comes
// last in a fixed order whatever the plate reads. One image per
// positive, loaded once; a run brings the bank; the digest libcft
// computes is SHA-256 over image then bank, and this file computes the
// same bytes so the two can be held to each other.
//
// The same program is also written as `.cfta` text, the coprocessor's
// own assembly form, so its assembler can build the image again and the
// two encoders are held byte for byte - the check that makes the
// encoding a fact rather than a reading of the spec.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { emitWalk } from "./emit.mjs";
import { shippedText } from "./detlib-text.mjs";
import { HEADER_SRC } from "./glsl-header.mjs";
import { substitute, names as constNames, record } from "./oracle.mjs";
import { unfuse, noFmaLeft } from "./unfuse.mjs";
import { DetLib, bits as f32bits } from "./glsl-f32.mjs";
import { lowerFunction } from "./cft-lower.mjs";
import { imageBytes, bankBytes, unpackKx, OP_NAME, RND_NAME, READS, ROUNDS, RND,
         NREG, NREG_REV1, IMEM_D, IMEM_D_REV2, MAXD, KREG, KMEM_D, KMEM_D_REV2,
         SCRATCH_D } from "./cft-isa.mjs";
import { leverDefaults, hashu } from "./measure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The shared header's unit-level declarations, as the darkroom's
 *  camera declares them (atlas-darkroom/darkroom/shader.py, lines 63,
 *  89 and 90, read 2026-09-08; PrettyCloud's glsl-lib.js lines 29-30
 *  carry the same two constants). EXTRACTED, NOT RETYPED: the two
 *  decimals are parsed by the same literal() every other constant in
 *  the text goes through, so they round to float32 exactly as a
 *  driver's front end rounds them. `uT` is the clock: a global the
 *  camera writes before it calls the shape function, bound here to the
 *  last slot of the per-run tail. */
export const GLOBALS_SRC = `
const float PI  = 3.14159265359;
const float TAU = 6.28318530718;
float uT;
`;
export const GLOBALS_PROVENANCE = {
  file: "atlas-darkroom/darkroom/shader.py",
  lines: "63, 89-90",
  read: "2026-09-08",
  mirror: "PrettyCloud atlas/js/core/glsl-lib.js lines 29-30; atlas-engine core/measure.mjs TAU, PI",
};

/** The per-run tail's layout: slot per name. Fixed, whatever the plate
 *  reads, so the bank a run supplies has one shape for every positive. */
export const TAIL = { P: [0, 1, 2, 3, 4, 5, 6, 7], uT: 8, size: 9 };

/** The engine's prelude, substituted and unfused - which is how the
 *  bake ships it (bakeemitted.py unfuses every part of the compute
 *  shader, prelude and plate included, 2026-08-24). */
export function detpreText() {
  const filled = substitute(readFileSync(join(HERE, "detpre.glsl.template"), "utf8"));
  const { text, count } = unfuse(filled);
  if (!noFmaLeft(text)) throw new Error("emit-cft: an fma survived in the prelude");
  return { text, fmaCount: count };
}

/** The whole translation unit a shape function is read in: globals,
 *  header, det library, prelude, plate. The plate text is unfused too,
 *  as the bake does; today no emitted plate carries an fma, and the
 *  count is reported so that stays a measurement. */
export function unitTextFor(shapeGlsl) {
  const lib = shippedText();
  const pre = detpreText();
  const plate = unfuse(shapeGlsl);
  return {
    text: [GLOBALS_SRC, HEADER_SRC, lib.text, pre.text, plate.text].join("\n"),
    fmaRewritten: { detlib: lib.fmaCount, detpre: pre.fmaCount, plate: plate.count },
  };
}

const walkNames = (e, into) => {
  if (!e || typeof e !== "object") return;
  if (e.n === "var") into.add(e.name);
  for (const k of ["a", "b", "c", "l", "r", "obj", "i", "value", "init", "cond", "step", "then", "els"]) if (e[k]) walkNames(e[k], into);
  for (const k of ["args", "body", "decls"]) if (Array.isArray(e[k])) e[k].forEach(x => walkNames(x, into));
};

/** The shape function's two-line prologue, checked and taken out.
 *
 *  Asserts the registry signature, that the first two statements are
 *  the seed of the stream and nothing else, and that neither `seed`
 *  nor `rnd` is read anywhere after them. Returns the two statements
 *  (for the host to run) and the salt the emitter put in them. */
export function prologueOf(fn) {
  const want = ["vec2 q", "vec4 rnd", "uint seed", "float[8] P", "out vec3 col"];
  const have = fn.params.map(p => `${p.out ? "out " : ""}${p.type} ${p.name}`);
  if (have.join(", ") !== want.join(", "))
    throw new Error(`emit-cft: ${fn.name}(${have.join(", ")}) is not the registry signature`);
  const [s0, s1] = fn.body.body;
  const bad = (why) => new Error(`emit-cft: ${fn.name}'s prologue is not the stream seed: ${why}`);
  if (!s0 || s0.n !== "decl" || s0.type !== "uint" || s0.decls.length !== 1 || s0.decls[0].name !== "pt")
    throw bad("the first statement is not `uint pt = ...`");
  if (!s1 || s1.n !== "assign" || s1.name !== "pt") throw bad("the second statement is not `pt = ...`");
  const names = new Set();
  walkNames(s0.decls[0].init, names); walkNames(s1.value, names);
  for (const n of ["seed", "q", "rnd"]) if (!names.has(n)) throw bad(`it does not read ${n}`);
  const after = new Set();
  fn.body.body.slice(2).forEach(s => walkNames(s, after));
  for (const n of ["seed", "rnd"])
    if (after.has(n)) throw new Error(`emit-cft: ${fn.name} reads ${n} after the prologue - the ` +
                                      `three-stream input block does not hold it`);
  // the salt: the one uint literal multiplied into q.y's hash
  let salt = null;
  const findSalt = (e) => {
    if (!e || typeof e !== "object") return;
    if (e.n === "bin" && e.op === "*" && e.r.n === "lit" && e.r.type === "uint") salt = e.r.value;
    for (const k of ["a", "b", "c", "l", "r", "obj", "i"]) if (e[k]) findSalt(e[k]);
    if (Array.isArray(e.args)) e.args.forEach(findSalt);
  };
  findSalt(s0.decls[0].init);
  return { stmts: [s0, s1], salt };
}

/** Rewrite a shape function in place for the three-stream block: the
 *  parameters become (vec2 q, uint pt0, float P[8], out vec3 col) and
 *  the prologue becomes `uint pt = pt0;`. */
export function rewriteForStreams(fn) {
  const prologue = prologueOf(fn);
  fn.params = [
    { name: "q", type: "vec2", out: false },
    { name: "pt0", type: "uint", out: false },
    { name: "P", type: "float[8]", out: false },
    { name: "col", type: "vec3", out: true },
  ];
  fn.body.body.splice(0, 2, {
    n: "decl", type: "uint", precise: false,
    decls: [{ name: "pt", init: { n: "var", name: "pt0", type: "uint" } }],
  });
  return prologue;
}

/** Evaluate the prologue on the host: the stream state a sample starts
 *  from, from the SAME two statements the plate text carries, run by
 *  the interpreter that scores the program. Integer arithmetic only. */
export function hostPrologue(lib, prologue, { qx, qy, rndx, seed }) {
  const env = new Map([["q", [qx, qy]], ["rnd", [rndx, 0, 0, 0]], ["seed", seed >>> 0]]);
  for (const s of prologue.stmts) lib.stmt(s, env);
  return env.get("pt") >>> 0;
}

/** The levers and the clock as the tail's bit patterns: the defaults
 *  unless a setting is given by lever name. */
export function tailValuesFor(pos, uT = 0, P = null) {
  const Pv = P ?? leverDefaults(pos);
  const bits = new Array(TAIL.size).fill(0);
  pos.leverNames.forEach((n, i) => { bits[TAIL.P[i]] = f32bits(Math.fround(Pv[n])) >>> 0; });
  bits[TAIL.uT] = f32bits(Math.fround(uT)) >>> 0;
  return bits;
}

/** A lever setting drawn on each lever's own grid - min to max in its
 *  step - from a seed, the way tools/smoke-pos.mjs draws its hashed
 *  rows: a positive that is right at its defaults and wrong one notch
 *  over is a positive whose integer levers were never exercised, which
 *  is exactly what int(P[k] + 0.5) under a wrong cast looked like on
 *  2026-09-08 - right whenever the default was even. */
export function hashedLevers(pos, seedU32) {
  const P = {};
  pos.leverNames.forEach((n, i) => {
    const lv = pos.levers[i];
    const h = hashu((hashu((seedU32 >>> 0) ^ (i + 1) * 0x9E3779B9) ^ 0x51ED) >>> 0);
    const u = (h >>> 8) / 16777216;
    const steps = Math.max(0, Math.round((lv.max - lv.min) / lv.step));
    const k = Math.min(steps, Math.floor(u * (steps + 1)));
    P[n] = Math.fround(lv.min + k * lv.step);
  });
  return P;
}

/** The names the record gives the bank's slots: the oracle's for a bit
 *  pattern it knows, the lever's for a tail slot. */
export function constantNames(pos, prog) {
  const known = new Map();
  for (const n of constNames()) known.set(Number.parseInt(record(n).bits, 16) >>> 0, n);
  const tailNames = {};
  pos.leverNames.forEach((n, i) => { tailNames[TAIL.P[i]] = `P[${i}] ${n}`; });
  for (let i = pos.leverNames.length; i < 8; i++) tailNames[TAIL.P[i]] = `P[${i}] (unused lever slot)`;
  tailNames[TAIL.uT] = "uT";
  return prog.consts.map((bits, i) =>
    i >= prog.tailBase ? tailNames[i - prog.tailBase] : (known.get(bits >>> 0) ?? null));
}

/** SHA-256 over the image then the bank - what cft_program_digest
 *  computes, so the two can be compared. */
export function digestOf(image, bank) {
  return createHash("sha256").update(image).update(bank).digest("hex");
}

/** The program as `.cfta` text: the coprocessor's assembly form
 *  (cft-fp256 docs/PROGRAMS.md). Constants are declared by name only,
 *  since the bank is external; an operand names a constant as k<slot>;
 *  the assembler chooses the kx form exactly when this encoder does -
 *  when any constant index in the instruction is sixteen or more. */
export function cftaText(L) {
  const { pos, prog } = L;
  const knames = constantNames(pos, prog);
  const L2 = [];
  L2.push(`; ${pos.id} as a cft-fp256 sequencer program, emitted by atlas-engine`);
  L2.push(`; from positives/${pos.id.replace(/_pos$/, "")}.pos.mjs through the pinned GLSL core/emit.mjs writes,`);
  L2.push(`; lowered by core/cft-lower.mjs; docs/CFT-POSITIVE.md is the record.`);
  L2.push(`;   inputs   ${prog.args.map(a => `${a.stream} = ${a.name}`).join(", ")}`);
  L2.push(`;   deposits ${prog.results.map((d, i) => `${i}:${d.name}`).join(" ")}`);
  L2.push(`;   the bank: ${prog.tailBase} program constants, then the per-run tail P[0..7], uT`);
  L2.push(`;   ${prog.counts.total} words, ${prog.regsUsed} registers, ${prog.loops.length} loop(s)` +
          (prog.scratch.slots ? `, ${prog.scratch.slots} scratch slot(s)` : ""));
  L2.push("");
  L2.push(".format   fp32");
  L2.push(`.deposits ${prog.results.length}`);
  L2.push(".bank     external");
  prog.consts.forEach((bits, i) => {
    const tail = i >= prog.tailBase ? "   [tail]" : "";
    L2.push(`.const    k${i}`.padEnd(22) + `; 0x${(bits >>> 0).toString(16).toUpperCase().padStart(8, "0")}` +
            (knames[i] ? ` ${knames[i]}` : "") + tail);
  });
  L2.push("");
  // THE NINTH BIT IS PART OF THE INDEX. Under kx an operand's constant
  // index is a byte of `imm` plus a ninth bit at imm[28..30] (revision
  // 3's R7), and reading only the byte names a different constant: a
  // program addressing 300 would be written `k44` here and assembled as
  // `k44` there. Measured 2026-09-11 on `throughput`, the one positive
  // with more than 256 constants - the only check that caught it was
  // asm.py's bytes against these, which is what that check is for.
  const kIndex = (ins, w) => {
    if (!ins.kx) return { a: ins.ra, b: ins.rb, c: ins.rc }[w];
    const [ia, ib, ic] = unpackKx(ins.imm);
    return { a: ia, b: ib, c: ic }[w];
  };
  let depth = 0;
  for (const ins of prog.insns) {
    const ind = "  ".repeat(depth);
    if (ins.ctrl === "repeat") { L2.push(`${ind}repeat ${ins.trip}`); depth++; continue; }
    if (ins.ctrl === "endrep") { depth--; L2.push(`${"  ".repeat(depth)}endrep`); continue; }
    if (ins.ctrl === "setact") { L2.push(`${ind}setact r${ins.ra}`.padEnd(38) + "; the lane leaves while this is zero"); continue; }
    if (ins.ctrl === "actall") { L2.push(`${ind}actall`.padEnd(38) + "; every lane back"); continue; }
    if (ins.ctrl === "stl") { L2.push(`${ind}stl r${ins.ra}, ${ins.slot}`.padEnd(38) + `; ${ins.tag}`); continue; }
    if (ins.ctrl === "ldl") { L2.push(`${ind}ldl r${ins.rd}, ${ins.slot}`.padEnd(38) + `; ${ins.tag}`); continue; }
    if (ins.ctrl === "stx") { L2.push(`${ind}stx r${ins.ra}, r${ins.rb}`.padEnd(38) + `; ${ins.tag}`); continue; }
    if (ins.ctrl === "ldx") { L2.push(`${ind}ldx r${ins.rd}, r${ins.rb}`.padEnd(38) + `; ${ins.tag}`); continue; }
    const reads = READS[ins.op];
    const operands = reads.map(w => {
      const isK = { a: ins.ka, b: ins.kb, c: ins.kc }[w];
      return isK ? `k${kIndex(ins, w)}` : `r${{ a: ins.ra, b: ins.rb, c: ins.rc }[w]}`;
    });
    const rnd = ROUNDS.has(ins.op) && ins.rnd !== RND.RNE ? `.${RND_NAME[ins.rnd]}` : "";
    const line = `${ind}${OP_NAME[ins.op]}${rnd} r${ins.rd}, ${operands.join(", ")}`;
    L2.push(line.padEnd(38) + `; ${ins.tag}`);
  }
  for (const d of prog.results) L2.push(`deposit r${d.reg}`);
  L2.push("halt");
  return L2.join("\n") + "\n";
}

/** Lower one positive. Returns the program, the BANK_EXT image with its
 *  bank and digest (null when the program does not fit a lane), the
 *  `.cfta` text, and the two libraries: `ref` reads the untouched text
 *  and is the oracle; `low` is the rewritten copy the program came from. */
export function lowerPositive(pos, opts = {}) {
  const uT = opts.uT ?? 0;
  const P = opts.P ?? null;             // a lever setting by name, or the defaults
  const glsl = emitWalk(pos, { pin: true });
  const unit = unitTextFor(glsl);
  const ref = new DetLib(unit.text);
  const low = new DetLib(unit.text);
  const name = `shape_${pos.id}`;
  if (!low.byName.has(name)) throw new Error(`emit-cft: the emitted text has no ${name}`);
  const prologue = rewriteForStreams(low.byName.get(name));
  const tailValues = tailValuesFor(pos, uT, P);
  const prog = lowerFunction(low, name, {
    isaExt: true,
    bind: {
      params: { q: { streams: [0, 1] }, pt0: { stream: 2 }, P: { tail: TAIL.P } },
      globals: { uT: { tail: TAIL.uT } },
    },
    tailValues,
  });
  const fitsImage = prog.counts.total <= IMEM_D;
  // SCRATCH_STRICT, revision 4's R8, is NOT set, and the reason is
  // dated. The bit says an INDEXED scratch access at or past the depth
  // is reported in STATUS rather than reduced modulo it, and on
  // 2026-09-10 it exists in the golden model alone - `SEQ_FLAGS_KNOWN`
  // in the library's host/src/program.c is BANK_EXT | SCRATCH_IO, and
  // `cft_program_load` refuses a header whose flags carry anything else
  // (measured here the same day: every image that set it came back
  // "artifact missing, unreadable, or not a tile"). Refusing an unknown
  // flag is the right behaviour and the guard working as designed, so
  // this waits for the library rather than routing around it. It costs
  // nothing meanwhile: every slot this target names is STATIC, so there
  // is no index to reduce and the two readings agree. `opts.scratchStrict`
  // turns it on for whoever measures the library's half.
  const image = prog.words
    ? imageBytes({ insns: prog.words, consts: prog.consts, nConsts: prog.consts.length,
                   maxDeposits: prog.results.length, precisionCode: 0, bankExt: true,
                   scratchStrict: !!opts.scratchStrict && prog.scratch.slots > 0 })
    : null;
  const bank = bankBytes(prog.consts);
  const L = {
    pos, name, glsl, unit, ref, low, prologue, prog, image, bank, tailValues, uT,
    P: P ?? leverDefaults(pos),
    digest: image ? digestOf(image, bank) : null,
    // THE BANK IS A CAPACITY TOO. kx addresses 256 constants and the tile
    // stores KMEM_D of them; a program whose bank - its own constants and
    // the nine-slot tail - is longer does not load, whatever its registers
    // and words say. Measured 2026-09-08: throughput's 307 is the one
    // positive over it as emitted, and vlsi sits exactly on it.
    fits: { registers: prog.encodable, image: fitsImage, deposits: prog.results.length <= MAXD,
            bank: prog.consts.length <= KMEM_D, scratch: prog.scratch.slots <= SCRATCH_D,
            all: prog.encodable && fitsImage && prog.results.length <= MAXD &&
                 prog.consts.length <= KMEM_D && prog.scratch.slots <= SCRATCH_D },
    needsCaps: {
      kx: prog.needs.includes("kx"), imul: prog.needs.includes("imul"),
      regs32: prog.regsUsed > NREG_REV1, bankPtr: true,
      kx9: prog.consts.length > KMEM_D_REV2 || prog.needs.includes("kx9"),
      scratch: prog.scratch.slots > 0,
      scratchStrict: !!opts.scratchStrict && prog.scratch.slots > 0,
      imemRev3: prog.counts.total > IMEM_D_REV2,
    },
    inputs: [
      { stream: "a", holds: "q.x", type: "float" },
      { stream: "b", holds: "q.y", type: "float" },
      { stream: "c", holds: "pt", type: "uint",
        from: "the two prologue statements, run on the host from (q, rnd.x, seed)" },
    ],
  };
  L.cfta = prog.words ? cftaText(L) : null;
  return L;
}

export { NREG, NREG_REV1, IMEM_D, IMEM_D_REV2, MAXD, KREG, KMEM_D, KMEM_D_REV2, SCRATCH_D };
