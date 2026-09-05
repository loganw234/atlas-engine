// What a walk may not call, refused by name.
//
// Math.constructor, Math.toString, Math.hasOwnProperty and Math.valueOf
// are not mathematics. They are Object.prototype seen through the Math
// object, and a membership test written with `in` let every one of
// them through: the emitter looked the name up in its table, found the
// inherited function, and wrote that function's own source text into
// the GLSL. No positive ever asked for one, which is why the hole sat
// unnoticed until the emitter was taken apart. The walks below ask for
// each of them, pinned and unpinned, and the emitter has to refuse
// every time with the sentence a reader would expect.
//
//   node tools/verify-refusals.mjs
import { emitWalk } from "../core/emit.mjs";
import { positive, lever } from "../core/measure.mjs";

// one walk per inherited name; the deposit is the smallest legal one
const WALKS = {
  constructor: (P, s, q, t) => {
    const v = Math.constructor(q.x);
    return s.deposit({ xyz: [v, 0.0, 0.0], col: [1.0, 1.0, 1.0] });
  },
  toString: (P, s, q, t) => {
    const v = Math.toString(q.x);
    return s.deposit({ xyz: [v, 0.0, 0.0], col: [1.0, 1.0, 1.0] });
  },
  hasOwnProperty: (P, s, q, t) => {
    const v = Math.hasOwnProperty(q.x);
    return s.deposit({ xyz: [v, 0.0, 0.0], col: [1.0, 1.0, 1.0] });
  },
  valueOf: (P, s, q, t) => {
    const v = Math.valueOf(q.x);
    return s.deposit({ xyz: [v, 0.0, 0.0], col: [1.0, 1.0, 1.0] });
  },
};

let failed = 0;
for (const [name, walk] of Object.entries(WALKS)) {
  for (const pin of [false, true]) {
    const pos = positive("refusal_pos", {
      k: lever("K", 0, 1, 0.01, 0.5),
      cam: { dist: 3.0, pitch: 0.3, tgtY: 0.0, rot: 0.0 },
    }, walk);
    let verdict;
    try {
      const glsl = emitWalk(pos, { pin });
      verdict = "EMITTED " + glsl.length + " chars";
      failed++;
    } catch (e) {
      const msg = String(e && e.message || e);
      if (msg.includes(`Math.${name} is not in the subset`)) verdict = "refused";
      else { verdict = "refused for the wrong reason: " + msg.slice(0, 80); failed++; }
    }
    console.log(`${verdict === "refused" ? "PASS  " : "FAIL  "}Math.${name}${pin ? " (pinned)" : ""}   ${verdict}`);
  }
}
if (failed) {
  console.log(`\n${failed} refusal(s) did not hold`);
  process.exit(1);
}
console.log("\nevery inherited name is refused, pinned and unpinned");
