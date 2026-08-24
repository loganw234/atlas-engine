// The emitter: reads a positive's walk function - the same source the
// CPU evaluator runs - and writes registry-contract GLSL, or refuses.
//
// The subset is deliberate: statements are const/let/assign/if/return,
// loops are vocabulary (descend), arithmetic is natural. The refusals
// are the point, not a limitation: a stream draw on the short-circuit
// side of && or || or inside a ternary branch is the backend-divergence
// bug from the automaton suite, and the emitter makes it unwritable.
// Draw order is source order; the emitter hoists draws as sequenced
// statements exactly where JavaScript would evaluate them.
import { fnv1a } from "./measure.mjs";
// The oracle is the only way a constant reaches emitted GLSL:
// a bit pattern from a record that passed all three levels,
// never a decimal typed into this file.
import { glsl as oracleGlsl } from "./oracle.mjs";

// ---------------------------------------------------------------- lex
// Two-character punctuation first, so the longest match wins: `<<`
// has to be offered before `<` or a shift lexes as two comparisons.
const PUNCT = ["=>", "<=", ">=", "==", "!=", "&&", "||", "<<", ">>",
  "+=", "-=", "*=", "/=",
  "(", ")", "{", "}", "[", "]", ",", ";", ":", ".", "?",
  "+", "-", "*", "/", "%", "<", ">", "=", "!",
  "&", "|", "^", "~"];

function lex(src) {
  const toks = [];
  let i = 0, line = 1;
  const err = (m) => { throw new Error(`emit lex: ${m} at line ${line}`); };
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; }
      i += 2; continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i;
      if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        j = i + 2;
        while (j < src.length && /[0-9a-fA-F]/.test(src[j])) j++;
      } else {
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        if (src[j] === "e" || src[j] === "E") {
          j++;
          if (src[j] === "+" || src[j] === "-") j++;
          while (j < src.length && /[0-9]/.test(src[j])) j++;
        }
      }
      toks.push({ t: "num", v: src.slice(i, j), line });
      i = j; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j), line });
      i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (PUNCT.includes(two)) { toks.push({ t: two, line }); i += 2; continue; }
    if (PUNCT.includes(c)) { toks.push({ t: c, line }); i += 1; continue; }
    err(`unexpected character "${c}"`);
  }
  toks.push({ t: "eof", line });
  return toks;
}

// -------------------------------------------------------------- parse
function parse(src) {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const err = (m) => { throw new Error(`emit parse: ${m} at line ${peek().line}`); };
  const eat = (t) => { if (peek().t !== t) err(`expected ${t}, got ${peek().t === "id" || peek().t === "num" ? peek().v : peek().t}`); return next(); };

  // (P, s) or (P, s, q, t) => { ... }
  eat("(");
  const pName = eat("id").v; eat(",");
  const sName = eat("id").v;
  let qName = null, tName = null;
  if (peek().t === ",") { next(); qName = eat("id").v; }
  if (peek().t === ",") { next(); tName = eat("id").v; }
  eat(")"); eat("=>"); eat("{");
  const body = [];
  while (peek().t !== "}") body.push(statement());
  eat("}");
  return { pName, sName, qName, tName, body };

  function statement() {
    const t = peek();
    if (t.t === "id" && (t.v === "const" || t.v === "let")) {
      next();
      const decls = [];
      for (;;) {
        const name = eat("id").v;
        eat("=");
        decls.push({ name, e: expr() });
        if (peek().t === ",") { next(); continue; }
        break;
      }
      eat(";");
      return { t: "decl", mut: t.v === "let", decls, line: t.line };
    }
    if (t.t === "id" && t.v === "if") {
      next(); eat("(");
      const c = expr();
      eat(")");
      const then = blockOrOne();
      let els = null;
      if (peek().t === "id" && peek().v === "else") { next(); els = blockOrOne(); }
      return { t: "if", c, then, els, line: t.line };
    }
    if (t.t === "id" && t.v === "return") {
      next();
      const e = expr();
      eat(";");
      return { t: "return", e, line: t.line };
    }
    if (t.t === "id") {
      const name = next().v;
      const op = peek().t;
      if (op === "=" || op === "+=" || op === "-=" || op === "*=" || op === "/=") next();
      else err("assignment expected");
      const e = expr();
      eat(";");
      return { t: "assign", name, op, e, line: t.line };
    }
    err("statement expected");
  }
  function blockOrOne() {
    if (peek().t === "{") {
      next();
      const b = [];
      while (peek().t !== "}") b.push(statement());
      eat("}");
      return b;
    }
    return [statement()];
  }

  function expr() { return ternary(); }
  function ternary() {
    const c = orE();
    if (peek().t === "?") {
      next();
      const a = expr();
      eat(":");
      const b = ternary();
      return { t: "cond", c, a, b };
    }
    return c;
  }
  function orE() { let l = andE(); while (peek().t === "||") { next(); l = { t: "bin", op: "||", l, r: andE() }; } return l; }
  function andE() { let l = bOrE(); while (peek().t === "&&") { next(); l = { t: "bin", op: "&&", l, r: bOrE() }; } return l; }
  // BITWISE, AT JAVASCRIPT'S PRECEDENCE and not at some tidier one.
  // The CPU evaluator runs the walk's actual JS, so a walk that parses
  // differently here than the language it is written in would agree
  // with neither evaluator for the same reason. JS orders these
  // | below ^ below & below the comparisons, and shifts above them.
  function bOrE() { let l = bXorE(); while (peek().t === "|") { next(); l = { t: "bin", op: "|", l, r: bXorE() }; } return l; }
  function bXorE() { let l = bAndE(); while (peek().t === "^") { next(); l = { t: "bin", op: "^", l, r: bAndE() }; } return l; }
  function bAndE() { let l = cmpE(); while (peek().t === "&") { next(); l = { t: "bin", op: "&", l, r: cmpE() }; } return l; }
  function shE() { let l = addE(); while (peek().t === "<<" || peek().t === ">>") { const op = next().t; l = { t: "bin", op, l, r: addE() }; } return l; }
  function cmpE() {
    let l = shE();
    while (["<", ">", "<=", ">=", "==", "!="].includes(peek().t)) {
      const op = next().t;
      l = { t: "bin", op, l, r: shE() };
    }
    return l;
  }
  function addE() { let l = mulE(); while (peek().t === "+" || peek().t === "-") { const op = next().t; l = { t: "bin", op, l, r: mulE() }; } return l; }
  function mulE() { let l = unE(); while (peek().t === "*" || peek().t === "/" || peek().t === "%") { const op = next().t; l = { t: "bin", op, l, r: unE() }; } return l; }
  function unE() {
    if (peek().t === "-") { next(); return { t: "un", op: "-", e: unE() }; }
    if (peek().t === "!") { next(); return { t: "un", op: "!", e: unE() }; }
    if (peek().t === "~") { next(); return { t: "un", op: "~", e: unE() }; }
    return postfix();
  }
  function postfix() {
    let e = primary();
    for (;;) {
      if (peek().t === ".") {
        next();
        e = { t: "member", o: e, name: eat("id").v };
      } else if (peek().t === "(") {
        next();
        const args = [];
        while (peek().t !== ")") {
          args.push(expr());
          if (peek().t === ",") next();
        }
        eat(")");
        e = { t: "call", callee: e, args };
      } else break;
    }
    return e;
  }
  function primary() {
    const t = peek();
    if (t.t === "num") { next(); return { t: "num", v: t.v }; }
    if (t.t === "(") {
      // arrow or paren: scan ahead for ( ids ) =>
      const save = p;
      next();
      const params = [];
      let isArrow = false;
      if (peek().t === "id") {
        params.push(next().v);
        while (peek().t === ",") { next(); params.push(eat("id").v); }
        if (peek().t === ")" && toks[p + 1].t === "=>") { next(); next(); isArrow = true; }
      } else if (peek().t === ")" && toks[p + 1].t === "=>") { next(); next(); isArrow = true; }
      if (isArrow) {
        // `=> {` IS A BLOCK, exactly as JavaScript reads it, and an
        // object return needs the parens: `=> ({ ... })`. That is not
        // a stylistic preference. A positive is REAL JAVASCRIPT - the
        // CPU evaluator runs the same function this parser reads - so
        // any place the two disagree is a place the oracle and the
        // shader compute different things while looking identical.
        //
        // This is what lets an orbit step declare an intermediate, and
        // so hold a nested sum() or orbit. Before it, the step arrow
        // had to BE an object literal, which is why cascade, rule30,
        // rulespace and universal could not be authored at all: their
        // loops nest two and three deep.
        if (peek().t === "{") {
          next();
          const b = [];
          while (peek().t !== "}") b.push(statement());
          eat("}");
          return { t: "arrow", params, block: b };
        }
        return { t: "arrow", params, body: expr() };
      }
      p = save;
      next();
      const e = expr();
      eat(")");
      return { t: "paren", e };
    }
    if (t.t === "[") {
      next();
      const items = [];
      while (peek().t !== "]") { items.push(expr()); if (peek().t === ",") next(); }
      eat("]");
      return { t: "array", items };
    }
    if (t.t === "{") {
      next();
      const props = [];
      while (peek().t !== "}") {
        const key = eat("id").v;
        if (peek().t === ":") { next(); props.push({ key, value: expr() }); }
        else props.push({ key, value: { t: "id", n: key } });   // shorthand
        if (peek().t === ",") next();
      }
      eat("}");
      return { t: "object", props };
    }
    if (t.t === "id") { next(); return { t: "id", n: t.v }; }
    err("expression expected");
  }
}

// --------------------------------------------------------------- emit
// ------------------------------------------------------- the pinned set
//
// Phase 2 of docs/DETERMINISM.md. With `pin`, every float operation the
// emitter writes either has a deterministic form behind it or is
// refused. Without it the emitter behaves exactly as before, so nothing
// already built moves until somebody asks for it.
//
// The det_* functions come from core/detlib.glsl.template, filled from
// the verified constants and proven byte-identical to the library the
// darkroom already runs (tools/gen-detlib.mjs). So this is not a new
// numerical claim - it is the existing, measured one, reached from a
// record instead of from a comment.
const DET = {
  sin: a => `det_sin(${a[0]})`,
  cos: a => `det_cos(${a[0]})`,
  tan: a => `det_tan(${a[0]})`,
  sqrt: a => `det_sqrt(${a[0]})`,
  acos: a => `det_acos(${a[0]})`,
  atan2: a => `det_atan(${a[0]}, ${a[1]})`,
  pow: a => `det_pow(${a[0]}, ${a[1]})`,
  // exp and log have no det_ of their own; they are the base-2 pair
  // rescaled by a constant that is itself in the record, so the
  // rescale is a pinned multiply rather than a typed-in decimal.
  exp: a => `det_exp2((${a[0]}) * ${oracleGlsl("LOG2E")})`,
  log: a => `(det_log2(${a[0]}) * ${oracleGlsl("LN2")})`,
  // asin and the hyperbolics. These were the last refusals in the
  // pinned set - four of fifty-four positives, blocked not on hard
  // mathematics but on nothing here routing the call. Their bodies
  // live in detpre and are built only from calls already pinned, so
  // they add no new accuracy claim: they inherit the kernels' bounds
  // rather than asserting their own.
  asin: a => `det_asin(${a[0]})`,
  sinh: a => `det_sinh(${a[0]})`,
  cosh: a => `det_cosh(${a[0]})`,
  tanh: a => `det_tanh(${a[0]})`,
};

// Exact by construction: selections and sign manipulation, correctly
// rounded or bit-exact on every conforming implementation. They need no
// det_ form and get none.
/** 1/x as a GLSL literal, when x is a literal power of two - and null
 *  for everything else, which is the whole point.
 *
 *  det_div is a magic-seed reciprocal, FOUR Newton rounds, a multiply,
 *  a branch and an fma correction. None of it is needed when the
 *  divisor is 2^k: the quotient is an exponent decrement, so the
 *  correction term is exactly zero and det_div already returns
 *  a * 2^-k. Proof, not preference -
 *
 *      q = a * det_recip(2^k) = a * 2^-k          exactly
 *      fma(-2^k, q, a) = a - a = 0                exactly
 *      q = fma(0, r, q) = q                       so the round does nothing
 *
 *  - and measured besides: rewriting these call sites is bit-identical
 *  on every plate that has one (throughput 32, e8 22, universal 19,
 *  rulespace 15, vlsi 13, hilbert 7, collatz 7) and takes universal
 *  from 21.3 to 12.3 seconds a pass on an RTX 5060 Ti, 1.74x, for the
 *  same picture. universal is 68% of a cpu census by itself.
 *
 *  MULTIPLY, NOT DIVIDE. GLSL allows 2.5 ULP on `/`, which is the
 *  entire reason det_div exists; it says nothing so generous about
 *  `*`, and this emitter already emits bare multiplies and trusts
 *  them. 1/2^k is exactly representable, so the product is the same
 *  exponent decrement the divide would have been.
 *
 *  Bounded well inside float32's normal range so no reciprocal here
 *  can land denormal, where the reasoning above stops holding. */
function exactRecip(code) {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(code)) return null;
  const v = Number(code);
  if (!(v > 0) || !Number.isFinite(v)) return null;
  const l = Math.log2(v);
  if (!Number.isInteger(l) || l < -100 || l > 100) return null;
  const s = String(1 / v);
  return /[.e]/.test(s) ? s : `${s}.0`;
}

/** The same expression, spelled the same way, for CSE keying only.
 *
 *  Strips redundant outer parentheses - and only genuinely redundant
 *  ones: `(a) * (b)` keeps its own, because the first bracket closes
 *  before the end. Whitespace is collapsed for the same reason. The
 *  emitted text is never rewritten from this; it decides equality and
 *  nothing else. */
function cseKey(code) {
  let s = code.trim().replace(/\s+/g, " ");
  for (;;) {
    if (!(s.startsWith("(") && s.endsWith(")"))) return s;
    let d = 0, whole = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") d++;
      else if (s[i] === ")") {
        d--;
        if (d === 0 && i < s.length - 1) { whole = false; break; }
      }
    }
    if (!whole) return s;
    s = s.slice(1, -1).trim();
  }
}

const EXACT_BUILTINS = new Set(["abs", "min", "max", "floor", "sign"]);

// Reachable from the subset today, with nothing deterministic behind
// them. `oracle.UNCOVERED` carries the same list so the gap is data.
// Refusing is the honest outcome: the language gets smaller rather than
// the guarantee getting vaguer.
// EMPTY, and kept rather than deleted. This is the mechanism that
// makes "the language gets smaller rather than the guarantee getting
// vaguer" enforceable, and the next builtin someone reaches for
// without a det_ form behind it belongs here on the day it is reached,
// not in a plate. It held asin, sinh, cosh and tanh until 2026-08-22,
// when the forms the darkroom had been using were routed in.
const NO_DET_FORM = {};

export function emitWalk(pos, opts = {}) {
  const pin = !!opts.pin;
  const src = pos.walk.toString();
  const ast = parse(src);
  const P = ast.pName, S = ast.sName;

  const lines = [];
  let indent = "  ";
  // WHERE EACH EMITTED TEMPORARY IS DEFINED, so a hoist can be placed
  // at its definition rather than at its first use. See sincosOf.
  const defAt = new Map();
  /** COMPOUND EXPRESSIONS ALREADY BOUND IN THIS RUN OF DECLARATIONS.
   *
   *  The emitter writes the same subexpression more than once - 11% of
   *  the atlas's precise declarations repeat an earlier right-hand
   *  side within their own block, and threebody repeats 36% of them.
   *  universal's fourteen-cell loop computes `2.0 * ob_215_v` twice
   *  per iteration; rule30's computes `floor(g * 0.5)` twice.
   *
   *  Mesa removes these; NVIDIA does not, which is the same asymmetry
   *  the det_sincos hoist was for (three identical calls cost radeonsi
   *  1.10x and NVIDIA 2.19x). Sharing them here settles it for both.
   *
   *  Bit-exact: emitted temporaries are single-assignment, so the same
   *  text over the same names is the same value by construction.
   *
   *  INVALIDATED AT ONE CHOKE POINT, and deliberately a blunt one.
   *  Every emitted line passes through put(), so anything that is not
   *  a plain declaration - a brace, an assignment to orbit state, a
   *  break, a branch - clears the map. That gives up sharing across
   *  statements for a rule that cannot be wrong about when a name it
   *  cached has since been reassigned. The runs of declarations that
   *  make up the hot loops are what this is for, and they are intact
   *  within one run. */
  const cse = new Map();          // normalised text -> { name, depth }
  let cseDepth = 0;
  const put = (s) => {
    lines.push(indent + s);
    const decl =
      /^(?:precise\s+)?(?:float|vec2|vec3|vec4)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/
        .exec(s);
    if (decl) defAt.set(decl[1], { at: lines.length - 1, ind: indent });

    // INVALIDATE WHAT ACTUALLY CHANGED, and nothing else.
    //
    // This used to clear the whole map on any line that was not a
    // plain declaration, which is safe and threw most of the value
    // away. threebody's 2,560-step integrator recomputed
    // `det_div(h_41, 6.0)` - a Newton reciprocal, on a value declared
    // OUTSIDE the loop - twenty-four times per step, and the two
    // stage-weight ternaries twelve times each, because they sat in
    // different runs of declarations with assignments between them.
    //
    // So: an assignment drops only the entries whose text mentions the
    // name assigned, and a closing brace drops only what was bound
    // inside the scope that just ended. An opening brace drops
    // nothing - an outer temporary is perfectly visible inside a
    // nested block, and that is exactly the loop-invariant case.
    for (const mm of s.matchAll(
      /([A-Za-z_][A-Za-z0-9_]*)\s*(?:\+|-|\*|\/)?=(?!=)/g)) {
      if (decl && mm[1] === decl[1]) continue;   // its own declarator
      const re = new RegExp(`\\b${mm[1]}\\b`);
      for (const k of [...cse.keys()]) if (re.test(k)) cse.delete(k);
    }
    // BRACES IN ORDER, never netted. `} else {` closes one scope and
    // opens another at the SAME depth, so a net count sees no change
    // and keeps everything the closing branch bound - which arnold
    // then referenced from the else branch as an undefined variable.
    // Fifteen plates failed to bake on that, and not one of the five
    // gates caught it, because none of them runs a GLSL compiler.
    for (const ch of s) {
      if (ch === "{") cseDepth++;
      else if (ch === "}") {
        cseDepth--;
        for (const [k, v] of [...cse]) if (v.depth > cseDepth) cse.delete(k);
      }
    }
  };
  const err = (m, line) => { throw new Error(`emit: ${m}${line ? ` (line ${line})` : ""}`); };

  let vn = 0;

  /** Bind a compound float expression to its own `precise` temporary.
   *
   *  Only compound ones: a bare name, a literal, a swizzle or a lever
   *  read is already a single value, and naming it again would double
   *  the length of every emitted plate to say nothing. The test is
   *  deliberately syntactic and slightly generous - if it binds
   *  something that did not need it, the cost is a redundant local the
   *  compiler removes; if it misses something that did, a plate stops
   *  agreeing across vendors, which is far more expensive. */
  /** The same binding, for a vector expression. */
  /** ONE det_sincos WHERE THE PLATE ASKED FOR SEVERAL.
   *
   *  det_sin(x) and det_cos(x) both call det_sincos and throw half of
   *  it away, and a plate asks the same question over and over: tpms
   *  makes 786 det_sin/det_cos calls over 235 distinct arguments,
   *  `det_cos(px_8)` alone appearing 175 times. Across the atlas it is
   *  4,662 calls over 2,026 arguments - a median redundancy of 2.20x,
   *  and 60 of 68 plates above 2x. It is not one plate's quirk.
   *
   *  Mesa removes it for free. NVIDIA does not: running three
   *  textually identical calls costs radeonsi 1.10x and iris 1.14x
   *  against one, and NVIDIA 2.19x (2026-08-24). So the plate that
   *  agrees on every card costs 60x more on NVIDIA than on Mesa, and a
   *  third of that is redundancy the emitter is handing over.
   *
   *  THIS IS BIT-EXACT AND THAT IS THE ONLY REASON IT IS ALLOWED. The
   *  same input to the same deterministic function returns the same
   *  bits, and `precise` constrains HOW an expression is computed, not
   *  that it must be computed again. The census re-run is what proves
   *  it rather than this paragraph.
   *
   *  Two rules keep it safe:
   *
   *  ONLY EMITTER TEMPORARIES. The name must carry the `_<counter>`
   *  suffix that fresh/bindPrecise/bindPreciseV append from a
   *  monotonic `vn`, so it is unique for the whole emission and cannot
   *  be a redefined walk name or a det_ library local (`t`, `k`, `r`,
   *  `r2` - the only names this emitter ever repeats).
   *
   *  AT THE DEFINITION, NOT THE FIRST USE. px_8 is defined at brace
   *  depth 1 and used at depths 1 and 2; caching at first use would
   *  put the temporary inside a block and reference it outside. Its
   *  definition dominates every use by construction, and a hoist
   *  placed just after it lands in exactly the scope the argument
   *  itself lives in. */
  const sincos = new Map();
  const hoists = [];
  function sincosOf(code, which) {
    const fallback = which === "s" ? `det_sin(${code})` : `det_cos(${code})`;
    if (!/^[A-Za-z_][A-Za-z0-9_]*_[0-9]+$/.test(code)) return fallback;
    const d = defAt.get(code);
    if (!d) return fallback;
    let e = sincos.get(code);
    if (!e) {
      const t = `sc_${vn++}`;
      e = { s: `${t}_s`, c: `${t}_c` };
      // ONE DECLARATOR PER LINE, so the `precise` post-pass qualifies
      // both. It matches a single declarator and skips a comma list.
      //
      // The comma-list form was tried first, because it reproduces
      // what det_sin and det_cos already do internally:
      //
      //   float det_sin(float x){ float s, c; det_sincos(x,s,c); return s; }
      //
      // and it does keep the old hashes. verify-orbit-block refused
      // it: "2 unpinned local(s) inside the orbit". That gate exists
      // because an unpinned local inside an orbit is what made mirage
      // disagree across vendors, so the library's own idiom is a
      // hazard the emitter must not copy inward.
      //
      // Qualified, `precise` propagates back through the out parameter
      // into det_sincos - a tighter constraint than the old chain, not
      // a looser one - and the plate's hash moves. That is allowed
      // where the cards still agree with each other; agreement, not
      // continuity with a previous number, is the claim.
      hoists.push({ at: d.at, ind: d.ind, text: [
        `float ${e.s};`, `float ${e.c};`,
        `det_sincos(${code}, ${e.s}, ${e.c});`] });
      sincos.set(code, e);
    }
    return which === "s" ? e.s : e.c;
  }

  function bindPreciseV(code, type) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(code)) return code;
    const t = `pv_${vn++}`;
    put(`precise ${type} ${t} = ${code};`);
    return t;
  }

  function bindPrecise(code) {
    // NOTE: hoisting DOES descend into ternary branches. Binding a
    // branch computes it whether or not it is selected - harmless,
    // since draws are already refused there and every det_ function
    // is total - but tpms has four branches of six det_ calls each
    // and pays for all of them, and mirage's emitted source roughly
    // doubles. That is the price of the last plates: with the
    // exemption in place mirage disagreed between vendors, and
    // without it every GPU pair reaches 50/50.
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(code)) return code;        // name
    if (/^[A-Za-z_][A-Za-z0-9_]*\.[xyzw]$/.test(code)) return code; // swizzle
    if (/^-?[0-9.]+(e-?[0-9]+)?$/.test(code)) return code;          // literal
    if (/^P\[[0-9]+\]$/.test(code)) return code;                    // lever
    // KEYED ON THE NORMALISED TEXT. The emitter parenthesises
    // inconsistently - universal's fourteen-cell loop binds
    // `((2.0 * ob_v))` and then `(2.0 * ob_v)`, the same value twice,
    // and a raw string key sees two different expressions. Only the
    // key is normalised; what is emitted is untouched.
    const key = cseKey(code);
    const hit = cse.get(key);
    if (hit) return hit.name;
    const t = `pb_${vn++}`;
    put(`precise float ${t} = ${code};`);
    // AFTER the put, so the invalidation pass inside it cannot drop
    // the entry it is about to gain; depth recorded so a closing brace
    // knows whether this one went out of scope with it
    cse.set(key, { name: t, depth: cseDepth });
    return t;
  }
  // GLSL reserves the gl_ prefix, so a walk variable named "gl" would
  // emit gl_5 and fail at GPU link time only - emit and smoke are both
  // CPU-side and would pass it through. Rename at the source.
  const fresh = (base) => `${/^gl(_|$)/.test(base) ? "v" + base : base}_${++vn}`;
  const helpers = new Set();

  const leverIx = {};
  pos.leverNames.forEach((n, i) => leverIx[n] = i);
  const usedIntLevers = new Set();
  const intLeverVar = (name) => {
    const lv = pos.levers[leverIx[name]];
    if (!(lv.step === 1 && Number.isInteger(lv.min) && Number.isInteger(lv.max)))
      err(`lever ${name} used where an integer is required, but it is not an integer lever`);
    usedIntLevers.add(name);
    return `li_${name}`;
  };

  const syms = new Map();  // name -> {kind, ...}
  // the classic stratum's givens, when the walk names them
  if (ast.qName) syms.set(ast.qName, { kind: "vec2", v: "q" });
  if (ast.tName) syms.set(ast.tName, { kind: "scalar", type: "float", v: "uT" });
  syms.set("TAU", { kind: "scalar", type: "float", v: "TAU" });
  syms.set("PI", { kind: "scalar", type: "float", v: "PI" });

  // resolve a loop bound: a lever gives its max as the static bound
  // and its runtime int as the break; a literal is both
  function staticBoundOf(a) {
    if (a.t === "num") return { staticN: Math.round(+a.v), runtime: null };
    if (a.t === "member" && a.o.t === "id" && a.o.n === P) {
      const lv = pos.levers[leverIx[a.name]];
      if (!lv) err(`unknown lever ${a.name}`);
      return { staticN: Math.ceil(lv.max), runtime: intLeverVar(a.name) };
    }
    if (a.t === "id") {
      const sym = syms.get(a.n);
      if (sym && sym.staticMax !== undefined)
        return { staticN: sym.staticMax, runtime: sym.v };
    }
    err("a loop bound must be a lever, a literal, or carry a known maximum");
  }

  // ---- effect analysis: does this subtree draw from the stream ----
  function effectful(n) {
    if (!n || typeof n !== "object") return false;
    if (n.t === "call") {
      const c = n.callee;
      if (c.t === "member" && c.o.t === "id" && c.o.n === S) return true;
      return effectful(c) || n.args.some(effectful);
    }
    if (n.t === "arrow") return false;             // bodies checked at their call sites
    return Object.values(n).some(v =>
      Array.isArray(v) ? v.some(effectful) : effectful(v));
  }

  function num(nv, type) {
    if (type === "float" && !/[.eE]/.test(nv) && !/^0x/i.test(nv)) return nv + ".0";
    return nv;
  }
  function asFloat(v) {
    if (v.type === "float") return v.code;
    if (v.type === "int") return `float(${v.code})`;
    err(`cannot use ${v.type} as float`);
  }
  function asInt(v, line) {
    if (v.type === "int") return v.code;
    err(`an integer is required here`, line);
  }

  // ---- expression emission (draws hoisted in evaluation order) ----
  function emit(n) {
    switch (n.t) {
      case "num": {
        const isInt = !/[.eE]/.test(n.v) || /^0x/i.test(n.v);
        return { type: isInt ? "int" : "float", code: n.v, lit: true };
      }
      case "paren": {
        const v = emit(n.e);
        return { ...v, code: `(${v.code})` };
      }
      case "id": {
        if (n.n === P || n.n === S) err(`${n.n} used bare`);
        const sym = syms.get(n.n);
        if (!sym) err(`unknown name ${n.n}`);
        if (sym.kind === "scalar") return { type: sym.type, code: sym.v };
        if (sym.kind === "vec2") return { type: "vec2", code: sym.v };
        return { kind: sym.kind, sym };
      }
      case "un": {
        const v = emit(n.e);
        if (n.op === "-") return { type: v.type, code: `(-${v.code})` };
        if (n.op === "~") {
          if (v.type !== "int")
            err("~ needs an integer; a float carries no bits to flip. "
                + "Convert with bits(x) first", n.line);
          return { type: "int", code: `(~${v.code})` };
        }
        return { type: "bool", code: `(!${v.code})` };
      }
      case "cond": {
        if (effectful(n.a) || effectful(n.b))
          err("a stream draw inside a ternary branch would diverge across backends; hoist the draw", n.line);
        const c = emit(n.c), a = emit(n.a), b = emit(n.b);
        const ty = a.type === "int" && b.type === "int" ? "int" : "float";
        const ca = ty === "float" ? asFloat(a) : a.code;
        const cb = ty === "float" ? asFloat(b) : b.code;
        return { type: ty, code: `((${c.code}) ? ${ca} : ${cb})` };
      }
      case "bin": {
        if ((n.op === "&&" || n.op === "||") && effectful(n.r))
          err(`a stream draw on the right of ${n.op} is skipped by short-circuit in JS but not in GLSL; hoist the draw`, n.line);
        const l = emit(n.l);
        const r = emit(n.r);
        if (n.op === "&&" || n.op === "||")
          return { type: "bool", code: `(${l.code} ${n.op} ${r.code})` };
        if (["<", ">", "<=", ">=", "==", "!="].includes(n.op)) {
          // A COMPARISON HAS NO PRECISE DESTINATION, and that is the
          // hole this closes. `precise` qualifies a variable; the
          // result of a comparison is a bool and cannot be one. So a
          // compound expression that feeds a comparison and nothing
          // else reaches no precise variable at all, and the compiler
          // is free to contract or reassociate it - the one place in
          // an emitted plate where that freedom survived.
          //
          // Measured on mirage. Its leapfrog switches on
          // `n*n - C*C > 0.0`, which the emitter bound down to
          // `((pb_79 - pb_80) > 0.0)`: both products pinned, the
          // subtraction between them floating free as an fma
          // candidate. n and C are both near 1.02 and the difference
          // is the ray's turning point, so it cancels to nothing -
          // over a sweep of 345,600 rays, 23.2% present that
          // comparison a value SMALLER THAN THE ROUNDING ERROR OF ITS
          // OWN SUBTRACTION, and 11.8% get within 1e-9 of zero. Which
          // side of zero a single- or double-rounded evaluation lands
          // on is then arbitrary, the ray turns a step apart, and the
          // plate splits NVIDIA against Mesa - which is exactly the
          // two-way split the emitted census found.
          //
          // Comparisons are where control flow lives, so this is the
          // most expensive place in the emitter to leave unpinned. Int
          // comparisons are exact and stay bare.
          if (l.type === r.type && l.type !== "float")
            return { type: "bool", code: `(${l.code} ${n.op} ${r.code})` };
          const lc = pin ? bindPrecise(asFloat(l)) : asFloat(l);
          const rc = pin ? bindPrecise(asFloat(r)) : asFloat(r);
          return { type: "bool", code: `(${lc} ${n.op} ${rc})` };
        }
        // BITWISE, INTEGER ONLY, AND NO det_ FORM BECAUSE NONE EXISTS
        // TO NEED. `&`, `|`, `^` and `~` on a 32-bit integer are exact
        // on every conforming implementation - there is no ULP
        // latitude to pin, which is the whole reason the det_ library
        // exists for floats. Measured before it was relied on: 4,096
        // int pairs through all six operators, identical to an int32
        // reference on RTX 5060 Ti, GTX 1080, radeonsi and iris
        // (docs/bitwise-dsl-log.md, stage 0).
        //
        // Refused on floats rather than coerced. A silent float-to-int
        // conversion is how a walk comes to mean something different
        // from the JavaScript it is written in, and the CPU evaluator
        // runs that JavaScript.
        if (["&", "|", "^"].includes(n.op)) {
          if (l.type !== "int" || r.type !== "int")
            err(`${n.op} needs integers on both sides; a float carries `
                + "no bits. Convert with bits(x) first", n.line);
          return { type: "int", code: `(${l.code} ${n.op} ${r.code})` };
        }
        // SHIFTS TAKE A LITERAL COUNT, 0 TO 31, and the restriction is
        // not fussiness. JS masks the count to five bits, so
        // `x << 32 === x << 0`; GLSL calls a shift at or past the bit
        // width UNDEFINED. The two agree only while the count is in
        // range, and a literal is the only kind the emitter can check.
        if (n.op === "<<" || n.op === ">>") {
          if (l.type !== "int")
            err(`${n.op} needs an integer on the left; convert with `
                + "bits(x) first", n.line);
          // the lexer keeps a literal as the SOURCE SLICE, a string -
          // so this reads the number out rather than testing the token
          const k = n.r.t === "num" ? Number(n.r.v) : NaN;
          if (!Number.isInteger(k) || k < 0 || k > 31)
            err(`${n.op} needs a literal count between 0 and 31 - JS `
                + "masks the count to five bits and GLSL leaves it "
                + "undefined past the width, so they agree only here",
                n.line);
          return { type: "int", code: `(${l.code} ${n.op} ${r.code})` };
        }
        // arithmetic
        if (n.op === "%") {
          if (l.type === "int" && r.type === "int")
            return { type: "int", code: `(${l.code} % ${r.code})` };
          err("float modulus diverges between JS and GLSL; use mod(a, b)");
        }
        if (l.type === "int" && r.type === "int" && (n.op === "+" || n.op === "-" || n.op === "*"))
          return { type: "int", code: `(${l.code} ${n.op} ${r.code})` };
        if (l.type === "vec2" || r.type === "vec2" || l.type === "vec3" || r.type === "vec3") {
          if (l.type === r.type && (n.op === "+" || n.op === "-")) {
            // VECTORS NEED BINDING TOO. `precise vec3 c = (a * 0.30) +
            // (vec3(...) * (b * 0.95));` is the same compound-inline
            // shape that broke tpms, and the float path's hoisting
            // never reached it.
            //
            // WHAT THIS DID NOT FIX, recorded because the honest
            // reading cost a long detour. It was written to close the
            // colour divergence left on logz after position had gone
            // bit-identical - 427 of 8,977 deposits landing in the
            // SAME pixel with a different colour, radeonsi against
            // iris - and it changed that number by EXACTLY ZERO. So
            // did three other candidates. The cause was det_fract:
            // written as the spec defines fract, folded straight back
            // into the builtin by the compiler, and so never actually
            // compiled. Four zeroes in a row are not four facts about
            // the plate; they are a reason to doubt the compilation.
            //
            // This stays because the shape is genuinely unpinned and
            // tpms proves it can bite - but it is prophylactic, not a
            // fix, and calling it one would leave the next reader
            // hunting a divergence that is already closed.
            const lv = pin ? bindPreciseV(l.code, l.type) : l.code;
            const rv = pin ? bindPreciseV(r.code, r.type) : r.code;
            return { type: l.type, code: `(${lv} ${n.op} ${rv})` };
          }
          err(`use the vector helpers (add3, mul3, .scale) instead of ${n.op} on mixed vector types`);
        }
        // THE ONE LINE WHERE A FLOAT DIVISION BECOMES GLSL. Every `/`
        // in every emitted plate passes through here, which is the
        // whole reason the plan put the pinning in this repository
        // rather than in a regex over sixty-eight authors' source.
        // GLSL gives division 2.5 ULP of latitude; det_div refines a
        // bit-trick seed with exact arithmetic and has none.
        //
        // AND THE OPERANDS ARE BOUND FIRST, which `precise` on the
        // destination does not do for you. Measured on radeonsi with
        // tpms: `(A - level) - (B - level)` written inline is cancelled
        // to `A - B` and the rounding changes, even though the result
        // is assigned to a `precise` local. Binding each side to its
        // own `precise` temporary stops it, and is the difference
        // between that plate agreeing across vendors and not. Same
        // rule the darkroom states above pal(): never hand a compound
        // expression onward - bind it to a local first.
        const lf = pin ? bindPrecise(asFloat(l)) : asFloat(l);
        const rf = pin ? bindPrecise(asFloat(r)) : asFloat(r);
        if (pin && n.op === "/") {
          // a power-of-two divisor needs no refinement - see exactRecip
          const rec = exactRecip(rf);
          if (rec) return { type: "float", code: `(${lf} * ${rec})` };
          return { type: "float", code: `det_div(${lf}, ${rf})` };
        }
        return { type: "float", code: `(${lf} ${n.op} ${rf})` };
      }
      case "array": err("array literal outside pal()");
      case "object": err("object literal outside a known call");
      case "member": return emitMember(n);
      case "call": return emitCall(n);
      default: err(`unhandled node ${n.t}`);
    }
  }

  function emitMember(n) {
    const o = emitTarget(n.o);
    if (o.type === "vec2") {
      if (n.name === "x" || n.name === "y") return { type: "float", code: `${o.code}.${n.name}` };
      return { kind: "vec2method", base: o, name: n.name };
    }
    if (o.kind === "descend") {
      if (n.name === "cell") return { kind: "cell", xy: o.sym.xy, sc: o.sym.sc, b: o.sym.b };
      if (n.name === "addr") return { kind: "addr", h: o.sym.adr };
      if (n.name === "trail") {
        if (!o.sym.trail) err("this walk never folds a trail (internal)");
        return { kind: "addr", h: o.sym.trail };
      }
      if (n.name === "reached") return { type: "int", code: o.sym.reached };
      err(`descend result has no ${n.name}`);
    }
    if (o.kind === "cell") {
      if (n.name === "scale") return { type: "float", code: o.sc };
      return { kind: "cellmethod", base: o, name: n.name };
    }
    if (o.kind === "levels") {
      if (n.name === "L") return { type: "int", code: o.sym.L, staticMax: 24 };
      if (n.name === "R") return { type: "int", code: o.sym.R };
      err(`levels has no ${n.name}`);
    }
    if (o.kind === "window") {
      return { kind: "windowmethod", base: o.sym, name: n.name };
    }
    if (o.kind === "orbitstate") {
      if (!(n.name in o.sym.fields)) err(`orbit state has no ${n.name}`);
      return { type: "float", code: o.sym.fields[n.name] };
    }
    if (o.kind === "orbit") {
      if (n.name === "count") return { type: "int", code: o.sym.count };
      if (n.name === "escaped") return { type: "bool", code: o.sym.escaped };
      if (n.name in o.sym.fields) return { type: "float", code: o.sym.fields[n.name] };
      err(`orbit result has no ${n.name}`);
    }
    if (o.kind === "wdescend") {
      if (n.name === "n") return { type: "int", code: o.sym.n };
      if (n.name === "k") return { type: "int", code: o.sym.k };
      if (n.name === "v") return { type: "int", code: o.sym.v };
      if (n.name === "dead") return { type: "bool", code: o.sym.dead };
      if (n.name === "sig") return { kind: "addr", h: o.sym.lin };
      err(`weighted descend result has no ${n.name}`);
    }
    if (o.kind === "addr") return { kind: "addrmethod", base: o, name: n.name };
    if (o.t === "id" && o.n === "Math") return { kind: "mathfn", name: n.name };
    if (o.isP) {
      if (!(n.name in leverIx)) err(`unknown lever ${n.name}`);
      return { type: "float", code: `P[${leverIx[n.name]}]`, lever: n.name };
    }
    if (o.isS) return { kind: "streamfn", name: n.name };
    err(`cannot take .${n.name} here`);
  }

  // resolve an expression that may be a namespace (P, s, Math) or value
  function emitTarget(n) {
    if (n.t === "id") {
      if (n.n === P) return { isP: true };
      if (n.n === S) return { isS: true };
      if (n.n === "Math") return { t: "id", n: "Math" };
      const sym = syms.get(n.n);
      if (!sym) err(`unknown name ${n.n}`);
      if (sym.kind === "scalar") return { type: sym.type, code: sym.v };
      if (sym.kind === "vec2") return { type: "vec2", code: sym.v };
      return { kind: sym.kind, sym };
    }
    const v = emit(n);
    if (v.type) return v;
    return v;
  }

  function draw() { put(`pt = hashu(pt);`); }

  function emitCall(n) {
    const c = n.callee;
    // pal(t, [..]x4)
    if (c.t === "id" && c.n === "pal") {
      const t = emit(n.args[0]);
      const vecs = n.args.slice(1).map(a => {
        if (a.t !== "array" || a.items.length !== 3) err("pal wants four [r,g,b] arrays");
        const xs = a.items.map(e => { const v = emit(e); return num(v.code, "float"); });
        return `vec3(${xs.join(", ")})`;
      });
      if (vecs.length !== 4) err("pal wants t plus four arrays");
      return { type: "vec3", code: `${pin ? "det_pal" : "pal"}(${asFloat(t)}, ${vecs.join(", ")})` };
    }
    // len2/len3: GLSL length(), which is what these spell on the CPU
    if (c.t === "id" && (c.n === "len2" || c.n === "len3")) {
      const want = c.n === "len2" ? 2 : 3;
      if (n.args.length !== want) err(`${c.n} wants ${want} arguments`);
      const xs = n.args.map(a => asFloat(emit(a)));
      // length() is sqrt(dot(v,v)), and dot chooses its own order
      // and contraction. det_len2/3 name every square and the sum.
      if (pin)
        return { type: "float",
                 code: `det_len${want}(${xs.join(", ")})` };
      return { type: "float", code: `length(vec${want}(${xs.join(", ")}))` };
    }
    // grid2(b)
    if (c.t === "id" && c.n === "grid2") {
      const a = n.args[0];
      if (a.t === "member" && a.o.t === "id" && a.o.n === P) return { kind: "grid2", b: intLeverVar(a.name) };
      if (a.t === "num") return { kind: "grid2", b: a.v };
      err("grid2 wants a lever or an integer literal");
    }
    // prime(P.nth): the nth prime, 2 3 5 7
    if (c.t === "id" && c.n === "prime") {
      const a = n.args[0];
      if (!(a.t === "member" && a.o.t === "id" && a.o.n === P)) err("prime wants a lever");
      const iv = intLeverVar(a.name);
      const v = fresh("prm");
      put(`int ${v} = (${iv} <= 1) ? 2 : (${iv} == 2) ? 3 : (${iv} == 3) ? 5 : 7;`);
      return { type: "int", code: v };
    }
    // stain(col, amount): rotation about grey, emitted as a helper
    if (c.t === "id" && c.n === "stain") {
      const colV = emit(n.args[0]);
      const amt = asFloat(emit(n.args[1]));
      if (colV.type !== "vec3") err("stain wants a vec3 first");
      helpers.add("stain");
      return { type: "vec3", code: `stain_${pos.id}(${colV.code}, ${amt})` };
    }
    if (c.t === "id" && c.n === "digitTriangle")
      err("digitTriangle only lives inside s.descend(...)");
    if (c.t === "id" && c.n === "levels")
      err("levels must be bound directly: const g = levels(p, P.depth)");
    // THE DOOR INTO THE INTEGER DOMAIN, and deliberately the only one.
    //
    // The walk vocabulary is floats, and bit operations are not. The
    // conversion is explicit so that a walk says where it crosses -
    // an implicit one is how a plate comes to mean something other
    // than the JavaScript it is written in, and the CPU evaluator runs
    // that JavaScript.
    //
    // GLSL `int(x)` truncates toward zero; JS `x | 0` is ToInt32,
    // which truncates toward zero and then wraps. They agree exactly
    // while |x| < 2^31, and the plates that want this state a much
    // tighter invariant than that: rule30.pos.mjs carries every value
    // as "an exact integer under 2^24 on both evaluators". Outside
    // 2^31 GLSL leaves the conversion undefined and JS wraps, so they
    // part - which is a range no walk here goes near, and is written
    // down rather than assumed.
    //
    // Coming back the other way needs no door: asFloat already emits
    // float(i) for an int, and on the JS side an int IS a number.
    if (c.t === "id" && c.n === "bits") {
      if (n.args.length !== 1) err("bits takes one argument", n.line);
      const v = emit(n.args[0]);
      if (v.type === "int") return v;
      return { type: "int", code: `int(${asFloat(v)})` };
    }
    // GLSL-parity scalar builtins
    if (c.t === "id" && ["fract", "mod", "mix", "clamp", "step", "smoothstep"].includes(c.n)) {
      const args = n.args.map(a => asFloat(emit(a)));
      // fract, clamp and step are exact - a subtraction against an
      // exact floor, and two selections - so they are emitted as they
      // stand under pinning too. mod, mix and smoothstep are not, and
      // each has a pinned form.
      // `fract` LOOKED EXACT AND IS NOT. It was admitted on the
      // reasoning that it is x - floor(x) and floor is exact.
      // Measured 2026-08-22 over 262,144 inputs: iris returns a
      // different hash for fract than NVIDIA, radeonsi and llvmpipe,
      // while floor is identical on all four - so iris does not
      // compute it that way. It was the last thing keeping emitted
      // colour from agreeing after position had gone bit-identical.
      const PINNED_VOCAB = { mod: "det_mod", mix: "det_mix",
                             smoothstep: "det_smoothstep",
                             fract: "det_fract" };
      // mod BY A POWER OF TWO carries a det_div that cannot pay.
      //
      //   float det_mod(float x, float y){
      //     precise float q = floor(det_div(x, y));
      //     precise float r = fma(-y, q, x);
      //     return r; }
      //
      // det_div(x, 2^k) is exactly x * 2^-k (see exactRecip), so this
      // is the same two operations with the reciprocal folded in -
      // floor of an exact product, then the same fma. Identical
      // arithmetic, one Newton reciprocal and four refinement rounds
      // lighter.
      //
      // 165 of the atlas's 415 det_mod calls take a power-of-two
      // modulus and rule30 alone has 36 of 39, which is why rule30 saw
      // nothing from the divisor fix: its hot loop asks for
      // mod(g, 2.0) and mod(e, 131072.0), and both were still routed
      // through det_div inside det_mod.
      if (pin && c.n === "mod" && args.length === 2) {
        const rec = exactRecip(args[1]);
        if (rec) {
          // bound, because x appears twice and a compound expression
          // evaluated twice is the cost this is trying to remove.
          // The floor is bound too, and not for tidiness: a plate that
          // asks for mod(g, 2.0) usually also asks for floor(g / 2.0)
          // a line later - rule30's inner loop does exactly that - and
          // an inlined subexpression is invisible to the CSE above
          // unless it is given a name.
          // BOUND IN THE SAME SHAPE THE PLATES USE: the product first,
          // then the floor of it. A plate asking mod(g, 2.0) usually
          // asks floor(g / 2.0) a line later - rule30's inner loop
          // does exactly that - and its own path binds `(g * 0.5)` and
          // then `floor(pb)`. Emitting `floor(g * 0.5)` as one
          // expression is the same value spelled differently, which
          // the CSE above cannot see through.
          const x = bindPrecise(args[0]);
          const h = bindPrecise(`${x} * ${rec}`);
          const f = bindPrecise(`floor(${h})`);
          return { type: "float",
                   code: `fma(-${args[1]}, ${f}, ${x})` };
        }
      }
      if (pin && c.n in PINNED_VOCAB)
        return { type: "float",
                 code: `${PINNED_VOCAB[c.n]}(${args.join(", ")})` };
      return { type: "float", code: `${c.n}(${args.join(", ")})` };
    }
    // complex arithmetic rides the shared header's own functions
    // pinned twins live in detpre; the registry header keeps its own
    if (c.t === "id" && ["cmul", "cdiv", "cinv", "csqrt"].includes(c.n)) {
      const args = n.args.map(a => {
        const v = emit(a);
        if (v.type !== "vec2") err(`${c.n} wants vec2 arguments`);
        return v.code;
      });
      return { type: "vec2",
               code: `${pin ? "det_" : ""}${c.n}(${args.join(", ")})` };
    }
    if (c.t === "id" && c.n === "v2") {
      const args = n.args.map(a => asFloat(emit(a)));
      return { type: "vec2", code: `vec2(${args.join(", ")})` };
    }
    if (c.t === "id" && c.n === "v3") {
      const args = n.args.map(a => asFloat(emit(a)));
      return { type: "vec3", code: `vec3(${args.join(", ")})` };
    }
    if (c.t === "id" && ["add3", "mul3", "mix3", "dot3", "cross3", "normalize3", "length3"].includes(c.n)) {
      // an [r, g, b] literal is a vec3 wherever a vec3 helper wants one
      const vs = n.args.map(a => {
        if (a.t === "array" && a.items.length === 3) {
          const xs = a.items.map(e2 => asFloat(emit(e2)));
          return { type: "vec3", code: `vec3(${xs.join(", ")})` };
        }
        return emit(a);
      });
      const v3s = vs.filter(v => v.type === "vec3").map(v => v.code);
      // add3 and mul3 emit inline, which is how a compound vec3
      // expression reached a `precise` local unbound - the tpms shape
      // again, and the reason colour kept diverging after position had
      // gone bit-identical. Measured on logz: every deposit landed in
      // the SAME pixel while 427 of 8,977 carried a different colour.
      if (c.n === "add3") {
        const a3 = pin ? bindPreciseV(v3s[0], "vec3") : v3s[0];
        const b3 = pin ? bindPreciseV(v3s[1], "vec3") : v3s[1];
        return { type: "vec3", code: `(${a3} + ${b3})` };
      }
      if (c.n === "mul3") {
        const a3 = pin ? bindPreciseV(v3s[0], "vec3") : v3s[0];
        const k3 = pin ? bindPrecise(asFloat(vs[1])) : asFloat(vs[1]);
        return { type: "vec3", code: `(${a3} * ${k3})` };
      }
      if (c.n === "mix3")
        return { type: "vec3", code: pin
          ? `det_mix3(${v3s[0]}, ${v3s[1]}, ${asFloat(vs[2])})`
          : `mix(${v3s[0]}, ${v3s[1]}, ${asFloat(vs[2])})` };
      if (c.n === "dot3")
        return { type: "float", code: pin
          ? `det_dot3(${v3s[0]}, ${v3s[1]})`
          : `dot(${v3s[0]}, ${v3s[1]})` };
      // These two emitted RAW under pin while dot3 and length3 beside
      // them did not, which made cross3 a silent hole - `cross` is not
      // on verify-pinned's LOOSE list, so nothing caught it - and made
      // normalize3 a word that could not be used at all, since
      // `normalize` IS on that list and any positive reaching for it
      // failed the gate. Found by an agent converting starfield, which
      // wrote its cross products componentwise to get around it.
      if (c.n === "cross3")
        return { type: "vec3", code: pin
          ? `det_cross(${v3s[0]}, ${v3s[1]})`
          : `cross(${v3s[0]}, ${v3s[1]})` };
      if (c.n === "normalize3")
        return { type: "vec3", code: pin
          ? `det_normalize3(${v3s[0]})`
          : `normalize(${v3s[0]})` };
      if (c.n === "length3")
        return { type: "float",
                 code: pin ? `det_len3v(${v3s[0]})` : `length(${v3s[0]})` };
    }
    // sum(n, k => term): the reduction loop, usable inside expressions
    if (c.t === "id" && c.n === "sum") {
      const bound = staticBoundOf(n.args[0]);
      const arrow = n.args[1];
      if (!arrow || arrow.t !== "arrow") err("sum wants (k) => term");
      const acc = fresh("acc"), kv = fresh("sk");
      put(`float ${acc} = 0.0;`);
      put(`for (int ${kv} = 0; ${kv} < ${bound.staticN}; ${kv}++) {`);
      indent += "  ";
      if (bound.runtime) put(`if (${kv} >= ${bound.runtime}) break;`);
      syms.set(arrow.params[0], { kind: "scalar", type: "int", v: kv });
      const term = emit(arrow.body);
      syms.delete(arrow.params[0]);
      put(`${acc} += ${asFloat(term)};`);
      indent = indent.slice(2);
      put(`}`);
      return { type: "float", code: acc };
    }
    const target = c.t === "member" ? emitMember(c) : null;
    if (!target) err("unsupported call");

    if (target.kind === "mathfn") {
      // Math.trunc of an int/int quotient is GLSL integer division
      if (target.name === "trunc") {
        const a = n.args[0];
        if (a && a.t === "bin" && a.op === "/") {
          const l = emit(a.l), r = emit(a.r);
          if (l.type === "int" && r.type === "int")
            return { type: "int", code: `((${l.code}) / (${r.code}))` };
        }
        err("Math.trunc is only in the subset as trunc(int / int)");
      }
      if (target.name === "hypot") {
        // Math.hypot scales its arguments to avoid overflow and is
        // therefore MORE accurate than GLSL length(), which is the
        // naive sqrt of a dot product. More accurate is wrong here:
        // the CPU evaluator exists to say what the GPU says. Measured
        // disagreement was 38% of argument pairs, worst 4.4e-16.
        err("Math.hypot has no GLSL twin: say len2(x, y) or len3(x, y, z)");
      }
      const MAP = { max: "max", min: "min", abs: "abs", pow: "pow", sqrt: "sqrt",
                    floor: "floor", sin: "sin", cos: "cos", tan: "tan",
                    asin: "asin", acos: "acos", atan2: "atan",
                    sinh: "sinh", cosh: "cosh", tanh: "tanh",
                    exp: "exp", log: "log", sign: "sign", round: "round" };
      if (!(target.name in MAP)) err(`Math.${target.name} is not in the subset`);
      // AND THE ARGUMENTS ARE BOUND, for the same reason the operands
      // of a division are. `det_sqrt((pb_115 - pb_116))` puts a
      // cancelling subtraction inside a call argument, where the only
      // precise destination is the call's RESULT - and tpms measured
      // on radeonsi that a precise destination does not protect a
      // compound expression handed to it inline. Same sites in mirage,
      // same fix, one line: never hand a compound expression onward.
      const args = n.args.map(a => {
        const c = asFloat(emit(a));
        return pin ? bindPrecise(c) : c;
      });

      // Math.round IS NOT GLSL round(), and this was wrong before any
      // determinism question arose. JS rounds a half toward +Infinity;
      // GLSL says a fraction of 0.5 "will round in a direction chosen
      // by the implementation", so `round` is both a JS/GLSL mismatch
      // and a parity hazard. floor(x + 0.5) is exactly what JS does -
      // including Math.round(-1.5) === -1 - and floor is exact
      // everywhere. Emitted unconditionally: a correctness fix does not
      // wait for a flag.
      if (target.name === "round")
        return { type: "float", code: `floor((${args[0]}) + 0.5)` };

      if (pin) {
        if (target.name in NO_DET_FORM)
          err(`Math.${target.name} has no deterministic form: ` +
              `${NO_DET_FORM[target.name]}. Emitting it would put an ` +
              `operation with spec-permitted ULP latitude in a plate ` +
              `that claims bit-identity`, n.line);
        // sin and cos route through one det_sincos per distinct
        // argument; everything else is emitted as written
        if (target.name === "sin" || target.name === "cos")
          return { type: "float",
            code: sincosOf(args[0], target.name === "sin" ? "s" : "c") };
        if (target.name in DET)
          return { type: "float", code: DET[target.name](args) };
        if (!EXACT_BUILTINS.has(target.name))
          err(`Math.${target.name} is neither pinned nor known-exact; ` +
              `the pinned set has to state which it is`, n.line);
      }
      return { type: "float", code: `${MAP[target.name]}(${args.join(", ")})` };
    }

    if (target.kind === "windowmethod") {
      if (target.name === "seat") {
        const [ax, ay, jx, jy] = n.args.map(a => emit(a));
        return { type: "vec2",
          code: `((vec2(ivec2(${asInt(ax)}, ${asInt(ay)}) - ${target.base.wc}) + vec2(${asFloat(jx)}, ${asFloat(jy)})) * ${target.base.km})` };
      }
      err(`window has no ${target.name} in the subset`);
    }

    if (target.kind === "streamfn") return emitStreamCall(target.name, n);

    if (target.kind === "vec2method" || (target.type === "vec2" && false)) {
      const base = target.base.code;
      if (target.name === "scale") {
        const k = asFloat(emit(n.args[0]));
        return { type: "vec2", code: `(${base} * ${k})` };
      }
      if (target.name === "chebyshev")
        return { type: "float", code: `max(abs(${base}.x), abs(${base}.y))` };
      if (target.name === "flipY")
        return { type: "vec2", code: `(${base} * vec2(1.0, -1.0))` };
      err(`vec2 has no ${target.name} in the subset`);
    }

    if (target.kind === "cellmethod") {
      if (target.name === "at") {
        const j = emit(n.args[0]);
        if (j.type !== "vec2") err("cell.at wants a vec2");
        return { type: "vec2", code: `(${target.base.xy} + ${j.code} * ${target.base.sc})` };
      }
      err(`cell has no ${target.name} in the subset`);
    }

    if (target.kind === "addrmethod") {
      if (target.name === "u") {
        const salt = n.args.length ? emit(n.args[0]) : { type: "int", code: "0", lit: true };
        return { type: "float", code: `u2f(hashu(${target.base.h} ^ uint(${salt.code})))` };
      }
      if (target.name === "coin") err("addr.coin outside a descend keep is not in the subset yet");
      err(`addr has no ${target.name} in the subset`);
    }
    err("unsupported call target");
  }

  // Every draw binds its value at the draw site. Returning the live
  // expression u2f(pt) instead would let two draws in one expression
  // both read the FINAL hash, while the CPU evaluator draws twice -
  // the two sides would disagree and nothing would say so. Found by a
  // conversion agent reading the emitter, 2026-08-22; no positive had
  // tripped it, which is exactly why it needed closing.
  function emitStreamCall(name, n) {
    switch (name) {
      case "u": {
        draw();
        const v = fresh("draw");
        put(`float ${v} = u2f(pt);`);
        return { type: "float", code: v };
      }
      case "centered": {
        draw();
        const v = fresh("draw");
        put(`float ${v} = u2f(pt) - 0.5;`);
        return { type: "float", code: v };
      }
      case "pick": {
        const a = n.args[0];
        let bi;
        if (a.t === "member" && a.o.t === "id" && a.o.n === P) bi = intLeverVar(a.name);
        else if (a.t === "num") bi = a.v;
        else err("pick wants a lever or an integer literal");
        draw();
        const pv = fresh("pick");
        put(`int ${pv} = min(int(u2f(pt) * float(${bi})), ${bi} - 1);`);
        return { type: "int", code: pv };
      }
      case "jitter2": {
        const vx = fresh("jx"), v = fresh("jit");
        draw(); put(`float ${vx} = u2f(pt) - 0.5;`);
        draw(); put(`vec2 ${v} = vec2(${vx}, u2f(pt) - 0.5);`);
        return { type: "vec2", code: v };
      }
      // s.vnoise(x, y, oc): value noise on a hashed lattice.
      //
      // A FIELD, NOT A SEQUENCE, and that is the whole reason it is a
      // primitive. It draws nothing from the stream: the value is a
      // function of the lattice cell and the octave alone, so two
      // points landing in the same cell see the same value however
      // many draws came before them. A plate cannot get that from
      // s.u() no matter how it is arranged.
      //
      // It is here rather than in a plate because a hand-rolled
      // lattice hash is unpinned arithmetic in a plate body, which is
      // where every cross-vendor residue in this project has lived.
      // The integer half is exact by construction - hashu and the
      // multiplies are uint, which wrap identically everywhere - and
      // the float half is written through named `precise` locals so
      // no interpolation step is a contraction candidate.
      //
      // floor is exact on every conforming stack, so the cell offset
      // x - floor(x) is written out here rather than through fract(),
      // which iris rounds toward zero. Same reason det_fract exists.
      // The locals are declared plain. `precise` is added by the
      // post-process under `pin`, which is how every other
      // primitive here does it - emitting it directly put
      // `precise` into the UNPINNED variant too, and that variant
      // feeds a #version 330 vertex shader where `precise` is a
      // syntax error. The plate compiled as compute and failed as
      // a preview, which is the one path a census never exercises.
      case "vnoise": {
        if (n.args.length !== 3) err("s.vnoise wants (x, y, octave)");
        const X = asFloat(emit(n.args[0]));
        const Y = asFloat(emit(n.args[1]));
        const OC = asInt(emit(n.args[2]));
        const g = fresh("vn");
        // BIND THE ARGUMENTS ONCE. Each is used twice below - floor,
        // then the subtraction - and emitting the expression twice
        // would evaluate it twice. For a pure expression that is only
        // wasteful; for `s.vnoise(s.u(), ...)` it would advance the
        // stream twice and silently change the picture.
        put(`float ${g}_x = ${X};`);
        put(`float ${g}_y = ${Y};`);
        put(`float ${g}_ix = floor(${g}_x);`);
        put(`float ${g}_iy = floor(${g}_y);`);
        put(`float ${g}_fx = ${g}_x - ${g}_ix;`);
        put(`float ${g}_fy = ${g}_y - ${g}_iy;`);
        put(`float ${g}_wx = (${g}_fx * ${g}_fx) * ` +
            `(3.0 - (2.0 * ${g}_fx));`);
        put(`float ${g}_wy = (${g}_fy * ${g}_fy) * ` +
            `(3.0 - (2.0 * ${g}_fy));`);
        put(`uint ${g}_bx = uint(int(${g}_ix) & 1023);`);
        put(`uint ${g}_by = uint(int(${g}_iy) & 1023);`);
        put(`uint ${g}_oc = uint(${OC});`);
        const corner = (dx, dy) =>
          `u2f(hashu(${g}_oc ^ hashu((${g}_bx + ${dx}u) * 374761393u + ` +
          `(${g}_by + ${dy}u) * 668265263u)))`;
        put(`float ${g}_00 = ${corner(0, 0)};`);
        put(`float ${g}_10 = ${corner(1, 0)};`);
        put(`float ${g}_01 = ${corner(0, 1)};`);
        put(`float ${g}_11 = ${corner(1, 1)};`);
        // the lerps as a + (b - a) * w, matching the evaluator term
        // for term. mix() is not used: its association is free and the
        // CPU side has to agree with this bit for bit.
        put(`float ${g}_a = ${g}_00 + ` +
            `((${g}_10 - ${g}_00) * ${g}_wx);`);
        put(`float ${g}_b = ${g}_01 + ` +
            `((${g}_11 - ${g}_01) * ${g}_wx);`);
        put(`float ${g}_v = ` +
            `(${g}_a + ((${g}_b - ${g}_a) * ${g}_wy)) - 0.5;`);
        return { type: "float", code: `${g}_v` };
      }
      case "depth": {
        const a = n.args[0];
        if (!(a.t === "member" && a.o.t === "id" && a.o.n === P)) err("s.depth wants a lever for its maximum");
        const maxVar = intLeverVar(a.name);
        const staticMax = pos.levers[leverIx[a.name]].max;
        let bias = "1.0";
        if (n.args[1]) {
          if (n.args[1].t !== "object") err("s.depth options must be a literal object");
          for (const pr of n.args[1].props) {
            if (pr.key !== "bias" || pr.value.t !== "num") err("s.depth understands { bias: <number> } only");
            bias = num(pr.value.v, "float");
          }
        }
        draw();
        const dv = fresh("depth");
        // THIS pow DECIDES AN INTEGER. A last-place difference in it
        // flips the depth at a boundary, so the walk does not go a
        // slightly different way - it goes a different way.
        //
        // AND AT bias 1.0 THERE IS NO pow TO TAKE. det_pow(x, y) is
        // det_exp2(y * det_log2(x)), so at y = 1 it is a log/exp round
        // trip - correctly rounded at each step and still not x:
        // measured, it moves 16.27% of inputs by up to 10 ULP. The CPU
        // evaluator meanwhile computes Math.pow(x, 1.0), which IS
        // exactly x, so the two backends disagreed about the depth of
        // roughly one point in a million and that point then walked a
        // different path.
        //
        // This never broke GPU-to-GPU parity - det_pow is bit-identical
        // on every stack measured - which is why no census ever caught
        // it. It broke the property everything else rests on: that the
        // evaluator says what the shader will say. Found by an agent
        // converting breakdown, which noticed the emitted GLSL had a
        // pow where the plate had a bare multiply.
        //
        // 1.0 is the DEFAULT bias, so this is the common path, not an
        // edge case.
        const unbiased = bias === "1.0" || Number(bias) === 1;
        const draw0 = "u2f(pt)";
        const biased = unbiased ? draw0
          : `${pin ? "det_pow" : "pow"}(${draw0}, ${bias})`;
        put(`int ${dv} = int(${biased} * float(${maxVar}));`);
        return { type: "int", code: dv, staticMax };
      }
      case "descend": err("s.descend must be bound directly: const x = s.descend(...)");
      case "deposit": err("s.deposit is only valid as the returned expression");
      default: err(`s.${name} is not in the subset`);
    }
  }

  // ---- descend as a statement-level special form ----
  function emitDescend(name, call) {
    const [domA, levA, cfgA] = call.args;
    const dom = emitCall(domA.t === "call" ? domA : err("descend wants grid2(...) first"));
    if (dom.kind !== "grid2") err("descend wants a grid2 domain");
    const lev = emit(levA);
    if (lev.type !== "int") err("descend levels must be an int");
    const staticMax = lev.staticMax !== undefined ? lev.staticMax
      : (syms.get(levA.n || "") || {}).staticMax;
    if (staticMax === undefined) err("descend cannot bound its loop: levels must come from s.depth or carry a lever maximum");
    if (cfgA.t !== "object") err("descend wants a config object");
    let tries = "1", childArrow = null, keepArrow = null;
    for (const pr of cfgA.props) {
      if (pr.key === "tries") tries = pr.value.v ?? err("tries must be a literal");
      else if (pr.key === "child") childArrow = pr.value;
      else if (pr.key === "keep") keepArrow = pr.value;
      else err(`descend config has no ${pr.key}`);
    }
    if (!childArrow || childArrow.t !== "arrow") err("descend wants child: (a) => a.child(ex, ey)");
    if (!keepArrow || keepArrow.t !== "arrow") err("descend wants keep: (c) => <bool over c>");
    const cb = childArrow.body;
    const okShape = cb.t === "call" && cb.callee.t === "member" && cb.callee.name === "child"
      && cb.callee.o.t === "id" && cb.callee.o.n === childArrow.params[0];
    if (!okShape) err("the child arrow must be (a) => a.child(ex, ey) in this version");

    const xy = fresh("dc_xy"), sc = fresh("dc_sc"), adr = fresh("dc_adr"), rc = fresh("dc_n");
    const bI = dom.b;
    const wantTrail = pos.walk.toString().includes(".trail");
    const tr = wantTrail ? fresh("dc_tr") : null;
    put(`vec2 ${xy} = vec2(0.0);`);
    put(`float ${sc} = 1.0;`);
    put(`uint ${adr} = ${(pos.chains.root >>> 0)}u;`);
    if (tr) put(`uint ${tr} = ${(pos.chains.root >>> 0)}u;`);
    put(`int ${rc} = 0;`);
    const dVar = fresh("dlim");
    put(`int ${dVar} = ${lev.code};`);
    put(`for (int l = 0; l < ${staticMax}; l++) {`);
    indent += "  ";
    put(`if (l >= ${dVar}) break;`);
    put(`bool moved = false;`);
    put(`for (int k = 0; k < ${tries}; k++) {`);
    indent += "  ";
    const ex = emit(cb.args[0]);
    const cxV = fresh("cx");
    put(`int ${cxV} = ${asInt(ex)};`);
    const ey = emit(cb.args[1]);
    const cyV = fresh("cy");
    put(`int ${cyV} = ${asInt(ey)};`);
    const cand = fresh("cand");
    // child derivation follows the positive's chains: a pinned plate
    // convention (small additive key) or the canonical spread
    if (pos.chains.childKey) {
      const [mu, ad] = pos.chains.childKey;
      put(`uint ${cand} = hashu(${adr} ^ uint(${cyV} * ${mu} + ${cxV} + ${ad}));`);
    } else {
      put(`uint ${cand} = hashu(${adr} ^ (uint(${cyV} * 1031 + ${cxV} + 1) * 2654435761u));`);
    }
    // keep body with the candidate bound
    const cName = keepArrow.params[0];
    syms.set(cName, { kind: "candidate", h: cand });
    const keep = emitKeep(keepArrow.body, cand);
    syms.delete(cName);
    put(`if (${keep}) {`);
    indent += "  ";
    // The cell step addresses a LATTICE: a last-place difference here
    // does not move a sample slightly, it moves it into a different
    // cell. Both divisions go through the exact form under pinning.
    if (pin) {
      put(`${xy} += det_div2(vec2(float(${cxV}), float(${cyV})) * ${sc}, float(${bI}))`);
      put(`     - vec2(${sc} * 0.5 * (1.0 - det_recip(float(${bI}))));`);
    } else {
      put(`${xy} += vec2(float(${cxV}), float(${cyV})) * ${sc} / float(${bI})`);
      put(`     - vec2(${sc} * 0.5 * (1.0 - 1.0 / float(${bI})));`);
    }
    // the last float division the emitter writes by hand. `int`
    // divisions elsewhere are exact and stay as they are.
    put(pin ? `${sc} = det_div(${sc}, float(${bI}));`
            : `${sc} /= float(${bI});`);
    put(`${adr} = ${cand};`);
    if (tr) put(`${tr} = hashu(${tr} ^ ${cand});`);
    put(`${rc} += 1;`);
    put(`moved = true;`);
    put(`break;`);
    indent = indent.slice(2);
    put(`}`);
    indent = indent.slice(2);
    put(`}`);
    put(`if (!moved) break;`);
    indent = indent.slice(2);
    put(`}`);
    syms.set(name, { kind: "descend", xy, sc, adr, trail: tr, reached: rc, b: bI });
  }

  // keep bodies: boolean expressions over the candidate
  function emitKeep(n, cand) {
    if (n.t === "call" && n.callee.t === "member") {
      const o = n.callee.o;
      const sym = o.t === "id" ? syms.get(o.n) : null;
      if (sym && sym.kind === "candidate") {
        if (n.callee.name === "coin") {
          const pE = emit(n.args[0]);
          if (pos.chains.coin === "value")
            return `(u2f(${cand}) < ${asFloat(pE)})`;
          const salt = n.args[1] ? emit(n.args[1]).code : "0xC01F";
          return `(u2f(hashu(${cand} ^ uint(${salt}))) < ${asFloat(pE)})`;
        }
        if (n.callee.name === "u") {
          const salt = n.args[0] ? emit(n.args[0]).code : "0";
          return `u2f(hashu(${cand} ^ uint(${salt})))`;
        }
      }
    }
    if (n.t === "bin") {
      const l = emitKeep(n.l, cand), r = emitKeep(n.r, cand);
      return `(${l} ${n.op} ${r})`;
    }
    if (n.t === "paren") return `(${emitKeep(n.e, cand)})`;
    const v = emit(n);
    return v.code;
  }

  // ---- declaration special forms ----
  // levels(p, P.depth): the smallest p^L reaching 2^DEPTH
  function emitLevels(name, call) {
    const pE = emit(call.args[0]);
    const dA = call.args[1];
    if (!(dA.t === "member" && dA.o.t === "id" && dA.o.n === P)) err("levels wants a DEPTH lever second");
    const dv = intLeverVar(dA.name);
    const L = fresh("lv_L"), R = fresh("lv_R");
    put(`int ${L} = 0;`);
    put(`int ${R} = 1;`);
    put(`{`);
    indent += "  ";
    const tg = fresh("lv_t"), pv = fresh("lv_p");
    put(`int ${tg} = 1 << ${dv};`);
    put(`int ${pv} = ${asInt(pE)};`);
    put(`for (int i = 0; i < 24; i++) {`);
    indent += "  ";
    put(`if (${R} >= ${tg}) break;`);
    put(`${R} *= ${pv};`);
    put(`${L} += 1;`);
    indent = indent.slice(2);
    put(`}`);
    indent = indent.slice(2);
    put(`}`);
    syms.set(name, { kind: "levels", L, R });
  }

  // s.window({span, heart, magnify, unit}): the loupe, integers first
  function emitWindow(name, call) {
    const obj = call.args[0];
    if (!obj || obj.t !== "object") err("s.window wants a config object");
    const cfg = {};
    for (const pr of obj.props) cfg[pr.key] = pr.value;
    if (!cfg.span || cfg.span.t !== "array" || cfg.span.items.length !== 2) err("window wants span: [x, y]");
    if (!cfg.heart || cfg.heart.t !== "array" || cfg.heart.items.length !== 2) err("window wants heart: [x, y]");
    if (!(cfg.magnify && cfg.magnify.t === "member" && cfg.magnify.o.t === "id" && cfg.magnify.o.n === P))
      err("window wants magnify: <lever>");
    if (!cfg.unit) err("window wants unit: <world per lattice unit>");
    const sp = cfg.span.items.map(e => asInt(emit(e)));
    const mg = fresh("mg");
    put(`float ${mg} = ${pin ? "det_exp2" : "exp2"}(P[${leverIx[cfg.magnify.name]}]);`);
    const ctr = fresh("ctr");
    put(`ivec2 ${ctr} = ivec2((${sp[0]}) / 2, (${sp[1]}) / 2);`);
    const hx = asInt(emit(cfg.heart.items[0])), hy = asInt(emit(cfg.heart.items[1]));
    const hrt = fresh("hrt");
    put(`ivec2 ${hrt} = ivec2(${hx}, ${hy});`);
    const wc = fresh("wc");
    put(`ivec2 ${wc} = ${ctr} + ivec2(vec2(${hrt} - ${ctr}) * (1.0 - ${pin ? `det_recip(${mg})` : `1.0 / ${mg}`}));`);
    const hw = fresh("hw");
    put(`ivec2 ${hw} = ivec2(${pin ? `det_div2(vec2(${ctr}), ${mg})` : `vec2(${ctr}) / ${mg}`});`);
    const win = fresh("win");
    put(`ivec4 ${win} = ivec4(${wc} - ${hw}, ${wc} + ${hw});`);
    const km = fresh("km");
    put(`float ${km} = (${asFloat(emit(cfg.unit))}) * ${mg};`);
    syms.set(name, { kind: "window", win, wc, km });
  }

  // the weighted descent on the digit-triangle theorem domain
  function emitWDescend(name, call) {
    const [domA, levA, cfgA] = call.args;
    const pE = emit(domA.args[0]);
    const RE = emit(domA.args[1]);
    if (!cfgA || cfgA.t !== "object") err("descend wants { within: <window> }");
    let wSym = null;
    for (const pr of cfgA.props) {
      if (pr.key !== "within") err(`digit descend config has no ${pr.key}`);
      const t = pr.value;
      if (!(t.t === "id" && syms.get(t.n) && syms.get(t.n).kind === "window")) err("within wants a window");
      wSym = syms.get(t.n);
    }
    if (!wSym) err("digit descend wants within: <window>");
    const LE = emit(levA);
    if (LE.type !== "int") err("descend levels must be an int");
    const N = fresh("wd");
    const nV = `${N}_n`, kV = `${N}_k`, sV = `${N}_s`, vV = `${N}_v`, linV = `${N}_lin`, deadV = `${N}_dead`;
    const pV = `${N}_p`, RV = `${N}_R`, LV = `${N}_L`;
    put(`int ${pV} = ${asInt(pE)};`);
    put(`int ${RV} = ${asInt(RE)};`);
    put(`int ${LV} = ${LE.code};`);
    put(`int ${nV} = 0;`);
    put(`int ${kV} = 0;`);
    put(`int ${sV} = ${RV} / ${pV};`);
    put(`int ${vV} = 1;`);
    put(`uint ${linV} = 2166136261u;`);
    put(`bool ${deadV} = false;`);
    put(`for (int lev = 0; lev < 24; lev++) {`);
    indent += "  ";
    put(`if (lev >= ${LV}) break;`);
    put(`float wts[28];`);
    put(`float wsum = 0.0;`);
    put(`for (int a = 0; a < 7; a++) {`);
    indent += "  ";
    put(`if (a >= ${pV}) break;`);
    put(`int ny0 = 2 * (${nV} + a * ${sV});`);
    put(`int ny1 = ny0 + 2 * ${sV};`);
    put(`int oy = min(ny1, ${wSym.win}.w) - max(ny0, ${wSym.win}.y);`);
    put(`for (int b = 0; b < 7; b++) {`);
    indent += "  ";
    put(`if (b > a) break;`);
    put(`int sl = (a * (a + 1)) / 2 + b;`);
    put(`wts[sl] = 0.0;`);
    put(`if (oy > 0) {`);
    indent += "  ";
    put(`int xlo = 2 * (${kV} + b * ${sV}) + (${RV} - 1) - (${nV} + (a + 1) * ${sV} - 1);`);
    put(`int xhi = 2 * (${kV} + b * ${sV} + ${sV} - 1) + (${RV} - 1) - (${nV} + a * ${sV});`);
    put(`int ox = min(xhi + 1, ${wSym.win}.z) - max(xlo, ${wSym.win}.x);`);
    put(`if (ox > 0) wts[sl] = float(oy) * float(ox);`);
    indent = indent.slice(2);
    put(`}`);
    put(`wsum += wts[sl];`);
    indent = indent.slice(2);
    put(`}`);
    indent = indent.slice(2);
    put(`}`);
    put(`if (wsum <= 0.0) { ${deadV} = true; break; }`);
    put(`pt = hashu(pt);`);
    put(`float pick = u2f(pt) * wsum;`);
    put(`float run = 0.0;`);
    put(`int ca = 0;`);
    put(`int cb = 0;`);
    put(`int cc = 1;`);
    put(`for (int a = 0; a < 7; a++) {`);
    indent += "  ";
    put(`if (a >= ${pV}) break;`);
    put(`for (int b = 0; b < 7; b++) {`);
    indent += "  ";
    put(`if (b > a) break;`);
    put(`int sl = (a * (a + 1)) / 2 + b;`);
    put(`run += wts[sl];`);
    put(`if (pick < run && pick >= run - wts[sl] && wts[sl] > 0.0) {`);
    indent += "  ";
    put(`ca = a;`);
    put(`cb = b;`);
    put(`cc = (sl == 0) ? 1 : (sl == 1) ? 1 : (sl == 2) ? 1`);
    put(`   : (sl == 3) ? 1 : (sl == 4) ? 2 : (sl == 5) ? 1`);
    put(`   : (sl == 6) ? 1 : (sl == 7) ? 3 : (sl == 8) ? 3 : (sl == 9) ? 1`);
    put(`   : (sl == 10) ? 1 : (sl == 11) ? 4 : (sl == 12) ? 6 : (sl == 13) ? 4 : (sl == 14) ? 1`);
    put(`   : (sl == 15) ? 1 : (sl == 16) ? 5 : (sl == 17) ? 10 : (sl == 18) ? 10 : (sl == 19) ? 5 : (sl == 20) ? 1`);
    put(`   : (sl == 21) ? 1 : (sl == 22) ? 6 : (sl == 23) ? 15 : (sl == 24) ? 20 : (sl == 25) ? 15 : (sl == 26) ? 6 : 1;`);
    indent = indent.slice(2);
    put(`}`);
    indent = indent.slice(2);
    put(`}`);
    indent = indent.slice(2);
    put(`}`);
    put(`${vV} = (${vV} * cc) % ${pV};`);
    put(`${nV} += ca * ${sV};`);
    put(`${kV} += cb * ${sV};`);
    put(`${linV} = hashu(${linV} ^ (uint(ca * 7 + cb) + 1u) * 2654435761u);`);
    put(`${sV} /= ${pV};`);
    indent = indent.slice(2);
    put(`}`);
    syms.set(name, { kind: "wdescend", n: nV, k: kV, v: vV, lin: linV, dead: deadV });
  }

  // s.orbit(n, {a: init...}, (st, k) => ({a: next...}), {until})
  // iterate a named-record state; simultaneous update via temps
  function emitOrbit(name, call) {
    const bound = staticBoundOf(call.args[0]);
    const initObj = call.args[1];
    const stepArrow = call.args[2];
    const opts = call.args[3];
    if (!initObj || initObj.t !== "object") err("orbit wants an initial state object");
    if (!stepArrow || stepArrow.t !== "arrow") err("orbit wants (st, k) => ({...})");
    let untilArrow = null;
    if (opts) {
      if (opts.t !== "object") err("orbit options must be an object literal");
      for (const pr of opts.props) {
        if (pr.key === "until") untilArrow = pr.value;
        else err(`orbit option ${pr.key} is not in the subset`);
      }
    }
    const N = fresh("ob");
    const fields = {};
    for (const pr of initObj.props) {
      const v = emit(pr.value);
      const fv = `${N}_${pr.key}`;
      put(`float ${fv} = ${asFloat(v)};`);
      fields[pr.key] = fv;
    }
    const cnt = `${N}_count`, esc = `${N}_esc`;
    put(`int ${cnt} = 0;`);
    put(`bool ${esc} = false;`);
    const kv = fresh("ok");
    put(`for (int ${kv} = 0; ${kv} < ${bound.staticN}; ${kv}++) {`);
    indent += "  ";
    if (bound.runtime) put(`if (${kv} >= ${bound.runtime}) break;`);
    if (untilArrow) {
      if (untilArrow.t !== "arrow") err("until wants (st) => condition");
      syms.set(untilArrow.params[0], { kind: "orbitstate", fields });
      const cond = emit(untilArrow.body);
      syms.delete(untilArrow.params[0]);
      put(`if (${cond.code}) { ${esc} = true; break; }`);
    }
    syms.set(stepArrow.params[0], { kind: "orbitstate", fields });
    if (stepArrow.params[1]) syms.set(stepArrow.params[1], { kind: "scalar", type: "int", v: kv });
    // A BLOCK BODY, so the step can declare an intermediate.
    //
    // The step used to have to BE an object literal, and that single
    // restriction is what made four plates unauthorable: cascade,
    // rule30, rulespace and universal nest loops two and three deep,
    // and a nested sum() or orbit has to be DECLARED before its result
    // can appear in a field. Everything needed to allow it was already
    // here - statements emit into the enclosing indent, and the
    // writeback below already sequences correctly - so this is a body
    // shape being accepted, not a new loop being built.
    //
    // Names declared in the block are scoped to it. They are emitted
    // inside the for, so a name surviving into the enclosing scope
    // would refer to a GLSL local that is out of scope there - a
    // compile error at best, and at worst a collision with a later
    // fresh() name.
    let stepObj;
    const declared = [];
    if (stepArrow.block) {
      const before = new Set(syms.keys());
      const last = stepArrow.block[stepArrow.block.length - 1];
      if (!last || last.t !== "return")
        err("an orbit step with a block body must end in `return { ... };`");
      for (const st of stepArrow.block) {
        if (st === last) break;
        if (st.t === "return")
          err("an orbit step may return only once, and only at the end");
        stmt(st);
      }
      const re = last.e;
      stepObj = re.t === "object" ? re
              : (re.t === "paren" && re.e.t === "object") ? re.e
              : err("an orbit step must return an object literal");
      for (const k of syms.keys()) if (!before.has(k)) declared.push(k);
    } else {
      const body = stepArrow.body;
      stepObj = body.t === "object" ? body
              : (body.t === "paren" && body.e.t === "object") ? body.e
              : err("orbit step must return an object literal: (st, k) => ({ ... })");
    }
    const temps = [];
    for (const pr of stepObj.props) {
      if (!(pr.key in fields)) err(`orbit step writes unknown field ${pr.key}`);
      const v = emit(pr.value);
      const tv = fresh(`${N}_t`);
      put(`float ${tv} = ${asFloat(v)};`);
      temps.push([fields[pr.key], tv]);
    }
    syms.delete(stepArrow.params[0]);
    if (stepArrow.params[1]) syms.delete(stepArrow.params[1]);
    for (const k of declared) syms.delete(k);
    for (const [fv, tv] of temps) put(`${fv} = ${tv};`);
    put(`${cnt} += 1;`);
    indent = indent.slice(2);
    put(`}`);
    syms.set(name, { kind: "orbit", fields, count: cnt, escaped: esc });
  }

  // ---- statements ----
  function declOne(name, e, line) {
    if (e.t === "call" && e.callee.t === "id" && e.callee.n === "levels") {
      emitLevels(name, e);
      return;
    }
    if (e.t === "call" && e.callee.t === "member" &&
        e.callee.o.t === "id" && e.callee.o.n === S && e.callee.name === "window") {
      emitWindow(name, e);
      return;
    }
    if (e.t === "call" && e.callee.t === "member" &&
        e.callee.o.t === "id" && e.callee.o.n === S && e.callee.name === "orbit") {
      emitOrbit(name, e);
      return;
    }
    // descend is a special form; the domain picks the shape
    if (e.t === "call" && e.callee.t === "member" &&
        e.callee.o.t === "id" && e.callee.o.n === S && e.callee.name === "descend") {
      const dom = e.args[0];
      if (dom && dom.t === "call" && dom.callee.t === "id" && dom.callee.n === "digitTriangle") {
        emitWDescend(name, e);
        return;
      }
      emitDescend(name, e);
      return;
    }
    const v = emit(e);
    if (v.type === "vec2") {
      const nm = fresh(name);
      put(`vec2 ${nm} = ${v.code};`);
      syms.set(name, { kind: "vec2", v: nm });
    } else if (v.type === "int" || v.type === "float" || v.type === "bool" || v.type === "vec3") {
      const nm = fresh(name);
      put(`${v.type} ${nm} = ${v.code};`);
      const rec = { kind: "scalar", type: v.type, v: nm };
      if (v.staticMax !== undefined) rec.staticMax = v.staticMax;
      syms.set(name, rec);
    } else err(`cannot bind ${name}: unhandled value`, line);
  }
  function stmt(st) {
    if (st.t === "decl") {
      for (const d of st.decls) declOne(d.name, d.e, st.line);
      return;
    }
    if (st.t === "assign") {
      const sym = syms.get(st.name);
      if (!sym) err(`assignment to unknown ${st.name}`, st.line);
      const v = emit(st.e);
      const op = st.op === "=" ? "=" : st.op;
      put(`${sym.v} ${op} ${v.code};`);
      return;
    }
    if (st.t === "if") {
      const c = emit(st.c);
      put(`if (${c.code}) {`);
      indent += "  ";
      st.then.forEach(stmt);
      indent = indent.slice(2);
      if (st.els) {
        put(`} else {`);
        indent += "  ";
        st.els.forEach(stmt);
        indent = indent.slice(2);
      }
      put(`}`);
      return;
    }
    if (st.t === "return") {
      const e = st.e;
      const isDecline = e.t === "call" && e.callee.t === "member" &&
        e.callee.o.t === "id" && e.callee.o.n === S && e.callee.name === "decline";
      if (isDecline) {
        put(`col = vec3(0.0);`);
        put(`return vec3(0.0, -20000.0, 0.0);`);
        return;
      }
      const isDeposit = e.t === "call" && e.callee.t === "member" &&
        e.callee.o.t === "id" && e.callee.o.n === S && e.callee.name === "deposit";
      if (!isDeposit) err("the walk must end with return s.deposit({...}) or decline", st.line);
      const obj = e.args[0];
      if (!obj || obj.t !== "object") err("s.deposit wants an object literal");
      const parts = {};
      for (const pr of obj.props) {
        if (pr.key === "xyz") {
          if (pr.value.t !== "array" || pr.value.items.length !== 3) err("xyz wants [x, y, z]");
          parts.xyz = pr.value.items.map(e => {
            const v = emit(e);
            const nm = fresh("dep_c");
            put(`float ${nm} = ${asFloat(v)};`);
            return nm;
          });
          continue;
        }
        if (pr.key === "col" && pr.value.t === "array" && pr.value.items.length === 3) {
          const xs = pr.value.items.map(e2 => asFloat(emit(e2)));
          const nm2 = fresh("dep_col");
          put(`vec3 ${nm2} = vec3(${xs.join(", ")});`);
          parts.col = nm2;
          continue;
        }
        const v = emit(pr.value);
        const nm = fresh("dep_" + pr.key);
        if (pr.key === "xy") { put(`vec2 ${nm} = ${v.code};`); parts.xy = nm; }
        else if (pr.key === "col") { put(`vec3 ${nm} = ${v.code};`); parts.col = nm; }
        else { put(`float ${nm} = ${asFloat(v)};`); parts[pr.key] = nm; }
      }
      if (!(parts.xy || parts.xyz) || !parts.col) err("s.deposit wants a seat (xy or xyz) and col");
      const glow = parts.glow ? ` * ${parts.glow}` : "";
      put(`col = ${parts.col}${glow};`);
      if (parts.xyz) put(`return vec3(${parts.xyz[0]}, ${parts.xyz[1]}, ${parts.xyz[2]});`);
      else put(`return vec3(${parts.xy}.x, ${parts.xy}.y, ${parts.z || "0.0"});`);
      return;
    }
    err("unhandled statement");
  }

  ast.body.forEach(stmt);

  // Splice the hoisted sincos in at each argument's definition.
  // Descending, so an earlier index is still an earlier index after a
  // later one has grown the array.
  hoists.sort((a, b) => b.at - a.at);
  for (const h of hoists)
    lines.splice(h.at + 1, 0, ...h.text.map(l => h.ind + l));

  // ---- assemble the shape function ----
  const salt = ((fnv1a(pos.id) | 1) >>> 0);
  const head = [];
  if (helpers.has("stain")) {
    head.push(`vec3 stain_${pos.id}(vec3 c, float a){`);
    // one det_sincos, not one each: det_cos(a) and det_sin(a) both
    // compute the pair and discard half, and this asks for both.
    // Qualified here rather than left to the post-pass, which skips a
    // comma list - and unqualified is the thing verify-orbit-block
    // exists to refuse.
    if (pin) {
      head.push(`  precise float sn, cs;`);
      head.push(`  det_sincos(a, sn, cs);`);
    } else {
      head.push(`  float cs = cos(a), sn = sin(a);`);
    }
    head.push(`  vec3 k = vec3(0.57735027);`);
    head.push(pin
      ? `  return det_rodrigues(c, k, cs, sn);`
      : `  return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);`);
    head.push(`}`);
  }
  head.push(`vec3 shape_${pos.id}(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){`);
  head.push(`  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))`);
  head.push(`                       ^ hashu(floatBitsToUint(q.y) * ${salt}u));`);
  head.push(`  pt = hashu(pt ^ floatBitsToUint(rnd.x));`);
  for (const nm of usedIntLevers)
    head.push(`  int li_${nm} = int(P[${leverIx[nm]}] + 0.5);`);
  let glsl = head.join("\n") + "\n" + lines.join("\n") + "\n}";

  // `precise` ON THE WHOLE CHAIN, which the pinned set is worth
  // nothing without.
  //
  // Phase 2 shipped three of its four items and this was the missing
  // one, which Phase 3 then measured: pinning every builtin moved the
  // worst cross-vendor pair from 8 of 50 bit-identical to 10 of 50.
  // Nowhere near the bar, and for a reason that has nothing to do with
  // builtins. An unqualified `a * b + c` in the walk is free to become
  // an fma, and whether it does was measured on 2026-08-22 to depend
  // on whether `a * b` is wanted ELSEWHERE in the same shader -
  // NVIDIA always fuses, llvmpipe never does, radeonsi and iris fuse
  // until common subexpression elimination gives the product a second
  // consumer. No amount of det_ functions fixes that; only the
  // qualifier does.
  //
  // Applied to the assembled text rather than at fourteen separate
  // declaration sites, because one transform with one rule is easier
  // to check than fourteen that must agree. It qualifies float, vec2
  // and vec3 locals; ints and uints carry exact arithmetic already and
  // GLSL does not admit the qualifier on them.
  //
  // NOTE FOR PHASE 5: `precise` needs GLSL 4.20, and PrettyCloud is
  // WebGL2 (GLSL ES 3.00), which has no such qualifier. The darkroom
  // already solves this by ADDING precise during the bake for exactly
  // this reason. So pinned-with-precise is the print path's text, not
  // the browser's, and which one an emitted plate ships as is a
  // deployment question rather than a numerical one.
  if (pin) {
    glsl = glsl.replace(
      /^(\s+)(float|vec2|vec3)(\s+[A-Za-z_][A-Za-z0-9_]*\s*(?:\[[0-9]+\])?\s*(?:=|;))/gm,
      (m, indent, ty, rest) => `${indent}precise ${ty}${rest}`);
  }
  return glsl;
}

// a registry-contract plate file wrapping the emitted GLSL
export function emitPlate(pos, opts = {}) {
  const glsl = emitWalk(pos, opts);
  const meta = pos.meta;
  const plate = `"use strict";
/* GENERATED by atlas-engine from positives/${pos.id.replace(/_pos$/, "")}.pos.mjs - do not edit */
Atlas.registerPlate({
  id: ${JSON.stringify(pos.id)},
  name: ${JSON.stringify(pos.id + " (emitted)")},
  roman: "E",
  accent: ${JSON.stringify(meta.accent || "#8fd0c0")},
  tex: "", plain: "emitted by atlas-engine",
  caption: "Emitted by atlas-engine; the positive is the source.",
  cam: ${JSON.stringify(meta.cam || { dist: 3, pitch: 0.3, tgtY: 0, rot: 0 })},
  gain: ${JSON.stringify(meta.gain === undefined ? 0.5 : meta.gain)},
  params: ${JSON.stringify(pos.levers, null, 2)},
  glsl: \`
${glsl}\`
});
`;
  return { glsl, plate };
}
