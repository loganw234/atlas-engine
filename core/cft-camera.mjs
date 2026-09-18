// The darkroom's camera around a positive, as the sequencer program the
// card runs for a photograph.
//
// A photograph in atlas-darkroom is its deterministic compute kernel run
// over every sample of every pass: `splat(ia)` derives q, rnd and the seed
// from the sample index, calls the plate's shape function, carries the
// point through the lens and the projection to a pixel, quantises its
// colour to fixed point, and hands the three integers to imageAtomicAdd.
// Integer addition is associative, so the negative is the same whatever
// order the samples arrive in - which is what makes it possible to compute
// the samples somewhere else entirely and add them on the host.
//
// This file turns that kernel's text into the TILE FORM: the same text,
// with only these mechanical edits, each of which leaves what a sample
// computes unchanged:
//
//   - the pieces that belong to a GPU dispatch and not to a sample are
//     removed: #version, the layout and image and buffer declarations, the
//     ADDF macro, the sample-count atomic, and main();
//   - splat(uint ia) takes five out parameters - the pixel and the three
//     quantised channels - initialised to the "no deposit" record, so an
//     early `return;` (behind the eye, off the tile, vignetted) leaves it;
//   - each ADDF(acc, px, v) becomes the macro's own expression,
//     uint(clamp(v * DET_FIX_SCALE + 0.5, 0.0, 4200000000.0)), assigned to
//     that channel's out parameter - adding a zero is adding nothing, so
//     the macro's `if (_q != 0u)` guard needs no counterpart;
//   - the eight-lever copy loop `P[i] = uP[i]` is dropped and the shape
//     function is handed `uP` itself, which it only reads.
//
// The GPU's side of the comparison, captureKernelOf(), makes the SAME
// record edits to the untouched kernel - everything else, the copy loop
// included, as the darkroom compiles it - and writes the record to a
// buffer indexed by sample, so the two are compared sample by sample.

/** Remove the lines that only a GPU dispatch reads. */
function stripDispatch(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inMain = false, depth = 0;
  for (const line of lines) {
    const s = line.trim();
    if (inMain) {
      depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (depth <= 0) inMain = false;
      continue;
    }
    if (/^void main\s*\(\s*\)\s*{/.test(s)) {
      inMain = true;
      depth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (depth <= 0) inMain = false;
      continue;
    }
    if (s.startsWith("#version") || s.startsWith("#define ADDF") || /^layout\s*\(/.test(s)) continue;
    out.push(line);
  }
  return out.join("\n");
}

const RECORD_PARAMS = "out int recX, out int recY, out uint recR, out uint recG, out uint recB";
const RECORD_INIT = "recX = -1; recY = -1; recR = 0u; recG = 0u; recB = 0u;";
const quantise = (v) => `uint(clamp(((${v}) * (DET_FIX_SCALE) + (0.5)), 0.0, 4200000000.0))`;

/** The record edits, shared by both forms: splat's signature, its first
 *  statement, and its three ADDF sites. */
function recordEdits(text, { plateId }) {
  let t = text;
  const sig = /void splat\(uint ia\)\{/;
  if (!sig.test(t)) throw new Error("cft-camera: no `void splat(uint ia){` in the kernel");
  t = t.replace(sig, `void splat(uint ia, ${RECORD_PARAMS}){\n  ${RECORD_INIT}`);
  const adds = [...t.matchAll(/ADDF\((acc[RGB]), px, vCol\.([rgb])\);/g)];
  if (adds.length !== 3) throw new Error(`cft-camera: ${adds.length} ADDF sites, not three`);
  let first = true;
  t = t.replace(/ADDF\((acc[RGB]), px, vCol\.([rgb])\);/g, (m, acc, ch) => {
    const set = `rec${ch.toUpperCase()} = ${quantise(`vCol.${ch}`)};`;
    const px = first ? "recX = px.x; recY = px.y; " : "";
    first = false;
    return px + set;
  });
  const cnt = /if\s*\(uDoCount == 1\)\s*atomicAdd\(samplesPassed, 1u\);/;
  if (!cnt.test(t)) throw new Error("cft-camera: the sample-count atomic is not where it was");
  t = t.replace(cnt, "");
  if (!new RegExp(`shape_${plateId}\\(q, rnd, h4, P, col\\)`).test(t))
    throw new Error(`cft-camera: splat does not call shape_${plateId}(q, rnd, h4, P, col)`);
  return t;
}

/** The kernel as the lowering reads it. */
export function tileFormOf(kernelText, { plateId }) {
  let t = recordEdits(stripDispatch(kernelText), { plateId });
  const copy = /precise float P\[8\];\s*for\s*\(int i = 0; i < 8; i\+\+\)\{ P\[i\] = uP\[i\]; \}/;
  if (!copy.test(t)) throw new Error("cft-camera: the lever copy loop is not where it was");
  t = t.replace(copy, "");
  t = t.replace(new RegExp(`shape_${plateId}\\(q, rnd, h4, P, col\\)`), `shape_${plateId}(q, rnd, h4, uP, col)`);
  return t;
}

/** The kernel as the GPU capture compiles it: the darkroom's own text,
 *  the record edits, and a buffer the record goes to. The dispatch is the
 *  darkroom's, eight samples an invocation. */
export function captureKernelOf(kernelText, { plateId }) {
  let t = recordEdits(kernelText.replace(/\r\n/g, "\n"), { plateId });
  const main = /void main\(\)\{[\s\S]*?\n\}\s*$/;
  if (!main.test(t)) throw new Error("cft-camera: main() is not the last function");
  t = t.replace(main, `layout(std430, binding = 6) buffer Rec { uint rec[]; };
void main(){
  uint gid = gl_GlobalInvocationID.x;
  for(uint k = 0u; k < 8u; k++){
    uint i = gid * 8u + k;
    if(i >= uCountN) return;
    int x; int y; uint r; uint g; uint b;
    splat(uFirst + i, x, y, r, g, b);
    rec[i * 5u + 0u] = uint(x); rec[i * 5u + 1u] = uint(y);
    rec[i * 5u + 2u] = r; rec[i * 5u + 3u] = g; rec[i * 5u + 4u] = b;
  }
}
`);
  return t;
}

/** The record layout both sides write: five 32-bit words a sample. */
export const RECORD = { words: 5, names: ["x", "y", "r", "g", "b"], none: { x: -1, y: -1 } };

// ------------------------------------------------ the camera, lowered
//
// THE PROGRAM IS SPECIALISED TO ONE FRAME. Every uniform but two is bound
// to the bits GL held when the darkroom aimed the frame (tools/photo-
// gpu.py reads them back from the program), so the lens's settings are
// constants and a pinhole's lens branches are never lowered at all
// (core/cft-lower.mjs folds a known condition). The two that change per
// pass - uSeqOffset, the Cranley-Patterson rotation, and uSeedSalt - are
// the per-run tail: slots 0 and 1, and 2. The sample index is the one
// input stream; the five words of the record are the deposits.

export const CAMERA_TAIL = { uSeqOffset: [0, 1], uSeedSalt: 2, size: 3 };

/** The unit's explicitly `uniform` globals, from the text: the parser
 *  gives a bare global (the clock, vCol) the same qualifier, and those
 *  are the camera's own variables, not the darkroom's settings. */
export function uniformNamesOf(text) {
  const names = new Set();
  const src = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  for (const m of src.matchAll(/^\s*uniform\s+\w+\s+(\w+)/gm)) names.add(m[1]);
  return names;
}

/** A uniform's GL bytes (hex, little-endian 32-bit words) as the leaves
 *  of its type: a word per scalar, a vector's components, an array's
 *  elements - padded with zeros past the ACTIVE length a driver may
 *  report - and a matrix's columns (GL holds a mat4 column-major). A
 *  bool is the predicate this target uses, 1.0 or +0.0. */
export function uniformBits(type, hex) {
  const words = [];
  for (let i = 0; i + 8 <= hex.length; i += 8) {
    const le = hex.slice(i, i + 8).match(/../g).reverse().join("");
    words.push(Number.parseInt(le, 16) >>> 0);
  }
  const vec = { vec2: 2, vec3: 3, vec4: 4, ivec2: 2, ivec3: 3, ivec4: 4, uvec2: 2, uvec3: 3, uvec4: 4 };
  const mat = { mat2: 2, mat3: 3, mat4: 4 };
  const arr = /^(\w+)\[(\d+)\]$/.exec(type);
  if (arr) { const n = Number(arr[2]); while (words.length < n) words.push(0); return words.slice(0, n); }
  if (mat[type]) { const n = mat[type]; return Array.from({ length: n }, (_, c) => words.slice(c * n, c * n + n)); }
  if (vec[type]) return words.slice(0, vec[type]);
  if (type === "bool") return words[0] ? 0x3F800000 : 0;
  return words[0] >>> 0;
}

/** The same leaves as the reference interpreter's values: floats from
 *  their bits, integers as integers. */
export function uniformValue(type, bits, asF32) {
  const elem = type.startsWith("ivec") || type.startsWith("int") ? "int"
             : type.startsWith("uvec") || type.startsWith("uint") ? "uint"
             : type === "bool" ? "bool" : "float";
  const leaf = (b) => (elem === "float" ? asF32(b) : elem === "int" ? b | 0 : elem === "uint" ? b >>> 0 : b !== 0);
  const walk = (x) => (Array.isArray(x) ? x.map(walk) : leaf(x));
  return walk(bits);
}

/** Lower the camera around a plate for one frame.
 *    kernel    the compute source the darkroom compiled (photo-gpu's kernel.glsl)
 *    uniforms  { name: { bytes: hex } } as photo-gpu read them back
 *    perPass   [{ uSeqOffset: hex, uSeedSalt: hex }] - pass 0's become the
 *              lowering's tail values; bankFor() gives any pass's bank
 *  Returns the tile form, the two libraries, the program and its image. */
export async function lowerCamera({ kernel, plateId, uniforms, perPass, core = "." }) {
  const { DetLib, asF32, bits: f32bits } = await import(`${core}/glsl-f32.mjs`);
  const { lowerFunction } = await import(`${core}/cft-lower.mjs`);
  const { imageBytes, bankBytes } = await import(`${core}/cft-isa.mjs`);
  const text = tileFormOf(kernel, { plateId });
  const ref = new DetLib(text);
  const low = new DetLib(text);
  const declared = uniformNamesOf(text);
  const bind = { params: { ia: { stream: 0 } }, globals: {} };
  const values = {};
  const absent = [];
  for (const name of declared) {
    const g = low.globalDecls.get(name);
    if (!g) continue;
    if (name in CAMERA_TAIL) continue;
    const u = uniforms[name];
    // A UNIFORM GL DOES NOT HOLD IS ONE NO LIVE PATH READS - the linker
    // drops exactly those - so zero stands in for it, and says so.
    const bits = u ? uniformBits(g.type, u.bytes) : uniformBits(g.type, "");
    if (!u) absent.push(name);
    bind.globals[name] = { bits };
    values[name] = uniformValue(g.type, bits, asF32);
  }
  bind.globals.uSeqOffset = { tail: CAMERA_TAIL.uSeqOffset };
  bind.globals.uSeedSalt = { tail: CAMERA_TAIL.uSeedSalt };
  const tailOf = (pp) => [...uniformBits("vec2", pp.uSeqOffset), uniformBits("uint", pp.uSeedSalt)];
  const tailValues = tailOf(perPass[0]);
  const prog = lowerFunction(low, "splat", { isaExt: true, bind, tailValues, hoist: true });
  const strict = prog.scratch.slots > 0;
  const image = prog.words
    ? imageBytes({ insns: prog.words, consts: prog.consts, nConsts: prog.consts.length,
                   maxDeposits: prog.results.length, precisionCode: 0, bankExt: true, scratchStrict: strict })
    : null;
  /** The reference's globals for one pass. */
  const setPass = (lib, pp) => {
    for (const [n, v] of Object.entries(values)) lib.setGlobal(n, v);
    lib.setGlobal("uSeqOffset", uniformValue("vec2", uniformBits("vec2", pp.uSeqOffset), asF32));
    lib.setGlobal("uSeedSalt", uniformBits("uint", pp.uSeedSalt));
  };
  /** One pass's bank: the program's constants, the hoisted per-run
   *  values libcft computes for this pass's tail, then the tail. */
  const bankFor = (pp, machine) => {
    const consts = prog.consts.slice();
    const tail = tailOf(pp);
    tail.forEach((b, i) => { consts[prog.tailBase + i] = b >>> 0; });
    if (prog.hoist) {
      const vals = machine.hoisted(prog.hoist, tail);
      vals.forEach((v, j) => { consts[prog.hoist.base + j] = v >>> 0; });
    }
    return bankBytes(consts);
  };
  return { text, ref, low, prog, image, bind, values, absent, tailOf, setPass, bankFor, f32bits };
}
