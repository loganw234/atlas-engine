#!/usr/bin/env python3
"""Is the det library itself bit-identical, on every stack?

Phase 3 measured emitted plates and found a clean split: with the
pinned set and `precise`, NVIDIA and radeonsi agree on 46 of 50 plates
and the two Mesa GPUs on 48, while llvmpipe sits at 16 to 18 against
everybody. One stack out of step across every pair is not a plate
property - it is something under the plates.

This asks the question one level down. Every det_ function, over the
same input bits, hashed. If the library is identical everywhere then
the divergence is in what the emitter writes around it; if llvmpipe
differs on some det_ function, that function is the whole story and
nothing above it needs investigating first.

The library is the thing this project's determinism claim rests on, so
"it is bit-identical" should be a measurement rather than an
assumption, and until now it has been measured on three GPUs and never
on a CPU rasteriser.

    python tools/detbits.py <tag> [--stack N]
    python tools/detbits.py --compare
"""
import argparse
import hashlib
import itertools
import json
import os
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
PINNED = ROOT / "build" / "pinned"
OUT = ROOT / "build" / "detbits"
DARKROOM = pathlib.Path(os.environ.get("DARKROOM", ROOT.parent /
                                       "atlas-darkroom"))
N = 1 << 18

# name -> the call, given inputs a and b. Every function the library
# exports that returns a float, plus the detpre helpers Phase 2 added.
CALLS = [
    ("det_sin", "det_sin(a)"),
    ("det_cos", "det_cos(a)"),
    ("det_tan", "det_tan(a)"),
    ("det_sqrt", "det_sqrt(abs(a))"),
    ("det_recip", "det_recip(b)"),
    ("det_div", "det_div(a, b)"),
    ("det_exp2", "det_exp2(a * 0.25)"),
    ("det_log2", "det_log2(abs(a) + 1.0e-6)"),
    ("det_atan", "det_atan(a, b)"),
    ("det_pow", "det_pow(abs(a) + 1.0e-6, 0.375)"),
    ("det_acos", "det_acos(clamp(a * 0.03125, -1.0, 1.0))"),
    ("det_mod", "det_mod(a, b)"),
    ("det_scale48", "det_scale48(floatBitsToUint(a) & 0x007FFFFFu)"),
    ("det_len2", "det_len2(a, b)"),
    ("det_len3", "det_len3(a, b, a + b)"),
    ("det_mix", "det_mix(a, b, 0.375)"),
    ("det_smoothstep", "det_smoothstep(-1.0, 3.0, a)"),
    ("det_dot3", "det_dot3(vec3(a, b, a + b), vec3(b, a, a - b))"),
    ("det_cross", "det_cross(vec3(a, b, a + b), vec3(b, a, a - b)).y"),
    ("det_div2", "det_div2(vec2(a, b), b).x"),
    ("det_mix3", "det_mix3(vec3(a, b, a), vec3(b, a, b), 0.25).z"),
    ("det_rodrigues",
     "det_rodrigues(vec3(a, b, a), vec3(0.0, 1.0, 0.0), 0.5, 0.25).x"),
    ("det_len3v", "det_len3v(vec3(a, b, a - b))"),
]

HEAD = """#version 430
layout(local_size_x = 128) in;
layout(std430, binding = 0) readonly  buffer In  { float x[]; };
layout(std430, binding = 1) readonly  buffer In2 { float y[]; };
layout(std430, binding = 2) writeonly buffer Out { float o[]; };
uniform uint uN;
"""


def body():
    lines = ["void main(){",
             "  uint i = gl_GlobalInvocationID.x;",
             "  if (i >= uN) return;",
             "  float a = x[i], b = y[i];"]
    for k, (_, call) in enumerate(CALLS):
        lines.append(f"  o[{k}u*uN+i] = {call};")
    lines.append("}")
    return "\n".join(lines)


def inputs():
    """The darkroom's own torture set if it is there - the dense band
    plates live in, exponential sweeps, and hostile tails - so this
    measures the library over the inputs it was built against rather
    than over a set chosen to flatter it."""
    import numpy as np
    src = DARKROOM / "tools" / "determinism" / "probe-inputs.npz"
    if src.exists():
        d = np.load(src)
        x, y = d["x"], d["y"]
        if x.size >= N:
            return x[:N].copy(), y[:N].copy()
    i = np.arange(N, dtype=np.float64)
    q = N // 4
    x = np.empty(N, np.float64)
    x[:q] = -16 + 32 * i[:q] / q
    x[q:2 * q] = np.exp2(-20 + 40 * i[:q] / q)
    x[2 * q:3 * q] = -np.exp2(-20 + 40 * i[:q] / q)
    x[3 * q:] = 1000.0 + 999000.0 * i[:q] / q
    y = np.roll(x, N // 3) * 1.618 + 0.125
    y[np.abs(y) < 1e-8] = 0.5
    return x.astype(np.float32), y.astype(np.float32)


def run(tag, stack):
    import numpy as np
    import moderngl
    kw = {"standalone": True, "require": 430}
    if stack is not None:
        kw.update(backend="egl", device_index=stack)
    ctx = moderngl.create_context(**kw)
    print(f"  {ctx.info['GL_RENDERER'][:60]}")

    detlib = (PINNED / "detlib.glsl").read_text(encoding="utf-8")
    detpre = (PINNED / "detpre.glsl").read_text(encoding="utf-8")
    src = HEAD + detlib + "\n" + detpre + "\n" + body()
    prog = ctx.compute_shader(src)

    x, y = inputs()
    bx = ctx.buffer(x.tobytes())
    by = ctx.buffer(y.tobytes())
    bo = ctx.buffer(reserve=4 * N * len(CALLS))
    bx.bind_to_storage_buffer(0)
    by.bind_to_storage_buffer(1)
    bo.bind_to_storage_buffer(2)
    prog["uN"].value = N
    prog.run(group_x=(N + 127) // 128)
    ctx.finish()
    a = np.frombuffer(bo.read(), np.float32).reshape(len(CALLS), N)

    rec = {"renderer": str(ctx.info["GL_RENDERER"]),
           "gl_version": str(ctx.info.get("GL_VERSION", "?")),
           "samples": N, "hashes": {}}
    for k, (name, _) in enumerate(CALLS):
        rec["hashes"][name] = hashlib.sha256(
            np.ascontiguousarray(a[k]).tobytes()).hexdigest()[:16]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{tag}.json").write_text(json.dumps(rec, indent=1),
                                     encoding="utf-8")
    for name, h in rec["hashes"].items():
        print(f"    {name:16} {h}")
    return 0


def compare():
    recs = {f.stem: json.loads(f.read_text(encoding="utf-8"))
            for f in sorted(OUT.glob("*.json"))}
    if len(recs) < 2:
        sys.exit(f"need at least two records in {OUT}; have {len(recs)}")
    print(f"{len(recs)} stacks, {N:,} inputs each:")
    for t, r in recs.items():
        print(f"  {t:14} {r['renderer'][:54]}")

    names = list(recs)
    agree, split = [], []
    for fn, _ in CALLS:
        hs = {t: recs[t]["hashes"].get(fn) for t in names}
        if len(set(hs.values())) == 1:
            agree.append(fn)
        else:
            split.append((fn, hs))

    print(f"\n  bit-identical on every stack: {len(agree)}/{len(CALLS)}")
    for fn in agree:
        print(f"    {fn}")
    if split:
        print(f"\n  NOT identical: {len(split)}")
        for fn, hs in split:
            print(f"    {fn}")
            groups = {}
            for t, h in hs.items():
                groups.setdefault(h, []).append(t)
            for h, ts in groups.items():
                print(f"      {h}  {' '.join(ts)}")
    else:
        print("\n  the whole library is bit-identical across every stack "
              "measured,")
        print("  so a plate that disagrees is disagreeing above it.")
    return 1 if split else 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="detbits")
    ap.add_argument("tag", nargs="?")
    ap.add_argument("--stack", type=int, default=None)
    ap.add_argument("--compare", action="store_true")
    a = ap.parse_args(argv)
    if a.compare:
        return compare()
    if not a.tag:
        ap.error("a tag is required unless --compare")
    return run(a.tag, a.stack)


if __name__ == "__main__":
    sys.exit(main())
