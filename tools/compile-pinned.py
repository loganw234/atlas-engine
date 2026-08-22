#!/usr/bin/env python3
"""Compiles every pinned plate on a real driver.

Everything else in Phase 2 is a scan over text, and a scan cannot see a
missing function, a mismatched type, or a name that collides with a
GLSL keyword. Pinning swapped a dozen builtins for functions the engine
wrote itself, so exactly those mistakes are the ones it could make.

The prelude is taken from the DARKROOM, not written here: pal, hashu,
u2f and the complex helpers are the registry's, and a plate emitted
against a private copy of them would compile here and fail in
PrettyCloud. Extracted by the same regexes shapeprobe.py uses, so if
the camera moves this stops rather than drifting.

    python tools/compile-pinned.py [--stack N]
"""
import argparse
import os
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
PINNED = ROOT / "build" / "pinned"
DARKROOM = pathlib.Path(os.environ.get("DARKROOM", ROOT.parent /
                                       "atlas-darkroom"))


def prelude():
    src = (DARKROOM / "darkroom" / "shader.py").read_text(encoding="utf-8")
    want = [r"const float PI  = [0-9.]+;",
            r"const float TAU = [0-9.]+;",
            r"vec3 pal\(float t, vec3 a, vec3 b, vec3 c, vec3 d\)\{.*?\n\}",
            r"uint hashu\(uint x\)\{.*?\n\}",
            r"float u2f\(uint x\)\{[^\n]*\}",
            r"vec2 cmul\(vec2 a, vec2 b\)\{[^\n]*\}",
            r"vec2 cdiv\(vec2 a, vec2 b\)\{[^\n]*\}",
            r"vec2 cinv\(vec2 a\)\{[^\n]*\}"]
    out = []
    for pat in want:
        m = re.search(pat, src, re.S)
        if not m:
            sys.exit(f"prelude piece not found in shader.py: {pat}\n"
                     f"the camera moved; this would have compiled a "
                     f"program nothing renders")
        out.append(m.group(0))
    # csqrt is a multi-line helper in the header; take it whole
    m = re.search(r"vec2 csqrt\(vec2 z\)\{.*?\n\}", src, re.S)
    if m:
        out.append(m.group(0))
    return "\n".join(out)


# uT IS PART OF THE PLATE CONTRACT, not of this harness. Animated
# plates read it, the darkroom sets it per exposure from uT0 and the
# shutter, and a compile without it fails on eighteen plates for a
# reason that has nothing to do with pinning. Declared here so the
# check measures what it claims to.
HEAD = """#version 430
layout(local_size_x = 1) in;
layout(std430, binding = 0) writeonly buffer Out { float o[]; };
uniform float uT;
"""

TAIL = """
void main(){
  float P[8];
  for (int k = 0; k < 8; k++) P[k] = float(k) * 0.125;
  vec3 col;
  vec3 v = %s(vec2(0.25, 0.5), vec4(0.1, 0.2, 0.3, 0.4), 12345u, P, col);
  o[0] = v.x + col.x;
}
"""


def main(argv=None):
    ap = argparse.ArgumentParser(prog="compile-pinned")
    ap.add_argument("--stack", type=int, default=None,
                    help="EGL device index; omit for the default context")
    a = ap.parse_args(argv)

    if not PINNED.exists():
        sys.exit("no build/pinned - run `node tools/compile-pinned.mjs`")
    import moderngl
    kw = {"standalone": True, "require": 430}
    if a.stack is not None:
        kw.update(backend="egl", device_index=a.stack)
    ctx = moderngl.create_context(**kw)
    print(f"  {ctx.info['GL_RENDERER'][:60]}")

    pre = prelude()
    detlib = (PINNED / "detlib.glsl").read_text(encoding="utf-8")
    detpre = (PINNED / "detpre.glsl").read_text(encoding="utf-8")
    base = HEAD + pre + "\n" + detlib + "\n" + detpre + "\n"

    # last run's failures are not this run's input
    for stale in PINNED.glob("*.FAILED.glsl"):
        stale.unlink()
    plates = sorted(p for p in PINNED.glob("*.glsl")
                    if p.name not in ("detlib.glsl", "detpre.glsl")
                    and not p.name.endswith(".FAILED.glsl"))
    good, bad = [], []
    for p in plates:
        body = p.read_text(encoding="utf-8")
        m = re.search(r"vec3 (shape_[A-Za-z0-9_]+)\(", body)
        if not m:
            bad.append((p.stem, "no shape_ entry point"))
            continue
        src = base + body + TAIL % m.group(1)
        try:
            ctx.compute_shader(src)
            good.append(p.stem)
        except Exception as exc:                   # noqa: BLE001
            # the useful part of a driver's log is the lines with
            # "error" in them, not the three-line banner in front
            lines = [ln.strip() for ln in str(exc).splitlines()
                     if "error" in ln.lower() and ln.strip()]
            bad.append((p.stem, " | ".join(lines[:2])[:200]
                        or str(exc).strip()[:200]))
            (PINNED / f"{p.stem}.FAILED.glsl").write_text(src,
                                                          encoding="utf-8")

    print(f"\n  compiled: {len(good)}/{len(plates)}")
    if bad:
        print(f"  FAILED  : {len(bad)}")
        for name, why in bad:
            print(f"    {name:14} {why}")
        print(f"\n  full sources written beside them as *.FAILED.glsl")
    else:
        print("  every pinned plate compiles, det_ helpers and all")
    try:
        ctx.release()
    except Exception:                              # noqa: BLE001
        pass
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
