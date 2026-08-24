// Is every name the emitted GLSL uses actually in scope where it uses it?
//
// THE HOLE THIS FILLS. On 2026-08-24 a change to the emitter's
// common-subexpression cache reused a temporary across `} else {` -
// it computed the NET brace change per line, which is zero there, so
// entries bound in the branch that had just closed survived into the
// branch that opened. arnold emitted:
//
//     if ((ml_2 == 0.0)) {
//       precise float pb_44 = ((Om_3 - 0.5));
//       ...
//     } else {
//       px_42 = (pb_44 * 2.6);      // undefined variable
//
// Fifteen plates failed to bake. All five existing gates passed:
// verify-pinned reads the walk, compile-pinned EMITS GLSL but never
// hands it to a compiler, verify-orbit-block checks the orbit body's
// shape, ci-smoke runs the CPU evaluator, verify-bitwise checks
// operator semantics. None of them compiles anything, so a scoping
// error is invisible to CI by construction and it took a GPU bake to
// find - on a machine, at the end of a chain, hours later.
//
// This is deliberately NOT a GLSL parser. It is a scope tracker over
// the narrow shape the emitter produces, tuned to be over-permissive
// where it is unsure: a name declared in a for-header or a parameter
// list is credited to the enclosing scope rather than the loop body's,
// which can MISS an error but cannot invent one. A gate that cries
// wolf gets switched off.
//
//   node tools/verify-scope.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIRS = ["build/pinned", "build/unpinned"];

// GLSL 4.3 built-ins the emitter actually reaches for, plus the
// vertex/compute givens every shape function is handed.
const BUILTIN = new Set(`
abs min max floor ceil sign sqrt inversesqrt pow exp log exp2 log2
sin cos tan asin acos atan sinh cosh tanh mod fract clamp mix step
smoothstep length distance dot cross normalize fma round trunc
floatBitsToUint uintBitsToFloat intBitsToFloat floatBitsToInt
bitCount isnan isinf any all not lessThan greaterThan equal
vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 mat2 mat3 mat4
float int uint bool void precise in out inout const return break
continue if else for while do true false discard struct
gl_GlobalInvocationID gl_LocalInvocationID gl_WorkGroupID
gl_VertexID gl_InstanceID gl_Position gl_PointSize
uT TAU PI
`.trim().split(/\s+/));

// Everything the SHARED PREAMBLE defines. These files hold one shape
// function each; det_sincos, hashu, u2f and the rest live in
// detlib/detpre and are prepended at bake time, so a gate that only
// sees the shape function would call every one of them undefined.
// Read from the templates rather than listed here, so the allowlist
// cannot rot away from what the library actually provides.
for (const t of ["core/detlib.glsl.template", "core/detpre.glsl.template"]) {
  if (!existsSync(t)) continue;
  const src = readFileSync(t, "utf8");
  for (const m of src.matchAll(
    /^\s*(?:precise\s+)?(?:void|float|vec[234]|ivec[234]|uvec[234]|mat[234]|int|uint|bool)\s+([A-Za-z_]\w*)\s*\(/gm))
    BUILTIN.add(m[1]);
}

const TYPE = /^(?:precise\s+)?(?:float|vec2|vec3|vec4|int|uint|bool)\b/;

function checkFile(path) {
  const src = readFileSync(path, "utf8");
  const problems = [];

  // every function this file defines is callable anywhere in it
  const fileScope = new Set(BUILTIN);
  for (const m of src.matchAll(
    /^\s*(?:precise\s+)?(?:void|float|vec[234]|ivec[234]|uvec[234]|mat[234]|int|uint|bool)\s+([A-Za-z_]\w*)\s*\(/gm))
    fileScope.add(m[1]);
  // Uniforms and globals - AT COLUMN ZERO ONLY. With `^\s*` this
  // matched every indented temporary in the file and credited it to
  // file scope, so the checker reported 142 clean shaders while
  // seeing nothing at all. The self-test above is what found that.
  for (const m of src.matchAll(
    /^(?:uniform\s+|const\s+)?(?:precise\s+)?(?:float|vec[234]|ivec[234]|uvec[234]|mat[234]|int|uint|bool)\s+([A-Za-z_]\w*)/gm))
    fileScope.add(m[1]);

  const scopes = [fileScope];
  let inBlockComment = false;
  const declare = (n) => scopes[scopes.length - 1].add(n);
  const inScope = (n) => scopes.some((s) => s.has(n));

  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // MULTI-LINE BLOCK COMMENTS, tracked across lines. detlib and
    // detpre carry pages of prose in /* ... */ and a per-line strip
    // reads every word of it as an undefined identifier - a thousand
    // false alarms from two files, which is exactly how a gate earns
    // its way onto the ignore list.
    let line = raw;
    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end < 0) continue;
      inBlockComment = false;
      line = line.slice(end + 2);
    }
    line = line.replace(/\/\*[\s\S]*?\*\//g, " ");
    const open = line.indexOf("/*");
    if (open >= 0) { inBlockComment = true; line = line.slice(0, open); }
    line = line.replace(/\/\/.*$/, " ");

    // Declarations and parameters land in the CURRENT scope before the
    // braces on this line are processed. For a for-header or a
    // signature that credits them one level too high, which is the
    // safe direction.
    // `^\s*` and not `^`: every emitted declaration is indented, and
    // anchoring at column zero found none of them. It looked correct
    // only while the file-scope pre-pass above was wrongly sweeping
    // them all up - two defects hiding each other, both surfaced by
    // the self-test below.
    for (const m of line.matchAll(
      /(?:^\s*|[(;,{]\s*|\bout\s+|\bin\s+)(?:precise\s+)?(?:float|vec[234]|ivec[234]|uvec[234]|mat[234]|int|uint|bool)\s+([A-Za-z_]\w*)/g))
      declare(m[1]);
    // comma-continued declarators: `float a, b;`
    const decl = TYPE.exec(line.trim());
    if (decl)
      for (const m of line.matchAll(/,\s*([A-Za-z_]\w*)\s*(?=[,;=])/g))
        declare(m[1]);

    // now check every name this line READS
    for (const m of line.matchAll(/([A-Za-z_]\w*)/g)) {
      const n = m[1];
      const before = line[m.index - 1];
      const after = line.slice(m.index + n.length);
      if (before === ".") continue;                 // .x, .rgb, a member
      if (before && /[0-9]/.test(before)) continue; // the u of 1234u
      if (/^\s*\(/.test(after)) continue;           // a call
      if (/^\d/.test(n)) continue;
      if (inScope(n)) continue;
      if (/^\d+[uU]?$/.test(n)) continue;
      problems.push({ line: i + 1, name: n, text: raw.trim().slice(0, 90) });
    }

    // braces IN ORDER - the whole point. `} else {` must pop before it
    // pushes, or the else branch inherits the if branch's names, which
    // is precisely the bug this gate exists for.
    for (const ch of line) {
      if (ch === "{") scopes.push(new Set());
      else if (ch === "}" && scopes.length > 1) scopes.pop();
    }
  }
  return problems;
}

// SELF-TEST FIRST. A gate that passes because it checks nothing is
// worse than no gate, and this one has an exact bug to be measured
// against: the arnold emission of 2026-08-24. If the tracker cannot
// see that, it must not report on anything else.
{
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const d = mkdtempSync(join(tmpdir(), "scopecheck-"));
  const broken = `vec3 shape_probe(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  precise float px_42 = 0.0;
  if ((P[0] == 0.0)) {
    precise float pb_44 = ((P[1] - 0.5));
    px_42 = (pb_44 * 2.4);
  } else {
    px_42 = (pb_44 * 2.6);
  }
  return vec3(px_42, 0.0, 0.0);
}
`;
  // the same shader with the else branch declaring its own copy,
  // which is what a correct emitter produces and must NOT be flagged
  const ok = broken.replace(
    "    px_42 = (pb_44 * 2.6);",
    "    precise float pb_45 = ((P[1] - 0.5));\n    px_42 = (pb_45 * 2.6);");
  writeFileSync(join(d, "broken.glsl"), broken, "utf8");
  writeFileSync(join(d, "ok.glsl"), ok, "utf8");
  const b = checkFile(join(d, "broken.glsl"));
  const g = checkFile(join(d, "ok.glsl"));
  const caught = b.some((x) => x.name === "pb_44");
  if (!caught) {
    console.log("  FAIL  self-test: the arnold `} else {` bug is NOT detected");
    process.exit(1);
  }
  if (g.length) {
    console.log("  FAIL  self-test: a correct shader was flagged", g[0]);
    process.exit(1);
  }
  console.log("  ok    self-test: catches the `} else {` reuse, passes the fixed form");
}

let files = 0, bad = 0;
for (const d of DIRS) {
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((x) => x.endsWith(".glsl"))) {
    const p = join(d, f);
    const probs = checkFile(p);
    files++;
    if (probs.length) {
      bad++;
      console.log(`  FAIL  ${p}`);
      for (const q of probs.slice(0, 4))
        console.log(`          line ${q.line}: "${q.name}" is not in scope`
          + `\n            ${q.text}`);
      if (probs.length > 4)
        console.log(`          ...and ${probs.length - 4} more`);
    }
  }
}
console.log(bad
  ? `\n  ${bad} of ${files} emitted shaders reference a name out of scope`
  : `\n  every name in ${files} emitted shaders is in scope where it is used`);
process.exit(bad ? 1 : 0);
