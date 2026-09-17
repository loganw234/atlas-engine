// A frame's own sample points, as the program's three input streams.
//
// One definition, shared by tools/verify-cft-positive.mjs (which holds
// a program to its emitted text at these samples) and tools/cft-streams.mjs
// (which writes them at card scale), so a stream file made for a
// silicon run is the stream the verifier scored and not a retyping of it.
//
// The samples follow the atlas header's own derivation from the sample
// index `ia`: q from the R2 sequence's two fixed-point multipliers, rnd.x
// and seed from the header's hash chain. Half the lanes take `ia` from 0
// upward and half spread it across the index range by the header's hash,
// so a run covers both the start of a frame and the rest of it. The two
// prologue statements then run on the host (core/emit-cft.mjs says why
// that costs the parity claim nothing), and their result, the stream
// state `pt`, is the third stream.

import { bits as f32bits } from "./glsl-f32.mjs";
import { hashu, u2f } from "./measure.mjs";
import { hostPrologue } from "./emit-cft.mjs";

/** The sample index lane `i` of `n` evaluates. */
export const sampleIndex = (i, n) => (i < n / 2 ? i >>> 0 : hashu((i ^ 0xA7C4F3D1) >>> 0));

/** Streams for `n` lanes of a lowered positive `L` (lowerPositive's
 *  result): qx, qy (binary32 bit patterns), rx and seed (what the
 *  prologue reads) and ptc (the stream state the program takes). */
export function frameSamples(L, n) {
  const qx = new Uint32Array(n), qy = new Uint32Array(n), rx = new Uint32Array(n), seed = new Uint32Array(n);
  const ptc = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const ia = sampleIndex(i, n);
    const qxf = u2f(Math.imul(ia, 3242174889) >>> 0);
    const qyf = u2f(Math.imul(ia, 2447445414) >>> 0);
    const h1 = hashu(ia), h2 = hashu(h1), h3 = hashu(h2), h4 = hashu(h3);
    qx[i] = f32bits(qxf); qy[i] = f32bits(qyf); rx[i] = f32bits(u2f(h1)); seed[i] = h4;
    ptc[i] = hostPrologue(L.ref, L.prologue, { qx: qxf, qy: qyf, rndx: u2f(h1), seed: h4 });
  }
  return { qx, qy, rx, seed, ptc };
}
