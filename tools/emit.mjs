// Emit a positive: node tools/emit.mjs positives/critical.pos.mjs
// Emit every positive:  node tools/emit.mjs --all
//
// Writes build/<id>.glsl and build/<id>.plate.js, which the harness
// pages load. build/ is a product and is not tracked (2026-09-04): a
// fresh checkout runs --all, then tools/gen-bench.mjs, before opening
// harness/bench.html or bench-all.html.
import { emitPlate } from "../core/emit.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
import { readdirSync } from "node:fs";
const arg = process.argv[2];
const targets = arg === "--all"
  ? readdirSync(join(here, "..", "positives")).filter(f => f.endsWith(".pos.mjs")).sort()
      .map(f => join(here, "..", "positives", f))
  : [arg || join(here, "..", "positives", "critical.pos.mjs")];
for (const target of targets) {
const mod = await import(pathToFileURL(resolve(target)).href);
const pos = mod.default;
if (!pos || pos.kind !== "positive") {
  console.error(target + " does not export a positive");
  process.exit(1);
}
const { glsl, plate } = emitPlate(pos);

// Guard the emitted text against names the GPU will reject. Neither
// emit nor smoke runs a GLSL compiler, so without this a reserved
// identifier survives all the way to the browser gate, where it shows
// up as a link failure with no line of walk source attached to it.
// gl_Position and friends are the only lawful gl_ names here.
{
  const LAWFUL = new Set(["gl_Position", "gl_PointSize", "gl_VertexID", "gl_InstanceID"]);
  const bad = new Set();
  for (const m of glsl.matchAll(/gl_[A-Za-z0-9_]*/g)) if (!LAWFUL.has(m[0])) bad.add(m[0]);
  // GLSL ES 3.0 keywords a generated name could collide with
  const KEYWORDS = /(sample|input|output|filter|active|common|partition|class|union|enum|typedef|template|this|resource|goto|inline|noinline|public|static|extern|external|interface|long|short|half|fixed|unsigned|superp|namespace|using|sizeer|cast)_[0-9]+/g;
  for (const m of glsl.matchAll(KEYWORDS)) bad.add(m[0]);
  if (bad.size) {
    console.error(`emit: ${pos.id} produced GLSL-reserved identifiers: ${[...bad].join(", ")}`);
    process.exit(1);
  }
}
const outDir = join(here, "..", "build");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, pos.id + ".glsl"), glsl + "\n");
writeFileSync(join(outDir, pos.id + ".plate.js"), plate);
console.log(`emitted shape_${pos.id}: ${glsl.split("\n").length} GLSL lines`);
console.log(`  build/${pos.id}.glsl`);
console.log(`  build/${pos.id}.plate.js`);
}
