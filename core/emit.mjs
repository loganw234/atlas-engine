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

// ---------------------------------------------------------------- lex
const PUNCT = ["=>", "<=", ">=", "==", "!=", "&&", "||",
  "(", ")", "{", "}", "[", "]", ",", ";", ":", ".", "?",
  "+", "-", "*", "/", "<", ">", "=", "!"];

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

  // (P, s) => { ... }
  eat("(");
  const pName = eat("id").v; eat(",");
  const sName = eat("id").v;
  eat(")"); eat("=>"); eat("{");
  const body = [];
  while (peek().t !== "}") body.push(statement());
  eat("}");
  return { pName, sName, body };

  function statement() {
    const t = peek();
    if (t.t === "id" && (t.v === "const" || t.v === "let")) {
      next();
      const name = eat("id").v;
      eat("=");
      const e = expr();
      eat(";");
      return { t: "decl", mut: t.v === "let", name, e, line: t.line };
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
      eat("=");
      const e = expr();
      eat(";");
      return { t: "assign", name, e, line: t.line };
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
  function andE() { let l = cmpE(); while (peek().t === "&&") { next(); l = { t: "bin", op: "&&", l, r: cmpE() }; } return l; }
  function cmpE() {
    let l = addE();
    while (["<", ">", "<=", ">=", "==", "!="].includes(peek().t)) {
      const op = next().t;
      l = { t: "bin", op, l, r: addE() };
    }
    return l;
  }
  function addE() { let l = mulE(); while (peek().t === "+" || peek().t === "-") { const op = next().t; l = { t: "bin", op, l, r: mulE() }; } return l; }
  function mulE() { let l = unE(); while (peek().t === "*" || peek().t === "/") { const op = next().t; l = { t: "bin", op, l, r: unE() }; } return l; }
  function unE() {
    if (peek().t === "-") { next(); return { t: "un", op: "-", e: unE() }; }
    if (peek().t === "!") { next(); return { t: "un", op: "!", e: unE() }; }
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
      if (isArrow) return { t: "arrow", params, body: expr() };
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
export function emitWalk(pos) {
  const src = pos.walk.toString();
  const ast = parse(src);
  const P = ast.pName, S = ast.sName;

  const lines = [];
  let indent = "  ";
  const put = (s) => lines.push(indent + s);
  const err = (m, line) => { throw new Error(`emit: ${m}${line ? ` (line ${line})` : ""}`); };

  let vn = 0;
  const fresh = (base) => `${base}_${++vn}`;

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
          if (l.type === r.type) return { type: "bool", code: `(${l.code} ${n.op} ${r.code})` };
          return { type: "bool", code: `(${asFloat(l)} ${n.op} ${asFloat(r)})` };
        }
        // arithmetic
        if (l.type === "int" && r.type === "int" && (n.op === "+" || n.op === "-" || n.op === "*"))
          return { type: "int", code: `(${l.code} ${n.op} ${r.code})` };
        return { type: "float", code: `(${asFloat(l)} ${n.op} ${asFloat(r)})` };
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
      if (n.name === "reached") return { type: "int", code: o.sym.reached };
      err(`descend result has no ${n.name}`);
    }
    if (o.kind === "cell") {
      if (n.name === "scale") return { type: "float", code: o.sc };
      return { kind: "cellmethod", base: o, name: n.name };
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
      return { type: "vec3", code: `pal(${asFloat(t)}, ${vecs.join(", ")})` };
    }
    // grid2(b)
    if (c.t === "id" && c.n === "grid2") {
      const a = n.args[0];
      if (a.t === "member" && a.o.t === "id" && a.o.n === P) return { kind: "grid2", b: intLeverVar(a.name) };
      if (a.t === "num") return { kind: "grid2", b: a.v };
      err("grid2 wants a lever or an integer literal");
    }
    const target = c.t === "member" ? emitMember(c) : null;
    if (!target) err("unsupported call");

    if (target.kind === "mathfn") {
      const MAP = { max: "max", min: "min", abs: "abs", pow: "pow", sqrt: "sqrt", floor: "floor" };
      if (!(target.name in MAP)) err(`Math.${target.name} is not in the subset`);
      const args = n.args.map(a => asFloat(emit(a)));
      return { type: "float", code: `${MAP[target.name]}(${args.join(", ")})` };
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

  function emitStreamCall(name, n) {
    switch (name) {
      case "u": { draw(); return { type: "float", code: "u2f(pt)" }; }
      case "centered": { draw(); return { type: "float", code: "(u2f(pt) - 0.5)" }; }
      case "pick": {
        const a = n.args[0];
        let bi;
        if (a.t === "member" && a.o.t === "id" && a.o.n === P) bi = intLeverVar(a.name);
        else if (a.t === "num") bi = a.v;
        else err("pick wants a lever or an integer literal");
        draw();
        return { type: "int", code: `min(int(u2f(pt) * float(${bi})), ${bi} - 1)` };
      }
      case "jitter2": {
        const vx = fresh("jx"), v = fresh("jit");
        draw(); put(`float ${vx} = u2f(pt) - 0.5;`);
        draw(); put(`vec2 ${v} = vec2(${vx}, u2f(pt) - 0.5);`);
        return { type: "vec2", code: v };
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
        return { type: "int", code: `int(pow(u2f(pt), ${bias}) * float(${maxVar}))`, staticMax };
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
    put(`vec2 ${xy} = vec2(0.0);`);
    put(`float ${sc} = 1.0;`);
    put(`uint ${adr} = ${(pos.root >>> 0)}u;`);
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
    put(`uint ${cand} = hashu(${adr} ^ (uint(${cyV} * 1031 + ${cxV} + 1) * 2654435761u));`);
    // keep body with the candidate bound
    const cName = keepArrow.params[0];
    syms.set(cName, { kind: "candidate", h: cand });
    const keep = emitKeep(keepArrow.body, cand);
    syms.delete(cName);
    put(`if (${keep}) {`);
    indent += "  ";
    put(`${xy} += vec2(float(${cxV}), float(${cyV})) * ${sc} / float(${bI})`);
    put(`     - vec2(${sc} * 0.5 * (1.0 - 1.0 / float(${bI})));`);
    put(`${sc} /= float(${bI});`);
    put(`${adr} = ${cand};`);
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
    syms.set(name, { kind: "descend", xy, sc, adr, reached: rc, b: bI });
  }

  // keep bodies: boolean expressions over the candidate
  function emitKeep(n, cand) {
    if (n.t === "call" && n.callee.t === "member") {
      const o = n.callee.o;
      const sym = o.t === "id" ? syms.get(o.n) : null;
      if (sym && sym.kind === "candidate") {
        if (n.callee.name === "coin") {
          const pE = emit(n.args[0]);
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

  // ---- statements ----
  function stmt(st) {
    if (st.t === "decl") {
      // descend is a special form
      if (st.e.t === "call" && st.e.callee.t === "member" &&
          st.e.callee.o.t === "id" && st.e.callee.o.n === S && st.e.callee.name === "descend") {
        emitDescend(st.name, st.e);
        return;
      }
      const v = emit(st.e);
      if (v.type === "vec2") {
        const nm = fresh(st.name);
        put(`vec2 ${nm} = ${v.code};`);
        syms.set(st.name, { kind: "vec2", v: nm });
      } else if (v.type === "int" || v.type === "float" || v.type === "bool" || v.type === "vec3") {
        const nm = fresh(st.name);
        put(`${v.type} ${nm} = ${v.code};`);
        const rec = { kind: "scalar", type: v.type, v: nm };
        if (v.staticMax !== undefined) rec.staticMax = v.staticMax;
        syms.set(st.name, rec);
      } else err(`cannot bind ${st.name}: unhandled value`, st.line);
      return;
    }
    if (st.t === "assign") {
      const sym = syms.get(st.name);
      if (!sym) err(`assignment to unknown ${st.name}`, st.line);
      const v = emit(st.e);
      const target = sym.kind === "vec2" ? sym.v : sym.v;
      put(`${target} = ${v.code};`);
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
      const isDeposit = e.t === "call" && e.callee.t === "member" &&
        e.callee.o.t === "id" && e.callee.o.n === S && e.callee.name === "deposit";
      if (!isDeposit) err("the walk must end with return s.deposit({...})", st.line);
      const obj = e.args[0];
      if (!obj || obj.t !== "object") err("s.deposit wants an object literal");
      const parts = {};
      for (const pr of obj.props) {
        const v = emit(pr.value);
        const nm = fresh("dep_" + pr.key);
        if (pr.key === "xy") { put(`vec2 ${nm} = ${v.code};`); parts.xy = nm; }
        else if (pr.key === "col") { put(`vec3 ${nm} = ${v.code};`); parts.col = nm; }
        else { put(`float ${nm} = ${asFloat(v)};`); parts[pr.key] = nm; }
      }
      if (!parts.xy || !parts.col) err("s.deposit wants at least xy and col");
      const glow = parts.glow ? ` * ${parts.glow}` : "";
      put(`col = ${parts.col}${glow};`);
      put(`return vec3(${parts.xy}.x, ${parts.xy}.y, ${parts.z || "0.0"});`);
      return;
    }
    err("unhandled statement");
  }

  ast.body.forEach(stmt);

  // ---- assemble the shape function ----
  const salt = ((fnv1a(pos.id) | 1) >>> 0);
  const head = [];
  head.push(`vec3 shape_${pos.id}(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){`);
  head.push(`  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))`);
  head.push(`                       ^ hashu(floatBitsToUint(q.y) * ${salt}u));`);
  head.push(`  pt = hashu(pt ^ floatBitsToUint(rnd.x));`);
  for (const nm of usedIntLevers)
    head.push(`  int li_${nm} = int(P[${leverIx[nm]}] + 0.5);`);
  const glsl = head.join("\n") + "\n" + lines.join("\n") + "\n}";
  return glsl;
}

// a registry-contract plate file wrapping the emitted GLSL
export function emitPlate(pos) {
  const glsl = emitWalk(pos);
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
