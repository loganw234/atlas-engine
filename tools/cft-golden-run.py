#!/usr/bin/env python3
"""Run a sequencer program image through cft-fp256's golden model.

    python tools/cft-golden-run.py <image.cftp> <inputs.json> <out.json>
                                   [--cft-root ../cft-fp256]

python/cft_golden/seq.py is "the definition of correct for programs"
in that project - the executable form of docs/SEQUENCER.md that its RTL
is held to bit for bit. Running an image here is therefore the second
oracle for the emitted program: libcft's program executor (reached from
Node through the wasm build) and this model must agree on every deposit,
and both must agree with the binary32 interpretation of the shipped
GLSL. Three implementations, sharing nothing but the image bytes and the
text they came from.

inputs.json holds the three streams as lists of 32-bit encodings
(integers or "0x..." strings): {"a": [...], "b": [...], "c": [...]}.
out.json receives the deposits as encodings in lane-major order
(lane i, slot d at i * max_deposits + d), the per-lane counts, the
flags and STATUS words, and the instruction count executed.

The model is pure Python and this is slow - about a millisecond per
instruction per lane - so callers hand it a subset of the lanes they
give libcft, and say so.
"""
import argparse
import json
import pathlib
import sys
import time


def u32(v):
    if isinstance(v, str):
        return int(v, 16) if v.lower().startswith("0x") else int(v, 10)
    return int(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("inputs")
    ap.add_argument("out")
    ap.add_argument("--cft-root", default=None)
    args = ap.parse_args()

    here = pathlib.Path(__file__).resolve().parent
    root = pathlib.Path(args.cft_root) if args.cft_root else here.parent.parent / "cft-fp256"
    pydir = root / "python"
    if not (pydir / "cft_golden" / "seq.py").exists():
        sys.exit(f"cft-golden-run: no golden model at {pydir} - pass --cft-root")
    sys.path.insert(0, str(pydir))
    from cft_golden import seq  # noqa: E402

    data = pathlib.Path(args.image).read_bytes()
    prog = seq.Program.from_bytes(data)
    inp = json.loads(pathlib.Path(args.inputs).read_text(encoding="utf-8"))
    a = [u32(x) for x in inp["a"]]
    b = [u32(x) for x in inp.get("b", [0] * len(a))]
    c = [u32(x) for x in inp.get("c", [0] * len(a))]

    t0 = time.time()
    res = seq.run(prog, a, b, c)
    dt = time.time() - t0

    out = {
        "image": args.image,
        "lanes": len(a),
        "max_deposits": prog.max_deposits,
        "n_insns": len(prog.insns),
        "n_consts": len(prog.consts),
        "format": prog.fmt.name,
        "deposits": [f"0x{d:08x}" for d in res.deposits],
        "counts": list(res.counts),
        "flags": res.flags,
        "status": res.status,
        "insns_executed": res.insns_executed,
        "seconds": round(dt, 3),
    }
    pathlib.Path(args.out).write_text(json.dumps(out) + "\n", encoding="utf-8")
    print(f"golden: {len(a)} lanes, {len(prog.insns)} instructions, "
          f"{res.insns_executed} executed, flags {res.flags:#x}, status {res.status:#x}, "
          f"{dt:.1f} s")


if __name__ == "__main__":
    main()
