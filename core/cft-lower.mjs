// The det library as sequencer instruction sequences.
//
// One det_* function becomes one straight-line program: no branches,
// because the ISA has none outside REPEAT/ENDREP; every conditional
// evaluated on both sides and resolved by SELECT; every call inlined,
// because there is no CALL. What comes out is a list of instructions in
// docs/SEQUENCER.md's encoding, a constant bank, a register map and a
// deposit schema.
//
// WHAT THIS DELIBERATELY DOES NOT DO is rewrite the arithmetic. Every
// float operation in the sequence is the operation the shipped GLSL
// performs, in the order the shipped GLSL performs it, under
// round-to-nearest-even - which is what makes the verification in
// tools/verify-cft-detlib.mjs mean something. The transformations here
// are all of one kind: control flow becomes selection, and an operation
// the ISA lacks becomes a documented expansion of operations it has.
// Each expansion is derived below, with the domain it is valid on,
// because a bit trick nobody can check is a constant nobody can check.
//
// THE ONE THING THAT IS NOT ARITHMETIC-NEUTRAL, and it is the finding
// this whole file exists to make concrete: the library SHIPS UNFUSED.
// tools/gen-detlib.mjs rewrites all 56 fma() calls to a multiply and an
// add before the byte comparison against the darkroom's deployed
// detlib.glsl, so the bits four GPU vendors agree on are the bits of
// two roundings, not one. cft-fp256's docs/ATLAS.md maps `precise fma`
// onto the tile's FMA opcode; doing that would compute a DIFFERENT
// function, more accurate and wrong. The default here is `fuse: false`
// - a MUL and an ADD per rewritten fma - and `fuse: true` exists only
// so the verification can measure how far apart the two are.
//
// SINCE 2026-09-08 THE SAME LOWERING TAKES A PLATE. core/emit-cft.mjs
// hands it the shape function core/emit.mjs wrote, and three things
// were added for that and nothing else: vectors, scalarised at the parse
// so a vec3 is three of the values already here; BINDINGS, so a
// parameter may come from a named stream, from several, or from the
// constant bank; and a PER-RUN TAIL of the bank - the eight levers and
// the clock - laid out after the program's own constants in a fixed
// order, so the day the coprocessor takes a bank per run (its
// OPT-D-contract.md item 5) the split is a boundary and not a re-emit.
// A `t` value is a slot of that tail: never folded, since its value is
// not known here.

import { OP, RND, CTRL, READS, ROUNDS, encode, NREG, KREG } from "./cft-isa.mjs";
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
    insns: 2,
    domain: "k an exact integer, |k| < 2^22",
    how: "k + 1.5*2^23 lands in [2^23, 2^24) where the spacing is 1, so its " +
         "encoding is 0x4B400000 + k in two's complement; one ISUB of " +
         "0x4B400000 is int(k). This is the same magic constant the library " +
         "already uses to round, so no new number enters the bank.",
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

class Fn {
  constructor(name) {
    this.name = name;
    this.ops = [];             // {op, rnd, a, b, c, tag}
    this.cse = new Map();
    this.folds = { int: 0, float: 0, identity: 0 };
    this.needs = new Set();    // "imul", "kx"
    this.gaps = new Map();     // expansion name -> count
  }

  gap(k) { this.gaps.set(k, (this.gaps.get(k) || 0) + 1); }

  /** Emit one instruction, or reuse an identical earlier one. Every op
   *  here is a pure function of its operands, so common-subexpression
   *  elimination cannot change a result - and it is worth doing because
   *  the inliner produces the same guard twice in several functions. */
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
                 ...["a", "b", "c"].map(w => {
                   const v = slot[w];
                   return v === undefined ? "-" : v.c !== undefined ? `c${v.c}`
                        : v.t !== undefined ? `t${v.t}` : `r${v.r}`;
                 })].join("|");
    const hit = this.cse.get(key);
    if (hit !== undefined) return { r: hit, type };
    const id = this.ops.length;
    this.ops.push({ op, rnd: ROUNDS.has(op) ? rnd : RND.RNE, ...slot, type, tag });
    this.cse.set(key, id);
    return { r: id, type };
  }
}

// ---------------------------------------------------------- lowering

export function lowerFunction(lib, name, opts = {}) {
  const fuse = !!opts.fuse;
  const isaExt = !!opts.isaExt;
  const minmaxOpcode = !!opts.minmaxOpcode;
  const F = new Fn(name);
  const decl = lib.byName.get(name);
  if (!decl) throw new Error(`cft-lower: no function ${name}`);

  const K = (bits, type = "float") => ({ c: bits >>> 0, type });
  const isC = (v) => v.c !== undefined;

  // ---- values in the shape of their type
  //
  // A scalar is {r}, {c}, {t} or an input; a vector is {vec: [...]} of
  // scalars; an array is {arr: [...]}. Zero, selection and equality
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
    return a.r === b.r && a.c === b.c && a.t === b.t && a.arg === b.arg;
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
  const andb = (p, q) => (p === null ? q : E(OP.MUL, [p, q], { type: "bool", tag: "&&" }));
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
  const f2i = (k) => {
    F.gap("f2i");
    const t = E(OP.ADD, [k, K(K_MAGIC)], { type: "float", tag: "f2i" });
    return E(OP.ISUB, [t, K(K_MAGIC, "uint")], { type: "int", tag: "f2i" });
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
        if (!o.arr) throw new Error(`cft-lower: [] on a ${o.type}`);
        if (e.i.n !== "lit")
          throw new Error("cft-lower: an array index has to be a literal - the bank " +
                          "is addressed by the instruction, not by a register");
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
      if (op === "/" || op === "%")
        throw new Error(`cft-lower: integer ${op} is not lowered yet - the ISA has no ` +
                        `divider, and the exact sequence for it is the next expansion`);
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
      // a constructor: components in order, a lone scalar broadcast
      const parts = [];
      for (const x of e.args) { const v = lowerExpr(x, env); if (v.vec) parts.push(...v.vec); else parts.push(v); }
      const want = VEC[n].n;
      if (parts.length === 1) while (parts.length < want) parts.push(parts[0]);
      if (parts.length !== want) throw new Error(`cft-lower: ${n}(...) given ${parts.length} components`);
      return { vec: parts.map(p => ({ ...p, type: VEC[n].elem })), type: n };
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
    const r = lowerBody(f, inner);
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
  // is the one whose value survives - which is what a branch does.
  function lowerBody(f, env) {
    const rets = [];
    const outNames = f.params.filter(p => p.out).map(p => p.name);
    const term = lowerStmt(f.body, env, null, rets, outNames);
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

  function lowerStmt(s, env, cond, rets, outNames) {
    switch (s.n) {
      case "block": {
        for (const x of s.body) if (lowerStmt(x, env, cond, rets, outNames)) return true;
        return false;
      }
      case "decl":
        for (const d of s.decls)
          env.set(d.name, d.init ? lowerExpr(d.init, env) : zeroOf(s.type));
        return false;
      case "assign": env.set(s.name, lowerExpr(s.value, env)); return false;
      case "expr": lowerExpr(s.value, env); return false;
      case "return":
        rets.push({ cond, value: s.value ? lowerExpr(s.value, env) : undefined,
                    outs: Object.fromEntries(outNames.map(n => [n, env.get(n)])) });
        return true;
      case "if": {
        const c = lowerExpr(s.c, env);
        const envT = new Map(env), envE = new Map(env);
        const termT = lowerStmt(s.then, envT, andb(cond, c), rets, outNames);
        const nc = notb(c);
        const termE = s.els ? lowerStmt(s.els, envE, andb(cond, nc), rets, outNames) : false;
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
      // The loop is the one construct this pass does not hold yet: a
      // REPEAT with the body's writes predicated on a running flag and
      // the loop-carried values pinned to their registers across the
      // back-edge. It is the next step, and a positive that carries one
      // is refused by name here so tools/emit-cft.mjs --all can count
      // them rather than guess.
      case "for":
      case "break":
        throw new Error("cft-lower: a for loop is not lowered yet - REPEAT lowering " +
                        "with predicated writes is the next step");
      default: throw new Error(`cft-lower: statement ${s.n}`);
    }
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
  // the copy.
  const materialise = (v) =>
    (v.c !== undefined || v.t !== undefined || v.r < 0)
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
// Sixteen registers per lane is the binding constraint on this library,
// and the order an expression walk happens to produce is not the order
// that fits in them. The instructions form a DAG of pure operations, so
// any topological order computes the same values and only the peak
// number of live registers changes.
//
// Four schedules are built and the one with the lowest peak is kept.
// Each is a greedy list schedule over the ready set - the instructions
// whose operands are all computed - and they differ only in how they
// break ties, which is where a greedy scheduler's whole behaviour
// lives. Trying several and measuring is cheaper than arguing for one,
// and `walk` is in the list so the doc can say what the reordering
// bought. The winner is recorded per function in core/detlib.cft.json.

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
  // next one begins - which is also how the source order got its 17,
  // and this policy improves on it where the source computes several
  // things before using any of them.
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

/** One greedy list schedule. Returns the new order as indices into
 *  `ops`. */
function listSchedule(ops, args, resultIds, policy) {
  const N = ops.length;
  const preds = ops.map(o => {
    const s = new Set();
    for (const w of ["a", "b", "c"]) if (o[w] && o[w].v !== undefined) s.add(o[w].v);
    return s;
  });
  const uses = ops.map(() => []);
  preds.forEach((s, i) => { for (const p of s) uses[p].push(i); });
  const height = new Array(N).fill(0);
  for (let i = N - 1; i >= 0; i--)
    for (const u of uses[i]) height[i] = Math.max(height[i], height[u] + 1);
  const remaining = uses.map(u => u.length);
  for (const id of resultIds) remaining[id]++;            // the deposit is a use
  const argRemaining = args.map(() => 0);
  for (const o of ops) {
    const seen = new Set();
    for (const w of ["a", "b", "c"]) {
      const v = o[w];
      if (v && v.arg !== undefined && !seen.has(v.arg)) { seen.add(v.arg); argRemaining[v.arg]++; }
    }
  }
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
      const seen = new Set();
      for (const w of ["a", "b", "c"]) {
        const v = ops[i][w];
        if (v && v.arg !== undefined && !seen.has(v.arg)) {
          seen.add(v.arg);
          if (argRemaining[v.arg] === 1) kills++;
        }
      }
      const k = policy.key({ kills, height: height[i], fanout: remaining[i], i, newest });
      if (best < 0 || lessKey(k, bestKey)) { best = i; bestKey = k; }
    }
    if (best < 0) throw new Error("cft-lower: the schedule stalled");
    ready.delete(best);
    posOf[best] = order.length;
    order.push(best);
    for (const p of preds[best]) remaining[p]--;
    const seen = new Set();
    for (const w of ["a", "b", "c"]) {
      const v = ops[best][w];
      if (v && v.arg !== undefined && !seen.has(v.arg)) { seen.add(v.arg); argRemaining[v.arg]--; }
    }
    for (const u of uses[best]) if (--unmet[u] === 0) ready.add(u);
  }
  return order;
}

/** The register profile of an order, without allocating: how many
 *  values are live INTO each instruction - defined before it, last read
 *  after it - plus the one it defines. Its peak is exactly the count
 *  the lowest-free-register scan below will use, so orders can be
 *  compared cheaply. Results stay live to the end, where the deposits
 *  are. */
function pressureOf(ops, args, resultIds, order) {
  const N = order.length;
  const pos = new Array(ops.length).fill(-1);
  order.forEach((id, p) => { pos[id] = p; });
  const last = new Array(ops.length).fill(-1);
  const argLast = new Array(args.length).fill(-1);
  for (const id of order) {
    const o = ops[id];
    for (const w of ["a", "b", "c"]) {
      const v = o[w];
      if (!v) continue;
      if (v.v !== undefined && pos[id] > last[v.v]) last[v.v] = pos[id];
      if (v.arg !== undefined && pos[id] > argLast[v.arg]) argLast[v.arg] = pos[id];
    }
  }
  for (const id of resultIds.ops) last[id] = N;
  for (const a of resultIds.args) argLast[a] = N;
  const diff = new Int32Array(N + 2);
  const span = (def, l) => { const s = def + 1, e = Math.min(l, N); if (e > s) { diff[s]++; diff[e]--; } };
  for (const id of order) if (last[id] >= 0) span(pos[id], last[id]);
  args.forEach((_, k) => { if (argLast[k] >= 0) span(-1, argLast[k]); });
  let live = 0, peak = 0, sum = 0;
  for (let p = 0; p < N; p++) {
    live += diff[p];
    const need = live + 1;
    if (need > peak) peak = need;
    sum += need;
  }
  return { peak, sum, pos };
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
    const ch = [];
    for (const w of ["a", "b", "c"]) { const v = o[w]; if (v && v.v !== undefined && !ch.includes(v.v)) ch.push(v.v); }
    const ns = ch.map(c => need[c]).sort((x, y) => y - x);
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
  const preds = ops.map(o => {
    const ch = [];
    for (const w of ["a", "b", "c"]) { const v = o[w]; if (v && v.v !== undefined && !ch.includes(v.v)) ch.push(v.v); }
    return ch;
  });
  const consumers = ops.map(() => []);
  preds.forEach((ps, i) => { for (const p of ps) consumers[p].push(i); });
  // readers still to come, per value; the deposit is a reader
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

/** Local moves on a topological order, accepted when they lower the
 *  peak or, at equal peak, the sum of live registers over the program.
 *
 *  Each instruction is tried at the two ends of its legal window - just
 *  after its last producer, and just before its first consumer - which
 *  are where a value's lifetime is shortest at one end or the other.
 *  Sinking a producer toward its consumer is what a list scheduler
 *  cannot do, because it decides an instruction's place when the
 *  instruction becomes ready rather than when it is needed. The passes
 *  stop when a sweep changes nothing. Deterministic: same order in,
 *  same order out. */
function improveOrder(ops, args, resultIds, order0) {
  let order = order0.slice();
  let best = pressureOf(ops, args, resultIds, order);
  const preds = ops.map(o => {
    const s = [];
    for (const w of ["a", "b", "c"]) { const v = o[w]; if (v && v.v !== undefined) s.push(v.v); }
    return s;
  });
  const consumers = ops.map(() => []);
  ops.forEach((o, id) => { for (const p of preds[id]) consumers[p].push(id); });
  const N = order.length;
  let passes = 0;
  for (; passes < 16; passes++) {
    let improved = false;
    for (let p = 0; p < N; p++) {
      const id = order[p];
      const pos = best.pos;
      let lo = 0;
      for (const q of preds[id]) if (pos[q] + 1 > lo) lo = pos[q] + 1;
      let hi = N - 1;
      for (const c of consumers[id]) if (pos[c] - 1 < hi) hi = pos[c] - 1;
      for (const target of [hi, lo]) {
        if (target === p) continue;
        const cand = order.slice();
        cand.splice(p, 1);
        cand.splice(target, 0, id);
        const sc = pressureOf(ops, args, resultIds, cand);
        if (sc.peak < best.peak || (sc.peak === best.peak && sc.sum < best.sum)) {
          order = cand; best = sc; improved = true; break;
        }
      }
    }
    if (!improved) break;
  }
  return { order, peak: best.peak, passes };
}

/** Registers, by linear scan over a given order.
 *
 *  THE POOL IS UNBOUNDED ON PURPOSE. A function that needs more than
 *  sixteen registers is a fact worth reporting with a number rather
 *  than an exception - docs/ATLAS.md item 4 argues for CALL from
 *  instruction count alone, and register pressure turns out to be the
 *  sharper constraint. An operand's register returns to the free list
 *  at the instruction that last reads it, AFTER that instruction's own
 *  reads, so a destination may legally reuse a source's register: the
 *  lane reads a, b and c, then writes rd. */
function allocate(ops, args, resultIdSet, tailBase = 0) {
  const N = ops.length;
  const lastUse = new Array(N).fill(-1);
  const argLast = new Array(args.length).fill(-1);
  ops.forEach((o, i) => {
    for (const w of ["a", "b", "c"]) {
      const v = o[w];
      if (!v) continue;
      if (v.v !== undefined) lastUse[v.v] = i;
      if (v.arg !== undefined) argLast[v.arg] = i;
    }
  });
  for (const id of resultIdSet.ops) lastUse[id] = N;      // live through the deposits
  for (const a of resultIdSet.args) argLast[a] = N;

  const free = [];
  for (let r = 256 * NREG - 1; r >= args.length; r--) free.push(r);
  const regOf = new Array(N).fill(-1);
  const argReg = args.map((_, i) => i);
  const dead = new Set();
  let peak = args.length;
  const out = [];
  for (let i = 0; i < N; i++) {
    const dying = [];
    args.forEach((_, k) => { if (argLast[k] === i && argReg[k] >= 0) dying.push(["arg", k]); });
    for (let j = 0; j < i; j++) if (lastUse[j] === i && !dead.has(j)) dying.push(["op", j]);
    for (const [kind, k] of dying) free.push(kind === "arg" ? argReg[k] : regOf[k]);
    if (!free.length) throw new Error("cft-lower: the register pool ran dry");
    free.sort((a, b) => a - b);
    const rd = free.shift();
    peak = Math.max(peak, rd + 1);
    const o = ops[i];
    const src = (w) => {
      const v = o[w];
      if (!v) return { reg: 0, k: false };
      if (v.k !== undefined) return { reg: v.k, k: true };
      if (v.t !== undefined) return { reg: tailBase + v.t, k: true };   // the per-run tail
      if (v.arg !== undefined) return { reg: argReg[v.arg], k: false };
      const r = regOf[v.v];
      if (r < 0) throw new Error("cft-lower: an operand has no register");
      return { reg: r, k: false };
    };
    const a = src("a"), b = src("b"), c = src("c");
    regOf[i] = rd;
    for (const [kind, k] of dying) { if (kind === "arg") argReg[k] = -1; else dead.add(k); }
    out.push({ i, rd, a, b, c, op: o.op, rnd: o.rnd, tag: o.tag });
  }
  return { alloc: out, regOf, argReg, peak };
}

function schedule(F, args, results, { isaExt, fuse, minmaxOpcode, doSchedule = true, tailValues = [] }) {
  // ---- dead code elimination, from the results back. The predication
  // above evaluates paths that a branch would have skipped, and CSE
  // then leaves whole subtrees with no consumer; this is what removes
  // them.
  const live = new Set();
  const stack = results.map(r => r.value).filter(v => v.r !== undefined && v.r >= 0)
                       .map(v => v.r);
  while (stack.length) {
    const i = stack.pop();
    if (live.has(i)) continue;
    live.add(i);
    for (const w of ["a", "b", "c"]) {
      const v = F.ops[i][w];
      if (v && v.r !== undefined && v.r >= 0) stack.push(v.r);
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
  const ops = keep.map(old => {
    const o = F.ops[old];
    const m = { op: o.op, rnd: o.rnd, tag: o.tag, type: o.type };
    for (const w of ["a", "b", "c"]) {
      const v = o[w];
      if (v === undefined) continue;
      if (v.c !== undefined) m[w] = { k: kslot(v.c) };
      else if (v.t !== undefined) m[w] = { t: v.t };
      else if (v.r < 0) m[w] = { arg: -1 - v.r };
      else m[w] = { v: newId0.get(v.r) };
    }
    return m;
  });

  const resultOpIds = new Set();
  const resultArgIds = new Set();
  for (const r of results) {
    if (r.value.c !== undefined || r.value.t !== undefined)
      throw new Error("cft-lower: an unmaterialised constant result");
    if (r.value.r < 0) resultArgIds.add(-1 - r.value.r);
    else resultOpIds.add(newId0.get(r.value.r));
  }

  // pick the schedule with the lowest register peak, deterministically
  const tried = [];
  let best = null;
  const resultIds = { ops: resultOpIds, args: resultArgIds };
  for (const policy of (doSchedule ? POLICIES : [POLICIES[POLICIES.length - 1]])) {
    const order = listSchedule(ops, args, [...resultOpIds], policy);
    const peak = pressureOf(ops, args, resultIds, order).peak;
    tried.push({ policy: policy.name, peak });
    if (!best || peak < best.peak) best = { policy, order, peak };
  }
  // Sethi-Ullman orders, depth first from the results - see suOrder.
  // Three ways of ordering the results themselves, since the DAG's
  // shared values make that choice matter and no rule settles it.
  if (doSchedule) {
    const rs = [...resultOpIds];
    const need = suNeed(ops);
    for (const [name, rOrder] of [
      ["su", rs],
      ["su-rev", rs.slice().reverse()],
      ["su-need", rs.slice().sort((a, b) => need[b] - need[a] || a - b)],
    ]) {
      const order = suOrder(ops, need, rOrder, resultOpIds);
      const peak = pressureOf(ops, args, resultIds, order).peak;
      tried.push({ policy: name, peak });
      if (peak < best.peak) best = { policy: { name }, order, peak };
    }
  }
  // then improve the winner by local moves - see improveOrder. Skipped
  // on the largest programs, where its quadratic sweep costs more than
  // the register it might save is worth measuring today.
  let picked = best.policy.name;
  if (doSchedule && ops.length <= 3000) {
    const better = improveOrder(ops, args, resultIds, best.order);
    tried.push({ policy: `${best.policy.name}+local`, peak: better.peak, passes: better.passes });
    if (better.peak < best.peak) { best = { ...best, order: better.order, peak: better.peak }; picked = `${best.policy.name}+local`; }
  }
  const pos = new Map(best.order.map((old, i) => [old, i]));
  const reordered = best.order.map(old => {
    const o = { ...ops[old] };
    for (const w of ["a", "b", "c"]) if (o[w] && o[w].v !== undefined) o[w] = { v: pos.get(o[w].v) };
    return o;
  });
  const rIds = { ops: new Set([...resultOpIds].map(i => pos.get(i))), args: resultArgIds };

  // The constant bank was filled in walk order; re-lay it in the
  // scheduled order, so the first sixteen slots - the ones an
  // unextended tile can address - are the sixteen the program reaches
  // first, and the listing reads in the order it executes.
  const bank = [];
  const remap = new Map();
  for (const o of reordered)
    for (const w of ["a", "b", "c"]) {
      const v = o[w];
      if (!v || v.k === undefined) continue;
      if (!remap.has(v.k)) { remap.set(v.k, bank.length); bank.push(F.bank[v.k]); }
      o[w] = { k: remap.get(v.k) };
    }
  // THE PER-RUN TAIL comes after the program's own constants, in the
  // order it was declared and whether or not each slot is read, so the
  // layout is a property of the emitter and not of one positive. The
  // values written here are the ones the program was emitted for - the
  // lever defaults and the clock - and are what a bank-per-run would
  // replace.
  const tailBase = bank.length;
  const tail = F.tail ?? 0;
  if (tailValues.length !== tail)
    throw new Error(`cft-lower: ${tail} tail slots declared, ${tailValues.length} values given`);
  for (let i = 0; i < tail; i++) bank.push(tailValues[i] >>> 0);
  // allocate again over the remapped constants so the encoded operands
  // carry the new indices
  const final = allocate(reordered, args, rIds, tailBase);

  const insns = final.alloc.map(({ rd, a, b, c, op, rnd, tag }) => {
    const kx = [a, b, c].some(s => s.k && s.reg >= KREG);
    if (kx) F.needs.add("kx");
    return {
      op, rnd, rd,
      ra: kx && a.k ? 0 : a.reg, rb: kx && b.k ? 0 : b.reg, rc: kx && c.k ? 0 : c.reg,
      ka: a.k, kb: b.k, kc: c.k, kx,
      imm: kx ? ((a.k ? a.reg : 0) | ((b.k ? b.reg : 0) << 8) | ((c.k ? c.reg : 0) << 16)) >>> 0 : 0,
      tag,
    };
  });

  const deposits = results.map(r => {
    const v = r.value;
    const reg = v.r < 0 ? final.argReg[-1 - v.r] : final.regOf[pos.get(newId0.get(v.r))];
    if (reg < 0) throw new Error(`cft-lower: ${F.name}'s result ${r.name} has no register`);
    return { name: r.name, reg };
  });

  const peak = final.peak;
  const encodable = peak <= NREG;
  if (!encodable) F.needs.add("registers");
  let words = null;
  if (encodable) {
    words = insns.map(i => encode(i));
    for (const d of deposits) words.push(encode({ op: CTRL.DEPOSIT, ra: d.reg, ctrl: true }));
    words.push(encode({ op: CTRL.HALT, ctrl: true }));
  }

  if (F.needs.has("imul") && !isaExt)
    throw new Error(`cft-lower: ${F.name} needs IMUL - re-run with --isa-ext`);

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
    schedules: tried,
    schedulePicked: picked,
    needs: [...F.needs].sort(),
    gaps: Object.fromEntries([...F.gaps].sort()),
    folds: F.folds,
    counts: {
      alu: insns.length,
      control: deposits.length + 1,
      total: insns.length + deposits.length + 1,
      consts: bank.length,
      fixedConsts: tailBase,
    },
  };
}
