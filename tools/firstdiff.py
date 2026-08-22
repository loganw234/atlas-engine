#!/usr/bin/env python3
"""The first local, in source order, where two stacks stop agreeing.

Phase 3 leaves two plates disagreeing between GPUs - `mirage` and
`hyper` - with no unpinned operation in either. Hand-bisecting a
349-line shader carrying 250 intermediates is not the way to find that,
and doing it once per plate is worse.

So: instrument every `precise float` declaration in an emitted plate to
also write itself to an output slot, run the instrumented shader on two
stacks over identical inputs, and report the first slot whose bits
differ. Whatever that names is where the divergence enters, and
everything before it is exonerated.

A local declared inside an `if` only writes its slot when that branch
runs. The buffer is pre-filled with a sentinel, so a slot that stays
sentinel on both stacks means "not reached" rather than "agreed" - and
one that is sentinel on ONE stack means the branch itself diverged,
which is a different and more interesting answer.

    python tools/firstdiff.py <plate> --a <tagA> --b <tagB>
    python tools/firstdiff.py <plate> --run <tag> [--stack N]
"""
import argparse
import json
import os
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
PINNED = ROOT / "build" / "pinned"
OUT = ROOT / "build" / "firstdiff"
DARKROOM = pathlib.Path(os.environ.get("DARKROOM", ROOT.parent /
                                       "atlas-darkroom"))
NRUN = 1 << 12
SENTINEL = -987654.0

HEAD = """#version 430
layout(local_size_x = 64) in;
layout(std430, binding = 0) readonly  buffer Qi { float qi[]; };
layout(std430, binding = 1) readonly  buffer Ri { float ri[]; };
layout(std430, binding = 2) readonly  buffer Si { uint  si[]; };
layout(std430, binding = 3) buffer Out { float o[]; };
uniform uint uN;
uniform float uT;
"""

TAIL = """
void main(){
  uint i = gl_GlobalInvocationID.x;
  if (i >= uN) return;
  for (uint k = 0u; k < %du; k++) o[k*uN+i] = %ff;
  vec2 q   = vec2(qi[2u*i], qi[2u*i+1u]);
  vec4 rnd = vec4(ri[4u*i], ri[4u*i+1u], ri[4u*i+2u], ri[4u*i+3u]);
  float P[8];
  for (int k = 0; k < 8; k++) P[k] = float(k) * 0.1234 + 0.05;
  vec3 col;
  vec3 v = %s(q, rnd, si[i], P, col);
  o[%du*uN+i] = v.x + v.y + v.z + col.x;
}
"""


def instrument(body):
    """Write each `precise float NAME = ...;` to its own slot, right
    where it is declared so scope is respected."""
    names, out = [], []
    for line in body.splitlines():
        out.append(line)
        m = re.match(r"^(\s*)precise float ([A-Za-z_][A-Za-z0-9_]*)\s*=",
                     line)
        if m and line.rstrip().endswith(";"):
            k = len(names)
            names.append(m.group(2))
            out.append(f"{m.group(1)}o[{k}u*uNg+ig] = {m.group(2)};")
    return "\n".join(out), names


def prelude():
    src = (DARKROOM / "darkroom" / "shader.py").read_text(encoding="utf-8")
    pats = [r"const float PI  = [0-9.]+;", r"const float TAU = [0-9.]+;",
            r"vec3 pal\(float t, vec3 a, vec3 b, vec3 c, vec3 d\)\{.*?\n\}",
            r"uint hashu\(uint x\)\{.*?\n\}",
            r"float u2f\(uint x\)\{[^\n]*\}",
            r"vec2 cmul\(vec2 a, vec2 b\)\{[^\n]*\}",
            r"vec2 cdiv\(vec2 a, vec2 b\)\{[^\n]*\}",
            r"vec2 cinv\(vec2 a\)\{[^\n]*\}",
            r"vec2 csqrt\(vec2 z\)\{.*?\n\}"]
    got = []
    for p in pats:
        m = re.search(p, src, re.S)
        if m:
            got.append(m.group(0))
    return "\n".join(got)


def inputs():
    import numpy as np
    ia = np.arange(NRUN, dtype=np.uint64)
    S = 2.3283064365386963e-10
    q = np.empty(2 * NRUN, np.float32)
    q[0::2] = ((ia * 3242174889) % (1 << 32)) * S
    q[1::2] = ((ia * 2447445414) % (1 << 32)) * S
    h = (ia * 0x9E3779B1 + 12345) % (1 << 32)
    r = np.empty(4 * NRUN, np.float32)
    for k in range(4):
        h = (h * 1103515245 + 12345) % (1 << 32)
        r[k::4] = (h * S).astype(np.float32)
    return q, r, ((ia * 2654435761) % (1 << 32)).astype(np.uint32)


def build(plate):
    body = (PINNED / f"{plate}.glsl").read_text(encoding="utf-8")
    entry = re.search(r"vec3 (shape_[A-Za-z0-9_]+)\(", body).group(1)
    # the instrumented writes need the invocation index and count, which
    # the shape function does not take; smuggle them in as globals
    inst, names = instrument(body)
    glob = "uint ig; uint uNg;\n"
    inst = inst.replace(f"vec3 {entry}(",
                        f"vec3 {entry}(", 1)
    detlib = (PINNED / "detlib.glsl").read_text(encoding="utf-8")
    detpre = (PINNED / "detpre.glsl").read_text(encoding="utf-8")
    tail = TAIL % (len(names) + 1, SENTINEL, entry, len(names))
    tail = tail.replace("  vec2 q   =", "  ig = i; uNg = uN;\n  vec2 q   =")
    src = (HEAD + prelude() + "\n" + detlib + "\n" + detpre + "\n"
           + glob + inst + tail)
    return src, names


def run(plate, tag, stack):
    import numpy as np
    import moderngl
    kw = {"standalone": True, "require": 430}
    if stack is not None:
        kw.update(backend="egl", device_index=stack)
    ctx = moderngl.create_context(**kw)
    print(f"  {ctx.info['GL_RENDERER'][:58]}")
    src, names = build(plate)
    try:
        prog = ctx.compute_shader(src)
    except Exception as exc:
        (OUT).mkdir(parents=True, exist_ok=True)
        (OUT / f"{plate}.FAILED.glsl").write_text(src, encoding="utf-8")
        sys.exit(f"instrumented shader did not compile; written to "
                 f"{OUT / (plate + '.FAILED.glsl')}\n{str(exc)[:400]}")
    q, r, seed = inputs()
    nslot = len(names) + 1
    bq = ctx.buffer(q.tobytes())
    br = ctx.buffer(r.tobytes())
    bs = ctx.buffer(seed.tobytes())
    bo = ctx.buffer(reserve=4 * nslot * NRUN)
    for k, b in enumerate((bq, br, bs, bo)):
        b.bind_to_storage_buffer(k)
    prog["uN"].value = NRUN
    try:
        prog["uT"].value = 0.375
    except KeyError:
        pass
    prog.run(group_x=(NRUN + 63) // 64)
    ctx.finish()
    a = np.frombuffer(bo.read(), np.float32).reshape(nslot, NRUN)
    OUT.mkdir(parents=True, exist_ok=True)
    np.save(OUT / f"{plate}-{tag}.npy", a)
    (OUT / f"{plate}-{tag}.json").write_text(json.dumps(
        {"renderer": str(ctx.info["GL_RENDERER"]), "names": names,
         "slots": nslot}, indent=1), encoding="utf-8")
    print(f"    {len(names)} locals instrumented, wrote "
          f"{plate}-{tag}.npy")
    return 0


def compare(plate, ta, tb):
    import numpy as np
    a = np.load(OUT / f"{plate}-{ta}.npy")
    b = np.load(OUT / f"{plate}-{tb}.npy")
    meta = json.loads((OUT / f"{plate}-{ta}.json").read_text())
    names = meta["names"]
    ua = np.ascontiguousarray(a).view(np.uint32)
    ub = np.ascontiguousarray(b).view(np.uint32)
    sent = np.float32(SENTINEL).view(np.uint32)

    print(f"\n{plate}: {len(names)} locals, {NRUN:,} samples")
    print(f"  {ta} vs {tb}\n")
    first = None
    for k, nm in enumerate(names):
        d = ua[k] != ub[k]
        if not d.any():
            continue
        sa, sb = ua[k] == sent, ub[k] == sent
        reached = (~sa & ~sb & d).sum()
        onlyone = (sa ^ sb).sum()
        zero = (((ua[k] == 0x80000000) & (ub[k] == 0)) |
                ((ua[k] == 0) & (ub[k] == 0x80000000))).sum()
        real = int(reached - zero)
        kind = ("branch taken differently" if onlyone else
                "signed zero only" if real == 0 else "value")
        print(f"  slot {k:4d}  {nm:16} differs on {int(d.sum()):5d}"
              f"  [{kind}]")
        if first is None and (real > 0 or onlyone):
            first = (k, nm, kind)
    if first is None:
        print("  no local differs - the divergence is not in a "
              "`precise float` declaration")
        return 0
    k, nm, kind = first
    print(f"\n  FIRST real divergence: slot {k}, `{nm}` ({kind})")
    print("  Everything declared before it agrees bit for bit.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="firstdiff")
    ap.add_argument("plate")
    ap.add_argument("--run", metavar="TAG")
    ap.add_argument("--stack", type=int, default=None)
    ap.add_argument("--a")
    ap.add_argument("--b")
    a = ap.parse_args(argv)
    if a.run:
        return run(a.plate, a.run, a.stack)
    if a.a and a.b:
        return compare(a.plate, a.a, a.b)
    ap.error("either --run TAG, or --a TAG --b TAG")


if __name__ == "__main__":
    sys.exit(main())
