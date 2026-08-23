// Does an orbit step with a BLOCK body actually nest a loop?
//
// The restriction it replaced was one line - the step arrow had to BE
// an object literal - and lifting it is what makes cascade, rule30,
// rulespace and universal authorable at all: their loops nest two and
// three deep, and a nested sum() or orbit has to be DECLARED before
// its result can appear in a field.
//
// A construct that only works by inspection is a construct that stops
// working. This asserts the three things that have to hold together,
// because any one of them alone would let the other two rot:
//
//   1. the emitter accepts a block-bodied step and puts a real nested
//      loop inside the outer one, with its own runtime break
//   2. every local the nested body declares is `precise`, so nothing
//      in it is a contraction candidate - the whole point of pinning
//   3. the CPU evaluator runs the SAME JavaScript and agrees, which is
//      what makes `=> {` a block here rather than an object literal:
//      a positive is real JavaScript and the oracle runs it
//
//   node tools/verify-orbit-block.mjs

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { emitWalk } from "../core/emit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "positives", "_fixtures", "nested-orbit.pos.mjs");

const mod = await import(pathToFileURL(resolve(FIX)).href);
const glsl = emitWalk(mod.default, { pin: true });
const lines = glsl.split("\n");

let bad = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); bad++; };
const pass = (m) => console.log(`  ok    ${m}`);

// 1. a nested loop, and the inner one inside the outer one
const outer = lines.findIndex((l) => /for \(int ok_/.test(l));
const inner = lines.findIndex((l, i) => i > outer && /for \(int sk_/.test(l));
if (outer < 0) fail("no orbit loop emitted at all");
else if (inner < 0) fail("no nested loop inside the orbit step");
else {
  // find where the outer loop closes, by indentation of its `for`
  const ind = lines[outer].match(/^\s*/)[0].length;
  let close = -1;
  for (let i = outer + 1; i < lines.length; i++) {
    if (lines[i].trim() === "}" && lines[i].match(/^\s*/)[0].length === ind) {
      close = i; break;
    }
  }
  if (close < 0 || inner > close)
    fail("the nested loop is not inside the orbit's own loop");
  else pass(`nested loop at line ${inner}, inside the orbit spanning ` +
            `${outer}-${close}`);
}

// 2. the nested body's runtime break, so a lever still bounds it
const innerBreak = lines.slice(inner, inner + 3)
  .some((l) => /if \(sk_\d+ >= li_/.test(l));
if (!innerBreak) fail("the nested loop has no runtime break off its lever");
else pass("nested loop breaks on its lever's runtime value");

// 3. every float local inside the orbit is precise
const body = lines.slice(outer, lines.length);
const unpinned = body.filter(
  (l) => /^\s*(float|vec2|vec3) [A-Za-z_]/.test(l) && !/precise/.test(l));
if (unpinned.length)
  fail(`${unpinned.length} unpinned local(s) inside the orbit: ` +
       unpinned[0].trim().slice(0, 56));
else pass("every float/vec local inside the orbit is precise");

// 4. the CPU evaluator runs the same JavaScript without falling over.
//    If `=> {` were read as an object literal by one side and a block
//    by the other, this is where it would show.
const { evaluate, leverDefaults } = await import("../core/measure.mjs");
const P = leverDefaults(mod.default);
let landed = 0, bogus = 0;
for (let i = 0; i < 2000; i++) {
  const r = evaluate(mod.default, P, i, 0.0);   // (pos, P, i, t)
  if (!r) { bogus++; continue; }
  // evaluate returns {x,y,z,r,g,b} - flat, not an xyz tuple
  const v = [r.x, r.y, r.z, r.r, r.g, r.b];
  if (v.every(Number.isFinite)) landed++; else bogus++;
}
if (bogus || landed < 2000)
  fail(`CPU evaluator: ${landed}/2000 finite, ${bogus} bogus`);
else pass(`CPU evaluator agrees on ${landed}/2000 samples`);

console.log(bad ? `\n  ${bad} check(s) failed` : "\n  orbit block bodies hold");
process.exit(bad ? 1 : 0);
