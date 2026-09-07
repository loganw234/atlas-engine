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

import { OP, RND, CTRL, READS, ROUNDS, encode, NREG, KREG } from "./cft-isa.mjs";
import { CASTS, BUILTIN_TYPES } from "./glsl-sub.mjs";

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
  emit(op, args, { rnd = RND.RNE, type = "float", tag = "" } = {}) {
    const reads = READS[op];
    if (!reads) throw new Error(`cft-lower: opcode ${op} has no operand map`);
    const slot = { a: undefined, b: undefined, c: undefined };
    reads.forEach((w, i) => { slot[w] = args[i]; });
    const same = identityOf(op, slot.a, slot.b);
    if (same) { this.folds.identity++; return { ...same, type }; }
    if (op === OP.IMUL) this.needs.add("imul");
    const key = [op, ROUNDS.has(op) ? rnd : 0,
                 ...["a", "b", "c"].map(w => {
                   const v = slot[w];
                   return v === undefined ? "-" : v.c !== undefined ? `c${v.c}` : `r${v.r}`;
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
  const gmin = (x, y) => (minmaxOpcode
    ? E(OP.MIN, [x, y], { tag: "min" })
    : E(OP.SELECT, [y, x, E(OP.CMPLT, [y, x], { type: "bool", tag: "min" })], { tag: "min" }));
  const gmax = (x, y) => (minmaxOpcode
    ? E(OP.MAX, [x, y], { tag: "max" })
    : E(OP.SELECT, [y, x, E(OP.CMPLT, [x, y], { type: "bool", tag: "max" })], { tag: "max" }));

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
        return K(e.type === "float" ? f32bits(e.value) : e.value >>> 0, e.type);
      case "var": {
        const v = env.get(e.name);
        if (!v) throw new Error(`cft-lower: ${e.name} is not in scope`);
        return v;
      }
      case "sel": {
        const c = lowerExpr(e.c, env);
        const a = lowerExpr(e.a, env), b = lowerExpr(e.b, env);
        return E(OP.SELECT, [a, b, c], { type: e.type, tag: "?:" });
      }
      case "un": return lowerUn(e, env);
      case "bin": return lowerBin(e, env);
      case "call": return lowerCall(e, env);
      default: throw new Error(`cft-lower: expression ${e.n}`);
    }
  }

  function lowerUn(e, env) {
    const a = lowerExpr(e.a, env);
    if (e.op === "+") return a;
    if (e.op === "!") return notb(a);
    if (e.op === "~") {
      if (isC(a)) { F.folds.int++; return K(~a.c >>> 0, e.type); }
      return E(OP.IXOR, [a, K(0xffffffff, "uint")], { type: e.type, tag: "~" });
    }
    // unary minus
    if (e.type === "float") {
      if (isC(a)) { F.folds.int++; return K((a.c ^ K_SIGN) >>> 0, "float"); }
      return E(OP.NEG, [a], { type: "float", tag: "-" });
    }
    if (isC(a)) { F.folds.int++; return K((-a.c) >>> 0, e.type); }
    return E(OP.ISUB, [K(0, e.type), a], { type: e.type, tag: "-" });
  }

  function lowerBin(e, env) {
    const op = e.op;
    if (op === "&&") return andb(lowerExpr(e.l, env), lowerExpr(e.r, env));
    if (op === "||") return orb(lowerExpr(e.l, env), lowerExpr(e.r, env));
    const a = lowerExpr(e.l, env), b = lowerExpr(e.r, env);

    // comparisons
    if (["<", ">", "<=", ">=", "==", "!="].includes(op)) {
      const t = e.operandType;
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
    if (e.type !== "float") {
      const u = e.type === "uint";
      const w = (v) => (u ? v >>> 0 : v | 0) >>> 0;
      if (isC(a) && isC(b)) {
        F.folds.int++;
        const x = u ? a.c >>> 0 : a.c | 0, y = u ? b.c >>> 0 : b.c | 0;
        switch (op) {
          case "+": return K(w(x + y), e.type);
          case "-": return K(w(x - y), e.type);
          case "&": return K(w(x & y), e.type);
          case "|": return K(w(x | y), e.type);
          case "^": return K(w(x ^ y), e.type);
          case "<<": return K(w(x << (y & 31)), e.type);
          case ">>": return K(u ? x >>> (y & 31) : (x >> (y & 31)) >>> 0, e.type);
          case "*": return K(w(Math.imul(x, y)), e.type);
        }
      }
      const map = { "+": OP.IADD, "-": OP.ISUB, "&": OP.IAND, "|": OP.IOR,
                    "^": OP.IXOR, "<<": OP.ISHL, ">>": OP.ISHR, "*": OP.IMUL };
      const o = map[op];
      if (o === undefined) throw new Error(`cft-lower: integer ${op}`);
      if (o === OP.IMUL && !isaExt)
        throw new Error(`cft-lower: ${name} needs IMUL (opcode 30), which is ` +
                        `an ISA extension - re-run with --isa-ext`);
      return E(o, [a, b], { type: e.type, tag: op });
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
      // int <-> uint is a reinterpretation, and so is nothing at all
      return { ...a, type: n };
    }
    if (BUILTIN_TYPES[n]) {
      const a = e.args.map(x => lowerExpr(x, env));
      switch (n) {
        // uintBitsToFloat / floatBitsToUint are free: the same register
        case "uintBitsToFloat": return { ...a[0], type: "float" };
        case "floatBitsToUint": return { ...a[0], type: "uint" };
        case "findMSB": return findMSB(a[0]);
        case "abs": return E(OP.ABS, [a[0]], { tag: "abs" });
        case "floor": return floorf(a[0]);
        case "min": return gmin(a[0], a[1]);
        case "max": return gmax(a[0], a[1]);
        case "clamp": {
          F.gap("clamp");
          return gmin(gmax(a[0], a[1]), a[2]);       // GLSL 8.3's own definition
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
    const inner = new Map();
    e.args.forEach((arg, i) => {
      const p = f.params[i];
      inner.set(p.name, p.out ? K(K_ZERO, p.type) : lowerExpr(arg, env));
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
        value = E(OP.SELECT, [rets[i].value, value, c], { type: "float", tag: "return" });
      for (const nm of outNames)
        outs[nm] = E(OP.SELECT, [rets[i].outs[nm], outs[nm], c], { tag: "out" });
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
          env.set(d.name, d.init ? lowerExpr(d.init, env) : K(K_ZERO, s.type));
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
          if (vT === vE || (vT && vE && vT.r === vE.r && vT.c === vE.c)) { env.set(k, vT); continue; }
          env.set(k, E(OP.SELECT, [vT, vE, c], { type: (vT ?? vE).type, tag: "phi" }));
        }
        return false;
      }
      default: throw new Error(`cft-lower: statement ${s.n}`);
    }
  }

  // ---- run it
  const env = new Map();
  const args = [];
  let ri = 0;
  for (const p of decl.params) {
    if (p.out) { env.set(p.name, K(K_ZERO, p.type)); continue; }
    const v = { r: -1 - ri, type: p.type, arg: ri };     // negative ids are inputs
    env.set(p.name, v);
    args.push({ name: p.name, type: p.type, stream: "abc"[ri], reg: ri });
    ri++;
  }
  if (ri > 3)
    throw new Error(`cft-lower: ${name} takes ${ri} inputs; cft_program_run ` +
                    `loads three streams (docs/ATLAS.md item 3)`);
  const out = lowerBody(decl, env);

  // DEPOSIT reads a REGISTER, never the constant bank - the loader
  // refuses a stray ka on a control instruction (docs/SEQUENCER.md,
  // "any field an instruction does not read being non-zero"). So a
  // result that came out as a constant or as an untouched input is
  // copied into one first, by an integer OR with zero, which moves the
  // bits and rounds nothing.
  const materialise = (v) =>
    (v.c !== undefined || v.r < 0)
      ? E(OP.IOR, [v, K(0, "uint")], { type: v.type, tag: "materialise" })
      : v;

  const results = [];
  if (out.value !== undefined) results.push({ name: "return", value: materialise(out.value) });
  for (const p of decl.params) if (p.out)
    results.push({ name: p.name, value: materialise(out.outs[p.name]) });
  if (!results.length) throw new Error(`cft-lower: ${name} produces nothing`);

  return schedule(F, args, results,
                  { isaExt, fuse, minmaxOpcode, doSchedule: opts.schedule !== false });
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
  while (order.length < N) {
    let best = -1, bestKey = null;
    for (const i of ready) {
      let kills = 0;
      for (const p of preds[i]) if (remaining[p] === 1) kills++;
      const seen = new Set();
      for (const w of ["a", "b", "c"]) {
        const v = ops[i][w];
        if (v && v.arg !== undefined && !seen.has(v.arg)) {
          seen.add(v.arg);
          if (argRemaining[v.arg] === 1) kills++;
        }
      }
      const k = policy.key({ kills, height: height[i], fanout: remaining[i], i });
      if (best < 0 || lessKey(k, bestKey)) { best = i; bestKey = k; }
    }
    if (best < 0) throw new Error("cft-lower: the schedule stalled");
    ready.delete(best);
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
function allocate(ops, args, resultIdSet) {
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
  for (let r = 8 * NREG - 1; r >= args.length; r--) free.push(r);
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

function schedule(F, args, results, { isaExt, fuse, minmaxOpcode, doSchedule = true }) {
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
      else if (v.r < 0) m[w] = { arg: -1 - v.r };
      else m[w] = { v: newId0.get(v.r) };
    }
    return m;
  });

  const resultOpIds = new Set();
  const resultArgIds = new Set();
  for (const r of results) {
    if (r.value.c !== undefined) throw new Error("cft-lower: a constant result");
    if (r.value.r < 0) resultArgIds.add(-1 - r.value.r);
    else resultOpIds.add(newId0.get(r.value.r));
  }

  // pick the schedule with the lowest register peak, deterministically
  const tried = [];
  let best = null;
  for (const policy of (doSchedule ? POLICIES : [POLICIES[POLICIES.length - 1]])) {
    const order = listSchedule(ops, args, [...resultOpIds], policy);
    const pos = new Map(order.map((old, i) => [old, i]));
    const reordered = order.map(old => {
      const o = { ...ops[old] };
      for (const w of ["a", "b", "c"]) if (o[w] && o[w].v !== undefined) o[w] = { v: pos.get(o[w].v) };
      return o;
    });
    const rIds = { ops: new Set([...resultOpIds].map(i => pos.get(i))), args: resultArgIds };
    const got = allocate(reordered, args, rIds);
    tried.push({ policy: policy.name, peak: got.peak });
    if (!best || got.peak < best.got.peak) best = { policy, pos, reordered, rIds, got };
  }

  const { reordered, pos, rIds } = best;

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
  // allocate again over the remapped constants so the encoded operands
  // carry the new indices
  const final = allocate(reordered, args, rIds);

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
    regsUsed: peak,
    schedules: tried,
    schedulePicked: best.policy.name,
    needs: [...F.needs].sort(),
    gaps: Object.fromEntries([...F.gaps].sort()),
    folds: F.folds,
    counts: {
      alu: insns.length,
      control: deposits.length + 1,
      total: insns.length + deposits.length + 1,
      consts: bank.length,
    },
  };
}
