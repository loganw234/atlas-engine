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

const POS = join(ROOT, "positives");
let ok = 0, refused = 0;
const skipped = [];
for (const f of readdirSync(POS).filter(x => x.endsWith(".pos.mjs")).sort()) {
  const pos = (await import(pathToFileURL(resolve(join(POS, f))).href)).default;
  const id = f.replace(".pos.mjs", "");
  try {
    writeFileSync(join(OUT, `${id}.glsl`), emitWalk(pos, { pin: true }),
                  "utf8");
    ok++;
  } catch (e) {
    refused++;
    skipped.push(id);
  }
}
console.log(`build/pinned: detlib.glsl, detpre.glsl, and ${ok} plates`);
if (refused)
  console.log(`  ${refused} refused by the pinned set: ${skipped.join(" ")}`);
console.log("  now: python tools/compile-pinned.py");
