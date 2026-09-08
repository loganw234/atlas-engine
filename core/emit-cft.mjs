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
// bits by definition. The day a fourth input arrives (the init block,
// cft-fp256's OPT-D-contract.md item 6) the two lines move back into
// the program and this file stops rewriting anything.
//
// THE PER-RUN TAIL. P[0..7] and uT are constants to the program and
// data to the darkroom: they change per lever setting, per frame, per
// pass. They occupy the LAST nine slots of the bank in a fixed order -
// P[0] through P[7], then uT - so one image serves a positive and a
// bank-per-run (OPT-D item 5) is a boundary rather than a re-emit. The
// image written here carries the lever defaults and uT = 0, which is
// what tools/verify-cft-positive.mjs scores against.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { emitWalk } from "./emit.mjs";
import { shippedText } from "./detlib-text.mjs";
import { HEADER_SRC } from "./glsl-header.mjs";
import { substitute } from "./oracle.mjs";
import { unfuse, noFmaLeft } from "./unfuse.mjs";
import { DetLib, bits as f32bits } from "./glsl-f32.mjs";
import { lowerFunction } from "./cft-lower.mjs";
import { imageBytes, NREG, IMEM_D, MAXD } from "./cft-isa.mjs";
import { leverDefaults } from "./measure.mjs";

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
  const walk = (e) => {
    if (!e || typeof e !== "object") return;
    if (e.n === "var") names.add(e.name);
    for (const k of ["a", "b", "c", "l", "r", "obj", "i", "value", "init", "cond", "step", "then", "els"]) if (e[k]) walk(e[k]);
    for (const k of ["args", "body", "decls"]) if (Array.isArray(e[k])) e[k].forEach(walk);
  };
  walk(s0.decls[0].init); walk(s1.value);
  for (const n of ["seed", "q", "rnd"]) if (!names.has(n)) throw bad(`it does not read ${n}`);
  const after = new Set();
  const walkAfter = (e) => {
    if (!e || typeof e !== "object") return;
    if (e.n === "var") after.add(e.name);
    for (const k of ["a", "b", "c", "l", "r", "obj", "i", "value", "init", "cond", "step", "then", "els"]) if (e[k]) walkAfter(e[k]);
    for (const k of ["args", "body", "decls"]) if (Array.isArray(e[k])) e[k].forEach(walkAfter);
  };
  fn.body.body.slice(2).forEach(walkAfter);
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

/** The lever defaults and the clock as the tail's bit patterns. */
export function tailValuesFor(pos, uT = 0) {
  const P = leverDefaults(pos);
  const bits = new Array(TAIL.size).fill(0);
  pos.leverNames.forEach((n, i) => { bits[TAIL.P[i]] = f32bits(Math.fround(P[n])) >>> 0; });
  bits[TAIL.uT] = f32bits(Math.fround(uT)) >>> 0;
  return bits;
}

/** Lower one positive. Returns the program, the image (null when it
 *  does not fit a lane), and the two libraries: `ref` reads the
 *  untouched text and is the oracle; `low` is the rewritten copy the
 *  program came from. */
export function lowerPositive(pos, opts = {}) {
  const uT = opts.uT ?? 0;
  const glsl = emitWalk(pos, { pin: true });
  const unit = unitTextFor(glsl);
  const ref = new DetLib(unit.text);
  const low = new DetLib(unit.text);
  const name = `shape_${pos.id}`;
  if (!low.byName.has(name)) throw new Error(`emit-cft: the emitted text has no ${name}`);
  const prologue = rewriteForStreams(low.byName.get(name));
  const tailValues = tailValuesFor(pos, uT);
  const prog = lowerFunction(low, name, {
    isaExt: true,
    bind: {
      params: { q: { streams: [0, 1] }, pt0: { stream: 2 }, P: { tail: TAIL.P } },
      globals: { uT: { tail: TAIL.uT } },
    },
    tailValues,
  });
  const fitsImage = prog.counts.total <= IMEM_D;
  const image = prog.words
    ? imageBytes({ insns: prog.words, consts: prog.consts,
                   maxDeposits: prog.results.length, precisionCode: 0 })
    : null;
  return {
    pos, name, glsl, unit, ref, low, prologue, prog, image, tailValues, uT,
    fits: { registers: prog.encodable, image: fitsImage, deposits: prog.results.length <= MAXD,
            all: prog.encodable && fitsImage && prog.results.length <= MAXD },
    inputs: [
      { stream: "a", holds: "q.x", type: "float" },
      { stream: "b", holds: "q.y", type: "float" },
      { stream: "c", holds: "pt", type: "uint",
        from: "the two prologue statements, run on the host from (q, rnd.x, seed)" },
    ],
  };
}

export { NREG, IMEM_D, MAXD };
