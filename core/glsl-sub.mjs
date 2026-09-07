// The GLSL subset the det library is written in, parsed.
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
// The subset is small because the library is small. Measured on the
// generated file (242 non-comment lines): no loops, no vectors, no
// structs, no division, no modulus, three scalar types (float, int,
// uint), `precise` and `out` as the only qualifiers, and thirteen
// builtins - uintBitsToFloat, floatBitsToUint, int, uint, float, abs,
// min, max, clamp, floor, findMSB, isinf, isnan.
//
// Precedence is C's, which is also GLSL's and also JavaScript's for
// every operator that appears here. It is written out as a table rather
// than left to a hand-rolled climb so that a reader can check it
// against the spec in one glance.

// ------------------------------------------------------------ lexing

const KEYWORDS = new Set(["void", "float", "int", "uint", "bool",
                          "precise", "out", "in", "inout", "const",
                          "if", "else", "return"]);
const TYPES = new Set(["void", "float", "int", "uint", "bool"]);

// Sorted longest first, so `<<=` never lexes as `<<` `=` and `<<` never
// lexes as `<` `<`. The compound assignments are here because the
// registry's shared header writes hashu with them, and that function is
// the one the atlas port needs an IMUL for.
const PUNCT = ["<<=", ">>=", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||",
               "+=", "-=", "*=", "/=", "%=", "&=", "^=", "|=",
               "(", ")", "{", "}", "[", "]", ",", ";", "?", ":",
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

  postfix() { return this.primary(); }

  primary() {
    if (this.eat("op", "(")) { const e = this.expr(); this.want("op", ")"); return e; }
    const t = this.peek();
    if (t.k === "num") { this.next(); return { n: "lit", ...literal(t.v) }; }
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
    // a declaration begins with `precise` or a type name
    const precise = !!this.eat("kw", "precise");
    if (precise || (this.peek().k === "kw" && TYPES.has(this.peek().v))) {
      const type = this.want("kw").v;
      const decls = [];
      do {
        const name = this.want("id").v;
        const init = this.eat("op", "=") ? this.expr() : null;
        decls.push({ name, init });
      } while (this.eat("op", ","));
      this.want("op", ";");
      return { n: "decl", type, precise, decls };
    }
    // assignment (plain or compound) or a bare call
    const e = this.expr();
    if (this.eat("op", "=")) {
      if (e.n !== "var") throw new Error("glsl-sub: assignment to a non-variable");
      const v = this.expr();
      this.want("op", ";");
      return { n: "assign", name: e.name, value: v };
    }
    for (const [tok, op] of Object.entries(COMPOUND)) {
      if (this.at("op", tok)) {
        this.next();
        if (e.n !== "var") throw new Error("glsl-sub: compound assignment to a non-variable");
        const v = this.expr();
        this.want("op", ";");
        // desugared here rather than in every consumer: `x op= v` is
        // `x = x op v` with one evaluation of x, and x is a bare name.
        return { n: "assign", name: e.name,
                 value: { n: "bin", op, l: { n: "var", name: e.name }, r: v } };
      }
    }
    this.want("op", ";");
    return { n: "expr", value: e };
  }

  // ---- the unit
  unit() {
    const fns = [];
    while (!this.at("eof")) {
      const ret = this.want("kw").v;
      const name = this.want("id").v;
      this.want("op", "(");
      const params = [];
      if (!this.at("op", ")")) {
        do {
          const out = !!this.eat("kw", "out");
          const type = this.want("kw").v;
          const pname = this.want("id").v;
          params.push({ name: pname, type, out });
        } while (this.eat("op", ","));
      }
      this.want("op", ")");
      const body = this.block();
      fns.push({ n: "fn", name, ret, params, body });
    }
    return fns;
  }
}

/** Parse a whole GLSL translation unit of the subset. */
export function parse(src) {
  return new Parser(lex(src)).unit();
}

/** The functions of a unit, by name. */
export function index(fns) {
  const m = new Map();
  for (const f of fns) {
    if (m.has(f.name)) throw new Error(`glsl-sub: ${f.name} defined twice`);
    m.set(f.name, f);
  }
  return m;
}

// ------------------------------------------------------------- types
//
// Enough of a type system to tell an integer `-` from a float one and
// an integer `<` from a float one, which is the whole reason it exists:
// the ISA has two different opcodes for each.

export const BUILTIN_TYPES = {
  uintBitsToFloat: { args: ["uint"], ret: "float" },
  floatBitsToUint: { args: ["float"], ret: "uint" },
  findMSB: { args: ["uint"], ret: "int" },
  isnan: { args: ["float"], ret: "bool" },
  isinf: { args: ["float"], ret: "bool" },
  abs: { args: ["float"], ret: "float" },
  floor: { args: ["float"], ret: "float" },
  min: { args: ["float", "float"], ret: "float" },
  max: { args: ["float", "float"], ret: "float" },
  clamp: { args: ["float", "float", "float"], ret: "float" },
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
 *  callee's return type. */
export function typecheck(fns) {
  const byName = index(fns);
  const typeOf = (e, env) => {
    switch (e.n) {
      case "lit": return e.type;
      case "var": {
        const t = env.get(e.name);
        if (!t) throw new Error(`glsl-sub: ${e.name} is not in scope`);
        return t;
      }
      case "call": {
        if (CASTS.has(e.name)) { e.args.forEach(a => typeOf(a, env)); return e.name; }
        const b = BUILTIN_TYPES[e.name];
        if (b) { e.args.forEach(a => typeOf(a, env)); return b.ret; }
        const f = byName.get(e.name);
        if (!f) throw new Error(`glsl-sub: no function ${e.name}`);
        e.args.forEach(a => typeOf(a, env));
        return f.ret;
      }
      case "un":
        if (e.op === "!") { typeOf(e.a, env); return "bool"; }
        return typeOf(e.a, env);
      case "bin": {
        const lt = typeOf(e.l, env), rt = typeOf(e.r, env);
        if (["==", "!=", "<", ">", "<=", ">=", "&&", "||"].includes(e.op)) {
          e.operandType = lt === "float" || rt === "float" ? "float"
                        : lt === "uint" || rt === "uint" ? "uint"
                        : lt === "bool" ? "bool" : "int";
          return "bool";
        }
        if (["<<", ">>"].includes(e.op)) return lt;
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
  };

  const stmt = (s, env) => {
    switch (s.n) {
      case "block": { const e2 = new Map(env); s.body.forEach(x => stmt(x, e2)); break; }
      case "decl":
        for (const d of s.decls) { if (d.init) ann(d.init, env); env.set(d.name, s.type); }
        break;
      case "assign": if (!env.has(s.name)) throw new Error(`glsl-sub: ${s.name} not in scope`);
        ann(s.value, env); break;
      case "if": ann(s.c, env); stmt(s.then, env); if (s.els) stmt(s.els, env); break;
      case "return": if (s.value) ann(s.value, env); break;
      case "expr": ann(s.value, env); break;
      default: throw new Error(`glsl-sub: cannot type statement ${s.n}`);
    }
  };
  for (const f of fns) {
    const env = new Map();
    for (const p of f.params) env.set(p.name, p.type);
    stmt(f.body, env);
  }
  return byName;
}
