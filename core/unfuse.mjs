// Every fma(a, b, c) as ((a) * (b) + (c)), innermost first.
//
// A port of `unfuse` in atlas-darkroom tools/determinism/bakearchive.py,
// which the darkroom's gendetlib.py runs over the whole det library
// before writing detlib.glsl. The library is WRITTEN with fma() because
// that is how the arithmetic reads, and it SHIPS without one: measured
// 2026-08-24, five of eleven stacks fold a fused multiply-add into a
// multiply and an add whatever `precise` says, and the unfused form is
// the one every stack computes identically. So the deployed library is
// fma-free, and a generator that wants to be byte-identical to it has
// to make the same rewrite in the same way.
//
// Ported rather than re-imagined: same innermost-first order, same
// parenthesis matching, same top-level comma split. The check that
// the port is faithful is tools/gen-detlib.mjs comparing its output
// against the darkroom's detlib.glsl byte for byte.

/** Top-level comma split of an argument list. */
export function splitArgs(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(a => a.trim());
}

/** Rewrite every fma call. Returns { text, count }. */
export function unfuse(src) {
  let n = 0;
  for (;;) {
    let best = null;
    const re = /\bfma\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const i = m.index + m[0].length - 1;
      let depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")") { depth--; if (depth === 0) break; }
      }
      if (j >= src.length) throw new Error("unbalanced parentheses after fma(");
      const inner = src.slice(i + 1, j);
      if (inner.includes("fma")) continue;          // not innermost yet
      best = [m.index, j, inner];
      break;
    }
    if (best === null) return { text: src, count: n };
    const [a, b, c] = splitArgs(best[2]);
    src = src.slice(0, best[0]) + `((${a}) * (${b}) + (${c}))` + src.slice(best[1] + 1);
    n++;
  }
}

/** True when no fma CALL remains. Comments may still name it. */
export function noFmaLeft(src) {
  return !/\bfma\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, ""));
}
