// The det library, and the emitted plates, as sequencer programs.
//
// One GLSL function becomes one program: every conditional evaluated
// on both sides and resolved by SELECT; every call inlined, because
// there is no CALL; every loop a REPEAT whose body is written once,
// with the values it carries pinned to registers across the back edge
// and every write inside it predicated on a running flag that a
// `break` clears. What comes out is a list of instructions in
// docs/SEQUENCER.md's encoding, a constant bank, a register map and a
// deposit schema.
//
// WHAT THIS DELIBERATELY DOES NOT DO is rewrite the arithmetic. Every
// float operation in the sequence is the operation the shipped GLSL
// performs, in the order the shipped GLSL performs it, under
// round-to-nearest-even - which is what makes the verification in
// tools/verify-cft-detlib.mjs and tools/verify-cft-positive.mjs mean
// something. The transformations here are all of one kind: control
// flow becomes selection, and an operation the ISA lacks becomes a
// documented expansion of operations it has. Each expansion is derived
// below, with the domain it is valid on, because a bit trick nobody can
// check is a constant nobody can check.
//
// THE ONE THING THAT IS NOT ARITHMETIC-NEUTRAL, and it is the finding
// this whole file exists to make concrete: the library SHIPS UNFUSED.
// tools/gen-detlib.mjs rewrites all 56 fma() calls to a multiply and an
// add before the byte comparison against the darkroom's deployed
// detlib.glsl, so the bits four GPU vendors agree on are the bits of
// two roundings, not one. cft-fp256's docs/ATLAS.md mapped `precise
// fma` onto the tile's FMA opcode; doing that would compute a DIFFERENT
// function, more accurate and wrong. The default here is `fuse: false`
// - a MUL and an ADD per rewritten fma - and `fuse: true` exists only
// so the verification can measure how far apart the two are.
//
// SINCE 2026-09-08 THE SAME LOWERING TAKES A PLATE. core/emit-cft.mjs
// hands it the shape function core/emit.mjs wrote, and four things were
// added for that and nothing else: vectors, scalarised at the parse so
// a vec3 is three of the values already here; BINDINGS, so a parameter
// may come from a named stream, from several, or from the constant
// bank; a PER-RUN TAIL of the bank - the eight levers and the clock -
// laid out after the program's own constants in a fixed order, which
// the coprocessor's per-run bank (its revision 2, the same day) now
// takes as data; and LOOPS, below. A `t` value is a slot of that tail:
// never folded, since its value is not known here.

import { OP, RND, CTRL, READS, ROUNDS, encode, packKx, NREG, KREG, KMEM_D_REV2,
         SCRATCH_D, MAX_LOOP_DEPTH } from "./cft-isa.mjs";
import { CASTS, BUILTIN_TYPES, VEC, isArray, arrayLen } from "./glsl-sub.mjs";

const _b = new DataView(new ArrayBuffer(4));
export const f32bits = (x) => { _b.setFloat32(0, x, true); return _b.getUint32(0, true) >>> 0; };
export const bitsF32 = (u) => { _b.setUint32(0, u >>> 0, true); return _b.getFloat32(0, true); };

// Derived, never typed. Every one of these is a function of the two
// numbers the magic-constant trick is built on - 2^23, the binade where
// float32 spacing is exactly 1, and 1.5*2^23, the same trick centred so
// that it covers negative arguments too. RND_MAGIC in the constants
// record IS 1.5*2^23, and the assertion below is what says so.
const P23 = 2 ** 23;
const K_2P23 = f32bits(P23);                 // 0x4B000000
const K_MAGIC = f32bits(1.5 * P23);          // 0x4B400000
const K_ONE = f32bits(1);
const K_ZERO = 0;
const K_INF = f32bits(Infinity);
const K_SIGN = 0x80000000;

/** The ISA gaps, named. Each is an operation the shipped GLSL performs
 *  that docs/SEQUENCER.md's thirty opcodes do not have, together with
 *  the sequence that replaces it and the domain that sequence is exact
 *  on. docs/CFT-DETLIB.md prints this table. */
export const EXPANSIONS = {
  findMSB: {
    insns: 4,
    domain: "1 <= u < 2^23",
    how: "u | 0x4B000000 is the float 2^23+u exactly (u below the binade's " +
         "spacing of 1); subtracting 2^23 leaves float(u) exactly; its " +
         "biased exponent field is 127 + floor(log2 u), which is findMSB(u). " +
         "Every caller guards u != 0 and u < 2^23 - det_scale48 is only " +
         "ever handed a subnormal's mantissa.",
  },
  f2i: {
    insns: 6,
    domain: "any finite x with |x| < 2^23; truncation toward zero, as GLSL 5.4.1 says",
    how: "|x| + 2^23 under roundTowardNegative lands in [2^23, 2^24) where the " +
         "spacing is 1, so its encoding is 0x4B000000 + floor(|x|) exactly; one " +
         "ISUB of 0x4B000000 is floor(|x|) as an integer, and a select on the " +
         "sign of x negates it - which is trunc(x), since floor of the magnitude " +
         "is truncation. This replaced a two-instruction form that assumed x " +
         "was already an integer (the library's int(k) after the shift trick " +
         "always is): a plate's int(P[k] + 0.5) and int(u2f(pt) * n) are not, " +
         "and the old form rounded them to nearest - measured 2026-09-08 on " +
         "det_fract inside a loop, wave and stdmap wrong on every sample, and on " +
         "half the corpus's integer levers, right only when the default happened " +
         "to be even.",
  },
  i2f: {
    insns: 2,
    domain: "|n| < 2^22",
    how: "the same identity read the other way: 0x4B400000 + n decodes as " +
         "1.5*2^23 + n, and one float subtraction of 1.5*2^23 is float(n).",
  },
  u2f: {
    insns: 8,
    domain: "all 2^32 uints",
    how: "split into 16-bit halves, make each exact by the 2^23 trick, then " +
         "hi*65536 + lo. hi*65536 is exact, so the add rounds once and the " +
         "result is what a conforming float(uint) returns. docs/ATLAS.md " +
         "estimates six instructions and one fma; measured it is seven with " +
         "an FMA and eight without, and the library's own discipline is " +
         "unfused.",
  },
  floor: {
    insns: 13,
    domain: "all finite x; +-0 and |x| >= 2^23 by selection",
    how: "x + 2^23 under roundTowardNegative, minus 2^23, is floor(x) for " +
         "x >= 0; the same on -x under roundTowardPositive, negated, is " +
         "floor(x) for x < 0. |x| >= 2^23 is already integral and selects x; " +
         "+-0 selects x too, because floor(-0) is -0 and the positive branch " +
         "would return +0.",
  },
  clamp: {
    insns: 4,
    domain: "all x",
    how: "GLSL 8.3 defines clamp(x, a, b) as min(max(x, a), b), and 8.1 " +
         "defines those two as comparisons rather than as 754 minimum and " +
         "maximum - so it is two CMPLTs and two SELECTs, not a MIN and a " +
         "MAX. See the min/max note above gmin/gmax.",
  },
  idiv: {
    insns: 20,
    domain: "a constant divisor d != 0; int: |a| < 2^22; uint: a < (2^23 - 1) * d. " +
            "7 instructions when |d| is a power of two, 2 when it is one",
    how: "GLSL 5.9: integer division truncates toward zero. The divisor is a " +
         "literal in every plate that divides (2, 4, 5, 8, 16, 32 across " +
         "domain, e8, elliptic, hilbert, polytope), so its reciprocal is a " +
         "constant. |a| goes to float exactly (i2f, or u2f for a uint), one " +
         "multiply by float(1/|d|) lands within a quarter of the true quotient " +
         "on the domain, the 2^23 trick under roundTowardNegative truncates " +
         "it, and the remainder |a| - q*|d| says which way it missed: negative " +
         "means one too many, at least |d| means one too few, and one select " +
         "each puts it right. The sign of a comes back on the quotient, and " +
         "the divisor's with it. A power of two is a shift on the magnitude.",
  },
  imod: {
    insns: 22,
    domain: "as idiv; 7 instructions when |d| is a power of two",
    how: "a - (a / d) * d over the sequence above, so it is the remainder of " +
         "the truncating division with the dividend's sign, which is what " +
         "GLSL defines for non-negative operands and what the reference " +
         "interpreter's JavaScript % computes for all of them. A power of " +
         "two is a mask on the magnitude, then the sign.",
  },
  isnan: { insns: 2, domain: "all x", how: "1 - CMPEQ(x, x); a quiet compare is false on a NaN." },
  isinf: { insns: 2, domain: "all x", how: "CMPEQ(ABS(x), +inf)." },
  ilt_signed: {
    insns: 3,
    domain: "all int32 pairs",
    how: "ICMPLT is unsigned, so both operands are biased by 0x80000000 " +
         "first. A constant operand folds, leaving two instructions.",
  },
  int_eq: {
    insns: 2,
    domain: "all int32/uint32 pairs",
    how: "ICMPLT(a ^ b, 1): the xor is zero exactly when they are equal, " +
         "and unsigned-less-than-one is exactly zero. Not a float CMPEQ on " +
         "the difference, which would also fire on a difference of 2^31. " +
         "Against a constant zero the xor is an identity and disappears, " +
         "which is the common case.",
  },
  step: {
    insns: 2,
    domain: "all x",
    how: "GLSL 8.3: step(edge, x) is 0.0 if x < edge and 1.0 otherwise, so " +
         "it is CMPLT(x, edge) selecting between the two constants. A NaN " +
         "compares false and takes the 1.0 arm, as the spec's wording does.",
  },
  sign: {
    insns: 4,
    domain: "all x; a NaN returns 0.0, which the spec leaves unsaid",
    how: "sign(x) is 1.0 if x > 0, 0.0 if x == 0, -1.0 if x < 0 (GLSL 8.3): " +
         "two comparisons against zero and two selections, the inner one " +
         "choosing -1.0 or 0.0, the outer one choosing 1.0 over that.",
  },
  materialise: {
    insns: 1,
    domain: "all bit patterns",
    how: "DEPOSIT reads a register, so a result that is a constant, an input " +
         "or a per-run slot is copied into one with an IOR against zero, " +
         "which moves the bits and rounds nothing. The one integer identity " +
         "the folder is told not to fold.",
  },
  loop: {
    insns: "one copy in per carried value, one copy back per iteration; at the top " +
           "level one SETACT per break and one ACTALL, inside another loop the flag",
    domain: "for (int V = 0; V < N; V++) with breaks; no return inside",
    how: "REPEAT N around the body written once. Every value the body assigns " +
         "that was bound before the loop is CARRIED: copied into a register " +
         "of its own before the REPEAT, read from it inside, and copied back " +
         "at the end of every iteration - the copies are IOR against zero, " +
         "exact on every bit pattern. A break at the TOP LEVEL is SETACT: the " +
         "carried values the lane has reassigned so far go to their registers " +
         "where the break is, its active bit follows the negation of the path " +
         "condition that reached it, and from there the hardware's mask holds " +
         "its registers and skips its deposits until the ACTALL after the " +
         "ENDREP - so the loop's early exit fires when every lane has left, " +
         "and nothing in the body is selected for the lane's sake. A break " +
         "INSIDE ANOTHER LOOP keeps the running flag: 1.0 going in, and-ed " +
         "with not-the-break's-condition each iteration, every write selected " +
         "against it, because SETACT would leave the lane dark for the rest " +
         "of the outer body and ACTALL is illegal there. The counter's `< N` " +
         "is the trip count; the emitter's data-dependent exit is a break on " +
         "the lever.",
  },
};

/** Integer identities, and only integer ones.
 *
 *  The inliner produces `x ^ 0` and `x | 0` for real - int_eq against
 *  zero is ICMPLT(a ^ 0, 1), and a zero-initialised out parameter is
 *  OR-ed with zero - and each costs an instruction and a constant-bank
 *  slot, which is the scarcer of the two. These rewrites are exact on
 *  every bit pattern because the integer opcodes never round, never
 *  signal and never canonicalise a NaN (softfloat.py: "the bits are
 *  just bits").
 *
 *  NO FLOAT IDENTITY IS HERE, deliberately. x * 1.0 is not x: it quiets
 *  a signalling NaN and canonicalises the payload, and x + 0.0 is not x
 *  for x = -0. An arithmetic identity that is true of the reals is not
 *  automatically true of 754. */
function identityOf(op, a, b) {
  const isc = (v) => v && v.c !== undefined;
  switch (op) {
    case OP.IXOR: case OP.IOR: case OP.IADD:
      if (isc(b) && b.c === 0) return a;
      if (isc(a) && a.c === 0) return b;
      return null;
    case OP.ISUB:
      return isc(b) && b.c === 0 ? a : null;
    case OP.IAND:
      if (isc(b) && b.c === 0xffffffff) return a;
      if (isc(a) && a.c === 0xffffffff) return b;
      return null;
    case OP.ISHL: case OP.ISHR:
      return isc(b) && (b.c & 31) === 0 ? a : null;
    default: return null;
  }
}

/** The name of an operand for a CSE key: an op, a constant, a tail
 *  slot, a phi, or an input. */
const operandKey = (v) =>
  v === undefined ? "-"
  : v.c !== undefined ? `c${v.c}`
  : v.t !== undefined ? `t${v.t}`
  : v.ph !== undefined ? `p${v.ph}`
  : `r${v.r}`;

class Fn {
  constructor(name) {
    this.name = name;
    this.ops = [];             // {op, rnd, a, b, c, type, tag} | {ctrl, trip, phis}
    this.cse = [new Map()];    // one scope per open loop body, the outermost first
    this.folds = { int: 0, float: 0, identity: 0 };
    this.needs = new Set();    // "imul", "kx", "regs32", "registers"
    this.gaps = new Map();     // expansion name -> count
    this.phis = [];            // {id, name, type, initOp}
    this.loopDepth = 0;
    this.pendingPhis = [];     // phis created for the loop about to open
    this.fnStack = [];         // the det function being inlined, innermost last
    this.callSites = new Map(); // det function -> how many times it was inlined
    this.scratchFixed = 0;     // slots owned by array locals, below anything spilled
    this.arrays = [];          // {name, base, len} - what the record prints
  }

  gap(k) { this.gaps.set(k, (this.gaps.get(k) || 0) + 1); }

  cseGet(key) {
    for (let i = this.cse.length - 1; i >= 0; i--) {
      const hit = this.cse[i].get(key);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  pushCse() { this.cse.push(new Map()); }
  popCse() { this.cse.pop(); }

  /** Emit one instruction, or reuse an identical earlier one. Every op
   *  here is a pure function of its operands, so common-subexpression
   *  elimination cannot change a result - and it is worth doing because
   *  the inliner produces the same guard twice in several functions.
   *
   *  CSE IS SCOPED TO THE LOOP BODY. A body op may reuse an outer op
   *  (its operands are fixed for the loop's duration), but an op after
   *  the loop may not reuse a body op, whose value is one iteration's -
   *  and the key names a carried value by its phi, so no op reading the
   *  value before the loop can match one reading it inside. */
  emit(op, args, { rnd = RND.RNE, type = "float", tag = "", noFold = false } = {}) {
    const reads = READS[op];
    if (!reads) throw new Error(`cft-lower: opcode ${op} has no operand map`);
    const slot = { a: undefined, b: undefined, c: undefined };
    reads.forEach((w, i) => { slot[w] = args[i]; });
    for (const w of reads) if (slot[w] === undefined || slot[w].vec || slot[w].arr)
      throw new Error(`cft-lower: a ${slot[w] === undefined ? "missing" : "non-scalar"} ` +
                      `operand to ${tag || op}`);
    const same = noFold ? null : identityOf(op, slot.a, slot.b);
    if (same) { this.folds.identity++; return { ...same, type }; }
    if (op === OP.IMUL) this.needs.add("imul");
    const key = [op, ROUNDS.has(op) ? rnd : 0,
                 ...["a", "b", "c"].map(w => operandKey(slot[w]))].join("|");
    if (!noFold) {
      const hit = this.cseGet(key);
      if (hit !== undefined) return { r: hit, type };
    }
    const id = this.ops.length;
    this.ops.push({ op, rnd: ROUNDS.has(op) ? rnd : RND.RNE, ...slot, type, tag,
                    fn: this.fnStack.length ? this.fnStack[this.fnStack.length - 1] : null });
    if (!noFold) this.cse[this.cse.length - 1].set(key, id);
    return { r: id, type };
  }

  /** A loop-carried value: a register of its own for the loop's
   *  duration. Created before the REPEAT with a copy of the value it
   *  starts from; read inside as {ph}; written back at the end of every
   *  iteration; read after the loop as the final value. */
  newPhi(name, type) {
    const id = this.phis.length;
    this.phis.push({ id, name, type, initOp: -1 });
    return { ph: id, type };
  }
  phiInit(ph, src) {
    const p = this.phis[ph.ph];
    p.initOp = this.ops.length;
    this.ops.push({ op: OP.IOR, rnd: RND.RNE, a: src, b: { c: 0, type: "uint" }, type: p.type,
                    tag: `phi-init ${p.name}`, phiInit: ph.ph, copy: true });
    this.pendingPhis.push(ph.ph);
  }
  phiBack(ph, src, tag = "phi-back") {
    const p = this.phis[ph.ph];
    this.ops.push({ op: OP.IOR, rnd: RND.RNE, a: src, b: { c: 0, type: "uint" }, type: p.type,
                    tag: `${tag} ${p.name}`, phiBack: ph.ph, copy: true });
  }
  /** A copy-back that keeps the register where `cond` is false: the
   *  break-point snapshot, which must not touch a lane that stays. One
   *  SELECT reading the phi's own register and writing it. */
  phiSelect(ph, src, cond, tag) {
    const p = this.phis[ph.ph];
    this.ops.push({ op: OP.SELECT, rnd: RND.RNE, a: src, b: { ph: ph.ph, type: p.type }, c: cond,
                    type: p.type, tag: `${tag} ${p.name}`, phiBack: ph.ph });
  }
  /** A control word. REPEAT takes { trip, exit }; SETACT the value it
   *  reads (a register: the caller materialises); ENDREP and ACTALL
   *  take nothing. */
  ctrl(kind, x) {
    if (kind === "repeat") {
      this.ops.push({ ctrl: "repeat", trip: x.trip, exit: x.exit, phis: this.pendingPhis });
      this.pendingPhis = [];
    } else if (kind === "setact") this.ops.push({ ctrl: "setact", a: x });
    else this.ops.push({ ctrl: kind });
  }
}

// ---------------------------------------------------------- lowering

export function lowerFunction(lib, name, opts = {}) {
  const fuse = !!opts.fuse;
  const isaExt = !!opts.isaExt;
  const minmaxOpcode = !!opts.minmaxOpcode;
  const setactLoops = opts.setactLoops !== false;     // --flag-loops keeps the selected form everywhere
  const F = new Fn(name);
  const decl = lib.byName.get(name);
  if (!decl) throw new Error(`cft-lower: no function ${name}`);

  const K = (bits, type = "float") => ({ c: bits >>> 0, type });
  const isC = (v) => v.c !== undefined;

  // ---- values in the shape of their type
  //
  // A scalar is {r}, {c}, {t}, {ph} or an input; a vector is {vec: [...]}
  // of scalars; an array is {arr: [...]}. Zero, selection and equality
  // follow the shape, so the statement lowering below never has to ask.
  const zeroOf = (type) =>
    VEC[type] ? { vec: new Array(VEC[type].n).fill(0).map(() => K(K_ZERO, VEC[type].elem)), type }
    : isArray(type) ? { arr: new Array(arrayLen(type)).fill(0).map(() => K(K_ZERO, "float")), type }
    : K(K_ZERO, type);
  const sameVal = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.vec && b.vec) return a.vec.length === b.vec.length && a.vec.every((x, i) => sameVal(x, b.vec[i]));
    if (a.arr && b.arr) return a.arr.length === b.arr.length && a.arr.every((x, i) => sameVal(x, b.arr[i]));
    if (a.vec || b.vec || a.arr || b.arr) return false;
    return a.r === b.r && a.c === b.c && a.t === b.t && a.ph === b.ph && a.arg === b.arg;
  };
  const selVal = (a, b, c, type, tag = "?:") => {
    if (a.vec || b.vec) {
      if (!a.vec || !b.vec || a.vec.length !== b.vec.length)
        throw new Error(`cft-lower: selecting between ${a.type} and ${b.type}`);
      return { vec: a.vec.map((x, i) => selVal(x, b.vec[i], c, VEC[type].elem, tag)), type };
    }
    if (sameVal(a, b)) return a;
    return E(OP.SELECT, [a, b, c], { type, tag });
  };

  // ---- the ISA-gap expansions, each used by lowerExpr below
  const E = (op, args, o) => F.emit(op, args, o);
  const notb = (v) => E(OP.SUB, [K(K_ONE), v], { type: "bool", tag: "!" });
  const andb = (p, q) => (p === null ? q : q === null ? p : E(OP.MUL, [p, q], { type: "bool", tag: "&&" }));
  const orb = (p, q) => E(OP.MAX, [p, q], { type: "bool", tag: "||" });

  const uEq = (a, b) => {                                  // exact integer equality
    F.gap("int_eq");
    const d = isC(a) && isC(b) ? K((a.c ^ b.c) >>> 0, "uint")
                               : E(OP.IXOR, [a, b], { type: "uint", tag: "int_eq" });
    return E(OP.ICMPLT, [d, K(1, "uint")], { type: "bool", tag: "int_eq" });
  };
  const sLt = (a, b) => {                                  // signed less-than
    F.gap("ilt_signed");
    const bias = (v) => (isC(v) ? K((v.c ^ K_SIGN) >>> 0, "int")
                                : E(OP.IXOR, [v, K(K_SIGN, "int")], { type: "int", tag: "ilt_signed" }));
    return E(OP.ICMPLT, [bias(a), bias(b)], { type: "bool", tag: "ilt_signed" });
  };
  const findMSB = (u) => {
    F.gap("findMSB");
    const t = E(OP.IOR, [u, K(K_2P23, "uint")], { type: "uint", tag: "findMSB" });
    const f = E(OP.SUB, [t, K(K_2P23)], { type: "float", tag: "findMSB" });
    const e = E(OP.ISHR, [f, K(23, "uint")], { type: "uint", tag: "findMSB" });
    return E(OP.ISUB, [e, K(127, "int")], { type: "int", tag: "findMSB" });
  };
  // int(x): TRUNCATION toward zero of an arbitrary float, GLSL 5.4.1.
  // floor of the magnitude through the 2^23 trick under roundTowardNegative
  // - whose bit pattern IS 0x4B000000 + floor(|x|) - then the sign put
  // back on the integer. Exact for |x| < 2^23; GLSL defines the cast to
  // 2^31 and this does not reach it, which the domain says.
  const f2i = (x) => {
    F.gap("f2i");
    const ax = E(OP.ABS, [x], { tag: "f2i" });
    const p = E(OP.ADD, [ax, K(K_2P23)], { rnd: RND.RDN, type: "float", tag: "f2i" });
    const na = E(OP.ISUB, [p, K(K_2P23, "uint")], { type: "int", tag: "f2i" });
    const nn = E(OP.ISUB, [K(0, "int"), na], { type: "int", tag: "f2i" });
    const neg = E(OP.CMPLT, [x, K(K_ZERO)], { type: "bool", tag: "f2i" });
    return E(OP.SELECT, [nn, na, neg], { type: "int", tag: "f2i" });
  };
  const i2f = (n) => {
    F.gap("i2f");
    const t = E(OP.IADD, [n, K(K_MAGIC, "uint")], { type: "uint", tag: "i2f" });
    return E(OP.SUB, [t, K(K_MAGIC)], { type: "float", tag: "i2f" });
  };
  const u2f = (u) => {
    F.gap("u2f");
    const hi0 = E(OP.ISHR, [u, K(16, "uint")], { type: "uint", tag: "u2f" });
    const hi1 = E(OP.IOR, [hi0, K(K_2P23, "uint")], { type: "uint", tag: "u2f" });
    const hi = E(OP.SUB, [hi1, K(K_2P23)], { type: "float", tag: "u2f" });
    const lo0 = E(OP.IAND, [u, K(0xffff, "uint")], { type: "uint", tag: "u2f" });
    const lo1 = E(OP.IOR, [lo0, K(K_2P23, "uint")], { type: "uint", tag: "u2f" });
    const lo = E(OP.SUB, [lo1, K(K_2P23)], { type: "float", tag: "u2f" });
    if (fuse) return E(OP.FMA, [hi, K(f32bits(65536)), lo], { type: "float", tag: "u2f" });
    const t = E(OP.MUL, [hi, K(f32bits(65536))], { type: "float", tag: "u2f" });
    return E(OP.ADD, [t, lo], { type: "float", tag: "u2f" });
  };
  // AN ARRAY LOCAL LIVES IN THE SCRATCH. `precise float wts[28]`,
  // written and read under loop counters, is the one construct the
  // corpus has whose address is not known until the run, and revision
  // 3's indexed scratch (docs/SEQUENCER.md R4: STX and LDX take the
  // slot from the low bits of a register's bit pattern) is what it is
  // for. The array's slots are taken from the bottom of the scratch
  // before anything is spilled into it, so the base is a constant of
  // the program and the index register carries only the subscript.
  //
  // The subscript is an int, held as its own bit pattern, which is
  // exactly what the instruction reads; a base of zero needs no
  // arithmetic at all. Out of range the instruction would WRAP - the
  // contract reduces modulo the depth - so the emitted index is
  // checked against the array's length the way GLSL's own undefined
  // behaviour is checked here, by refusing to emit what it cannot
  // prove: a literal subscript is checked at compile time, and a
  // computed one is clamped into the array, which is what a driver's
  // robust-access mode does and what the reference interpreter is held
  // to below.
  const arraySlot = (a, idx) => {
    const lo = gmax(idx, K(0, "int"), "int");
    const hi = gmin(lo, K(a.len - 1, "int"), "int");
    return a.base === 0 ? hi : E(OP.IADD, [hi, K(a.base, "int")], { type: "int", tag: "array" });
  };
  const arrayLoad = (a, idx, type) => {
    F.gap("array-load");
    // THE SLOT FIRST. `arraySlot` emits the clamp, so reading
    // F.ops.length before it would name one of those instructions as
    // this load's result rather than the load - which is what happened
    // on 2026-09-11, and cost `nested` every sample: the predicated
    // store read a register the clamp had written instead of the
    // element it was updating.
    const slot = arraySlot(a, idx);
    const id = F.ops.length;
    F.ops.push({ mem: "ldx", b: slot, type, tag: `${a.name}[]` });
    return { r: id, type };
  };
  const arrayStore = (a, idx, value) => {
    F.gap("array-store");
    F.ops.push({ mem: "stx", a: value, b: arraySlot(a, idx), type: value.type,
                 tag: `${a.name}[] =` });
  };

  // A value in a register, for a control word that reads one: SETACT,
  // like DEPOSIT, never names the bank, a tail slot or an untouched
  // input, so those are copied by an IOR the identity folder leaves alone.
  const toReg = (v) => (v.c !== undefined || v.t !== undefined || (v.r !== undefined && v.r < 0))
    ? E(OP.IOR, [v, K(0, "uint")], { type: v.type, tag: "to-register", noFold: true })
    : v;

  // Integer division and modulus by a constant - see EXPANSIONS.idiv.
  // The divisor is known, so its reciprocal is a bank constant and the
  // magnitude route is exact on the domain stated there; the correction
  // step is what makes one float multiply an integer division.
  const idiv = (op, a, b, type) => {
    const u = type === "uint";
    const d = u ? b.c >>> 0 : b.c | 0;
    if (d === 0) throw new Error(`cft-lower: integer ${op} by zero, which GLSL leaves undefined`);
    F.gap(op === "/" ? "idiv" : "imod");
    const ad = Math.abs(d);
    const T = { type, tag: op };
    // the dividend's magnitude and sign; a uint has no sign to take
    let neg = null, A = a;
    if (!u) {
      neg = sLt(a, K(0, "int"));
      const na = E(OP.ISUB, [K(0, "int"), a], T);
      A = E(OP.SELECT, [na, a, neg], T);
    }
    const resign = (v, flip) => {                  // v, negated where the dividend was (xor flip)
      if (neg === null) return v;
      const nv = E(OP.ISUB, [K(0, "int"), v], T);
      return flip ? E(OP.SELECT, [v, nv, neg], T) : E(OP.SELECT, [nv, v, neg], T);
    };
    if (ad === 1) {
      if (op === "%") return K(0, type);
      return d < 0 && !u ? E(OP.ISUB, [K(0, "int"), a], T) : a;
    }
    const k = Math.log2(ad);
    if (Number.isInteger(k)) {
      if (op === "%") return resign(E(OP.IAND, [A, K(ad - 1, type)], T), false);
      return resign(E(OP.ISHR, [A, K(k, "uint")], T), d < 0);
    }
    const fa = u ? u2f(A) : i2f(A);
    const p = E(OP.MUL, [fa, K(f32bits(1 / ad))], { tag: op });
    const pp = E(OP.ADD, [p, K(K_2P23)], { rnd: RND.RDN, tag: op });
    const q0 = E(OP.ISUB, [pp, K(K_2P23, "uint")], T);
    const r0 = E(OP.ISUB, [A, E(OP.IMUL, [q0, K(ad, type)], T)], T);
    const tooMany = sLt(r0, K(0, "int"));            // the estimate was one too high
    const tooFew = sLt(K(ad - 1, "int"), r0);        // one too low
    let q = E(OP.SELECT, [E(OP.ISUB, [q0, K(1, type)], T), q0, tooMany], T);
    q = E(OP.SELECT, [E(OP.IADD, [q0, K(1, type)], T), q, tooFew], T);
    if (op === "%") return resign(E(OP.ISUB, [A, E(OP.IMUL, [q, K(ad, type)], T)], T), false);
    return resign(q, d < 0);
  };

  /** The same division when the divisor is known only at run time - a
   *  lever, in the one positive that does it (`nested`'s `% p`, the
   *  weight table's modulus). The reciprocal cannot be a constant then,
   *  so the estimate comes from `det_div` - the shipped library's own
   *  division, refined from a bit-trick seed with exact arithmetic and
   *  already held bit-for-bit to the GPU's (docs/CFT-DETLIB.md) - and
   *  the correction is the one above, unchanged: the remainder says
   *  which way the estimate missed and one select each puts it right.
   *
   *  Exact for |a| < 2^22 and d != 0 in the same binade range: both go
   *  to float exactly there, `det_div` is within an ulp of the true
   *  quotient, and an ulp of a quotient below 2^22 is below 1, so the
   *  truncation is off by at most one in either direction. Division by
   *  zero is GLSL's undefined behaviour and stays undefined: `det_div`
   *  returns an infinity and the truncation of it is what this
   *  computes, which is what the reference interpreter is compared
   *  against rather than a promise. */
  const idivVar = (op, a, b, type) => {
    const u = type === "uint";
    F.gap(op === "/" ? "idiv-var" : "imod-var");
    const T = { type, tag: op };
    let negA = null, negB = null, A = a, B = b;
    if (!u) {
      negA = sLt(a, K(0, "int"));
      A = E(OP.SELECT, [E(OP.ISUB, [K(0, "int"), a], T), a, negA], T);
      negB = sLt(b, K(0, "int"));
      B = E(OP.SELECT, [E(OP.ISUB, [K(0, "int"), b], T), b, negB], T);
    }
    const fa = u ? u2f(A) : i2f(A);
    const fb = u ? u2f(B) : i2f(B);
    const q0 = f2i(callLib("det_div", [fa, fb]));
    const r0 = E(OP.ISUB, [A, E(OP.IMUL, [q0, B], T)], T);
    const tooMany = sLt(r0, K(0, "int"));
    const tooFew = notb(sLt(r0, B));
    let q = E(OP.SELECT, [E(OP.ISUB, [q0, K(1, type)], T), q0, tooMany], T);
    q = E(OP.SELECT, [E(OP.IADD, [q0, K(1, type)], T), q, tooFew], T);
    if (op === "%") {
      const m = E(OP.ISUB, [A, E(OP.IMUL, [q, B], T)], T);
      return negA === null ? m : E(OP.SELECT, [E(OP.ISUB, [K(0, "int"), m], T), m, negA], T);
    }
    if (negA === null) return q;
    // a predicate here is 1.0 or +0.0, so "differ" is a comparison and
    // not a bitwise xor of the two patterns
    const sign = notb(E(OP.CMPEQ, [negA, negB], { type: "bool", tag: op }));
    return E(OP.SELECT, [E(OP.ISUB, [K(0, "int"), q], T), q, sign], T);
  };

  /** One of the library's functions, called with values rather than
   *  with an argument list of source - the same inlining `lowerCall`
   *  does, reached from an expansion instead of from a call in the
   *  text. */
  const callLib = (name, argVals) => {
    const f = lib.byName.get(name);
    if (!f) throw new Error(`cft-lower: no function ${name}`);
    const inner = new Map(globalEnv);
    f.params.forEach((pm, i) => inner.set(pm.name, argVals[i]));
    F.callSites.set(name, (F.callSites.get(name) || 0) + 1);
    F.fnStack.push(name);
    const r = lowerBody(f, inner);
    F.fnStack.pop();
    return r.value;
  };

  // GLSL's min/max are NOT 754's minimum/maximum, and mapping them onto
  // the MIN and MAX opcodes computes a different function. GLSL 8.1
  // defines min(x,y) as "y < x ? y : x" and max(x,y) as "x < y ? y : x";
  // 754 minimum returns a NaN when either operand is one and returns -0
  // for minimum(+0,-0), while the GLSL form returns whichever operand
  // the false branch names. MEASURED on this library: emitting MIN and
  // MAX puts det_atan 16 points away from the shipped bits on the
  // standard sweep - det_atan(+0, NaN) is +0 through the GLSL form,
  // because min and max both collapse to +0 and the `mx == 0` guard
  // fires, and a quiet NaN through the opcode. So the comparison and
  // the selection are emitted, at one extra instruction each.
  // `--minmax-opcode` puts the opcodes back so the divergence can be
  // measured rather than asserted; docs/CFT-DETLIB.md carries the
  // number. This corrects docs/ATLAS.md's census row for min/max.
  //
  // The integer forms are the same comparisons over the integer
  // less-than, which the ISA has only unsigned; sLt biases for a signed
  // one. GLSL's min/max on ints have no NaN question, so the opcodes
  // would also be right there - but one spelling for both is easier to
  // check than two.
  const ltOf = (t, tag) => (t === "float" ? (x, y) => E(OP.CMPLT, [x, y], { type: "bool", tag })
                          : t === "uint" ? (x, y) => E(OP.ICMPLT, [x, y], { type: "bool", tag })
                          : sLt);
  const gmin = (x, y, t = "float") => (minmaxOpcode && t === "float"
    ? E(OP.MIN, [x, y], { tag: "min" })
    : E(OP.SELECT, [y, x, ltOf(t, "min")(y, x)], { type: t, tag: "min" }));
  const gmax = (x, y, t = "float") => (minmaxOpcode && t === "float"
    ? E(OP.MAX, [x, y], { tag: "max" })
    : E(OP.SELECT, [y, x, ltOf(t, "max")(x, y)], { type: t, tag: "max" }));

  const floorf = (x) => {
    F.gap("floor");
    const p = E(OP.ADD, [x, K(K_2P23)], { rnd: RND.RDN, tag: "floor" });
    const pf = E(OP.SUB, [p, K(K_2P23)], { tag: "floor" });
    const nx = E(OP.NEG, [x], { tag: "floor" });
    const q = E(OP.ADD, [nx, K(K_2P23)], { rnd: RND.RUP, tag: "floor" });
    const qf = E(OP.SUB, [q, K(K_2P23)], { tag: "floor" });
    const nf = E(OP.NEG, [qf], { tag: "floor" });
    const neg = E(OP.CMPLT, [x, K(K_ZERO)], { type: "bool", tag: "floor" });
    let y = E(OP.SELECT, [nf, pf, neg], { tag: "floor" });
    const ax = E(OP.ABS, [x], { tag: "floor" });
    const big = E(OP.CMPLE, [K(K_2P23), ax], { type: "bool", tag: "floor" });
    y = E(OP.SELECT, [x, y, big], { tag: "floor" });
    const z = E(OP.CMPEQ, [x, K(K_ZERO)], { type: "bool", tag: "floor" });
    return E(OP.SELECT, [x, y, z], { tag: "floor" });
  };

  // ---- expressions
  function lowerExpr(e, env) {
    switch (e.n) {
      case "lit":
        // predicates are exactly 1.0 or +0.0, and a bool literal is one
        if (e.type === "bool") return K(e.value ? K_ONE : K_ZERO, "bool");
        return K(e.type === "float" ? f32bits(e.value) : e.value >>> 0, e.type);
      case "var": {
        const v = env.get(e.name);
        if (!v) throw new Error(`cft-lower: ${e.name} is not in scope`);
        return v;
      }
      // a component of a vector, or an element of an array, is a scalar
      // value already held: vectors and arrays are scalarised here
      case "member": {
        const o = lowerExpr(e.obj, env);
        if (!o.vec) throw new Error(`cft-lower: .${e.name} on a ${o.type}`);
        const i = "xyzw".indexOf(e.name);
        if (i < 0 || i >= o.vec.length) throw new Error(`cft-lower: .${e.name} on a ${o.type}`);
        return o.vec[i];
      }
      case "index": {
        const o = lowerExpr(e.obj, env);
        if (o.scratch !== undefined) {
          const elem = VEC[o.type] ? VEC[o.type].elem : "float";
          if (e.i.n === "lit") {
            const i = e.i.value | 0;
            if (i < 0 || i >= o.len) throw new Error(`cft-lower: [${i}] outside ${o.type}`);
            const id = F.ops.length;
            F.gap("array-load");
            F.ops.push({ mem: "ldl", slot: o.base + i, type: elem, tag: `${o.name}[${i}]` });
            return { r: id, type: elem };
          }
          return arrayLoad(o, lowerExpr(e.i, env), elem);
        }
        if (!o.arr) throw new Error(`cft-lower: [] on a ${o.type}`);
        if (e.i.n !== "lit")
          throw new Error("cft-lower: an array index has to be a literal here - `P` is the " +
                          "per-run tail, addressed by the instruction and not by a register; " +
                          "only an array LOCAL lives in the scratch");
        const i = e.i.value | 0;
        if (i < 0 || i >= o.arr.length) throw new Error(`cft-lower: [${i}] outside ${o.type}`);
        return o.arr[i];
      }
      case "sel": {
        const c = lowerExpr(e.c, env);
        const a = lowerExpr(e.a, env), b = lowerExpr(e.b, env);
        return selVal(a, b, c, e.type);
      }
      case "un": return lowerUn(e, env);
      case "bin": return lowerBin(e, env);
      case "call": return lowerCall(e, env);
      default: throw new Error(`cft-lower: expression ${e.n}`);
    }
  }

  function lowerUn(e, env) {
    const a = lowerExpr(e.a, env);
    if (a.vec) {
      if (e.op !== "-") throw new Error(`cft-lower: unary ${e.op} on a ${a.type}`);
      return { vec: a.vec.map(x => unScalar("-", x, VEC[a.type].elem)), type: a.type };
    }
    return unScalar(e.op, a, e.type);
  }

  function unScalar(op, a, type) {
    if (op === "+") return a;
    if (op === "!") return notb(a);
    if (op === "~") {
      if (isC(a)) { F.folds.int++; return K(~a.c >>> 0, type); }
      return E(OP.IXOR, [a, K(0xffffffff, "uint")], { type, tag: "~" });
    }
    // unary minus
    if (type === "float") {
      if (isC(a)) { F.folds.int++; return K((a.c ^ K_SIGN) >>> 0, "float"); }
      return E(OP.NEG, [a], { type: "float", tag: "-" });
    }
    if (isC(a)) { F.folds.int++; return K((-a.c) >>> 0, type); }
    return E(OP.ISUB, [K(0, type), a], { type, tag: "-" });
  }

  function lowerBin(e, env) {
    const op = e.op;
    if (op === "&&") return andb(lowerExpr(e.l, env), lowerExpr(e.r, env));
    if (op === "||") return orb(lowerExpr(e.l, env), lowerExpr(e.r, env));
    const a = lowerExpr(e.l, env), b = lowerExpr(e.r, env);
    // a vector against its own scalar, or two of one type: componentwise,
    // which is GLSL 5.9's definition and what a driver does
    if (a.vec || b.vec) {
      const vt = a.vec ? a.type : b.type;
      const elem = VEC[vt].elem;
      const n = (a.vec ?? b.vec).length;
      const out = [];
      for (let i = 0; i < n; i++)
        out.push(binScalar(op, a.vec ? a.vec[i] : a, b.vec ? b.vec[i] : b, elem, elem));
      return { vec: out, type: vt };
    }
    return binScalar(op, a, b, e.type, e.operandType);
  }

  function binScalar(op, a, b, type, operandType) {
    // comparisons
    if (["<", ">", "<=", ">=", "==", "!="].includes(op)) {
      const t = operandType;
      if (t === "float") {
        switch (op) {
          case "<": return E(OP.CMPLT, [a, b], { type: "bool", tag: "<" });
          case ">": return E(OP.CMPLT, [b, a], { type: "bool", tag: ">" });
          case "<=": return E(OP.CMPLE, [a, b], { type: "bool", tag: "<=" });
          case ">=": return E(OP.CMPLE, [b, a], { type: "bool", tag: ">=" });
          case "==": return E(OP.CMPEQ, [a, b], { type: "bool", tag: "==" });
          case "!=": return notb(E(OP.CMPEQ, [a, b], { type: "bool", tag: "!=" }));
        }
      }
      if (op === "==") return uEq(a, b);
      if (op === "!=") return notb(uEq(a, b));
      const lt = t === "uint"
        ? (x, y) => E(OP.ICMPLT, [x, y], { type: "bool", tag: "u<" })
        : sLt;
      switch (op) {
        case "<": return lt(a, b);
        case ">": return lt(b, a);
        case "<=": return notb(lt(b, a));
        case ">=": return notb(lt(a, b));
      }
    }

    // integer and bit arithmetic - folded when both sides are known,
    // because integer folding is exact and costs nothing to trust
    if (type !== "float") {
      const u = type === "uint";
      const w = (v) => (u ? v >>> 0 : v | 0) >>> 0;
      if (isC(a) && isC(b)) {
        F.folds.int++;
        const x = u ? a.c >>> 0 : a.c | 0, y = u ? b.c >>> 0 : b.c | 0;
        switch (op) {
          case "+": return K(w(x + y), type);
          case "-": return K(w(x - y), type);
          case "&": return K(w(x & y), type);
          case "|": return K(w(x | y), type);
          case "^": return K(w(x ^ y), type);
          case "<<": return K(w(x << (y & 31)), type);
          case ">>": return K(u ? x >>> (y & 31) : (x >> (y & 31)) >>> 0, type);
          case "*": return K(w(Math.imul(x, y)), type);
          case "/": if (y !== 0) return K(w(Math.trunc(x / y)), type); break;
          case "%": if (y !== 0) return K(w(x % y), type); break;
        }
      }
      if (op === "/" || op === "%") return isC(b) ? idiv(op, a, b, type) : idivVar(op, a, b, type);
      const map = { "+": OP.IADD, "-": OP.ISUB, "&": OP.IAND, "|": OP.IOR,
                    "^": OP.IXOR, "<<": OP.ISHL, ">>": OP.ISHR, "*": OP.IMUL };
      const o = map[op];
      if (o === undefined) throw new Error(`cft-lower: integer ${op}`);
      if (o === OP.IMUL && !isaExt)
        throw new Error(`cft-lower: ${name} needs IMUL (opcode 30), which is ` +
                        `an ISA extension - re-run with --isa-ext`);
      return E(o, [a, b], { type, tag: op });
    }

    // float arithmetic. A constant-folded float would be this file
    // deciding a rounding, so it does not: two constants become an
    // instruction and libcft decides.
    switch (op) {
      case "+": return E(OP.ADD, [a, b], { type: "float", tag: "+" });
      case "-": return E(OP.SUB, [a, b], { type: "float", tag: "-" });
      case "*": return E(OP.MUL, [a, b], { type: "float", tag: "*" });
      default: throw new Error(`cft-lower: float ${op} - the ISA has no divide`);
    }
  }

  /** One component, converted as the element type's own constructor
   *  would convert it - the same expansions the scalar casts use. A
   *  predicate is 1.0 or +0.0 here, so bool needs no instruction in
   *  either direction. */
  function castTo(v, from, to) {
    if (from === to || from === undefined) return v;
    if (to === "float") {
      if (from === "int") return i2f(v);
      if (from === "uint") return u2f(v);
      return { ...v, type: "float" };
    }
    if ((to === "int" || to === "uint") && from === "float") return { ...f2i(v), type: to };
    return { ...v, type: to };           // int <-> uint, and bool, are reinterpretations
  }

  function lowerCall(e, env) {
    const n = e.name;
    if (CASTS.has(n)) {
      const a = lowerExpr(e.args[0], env);
      const from = e.args[0].type;
      if (n === from) return a;
      if (n === "float") {
        if (from === "int") return i2f(a);
        if (from === "uint") return u2f(a);
      }
      if ((n === "int" || n === "uint") && from === "float") return f2i(a);
      if (n === "bool") return a;
      // int <-> uint is a reinterpretation, and so is nothing at all
      return { ...a, type: n };
    }
    if (VEC[n]) {
      // A constructor CONVERTS each component to the element type. It
      // is the same conversion the scalar casts above perform, and
      // leaving it out - relabelling an int component as a float -
      // computes a different number the moment the two differ:
      // measured 2026-09-11 on `nested`, the corpus's only user of
      // integer vectors, where `ivec2(vec2(...) * s)` has to truncate
      // and `vec2(ivec2)` has to convert. Every other positive builds
      // its vectors out of floats, which is why it took this long.
      const elem = VEC[n].elem;
      const parts = [];
      for (const x of e.args) {
        const v = lowerExpr(x, env);
        const from = VEC[x.type] ? VEC[x.type].elem : x.type;
        if (v.vec) for (const c of v.vec) parts.push(castTo(c, from, elem));
        else parts.push(castTo(v, from, elem));
      }
      const want = VEC[n].n;
      if (parts.length === 1) while (parts.length < want) parts.push(parts[0]);
      if (parts.length !== want) throw new Error(`cft-lower: ${n}(...) given ${parts.length} components`);
      return { vec: parts.map(p => ({ ...p, type: elem })), type: n };
    }
    if (BUILTIN_TYPES[n]) {
      const a = e.args.map(x => lowerExpr(x, env));
      const t0 = e.args[0].type;
      switch (n) {
        // the bit reinterpretations are free: the same register
        case "uintBitsToFloat": return { ...a[0], type: "float" };
        case "floatBitsToUint": return { ...a[0], type: "uint" };
        case "intBitsToFloat": return { ...a[0], type: "float" };
        case "floatBitsToInt": return { ...a[0], type: "int" };
        case "findMSB": return findMSB(a[0]);
        case "abs":
          if (t0 !== "float") throw new Error(`cft-lower: abs on ${t0} is not lowered yet`);
          return E(OP.ABS, [a[0]], { tag: "abs" });
        case "floor": return floorf(a[0]);
        case "min": return gmin(a[0], a[1], t0);
        case "max": return gmax(a[0], a[1], t0);
        case "clamp": {
          F.gap("clamp");
          return gmin(gmax(a[0], a[1], t0), a[2], t0);       // GLSL 8.3's own definition
        }
        case "step": {
          F.gap("step");
          const below = E(OP.CMPLT, [a[1], a[0]], { type: "bool", tag: "step" });
          return E(OP.SELECT, [K(K_ZERO), K(K_ONE), below], { tag: "step" });
        }
        case "sign": {
          F.gap("sign");
          if (t0 !== "float") throw new Error(`cft-lower: sign on ${t0} is not lowered yet`);
          const neg = E(OP.CMPLT, [a[0], K(K_ZERO)], { type: "bool", tag: "sign" });
          const lo = E(OP.SELECT, [K(f32bits(-1)), K(K_ZERO), neg], { tag: "sign" });
          const pos = E(OP.CMPLT, [K(K_ZERO), a[0]], { type: "bool", tag: "sign" });
          return E(OP.SELECT, [K(K_ONE), lo, pos], { tag: "sign" });
        }
        case "isnan": {
          F.gap("isnan");
          return notb(E(OP.CMPEQ, [a[0], a[0]], { type: "bool", tag: "isnan" }));
        }
        case "isinf": {
          F.gap("isinf");
          const ax = E(OP.ABS, [a[0]], { tag: "isinf" });
          return E(OP.CMPEQ, [ax, K(K_INF)], { type: "bool", tag: "isinf" });
        }
        // Reachable only from the fused source. docs/ATLAS.md's census
        // maps `precise fma` here; the shipped library has none.
        case "fma":
          if (!fuse) throw new Error(
            "cft-lower: an fma in the source, but the shipped library is " +
            "unfused - pass { fuse: true } to compile the fused text " +
            "deliberately");
          return E(OP.FMA, [a[0], a[1], a[2]], { tag: "fma" });
      }
    }
    const f = lib.byName.get(n);
    if (!f) throw new Error(`cft-lower: no function ${n}`);
    const inner = new Map(globalEnv);
    e.args.forEach((arg, i) => {
      const p = f.params[i];
      inner.set(p.name, p.out ? zeroOf(p.type) : lowerExpr(arg, env));
    });
    F.callSites.set(n, (F.callSites.get(n) || 0) + 1);
    F.fnStack.push(n);
    const r = lowerBody(f, inner);
    F.fnStack.pop();
    e.args.forEach((arg, i) => {
      const p = f.params[i];
      if (!p.out) return;
      if (arg.n !== "var") throw new Error(`cft-lower: ${n}'s out argument is not a variable`);
      env.set(arg.name, r.outs[p.name]);
    });
    return r.value;
  }

  // ---- statements, predicated
  //
  // Every path is evaluated. `cond` is the path condition as a 1.0/0.0
  // float, or null at the top level; assignments merge with SELECT
  // where two paths rejoin; a `return` is recorded with the condition
  // that reaches it and the sequence keeps going. The returns are then
  // folded in source order, so the FIRST return whose condition holds
  // is the one whose value survives - which is what a branch does. A
  // `break` inside a loop is recorded the same way, in `brks`, and the
  // loop folds its carried values from those records.
  function lowerBody(f, env) {
    const rets = [];
    const outNames = f.params.filter(p => p.out).map(p => p.name);
    const term = lowerStmt(f.body, env, null, rets, outNames, null);
    if (!term) rets.push({ cond: null, value: undefined,
                           outs: Object.fromEntries(outNames.map(n => [n, env.get(n)])) });
    if (!rets.length) throw new Error(`cft-lower: ${f.name} has no return path`);
    const outType = (nm) => f.params.find(p => p.name === nm).type;
    let value = rets[rets.length - 1].value;
    const outs = { ...rets[rets.length - 1].outs };
    for (let i = rets.length - 2; i >= 0; i--) {
      const c = rets[i].cond;
      if (c === null) { // an unconditional return makes the rest dead
        value = rets[i].value;
        Object.assign(outs, rets[i].outs);
        continue;
      }
      if (value !== undefined && rets[i].value !== undefined)
        value = selVal(rets[i].value, value, c, f.ret, "return");
      for (const nm of outNames)
        outs[nm] = selVal(rets[i].outs[nm], outs[nm], c, outType(nm), "out");
    }
    return { value, outs };
  }

  function lowerStmt(s, env, cond, rets, outNames, brks) {
    switch (s.n) {
      case "block": {
        for (const x of s.body) if (lowerStmt(x, env, cond, rets, outNames, brks)) return true;
        return false;
      }
      case "decl":
        for (const d of s.decls) {
          // An array local with no initialiser takes slots of its own,
          // once: a declaration inside a loop body names the same slots
          // every iteration, exactly as it names the same storage in
          // GLSL, and the emitter writes every element it goes on to
          // read (nested's two passes visit the same subscripts).
          if (d.len && !d.init) {
            let a = F.arrays.find(x => x.decl === d);
            if (!a) {
              a = { decl: d, name: d.name, base: F.scratchFixed, len: d.len,
                    type: s.type, elem: "float" };
              F.scratchFixed += d.len;
              if (F.scratchFixed > SCRATCH_D)
                throw new Error(`cft-lower: the array locals want ${F.scratchFixed} scratch ` +
                                `slots and a lane has ${SCRATCH_D}`);
              F.arrays.push(a);
            }
            env.set(d.name, { scratch: a.base, base: a.base, len: a.len, name: a.name, type: s.type });
            continue;
          }
          env.set(d.name, d.init ? lowerExpr(d.init, env) : zeroOf(s.type));
        }
        return false;
      case "assignIndex": {
        const a = env.get(s.name);
        if (!a || a.scratch === undefined)
          throw new Error(`cft-lower: ${s.name}[...] = is not an array local`);
        const value = lowerExpr(s.value, env);
        const idx = lowerExpr(s.index, env);
        // PREDICATED like every other write. The instruction's own mask
        // is the lane's active bit, which says nothing about the path
        // that reached this statement, so a store under a condition
        // reads the element back and selects - the same shape every
        // other conditional assignment here has.
        if (cond === null) { arrayStore(a, idx, value); return false; }
        const old = arrayLoad(a, idx, value.type ?? "float");
        arrayStore(a, idx, selVal(value, old, cond, value.type ?? "float", "[]?"));
        return false;
      }
      case "assign": env.set(s.name, lowerExpr(s.value, env)); return false;
      case "expr": lowerExpr(s.value, env); return false;
      case "return":
        if (brks)
          throw new Error("cft-lower: a return inside a loop is not lowered yet - none of " +
                          "the sixty-nine positives writes one, and it would carry the value " +
                          "out as the flag and the values are carried");
        rets.push({ cond, value: s.value ? lowerExpr(s.value, env) : undefined,
                    outs: Object.fromEntries(outNames.map(n => [n, env.get(n)])) });
        return true;
      case "break":
        if (!brks) throw new Error("cft-lower: a break outside a loop");
        if (brks.setact) {
          // THE LANE LEAVES HERE. Every carried value whose value on this
          // path differs from its register goes to its register now - the
          // loop's copy-backs will be masked for the lane - and its active
          // bit follows the negation of the path condition that reached the
          // break. The copy SELECTS on that condition, reading the register
          // itself for the lanes that stay: a value assigned inside the
          // break's own `if` (bulb's `esc = true; break;`, measured
          // 2026-09-08 - 435 of 512 samples wrong with a bare copy) is the
          // breaking path's alone, and the lanes that stay read the
          // register later as the value they never changed. The copies are
          // pinned to the end of the segment the SETACT closes, so every
          // read of a carried register in this segment precedes them.
          const c = cond === null ? null
                  : cond.ph !== undefined ? E(OP.IOR, [cond, K(0, "uint")], { type: "bool", tag: "phi-copy", noFold: true })
                  : cond;
          for (const nm of brks.carried) phiSnapVal(brks.phiOf.get(nm), env.get(nm), c);
          F.ctrl("setact", toReg(cond === null ? K(K_ZERO, "bool") : notb(cond)));
          return true;
        }
        brks.push({ cond, env: new Map(env) });
        return true;
      case "if": {
        const c = lowerExpr(s.c, env);
        const envT = new Map(env), envE = new Map(env);
        const termT = lowerStmt(s.then, envT, andb(cond, c), rets, outNames, brks);
        const nc = notb(c);
        const termE = s.els ? lowerStmt(s.els, envE, andb(cond, nc), rets, outNames, brks) : false;
        if (termT && termE) return true;
        for (const k of new Set([...envT.keys(), ...envE.keys()])) {
          const vT = envT.get(k), vE = envE.get(k);
          if (termT) { env.set(k, vE); continue; }
          if (termE) { env.set(k, vT); continue; }
          // a name declared in one arm only is out of scope after the
          // block; keeping the one value is harmless and never read
          if (vT === undefined) { env.set(k, vE); continue; }
          if (vE === undefined) { env.set(k, vT); continue; }
          if (sameVal(vT, vE)) { env.set(k, vT); continue; }
          env.set(k, selVal(vT, vE, c, vT.type ?? vE.type, "phi"));
        }
        return false;
      }
      case "for": return lowerFor(s, env, cond, rets, outNames, brks);
      default: throw new Error(`cft-lower: statement ${s.n}`);
    }
  }

  // ---- the loop
  //
  // The emitter writes one loop shape - `for (int V = 0; V < N; V++)`
  // with a data-dependent `break` inside - for s.orbit, sum, s.descend
  // and s.window, and this lowers exactly that shape: the counter's
  // bound is the REPEAT's trip count, and the break is the exit. Every
  // name the body assigns that was bound before the loop is CARRIED: it
  // gets a register of its own (a phi), copied in before the REPEAT,
  // read inside, and copied back at the end of every iteration. A body
  // with a break leaves it one of two ways. AT THE TOP LEVEL the break is
  // SETACT: the lane goes inactive where it leaves, the hardware's mask
  // holds its registers, the loop ends early once every lane has left,
  // and ACTALL after the ENDREP brings them back - legal only at the top
  // level. INSIDE ANOTHER LOOP the body carries a running flag and every
  // write to a carried value is selected against it, so a lane that has
  // left holds its values while the tile runs the remaining trips on it;
  // SETACT there would leave the lane dark for the rest of the outer body.
  // Either way the early exit is invisible (P3), and the measured cost of
  // the second form is in docs/CFT-GAPS.md.
  function collectAssigned(node, into) {
    if (!node) return;
    switch (node.n) {
      case "assign": into.add(node.name); return;
      case "block": node.body.forEach(x => collectAssigned(x, into)); return;
      case "if": collectAssigned(node.then, into); collectAssigned(node.els, into); return;
      case "for": collectAssigned(node.body, into); collectAssigned(node.step, into); return;
      default: return;
    }
  }
  function hasExit(node) {
    if (!node) return false;
    switch (node.n) {
      case "break": return true;
      case "block": return node.body.some(hasExit);
      case "if": return hasExit(node.then) || hasExit(node.els);
      case "for": return false;                  // a nested loop's break is its own
      default: return false;
    }
  }
  function makePhi(nm, cur) {
    if (cur.vec) return { vec: cur.vec.map((x, i) => makePhi(`${nm}.${"xyzw"[i]}`, x)), type: cur.type };
    if (cur.arr) throw new Error(`cft-lower: ${nm} is an array assigned inside a loop - not lowered`);
    const ph = F.newPhi(nm, cur.type);
    F.phiInit(ph, cur);
    return ph;
  }
  function phiBackVal(ph, next, tag = "phi-back") {
    if (ph.vec) { ph.vec.forEach((x, i) => phiBackVal(x, next.vec[i], tag)); return; }
    if (sameVal(ph, next)) return;                 // unchanged on every path
    // a phi read by another phi's copy-back has to go through a
    // temporary, or the order of the copies would decide the answer
    const src = next.ph !== undefined
      ? E(OP.IOR, [next, K(0, "uint")], { type: next.type, tag: "phi-copy", noFold: true })
      : next;
    F.phiBack(ph, src, tag);
  }

  function phiSnapVal(ph, next, cond) {
    if (ph.vec) { ph.vec.forEach((x, i) => phiSnapVal(x, next.vec[i], cond)); return; }
    if (sameVal(ph, next)) return;                 // the register already holds it
    const src = next.ph !== undefined
      ? E(OP.IOR, [next, K(0, "uint")], { type: next.type, tag: "phi-copy", noFold: true })
      : next;
    if (cond === null) F.phiBack(ph, src, "phi-snap");       // an unconditional break
    else F.phiSelect(ph, src, cond, "phi-snap");
  }

  function lowerFor(s, env, cond, rets, outNames, outerBrks) {
    const bad = (why) => new Error(`cft-lower: a for loop that is not the emitter's shape (${why})`);
    const init = s.init;
    if (!init || init.n !== "decl" || init.type !== "int" || init.decls.length !== 1 ||
        !init.decls[0].init || init.decls[0].init.n !== "lit") throw bad("its initialiser");
    const V = init.decls[0].name, start = init.decls[0].init.value | 0;
    const c = s.cond;
    if (!c || c.n !== "bin" || c.op !== "<" || c.l.n !== "var" || c.l.name !== V || c.r.n !== "lit")
      throw bad("its condition");
    const bound = c.r.value | 0;
    const st = s.step;
    const inc = st && st.n === "assign" && st.name === V && st.value.n === "bin" && st.value.op === "+" &&
                st.value.l.n === "var" && st.value.l.name === V && st.value.r.n === "lit" && st.value.r.value === 1;
    if (!inc) throw bad("its step");
    const trip = bound - start;
    if (trip <= 0) throw bad(`a trip count of ${trip}`);
    if (F.loopDepth >= MAX_LOOP_DEPTH)
      throw new Error(`cft-lower: loops nest deeper than ${MAX_LOOP_DEPTH}, which the sequencer refuses`);

    // the counter enters the environment before the loop, as GLSL scopes it
    lowerStmt(init, env, cond, rets, outNames, outerBrks);
    const assigned = new Set([V]);
    collectAssigned(s.body, assigned);
    const carried = [...assigned].filter(nm => env.has(nm));
    const exits = hasExit(s.body);

    const phiOf = new Map();
    for (const nm of carried) {
      const ph = makePhi(nm, env.get(nm));
      phiOf.set(nm, ph);
      env.set(nm, ph);
    }
    // THE EXIT, TWO WAYS - see the comment above. SETACT at the top
    // level, where ACTALL can follow; the flag inside another loop.
    const setact = setactLoops && F.loopDepth === 0 && (exits || cond !== null);
    let run = null;
    if (exits && !setact) { run = F.newPhi("__run", "bool"); F.phiInit(run, K(K_ONE, "bool")); }
    if (setact && cond !== null) F.ctrl("setact", toReg(cond));   // lanes not on the loop's path sit it out
    F.ctrl("repeat", { trip, exit: setact ? "setact" : exits ? "flag" : "none" });
    F.pushCse();
    F.loopDepth++;

    const bodyCond = setact ? null : andb(cond, run);
    const envB = new Map(env);
    const brks = [];
    if (setact) { brks.setact = true; brks.carried = carried; brks.phiOf = phiOf; }
    const term = lowerStmt(s.body, envB, bodyCond, rets, outNames, brks);
    if (!term) lowerStmt(s.step, envB, bodyCond, rets, outNames, brks);

    if (setact) {
      // the lanes still running copy back; the ones that left are masked,
      // and hold what the break copied. A body that always breaks copies
      // nothing here.
      if (!term) for (const nm of carried) phiBackVal(phiOf.get(nm), envB.get(nm));
    } else {
    // each carried value's next: the fall-through value, selected
    // against the body's condition, then the breaks in source order,
    // the first to fire winning
    const nextOf = new Map();
    for (const nm of carried) {
      const ph = phiOf.get(nm);
      let value = term ? null
                : bodyCond === null ? envB.get(nm) : selVal(envB.get(nm), ph, bodyCond, ph.type, "loop");
      for (let i = brks.length - 1; i >= 0; i--) {
        const sv = brks[i].env.get(nm);
        value = value === null ? sv : selVal(sv, value, brks[i].cond, ph.type, "break");
      }
      if (value === null) throw new Error(`cft-lower: ${nm} has no value after the loop body`);
      nextOf.set(nm, value);
    }
    if (run) {
      let any = null;
      for (const b of brks) any = any === null ? b.cond : orb(any, b.cond);
      phiBackVal(run, any === null ? run : andb(run, notb(any)));
    }
    for (const nm of carried) phiBackVal(phiOf.get(nm), nextOf.get(nm));
    }

    F.loopDepth--;
    F.popCse();
    F.ctrl("endrep");
    if (setact) F.ctrl("actall");                            // every lane back, at the top level
    for (const nm of carried) env.set(nm, phiOf.get(nm));   // the registers hold the final values
    return false;
  }

  // ---- run it
  //
  // Inputs come from the three streams. Without a binding a scalar
  // parameter takes the next stream, as the det library's did; with one
  // (opts.bind.params[name]) it takes the stream, the streams, or the
  // per-run tail slots it is told to. Globals are the unit's: a const
  // one is its bit pattern, a bare one (the clock) must be bound to a
  // tail slot (opts.bind.globals[name] = {tail: slot}).
  const bind = opts.bind || {};
  F.tail = opts.tailValues ? opts.tailValues.length : 0;
  const tailK = (slot, type) => {
    if (!(slot >= 0 && slot < F.tail))
      throw new Error(`cft-lower: tail slot ${slot} outside the ${F.tail}-slot tail`);
    return { t: slot, type };
  };
  const args = [];
  const streamArg = (label, type, si) => {
    if (!(si >= 0 && si <= 2)) throw new Error(`cft-lower: no stream ${si}`);
    if (args.some(a => a.reg === si)) throw new Error(`cft-lower: stream ${"abc"[si]} bound twice`);
    args.push({ name: label, type, stream: "abc"[si], reg: si });
    return { r: -1 - si, type, arg: si };              // negative ids are inputs
  };
  const globalEnv = new Map();
  for (const [gname, g] of lib.globalDecls ?? []) {
    const gb = bind.globals?.[gname];
    if (gb && gb.tail !== undefined) { globalEnv.set(gname, tailK(gb.tail, g.type)); continue; }
    if (g.init) {
      const v = lib.globals.get(gname);
      globalEnv.set(gname, K(g.type === "float" ? f32bits(v) : v >>> 0, g.type));
      continue;
    }
    // a bare global nobody bound is an error only if it is read; leave it
    // out of scope so the read names it
  }
  const env = new Map(globalEnv);
  let nextStream = 0;
  for (const p of decl.params) {
    if (p.out) { env.set(p.name, zeroOf(p.type)); continue; }
    const b = bind.params?.[p.name];
    if (b === undefined) {
      if (VEC[p.type] || isArray(p.type))
        throw new Error(`cft-lower: ${name}'s ${p.type} parameter ${p.name} needs a binding`);
      env.set(p.name, streamArg(p.name, p.type, nextStream++));
      continue;
    }
    if (b.stream !== undefined) { env.set(p.name, streamArg(p.name, p.type, b.stream)); nextStream = Math.max(nextStream, b.stream + 1); continue; }
    if (b.streams !== undefined) {
      if (!VEC[p.type] || b.streams.length !== VEC[p.type].n)
        throw new Error(`cft-lower: ${p.name} is a ${p.type}; ${b.streams.length} streams bound`);
      env.set(p.name, { vec: b.streams.map((si, i) => streamArg(`${p.name}.${"xyzw"[i]}`, VEC[p.type].elem, si)), type: p.type });
      nextStream = Math.max(nextStream, ...b.streams.map(s => s + 1));
      continue;
    }
    if (b.tail !== undefined) {
      const slots = Array.isArray(b.tail) ? b.tail : [b.tail];
      if (isArray(p.type)) {
        if (slots.length !== arrayLen(p.type)) throw new Error(`cft-lower: ${p.name} is ${p.type}; ${slots.length} slots bound`);
        env.set(p.name, { arr: slots.map(s => tailK(s, "float")), type: p.type });
      } else if (VEC[p.type]) {
        env.set(p.name, { vec: slots.map(s => tailK(s, VEC[p.type].elem)), type: p.type });
      } else env.set(p.name, tailK(slots[0], p.type));
      continue;
    }
    if (b.const !== undefined) { env.set(p.name, K(b.const, p.type)); continue; }
    throw new Error(`cft-lower: binding for ${p.name} names no source`);
  }
  args.sort((x, y) => x.reg - y.reg);
  if (args.some((a, i) => a.reg !== i))
    throw new Error(`cft-lower: streams must be bound from a upward without a gap ` +
                    `(${args.map(a => a.stream).join(", ")})`);
  if (args.length > 3)
    throw new Error(`cft-lower: ${name} takes ${args.length} inputs; cft_program_run ` +
                    `loads three streams (docs/ATLAS.md item 3)`);
  const out = lowerBody(decl, env);

  // DEPOSIT reads a REGISTER, never the constant bank - the loader
  // refuses a stray ka on a control instruction (docs/SEQUENCER.md,
  // "any field an instruction does not read being non-zero"). So a
  // result that came out as a constant, a per-run slot or an untouched
  // input is copied into one first, by an integer OR with zero, which
  // moves the bits and rounds nothing - and which the identity folder
  // is told to leave alone, since folding it is exactly what would undo
  // the copy. A phi holds its register already.
  const materialise = (v) =>
    (v.c !== undefined || v.t !== undefined || (v.r !== undefined && v.r < 0))
      ? E(OP.IOR, [v, K(0, "uint")], { type: v.type, tag: "materialise", noFold: true })
      : v;
  const scalarsOf = (label, v) =>
    v.vec ? v.vec.map((x, i) => ({ name: `${label}.${"xyzw"[i]}`, value: materialise(x) }))
          : [{ name: label, value: materialise(v) }];

  const results = [];
  if (out.value !== undefined) results.push(...scalarsOf("return", out.value));
  for (const p of decl.params) if (p.out) results.push(...scalarsOf(p.name, out.outs[p.name]));
  if (!results.length) throw new Error(`cft-lower: ${name} produces nothing`);

  return schedule(F, args, results,
                  { isaExt, fuse, minmaxOpcode, doSchedule: opts.schedule !== false,
                    tailValues: opts.tailValues || [] });
}

// ------------------------------------------------- scheduling and regs
//
// Sixteen registers per lane was the binding constraint on the library,
// thirty-two is the one on the positives, and the order an expression
// walk happens to produce is not the order that fits in them. Within a
// straight-line SEGMENT - the instructions between one control word and
// the next - the instructions form a DAG of pure operations, so any
// topological order computes the same values and only the peak number
// of live registers changes. Nothing moves across a REPEAT or an
// ENDREP, and the copies into and out of a loop's carried registers
// stay at the end of their segments where the loop needs them.
//
// Several schedules are built per segment and the one with the lowest
// peak over the whole program is kept: three kills-first list schedules,
// two recency-first ones, the source order, and three depth-first
// (Sethi-Ullman) orders that differ in how the results are ordered.
// Then local moves improve the winner. The findings that shaped the
// list are in docs/CFT-POSITIVE.md; the winner is recorded per program.

const POLICIES = [
  // kills first, then the node furthest from a result: keep long
  // dependence chains moving so their intermediates do not pile up
  { name: "kills-deep", key: (s) => [1 - s.kills, -s.height, s.i] },
  // kills first, then the node nearest a result: finish subtrees
  { name: "kills-shallow", key: (s) => [1 - s.kills, s.height, s.i] },
  // kills first, then the value with the fewest consumers left
  { name: "kills-narrow", key: (s) => [1 - s.kills, s.fanout, -s.height, s.i] },
  // THE NEWEST VALUE FIRST. Measured on a whole positive (hopf, 595
  // instructions, 2026-09-08) the three kills-first policies above give
  // 22, 32 and 46 registers where the source order gives 17: with six
  // independent det_sincos chains ready from the start, "kills first"
  // interleaves them all, since every chain's next step kills its own
  // last temporary, and their intermediates pile up together. What a
  // wide straight-line program wants is depth first - consume what was
  // just computed, so a chain finishes and its operands die before the
  // next one begins.
  { name: "recent", key: (s) => [-s.newest, 1 - s.kills, s.i] },
  { name: "recent-kills", key: (s) => [1 - s.kills, -s.newest, s.i] },
  // the order the expression walk produced, for comparison
  { name: "walk", key: (s) => [s.i] },
];

function lessKey(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** The operands of an op that name other ops, as a list of op ids. */
function predsOf(o) {
  const s = [];
  for (const w of readsOf(o)) { const v = o[w]; if (v && v.v !== undefined && !s.includes(v.v)) s.push(v.v); }
  return s;
}

/** The operand slots an op actually READS. One definition, because the
 *  live-range profile, the register allocator, dead-code elimination
 *  and the segment analysis must agree about it exactly: a value read
 *  by something they disagree about either keeps a register it does not
 *  need or loses one it does.
 *
 *  A control word reads at most `a` (DEPOSIT, SETACT). A scratch store
 *  reads the value in `a`, and the indexed form its slot in `b`; a
 *  scratch load reads nothing, or `b` where it is indexed. Everything
 *  else is an ALU instruction and reads what its opcode's READS says,
 *  which the undefined slots below take care of. */
function readsOf(o) {
  switch (o.mem) {
    case "stl": return ["a"];
    case "ldl": return [];
    case "stx": return ["a", "b"];
    case "ldx": return ["b"];
    default: break;
  }
  if (o.ctrl) return o.a ? ["a"] : [];
  return ["a", "b", "c"];
}

/** Does this op write a register of its own? A control word does not; a
 *  scratch store does not; a copy BACK into a loop-carried register
 *  writes one it already has. Everything else defines a value. */
function definesReg(o) {
  if (o.mem) return o.mem === "ldl" || o.mem === "ldx";
  return !o.ctrl && o.phiBack === undefined;
}

/** The four scratch codes, by the name the instruction list gives them. */
const SCRATCH_NAMES = new Set(["stl", "ldl", "stx", "ldx"]);

/** One greedy list schedule over a straight-line set of ops. Returns
 *  the new order as indices into `ops`. `ops` here is segment-local:
 *  {v} names an op of the segment, and anything else is external. */
function listSchedule(ops, resultIds, policy) {
  const N = ops.length;
  const preds = ops.map(o => new Set(predsOf(o)));
  const uses = ops.map(() => []);
  preds.forEach((s, i) => { for (const p of s) uses[p].push(i); });
  const height = new Array(N).fill(0);
  for (let i = N - 1; i >= 0; i--)
    for (const u of uses[i]) height[i] = Math.max(height[i], height[u] + 1);
  const remaining = uses.map(u => u.length);
  for (const id of resultIds) remaining[id]++;            // a use outside the segment
  const unmet = preds.map(s => s.size);
  const ready = new Set();
  for (let i = 0; i < N; i++) if (unmet[i] === 0) ready.add(i);
  const order = [];
  const posOf = new Array(N).fill(-1);          // when each op was issued
  while (order.length < N) {
    let best = -1, bestKey = null;
    for (const i of ready) {
      let kills = 0, newest = -1;
      for (const p of preds[i]) {
        if (remaining[p] === 1) kills++;
        if (posOf[p] > newest) newest = posOf[p];
      }
      const k = policy.key({ kills, height: height[i], fanout: remaining[i], i, newest });
      if (best < 0 || lessKey(k, bestKey)) { best = i; bestKey = k; }
    }
    if (best < 0) throw new Error("cft-lower: the schedule stalled");
    ready.delete(best);
    posOf[best] = order.length;
    order.push(best);
    for (const p of preds[best]) remaining[p]--;
    for (const u of uses[best]) if (--unmet[u] === 0) ready.add(u);
  }
  return order;
}

/** Sethi and Ullman's register need, per instruction: the registers it
 *  takes to evaluate the instruction's whole tree with nothing else
 *  live, when its operands are evaluated in decreasing order of their
 *  own need - the j-th operand evaluated holds j-1 earlier results
 *  beside it. Exact for a tree; on this DAG a value read by two
 *  consumers is counted by both, which overstates and is harmless,
 *  since the number only orders siblings. */
function suNeed(ops) {
  const need = new Array(ops.length).fill(1);
  ops.forEach((o, i) => {
    const ns = predsOf(o).map(c => need[c]).sort((x, y) => y - x);
    let n = 1;
    ns.forEach((c, j) => { if (c + j > n) n = c + j; });
    need[i] = n;
  });
  return need;
}

/** A depth-first order from the results: each result's tree is
 *  evaluated to completion, heavier operand first, before the next
 *  result begins, so a subexpression's operands die before another
 *  subexpression's are born. A value two results share is computed at
 *  its first need and is a leaf thereafter.
 *
 *  This is the order that fits hopf: the source computes both spin
 *  rotations' sines and cosines before it applies either, and holds
 *  eight geometry values across the second det_sincos; evaluating the
 *  first deposit's tree to the end applies the first rotation and frees
 *  four of them before the second one starts. */
function suOrder(ops, need, resultOrder, resultSet) {
  const N = ops.length;
  const preds = ops.map(predsOf);
  const consumers = ops.map(() => []);
  preds.forEach((ps, i) => { for (const p of ps) consumers[p].push(i); });
  // readers still to come, per value; a use outside the segment is a reader
  const remaining = consumers.map(c => c.length);
  for (const r of resultSet) remaining[r]++;
  const unmet = preds.map(p => p.length);
  const done = new Array(N).fill(false);
  const order = [];
  const issue = (i) => {
    done[i] = true;
    order.push(i);
    for (const p of preds[i]) remaining[p]--;
    for (const c of consumers[i]) unmet[c]--;
  };
  // EAGER COMPLETION. A det_sincos computes its sine and its cosine from
  // one shared tree, and a strict depth-first order takes one output,
  // leaves the seven values the other output still needs live, and
  // descends into some other subtree before it comes back for them.
  // Measured on hopf that is 32 registers against the source order's
  // 17. So after every instruction, any READY instruction that is the
  // last reader of one of its operands is issued at once: it frees a
  // register and holds one, so it never raises the peak, and it is what
  // finishes a shared tree while its pieces are still in hand.
  const eager = () => {
    for (;;) {
      let fired = false;
      for (let i = 0; i < N; i++) {
        if (done[i] || unmet[i] !== 0) continue;
        let kills = 0;
        for (const p of preds[i]) if (remaining[p] === 1) kills++;
        if (kills) { issue(i); fired = true; }
      }
      if (!fired) return;
    }
  };
  const stack = [];
  const visit = (root) => {
    if (done[root]) return;
    stack.push([root, null]);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [i] = top;
      if (done[i]) { stack.pop(); continue; }
      if (top[1] === null) top[1] = preds[i].slice().sort((a, b) => need[b] - need[a] || a - b);
      const next = top[1].find(c => !done[c]);
      if (next !== undefined) { stack.push([next, null]); continue; }
      issue(i);
      eager();
      stack.pop();
    }
  };
  for (const r of resultOrder) visit(r);
  for (let i = 0; i < N; i++) visit(i);          // nothing should be left; be safe
  return order;
}

/** The register profile of a whole program in a given order, without
 *  allocating: for every value, the position it is defined at and the
 *  position it is last needed at, and from those how many are live
 *  into each instruction. Its peak is exactly the count the
 *  lowest-free-register scan below will use, so orders can be compared
 *  cheaply.
 *
 *  THE LOOP RULE. A value defined outside a loop and read inside it is
 *  needed on every trip, so its last use is the loop's ENDREP - the
 *  outermost loop that contains the read and not the definition. A
 *  carried value (a phi) is needed from its copy-in to its loop's
 *  ENDREP at least, and to its last read after the loop. A value
 *  defined inside a body dies inside the body, which is what makes the
 *  body's registers reusable across trips; a body value read after the
 *  loop would be one trip's, and there is none by construction. */
export function profileOf(ops, args, resultIds, order, geo) {
  const N = order.length;
  const pos = new Int32Array(ops.length).fill(-1);
  order.forEach((id, p) => { pos[id] = p; });
  // where every loop starts and ends in this order
  const lStart = geo.loops.map(l => pos[l.repeatOp]);
  const lEnd = geo.loops.map(l => pos[l.endrepOp]);
  const inside = (l, p) => p > lStart[l] && p < lEnd[l];
  // the position a read at `q` (by op `reader`) counts as, given the
  // definition's position `d`: the outermost loop around the reader
  // that does not contain the definition ends the value's life
  const usePos = (reader, q, d) => {
    let u = q;
    for (let l = geo.opLoop[reader]; l >= 0; l = geo.loops[l].parent)
      if (!inside(l, d)) u = lEnd[l];
    return u;
  };
  const last = new Int32Array(ops.length).fill(-1);
  const argLast = new Int32Array(args.length).fill(-1);
  const defOf = (id) => pos[id];
  for (const id of order) {
    const o = ops[id];
    const reads = readsOf(o);
    if (!reads.length && !definesReg(o)) continue;
    const q = pos[id];
    for (const w of reads) {
      const v = o[w];
      if (!v) continue;
      if (v.v !== undefined) { const u = usePos(id, q, defOf(v.v)); if (u > last[v.v]) last[v.v] = u; }
      else if (v.ph !== undefined) {
        const init = geo.phiInit[v.ph];
        const u = usePos(id, q, defOf(init));
        if (u > last[init]) last[init] = u;
      } else if (v.arg !== undefined) { const u = usePos(id, q, -1); if (u > argLast[v.arg]) argLast[v.arg] = u; }
    }
    if (!definesReg(o) && o.phiBack === undefined) continue;   // defines nothing
    if (o.phiBack !== undefined) {
      // the copy-back writes the phi's register at this position, and
      // the register is needed to the end of the loop whatever else
      const init = geo.phiInit[o.phiBack];
      const lend = lEnd[geo.phiLoop[o.phiBack]];
      if (q > last[init]) last[init] = q;
      if (lend > last[init]) last[init] = lend;
    }
    if (o.phiInit !== undefined) {
      const lend = lEnd[geo.phiLoop[o.phiInit]];
      if (lend > last[id]) last[id] = lend;
    }
  }
  for (const id of resultIds.ops) last[id] = N;
  for (const a of resultIds.args) argLast[a] = N;
  // live into position p: defined before p, last needed after p
  const diff = new Int32Array(N + 2);
  const span = (def, l) => { const s = def + 1, e = Math.min(l, N); if (e > s) { diff[s]++; diff[e]--; } };
  for (const id of order) if (definesReg(ops[id]) && last[id] >= 0) span(pos[id], last[id]);
  args.forEach((_, k) => { if (argLast[k] >= 0) span(-1, argLast[k]); });
  let live = 0, peak = args.length, sum = 0;
  const liveAt = new Int32Array(N);
  for (let p = 0; p < N; p++) {
    live += diff[p];
    const o = ops[order[p]];
    const need = live + (definesReg(o) ? 1 : 0);
    liveAt[p] = need;
    if (need > peak) peak = need;
    sum += need;
  }
  return { peak, sum, pos, last, argLast, liveAt };
}

// ------------------------------------------------------- spilling
//
// THE SCRATCH IS WHERE A VALUE TOO MANY LIVES. Revision 3 of the
// coprocessor's sequencer (2026-09-08 evening, docs/SEQUENCER.md R4)
// gave a lane 256 scratch slots and four control codes - STL and LDL by
// static slot, STX and LDX by a register's low bits - in answer to this
// repository's first ask of docs/CFT-GAPS.md, which measured thirty
// positives over the thirty-two registers a lane has and five of them
// over sixty-four. A store is a register write for P3's purposes,
// masked by the lane's active bit, so a lane that has left a loop keeps
// what it stored exactly as it kept its registers; a load writes rd and
// is masked the same way. Neither is arithmetic.
//
// So a spilled value's HOME IS A SLOT: it is computed into a register
// and stored at once, and every later read loads it into a register of
// its own. A loop-carried value - a phi - spills the same way, and more
// naturally: its copy-in becomes a store, its copy-back a store, and
// each read inside the body a load. The slot persists across
// iterations, which is what the pinned register was for.
//
// The choice is Belady's, weighted: spill the value whose live range is
// longest per read, because that is the one holding a register longest
// for the least. Results are never spilled (a DEPOSIT reads a
// register), nor are the three input streams, nor a reload.

function usesOf(ops) {
  const vUses = new Int32Array(ops.length);
  const pUses = new Map();
  for (const o of ops)
    for (const w of readsOf(o)) {
      const v = o[w];
      if (!v) continue;
      if (v.v !== undefined) vUses[v.v]++;
      else if (v.ph !== undefined) pUses.set(v.ph, (pUses.get(v.ph) || 0) + 1);
    }
  return { vUses, pUses };
}

/** Which values to spill so that no position needs more than `maxRegs`.
 *  Greedy over the live curve: take the worst position, spill the best
 *  candidate that is live across it, subtract its range from the curve,
 *  repeat. The curve is an estimate - a spilled value still holds a
 *  register for the one instruction that computes it and for each
 *  reload - so the caller re-profiles and comes back if it was wrong. */
function chooseSpills(ops, resultIds, order, geo, prof, maxRegs, phis, already) {
  const N = order.length;
  const { vUses, pUses } = usesOf(ops);
  const cands = [];
  for (const id of order) {
    const o = ops[id];
    if (!definesReg(o)) continue;
    if (prof.last[id] < 0) continue;
    const from = prof.pos[id], to = Math.min(prof.last[id], N);
    if (to <= from) continue;
    if (o.phiInit !== undefined) {
      if (already.phis.has(o.phiInit) || resultIds.ops.has(id)) continue;
      cands.push({ kind: "phi", ph: o.phiInit, id, from, to, uses: pUses.get(o.phiInit) || 0 });
    } else {
      if (resultIds.ops.has(id) || already.values.has(id)) continue;
      if (o.mem) continue;                       // a reload is not spilled again
      cands.push({ kind: "value", id, from, to, uses: vUses[id] || 0 });
    }
  }
  // range per read: the register-positions saved for each load it costs
  for (const c of cands) c.score = (c.to - c.from) / (c.uses + 1);
  cands.sort((a, b) => b.score - a.score || a.id - b.id);
  const live = Int32Array.from(prof.liveAt);
  const taken = new Set();
  const chosen = { values: new Set(), phis: new Set() };
  for (let guard = 0; guard < cands.length + 1; guard++) {
    let worst = -1, worstAt = -1;
    for (let p = 0; p < N; p++) if (live[p] > worst) { worst = live[p]; worstAt = p; }
    if (worst <= maxRegs) break;
    let pick = null;
    for (const c of cands) {
      if (taken.has(c)) continue;
      if (c.from <= worstAt && worstAt <= c.to) { pick = c; break; }
    }
    if (!pick) break;                            // nothing left that helps here
    taken.add(pick);
    if (pick.kind === "phi") chosen.phis.add(pick.ph); else chosen.values.add(pick.id);
    for (let p = pick.from; p <= pick.to && p < N; p++) live[p]--;
  }
  return chosen;
}

/** Rewrite the program with the chosen values living in scratch slots.
 *  Returns the new op list IN PROGRAM ORDER (so the caller's order
 *  becomes the identity and the segments are recomputed from it), the
 *  map from old op ids to new, and how many slots were taken.
 *
 *  Slots are assigned by a linear scan over the live ranges, so two
 *  values whose ranges do not overlap share one. */
function rewriteSpills(ops, order, phis, chosen, prof, slotBase) {
  const ranges = [];
  for (const id of chosen.values) ranges.push({ key: `v${id}`, from: prof.pos[id], to: prof.last[id] });
  for (const ph of chosen.phis) {
    const init = phis[ph].initOpNew;
    ranges.push({ key: `p${ph}`, from: prof.pos[init], to: prof.last[init] });
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const slotOf = new Map();
  const free = [];
  const busy = [];
  let high = slotBase;
  for (const r of ranges) {
    for (let i = busy.length - 1; i >= 0; i--)
      if (busy[i].to < r.from) { free.push(busy[i].slot); busy.splice(i, 1); }
    free.sort((a, b) => a - b);
    const slot = free.length ? free.shift() : high++;
    slotOf.set(r.key, slot);
    busy.push({ to: r.to, slot });
  }
  const slotV = (id) => slotOf.get(`v${id}`);
  const slotP = (ph) => slotOf.get(`p${ph}`);

  const out = [];
  const idOf = new Int32Array(ops.length).fill(-1);
  let stores = 0, loads = 0;
  const reload = (slot, type, name) => {
    const id = out.length;
    out.push({ mem: "ldl", slot, type, tag: `reload ${name}` });
    loads++;
    return { v: id };
  };
  /** A STORE READS A REGISTER, NEVER THE CONSTANT BANK - the same rule
   *  DEPOSIT has, and for the same reason: the loader refuses a stray
   *  `ka` on a control instruction, and the operand field of an `stl`
   *  whose source came out as a constant would name the REGISTER with
   *  that constant's index. Measured 2026-09-11 on `dissipation`, whose
   *  two carried values initialised to zero both stored from `r9`
   *  because the zero constant sat at bank slot 9: every deposit of
   *  every sample wrong, and the golden model and libcft agreeing with
   *  each other about it. So a constant or a per-run slot is moved into
   *  a register first, by OR-ing it with ITSELF - exact on every bit
   *  pattern, and it needs no bank entry that the layout no longer has
   *  room to add, the bank having been laid out before the schedule. */
  const inReg = (v, type, tag) => {
    if (v && (v.k !== undefined || v.t !== undefined)) {
      const id = out.length;
      out.push({ op: OP.IOR, rnd: RND.RNE, a: v, b: v, type, tag: `${tag} into a register` });
      return { v: id };
    }
    return v;
  };
  for (const oldId of order) {
    const o = ops[oldId];
    const m = { ...o };
    for (const w of readsOf(o)) {
      const v = o[w];
      if (!v) continue;
      if (v.v !== undefined) {
        m[w] = chosen.values.has(v.v)
          ? reload(slotV(v.v), ops[v.v].type, ops[v.v].tag || "value")
          : { v: idOf[v.v] };
        if (m[w].v < 0) throw new Error("cft-lower: a spilled operand read before its definition");
      } else if (v.ph !== undefined && chosen.phis.has(v.ph)) {
        m[w] = reload(slotP(v.ph), phis[v.ph].type, phis[v.ph].name);
      }
    }
    const phiHome = o.phiInit !== undefined && chosen.phis.has(o.phiInit) ? o.phiInit
                  : o.phiBack !== undefined && chosen.phis.has(o.phiBack) ? o.phiBack : -1;
    if (phiHome >= 0) {
      // The carried value lives in a slot now, so its copy-in and every
      // copy-back are stores. A plain copy stores its source directly;
      // a SELECT (the SETACT snapshot) has to compute first.
      const slot = slotP(phiHome);
      let src = m.a;
      if (!o.copy) {
        const nid = out.length;
        const body = { ...m };
        delete body.phiInit; delete body.phiBack;
        out.push(body);
        src = { v: nid };
      }
      out.push({ mem: "stl", slot, a: inReg(src, phis[phiHome].type, o.tag),
                 type: phis[phiHome].type, tag: `${o.tag} -> scratch` });
      stores++;
      continue;
    }
    const nid = out.length;
    out.push(m);
    idOf[oldId] = nid;
    if (chosen.values.has(oldId)) {
      out.push({ mem: "stl", slot: slotV(oldId), a: { v: nid }, type: o.type,
                 tag: `spill ${o.tag || "value"}` });
      stores++;
    }
  }
  return { ops: out, idOf, slots: high - slotBase, high, stores, loads };
}

/** Spill until the program fits `maxRegs` registers a lane, or until
 *  nothing is left to spill. Iterates because the reloads it inserts
 *  hold registers of their own. */
function spillToScratch(ops, args, resultIds, order, geo, phis, maxRegs, slotBase0 = 0) {
  let curOps = ops, curOrder = order, curGeo = geo, curResults = resultIds;
  let idMap = new Int32Array(ops.length).map((_, i) => i);
  const already = { values: new Set(), phis: new Set() };   // values in the CURRENT numbering
  let slotBase = slotBase0, stores = 0, loads = 0, rounds = 0;
  let spilledValues = 0, spilledPhis = 0;
  for (; rounds < 16; rounds++) {
    const prof = profileOf(curOps, args, curResults, curOrder, curGeo);
    if (prof.peak <= maxRegs) break;
    // the phi's copy-in, in the CURRENT numbering, for the slot scan
    curOps.forEach((o, i) => { if (o.phiInit !== undefined) phis[o.phiInit].initOpNew = i; });
    const chosen = chooseSpills(curOps, curResults, curOrder, curGeo, prof, maxRegs, phis, already);
    if (!chosen.values.size && !chosen.phis.size) break;
    const r = rewriteSpills(curOps, curOrder, phis, chosen, prof, slotBase);
    if (r.high > SCRATCH_D)
      throw new Error(`cft-lower: spilling wants ${r.high} scratch slots and a lane has ${SCRATCH_D}`);
    slotBase = r.high;
    stores += r.stores; loads += r.loads;
    spilledValues += chosen.values.size; spilledPhis += chosen.phis.size;
    // the value ids are the CURRENT numbering, so carry the set through
    // the rewrite's map as everything else is carried
    const carried = new Set();
    for (const v of already.values) if (r.idOf[v] >= 0) carried.add(r.idOf[v]);
    for (const v of chosen.values) if (r.idOf[v] >= 0) carried.add(r.idOf[v]);
    already.values = carried;
    for (const p of chosen.phis) already.phis.add(p);
    curOps = r.ops;
    curOrder = curOps.map((_, i) => i);
    curGeo = geometryOf(curOps, phis);
    curResults = { ops: new Set([...curResults.ops].map(i => r.idOf[i])), args: curResults.args };
    idMap = idMap.map(i => (i < 0 ? -1 : r.idOf[i]));
  }
  const peak = profileOf(curOps, args, curResults, curOrder, curGeo).peak;
  return { ops: curOps, order: curOrder, geo: curGeo, resultIds: curResults, idMap,
           slots: slotBase, stores, loads, rounds, peak, spilledValues, spilledPhis };
}

/** Local moves on a topological order, accepted when they lower the
 *  peak or, at equal peak, the sum of live registers over the program.
 *
 *  Each instruction is tried at the two ends of its legal window - just
 *  after its last producer, and just before its first consumer, within
 *  its own segment and short of the segment's pinned tail - which are
 *  where a value's lifetime is shortest at one end or the other.
 *  Sinking a producer toward its consumer is what a list scheduler
 *  cannot do, because it decides an instruction's place when the
 *  instruction becomes ready rather than when it is needed. The passes
 *  stop when a sweep changes nothing. Deterministic: same order in,
 *  same order out. */
function improveOrder(ops, args, resultIds, order0, geo) {
  let order = order0.slice();
  let best = profileOf(ops, args, resultIds, order, geo);
  const preds = ops.map(o => (o.ctrl ? [] : predsOf(o)));
  const consumers = ops.map(() => []);
  ops.forEach((o, id) => { for (const p of preds[id]) consumers[p].push(id); });
  const N = order.length;
  let passes = 0;
  for (; passes < 16; passes++) {
    let improved = false;
    for (let p = 0; p < N; p++) {
      const id = order[p];
      const o = ops[id];
      if (o.ctrl || o.mem || o.phiInit !== undefined || o.phiBack !== undefined) continue;   // pinned
      const seg = geo.segOf[id];
      const pos = best.pos;
      let lo = geo.segFrom(seg, pos), hi = geo.segTo(seg, pos);
      for (const q of preds[id]) if (pos[q] + 1 > lo) lo = pos[q] + 1;
      for (const c of consumers[id]) if (pos[c] - 1 < hi) hi = pos[c] - 1;
      for (const target of [hi, lo]) {
        if (target === p || target < 0 || target >= N) continue;
        const cand = order.slice();
        cand.splice(p, 1);
        cand.splice(target, 0, id);
        const sc = profileOf(ops, args, resultIds, cand, geo);
        if (sc.peak < best.peak || (sc.peak === best.peak && sc.sum < best.sum)) {
          order = cand; best = sc; improved = true; break;
        }
      }
    }
    if (!improved) break;
  }
  return { order, peak: best.peak, passes };
}

/** Registers, by linear scan over the final order, with the profile's
 *  intervals. A value's register returns to the free list at the
 *  position it is last needed - AFTER that instruction's own reads, so
 *  a destination may legally reuse a source's register: the lane reads
 *  a, b and c, then writes rd. A carried value keeps one register from
 *  its copy-in through its loop; its copy-backs write that register and
 *  allocate nothing. THE POOL IS UNBOUNDED ON PURPOSE: a program that
 *  needs more than the lane has is a fact worth reporting with a number
 *  rather than an exception. */
function allocate(ops, args, resultIds, order, geo, tailBase = 0) {
  const prof = profileOf(ops, args, resultIds, order, geo);
  const N = order.length;
  const free = [];
  for (let r = 256 * NREG - 1; r >= args.length; r--) free.push(r);
  const regOf = new Int32Array(ops.length).fill(-1);
  const phiReg = new Int32Array(geo.phiInit.length).fill(-1);
  const argReg = args.map((_, i) => i);
  let peak = args.length;
  const out = [];
  // who dies at each position
  const dying = new Array(N + 1).fill(null).map(() => []);
  for (const id of order) {
    const o = ops[id];
    if (o.ctrl || o.phiBack !== undefined) continue;
    if (prof.last[id] >= 0 && prof.last[id] < N) dying[prof.last[id]].push(["op", id]);
  }
  args.forEach((_, k) => { if (prof.argLast[k] >= 0 && prof.argLast[k] < N) dying[prof.argLast[k]].push(["arg", k]); });
  const src = (o, w) => {
    const v = o[w];
    if (!v) return { reg: 0, k: false };
    if (v.k !== undefined) return { reg: v.k, k: true };
    if (v.t !== undefined) return { reg: tailBase + v.t, k: true };   // the per-run tail
    if (v.arg !== undefined) {
      if (argReg[v.arg] < 0) throw new Error(`cft-lower: input ${args[v.arg].name} read after its register was freed`);
      return { reg: argReg[v.arg], k: false };
    }
    if (v.ph !== undefined) {
      if (phiReg[v.ph] < 0) throw new Error("cft-lower: a carried value read before its copy-in");
      return { reg: phiReg[v.ph], k: false };
    }
    const r = regOf[v.v];
    if (r < 0) throw new Error("cft-lower: an operand has no register");
    return { reg: r, k: false };
  };
  for (let p = 0; p < N; p++) {
    const id = order[p];
    const o = ops[id];
    if (o.ctrl && !o.mem) {
      const a = o.a ? src(o, "a") : undefined;
      for (const [kind, k] of dying[p]) free.push(kind === "arg" ? argReg[k] : regOf[k]);
      for (const [kind, k] of dying[p]) { if (kind === "arg") argReg[k] = -1; }
      out.push({ i: id, ctrl: o.ctrl, trip: o.trip, a });
      continue;
    }
    if (o.mem) {
      // a store reads and frees; a load takes a register like any
      // other definition, and both do it in that order
      const a = o.a ? src(o, "a") : undefined;
      const b = o.b ? src(o, "b") : undefined;
      for (const [kind, k] of dying[p]) free.push(kind === "arg" ? argReg[k] : regOf[k]);
      for (const [kind, k] of dying[p]) { if (kind === "arg") argReg[k] = -1; }
      let rd;
      if (definesReg(o)) {
        if (!free.length) throw new Error("cft-lower: the register pool ran dry");
        free.sort((x, y) => x - y);
        rd = free.shift();
        if (rd + 1 > peak) peak = rd + 1;
        regOf[id] = rd;
      }
      out.push({ i: id, mem: o.mem, slot: o.slot, rd, a, b, tag: o.tag });
      continue;
    }
    const a = src(o, "a"), b = src(o, "b"), c = src(o, "c");
    for (const [kind, k] of dying[p]) free.push(kind === "arg" ? argReg[k] : regOf[k]);
    for (const [kind, k] of dying[p]) { if (kind === "arg") argReg[k] = -1; }
    let rd;
    if (o.phiBack !== undefined) {
      rd = phiReg[o.phiBack];
      if (rd < 0) throw new Error("cft-lower: a copy-back before its copy-in");
    } else {
      if (!free.length) throw new Error("cft-lower: the register pool ran dry");
      free.sort((x, y) => x - y);
      rd = free.shift();
      if (rd + 1 > peak) peak = rd + 1;
      regOf[id] = rd;
      if (o.phiInit !== undefined) phiReg[o.phiInit] = rd;
    }
    out.push({ i: id, rd, a, b, c, op: o.op, rnd: o.rnd, tag: o.tag });
  }
  return { alloc: out, regOf, argReg, phiReg, peak };
}

/** The geometry of a program's op list: its loops, which loop each op
 *  is in, its straight-line segments, and where each phi's copy-in and
 *  loop are. Independent of the order within segments. */
export function geometryOf(ops, phis) {
  const loops = [];
  const stack = [];
  const opLoop = new Int32Array(ops.length).fill(-1);
  const phiLoop = new Int32Array(phis.length).fill(-1);
  const phiInit = new Int32Array(phis.length).fill(-1);
  ops.forEach((o, i) => {
    if (o.phiInit !== undefined) phiInit[o.phiInit] = i;
  });
  ops.forEach((o, i) => {
    if (o.ctrl === "repeat") {
      const l = loops.length;
      loops.push({ repeatOp: i, endrepOp: -1, parent: stack.length ? stack[stack.length - 1] : -1,
                   depth: stack.length + 1, trip: o.trip, exit: o.exit ?? "none" });
      for (const ph of o.phis) phiLoop[ph] = l;
      opLoop[i] = stack.length ? stack[stack.length - 1] : -1;
      stack.push(l);
      return;
    }
    if (o.ctrl === "endrep") {
      const l = stack.pop();
      if (l === undefined) throw new Error("cft-lower: an ENDREP without its REPEAT");
      loops[l].endrepOp = i;
      opLoop[i] = stack.length ? stack[stack.length - 1] : -1;
      return;
    }
    opLoop[i] = stack.length ? stack[stack.length - 1] : -1;
  });
  if (stack.length) throw new Error("cft-lower: a REPEAT without its ENDREP");
  // segments: maximal runs of ALU ops between control ops
  const segOf = new Int32Array(ops.length).fill(-1);
  const segs = [];
  let cur = null;
  // A SCRATCH ACCESS ENDS A SEGMENT. Not because it is a control word -
  // it is encoded with the control bit because the opcode byte is a
  // control code's, and it never touches the program counter - but
  // because two accesses to the same slot are ordered by the SLOT and
  // not by any operand the scheduler can see, and a reordering that
  // respects only the data dependences would let a load pass the store
  // it must see. Segments are how this file says "nothing moves across
  // here", so scratch uses it. The spiller does not care either way:
  // it inserts its accesses after the order is fixed, and from there
  // the segments feed only the lifetime profile, which reads the loop
  // geometry and not this.
  ops.forEach((o, i) => {
    if (o.ctrl || o.mem) { cur = null; return; }
    if (!cur) { cur = { ops: [], pinned: [] }; segs.push(cur); }
    segOf[i] = segs.length - 1;
    if (o.phiInit !== undefined || o.phiBack !== undefined) cur.pinned.push(i);
    else cur.ops.push(i);
  });
  const geo = { loops, opLoop, phiLoop, phiInit, segOf, segs };
  // the reorderable window of a segment in a given order: from its first
  // free op to just before its first pinned op (or its last free op)
  geo.segFrom = (s, pos) => (segs[s].ops.length ? Math.min(...segs[s].ops.map(i => pos[i])) : 0);
  geo.segTo = (s, pos) => {
    if (!segs[s].ops.length) return -1;
    const lastFree = Math.max(...segs[s].ops.map(i => pos[i]));
    const firstPinned = segs[s].pinned.length ? Math.min(...segs[s].pinned.map(i => pos[i])) : Infinity;
    return Math.min(lastFree, firstPinned - 1);
  };
  return geo;
}

function schedule(F, args, results, { isaExt, fuse, minmaxOpcode, doSchedule = true, tailValues = [] }) {
  // ---- dead code elimination, from the results and the loops' copies
  // back. The predication above evaluates paths that a branch would
  // have skipped, and CSE then leaves whole subtrees with no consumer;
  // this is what removes them. Control words and phi copies always stay.
  const live = new Set();
  const stack = results.map(r => r.value).filter(v => v.r !== undefined && v.r >= 0).map(v => v.r);
  results.forEach(r => { if (r.value.ph !== undefined) stack.push(F.phis[r.value.ph].initOp); });
  F.ops.forEach((o, i) => {
    // A STORE HAS AN EFFECT nothing else names, so it is a root here
    // exactly as a control word is; a load is kept by whoever reads it.
    if (o.ctrl || o.mem === "stl" || o.mem === "stx" ||
        o.phiInit !== undefined || o.phiBack !== undefined) stack.push(i);
  });
  while (stack.length) {
    const i = stack.pop();
    if (live.has(i)) continue;
    live.add(i);
    const o = F.ops[i];
    for (const w of readsOf(o)) {
      const v = o[w];
      if (!v) continue;
      if (v.r !== undefined && v.r >= 0) stack.push(v.r);
      if (v.ph !== undefined) stack.push(F.phis[v.ph].initOp);
    }
  }
  const keep = [...live].sort((a, b) => a - b);
  const newId0 = new Map(keep.map((old, i) => [old, i]));

  // the constant bank, in first-use order for now; re-laid below once
  // the schedule is chosen
  F.bank = [];
  const bankIdx = new Map();
  const kslot = (bits) => {
    if (!bankIdx.has(bits)) { bankIdx.set(bits, F.bank.length); F.bank.push(bits); }
    return bankIdx.get(bits);
  };
  const mapV = (v) => v.c !== undefined ? { k: kslot(v.c) }
                    : v.t !== undefined ? { t: v.t }
                    : v.ph !== undefined ? { ph: v.ph }
                    : v.r < 0 ? { arg: -1 - v.r }
                    : { v: newId0.get(v.r) };
  const ops = keep.map(old => {
    const o = F.ops[old];
    if (o.ctrl) {
      const m = { ctrl: o.ctrl, trip: o.trip, exit: o.exit, phis: o.phis };
      if (o.a) m.a = mapV(o.a);
      return m;
    }
    if (o.mem) {
      const m = { mem: o.mem, slot: o.slot, tag: o.tag, type: o.type, fn: o.fn ?? null };
      for (const w of ["a", "b"]) if (o[w] !== undefined) m[w] = mapV(o[w]);
      return m;
    }
    const m = { op: o.op, rnd: o.rnd, tag: o.tag, type: o.type, fn: o.fn ?? null };
    if (o.copy) m.copy = true;
    if (o.phiInit !== undefined) m.phiInit = o.phiInit;
    if (o.phiBack !== undefined) m.phiBack = o.phiBack;
    for (const w of ["a", "b", "c"]) {
      const v = o[w];
      if (v === undefined) continue;
      m[w] = mapV(v);
    }
    return m;
  });
  const geo = geometryOf(ops, F.phis);
  if (geo.loops.some(l => l.depth > MAX_LOOP_DEPTH))
    throw new Error(`cft-lower: loops nest deeper than ${MAX_LOOP_DEPTH}`);

  const resultOpIds = new Set();
  const resultArgIds = new Set();
  for (const r of results) {
    const v = r.value;
    if (v.c !== undefined || v.t !== undefined)
      throw new Error("cft-lower: an unmaterialised constant result");
    if (v.ph !== undefined) resultOpIds.add(newId0.get(F.phis[v.ph].initOp));
    else if (v.r < 0) resultArgIds.add(-1 - v.r);
    else resultOpIds.add(newId0.get(v.r));
  }
  const resultIds = { ops: resultOpIds, args: resultArgIds };

  // ---- per-segment orders under one policy, concatenated in program
  // order with the control words and the pinned copies in place
  const readOutside = (segIdx) => {
    // which of the segment's free ops are read outside it (or by its
    // pinned ops, or are results): live to the segment's end
    const seg = geo.segs[segIdx];
    const inSeg = new Set(seg.ops);
    const out = new Set();
    ops.forEach((o, i) => {
      for (const w of readsOf(o)) {
        const v = o[w];
        if (v && v.v !== undefined && inSeg.has(v.v) &&
            (!inSeg.has(i) || o.phiInit !== undefined || o.phiBack !== undefined || o.mem)) out.add(v.v);
      }
    });
    for (const r of resultOpIds) if (inSeg.has(r)) out.add(r);
    return out;
  };
  const segLocal = geo.segs.map((seg, s) => {
    const idx = new Map(seg.ops.map((id, i) => [id, i]));
    const local = seg.ops.map(id => {
      const o = ops[id];
      const m = { op: o.op, tag: o.tag };
      for (const w of ["a", "b", "c"]) {
        const v = o[w];
        if (v && v.v !== undefined && idx.has(v.v)) m[w] = { v: idx.get(v.v) };
      }
      return m;
    });
    const outside = readOutside(s);
    const localResults = new Set([...outside].map(id => idx.get(id)));
    return { local, idx, localResults, need: suNeed(local) };
  });
  const orderUnder = (policy, suMode = null) => {
    const order = [];
    let s = 0;
    // walk the ops in program order, emitting each segment's schedule
    // where the segment begins and control words where they are
    let i = 0;
    while (i < ops.length) {
      const o = ops[i];
      if (o.ctrl || o.mem) { order.push(i); i++; continue; }
      const seg = geo.segs[s], L = segLocal[s];
      let localOrder;
      if (suMode === null) localOrder = listSchedule(L.local, [...L.localResults], policy);
      else {
        const rs = [...L.localResults].sort((a, b) => a - b);
        const rOrder = suMode === "su" ? rs : suMode === "su-rev" ? rs.slice().reverse()
                     : rs.slice().sort((a, b) => L.need[b] - L.need[a] || a - b);
        localOrder = suOrder(L.local, L.need, rOrder, L.localResults);
      }
      for (const li of localOrder) order.push(seg.ops[li]);
      for (const pid of seg.pinned) order.push(pid);
      i += seg.ops.length + seg.pinned.length;
      s++;
    }
    return order;
  };

  // pick the schedule with the lowest register peak, deterministically
  const tried = [];
  let best = null;
  const consider = (name, order) => {
    const peak = profileOf(ops, args, resultIds, order, geo).peak;
    tried.push({ policy: name, peak });
    if (!best || peak < best.peak) best = { name, order, peak };
  };
  const policies = doSchedule ? POLICIES : [POLICIES[POLICIES.length - 1]];
  for (const policy of policies) consider(policy.name, orderUnder(policy));
  if (doSchedule) for (const mode of ["su", "su-rev", "su-need"]) consider(mode, orderUnder(null, mode));
  // then improve the winner by local moves - see improveOrder. Skipped
  // on the largest programs, where its quadratic sweep costs more than
  // the register it might save is worth measuring today.
  let picked = best.name;
  if (doSchedule && ops.length <= 3000) {
    const better = improveOrder(ops, args, resultIds, best.order, geo);
    tried.push({ policy: `${best.name}+local`, peak: better.peak, passes: better.passes });
    if (better.peak < best.peak) { best = { ...best, order: better.order, peak: better.peak }; picked = `${best.name}+local`; }
  }
  const order = best.order;

  // The constant bank was filled in walk order; re-lay it in the
  // scheduled order, so the first sixteen slots - the ones the operand
  // field can address - are the sixteen the program reaches first, and
  // the listing reads in the order it executes.
  const bank = [];
  const remap = new Map();
  for (const id of order) {
    const o = ops[id];
    if (o.ctrl) continue;
    for (const w of ["a", "b", "c"]) {
      const v = o[w];
      if (!v || v.k === undefined) continue;
      if (!remap.has(v.k)) { remap.set(v.k, bank.length); bank.push(F.bank[v.k]); }
      o[w] = { k: remap.get(v.k) };
    }
  }
  // THE PER-RUN TAIL comes after the program's own constants, in the
  // order it was declared and whether or not each slot is read, so the
  // layout is a property of the emitter and not of one positive. The
  // values written here are the ones the program was emitted for - the
  // lever defaults and the clock - and are what a bank-per-run
  // replaces.
  const tailBase = bank.length;
  const tail = F.tail ?? 0;
  if (tailValues.length !== tail)
    throw new Error(`cft-lower: ${tail} tail slots declared, ${tailValues.length} values given`);
  for (let i = 0; i < tail; i++) bank.push(tailValues[i] >>> 0);

  // ---- the register wall, and the scratch on the other side of it
  //
  // The pool above is unbounded on purpose, so a program that wants more
  // registers than a lane has is a number rather than an exception. When
  // that number exceeds NREG, the values that hold a register longest for
  // the fewest reads move into the per-lane scratch (revision 3's R4) and
  // the program is re-profiled and re-allocated. The target drops by two
  // each round, because the reloads themselves want registers, and the
  // loop ends when the lane's thirty-two are enough.
  let opsF = ops, orderF = order, geoF = geo, resultsF = resultIds;
  let idMap = null, slotBase = F.scratchFixed, spillStores = 0, spillLoads = 0, spillRounds = 0;
  let spillValues = 0, spillPhis = 0;
  let final = allocate(opsF, args, resultsF, orderF, geoF, tailBase);
  // CFT_NO_SPILL=1 leaves a program over the register count instead,
  // which is how a fault is told from a fault in the spiller: the
  // unspilled program goes down the widened-lane path and is scored
  // against the same text. It found nothing on 2026-09-11 and that was
  // the useful answer - the fault was in the vector constructors.
  const spilling = process.env.CFT_NO_SPILL !== "1";
  for (let target = NREG; spilling && final.peak > NREG && target >= 8; target -= 2) {
    const s = spillToScratch(opsF, args, resultsF, orderF, geoF, F.phis, target, slotBase);
    if (!s.stores && !s.loads) break;
    opsF = s.ops; orderF = s.order; geoF = s.geo; resultsF = s.resultIds;
    idMap = idMap ? idMap.map(i => (i < 0 ? -1 : s.idMap[i])) : s.idMap;
    slotBase = s.slots; spillStores += s.stores; spillLoads += s.loads; spillRounds += s.rounds;
    spillValues += s.spilledValues; spillPhis += s.spilledPhis;
    final = allocate(opsF, args, resultsF, orderF, geoF, tailBase);
  }
  const scratchSlots = slotBase;
  if (scratchSlots) F.needs.add("scratch");
  if (F.arrays.length) F.needs.add("scratch-indexed");
  const mapId = (i) => (idMap ? idMap[i] : i);

  const insns = final.alloc.map((e) => {
    if (e.mem) {
      // The slot is the instruction's own; the register fields are what
      // the code reads and writes and nothing else. A scratch access
      // names no constant, so an operand that came out of the bank is a
      // bug in the spiller rather than something to encode.
      if ((e.a && e.a.k) || (e.b && e.b.k))
        throw new Error(`cft-lower: ${e.mem} reads a register, not the bank`);
      return { ctrl: e.mem, slot: e.slot, rd: e.rd,
               ra: e.a ? e.a.reg : undefined, rb: e.b ? e.b.reg : undefined, tag: e.tag };
    }
    if (e.ctrl) {
      if (e.a && e.a.k) throw new Error("cft-lower: SETACT reads a register, not the bank");
      return { ctrl: e.ctrl, trip: e.trip, ra: e.a ? e.a.reg : undefined, tag: e.ctrl };
    }
    const { rd, a, b, c, op, rnd, tag } = e;
    const kx = [a, b, c].some(s => s.k && s.reg >= KREG);
    if (kx) F.needs.add("kx");
    if ([a, b, c].some(s => s.k && s.reg >= KMEM_D_REV2)) F.needs.add("kx9");
    return {
      op, rnd, rd,
      ra: kx && a.k ? 0 : a.reg, rb: kx && b.k ? 0 : b.reg, rc: kx && c.k ? 0 : c.reg,
      ka: a.k, kb: b.k, kc: c.k, kx,
      imm: kx ? packKx(a.k ? a.reg : 0, b.k ? b.reg : 0, c.k ? c.reg : 0) : 0,
      tag,
    };
  });

  const deposits = results.map(r => {
    const v = r.value;
    const reg = v.ph !== undefined ? final.phiReg[v.ph]
              : v.r < 0 ? final.argReg[-1 - v.r]
              : final.regOf[mapId(newId0.get(v.r))];
    if (reg === undefined || reg < 0) throw new Error(`cft-lower: ${F.name}'s result ${r.name} has no register`);
    return { name: r.name, reg };
  });

  const peak = final.peak;
  const encodable = peak <= NREG;
  if (!encodable) F.needs.add("registers");
  if (peak > 16) F.needs.add("regs32");
  let words = null;
  if (encodable) {
    words = insns.map(i => (i.ctrl === "repeat" ? encode({ op: CTRL.REPEAT, ctrl: true, imm: i.trip })
                          : i.ctrl === "endrep" ? encode({ op: CTRL.ENDREP, ctrl: true })
                          : i.ctrl === "setact" ? encode({ op: CTRL.SETACT, ctrl: true, ra: i.ra })
                          : i.ctrl === "actall" ? encode({ op: CTRL.ACTALL, ctrl: true })
                          : i.ctrl === "stl" ? encode({ op: CTRL.STL, ctrl: true, ra: i.ra, imm: i.slot })
                          : i.ctrl === "ldl" ? encode({ op: CTRL.LDL, ctrl: true, rd: i.rd, imm: i.slot })
                          : i.ctrl === "stx" ? encode({ op: CTRL.STX, ctrl: true, ra: i.ra, rb: i.rb })
                          : i.ctrl === "ldx" ? encode({ op: CTRL.LDX, ctrl: true, rd: i.rd, rb: i.rb })
                          : encode(i)));
    for (const d of deposits) words.push(encode({ op: CTRL.DEPOSIT, ra: d.reg, ctrl: true }));
    words.push(encode({ op: CTRL.HALT, ctrl: true }));
  }

  if (F.needs.has("imul") && !isaExt)
    throw new Error(`cft-lower: ${F.name} needs IMUL - re-run with --isa-ext`);

  const alu = insns.filter(i => !i.ctrl).length;
  const scratchWords = insns.filter(i => SCRATCH_NAMES.has(i.ctrl)).length;
  const loopWords = insns.length - alu - scratchWords;   // REPEAT, ENDREP, SETACT, ACTALL
  const setacts = insns.filter(i => i.ctrl === "setact").length;
  return {
    name: F.name,
    fused: fuse,
    minmaxOpcode,
    args,
    results: deposits,
    insns,
    words,
    encodable,
    consts: bank,
    tailBase,
    tail,
    regsUsed: peak,
    loops: geo.loops.map(l => ({ trip: l.trip, depth: l.depth, exit: l.exit })),
    phis: F.phis.length,
    schedules: tried,
    schedulePicked: picked,
    needs: [...F.needs].sort(),
    gaps: Object.fromEntries([...F.gaps].sort()),
    folds: F.folds,
    // THE GRAPH AS SCHEDULED, for tools that measure rather than encode
    // (tools/measure-cft-gaps.mjs): the ops after dead-code elimination
    // with their operands as {v}, {k}, {t}, {ph} or {arg}, the order the
    // registers were allocated over, the loop geometry, and which det
    // function each op was inlined from. tools/emit-cft.mjs's record
    // does not carry it.
    graph: { ops: opsF, order: orderF, geo: geoF, args, resultIds: resultsF,
             phiNames: F.phis.map(p => p.name) },
    callSites: Object.fromEntries([...F.callSites].sort()),
    scratch: { slots: scratchSlots, stores: spillStores, loads: spillLoads, rounds: spillRounds,
               values: spillValues, phis: spillPhis,
               arrays: F.arrays.map(a => ({ name: a.name, base: a.base, len: a.len, type: a.type })) },
    counts: {
      alu,
      loop: loopWords,
      setact: setacts,
      scratch: scratchWords,
      control: loopWords + deposits.length + 1,
      total: insns.length + deposits.length + 1,
      consts: bank.length,
      fixedConsts: tailBase,
    },
  };
}
