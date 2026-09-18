// A photograph's card side: the darkroom's camera and a plate, lowered for
// one frame, and every sample held to the GPU's record of it.
//
//   node tools/photo-cft.mjs [--dir build/cft/photo/hopf-512] [--ref 4096] [--lib 65536]
//                            [--passes all] [--pack] [--core core]
//
// Reads what tools/photo-gpu.py wrote - the kernel the darkroom compiled,
// every uniform's bits, each pass's rotation and salt, and the GPU's
// per-sample records - and lowers the kernel's own `splat` through
// core/cft-camera.mjs. Then three executions of the same samples are
// compared, record for record (x, y and the three fixed-point channels):
//
//   reference  the tile form interpreted at binary32 (core/glsl-f32.mjs),
//              the oracle the lowering is scored against, on --ref samples
//   libcft     the image and each pass's bank through cft_program_load and
//              cft_program_run, on --lib lanes a pass
//   GPU        the darkroom's own kernel with its deposits recorded
//
// When the GPU and cft-fp256 disagree the disagreement is the finding:
// cft-fp256's contract is the stricter of the two and wins by default, so
// a difference is located and described here, not "fixed" on the card.
//
// --pack writes the card case beside the records: the image, one bank a
// pass, the sample-index stream, and the GPU's records as the expected
// deposits - five words a lane in the program's deposit order, which is
// the record's order.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DIR = resolve(opt("--dir", join(ROOT, "build", "cft", "photo", "hopf-512")));
const NREF = Number(opt("--ref", "4096"));
const NLIB = Number(opt("--lib", "65536"));
const PACK = argv.includes("--pack");
const CORE = resolve(opt("--core", join(ROOT, "core")));
const coreUrl = pathToFileURL(CORE).href;

const { lowerCamera, RECORD } = await import(`${coreUrl}/cft-camera.mjs`);
const { Machine, libcftEntry } = await import(`${coreUrl}/cft-run.mjs`);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const u8 = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const hex = (u) => "0x" + (u >>> 0).toString(16).padStart(8, "0");

const man = JSON.parse(readFileSync(join(DIR, "photo-gpu.json"), "utf8"));
const kernel = readFileSync(join(DIR, man.kernel.file), "utf8");
if (sha(Buffer.from(kernel)) !== man.kernel.sha256) throw new Error("photo-cft: kernel.glsl is not the kernel the manifest names");
const plateId = man.plate;
const nPass = opt("--passes", "all") === "all" ? man.records.length : Math.min(Number(opt("--passes")), man.records.length);
const total = man.frame.samples_a_pass;

const t0 = Date.now();
const C = await lowerCamera({ kernel, plateId, uniforms: man.uniforms, perPass: man.per_pass, core: coreUrl });
const { prog } = C;
const tLower = (Date.now() - t0) / 1000;
console.log(`${plateId} through the darkroom's camera, as one program for the frame (${man.frame.side}x${man.frame.side}, ` +
            `${total} samples a pass, ${man.device.renderer})`);
console.log(`  program    : ${prog.counts.total} words (${prog.counts.alu} ALU), ${prog.regsUsed} registers, ` +
            `${prog.scratch.slots} scratch slot(s), ${prog.loops.length} loop(s); lowered in ${tLower.toFixed(1)} s`);
console.log(`  bank       : ${prog.counts.fixedConsts} program constants + ${prog.hoist ? prog.hoist.count : 0} hoisted per-run ` +
            `(${prog.hoist ? prog.hoist.removed : 0} ops off the lane) + ${prog.tail} per-pass tail (uSeqOffset.xy, uSeedSalt)`);
console.log(`  folds      : ${JSON.stringify(prog.folds)}; uniforms GL dropped (bound to zero): ${C.absent.join(" ") || "none"}`);
console.log(`  deposits   : ${prog.results.map((d, i) => `${i}:${d.name}`).join("  ")}; needs ${prog.needs.join(", ")}`);
if (!C.image) throw new Error("photo-cft: the camera program does not encode (registers)");

const recs = [];
for (let p = 0; p < nPass; p++) {
  const r = man.records[p];
  const buf = readFileSync(join(DIR, r.file));
  if (sha(buf) !== r.sha256) throw new Error(`photo-cft: ${r.file} is not the record the manifest names`);
  recs.push(new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
}

// the samples a check reads: the first of the pass, then spread by a hash
const pick = (n) => {
  const s = new Set();
  for (let i = 0; i < Math.min(n >> 1, total); i++) s.add(i);
  let h = 0x9E3779B9;
  while (s.size < Math.min(n, total)) { h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D) >>> 0; s.add(h % total); }
  return [...s].sort((a, b) => a - b);
};
const describe = (i, w, g) => `sample ${i}: want ${RECORD.names.map((n, k) => `${n}=${hex(w[k])}`).join(" ")} ` +
                              `got ${RECORD.names.map((n, k) => `${n}=${hex(g[k])}`).join(" ")}`;
const gpuRec = (p, i) => Array.from(recs[p].subarray(i * 5, i * 5 + 5));

// ---- the reference against the GPU
const refRows = [];
for (let p = 0; p < nPass; p++) {
  C.setPass(C.ref, man.per_pass[p]);
  let bad = 0, first = null, deposited = 0;
  const tr = Date.now();
  for (const i of pick(NREF)) {
    const r = C.ref.call("splat", [i >>> 0]).outs;
    const w = [r.recX >>> 0, r.recY >>> 0, r.recR >>> 0, r.recG >>> 0, r.recB >>> 0];
    const g = gpuRec(p, i);
    if (w[0] !== 0xFFFFFFFF) deposited++;
    if (w.some((x, k) => x !== g[k])) { bad++; if (!first) first = describe(i, g, w); }
  }
  refRows.push({ pass: p, samples: Math.min(NREF, total), deposited, differFromGpu: bad, first,
                 seconds: (Date.now() - tr) / 1000 });
  console.log(`  reference : pass ${p}, ${Math.min(NREF, total)} samples (${deposited} deposit), ` +
              `${bad} differ from the GPU's records${first ? ` - first ${first}` : ""}`);
}

// ---- libcft's program executor against the GPU, and the banks
const { Context } = await import(libcftEntry());
const ctx = await Context.open("fp32");
const M = await Machine.open();
const loaded = ctx.loadProgram(C.image);
const libRows = [];
const banks = [];
const nLib = Math.min(NLIB, total);
// THE PHOTOGRAPH, when every lane of every pass ran: libcft's deposits
// added into the three planes on the host, integer adds that wrap as the
// GPU's imageAtomicAdd does - order-free, which is the whole reason the
// samples can be computed anywhere
const [bw, bh] = man.frame.buffer;
const whole = nLib === total && nPass === man.frame.passes;
const planes = whole ? new Uint32Array(3 * bw * bh) : null;
// lanes in blocks: a lane's result is its own, so the block size changes
// nothing but how many deposit objects the binding holds at once
const CH = 131072;
for (let p = 0; p < nPass; p++) {
  const bank = C.bankFor(man.per_pass[p], M);
  banks.push(bank);
  let bad = 0, first = null, deposited = 0, secs = 0, status = 0, flags = 0;
  const firstBad = [];
  for (let s0 = 0; s0 < nLib; s0 += CH) {
  const n = Math.min(CH, nLib - s0);
  const ia = Uint32Array.from({ length: n }, (_, i) => s0 + i);
  const tl = Date.now();
  const run = loaded.runBank(bank, u8(ia));
  secs += (Date.now() - tl) / 1000;
  status |= run.status; flags |= run.flags;
  for (let j = 0; j < n; j++) {
    const i = s0 + j;
    const g = gpuRec(p, i);
    const w = [0, 1, 2, 3, 4].map(k => Number(run.deposits[j * 5 + k].bits) >>> 0);
    if (w[0] !== 0xFFFFFFFF) {
      deposited++;
      if (planes) for (let c = 0; c < 3; c++) {
        const at = c * bw * bh + w[1] * bw + w[0];
        planes[at] = (planes[at] + w[2 + c]) >>> 0;
      }
    }
    if (w.some((x, k) => x !== g[k])) { bad++; if (firstBad.length < 8) firstBad.push(i); if (!first) first = describe(i, g, w); }
  }
  }
  libRows.push({ pass: p, lanes: nLib, deposited, differFromGpu: bad, first, firstBad, seconds: secs,
                 status, flags, bankSha256: sha(bank) });
  console.log(`  libcft    : pass ${p}, ${nLib} lanes in ${secs.toFixed(1)} s (${deposited} deposit), ` +
              `${bad} differ from the GPU's records${first ? ` - first ${first}` : ""}; status ${status}`);
}
loaded.free();
let planeRow = null;
if (planes) {
  const gpuPlanes = readFileSync(join(DIR, man.planes.file));
  const ours = Buffer.from(u8(planes));
  writeFileSync(join(DIR, "planes.libcft.bin"), ours);
  let differ = 0;
  const g32 = new Uint32Array(gpuPlanes.buffer, gpuPlanes.byteOffset, gpuPlanes.byteLength / 4);
  for (let i = 0; i < planes.length; i++) if (planes[i] !== g32[i]) differ++;
  planeRow = { file: "planes.libcft.bin", sha256: sha(ours), gpuSha256: man.planes.sha256, wordsDiffer: differ };
  console.log(`  planes    : libcft's photograph ${planeRow.sha256.slice(0, 16)}, the GPU's ${man.planes.sha256.slice(0, 16)} - ` +
              (differ ? `${differ} words differ` : "identical"));
}

// ---- the card case
let pack = null;
if (PACK) {
  const out = join(DIR, "card");
  mkdirSync(out, { recursive: true });
  const put = (name, bytes) => { writeFileSync(join(out, name), bytes); return { file: name, sha256: sha(bytes) }; };
  const iaAll = Uint32Array.from({ length: total }, (_, i) => i);
  pack = {
    schema: "atlas-engine photo card case, 1",
    plate: plateId, frame: man.frame, device: man.device,
    image: put("camera.cftp", C.image),
    words: prog.counts.total, registers: prog.regsUsed, deposits: prog.results.map(d => d.name),
    a: put("camera.a.bin", u8(iaAll)),
    passes: banks.map((bank, p) => ({
      pass: p, bank: put(`camera.p${String(p).padStart(4, "0")}.bank`, bank),
      expect: { file: `../${man.records[p].file}`, sha256: man.records[p].sha256,
                what: "the GPU's records: five u32 a lane, x y r g b, x = 0xFFFFFFFF where nothing deposited" },
    })),
    planes: { file: `../${man.planes.file}`, sha256: man.planes.sha256, buffer: man.frame.buffer },
  };
  writeFileSync(join(out, "camera.json"), JSON.stringify(pack, null, 2) + "\n");
  console.log(`  card case : ${out} - camera.cftp (${C.image.length} bytes), ${banks.length} bank(s), ${total} lanes a pass`);
}

const summary = {
  schema: "atlas-engine photo-cft, 1", plate: plateId, frame: man.frame, gpu: man.device,
  program: { words: prog.counts.total, alu: prog.counts.alu, registers: prog.regsUsed, scratchSlots: prog.scratch.slots,
             hoisted: prog.hoist ? { slots: prog.hoist.count, opsOffTheLane: prog.hoist.removed } : null,
             folds: prog.folds, needs: prog.needs, imageSha256: sha(C.image) },
  uniformsDroppedByGl: C.absent,
  reference: refRows, libcft: libRows, planes: planeRow,
};
writeFileSync(join(DIR, "photo-cft.json"), JSON.stringify(summary, null, 2) + "\n");
const refBad = refRows.reduce((a, r) => a + r.differFromGpu, 0), libBad = libRows.reduce((a, r) => a + r.differFromGpu, 0);
console.log(refBad || libBad
  ? `\n  the card side and the GPU differ on ${refBad} reference and ${libBad} libcft sample(s) - see photo-cft.json`
  : `\n  every sample checked is the GPU's record, bit for bit, through the reference and through libcft`);
M.close();
