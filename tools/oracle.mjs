// The oracle's command line. The module itself lives in core/, where
// the emitter can import it without core depending on tools; this is
// the face verify-constants.py talks to, and `--json` is the join that
// lets Python check what JavaScript actually resolved.
import {
  names, record, approximation, approximations, f32, f32ToBits,
  COVERS, UNCOVERED, RECORD_PATH,
} from "../core/oracle.mjs";

const RECORD = RECORD_PATH;

// --------------------------------------------------------------- cli
function main(argv) {
  if (argv.includes("--json")) {
    // what THIS module resolved, for verify-constants.py to compare
    // against what it derived. Values as bit patterns, because a
    // decimal round-trip through two languages is exactly the kind of
    // thing that looks fine and is not.
    const out = {};
    for (const n of names()) out[n] = "0x" + f32ToBits(f32(n))
      .toString(16).toUpperCase().padStart(8, "0");
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return 0;
  }
  const cs = names(), as = approximations();
  console.log(`oracle: ${cs.length} constants, ${as.length} approximations`);
  console.log(`  record ${RECORD}`);
  const byKind = {};
  for (const n of cs) {
    const k = record(n).kind;
    (byKind[k] ||= []).push(n);
  }
  for (const [k, ns] of Object.entries(byKind))
    console.log(`  ${k.padEnd(8)} ${ns.length.toString().padStart(2)}  ` +
                ns.join(" "));
  console.log("\n  approximations:");
  for (const n of as) {
    const a = approximation(n);
    const b = a.bound;
    const [lo, hi] = Object.values(a.domain)[0];
    console.log(`    ${n.padEnd(14)} ${a.approximates.padEnd(18)} ` +
                `[${lo.toFixed(4)}, ${hi.toFixed(4)}]  ` +
                (b ? `fit <= ${b.fit_abs_max.toExponential(2)}, ` +
                     `chain <= ${b.chain_ulp_max} ulp`
                   : "NO BOUND RECORDED"));
  }
  const gaps = UNCOVERED.filter(x => !(x in COVERS));
  console.log(`\n  no deterministic form yet: ${gaps.join(", ")}`);
  console.log("  (Phase 2 must grow one or refuse them - not decide " +
              "silently)");
  return 0;
}

process.exit(main(process.argv.slice(2)));
