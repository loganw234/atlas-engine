// The darkroom's camera kernel, in the two forms core/cft-camera.mjs
// makes of it.
//
//   node tools/cft-camera.mjs capture --bundle PATH --plate ID --out FILE
//   node tools/cft-camera.mjs tile    --bundle PATH --plate ID --out FILE
//   node tools/cft-camera.mjs capture --kernel FILE --plate ID --out FILE
//
// `capture` is the kernel tools/photo-gpu.py compiles to record every
// sample's deposit on the GPU; `tile` is the text the lowering reads. The
// kernel comes from a determinism bundle (sources.compute of the plate)
// or from a file holding exactly the text the darkroom compiled.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tileFormOf, captureKernelOf } from "../core/cft-camera.mjs";

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const mode = argv[0];
const plateId = opt("--plate", "hopf");
const out = opt("--out");
if (!["capture", "tile"].includes(mode) || !out)
  throw new Error("usage: cft-camera.mjs capture|tile (--bundle PATH | --kernel FILE) --plate ID --out FILE");
let kernel;
if (opt("--kernel")) kernel = readFileSync(opt("--kernel"), "utf8");
else {
  const bundle = JSON.parse(readFileSync(opt("--bundle"), "utf8"));
  const entry = bundle.plates[plateId];
  if (!entry || !entry.sources || !entry.sources.compute)
    throw new Error(`cft-camera: the bundle has no compute source for ${plateId}`);
  kernel = entry.sources.compute;
}
const text = mode === "capture" ? captureKernelOf(kernel, { plateId }) : tileFormOf(kernel, { plateId });
writeFileSync(out, text);
const sha = (s) => createHash("sha256").update(s).digest("hex");
console.log(JSON.stringify({ mode, plate: plateId, kernelSha256: sha(kernel), outSha256: sha(text), lines: text.split("\n").length }));
