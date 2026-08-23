// Dump every positive's PINNED GLSL, so a real compiler can see it.
//
// Everything checked so far is a scan over text. Text scans do not
// catch a missing function, a type that does not line up, or a name
// that collides with a GLSL keyword — and pinning replaced a dozen
// builtins with functions of the engine's own, any of which could be
// spelled wrong in a way no regex notices.
//
// So this writes what a driver would actually be handed:
//
//   detlib.glsl   the proven library, byte-identical to the darkroom's
//   detpre.glsl   the engine's pinned helpers, built on it
//   <id>.glsl     the emitted shape function
//
// tools/compile-pinned.py then compiles each one on a real context.
// Splitting it in two is not tidiness — node has no GL, and the
// darkroom already owns a working moderngl harness, so the join is a
// directory of files rather than a binding.
//
//   node tools/compile-pinned.mjs   -> build/pinned/

import { readdirSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { emitWalk } from "../core/emit.mjs";
import { substitute } from "../core/oracle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "build", "pinned");
mkdirSync(OUT, { recursive: true });

for (const [src, dst] of [["detlib.glsl.template", "detlib.glsl"],
                          ["detpre.glsl.template", "detpre.glsl"]]) {
  const t = readFileSync(join(ROOT, "core", src), "utf8");
  writeFileSync(join(OUT, dst), substitute(t), "utf8");
}

// BOTH VARIANTS, because a bit-identity result without a control is
// not a result. If pinned plates agree across two drivers, the obvious
// question is whether ANY plate would - maybe the sample set is too
// small, maybe these plates are arithmetically dull. Emitting the same
// positives unpinned and running them the same way answers it: the
// unpinned run must DISAGREE where the pinned run agrees, or the
// experiment has no power and the agreement means nothing.
const UNP = join(ROOT, "build", "unpinned");
mkdirSync(UNP, { recursive: true });

const POS = join(ROOT, "positives");
let ok = 0, refused = 0, ctrl = 0;
const skipped = [];
for (const f of readdirSync(POS).filter(x => x.endsWith(".pos.mjs")).sort()) {
  const pos = (await import(pathToFileURL(resolve(join(POS, f))).href)).default;
  const id = f.replace(".pos.mjs", "");
  try {
    writeFileSync(join(OUT, `${id}.glsl`), emitWalk(pos, { pin: true }),
                  "utf8");
    ok++;
    // the control only exists for plates the pinned set accepted, so
    // the two sets are the same plates and the comparison is paired
    writeFileSync(join(UNP, `${id}.glsl`), emitWalk(pos), "utf8");
    ctrl++;
  } catch (e) {
    refused++;
    skipped.push(id);
  }
}
console.log(`build/pinned:   detlib.glsl, detpre.glsl, and ${ok} plates`);
console.log(`build/unpinned: ${ctrl} of the same plates, as the control`);
console.log("  now: python tools/compile-pinned.py --run <tag>");

// A REFUSAL IS A REGRESSION HERE, whatever it is elsewhere. Refusing an
// unpinnable construct is the design working when somebody is writing a
// positive; in a corpus where all sixty-nine emit, a plate that stops
// emitting is a plate that stops existing, and this printed it as a
// note and exited 0. Nothing downstream would have noticed: bakeemitted
// reads build/pinned/<id>.glsl, and a file that was not rewritten this
// run is a file left over from the last one - which is precisely the
// staleness its own guard exists to refuse.
if (refused) {
  console.log(`\n  ${refused} REFUSED by the pinned set: ${skipped.join(" ")}`);
  console.log("  build/pinned still holds whatever the last successful run");
  console.log("  left for those, so nothing here is safe to bake.");
  process.exit(1);
}
