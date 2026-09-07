// The det library's shipped text, executed. Float32 semantics, real
// branches, one rounding per operation.
//
// THIS IS THE ORACLE THE SEQUENCER TARGET IS SCORED AGAINST, so it is
// worth being exact about what it claims. It claims to compute what a
// conforming GL 4.3 driver computes for `build/detlib.glsl` - the file
// tools/gen-detlib.mjs proves byte-identical to the darkroom's deployed
// library - under the pinned discipline: every float operation single-
// rounded to binary32, every constant a bit pattern, every selection
// exact. It does NOT claim to be a GPU. What makes it usable as an
// oracle is that the discipline leaves a conforming implementation no
// freedom: there is no fma left in the text (gen-detlib unfuses all 56
// of them), no division, no builtin with spec latitude, and every
// intermediate is bound to a `precise` local. Under those conditions
// "what the driver computes" is a function of the text alone.
//
// WHY float64 ARITHMETIC PLUS Math.fround IS CORRECTLY ROUNDED. For
// binary32 operands a, b: a*b is exact in binary64 (24+24 = 48 <= 53
// significand bits) and cannot overflow (3.4e38^2 = 1.2e77), so
// fround(a*b) rounds once. For a+b, Figueroa's double-rounding theorem
// applies - an intermediate precision p' >= 2p+2 makes round-to-p of
// round-to-p' correctly rounded, and 53 >= 2*24+2 = 50 - so fround(a+b)
// is the binary32 sum. Subnormal results are handled by fround itself,
// which is a Float32Array store. THE LIBRARY SHIPS WITH NO fma, which
// is what makes this argument sufficient: a fused multiply-add would
// need the exact a*b+c and 53 bits do not always hold it.
//
// Negation and abs go through the bit pattern rather than through JS
// arithmetic, because JavaScript exposes one NaN and the sign of a NaN
// is a real bit the library moves around.

import { parse, typecheck, CASTS, BUILTIN_TYPES } from "./glsl-sub.mjs";

const _b = new DataView(new ArrayBuffer(4));
export const bits = (x) => { _b.setFloat32(0, x, true); return _b.getUint32(0, true); };
export const asF32 = (u) => { _b.setUint32(0, u >>> 0, true); return _b.getFloat32(0, true); };
const fr = Math.fround;
const negf = (x) => asF32(bits(x) ^ 0x80000000);
const absf = (x) => asF32(bits(x) & 0x7fffffff);

/** GLSL 8.1: min(x,y) is "y < x ? y : x", max(x,y) is "x < y ? y : x".
 *  Written in that form on purpose. The spec's phrasing is what decides
 *  min(+0,-0) and min(NaN,y), and the tile's MIN opcode is 754
 *  `minimum`, which decides both differently. docs/CFT-DETLIB.md
 *  records where the two can part company and the sweep measures
 *  whether the library ever gets there. */
const glmin = (x, y) => (y < x ? y : x);
const glmax = (x, y) => (x < y ? y : x);

class Ret { constructor(v) { this.v = v; } }

export class DetLib {
  constructor(src) {
    this.fns = parse(src);
    this.byName = typecheck(this.fns);
  }

  names() { return [...this.byName.keys()]; }

  /** Call a det function. `args` are plain JS values of the parameter
   *  types (float32 for float, uint32 for uint). Returns
   *  { value, outs: {name: value} }. */
  call(name, args) {
    const f = this.byName.get(name);
    if (!f) throw new Error(`glsl-f32: no function ${name}`);
    const env = new Map();
    const ins = f.params.filter(p => !p.out);
    if (args.length !== ins.length)
      throw new Error(`glsl-f32: ${name} takes ${ins.length} argument(s)`);
    let ai = 0;
    for (const p of f.params) env.set(p.name, p.out ? 0 : args[ai++]);
    const r = this.stmt(f.body, env);
    const outs = {};
    for (const p of f.params) if (p.out) outs[p.name] = env.get(p.name);
    return { value: r instanceof Ret ? r.v : undefined, outs };
  }

  // ---- statements. A Ret propagates; anything else falls through.
  stmt(s, env) {
    switch (s.n) {
      case "block": {
        for (const x of s.body) { const r = this.stmt(x, env); if (r instanceof Ret) return r; }
        return null;
      }
      case "decl":
        for (const d of s.decls) env.set(d.name, d.init ? this.eval(d.init, env) : 0);
        return null;
      case "assign": env.set(s.name, this.eval(s.value, env)); return null;
      case "if":
        if (this.eval(s.c, env)) return this.stmt(s.then, env);
        return s.els ? this.stmt(s.els, env) : null;
      case "return": return new Ret(s.value ? this.eval(s.value, env) : undefined);
      case "expr": this.eval(s.value, env); return null;
      default: throw new Error(`glsl-f32: statement ${s.n}`);
    }
  }

  // ---- expressions
  eval(e, env) {
    switch (e.n) {
      case "lit": return e.value;
      case "var": return env.get(e.name);
      case "un": {
        const a = this.eval(e.a, env);
        if (e.op === "!") return !a;
        if (e.op === "+") return a;
        if (e.op === "~") return e.type === "uint" ? (~a) >>> 0 : ~a | 0;
        return e.type === "float" ? negf(a) : (e.type === "uint" ? (-a) >>> 0 : -a | 0);
      }
      case "sel": return this.eval(e.c, env) ? this.eval(e.a, env) : this.eval(e.b, env);
      case "bin": return this.binop(e, env);
      case "call": return this.callExpr(e, env);
      default: throw new Error(`glsl-f32: expression ${e.n}`);
    }
  }

  binop(e, env) {
    const op = e.op;
    if (op === "&&") return this.eval(e.l, env) && this.eval(e.r, env);
    if (op === "||") return this.eval(e.l, env) || this.eval(e.r, env);
    const a = this.eval(e.l, env), b = this.eval(e.r, env);
    switch (op) {
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      case ">=": return a >= b;
      case "==": return e.operandType === "float" ? a === b : (a | 0) === (b | 0) || a === b;
      case "!=": return !(e.operandType === "float" ? a === b : a === b);
    }
    const t = e.type;
    if (t === "float") {
      switch (op) {
        case "+": return fr(a + b);
        case "-": return fr(a - b);
        case "*": return fr(a * b);
        case "/": return fr(a / b);
      }
      throw new Error(`glsl-f32: float ${op}`);
    }
    const u = t === "uint";
    const w = (v) => (u ? v >>> 0 : v | 0);
    switch (op) {
      case "+": return w(a + b);
      case "-": return w(a - b);
      case "*": return w(Math.imul(a, b));
      case "&": return w(a & b);
      case "|": return w(a | b);
      case "^": return w(a ^ b);
      case "<<": return w(a << (b & 31));
      case ">>": return u ? a >>> (b & 31) : a >> (b & 31);
    }
    throw new Error(`glsl-f32: ${t} ${op}`);
  }

  callExpr(e, env) {
    const name = e.name;
    if (CASTS.has(name)) {
      const v = this.eval(e.args[0], env);
      const from = e.args[0].type;
      if (name === "float") return from === "float" ? v : fr(v);
      if (name === "int") return from === "float" ? Math.trunc(v) | 0 : v | 0;
      if (name === "uint") return from === "float" ? Math.trunc(v) >>> 0 : v >>> 0;
      if (name === "bool") return !!v;
    }
    if (BUILTIN_TYPES[name]) {
      const a = e.args.map(x => this.eval(x, env));
      switch (name) {
        case "uintBitsToFloat": return asF32(a[0]);
        case "floatBitsToUint": return bits(a[0]) >>> 0;
        case "findMSB": return a[0] === 0 ? -1 : 31 - Math.clz32(a[0]);
        case "isnan": return Number.isNaN(a[0]);
        case "isinf": return a[0] === Infinity || a[0] === -Infinity;
        case "abs": return absf(a[0]);
        case "floor": return fr(Math.floor(a[0]));
        case "min": return glmin(a[0], a[1]);
        case "max": return glmax(a[0], a[1]);
        case "clamp": return glmin(glmax(a[0], a[1]), a[2]);
        // Only reachable from the fused source, which is not what
        // ships. Two roundings would be wrong and one needs the exact
        // a*b+c, which 53 bits do not always hold - so this refuses
        // rather than approximating an oracle.
        case "fma": throw new Error(
          "glsl-f32: the reference evaluates the SHIPPED library, which has " +
          "no fma; see core/detlib-text.mjs");
      }
    }
    const f = this.byName.get(name);
    if (!f) throw new Error(`glsl-f32: no function ${name}`);
    const inner = new Map();
    e.args.forEach((arg, i) => {
      const p = f.params[i];
      inner.set(p.name, p.out ? 0 : this.eval(arg, env));
    });
    const r = this.stmt(f.body, inner);
    // OUT PARAMETERS ARE WRITTEN BACK BY NAME. Every out argument in
    // the library is a bare variable, which is the only form GLSL
    // allows here anyway, so a name is all the callee needs.
    e.args.forEach((arg, i) => {
      const p = f.params[i];
      if (!p.out) return;
      if (arg.n !== "var") throw new Error(`glsl-f32: ${name}'s out argument is not a variable`);
      env.set(arg.name, inner.get(p.name));
    });
    return r instanceof Ret ? r.v : undefined;
  }
}
