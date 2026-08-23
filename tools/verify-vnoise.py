#!/usr/bin/env python3
"""Does s.vnoise compute the same value on a GPU as in the evaluator?

The whole apparatus rests on one property: the CPU evaluator says what
the shader will say. Everything else - the constants oracle, the
negative controls, the pinned set - is machinery for keeping that true.
A new primitive is a new chance to break it, and `vnoise` is the first
one that mixes integer hashing with float interpolation, which is
exactly where the two sides can drift apart without either looking
wrong.

So this takes the GLSL the emitter actually produces - not a hand-typed
copy of it, which would drift the moment the emitter changed - runs it
over inputs chosen to hit the primitive's corners, and compares against
the evaluator BIT FOR BIT. Not "close": the same float32.

The inputs are chosen to be hostile rather than convenient: negative
coordinates, exact lattice points where floor and the offset disagree
about which cell you are in, and coordinates past 1023 where the
lattice wraps.

    python tools/verify-vnoise.py [--stack N]
    python tools/verify-vnoise.py --dump-plan plan.json   (needs node)
    python tools/verify-vnoise.py --plan plan.json --stack 1

A PLAN so the check runs where node does not. The bench box has a GPU
and no node, and installing one there to answer "do these two agree"
would be answering it on a fourth machine. The plan carries the GLSL
the emitter produced and the values the evaluator computed - both
generated where node lives - so the card only has to run the shader.
The GLSL is still the emitter's own output; it is shipped rather than
regenerated, not retyped.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FIX = ROOT / "positives" / "_fixtures" / "vnoise.pos.mjs"

# hostile by intent: negatives, exact integers, the 1023 wrap, and a
# scatter in between
XS = np.array([0.0, 1.0, -1.0, 0.5, -0.5, 1023.0, 1024.0, 1025.0,
               -1023.0, -1024.0, 0.25, -0.25, 7.5, -7.5, 100.5,
               -100.5, 1022.75, 2047.5, -2047.5, 0.999999],
              dtype=np.float32)
YS = np.array([0.0, -1.0, 1.0, -0.5, 0.5, 1024.0, 1023.0, -1025.0,
               1023.5, 0.0, -0.75, 0.75, -3.25, 3.25, -100.5,
               100.5, 511.5, -511.5, 2047.0, 0.5],
              dtype=np.float32)
OC = 3


def emitted_block():
    """The vnoise lines out of the emitter, so this cannot drift."""
    js = f"""
      import {{ emitWalk }} from '{(ROOT / "core" / "emit.mjs").as_uri()}';
      const mod = await import('{FIX.as_uri()}');
      process.stdout.write(emitWalk(mod.default, {{ pin: true }}));
    """
    r = subprocess.run(["node", "--input-type=module", "-e", js],
                       capture_output=True, text=True, cwd=str(ROOT))
    if r.returncode:
        sys.exit(f"could not emit the fixture:\n{r.stderr[-500:]}")
    lines = [ln for ln in r.stdout.split("\n") if re.search(r"\bvn_\d+_", ln)]
    if not lines:
        sys.exit("the emitted fixture contains no vnoise block")
    g = re.search(r"vn_(\d+)_", lines[0]).group(1)
    # the block reads its inputs from vn_N_x / vn_N_y; make those ours
    body = []
    for ln in lines:
        s = ln.strip()
        if re.match(rf"precise float vn_{g}_x =", s):
            s = f"precise float vn_{g}_x = ax;"
        elif re.match(rf"precise float vn_{g}_y =", s):
            s = f"precise float vn_{g}_y = ay;"
        body.append("  " + s)
    return "\n".join(body), f"vn_{g}_v"


def cpu_values():
    js = f"""
      import {{ Stream }} from '{(ROOT / "core" / "measure.mjs").as_uri()}';
      const s = new Stream(1, {{ root: 1 }});
      const xs = {json.dumps([float(v) for v in XS])};
      const ys = {json.dumps([float(v) for v in YS])};
      const out = xs.map((x, i) => s.vnoise(x, ys[i], {OC}));
      process.stdout.write(JSON.stringify(out));
    """
    r = subprocess.run(["node", "--input-type=module", "-e", js],
                       capture_output=True, text=True, cwd=str(ROOT))
    if r.returncode:
        sys.exit(f"evaluator failed:\n{r.stderr[-500:]}")
    return np.array(json.loads(r.stdout), dtype=np.float32)


def gpu_values(block, out_name, stack):
    import moderngl
    kw = {}
    if stack is not None:
        kw = {"backend": "egl", "device_index": int(stack)}
    ctx = moderngl.create_context(standalone=True, **kw)
    lib = (ROOT / "build" / "pinned" / "detlib.glsl").read_text(encoding="utf-8")
    pre = (ROOT / "build" / "pinned" / "detpre.glsl").read_text(encoding="utf-8")
    src = f"""#version 430
layout(local_size_x = 64) in;
layout(std430, binding = 0) readonly  buffer Ix {{ float xs[]; }};
layout(std430, binding = 1) readonly  buffer Iy {{ float ys[]; }};
layout(std430, binding = 2) writeonly buffer O  {{ float o[]; }};
uniform uint uN;
const float PI  = 3.14159265359;
const float TAU = 6.28318530718;
// hashu and u2f come from the REGISTRY's shared header, verbatim -
// PrettyCloud/atlas/js/core/glsl-lib.js. An emitted plate gets them
// from the host it is spliced into; this probe has no host, so it
// carries them. Copied rather than paraphrased: the evaluator's
// Math.imul chain is a transcription of exactly these three rounds,
// and a probe that transcribed them a second time could agree with
// itself while both disagreed with the atlas.
uint hashu(uint x){{
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16; return x;
}}
float u2f(uint x){{ return float(x) * 2.3283064365386963e-10; }}
{lib}
{pre}
void main(){{
  uint i = gl_GlobalInvocationID.x;
  if (i >= uN) return;
  float ax = xs[i], ay = ys[i];
{block}
  o[i] = {out_name};
}}
"""
    try:
        prog = ctx.compute_shader(src)
    except Exception as exc:  # noqa: BLE001
        (ROOT / "build" / "vnoise-FAILED.glsl").write_text(src, encoding="utf-8")
        sys.exit(f"probe did not compile; written to build/vnoise-FAILED.glsl"
                 f"\n{str(exc)[:400]}")
    n = len(XS)
    bx = ctx.buffer(XS.tobytes())
    by = ctx.buffer(YS.tobytes())
    bo = ctx.buffer(reserve=4 * n)
    bx.bind_to_storage_buffer(0)
    by.bind_to_storage_buffer(1)
    bo.bind_to_storage_buffer(2)
    prog["uN"].value = n
    prog.run(group_x=(n + 63) // 64)
    ctx.finish()
    return np.frombuffer(bo.read(), np.float32)[:n], str(ctx.info["GL_RENDERER"])


def main(argv):
    stack = None
    if "--stack" in argv:
        stack = argv[argv.index("--stack") + 1]
    if "--plan" in argv:
        plan = json.loads(Path(argv[argv.index("--plan") + 1])
                          .read_text(encoding="utf-8"))
        block, out_name = plan["block"], plan["out"]
        cpu = np.array(plan["cpu"], dtype=np.float32)
    else:
        block, out_name = emitted_block()
        cpu = cpu_values()
    if "--dump-plan" in argv:
        Path(argv[argv.index("--dump-plan") + 1]).write_text(json.dumps(
            {"block": block, "out": out_name,
             "cpu": [float(v) for v in cpu]}, indent=1), encoding="utf-8")
        print(f"  plan written: {len(cpu)} samples, "
              f"{len(block.splitlines())} GLSL lines")
        return 0
    gpu, renderer = gpu_values(block, out_name, stack)
    print(f"  {renderer[:56]}")
    cu = np.ascontiguousarray(cpu).view(np.uint32)
    gu = np.ascontiguousarray(gpu).view(np.uint32)
    bad = np.flatnonzero(cu != gu)
    print(f"  {len(XS) - bad.size}/{len(XS)} samples bit-identical "
          f"between the evaluator and the GPU")
    if bad.size:
        print(f"\n  {'x':>10} {'y':>10} {'cpu':>13} {'gpu':>13}")
        for i in bad[:8]:
            print(f"  {XS[i]:10.4f} {YS[i]:10.4f} {cpu[i]:13.8g} "
                  f"{gpu[i]:13.8g}   {cu[i]:08X} {gu[i]:08X}")
        return 1
    lo, hi = float(cpu.min()), float(cpu.max())
    print(f"  range [{lo:.6f}, {hi:.6f}] - inside [-0.5, 0.5): "
          f"{lo >= -0.5 and hi < 0.5}")
    print("\n  vnoise agrees")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
