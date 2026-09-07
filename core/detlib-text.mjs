// The one place the shipped det library's TEXT is assembled.
//
// core/detlib.glsl.template + core/constants.json, substituted through
// core/oracle.mjs and unfused through core/unfuse.mjs - the same two
// steps tools/gen-detlib.mjs takes before it compares the result byte
// for byte against the darkroom's deployed detlib.glsl. Anything that
// wants to READ the library rather than write it starts here, so no
// consumer can accidentally read the fused source and believe it is
// what the cards run.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { substitute } from "./oracle.mjs";
import { unfuse, noFmaLeft } from "./unfuse.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_PATH = join(HERE, "detlib.glsl.template");

/** The fused source, as written. Not what ships. */
export function fusedText() {
  return substitute(readFileSync(TEMPLATE_PATH, "utf8"));
}

/** What ships: every fma rewritten to a multiply and an add.
 *  Returns { text, fmaCount }. */
export function shippedText() {
  const { text, count } = unfuse(fusedText());
  if (!noFmaLeft(text)) throw new Error("detlib-text: an fma survived the rewrite");
  return { text, fmaCount: count };
}
