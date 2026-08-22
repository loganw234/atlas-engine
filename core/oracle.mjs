// The oracle: the verified constants, and the only way the engine is
// allowed to reach them.
//
// core/constants.json is the record - every pinned value with its bit
// pattern, its exact decimal, and where it came from. Python vouches
// for that file (tools/verify-constants.py, mpmath at 50 digits). This
// module is the JavaScript side of the same chain, and it does three
// things the Python side cannot:
//
//   1. It re-decodes every bit pattern HERE, in the language that will
//      consume it, and refuses to load a record whose two redundant
//      fields disagree. A checker that vouches for a file nobody reads
//      the same way has vouched for nothing.
//   2. It hands out values by name, so no constant is ever spelled out
//      a second time. The reason plate GLSL drifts is that the same
//      number gets typed in two places.
//   3. It emits the GLSL form - uintBitsToFloat(0x...u) - so Phase 2's
//      det library is GENERATED from the verified record rather than
//      copied alongside it.
//
// `node tools/oracle.mjs --json` prints what this module resolved, and
// verify-constants.py reads that back and compares. That closes the
// loop: Python checks the record, JavaScript reads the record, and
// each checks that the other saw the same numbers. A bug in this
// decoder cannot hide behind a passing Python run.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// ORACLE_RECORD lets the negative controls point both halves of the
// chain at a deliberately corrupted copy. Nothing else should set it.
const RECORD = process.env.ORACLE_RECORD ||
  join(HERE, "constants.json");

// ------------------------------------------------------------- bits
const _buf = new DataView(new ArrayBuffer(4));

export function bitsToF32(bits) {
  _buf.setUint32(0, bits >>> 0, false);
  return _buf.getFloat32(0, false);
}

export function f32ToBits(x) {
  _buf.setFloat32(0, x, false);
  return _buf.getUint32(0, false) >>> 0;
}

// ------------------------------------------------------------ load
function load() {
  const rec = JSON.parse(readFileSync(RECORD, "utf8"));
  if (rec.schema !== 1)
    throw new Error(`oracle: unknown record schema ${rec.schema}`);

  const values = new Map();
  const problems = [];
  for (const [name, c] of Object.entries(rec.constants)) {
    const bits = Number.parseInt(c.bits, 16);
    if (!Number.isInteger(bits) || bits < 0 || bits > 0xffffffff) {
      problems.push(`${name}: bits ${c.bits} is not a uint32`);
      continue;
    }
    const v = bitsToF32(bits);
    // THE TWO FIELDS MUST AGREE, decoded here rather than taken on
    // trust. `decimal` is the exact value of `bits` - Python proves
    // that as exact rationals - so an f32 value parsed from it is
    // exact in float64 and Math.fround cannot double-round. If these
    // ever disagree, the record was hand-edited in one field only,
    // which is exactly the edit that would otherwise pass unnoticed.
    const fromDecimal = Math.fround(Number(c.decimal));
    if (!Object.is(fromDecimal, v))
      problems.push(
        `${name}: bits ${c.bits} decode to ${v}, but decimal ` +
        `${c.decimal} rounds to ${fromDecimal}`);
    if (!Number.isFinite(v))
      problems.push(`${name}: ${c.bits} is not finite`);
    values.set(name, v);
  }
  if (problems.length)
    throw new Error("oracle: the record does not hold together:\n  " +
                    problems.join("\n  "));
  return { rec, values };
}

const { rec: RECORD_DATA, values: VALUES } = load();

/** Where the record was read from. The CLI prints it, and a
 *  reader who cannot see which file was loaded cannot audit
 *  what was checked. */
export const RECORD_PATH = RECORD;

// ------------------------------------------------------------ reach
/** The float32 value of a pinned constant, exactly. */
export function f32(name) {
  if (!VALUES.has(name))
    throw new Error(`oracle: no constant named ${name}. The record is ` +
                    `the vocabulary - add it there, with provenance, ` +
                    `before anything can use it.`);
  return VALUES.get(name);
}

/** The GLSL literal: a bit pattern, never a decimal.
 *
 *  A decimal in GLSL source is parsed by the driver's front end, and
 *  two front ends may round the last place differently - which is a
 *  parity break authored into the source. uintBitsToFloat takes the
 *  front end out of the chain entirely. */
export function glsl(name) {
  const c = RECORD_DATA.constants[name];
  if (!c) throw new Error(`oracle: no constant named ${name}`);
  // The record's spelling, verbatim - uppercase hex, as the darkroom
  // generator writes it. This used to lowercase the digits for no
  // reason, which byte-identity against the proven detlib.glsl caught
  // the first time it ran.
  return `uintBitsToFloat(${c.bits}u)`;
}

/** The whole record for a constant: bits, decimal, kind, source. */
export function record(name) {
  const c = RECORD_DATA.constants[name];
  if (!c) throw new Error(`oracle: no constant named ${name}`);
  return structuredClone(c);
}

/** Every constant name, sorted. */
export function names() {
  return Object.keys(RECORD_DATA.constants).sort();
}

/** An approximation's record: domain, coefficients, op list, bound. */
export function approximation(name) {
  const a = RECORD_DATA.approximations[name];
  if (!a) throw new Error(`oracle: no approximation named ${name}`);
  return structuredClone(a);
}

export function approximations() {
  return Object.keys(RECORD_DATA.approximations).sort();
}

/** What Phase 0 does and does not vouch for, carried in the record so
 *  it travels with the numbers rather than living in a doc nobody
 *  opens next to the code. */
export function scope() {
  return RECORD_DATA.scope.slice();
}

// ------------------------------------------------------------- emit
/** Substitute @NAME with the GLSL bit-pattern form.
 *
 *  This is how Phase 2 builds the det library: the source carries
 *  @TWO_OVER_PI, and the only thing that can fill it is a constant
 *  that survived all three levels. A typo becomes a build failure
 *  rather than a number nobody checked. */
export function substitute(src) {
  const missing = new Set();
  const out = src.replace(/@([A-Z][A-Z0-9_]*)/g, (m, name) => {
    if (!RECORD_DATA.constants[name]) { missing.add(name); return m; }
    return glsl(name);
  });
  if (missing.size)
    throw new Error(`oracle: no such constant(s): ${[...missing].join(", ")}`);
  return out;
}

/** Which approximation's bound covers a given GLSL builtin, so a
 *  refusal can say what it would have cost rather than just refusing.
 *  Empty where the det library has no form yet - and those gaps are
 *  the honest answer to "can Phase 2 emit this?", which is no. */
export const COVERS = {
  sin: "sin_kernel",
  cos: "cos_kernel",
  tan: "sin_kernel",
  exp2: "exp2_kernel",
  exp: "exp2_kernel",
  pow: "exp2_kernel",
  log2: "atanh_series",
  log: "atanh_series",
  atan: "atan_kernel",
  acos: "atan_kernel",
};

/** GLSL builtins the emitter can reach today with no deterministic
 *  form behind them. Phase 2 must either grow one or refuse them; this
 *  list is here so that decision is made from data. */
export const UNCOVERED = ["asin", "sinh", "cosh", "tanh", "round", "sign"];
