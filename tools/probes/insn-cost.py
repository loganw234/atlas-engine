#!/usr/bin/env python3
"""What one instruction of each kind costs on a device, per lane.

    python tools/probes/insn-cost.py --cft-root ../cft-fp256 --out DIR [--lanes 16384] [--trips 1024]

Writes a family of tiny fp32 programs in the program-set layout, each a
single `repeat TRIPS` around one kind of instruction pair, so that timing
them on the same lane count separates the cost of the kinds:

    alu2      ior r4, r4, r6 ; ior r4, r4, r6      two ALU instructions
    stl-ldl   stl r4, 7      ; ldl r4, 7            a static scratch store and load
    stx-ldx   stx r4, r1     ; ldx r4, r1           an indexed store and load (r1 = lane mod 200)
    alu-setact ior r4, r4, r6 ; setact r5           one ALU and a SETACT that keeps every lane
    alu1      ior r4, r4, r6                        one ALU instruction: the loop's own floor

Each also carries a running value so the deposits are not constant: before
the loop r4 := a (the stream), and the pair is written so r4 is unchanged
by it, which makes every deposit checkable - r4 == a on every lane for every
program - and every program's arithmetic trivially the same on any
conforming implementation. atlas-engine's spiller turns a register
pressure into STL/LDL traffic; this is the measurement of what that traffic
costs a lane on silicon rather than in words.

The expected deposits are computed by the golden model on the first 128
lanes and extended by the identity above (r4 == a), which the golden run
checks; cft-silicon-time.py then holds every device to the whole buffer.
"""
import argparse, hashlib, json, pathlib, struct, sys, datetime

ap = argparse.ArgumentParser()
ap.add_argument("--cft-root", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--lanes", type=int, default=16384)
ap.add_argument("--trips", type=int, default=1024)
a = ap.parse_args()
root = pathlib.Path(a.cft_root).resolve()
sys.path.insert(0, str(root / "python"))
from cft_golden import seq, asm  # noqa: E402

out = pathlib.Path(a.out)
out.mkdir(parents=True, exist_ok=True)
n, R = a.lanes, a.trips
sha = lambda b: hashlib.sha256(b).hexdigest()
le32 = lambda xs: b"".join(struct.pack("<I", x & 0xFFFFFFFF) for x in xs)

# stream a: a distinct float bit pattern per lane; b: lane mod 200 as an
# unsigned index (in range for a 256-slot scratch, strict or not)
av = [struct.unpack("<I", struct.pack("<f", (i % 9973) * 0.25 + 1.0))[0] for i in range(n)]
bv = [i % 200 for i in range(n)]

BODIES = {
    "alu1":       "  ior r4, r4, r6\n",
    "alu2":       "  ior r4, r4, r6\n  ior r4, r4, r6\n",
    "stl-ldl":    "  stl r4, 7\n  ldl r4, 7\n",
    "stx-ldx":    "  stx r4, r1\n  ldx r4, r1\n",
    "alu-setact": "  ior r4, r4, r6\n  setact r5\n",
}
PAIRS = {"alu1": 1, "alu2": 2, "stl-ldl": 2, "stx-ldx": 2, "alu-setact": 2}
for name, body in BODIES.items():
    case = f"cost-{name}.t{R}.n{n}"
    # r6 = +0 (never written), so IOR with it is a copy; r5 = 1.0 via a
    # constant-free route: r5 := a | a is non-zero for every lane (a != 0)
    text = (f"; {case}: one kind of instruction pair, {R} trips, for timing\n"
            ".format   fp32\n.deposits 1\n.scratch strict\n"
            "ior r4, r0, r6\n"
            "ior r5, r0, r6\n"
            f"repeat {R}\n{body}endrep\n"
            "actall\n"
            "deposit r4\nhalt\n")
    image = asm.assemble(text, source=case + ".cfta")
    prog = seq.Program.from_bytes(image)
    g = min(128, n)
    res = seq.run(prog, av[:g], bv[:g])
    gd = [int(x) for x in res.deposits]
    if gd != av[:g]:
        raise SystemExit(f"{case}: the golden model did not return r4 == a on the first {g} lanes")
    deps = av   # the identity the golden run just confirmed
    files = {".cfta": text.encode(), ".cftp": image, ".a.bin": le32(av), ".b.bin": le32(bv), ".deposits.bin": le32(deps)}
    for suffix, data in files.items():
        (out / (case + suffix)).write_bytes(data)
    rec = {"case": case, "probe": "instruction cost", "kind": name, "pairInsns": PAIRS[name], "trips": R, "lanes": n,
           "format": "fp32", "image": {"file": case + ".cftp", "sha256": sha(image), "words": len(image) // 8 - 4},
           "expect": {"deposits": {"file": case + ".deposits.bin", "sha256": sha(files[".deposits.bin"])},
                      "status": int(res.status), "flags": int(res.flags)},
           "goldenLanes": g, "generated": datetime.datetime.now().isoformat(timespec="seconds")}
    (out / (case + ".json")).write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")
    print(f"{case}: {len(image)} bytes, golden status 0x{int(res.status):08x} flags 0x{int(res.flags):08x}")
