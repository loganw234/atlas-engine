// Do the DSL's bit operators mean what JavaScript means by them?
//
// The CPU evaluator runs the walk's ACTUAL JavaScript - measure.mjs's
// evaluate() calls pos.walk directly - so JS is the reference and the
// emitted GLSL has to match it. Two ways that can fail:
//
//   PRECEDENCE. If `a | b & c` parses as `(a | b) & c` here and as
//   `a | (b & c)` in JS, the plate agrees with neither evaluator and
//   the emitted shader is quietly a different program. JS orders these
//   | below ^ below & below the comparisons, with shifts above them.
//
//   COERCION. A float silently becoming an int is how a walk stops
//   meaning what it says. Every crossing must be an explicit bits().
//
// This checks both, plus the refusals, by emitting expressions and
// reading the GLSL back. It does NOT check that the GPU agrees with
// the arithmetic - docs/bitwise-dsl-log.md stage 0 measures that
// directly on four cards, and rule30's census is the end-to-end.
//
//   node tools/verify-bitwise.mjs
import { emitWalk } from "../core/emit.mjs";

let failed = 0;
const say = (ok, name, detail) => {
  console.log((ok ? "  ok    " : "  FAIL  ") + name
    + (detail ? "\n          " + detail : ""));
  if (!ok) failed++;
};

// A positive shaped just enough for emitWalk: one lever, one walk.
// The walk must be an ARROW - emitWalk reads pos.walk.toString() and
// parses it, and `new Function` stringifies as `function anonymous`,
// which the parser rejects before it reaches anything being tested.
const posOf = (bodySrc) => ({
  id: "bitprobe",
  leverNames: ["DEPTH"],
  levers: [{ name: "DEPTH", min: 1, max: 8, step: 1, def: 4 }],
  chains: { root: 1 },
  // eslint-disable-next-line no-eval
  walk: eval(`(P, s, q, t) => {
${bodySrc}
}`),
});

function glslOf(bodySrc) {
  return emitWalk(posOf(bodySrc), { pin: true });
}

// ---------------------------------------------------------- precedence
//
// Each case: an expression, and the parenthesisation JS gives it. The
// emitted GLSL is searched for the inner grouping, which is what tells
// the two apart.
const PREC = [
  ["bits(1) | bits(2) & bits(3)", "&", "| binds looser than &"],
  ["bits(1) ^ bits(2) & bits(3)", "&", "^ binds looser than &"],
  ["bits(1) | bits(2) ^ bits(3)", "^", "| binds looser than ^"],
  ["bits(1) << 2 | bits(3)", "<<", "shift binds tighter than |"],
];
for (const [src, inner, why] of PREC) {
  let g;
  try {
    g = glslOf(`const a = ${src}; return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });`);
  } catch (e) {
    say(false, why, `emit refused: ${e.message}`);
    continue;
  }
  // the tighter operator must appear bound into its own temporary
  // before the looser one consumes it
  const tight = new RegExp(`int [A-Za-z_][A-Za-z0-9_]*\\s*=\\s*\\([^;]*\\${inner}`);
  say(tight.test(g), why,
    tight.test(g) ? "" : `no temporary binds ${inner} first`);
}

// --------------------------------------------------------- no coercion
const REFUSE = [
  ["const a = 1.5 & bits(2); return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "& refuses a float operand"],
  ["const a = ~1.5; return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "~ refuses a float"],
  ["const a = bits(1) << 32; return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "<< refuses a count of 32"],
  ["const a = bits(1) << -1; return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "<< refuses a negative count"],
  ["const a = bits(1) << bits(2); return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "<< refuses a non-literal count"],
];
for (const [src, why] of REFUSE) {
  let refused = false, msg = "";
  try { glslOf(src); } catch (e) { refused = true; msg = e.message; }
  say(refused, why, refused ? "" : "the emitter accepted it");
  if (refused && !/bits\(x\)|literal count|integer/i.test(msg))
    say(false, why + " — message says why", msg);
}

// ------------------------------------------------------------ accepted
const ACCEPT = [
  ["const a = bits(3) & bits(5); return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "&", "& on two ints"],
  ["const a = bits(3) | bits(5); return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "|", "| on two ints"],
  ["const a = bits(3) ^ bits(5); return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "^", "^ on two ints"],
  ["const a = ~bits(3); return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "~", "~ on an int"],
  ["const a = bits(3) << 4; return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   "<<", "<< with a literal count"],
  ["const a = bits(96) >> 4; return s.deposit({ xyz: [a, 0.0, 0.0], col: [1.0, 1.0, 1.0], glow: 1.0 });",
   ">>", ">> with a literal count"],
];
for (const [src, op, why] of ACCEPT) {
  let g = null, err = "";
  try { g = glslOf(src); } catch (e) { err = e.message; }
  say(g !== null && g.includes(op), why, g === null ? err : "");
  // and nothing deterministic wrapped around it: integers are exact
  if (g && /det_[a-z]+\([^)]*[&|^~]/.test(g))
    say(false, why + " — no det_ wrapper", "an integer op was pinned");
}

// --------------------------------------------- JS agrees with itself
// The point of matching JS precedence is that the walk means one
// thing. Evaluate the same expressions as JS and confirm the values
// are what the operators say, so a future precedence change fails here
// rather than in a census four hours later.
const CASES = [
  [() => (1 | 2 & 3), 3],
  [() => (1 ^ 2 & 3), 3],
  [() => (1 | 2 ^ 3), 1],
  [() => ((1 << 2) | 3), 7],
  [() => (~5), -6],
  [() => (0xF0F0 & 0x0FF0), 0x00F0],
];
let jsOk = true;
for (const [fn, want] of CASES) if (fn() !== want) jsOk = false;
say(jsOk, "the JS reference values are what the operators say");

console.log(failed ? `\n  ${failed} check(s) failed` : "\n  bit operators hold");
process.exit(failed ? 1 : 0);
