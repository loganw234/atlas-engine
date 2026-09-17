// The corpus as a program-model test set for cft-fp256 conforming
// implementations: every positive, at its lever defaults and at a hashed
// setting, as an image, a bank, three input streams and the deposit
// buffer every evaluation here agreed on.
//
//   node tools/pack-cft-set.mjs [--out build/cft/program-set] [--points 1001]
//        [--golden 16] [--levers 7] [--jobs 6] [positives/x.pos.mjs ...]
//   node tools/pack-cft-set.mjs --finalize-only [--out ...]
//
// WHY THIS EXISTS. cft-fp256's conformance profile (CONFORMANCE.md,
// profile 1, 2026-09-16) makes the program model normative - "a
// conforming implementation runs an image bit for bit as the model does,
// or refuses it by name" - but its identity, the hashed vector sets and
// the four checksum lines, holds operations only. The one program check
// it names compares a device against that project's own software
// backend. This set is scored the other way round: its expected outputs
// come from an evaluation that project did not write - the emitted GLSL
// interpreted at binary32 - agreed by libcft, the golden model, the
// assembler and the runner, and every program in it is a real workload
// rather than a generated one.
//
// Each case is produced by tools/verify-cft-positive.mjs --pack, which
// writes nothing for a case that did not agree everywhere. This file
// runs those in parallel and then writes the manifest, the checksums,
// the README and run_set.py, the replayer that goes with the files.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = resolve(opt("--out", join(ROOT, "build", "cft", "program-set")));
const POINTS = opt("--points", "1001");
const GOLDEN = opt("--golden", "16");
const LEVERS = opt("--levers", "7");
const JOBS = Number(opt("--jobs", "6"));
const FINALIZE_ONLY = argv.includes("--finalize-only");
const named = argv.filter((a, i) => a.endsWith(".pos.mjs") && !["--out"].includes(argv[i - 1]));
const positives = named.length ? named.map(f => resolve(f))
  : readdirSync(join(ROOT, "positives")).filter(f => f.endsWith(".pos.mjs")).sort().map(f => join(ROOT, "positives", f));

const LOGS = join(OUT, "logs");
const sha = (b) => createHash("sha256").update(b).digest("hex");

async function packAll() {
  mkdirSync(LOGS, { recursive: true });
  const jobs = [];
  for (const f of positives) {
    jobs.push({ f, levers: null });
    if (LEVERS !== "none") jobs.push({ f, levers: LEVERS });
  }
  const results = [];
  let next = 0, running = 0, done = 0;
  const t0 = Date.now();
  await new Promise((resolveAll) => {
    const launch = () => {
      while (running < JOBS && next < jobs.length) {
        const j = jobs[next++];
        running++;
        const id = basename(j.f).replace(/\.pos\.mjs$/, "");
        const caseName = j.levers === null ? id : `${id}.levers-${j.levers}`;
        const args = [join(HERE, "verify-cft-positive.mjs"), j.f, "--points", POINTS, "--golden", GOLDEN, "--pack", OUT];
        if (j.levers !== null) args.push("--levers", j.levers);
        const started = Date.now();
        const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
        let log = "";
        child.stdout.on("data", (d) => { log += d; });
        child.stderr.on("data", (d) => { log += d; });
        child.on("close", (code) => {
          writeFileSync(join(LOGS, `${caseName}.log`), log);
          const packed = /\n  packed /.test(log);
          results.push({ case: caseName, exit: code, packed, seconds: (Date.now() - started) / 1000,
                         why: packed ? "" : (log.match(/NOT PACKED:[^\n]*/) || log.trim().split("\n").slice(-1))[0] });
          running--; done++;
          console.log(`[${String(done).padStart(3)}/${jobs.length}] ${caseName.padEnd(24)} exit ${code} ` +
                      `${packed ? "packed" : "NOT PACKED - " + results[results.length - 1].why} ` +
                      `(${((Date.now() - started) / 1000).toFixed(0)} s)`);
          if (done === jobs.length) resolveAll(); else launch();
        });
      }
    };
    launch();
  });
  results.sort((a, b) => a.case.localeCompare(b.case));
  writeFileSync(join(OUT, "pack-results.json"), JSON.stringify({ seconds: (Date.now() - t0) / 1000, results }, null, 2) + "\n");
  return results;
}

const README = (m) => `# atlas-engine programs for cft-fp256

A program-model test set: **${m.cases} cases**, ${m.positives} positives at their
lever defaults and at a hashed lever setting, ${m.lanes} lanes each, binary32.
Generated ${m.generated} by atlas-engine \`tools/pack-cft-set.mjs\` at
${m.atlasEngine}, against cft-fp256 ${m.cftFp256}.

## What a case is

Every case is seven files named for it:

| file | what |
|---|---|
| \`<case>.cftp\` | the image: header, instructions; \`BANK_EXT\`, and \`SCRATCH_STRICT\` where it touches the scratch |
| \`<case>.cfta\` | the same program in the assembly text form; \`asm.py\` assembles it to the image's exact bytes |
| \`<case>.bank\` | the constant bank the run brings: the program's constants, then \`P[0..7]\` and the clock |
| \`<case>.a.bin\`, \`.b.bin\`, \`.c.bin\` | the three input streams: \`q.x\`, \`q.y\` (binary32) and the stream state \`pt\` (uint32) |
| \`<case>.deposits.bin\` | the expected deposit buffer, lane-major, \`lanes x maxDeposits\` binary32 values |
| \`<case>.json\` | what the case needs, what agreed on it, and every file's SHA-256 |

\`manifest.jsonl\` is one case record a line; \`SHA256SUMS\` covers every file.
A probe case - a record with no \`positive\` - has no bank and no third
stream, and says so in its record by leaving them out.

## Where the expected bits come from

Not from cft-fp256. Each positive is a shape function atlas-engine's emitter
writes as pinned GLSL - the text sixty-eight plates render from, bit-identical
across twenty-four GPU stacks. The expected deposits are that text interpreted
at binary32, one rounding per operation, and a case is in this set only if all
of these agreed on every deposit of every lane:

- libcft's \`cft_program_load\` and \`cft_program_run_bank\` on the software
  backend, all lanes, with \`cft_program_digest\` equal to SHA-256 of image then bank
- \`python/cft_golden/seq.py\` on the first ${m.goldenLanes} lanes
- \`python/cft_golden/asm.py\` assembling the \`.cfta\` to the image's bytes
- \`host/positive-run\` on the same files, where it would load the image

Deposit counts are the program's result count on every lane, and a clean run's
STATUS is zero; the IEEE flags are recorded per case as the union libcft
reported over all lanes.

## What the set exercises

${m.coverage}

## Running it

    python3 run_set.py --runner <cft-fp256>/host/positive-run --device sw
    python3 run_set.py --runner <cft-fp256>/host/positive-run --device <image.xclbin>

The replayer checks \`SHA256SUMS\` first, then runs every case and compares the
deposit buffer byte for byte, the deposit SHA-256 the runner prints, the
program digest, the flags, the status and the counts. A mismatch names the
first lane and deposit that differ. A runner that refuses an image by name is
reported as REFUSED, not as a mismatch - the profile's rule, and the honest
count for a tool whose own header check is narrower than the device's.

**A known refusal at cft-fp256 56ad0cd.** \`host/tools/positive-run.c\` keeps its
own \`FLAGS_KNOWN\` as \`BANK_EXT | SCRATCH_IO\` and refuses \`SCRATCH_STRICT\`,
though libcft, the assembler and every card image since the revision-4 pair
take it. The ${m.strictCases} cases whose images set the bit are REFUSED by that
binary until the flag is added to that tool's subset.
`;

const RUN_SET_PY = String.raw`#!/usr/bin/env python3
"""Replay atlas-engine's program set through cft-fp256's positive-run.

    python3 run_set.py --runner PATH/positive-run --device sw|IMAGE.xclbin
                       [--cases hopf,nested.levers-7] [--log results.jsonl]
                       [--keep DIR]

Checks SHA256SUMS, then for every case in manifest.jsonl runs

    positive-run CASE.cftp --a CASE.a.bin --b CASE.b.bin --c CASE.c.bin
                 --bank CASE.bank --out DEPOSITS --device DEVICE

and holds the output to the case record: the deposit buffer byte for byte,
the SHA-256 the runner prints, the program digest, flags, status and
counts. Exit 0 when every case matched, 1 when any mismatched, 2 when none
mismatched but some were refused by name. Standard library only.
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def check_sums():
    bad = []
    with open(os.path.join(HERE, "SHA256SUMS"), encoding="utf-8") as f:
        for line in f:
            want, name = line.rstrip("\n").split("  ", 1)
            if sha256_file(os.path.join(HERE, name)) != want:
                bad.append(name)
    return bad


def field(out, key):
    m = re.search(r"^" + re.escape(key) + r"\s+(\S+)", out, re.M)
    return m.group(1) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runner", required=True)
    ap.add_argument("--device", default="sw")
    ap.add_argument("--cases", default="")
    ap.add_argument("--log", default="")
    ap.add_argument("--keep", default="")
    ap.add_argument("--no-sums", action="store_true")
    a = ap.parse_args()

    if not a.no_sums:
        bad = check_sums()
        if bad:
            print("SHA256SUMS: %d file(s) differ: %s" % (len(bad), ", ".join(bad[:8])))
            return 1
        print("SHA256SUMS: every file matches")

    with open(os.path.join(HERE, "manifest.jsonl"), encoding="utf-8") as f:
        cases = [json.loads(l) for l in f if l.strip()]
    if a.cases:
        want = set(a.cases.split(","))
        cases = [c for c in cases if c["case"] in want]

    logf = open(a.log, "a", encoding="utf-8") if a.log else None
    tmp = a.keep or tempfile.mkdtemp(prefix="atlas-set-")
    os.makedirs(tmp, exist_ok=True)
    n_ok = n_bad = n_ref = 0
    for c in cases:
        name = c["case"]
        p = lambda suffix: os.path.join(HERE, name + suffix)
        out_path = os.path.join(tmp, name + ".deposits.bin")
        cmd = [a.runner, p(".cftp"), "--a", p(".a.bin")]
        for s in ("b", "c"):
            if s in c["streams"]:
                cmd += ["--" + s, p("." + s + ".bin")]
        if c.get("bank"):
            cmd += ["--bank", p(".bank")]
        cmd += ["--out", out_path, "--device", a.device]
        t0 = time.monotonic()
        r = subprocess.run(cmd, capture_output=True, text=True)
        secs = time.monotonic() - t0
        out = r.stdout + r.stderr
        rec = {"case": name, "device": a.device, "exit": r.returncode, "seconds": round(secs, 4),
               "lanes": c["lanes"], "words": c["image"]["words"]}
        if r.returncode != 0:
            refused = re.search(r"refus|only .* are defined|not supported|does not publish|needs", out, re.I)
            rec["verdict"] = "REFUSED" if refused else "ERROR"
            rec["message"] = out.strip().splitlines()[-1] if out.strip() else ""
            n_ref += 1 if refused else 0
            n_bad += 0 if refused else 1
        else:
            e = c["expect"]
            problems = []
            got_sha = sha256_file(out_path) if os.path.exists(out_path) else None
            if got_sha != e["deposits"]["sha256"]:
                problems.append("deposit buffer")
                if got_sha:
                    D = c["image"]["maxDeposits"]
                    with open(out_path, "rb") as f1, open(p(".deposits.bin"), "rb") as f2:
                        g, w = f1.read(), f2.read()
                    for i in range(0, min(len(g), len(w)), 4):
                        if g[i:i + 4] != w[i:i + 4]:
                            lane, d = divmod(i // 4, D)
                            rec["first"] = {"lane": lane, "deposit": e["deposits"]["names"][d],
                                            "want": w[i:i + 4][::-1].hex(), "got": g[i:i + 4][::-1].hex()}
                            break
            printed = field(out, "sha256")
            if printed and printed != e["deposits"]["sha256"]:
                problems.append("printed sha256")
            dig = field(out, "digest")
            if dig and dig != e["digest"]:
                problems.append("digest")
            flags = field(out, "flags")
            if flags is not None and int(flags, 16) != e["flags"]:
                problems.append("flags %s want 0x%08x" % (flags, e["flags"]))
            status = field(out, "status")
            if status is not None and int(status, 16) != e["status"]:
                problems.append("status " + status)
            m = re.search(r"^counts\s+min (\d+), max (\d+), total (\d+)", out, re.M)
            if m and not (int(m.group(1)) == int(m.group(2)) == e["countsEveryLane"]
                          and int(m.group(3)) == e["countsEveryLane"] * c["lanes"]):
                problems.append("counts " + m.group(0))
            rec["verdict"] = "MATCH" if not problems else "MISMATCH"
            if problems:
                rec["problems"] = problems
                n_bad += 1
            else:
                n_ok += 1
        line = "%-26s %-9s %7.3f s  %s" % (name, rec["verdict"], secs,
                                           rec.get("message") or ", ".join(rec.get("problems", [])) or "")
        if "first" in rec:
            line += "  first: lane %(lane)d %(deposit)s want %(want)s got %(got)s" % rec["first"]
        print(line, flush=True)
        if logf:
            logf.write(json.dumps(rec) + "\n")
            logf.flush()
    print("%d case(s): %d matched, %d mismatched, %d refused by name" % (len(cases), n_ok, n_bad, n_ref))
    return 1 if n_bad else (2 if n_ref else 0)


if __name__ == "__main__":
    sys.exit(main())
`;

function finalize() {
  const records = readdirSync(OUT).filter(f => f.endsWith(".json") && f !== "pack-results.json")
    .sort().map(f => JSON.parse(readFileSync(join(OUT, f), "utf8")));
  if (!records.length) throw new Error(`pack-cft-set: no case records in ${OUT}`);
  // every file a record names must exist and hash to what it says
  for (const r of records) {
    const files = [r.image, r.text, r.bank, r.streams.a, r.streams.b, r.streams.c, r.expect.deposits].filter(Boolean);
    for (const f of files) {
      const got = sha(readFileSync(join(OUT, f.file)));
      if (got !== f.sha256) throw new Error(`pack-cft-set: ${f.file} does not hash to its record`);
    }
  }
  writeFileSync(join(OUT, "manifest.jsonl"), records.map(r => JSON.stringify(r)).join("\n") + "\n");
  // probe cases carry no positive: they ride in the same layout and the
  // same manifest, but the counts below are the positives'
  const posRecs = records.filter(r => r.positive);
  const probeRecs = records.filter(r => !r.positive);
  const commits = (k) => [...new Set(posRecs.map(r => r.provenance[k]))];
  const needs = (pred) => new Set(posRecs.filter(pred).map(r => r.positive)).size;
  const positivesN = new Set(posRecs.map(r => r.positive)).size;
  const words = posRecs.map(r => r.image.words);
  const coverage = [
    `- ${needs(r => r.needs.loops > 0)} positives with loops (\`REPEAT\`/\`ENDREP\`), early exit by \`SETACT\` and \`ACTALL\` where a break is at the top level`,
    `- ${needs(r => r.needs.scratch)} reach the scratch by static slot, deepest ${Math.max(...posRecs.map(r => r.needs.scratchSlots))} of 256 slots; ${needs(r => r.needs.scratchIndexed)} by index (\`STX\`/\`LDX\`)`,
    `- ${needs(r => r.needs.kx9)} address a constant at index 256 or above (the ninth index bit)`,
    `- ${needs(r => r.needs.imul)} use \`IMUL\`; ${needs(r => r.needs.regs32)} need thirty-two registers`,
    `- ${needs(r => r.needs.imemRev3)} images longer than 4,096 instructions; ${Math.min(...words).toLocaleString("en-US")} to ${Math.max(...words).toLocaleString("en-US")} words in all`,
    probeRecs.length ? `- ${probeRecs.length} probe cases beside the positives, with expectations from the golden model alone: ` +
                       probeRecs.map(r => `\`${r.case}\` (${r.probe})`).join(", ") : "",
  ].filter(Boolean).join("\n");
  const m = {
    cases: records.length, positives: positivesN, lanes: [...new Set(posRecs.map(r => r.lanes))].join(", "),
    generated: new Date().toISOString().slice(0, 10), atlasEngine: commits("atlasEngine").join(", "),
    cftFp256: commits("cftFp256").join(", "), goldenLanes: 16, coverage,
    strictCases: records.filter(r => (r.image.headerFlagNames || []).includes("SCRATCH_STRICT")).length,
  };
  writeFileSync(join(OUT, "README.md"), README(m));
  writeFileSync(join(OUT, "run_set.py"), RUN_SET_PY);
  // SHA256SUMS over every file but itself and the logs, LF, sorted
  const files = readdirSync(OUT).filter(f => f !== "SHA256SUMS" && statSync(join(OUT, f)).isFile()).sort();
  writeFileSync(join(OUT, "SHA256SUMS"), files.map(f => `${sha(readFileSync(join(OUT, f)))}  ${f}`).join("\n") + "\n");
  console.log(`finalized ${OUT}: ${records.length} cases over ${positivesN} positives, ${files.length} files hashed`);
  return m;
}

if (!FINALIZE_ONLY) {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  const results = await packAll();
  const notPacked = results.filter(r => !r.packed);
  console.log(`\n${results.length} case(s): ${results.length - notPacked.length} packed, ${notPacked.length} not`);
  for (const r of notPacked) console.log(`  ${r.case}: ${r.why}`);
  finalize();
  process.exit(notPacked.length ? 1 : 0);
} else {
  finalize();
}
