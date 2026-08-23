// Phase 2's acceptance check: does pinned emission actually leave no
// unpinned float operation, and does it refuse what it cannot pin?
//
// The claim being tested is narrow and worth stating exactly. It is NOT
// "this plate is bit-identical everywhere" — that is Phase 3, and it
// needs two implementations to say anything. It is "every float
// operation in this text has a deterministic form behind it", which is
// a property of the text and can be checked here, for free, on all 54
// positives at once.
//
// A scan over emitted text is a weaker instrument than a compiler, and
// the honest reading of a pass is: nothing in the unpinned list appears.
// Anything the list omits, the scan cannot see. So the list is written
// out in full rather than hidden in a regex, and the operations it
// deliberately admits are named with the reason they are admitted.
//
//   node tools/verify-pinned.mjs            every positive
//   node tools/verify-pinned.mjs critical   just one

import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { emitWalk } from "../core/emit.mjs";
import { UNCOVERED } from "../core/oracle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const POS = join(ROOT, "positives");

// GLSL builtins with spec-permitted latitude that a pinned plate must
// not contain. `det_`-prefixed names are stripped before the scan, so
// det_sin does not trip the sin rule.
const LOOSE = [
  "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh",
  "exp", "exp2", "log", "log2", "pow", "sqrt", "inversesqrt",
  "normalize", "length", "distance", "reflect", "refract",
  "smoothstep", "mod", "round", "roundEven",
  // dot and mix were once "admitted because nothing emitted uses them".
  // That was an assertion, not a measurement, so they are in the scan
  // now and the claim either holds or shows up here.
  "dot", "mix", "fract",
];

// Admitted, each for a stated reason. This list is the honest part of
// the check: it is where a future reader learns what "pinned" does not
// yet cover.
const ADMITTED = {
  floor: "exact on every conforming implementation",
  abs: "sign-bit clear, exact",
  min: "exact selection",
  max: "exact selection",
  sign: "exact",
  clamp: "min/max composed, exact",
  step: "a comparison, exact",
};

// Pinned rather than admitted - each replaces a builtin the emitter
// used to write directly.
const PINNED = {
  det_div: "raw division, which the spec gives 2.5 ULP of latitude",
  det_len2: "length(vec2), i.e. sqrt(dot(v,v))",
  det_len3: "length(vec3)",
  det_len3v: "length() on a vec3 value",
  det_mix: "mix(), whose association was free",
  det_smoothstep: "smoothstep(), through the exact divide",
  det_mod: "mod(), through the exact divide",
  det_fract: "fract() - iris rounds it toward zero where x - floor(x) rounds to nearest, one ULP low on 45% of x in (-0.5, 0). Rebuilt from float(int(x)) rather than from floor, because the compiler folds the floor form back into the builtin",
  det_pow: "pow(), including the one deciding a descend depth",
  det_sin: "sin()", det_cos: "cos()", det_tan: "tan()",
  det_sqrt: "sqrt()", det_acos: "acos()", det_atan: "atan()",
  det_exp2: "exp2(), including the magnify lever",
  det_recip: "a reciprocal written as 1.0 / x",
  det_div2: "componentwise division of a vec2 by a scalar",
};

// WHAT THIS SCAN STRUCTURALLY CANNOT SEE. Emitted text CALLS functions
// whose bodies live in the registry's shared header, and those bodies
// are not pinned:
//
//   pal    -> a + b*cos(TAU*(c*t+d))     cos, and a vec3 fma chain
//   cmul   -> products and a difference   contraction is free
//   cdiv   -> dot() and a division        both unpinned
//   cinv   -> dot() and a division
//   csqrt  -> sqrt() twice
//
// A plate can be "fully pinned" by every test above and still reach an
// unpinned cos through pal(). Counting the calls is not a substitute
// for pinning them - it is a refusal to let the gap be invisible.
const HEADER_UNPINNED = {
  pal: "cos() in the shared header's palette",
  cmul: "unpinned products and difference",
  cdiv: "dot() and a raw division",
  cinv: "dot() and a raw division",
  csqrt: "sqrt(), twice",
};

function scan(glsl) {
  // strip comments and det_ names so the scan sees only live calls
  const text = glsl
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\bdet_[A-Za-z0-9_]+/g, " ");
  const found = new Map();
  for (const name of LOOSE) {
    const re = new RegExp(`\\b${name}\\s*\\(`, "g");
    const n = [...text.matchAll(re)].length;
    if (n) found.set(name, n);
  }
  // WHAT THE SLASH COUNT CAN AND CANNOT SAY. A text scan cannot tell
  // an int division from a float one - both are `/`. So the invariant
  // is held by the EMITTER, which under `pin` routes every float
  // division through det_div and never writes one itself, and the
  // count here is reported for a reader to confirm rather than treated
  // as a failure. Integer division is exact on every conforming
  // implementation and wants no pinning at all; flagging it would push
  // somebody to "fix" something that is already right.
  const slashes = [...text.matchAll(/\//g)].length;
  const header = new Map();
  for (const name of Object.keys(HEADER_UNPINNED)) {
    const n = [...text.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))].length;
    if (n) header.set(name, n);
  }
  return { found, slashes, text, header };
}

const only = process.argv[2];
const files = readdirSync(POS).filter(f => f.endsWith(".pos.mjs"))
  .filter(f => !only || f.startsWith(only + "."));

const pinned = [], refused = [], dirty = [], intdiv = [], hdr = [];
for (const f of files.sort()) {
  const mod = await import(pathToFileURL(resolve(join(POS, f))).href);
  const pos = mod.default;
  const id = f.replace(".pos.mjs", "");
  let glsl;
  try {
    glsl = emitWalk(pos, { pin: true });
  } catch (e) {
    refused.push({ id, why: e.message.replace(/^emit: /, "") });
    continue;
  }
  const { found, slashes, header } = scan(glsl);
  if (header.size) hdr.push({ id, header: [...header] });
  if (found.size) dirty.push({ id, found: [...found], slashes });
  else { pinned.push(id); if (slashes) intdiv.push({ id, slashes }); }
}

console.log(`positives: ${files.length}`);
console.log(`  fully pinned : ${pinned.length}`);
console.log(`  refused      : ${refused.length}`);
console.log(`  emitted but still carrying an unpinned op: ${dirty.length}`);

if (refused.length) {
  console.log("\nREFUSED - and this is the design working, not failing.");
  const byWhy = new Map();
  for (const r of refused) {
    const key = r.why.split(":")[0].slice(0, 72);
    if (!byWhy.has(key)) byWhy.set(key, []);
    byWhy.get(key).push(r.id);
  }
  for (const [why, ids] of byWhy)
    console.log(`  ${ids.length.toString().padStart(2)}  ${why}\n      ` +
                ids.join(" "));
}

if (dirty.length) {
  console.log("\nSTILL UNPINNED - the scan found these in emitted text:");
  for (const d of dirty)
    console.log(`  ${d.id.padEnd(12)} ` +
                (d.found.map(([k, v]) => `${k}x${v}`).join(" ") || "") +
                (d.slashes ? `  bare-slash x${d.slashes}` : ""));
}

if (hdr.length) {
  const tally = new Map();
  for (const h of hdr) for (const [k, v] of h.header)
    tally.set(k, (tally.get(k) || 0) + v);
  console.log(`\nKNOWN GAP - ${hdr.length} of ${files.length} positives ` +
              `call a shared-header function whose body is NOT pinned:`);
  for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(8)} ${String(v).padStart(4)} calls   ` +
                HEADER_UNPINNED[k]);
  console.log("  Counting as 'fully pinned' above does NOT cover these.");
  console.log("  The header belongs to the registry, not the engine, so " +
              "closing this needs");
  console.log("  det_ versions emitted alongside the plate or a change " +
              "to the contract -");
  console.log("  a Phase 5 question, recorded here so it is not mistaken " +
              "for done.");
}

console.log(`\nAdmitted without pinning, by name and reason:`);
for (const [k, v] of Object.entries(ADMITTED))
  console.log(`  ${k.padEnd(10)} ${v}`);
console.log(`\nNo deterministic form at all (oracle.UNCOVERED): ` +
            UNCOVERED.join(", "));

process.exit(dirty.length ? 1 : 0);
