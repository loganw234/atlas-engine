// Every positive's smoke, against a list of the ones known to fail.
//
// `smoke-pos.mjs` takes one positive and exits nonzero if any row
// fails. Running it over sixty-nine of them in CI needs one more thing:
// three of them fail today, for reasons recorded in
// docs/known-smoke-failures.json, and a build that is red from the
// first commit is a build nobody reads.
//
// THE LIST FAILS BOTH WAYS, which is the whole reason it is a file
// rather than a `|| true`. A plate not on it that starts failing is a
// regression and stops the build. A plate ON it that starts passing is
// a stale list and also stops the build - because a tolerated failure
// that quietly got fixed is how a list becomes a place where things go
// to be forgotten.
//
//   node tools/ci-smoke.mjs            every positive
//   node tools/ci-smoke.mjs --list     what is tolerated, and why

import { readdirSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const POS = join(ROOT, "positives");
const KNOWN = JSON.parse(readFileSync(
  join(ROOT, "docs", "known-smoke-failures.json"), "utf8"));

if (process.argv.includes("--list")) {
  console.log(KNOWN.what + "\n");
  for (const [id, r] of Object.entries(KNOWN.plates))
    console.log(`  ${id}\n      row      ${r.row}\n      measured ${r.measured}` +
                `\n      rule     ${r.rule}\n      why      ${r.why}\n`);
  process.exit(0);
}

const ids = readdirSync(POS).filter(f => f.endsWith(".pos.mjs"))
  .map(f => f.slice(0, -".pos.mjs".length)).sort();

// Four at a time: node startup dominates and the walks are pure CPU,
// so this is most of the wall clock back for no complexity.
const LANES = 4;
function run(id) {
  return new Promise((resolve) => {
    execFile(process.execPath, [join(HERE, "smoke-pos.mjs"),
                                join(POS, `${id}.pos.mjs`)],
      { maxBuffer: 1 << 24 }, (err, stdout) => {
        const rows = stdout.split("\n")
          .filter(l => l.startsWith("FAIL "))
          .map(l => l.slice(5).trim().split(/\s{2,}/)[0]);
        resolve({ id, failed: !!err, rows, out: stdout });
      });
  });
}

const results = [];
for (let i = 0; i < ids.length; i += LANES)
  results.push(...await Promise.all(ids.slice(i, i + LANES).map(run)));

const failing = new Map(results.filter(r => r.failed).map(r => [r.id, r]));
const tolerated = new Set(Object.keys(KNOWN.plates));

const unexpected = [...failing.keys()].filter(id => !tolerated.has(id));
const healed = [...tolerated].filter(id => !failing.has(id));

console.log(`positives smoked : ${ids.length}`);
console.log(`passing          : ${ids.length - failing.size}`);
console.log(`failing          : ${failing.size}` +
            (failing.size ? `   ${[...failing.keys()].join(" ")}` : ""));
console.log(`tolerated by docs/known-smoke-failures.json : ${tolerated.size}`);

if (unexpected.length) {
  console.log("\nREGRESSION - these fail and are not on the list:");
  for (const id of unexpected) {
    console.log(`\n  ${id}`);
    for (const l of failing.get(id).out.split("\n"))
      if (l.startsWith("FAIL ") || l.startsWith("WARN "))
        console.log(`      ${l.trim()}`);
  }
}

if (healed.length) {
  console.log("\nSTALE LIST - these are tolerated but now pass:");
  for (const id of healed)
    console.log(`  ${id}  -  remove it from docs/known-smoke-failures.json`);
  console.log("A tolerated failure that got fixed has to leave the list, or");
  console.log("the list stops being a record of what is actually wrong.");
}

// A tolerated plate that fails a DIFFERENT row is not the failure that
// was tolerated. The list names the row, so check it.
const drifted = [];
for (const [id, r] of failing) {
  if (!tolerated.has(id)) continue;
  const want = KNOWN.plates[id].row;
  if (!r.rows.includes(want))
    drifted.push(`${id}: list says "${want}", smoke failed ${JSON.stringify(r.rows)}`);
}
if (drifted.length) {
  console.log("\nDIFFERENT FAILURE - tolerated, but not the tolerated row:");
  for (const d of drifted) console.log(`  ${d}`);
}

const bad = unexpected.length + healed.length + drifted.length;
if (!bad) console.log("\nsmoke matches the record");
process.exit(bad ? 1 : 0);
