// Builds detlib.glsl from the VERIFIED constants, and proves it is the
// same library the darkroom already runs.
//
// The darkroom's gendetlib.py computes its constants inline in numpy at
// build time: nothing checks them, and a mistyped coefficient becomes a
// shipped one. Here the same template is filled from core/constants.json
// — a record that has to pass provenance, transcription against mpmath
// at 50 digits, measured behavioural bounds, a sha256 seal over every
// bit pattern, and a cross-check against that very generator.
//
// The template is EXTRACTED from gendetlib.py, never retyped. Its
// function bodies are the proven ones, whose cross-vendor hashes
// (27c0f355…, a71fe904…) are the pinned reference; re-deriving them
// here would be a silent version bump wearing a tidy-up's clothes.
//
// AND THE CHECK THAT MAKES THIS WORTH DOING: the generated file must be
// byte-identical to tools/determinism/detlib.glsl in the darkroom. Not
// equivalent, not equal after normalisation of the interesting parts —
// identical. That single comparison proves the record reproduces the
// deployed library exactly, so every guarantee the darkroom has earned
// for detlib.glsl transfers to anything the engine emits from the same
// constants.
//
//   node tools/gen-detlib.mjs            build and check
//   node tools/gen-detlib.mjs --write    also write build/detlib.glsl

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { substitute, names } from "../core/oracle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TEMPLATE = join(ROOT, "core", "detlib.glsl.template");
const OUT = join(ROOT, "build", "detlib.glsl");

// The darkroom is a sibling by default. A missing one is reported, not
// skipped silently — the byte comparison is the whole point of this
// file, and a run that quietly did not make it has proven nothing.
const DARKROOM = process.env.DARKROOM || join(ROOT, "..", "atlas-darkroom");
const PROVEN = join(DARKROOM, "tools", "determinism", "detlib.glsl");

const lf = s => s.replace(/\r\n/g, "\n");

function main(argv) {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const used = new Set([...tpl.matchAll(/@([A-Z][A-Z0-9_]*)/g)].map(m => m[1]));
  const have = new Set(names());

  const out = substitute(tpl);          // throws on any unknown name
  const left = out.match(/@[A-Z][A-Z0-9_]*/g);
  if (left) throw new Error(`unsubstituted placeholders: ${left.join(" ")}`);

  console.log(`detlib: ${out.length.toLocaleString()} chars from ` +
              `${used.size} constants`);

  // A constant in the record that the library never uses is not an
  // error, but it is worth saying: it means something was pinned for a
  // consumer that does not exist yet, or one that went away.
  const unused = [...have].filter(n => !used.has(n));
  if (unused.length)
    console.log(`  in the record but unused here: ${unused.join(" ")}`);
  const missing = [...used].filter(n => !have.has(n));
  if (missing.length)
    throw new Error(`template needs constants the record lacks: ` +
                    missing.join(" "));

  if (argv.includes("--write")) {
    mkdirSync(join(ROOT, "build"), { recursive: true });
    writeFileSync(OUT, out, "utf8");
    console.log(`  wrote ${OUT}`);
  }

  if (!existsSync(PROVEN)) {
    console.log(`\n  NOT CHECKED: no proven library at ${PROVEN}`);
    console.log("  Set DARKROOM, or accept that this run proved nothing " +
                "beyond the template parsing.");
    return 1;
  }
  const proven = lf(readFileSync(PROVEN, "utf8"));
  const mine = lf(out);
  if (mine === proven) {
    console.log(`\n  IDENTICAL to the darkroom's proven detlib.glsl ` +
                `(${proven.length.toLocaleString()} chars).`);
    console.log("  The verified record reproduces the deployed library " +
                "exactly.");
    return 0;
  }

  // Locate the first divergence, because "they differ" is not a bug
  // report.
  let i = 0;
  while (i < mine.length && i < proven.length && mine[i] === proven[i]) i++;
  const line = mine.slice(0, i).split("\n").length;
  const near = s => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
  console.log(`\n  DIFFERS from the proven library at line ${line}:`);
  console.log(`    proven:    ${near(proven)}`);
  console.log(`    generated: ${near(mine)}`);
  console.log(`  lengths ${proven.length} vs ${mine.length}`);
  return 1;
}

process.exit(main(process.argv.slice(2)));
