// Emit a positive: node tools/emit.mjs positives/critical.pos.mjs
import { emitPlate } from "../core/emit.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || join(here, "..", "positives", "critical.pos.mjs");
const mod = await import(pathToFileURL(resolve(target)).href);
const pos = mod.default;
if (!pos || pos.kind !== "positive") {
  console.error(target + " does not export a positive");
  process.exit(1);
}
const { glsl, plate } = emitPlate(pos);
const outDir = join(here, "..", "build");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, pos.id + ".glsl"), glsl + "\n");
writeFileSync(join(outDir, pos.id + ".plate.js"), plate);
console.log(`emitted shape_${pos.id}: ${glsl.split("\n").length} GLSL lines`);
console.log(`  build/${pos.id}.glsl`);
console.log(`  build/${pos.id}.plate.js`);
