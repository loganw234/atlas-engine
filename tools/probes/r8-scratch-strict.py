#!/usr/bin/env python3
"""Revision 4's R8 on a device: an indexed scratch access past the depth.

    python tools/probes/r8-scratch-strict.py --cft-root ../cft-fp256 --out DIR

Writes two cases in the program-set layout - `r8-strict` and `r8-modulo`,
the same four instructions with and without `.scratch strict` - with the
expected deposits and STATUS computed by the golden model, which is the
definition. cft-fp256's device-test checks that a strict image LOADS on a
device that publishes CAPS2[6]; this checks what the device DOES with an
index that is not there:

    stx r1, r0      scratch[r0] := r1   suppressed past the depth when strict
    ldx r2, r0      r2 := scratch[r0]   +0 past the depth when strict
    ldl r3, 0       slot 0, where a wrapped store to 256, 512, ... lands
    deposit r2, r3, r0, r1

Stream a is the index as an unsigned 32-bit pattern, stream b a distinct
non-zero value per lane. The indices mix every lane number (so most of
1,024 lanes are past a 256-slot depth) with the edges: 255, 256, 257, 511,
512, 1023, 1024, 65535, 65536, 2^31 - 1, 2^31, 2^32 - 1. Strict, every
index at or past 256 reads +0 and slot 0 stays +0, and STATUS[5] is set;
modulo, the store and load wrap and slot 0 holds the value exactly where
the index is a multiple of 256.
"""
import argparse, hashlib, json, pathlib, struct, sys, datetime

ap = argparse.ArgumentParser()
ap.add_argument("--cft-root", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--lanes", type=int, default=1024)
a = ap.parse_args()
root = pathlib.Path(a.cft_root).resolve()
sys.path.insert(0, str(root / "python"))
from cft_golden import seq, asm  # noqa: E402

out = pathlib.Path(a.out)
out.mkdir(parents=True, exist_ok=True)
EDGES = [255, 256, 257, 511, 512, 1023, 1024, 65535, 65536, 0x7FFFFFFF, 0x80000000, 0xFFFFFFFF]
n = a.lanes
idx = [(EDGES[(i // 4) % len(EDGES)] if i % 4 == 3 else i) & 0xFFFFFFFF for i in range(n)]
val = [struct.unpack("<I", struct.pack("<f", float(i + 1)))[0] for i in range(n)]
sha = lambda b: hashlib.sha256(b).hexdigest()
le32 = lambda xs: b"".join(struct.pack("<I", x) for x in xs)

BODY = """
stx r1, r0
ldx r2, r0
ldl r3, 0
deposit r2
deposit r3
deposit r0
deposit r1
halt
"""
for name, strict in (("r8-strict", True), ("r8-modulo", False)):
    text = (f"; {name}: revision 4's R8 on a device - an indexed scratch access past the depth\n"
            ".format   fp32\n.deposits 4\n" + (".scratch strict\n" if strict else "") + BODY)
    image = asm.assemble(text, source=name + ".cfta")
    prog = seq.Program.from_bytes(image)
    res = seq.run(prog, idx, val)
    deps = [int(x) for x in res.deposits]
    files = {".cfta": text.encode(), ".cftp": image, ".a.bin": le32(idx), ".b.bin": le32(val),
             ".deposits.bin": le32(deps)}
    rec = {"schema": "atlas-engine cft program case, 1", "case": name, "probe": "revision 4 R8",
           "format": "fp32", "lanes": n,
           "image": {"file": name + ".cftp", "bytes": len(image), "sha256": sha(image), "words": prog.n_insns if hasattr(prog, "n_insns") else len(prog.insns),
                     "maxDeposits": 4, "nConsts": 0, "headerFlags": 4 if strict else 0,
                     "headerFlagNames": ["SCRATCH_STRICT"] if strict else []},
           "text": {"file": name + ".cfta", "bytes": len(files[".cfta"]), "sha256": sha(files[".cfta"])},
           "bank": None,
           "streams": {"a": {"file": name + ".a.bin", "sha256": sha(files[".a.bin"]), "holds": "the index, uint32"},
                       "b": {"file": name + ".b.bin", "sha256": sha(files[".b.bin"]), "holds": "float(lane + 1), binary32"}},
           "expect": {"deposits": {"file": name + ".deposits.bin", "sha256": sha(files[".deposits.bin"]),
                                   "names": ["ldx", "slot0", "index", "value"],
                                   "layout": "lane-major: lane i's deposit d at element i*4+d, binary32 little-endian"},
                      "countsEveryLane": 4, "flags": int(res.flags), "status": int(res.status),
                      "digest": sha(image)},
           "needs": {"scratch": True, "scratchIndexed": True, "scratchStrict": strict},
           "agreedBy": {"goldenModel": "python/cft_golden/seq.py over all lanes; the image assembled by asm.py"},
           "provenance": {"generated": datetime.datetime.now().isoformat(timespec="seconds"),
                          "cftFp256Model": str(root)}}
    for suffix, data in files.items():
        (out / (name + suffix)).write_bytes(data)
    (out / (name + ".json")).write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")
    past = sum(1 for x in idx if x >= 256)
    print(f"{name}: {len(image)} bytes, {n} lanes ({past} past 256), status 0x{int(res.status):08x}, "
          f"flags 0x{int(res.flags):08x}, deposits {sha(files['.deposits.bin'])[:16]}...")
