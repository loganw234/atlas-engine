// The two registry-header functions the atlas port needs, extracted.
//
// EXTRACTED, NOT RETYPED - the same rule core/detlib.glsl.template
// follows. These are the bodies of `hashu` and `u2f` as they stand in
// atlas-darkroom's darkroom/shader.py (the shared shader header, lines
// 125-130 on 2026-09-07), which is the text every plate and every
// emitted positive calls. core/measure.mjs's JavaScript `hashu` and
// `u2f` are the CPU evaluator's copies of the same two functions and
// say so in their own comment ("the atlas's hash, verbatim
// (glsl-lib.js hashu)").
//
// They are here rather than in detlib.glsl.template because they are
// not det library functions: verify-pinned.mjs's HEADER_UNPINNED list
// records that the shared header belongs to the registry rather than
// to the engine. But docs/ATLAS.md's census names exactly these two as
// the operations that do not map onto the tile - the two 32-bit
// integer multiplies of lowbias32, and the integer-to-float conversion
// - so a sequencer target that left them out would be leaving out the
// only part of the workload that needs a new opcode.
//
// The decimal 2.3283064365386963e-10 is exactly 2^-32, so the front end
// has no rounding to disagree about - which matters, because this is
// the one decimal literal in the whole port and a decimal in GLSL
// source is parsed by the driver. The check below is the assertion, not
// the comment.

export const HEADER_SRC = `
uint hashu(uint x){
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16; return x;
}
float u2f(uint x){ return float(x) * 2.3283064365386963e-10; }
`;

// THE ONE DECIMAL LITERAL, CHECKED. Everything else in this port is a
// bit pattern; core/oracle.mjs exists so that no constant is ever
// spelled as a number twice. This one is spelled as a decimal in the
// shared header and cannot be moved without changing that header, so it
// is checked here instead: it must be exactly 2^-32, in which case
// every front end agrees about it.
{
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, Math.fround(2.3283064365386963e-10), true);
  const bits = b.getUint32(0, true) >>> 0;
  if (bits !== 0x2f800000)
    throw new Error(
      `glsl-header: u2f's 2.3283064365386963e-10 rounds to 0x` +
      `${bits.toString(16)}, not 2^-32 (0x2f800000) - the header's one ` +
      `decimal literal is not the number it is assumed to be`);
}

export const HEADER_PROVENANCE = {
  file: "atlas-darkroom/darkroom/shader.py",
  lines: "125-130",
  read: "2026-09-07",
  mirror: "atlas-engine core/measure.mjs hashu() and u2f()",
};
