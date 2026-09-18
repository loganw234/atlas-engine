// A photograph's deposit buffers, added into its planes on the host.
//
//   node tools/photo-bin.mjs --manifest DIR/photo-gpu.json --out planes.bin DEPOSITS.bin ...
//
// Each buffer is one pass's run: five u32 a lane - x, y, r, g, b - in lane
// order, x = 0xFFFFFFFF where the sample deposited nothing (the record
// tools/photo-gpu.py captures and the camera program deposits). The planes
// are three u32 arrays of the tile buffer's size, rows bottom-up, and each
// channel's word is added into its pixel with the wrap imageAtomicAdd has.
// Integer addition is associative, so the order the passes or the lanes
// arrive in cannot change a word - which is what lets the samples be
// computed anywhere at all.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const man = JSON.parse(readFileSync(opt("--manifest"), "utf8"));
const out = opt("--out");
const files = argv.filter((a, i) => !a.startsWith("--") && !["--manifest", "--out"].includes(argv[i - 1]));
const [bw, bh] = man.frame.buffer;
const planes = new Uint32Array(3 * bw * bh);
let lanes = 0, deposited = 0;
for (const f of files) {
  const b = readFileSync(f);
  const d = new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  if (d.length % 5) throw new Error(`photo-bin: ${f} is not five words a lane`);
  for (let i = 0; i < d.length; i += 5) {
    lanes++;
    const x = d[i], y = d[i + 1];
    if (x === 0xFFFFFFFF) continue;
    if (x >= bw || y >= bh) throw new Error(`photo-bin: ${f} lane ${i / 5} deposits outside the buffer (${x}, ${y})`);
    deposited++;
    for (let c = 0; c < 3; c++) {
      const at = c * bw * bh + y * bw + x;
      planes[at] = (planes[at] + d[i + 2 + c]) >>> 0;
    }
  }
}
const bytes = Buffer.from(planes.buffer);
writeFileSync(out, bytes);
const sha = createHash("sha256").update(bytes).digest("hex");
console.log(JSON.stringify({ planes: out, sha256: sha, gpuSha256: man.planes.sha256, identical: sha === man.planes.sha256,
                             passes: files.length, lanes, deposited }));
