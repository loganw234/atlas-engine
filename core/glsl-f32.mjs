// The det library's shipped text, and the emitted plates', executed.
// Float32 semantics, real branches, one rounding per operation.
//
// THIS IS THE ORACLE THE SEQUENCER TARGET IS SCORED AGAINST, so it is
// worth being exact about what it claims. It claims to compute what a
// conforming GL 4.3 driver computes for `build/detlib.glsl` - the file
// tools/gen-detlib.mjs proves byte-identical to the darkroom's deployed
// library - and for the pinned plate text core/emit.mjs writes above
// it, under the pinned discipline: every float operation single-
// rounded to binary32, every constant a bit pattern, every selection
// exact. It does NOT claim to be a GPU. What makes it usable as an
// oracle is that the discipline leaves a conforming implementation no
// freedom: there is no fma left in the text (gen-detlib unfuses all 56
// of them, and the bake unfuses the prelude and the plate the same
// way), no float division, no builtin with spec latitude, and every
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
//
// Vectors are JavaScript arrays of components and every vector
// operation is the scalar one applied componentwise, which is what
// GLSL specifies for `+ - * /` between a vector and a scalar or two
// vectors of one type (5.9). Globals - PI, TAU, and the clock uT - live
// beside the functions; a const global is its literal, a bare one is
// set by the caller before a call, as the camera sets uT before it
// calls the shape function.

import { parse, typecheck, CASTS, BUILTIN_TYPES, VEC, isArray, arrayLen } from "./glsl-sub.mjs";

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
 *  whether the library ever gets there. The same comparisons serve the
 *  integer forms. */
const glmin = (x, y) => (y < x ? y : x);
const glmax = (x, y) => (x < y ? y : x);

class Ret { constructor(v) { this.v = v; } }
class Brk { }

export class DetLib {
  constructor(src) {
    this.nodes = parse(src);
    this.fns = this.nodes.filter(n => n.n === "fn");
    this.byName = typecheck(this.nodes);
    // const globals evaluate once; the rest wait for setGlobal
    this.globalDecls = new Map(this.nodes.filter(n => n.n === "global").map(g => [g.name, g]));
    this.globals = new Map();
    for (const g of this.globalDecls.values())
      if (g.init) this.globals.set(g.name, this.eval(g.init, new Map()));
  }

  names() { return [...this.byName.keys()]; }

  /** Bind a unit-level global that has no initialiser - the clock. */
  setGlobal(name, value) {
    if (!this.globalDecls.has(name)) throw new Error(`glsl-f32: no global ${name}`);
    this.globals.set(name, value);
  }

  /** Call a function. `args` are plain JS values of the parameter
   *  types: float32 for float, uint32 for uint, an array of components
   *  for a vector, an array for an array. Returns
   *  { value, outs: {name: value} }. */
  call(name, args) {
    const f = this.byName.get(name);
    if (!f) throw new Error(`glsl-f32: no function ${name}`);
    const env = new Map();
    const ins = f.params.filter(p => !p.out);
    if (args.length !== ins.length)
      throw new Error(`glsl-f32: ${name} takes ${ins.length} argument(s)`);
    let ai = 0;
    for (const p of f.params) env.set(p.name, p.out ? zeroOf(p.type) : args[ai++]);
    const r = this.stmt(f.body, env);
    const outs = {};
    for (const p of f.params) if (p.out) outs[p.name] = env.get(p.name);
    return { value: r instanceof Ret ? r.v : undefined, outs };
  }

  // ---- statements. A Ret or a Brk propagates; anything else falls
  // through. The environment is one flat map per call, as it was: the
  // emitter's names are unique within a shape function, so a block
  // needs no scope of its own here.
  stmt(s, env) {
    switch (s.n) {
      case "block": {
        for (const x of s.body) {
          const r = this.stmt(x, env);
          if (r instanceof Ret || r instanceof Brk) return r;
        }
        return null;
      }
      case "decl":
        for (const d of s.decls) env.set(d.name, d.init ? this.eval(d.init, env) : zeroOf(s.type));
        return null;
      case "assign": env.set(s.name, this.eval(s.value, env)); return null;
      case "if":
        if (this.eval(s.c, env)) return this.stmt(s.then, env);
        return s.els ? this.stmt(s.els, env) : null;
      case "for": {
        this.stmt(s.init, env);
        while (this.eval(s.cond, env)) {
          const r = this.stmt(s.body, env);
          if (r instanceof Ret) return r;
          if (r instanceof Brk) break;
          this.stmt(s.step, env);
        }
        return null;
      }
      case "break": return new Brk();
      case "return": return new Ret(s.value ? this.eval(s.value, env) : undefined);
      case "expr": this.eval(s.value, env); return null;
      default: throw new Error(`glsl-f32: statement ${s.n}`);
    }
  }

  // ---- expressions
  eval(e, env) {
    switch (e.n) {
      case "lit": return e.value;
      case "var": {
        if (env.has(e.name)) return env.get(e.name);
        if (this.globals.has(e.name)) return this.globals.get(e.name);
        if (this.globalDecls.has(e.name))
          throw new Error(`glsl-f32: the global ${e.name} was never set - call setGlobal first`);
        throw new Error(`glsl-f32: ${e.name} is not in scope`);
      }
      case "member": return this.eval(e.obj, env)["xyzw".indexOf(e.name)];
      case "index": return this.eval(e.obj, env)[this.eval(e.i, env)];
      case "un": {
        const a = this.eval(e.a, env);
        if (Array.isArray(a)) {
          if (e.op !== "-") throw new Error(`glsl-f32: unary ${e.op} on a vector`);
          const elem = VEC[e.type].elem;
          return a.map(x => (elem === "float" ? negf(x) : -x | 0));
        }
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
    if (Array.isArray(a) || Array.isArray(b)) {
      // componentwise, a scalar broadcast against the vector
      const elem = VEC[e.type].elem;
      const n = (Array.isArray(a) ? a : b).length;
      const out = [];
      for (let i = 0; i < n; i++)
        out.push(scalarBin(op, Array.isArray(a) ? a[i] : a, Array.isArray(b) ? b[i] : b,
                           elem, elem));
      return out;
    }
    return scalarBin(op, a, b, e.type, e.operandType);
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
    if (VEC[name]) {
      // a constructor: components in order, a lone scalar broadcast
      const parts = [];
      for (const x of e.args) { const v = this.eval(x, env); if (Array.isArray(v)) parts.push(...v); else parts.push(v); }
      const want = VEC[name].n;
      if (parts.length === 1) while (parts.length < want) parts.push(parts[0]);
      if (parts.length !== want)
        throw new Error(`glsl-f32: ${name}(...) given ${parts.length} components`);
      return parts;
    }
    if (BUILTIN_TYPES[name]) {
      const a = e.args.map(x => this.eval(x, env));
      const t0 = e.args[0].type;
      switch (name) {
        case "uintBitsToFloat": return asF32(a[0]);
        case "floatBitsToUint": return bits(a[0]) >>> 0;
        case "intBitsToFloat": return asF32(a[0] >>> 0);
        case "floatBitsToInt": return bits(a[0]) | 0;
        case "findMSB": return a[0] === 0 ? -1 : 31 - Math.clz32(a[0]);
        case "isnan": return Number.isNaN(a[0]);
        case "isinf": return a[0] === Infinity || a[0] === -Infinity;
        case "abs": return t0 === "float" ? absf(a[0]) : (t0 === "uint" ? a[0] : Math.abs(a[0]) | 0);
        // GLSL 8.3: 1.0 if x > 0, 0.0 if x == 0, -1.0 if x < 0. A NaN
        // is none of the three; the spec says nothing and this returns
        // 0, which is what the lowering's two comparisons return too.
        case "sign": return t0 === "float" ? (a[0] > 0 ? 1 : a[0] < 0 ? -1 : 0)
                                            : (a[0] > 0 ? 1 : a[0] < 0 ? -1 : 0) | 0;
        case "floor": return fr(Math.floor(a[0]));
        // GLSL 8.3: 0.0 if x < edge, else 1.0
        case "step": return a[1] < a[0] ? 0 : 1;
        case "min": return glmin(a[0], a[1]);
        case "max": return glmax(a[0], a[1]);
        case "clamp": return glmin(glmax(a[0], a[1]), a[2]);
        // Only reachable from the fused source, which is not what
        // ships. Two roundings would be wrong and one needs the exact
        // a*b+c, which 53 bits do not always hold - so this refuses
        // rather than approximating an oracle.
        case "fma": throw new Error(
          "glsl-f32: the reference evaluates the SHIPPED text, which has " +
          "no fma; see core/detlib-text.mjs");
      }
    }
    const f = this.byName.get(name);
    if (!f) throw new Error(`glsl-f32: no function ${name}`);
    const inner = new Map();
    e.args.forEach((arg, i) => {
      const p = f.params[i];
      inner.set(p.name, p.out ? zeroOf(p.type) : this.eval(arg, env));
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

/** One scalar binary operation, typed. `t` is the result type, `ot` the
 *  operand type of a comparison. */
function scalarBin(op, a, b, t, ot) {
  switch (op) {
    case "<": return a < b;
    case ">": return a > b;
    case "<=": return a <= b;
    case ">=": return a >= b;
    case "==": return ot === "float" ? a === b : (a | 0) === (b | 0) || a === b;
    case "!=": return !(ot === "float" ? a === b : a === b);
  }
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
    // GLSL 5.9: integer division truncates toward zero; `%` is defined
    // only for non-negative operands, where it is the remainder of that
    // division, which is JavaScript's `%` exactly.
    case "/": return w(Math.trunc(a / b));
    case "%": return w(a % b);
    case "&": return w(a & b);
    case "|": return w(a | b);
    case "^": return w(a ^ b);
    case "<<": return w(a << (b & 31));
    case ">>": return u ? a >>> (b & 31) : a >> (b & 31);
  }
  throw new Error(`glsl-f32: ${t} ${op}`);
}

/** The value an uninitialised declaration or an out parameter starts
 *  with: zero, in the shape of its type. */
export function zeroOf(type) {
  if (VEC[type]) return new Array(VEC[type].n).fill(0);
  if (isArray(type)) return new Array(arrayLen(type)).fill(0);
  if (type === "bool") return false;
  return 0;
}
