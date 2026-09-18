// A positive's program and input streams at card scale, for timing and
// partition runs on real silicon.
//
//   node tools/cft-streams.mjs --points 1048576 --out build/cft/silicon positives/hopf.pos.mjs ...
//        [--levers 7]
//
// Writes, per positive, a case named `<id>.n<N>` (or `<id>.levers-S.n<N>`):
// the image, the bank, and the three streams, exactly the layout
// tools/pack-cft-set.mjs uses, but with no expected deposit buffer - at
// a million lanes the GLSL reference is not the instrument, and the
// expected bits come from the software backend on the box, lane blocks in
// parallel, which is itself one of the checks (a partition must not
// change a lane's result). The samples are core/cft-samples.mjs's, the
// definition the verifier scores against.

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { lowerPositive, hashedLevers } from "../core/emit-cft.mjs";
import { frameSamples } from "../core/cft-samples.mjs";
import { Machine } from "../core/cft-run.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const N = Number(opt("--points", "65536"));
const OUT = resolve(opt("--out", "build/cft/silicon"));
const SEED = opt("--levers", null);
// --flag-loops: lower every loop exit in the selected form instead of SETACT,
// the same program's other shape, for pricing the early exit on a device
const FLAG_LOOPS = argv.includes("--flag-loops");
const files = argv.filter((a, i) => a.endsWith(".pos.mjs"));
mkdirSync(OUT, { recursive: true });
const u8 = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const sha = (b) => createHash("sha256").update(b).digest("hex");

const HM = await Machine.open();           // fills the hoisted per-run slots
for (const f of files) {
  const pos = (await import(pathToFileURL(resolve(f)).href)).default;
  const id = pos.id.replace(/_pos$/, "");
  const P = SEED === null ? null : hashedLevers(pos, Number.parseInt(SEED, 10) >>> 0);
  const t0 = Date.now();
  const L = lowerPositive(pos, { P, setactLoops: FLAG_LOOPS ? false : undefined, machine: HM });
  if (!L.image) { console.log(`${id}: does not load as it stands; skipped`); continue; }
  const s = frameSamples(L, N);
  const name = `${id}${SEED === null ? "" : `.levers-${SEED}`}${FLAG_LOOPS ? ".flagloops" : ""}.n${N}`;
  const put = (suffix, bytes) => { writeFileSync(join(OUT, name + suffix), bytes); return { file: name + suffix, sha256: sha(bytes) }; };
  const rec = {
    case: name, positive: pos.id, lanes: N, format: "fp32",
    image: { ...put(".cftp", L.image), words: L.prog.counts.total, maxDeposits: L.prog.results.length,
             registers: L.prog.regsUsed, scratchSlots: L.prog.scratch.slots, loops: L.prog.loops.length },
    bank: put(".bank", L.bank),
    streams: { a: put(".a.bin", u8(s.qx)), b: put(".b.bin", u8(s.qy)), c: put(".c.bin", u8(s.ptc)) },
    digest: L.digest,
    deposits: L.prog.results.map(r => r.name),
  };
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(rec, null, 2) + "\n");
  console.log(`${name}: ${rec.image.words} words, ${rec.image.maxDeposits} deposits a lane, ` +
              `${(N * 12 / 1048576).toFixed(1)} MB of streams, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
