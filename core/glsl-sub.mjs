// The GLSL subset the det library and the emitted plates are written
// in, parsed.
//
// WHY A PARSER AND NOT A TRANSCRIPTION. The sequencer target has to say
// what each det_* function IS, twice: once as a reference that computes
// the shipped bits, and once as an instruction sequence. Typing the
// bodies out by hand for either would put a second copy of the library
// in the tree, and the second copy is the one that drifts. So both read
// the SAME text - the text tools/gen-detlib.mjs already proves byte-
// identical to the darkroom's deployed detlib.glsl - and a mismatch
// between them is a fact about the two execution models rather than
// about somebody's typing.
//
// The subset was small because the library is small. Measured on the
// generated file (242 non-comment lines): no loops, no vectors, no
// structs, no division, no modulus, three scalar types (float, int,
// uint), `precise` and `out` as the only qualifiers, and thirteen
// builtins - uintBitsToFloat, floatBitsToUint, int, uint, float, abs,
// min, max, clamp, floor, findMSB, isinf, isnan.
//
// SINCE 2026-09-08 IT ALSO READS THE EMITTED PLATES, which is the same
// text one level up: core/emit-cft.mjs lowers a positive's shape
// function from the GLSL core/emit.mjs writes, so the plate text needs
// what the library text did not. Measured over the sixty-nine pinned
// plates before adding anything: vec2 and vec3 locals and constructors
// (no swizzles, no vec4 outside the signature), `.x` `.y` `.z` members,
// one indexed array (`float P[8]`), `for` with a literal bound and
// `break`, `bool` locals with `true`/`false`, the casts `int(...)`
// `float(...)` `uint(...)`, integer `%` and `/` in five plates, and six
// more builtins - step, sign, intBitsToFloat, and min/max/abs on ints.
// Each is a construct the emitter writes and the darkroom bakes, so each
// is something a second backend has to reproduce, not a convenience.
//
// Precedence is C's, which is also GLSL's and also JavaScript's for
// every operator that appears here. It is written out as a table rather
// than left to a hand-rolled climb so that a reader can check it
// against the spec in one glance.

// ------------------------------------------------------------ lexing

// SINCE 2026-09-18 IT ALSO READS THE DARKROOM'S CAMERA - the
// deterministic compute kernel's own text, which core/cft-camera.mjs
// lowers so a photograph's samples can be computed on the tile. The
// camera is written against the whole of GLSL rather than an emitter's
// output, and brings what the plates never needed: mat2/mat3/mat4 (the
// view and the projection), uvec and bvec, swizzles read and written
// (`vpos.xy +=`, `cp.xy`), `precise` on parameters, `++i`, vector `==`
// and `!=` (one bool, GLSL 5.9), any/all and the relational builtins,
// componentwise abs/floor/min/max/clamp on vectors, a uniform array
// (`uniform float uP[8]`), and OVERLOADS - the bake gives every det_*
// function a vector form under the same name, which a lookup by name
// alone cannot tell apart. A call is resolved by its argument types and
// the node carries the definition it resolved to (`e.fn`). A unit with
// one definition per name resolves exactly as it always did.
const KEYWORDS = new Set(["void", "float", "int", "uint", "bool",
                          "vec2", "vec3", "vec4", "ivec2", "ivec3", "ivec4",
                          "uvec2", "uvec3", "uvec4", "bvec2", "bvec3", "bvec4",
                          "mat2", "mat3", "mat4",
                          "precise", "out", "in", "inout", "const", "uniform",
                          "if", "else", "return", "for", "break",
                          "true", "false"]);
const TYPES = new Set(["void", "float", "int", "uint", "bool",
                       "vec2", "vec3", "vec4", "ivec2", "ivec3", "ivec4",
                       "uvec2", "uvec3", "uvec4", "bvec2", "bvec3", "bvec4",
                       "mat2", "mat3", "mat4"]);

/** The vector types: how many components, and of what. Vectors are
 *  SCALARISED by every consumer - the interpreter holds them as arrays,
 *  the lowering as arrays of scalar values - because the ISA has no
 *  vector register and the emitted text uses no operation that could
 *  not be written componentwise. */
export const VEC = {
  vec2: { n: 2, elem: "float" },
  vec3: { n: 3, elem: "float" },
  vec4: { n: 4, elem: "float" },
  ivec2: { n: 2, elem: "int" },
  ivec3: { n: 3, elem: "int" },
  ivec4: { n: 4, elem: "int" },
  uvec2: { n: 2, elem: "uint" },
  uvec3: { n: 3, elem: "uint" },
  uvec4: { n: 4, elem: "uint" },
  bvec2: { n: 2, elem: "bool" },
  bvec3: { n: 3, elem: "bool" },
  bvec4: { n: 4, elem: "bool" },
};
export const isVec = (t) => VEC[t] !== undefined;
/** The vector type of `n` components of `elem`. */
export const vecOf = (elem, n) =>
  ({ float: "vec", int: "ivec", uint: "uvec", bool: "bvec" })[elem] + n;
/** The matrix types: columns, each a vector. `M[i]` is column i, as GLSL
 *  has it (5.6), and the camera only ever reads `M[i].x` and the like. */
export const MAT = {
  mat2: { n: 2, col: "vec2" },
  mat3: { n: 3, col: "vec3" },
  mat4: { n: 4, col: "vec4" },
};
export const isMat = (t) => MAT[t] !== undefined;
/** A member name's components, when it is a swizzle of one letter set. */
export function swizzleOf(name, n) {
  for (const set of ["xyzw", "rgba", "stpq"]) {
    const idx = [...name].map(ch => set.indexOf(ch));
    if (idx.every(i => i >= 0 && i < n)) return idx;
  }
  return null;
}
export const isArray = (t) => typeof t === "string" && t.endsWith("]");
export const arrayElem = (t) => t.slice(0, t.indexOf("["));
export const arrayLen = (t) => Number(t.slice(t.indexOf("[") + 1, -1));

// Sorted longest first, so `<<=` never lexes as `<<` `=` and `<<` never
// lexes as `<` `<`. The compound assignments are here because the
// registry's shared header writes hashu with them, and that function is
// the one the atlas port needs an IMUL for. `++` and `--` are the for
// loop's step, and `.` is a member.
const PUNCT = ["<<=", ">>=", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||",
               "+=", "-=", "*=", "/=", "%=", "&=", "^=", "|=", "++", "--",
               "(", ")", "{", "}", "[", "]", ",", ";", "?", ":", ".",
               "+", "-", "*", "/", "%", "&", "^", "|", "~", "!", "<", ">", "="]
  .sort((a, b) => b.length - a.length);
const COMPOUND = { "+=": "+", "-=": "-", "*=": "*", "/=": "/", "%=": "%",
                   "&=": "&", "^=": "^", "|=": "|", "<<=": "<<", ">>=": ">>" };

export function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

export function lex(src) {
  const s = strip(src);
  const out = [];
  let i = 0, line = 1;
  const num = /^(?:0[xX][0-9a-fA-F]+[uU]?|(?:[0-9]+\.[0-9]*|\.[0-9]+|[0-9]+)(?:[eE][-+]?[0-9]+)?[fFuU]?)/;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\n") { line++; i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      const t = s.slice(i, j);
      out.push({ k: KEYWORDS.has(t) ? "kw" : "id", v: t, line });
      i = j; continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s[i + 1] || ""))) {
      const m = num.exec(s.slice(i));
      if (!m) throw new Error(`glsl-sub: bad number at line ${line}`);
      out.push({ k: "num", v: m[0], line });
      i += m[0].length; continue;
    }
    const p = PUNCT.find(p => s.startsWith(p, i));
    if (!p) throw new Error(`glsl-sub: unexpected ${JSON.stringify(ch)} at line ${line}`);
    out.push({ k: "op", v: p, line });
    i += p.length;
  }
  out.push({ k: "eof", v: "", line });
  return out;
}

/** A numeric literal's value and type, decided by its spelling exactly
 *  as GLSL decides it: a `u` suffix or a bare integer is an integer, a
 *  decimal point or an exponent makes it a float. The float value is
 *  rounded to float32 HERE, because that is what a driver's front end
 *  does with `1.5` and what the pinned discipline assumes it does. */
export function literal(text) {
  const t = text;
  if (/^0[xX]/.test(t)) {
    const u = /[uU]$/.test(t);
    const v = Number.parseInt(t.replace(/[uU]$/, ""), 16);
    return { type: u ? "uint" : "int", value: u ? v >>> 0 : v | 0 };
  }
  if (/[uU]$/.test(t))
    return { type: "uint", value: Number.parseInt(t.slice(0, -1), 10) >>> 0 };
  if (/[.eE]/.test(t))
    return { type: "float", value: Math.fround(Number(t.replace(/[fF]$/, ""))) };
  return { type: "int", value: Number.parseInt(t, 10) | 0 };
}

// ----------------------------------------------------------- parsing
//
// Binary precedence, loosest first. Identical to GLSL 4.30 section 5.1
// and to C. `&&` and `||` do not appear in the det library's shipped
// text except in det_div's one guard, and they are here with their
// short-circuit meaning noted at evaluation.
const BINARY = [
  ["||"], ["&&"], ["|"], ["^"], ["&"],
  ["==", "!="], ["<", ">", "<=", ">="], ["<<", ">>"],
  ["+", "-"], ["*", "/", "%"],
];

class Parser {
  constructor(toks) { this.t = toks; this.i = 0; }
  peek(n = 0) { return this.t[this.i + n]; }
  next() { return this.t[this.i++]; }
  at(k, v) { const t = this.peek(); return t.k === k && (v === undefined || t.v === v); }
  eat(k, v) { if (this.at(k, v)) return this.next(); return null; }
  want(k, v) {
    const t = this.eat(k, v);
    if (!t) throw new Error(
      `glsl-sub: line ${this.peek().line}: wanted ${v ?? k}, saw ` +
      `${JSON.stringify(this.peek().v)}`);
    return t;
  }

  // ---- expressions
  expr() { return this.ternary(); }

  ternary() {
    const c = this.binary(0);
    if (!this.eat("op", "?")) return c;
    const a = this.expr();
    this.want("op", ":");
    const b = this.ternary();
    return { n: "sel", c, a, b };
  }

  binary(level) {
    if (level >= BINARY.length) return this.unary();
    let l = this.binary(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.k !== "op" || !BINARY[level].includes(t.v)) return l;
      // `>` and `<` never start a template here, so no lookahead needed
      this.next();
      const r = this.binary(level + 1);
      l = { n: "bin", op: t.v, l, r };
    }
  }

  unary() {
    const t = this.peek();
    if (t.k === "op" && (t.v === "-" || t.v === "+" || t.v === "!" || t.v === "~")) {
      this.next();
      return { n: "un", op: t.v, a: this.unary() };
    }
    return this.postfix();
  }

  // `.x` on a vector, `[i]` on an array. No swizzles: the emitter never
  // writes one (measured over the corpus), and a two-letter member here
  // is refused at the typecheck rather than half-understood.
  postfix() {
    let e = this.primary();
    for (;;) {
      if (this.eat("op", ".")) { e = { n: "member", obj: e, name: this.want("id").v }; continue; }
      if (this.eat("op", "[")) {
        const i = this.expr();
        this.want("op", "]");
        e = { n: "index", obj: e, i };
        continue;
      }
      return e;
    }
  }

  primary() {
    if (this.eat("op", "(")) { const e = this.expr(); this.want("op", ")"); return e; }
    const t = this.peek();
    if (t.k === "num") { this.next(); return { n: "lit", ...literal(t.v) }; }
    if (t.k === "kw" && (t.v === "true" || t.v === "false")) {
      this.next();
      return { n: "lit", type: "bool", value: t.v === "true" };
    }
    if (t.k === "id" || (t.k === "kw" && TYPES.has(t.v))) {
      this.next();
      if (this.eat("op", "(")) {
        const args = [];
        if (!this.at("op", ")")) {
          do { args.push(this.expr()); } while (this.eat("op", ","));
        }
        this.want("op", ")");
        return { n: "call", name: t.v, args };
      }
      return { n: "var", name: t.v };
    }
    throw new Error(`glsl-sub: line ${t.line}: unexpected ${JSON.stringify(t.v)}`);
  }

  // ---- statements
  block() {
    this.want("op", "{");
    const body = [];
    while (!this.at("op", "}")) body.push(this.statement());
    this.want("op", "}");
    return { n: "block", body };
  }

  /** A declaration, when the tokens ahead are one: `precise`, or a type
   *  name that is not the start of a constructor call. Returns null
   *  otherwise, having consumed nothing. */
  declaration() {
    const save = this.i;
    const precise = !!this.eat("kw", "precise");
    if (precise || (this.peek().k === "kw" && TYPES.has(this.peek().v) && this.peek(1).k === "id")) {
      const type = this.want("kw").v;
      const decls = [];
      let arrayOf = null;
      do {
        const name = this.want("id").v;
        // An ARRAY LOCAL: `precise float wts[28];`, the size a literal
        // and no initialiser, which is the only array form the emitter
        // writes (nested's weight table). GLSL puts the size after the
        // NAME, so it is read here rather than with the type, and the
        // declaration's type becomes the array's for everything after.
        let len = null;
        if (this.at("op", "[")) {
          this.next();
          const n = this.want("num");
          len = Number(n.v) | 0;
          this.want("op", "]");
          if (!(len > 0)) throw new Error(`glsl-sub: ${name}[${len}] is not a size`);
          arrayOf = len;
        }
        const init = this.eat("op", "=") ? this.expr() : null;
        if (len !== null && init) throw new Error(`glsl-sub: ${name}[${len}] takes no initialiser`);
        decls.push({ name, init, len });
      } while (this.eat("op", ","));
      return { n: "decl", type: arrayOf === null ? type : `${type}[${arrayOf}]`, precise, decls };
    }
    this.i = save;
    return null;
  }

  /** An assignment, compound assignment, `x++`/`x--`, or a bare
   *  expression - without its terminating `;`, so a for loop's step can
   *  use it too. */
  simple() {
    // `++i` and `--i`, the camera's loop step
    for (const tok of ["++", "--"]) {
      if (this.at("op", tok)) {
        this.next();
        const name = this.want("id").v;
        return { n: "assign", name,
                 value: { n: "bin", op: tok[0], l: { n: "var", name },
                          r: { n: "lit", type: "int", value: 1 } } };
      }
    }
    const e = this.expr();
    // `v.xy = ...` and `v.x += ...`: a write to some of a vector's
    // components, the rest kept
    if (e.n === "member" && e.obj.n === "var") {
      if (this.eat("op", "=")) return { n: "assignMember", name: e.obj.name, member: e.name, value: this.expr() };
      for (const [tok, op] of Object.entries(COMPOUND)) {
        if (this.at("op", tok)) {
          this.next();
          return { n: "assignMember", name: e.obj.name, member: e.name,
                   value: { n: "bin", op, l: { n: "member", obj: { n: "var", name: e.obj.name }, name: e.name },
                            r: this.expr() } };
        }
      }
    }
    if (this.eat("op", "=")) {
      // `wts[sl] = ...`: an assignment to one element of an array
      // local. The index is an expression, so where it lands is not
      // known until the run - which is what the scratch's indexed
      // store is for (docs/SEQUENCER.md R4).
      if (e.n === "index") {
        if (e.obj.n !== "var") throw new Error("glsl-sub: assignment through a nested index");
        return { n: "assignIndex", name: e.obj.name, index: e.i, value: this.expr() };
      }
      if (e.n !== "var") throw new Error("glsl-sub: assignment to a non-variable");
      return { n: "assign", name: e.name, value: this.expr() };
    }
    for (const tok of ["++", "--"]) {
      if (this.at("op", tok)) {
        this.next();
        if (e.n !== "var") throw new Error(`glsl-sub: ${tok} on a non-variable`);
        return { n: "assign", name: e.name,
                 value: { n: "bin", op: tok[0], l: { n: "var", name: e.name },
                          r: { n: "lit", type: "int", value: 1 } } };
      }
    }
    for (const [tok, op] of Object.entries(COMPOUND)) {
      if (this.at("op", tok)) {
        this.next();
        if (e.n !== "var") throw new Error("glsl-sub: compound assignment to a non-variable");
        // desugared here rather than in every consumer: `x op= v` is
        // `x = x op v` with one evaluation of x, and x is a bare name.
        return { n: "assign", name: e.name,
                 value: { n: "bin", op, l: { n: "var", name: e.name }, r: this.expr() } };
      }
    }
    return { n: "expr", value: e };
  }

  statement() {
    if (this.at("op", "{")) return this.block();
    if (this.eat("kw", "if")) {
      this.want("op", "(");
      const c = this.expr();
      this.want("op", ")");
      const then = this.statement();
      const els = this.eat("kw", "else") ? this.statement() : null;
      return { n: "if", c, then, els };
    }
    if (this.eat("kw", "return")) {
      const v = this.at("op", ";") ? null : this.expr();
      this.want("op", ";");
      return { n: "return", value: v };
    }
    if (this.eat("kw", "break")) { this.want("op", ";"); return { n: "break" }; }
    // The one loop shape the emitter writes: a counter from a literal
    // to a literal bound, stepping by one, the data-dependent exit as a
    // `break` inside. The bound being a literal is what lets the
    // sequencer target say REPEAT <n>; the emitter's own unroller relies
    // on the same fact (docs/CONVERSION.md, "the bound you print").
    if (this.eat("kw", "for")) {
      this.want("op", "(");
      const init = this.declaration() ?? this.simple();
      this.want("op", ";");
      const cond = this.expr();
      this.want("op", ";");
      const step = this.simple();
      this.want("op", ")");
      const body = this.statement();
      return { n: "for", init, cond, step, body };
    }
    const d = this.declaration();
    if (d) { this.want("op", ";"); return d; }
    const s = this.simple();
    this.want("op", ";");
    return s;
  }

  // ---- the unit
  //
  // Functions, and the unit-level declarations the shared header carries:
  // `const float PI = ...;` and `float uT;`. A const global is a literal
  // every consumer folds; a global with no initialiser is a UNIFORM in
  // all but name - the clock - and is bound by the caller.
  unit() {
    const nodes = [];
    while (!this.at("eof")) {
      let qual = null;
      if (this.eat("kw", "const")) qual = "const";
      else if (this.eat("kw", "uniform")) qual = "uniform";
      const type = this.want("kw").v;
      const name = this.want("id").v;
      if (!this.at("op", "(")) {
        // `uniform float uP[8];` - an array global, the size after the name
        let gtype = type;
        if (this.eat("op", "[")) {
          const len = Number.parseInt(this.want("num").v, 10);
          this.want("op", "]");
          gtype = `${type}[${len}]`;
        }
        const init = this.eat("op", "=") ? this.expr() : null;
        this.want("op", ";");
        nodes.push({ n: "global", type: gtype, name, init, qual: qual ?? (init ? "const" : "uniform") });
        continue;
      }
      this.want("op", "(");
      const params = [];
      if (!this.at("op", ")")) {
        do {
          // `precise`, `in` and `const` change nothing a consumer reads
          // here: every operation is single-rounded already, and an in
          // parameter is a copy. `inout` would need the argument's value
          // on the way in, which nothing reads, so it is refused.
          let out = false;
          for (;;) {
            if (this.eat("kw", "precise") || this.eat("kw", "in") || this.eat("kw", "const")) continue;
            if (this.eat("kw", "out")) { out = true; continue; }
            if (this.at("kw", "inout")) throw new Error(`glsl-sub: line ${this.peek().line}: inout is not in the subset`);
            break;
          }
          let ptype = this.want("kw").v;
          const pname = this.want("id").v;
          if (this.eat("op", "[")) {
            const len = this.want("num").v;
            this.want("op", "]");
            ptype = `${ptype}[${Number.parseInt(len, 10)}]`;
          }
          params.push({ name: pname, type: ptype, out });
        } while (this.eat("op", ","));
      }
      this.want("op", ")");
      const body = this.block();
      nodes.push({ n: "fn", name, ret: type, params, body });
    }
    return nodes;
  }
}

/** Parse a whole GLSL translation unit of the subset: functions and
 *  unit-level declarations, in source order. */
export function parse(src) {
  return new Parser(lex(src)).unit();
}

/** The functions of a unit, by name - the FIRST definition of each, which
 *  is the only one in a unit without overloads. */
export function index(nodes) {
  const m = new Map();
  for (const [name, fs] of overloadsOf(nodes)) m.set(name, fs[0]);
  return m;
}

/** Every definition of every name, in source order. Two definitions with
 *  the same parameter types are the error a lookup by name used to
 *  report for any second definition. */
export function overloadsOf(nodes) {
  const m = new Map();
  for (const f of nodes) {
    if (f.n !== "fn") continue;
    const sig = f.params.map(p => p.type).join(",");
    const have = m.get(f.name) ?? [];
    if (have.some(g => g.params.map(p => p.type).join(",") === sig))
      throw new Error(`glsl-sub: ${f.name}(${sig}) defined twice`);
    have.push(f);
    m.set(f.name, have);
  }
  return m;
}

/** The unit-level declarations of a unit, by name. */
export function globalsOf(nodes) {
  const m = new Map();
  for (const g of nodes) {
    if (g.n !== "global") continue;
    if (m.has(g.name)) throw new Error(`glsl-sub: global ${g.name} declared twice`);
    m.set(g.name, g);
  }
  return m;
}

// ------------------------------------------------------------- types
//
// Enough of a type system to tell an integer `-` from a float one and
// an integer `<` from a float one, which is the whole reason it exists:
// the ISA has two different opcodes for each. Vectors add one rule -
// an operation between a vector and its own scalar type, or between two
// vectors of the same type, is that vector type - and members and
// indices take a component's type.

// `gen` builtins take and return the same scalar type (GLSL's genType /
// genIType); the rest have one signature.
export const BUILTIN_TYPES = {
  uintBitsToFloat: { args: ["uint"], ret: "float" },
  floatBitsToUint: { args: ["float"], ret: "uint" },
  intBitsToFloat: { args: ["int"], ret: "float" },
  floatBitsToInt: { args: ["float"], ret: "int" },
  findMSB: { args: ["uint"], ret: "int" },
  isnan: { args: ["float"], ret: "bool" },
  isinf: { args: ["float"], ret: "bool" },
  abs: { gen: 1 },
  sign: { gen: 1 },
  floor: { gen: 1 },
  step: { args: ["float", "float"], ret: "float" },
  min: { gen: 2 },
  max: { gen: 2 },
  clamp: { gen: 3 },
  // the camera's: a bool vector from two vectors, and a bool from one
  lessThan: { rel: "<" }, lessThanEqual: { rel: "<=" },
  greaterThan: { rel: ">" }, greaterThanEqual: { rel: ">=" },
  equal: { rel: "==" }, notEqual: { rel: "!=" },
  any: { reduce: "||" }, all: { reduce: "&&" },
  // Present for the FUSED source only. The shipped library has no fma
  // left in it - gen-detlib rewrites all 56 - and the sequencer target
  // emits from the shipped text by default. This entry exists so the
  // verification can also compile the fused source and MEASURE how far
  // an FMA-based emission lands from the bits the cards agree on.
  fma: { args: ["float", "float", "float"], ret: "float" },
};
export const CASTS = new Set(["int", "uint", "float", "bool"]);

/** Annotate every expression node with `.type`. Declarations and
 *  parameters supply the environment; a call's type comes from the
 *  callee's return type. Returns the functions by name. */
export function typecheck(nodes) {
  const byName = index(nodes);
  const overloads = overloadsOf(nodes);
  const globals = globalsOf(nodes);
  let current = null;                  // the function being checked
  const typeOf = (e, env) => {
    switch (e.n) {
      case "lit": return e.type;
      case "var": {
        const t = env.get(e.name) ?? globals.get(e.name)?.type;
        if (!t) throw new Error(`glsl-sub: ${e.name} is not in scope`);
        return t;
      }
      case "member": {
        const ot = typeOf(e.obj, env);
        const v = VEC[ot];
        if (!v) throw new Error(`glsl-sub: .${e.name} on a ${ot}`);
        const swz = e.name.length <= 4 ? swizzleOf(e.name, v.n) : null;
        if (!swz) throw new Error(`glsl-sub: .${e.name} on a ${ot}`);
        e.swz = swz;
        return swz.length === 1 ? v.elem : vecOf(v.elem, swz.length);
      }
      case "index": {
        const ot = typeOf(e.obj, env);
        const it = typeOf(e.i, env);
        if (it !== "int" && it !== "uint") throw new Error(`glsl-sub: [${it}] - an index is an integer`);
        if (isArray(ot)) return arrayElem(ot);
        if (VEC[ot]) return VEC[ot].elem;
        if (MAT[ot]) return MAT[ot].col;
        throw new Error(`glsl-sub: [] on a ${ot}`);
      }
      case "call": {
        if (CASTS.has(e.name)) { e.args.forEach(a => typeOf(a, env)); return e.name; }
        if (VEC[e.name]) { e.args.forEach(a => typeOf(a, env)); return e.name; }
        const b = BUILTIN_TYPES[e.name];
        if (b) {
          const ts = e.args.map(a => typeOf(a, env));
          if (b.gen) {
            if (ts.length !== b.gen)
              throw new Error(`glsl-sub: ${e.name} takes ${b.gen} argument(s)`);
            // a vector with vectors of its type, or with its own scalar
            // after the first argument (GLSL 8.3's min(genType, float))
            if (ts.some((t, i) => t !== ts[0] && !(i > 0 && VEC[ts[0]] && t === VEC[ts[0]].elem)))
              throw new Error(`glsl-sub: ${e.name}(${ts.join(", ")}) mixes types`);
            return ts[0];
          }
          if (b.rel) {
            if (ts.length !== 2 || !VEC[ts[0]] || ts[1] !== ts[0])
              throw new Error(`glsl-sub: ${e.name}(${ts.join(", ")}) wants two vectors of one type`);
            return vecOf("bool", VEC[ts[0]].n);
          }
          if (b.reduce) {
            if (ts.length !== 1 || !VEC[ts[0]] || VEC[ts[0]].elem !== "bool")
              throw new Error(`glsl-sub: ${e.name}(${ts.join(", ")}) wants a bool vector`);
            return "bool";
          }
          return b.ret;
        }
        const fs = overloads.get(e.name);
        if (!fs) throw new Error(`glsl-sub: no function ${e.name}`);
        const ts = e.args.map(a => typeOf(a, env));
        // ONE DEFINITION IS TAKEN AS IT ALWAYS WAS; SEVERAL ARE CHOSEN BY
        // THE ARGUMENTS' TYPES, exactly - the kernel's calls all match one
        // definition exactly, and an implicit conversion here would be a
        // choice the driver makes by GLSL 6.1's ranking, not by this file.
        const f = fs.length === 1 ? fs[0]
          : fs.find(g => g.params.length === ts.length && g.params.every((p, i) => p.type === ts[i]));
        if (!f) throw new Error(`glsl-sub: no ${e.name}(${ts.join(", ")}) among ` +
                                fs.map(g => `(${g.params.map(p => p.type).join(", ")})`).join(" "));
        e.fn = f;
        return f.ret;
      }
      case "un":
        if (e.op === "!") { typeOf(e.a, env); return "bool"; }
        return typeOf(e.a, env);
      case "bin": {
        const lt = typeOf(e.l, env), rt = typeOf(e.r, env);
        if (["==", "!=", "<", ">", "<=", ">=", "&&", "||"].includes(e.op)) {
          // vector == and != compare whole vectors and give ONE bool
          // (GLSL 5.9); the ordering operators have no vector form
          if ((e.op === "==" || e.op === "!=") && isVec(lt) && lt === rt) {
            e.vecCmp = VEC[lt].n;
            e.operandType = VEC[lt].elem;
            return "bool";
          }
          if (isVec(lt) || isVec(rt))
            throw new Error(`glsl-sub: ${lt} ${e.op} ${rt} - no vector comparisons`);
          e.operandType = lt === "float" || rt === "float" ? "float"
                        : lt === "uint" || rt === "uint" ? "uint"
                        : lt === "bool" ? "bool" : "int";
          return "bool";
        }
        if (["<<", ">>"].includes(e.op)) return lt;
        // a vector against its own scalar, or two of the same vector
        if (isVec(lt) || isVec(rt)) {
          const vt = isVec(lt) ? lt : rt;
          const other = isVec(lt) ? rt : lt;
          if (!["+", "-", "*", "/"].includes(e.op) || (other !== vt && other !== VEC[vt].elem))
            throw new Error(`glsl-sub: ${lt} ${e.op} ${rt} is not in the subset`);
          return vt;
        }
        // GLSL forbids implicit int/float mixing in these; the library
        // never does it, and a surprise here is a parse bug worth
        // hearing about rather than coercing away.
        if (lt !== rt)
          throw new Error(`glsl-sub: ${lt} ${e.op} ${rt} - the subset has ` +
                          `no implicit conversion`);
        return lt;
      }
      case "sel": {
        typeOf(e.c, env);
        const a = typeOf(e.a, env), b = typeOf(e.b, env);
        if (a !== b) throw new Error(`glsl-sub: ternary arms are ${a} and ${b}`);
        return a;
      }
      default: throw new Error(`glsl-sub: cannot type ${e.n}`);
    }
  };
  const ann = (e, env) => { e.type = typeOf(e, env); walkArgs(e, x => ann(x, env)); return e.type; };
  const walkArgs = (e, f) => {
    if (e.n === "call") e.args.forEach(f);
    else if (e.n === "un") f(e.a);
    else if (e.n === "bin") { f(e.l); f(e.r); }
    else if (e.n === "sel") { f(e.c); f(e.a); f(e.b); }
    else if (e.n === "member") f(e.obj);
    else if (e.n === "index") { f(e.obj); f(e.i); }
    else if (e.n === "assignIndex") { f(e.index); f(e.value); }
  };

  const stmt = (s, env) => {
    switch (s.n) {
      case "block": { const e2 = new Map(env); s.body.forEach(x => stmt(x, e2)); break; }
      case "decl":
        for (const d of s.decls) { if (d.init) ann(d.init, env); env.set(d.name, s.type); }
        break;
      case "assign": if (!env.has(s.name) && !globals.has(s.name))
        throw new Error(`glsl-sub: ${s.name} not in scope`);
        if (!env.has(s.name)) current.writesGlobals = true;
        ann(s.value, env); break;
      case "assignMember": {
        const vt = env.get(s.name) ?? globals.get(s.name)?.type;
        if (vt === undefined) throw new Error(`glsl-sub: ${s.name} not in scope`);
        if (!VEC[vt]) throw new Error(`glsl-sub: ${s.name}.${s.member} = on a ${vt}`);
        const swz = s.member.length <= 4 ? swizzleOf(s.member, VEC[vt].n) : null;
        if (!swz || new Set(swz).size !== swz.length)
          throw new Error(`glsl-sub: ${s.name}.${s.member} is not a writable member of a ${vt}`);
        s.swz = swz;
        s.type = vt;
        if (!env.has(s.name)) current.writesGlobals = true;
        ann(s.value, env);
        break;
      }
      case "assignIndex": {
        const at = env.get(s.name) ?? globals.get(s.name);
        if (at === undefined) throw new Error(`glsl-sub: ${s.name} not in scope`);
        if (!isArray(at)) throw new Error(`glsl-sub: ${s.name}[...] on a ${at}`);
        ann(s.index, env); ann(s.value, env);
        break;
      }
      case "if": ann(s.c, env); stmt(s.then, env); if (s.els) stmt(s.els, env); break;
      case "for": {
        const e2 = new Map(env);
        stmt(s.init, e2); ann(s.cond, e2); stmt(s.step, e2); stmt(s.body, e2);
        break;
      }
      case "break": break;
      case "return": if (s.value) ann(s.value, env); break;
      case "expr": ann(s.value, env); break;
      default: throw new Error(`glsl-sub: cannot type statement ${s.n}`);
    }
  };
  for (const g of globals.values()) if (g.init) ann(g.init, new Map());
  for (const f of nodes) {
    if (f.n !== "fn") continue;
    const env = new Map();
    for (const p of f.params) env.set(p.name, p.type);
    current = f;
    stmt(f.body, env);
  }
  return byName;
}
