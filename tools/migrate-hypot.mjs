// One-shot migration: Math.hypot -> len2/len3.
//
// The emitter maps a walk's Math.hypot(a,b) onto GLSL length(vec2(a,b)),
// but GLSL's length is the naive sqrt of a dot product while JS's
// Math.hypot runs a scaling algorithm that is deliberately more
// accurate. They disagree for roughly 38% of argument pairs, worst
// relative 4.4e-16 - measured, not assumed. The more accurate answer is
// the wrong one here: the CPU evaluator's job is to say exactly what
// the GPU says, so the core now offers len2/len3 which spell the naive
// form, and the emitter refuses Math.hypot toward them.
//
// Run: node tools/migrate-hypot.mjs [--apply]
// Without --apply it only reports what it would change.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "positives");
const apply = process.argv.includes("--apply");

let files = 0, sites = 0;
for (const f of readdirSync(dir).filter(n => n.endsWith(".pos.mjs"))) {
  const p = join(dir, f);
  const src = readFileSync(p, "utf8");
  if (!src.includes("Math.hypot")) continue;
  // Math.hypot(a, b) and Math.hypot(a, b, c) -> len2 / len3. Arguments
  // can nest parentheses, so scan for the matching close paren rather
  // than trusting a regex to balance them.
  let out = "", i = 0, n = 0;
  for (;;) {
    const at = src.indexOf("Math.hypot(", i);
    if (at < 0) { out += src.slice(i); break; }
    out += src.slice(i, at);
    let j = at + "Math.hypot(".length, depth = 1, commas = 0;
    for (; j < src.length && depth > 0; j++) {
      const c = src[j];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === "," && depth === 1) commas++;
    }
    const inner = src.slice(at + "Math.hypot(".length, j - 1);
    out += (commas === 2 ? "len3(" : "len2(") + inner + ")";
    n++;
    i = j;
  }
  // make sure the helpers are imported from the core
  const need = [];
  if (/\blen2\(/.test(out)) need.push("len2");
  if (/\blen3\(/.test(out)) need.push("len3");
  const imp = /import\s*\{([^}]*)\}\s*from\s*"\.\.\/core\/measure\.mjs";/;
  const m = imp.exec(out);
  if (!m) { console.log(`${f}: SKIPPED, no core import found`); continue; }
  const have = m[1].split(",").map(s => s.trim()).filter(Boolean);
  const add = need.filter(x => !have.includes(x));
  if (add.length) {
    out = out.replace(imp, `import { ${have.concat(add).join(", ")} } from "../core/measure.mjs";`);
  }
  files++; sites += n;
  console.log(`${f}: ${n} site${n === 1 ? "" : "s"}${add.length ? `, import +${add.join("/")}` : ""}`);
  if (apply) writeFileSync(p, out);
}
console.log(`\n${apply ? "rewrote" : "would rewrite"} ${sites} sites across ${files} files`);
