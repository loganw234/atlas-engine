#!/usr/bin/env python3
"""Compiles every pinned plate on a real driver, and runs it.

COMPILING is Phase 2's last check: a scan over text cannot see a
missing function, a mismatched type, or a name that collides with a
GLSL keyword, and pinning swapped a dozen builtins for functions the
engine wrote itself - exactly the mistakes it could make.

RUNNING is Phase 3. The bar there is not accuracy and not correlation:
it is whether the SAME emitted program returns the SAME BITS on two
different implementations. That is the property the commons needs and
the one no amount of care on a single stack can demonstrate.

THE CONTROL IS NOT OPTIONAL. Pinned plates agreeing across two drivers
means nothing on its own - the input set might be too small, the plates
might be arithmetically dull, the two stacks might share a backend. So
the same positives are emitted UNPINNED and run identically. The
unpinned run has to DISAGREE where the pinned run agrees, or this
instrument cannot see a difference and its agreements are not evidence.

The prelude is taken from the DARKROOM, not written here: pal, hashu,
u2f and the complex helpers are the registry's, and a plate emitted
against a private copy of them would compile here and fail in
PrettyCloud. Extracted by the same regexes shapeprobe.py uses, so if
the camera moves this stops rather than drifting.

    python tools/compile-pinned.py                      compile only
    python tools/compile-pinned.py --run TAG            compile, run, record
    python tools/compile-pinned.py --run TAG --stack 2  pick an EGL device
    python tools/compile-pinned.py --compare            across recorded runs
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
UNPINNED = ROOT / "build" / "unpinned"
DARKROOM = pathlib.Path(os.environ.get("DARKROOM", ROOT.parent /
                                       "atlas-darkroom"))
NRUN = 1 << 16


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
    m = re.search(r"vec2 csqrt\(vec2 z\)\{.*?\n\}", src, re.S)
    if m:
        out.append(m.group(0))
    return "\n".join(out)


# uT IS PART OF THE PLATE CONTRACT, not of this harness. Animated plates
# read it, the darkroom sets it per exposure from uT0 and the shutter,
# and a compile without it fails on eighteen plates for a reason that
# has nothing to do with pinning.
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

RUN_HEAD = """#version 430
layout(local_size_x = 128) in;
layout(std430, binding = 0) readonly  buffer Qi  { float qi[];  };
layout(std430, binding = 1) readonly  buffer Ri  { float ri[];  };
layout(std430, binding = 2) readonly  buffer Si  { uint  si[];  };
layout(std430, binding = 3) writeonly buffer Out { float o[];   };
uniform uint uN;
uniform float uT;
"""

RUN_TAIL = """
void main(){
  uint i = gl_GlobalInvocationID.x;
  if (i >= uN) return;
  vec2 q   = vec2(qi[2u*i], qi[2u*i+1u]);
  vec4 rnd = vec4(ri[4u*i], ri[4u*i+1u], ri[4u*i+2u], ri[4u*i+3u]);
  float P[8];
  for (int k = 0; k < 8; k++) P[k] = float(k) * 0.1234 + 0.05;
  vec3 col;
  vec3 v = %s(q, rnd, si[i], P, col);
  o[6u*i+0u] = v.x; o[6u*i+1u] = v.y; o[6u*i+2u] = v.z;
  o[6u*i+3u] = col.x; o[6u*i+4u] = col.y; o[6u*i+5u] = col.z;
}
"""


def inputs():
    """Fixed bits, generated identically on every machine, so two stacks
    consume literally the same numbers rather than the same recipe."""
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
    seed = ((ia * 2654435761) % (1 << 32)).astype(np.uint32)
    return q, r, seed


def plates_in(root):
    return sorted(p for p in root.glob("*.glsl")
                  if p.name not in ("detlib.glsl", "detpre.glsl")
                  and not p.name.endswith(".FAILED.glsl"))


def entry(body):
    m = re.search(r"vec3 (shape_[A-Za-z0-9_]+)\(", body)
    return m.group(1) if m else None


def do_compile(ctx, base):
    for stale in PINNED.glob("*.FAILED.glsl"):
        stale.unlink()
    plates = plates_in(PINNED)
    good, bad = [], []
    for p in plates:
        body = p.read_text(encoding="utf-8")
        name = entry(body)
        if not name:
            bad.append((p.stem, "no shape_ entry point"))
            continue
        src = base + body + TAIL % name
        try:
            ctx.compute_shader(src)
            good.append(p.stem)
        except Exception as exc:
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
        print("\n  full sources written beside them as *.FAILED.glsl")
    else:
        print("  every pinned plate compiles, det_ helpers and all")
    return bad


def run_variant(ctx, base, root):
    """Run every plate of one variant over the fixed inputs, and hash
    what comes back."""
    import numpy as np
    q, r, seed = inputs()
    bq = ctx.buffer(q.tobytes())
    br = ctx.buffer(r.tobytes())
    bs = ctx.buffer(seed.tobytes())
    bo = ctx.buffer(reserve=4 * 6 * NRUN)

    out = {}
    for p in plates_in(root):
        body = p.read_text(encoding="utf-8")
        name = entry(body)
        if not name:
            continue
        src = base + body + RUN_TAIL % name
        try:
            prog = ctx.compute_shader(src)
        except Exception as exc:
            out[p.stem] = {"error": str(exc).strip()[:160]}
            continue
        bq.bind_to_storage_buffer(0)
        br.bind_to_storage_buffer(1)
        bs.bind_to_storage_buffer(2)
        bo.bind_to_storage_buffer(3)
        prog["uN"].value = NRUN
        try:
            prog["uT"].value = 0.375
        except KeyError:
            pass                       # this plate never reads it
        prog.run(group_x=(NRUN + 127) // 128)
        ctx.finish()
        a = np.frombuffer(bo.read(), np.float32).reshape(NRUN, 6)
        pos = np.ascontiguousarray(a[:, :3])
        col = np.ascontiguousarray(a[:, 3:])
        # SIGNED ZERO IS A HASH DIFFERENCE AND NOT A NUMERICAL ONE.
        # Measured on lyap: every one of 16,384 samples had y = -0.0 on
        # NVIDIA and +0.0 on radeonsi, and NOT ONE value differed
        # otherwise. The two deposit into the same pixel, so the census
        # - which hashes accumulated counts - cannot see it, while this
        # harness - which hashes returned floats - fails on it.
        #
        # So both are recorded. `pos` is the strict hash; `pos_canon`
        # canonicalises -0.0 to +0.0 first and is the one that
        # corresponds to what an image would show. Reporting only the
        # strict number would call a plate divergent over a sign bit
        # nothing downstream reads; reporting only the canonical one
        # would hide a real distinction in the returned value.
        def canon(v):
            u = np.ascontiguousarray(v).view(np.uint32).copy()
            u[u == 0x80000000] = 0
            return u
        out[p.stem] = {
            "pos": hashlib.sha256(pos.tobytes()).hexdigest()[:16],
            "pos_canon": hashlib.sha256(canon(pos).tobytes()).hexdigest()[:16],
            "col": hashlib.sha256(col.tobytes()).hexdigest()[:16],
            "col_canon": hashlib.sha256(canon(col).tobytes()).hexdigest()[:16],
            "negzero": int((np.ascontiguousarray(a).view(np.uint32)
                            == 0x80000000).sum()),
            "finite": bool(np.isfinite(a).all()),
        }
    return out


def compare():
    """Every recorded run against every other, per variant."""
    recs = {}
    for f in sorted(PINNED.glob("run-*.json")):
        recs[f.stem[4:]] = json.loads(f.read_text(encoding="utf-8"))
    if len(recs) < 2:
        sys.exit(f"need at least two run-*.json in {PINNED}; have "
                 f"{len(recs)}")

    print(f"{len(recs)} stacks recorded, {NRUN:,} samples each:")
    for tag, rec in recs.items():
        print(f"  {tag:22} {rec['renderer'][:52]}")

    verdict = {}
    for variant in ("pinned", "unpinned"):
        print(f"\n=== {variant.upper()} ===")
        names = [t for t, r in recs.items() if variant in r["variants"]]
        if len(names) < 2:
            print("  fewer than two stacks ran this variant")
            continue
        pairs = []
        for a, b in itertools.combinations(names, 2):
            ra = recs[a]["variants"][variant]
            rb = recs[b]["variants"][variant]
            both = [p for p in sorted(set(ra) & set(rb))
                    if "error" not in ra[p] and "error" not in rb[p]]
            same_pos = [p for p in both if ra[p]["pos"] == rb[p]["pos"]]
            canon = [p for p in both
                     if ra[p].get("pos_canon") == rb[p].get("pos_canon")]
            same_all = [p for p in same_pos if ra[p]["col"] == rb[p]["col"]]
            pairs.append((len(same_pos), len(same_all), len(both)))
            print(f"  {a[:18]:18} vs {b[:18]:18} "
                  f"position {len(same_pos):3d}/{len(both):3d}   "
                  f"ignoring -0 {len(canon):3d}/{len(both):3d}   "
                  f"+colour {len(same_all):3d}/{len(both):3d}")
            zonly = sorted(set(canon) - set(same_pos))
            if zonly:
                print(f"      differ ONLY in the sign of a zero: "
                      f"{' '.join(zonly)}")
            diff = sorted(p for p in both if p not in canon)
            if diff:
                shown = " ".join(diff[:10])
                more = f" ... (+{len(diff) - 10})" if len(diff) > 10 else ""
                print(f"      position differs: {shown}{more}")
        verdict[variant] = pairs

    if "pinned" in verdict and "unpinned" in verdict:
        pin_min = min(p for p, _, _ in verdict["pinned"])
        pin_of = max(t for _, _, t in verdict["pinned"])
        unp_min = min(p for p, _, _ in verdict["unpinned"])
        unp_of = max(t for _, _, t in verdict["unpinned"])
        print("\n=== THE COMPARISON THAT MATTERS ===")
        print(f"  worst pair, pinned   : {pin_min}/{pin_of} plates "
              f"bit-identical in position")
        print(f"  worst pair, unpinned : {unp_min}/{unp_of} plates "
              f"bit-identical in position")
        if unp_min >= pin_min:
            print("\n  THE CONTROL DID NOT SEPARATE. Unpinned plates agree "
                  "as widely as pinned")
            print("  ones, so this instrument cannot see a difference and "
                  "the pinned")
            print("  agreement is not evidence of anything.")
            return 1
        print(f"\n  The control separates: pinning moves "
              f"{pin_min - unp_min} plates from")
        print("  disagreeing to bit-identical on the worst pair. THAT "
              "difference is the")
        print("  measurement; the agreement on its own would not have "
              "been.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="compile-pinned")
    ap.add_argument("--stack", type=int, default=None,
                    help="EGL device index; omit for the default context")
    ap.add_argument("--run", metavar="TAG",
                    help="also run every plate and record the hashes")
    ap.add_argument("--compare", action="store_true",
                    help="compare the recorded runs across stacks")
    ap.add_argument("--dump", metavar="PLATE",
                    help="save one plate's raw output, for diffing "
                         "sample by sample rather than by hash")
    a = ap.parse_args(argv)

    if a.compare:
        return compare()

    if not PINNED.exists():
        sys.exit("no build/pinned - run `node tools/compile-pinned.mjs`")
    import moderngl
    kw = {"standalone": True, "require": 430}
    if a.stack is not None:
        kw.update(backend="egl", device_index=a.stack)
    ctx = moderngl.create_context(**kw)
    renderer = str(ctx.info["GL_RENDERER"])
    print(f"  {renderer[:60]}")

    pre = prelude()
    detlib = (PINNED / "detlib.glsl").read_text(encoding="utf-8")
    detpre = (PINNED / "detpre.glsl").read_text(encoding="utf-8")
    # THE DET LIBRARY GOES INTO BOTH VARIANTS. The control is the plate
    # text, not the library: linking detlib only for the pinned run
    # would confound "emitted through the pinned set" with "detlib
    # present in the shader at all", and the second could move results
    # on its own - a shared subexpression appearing where there was
    # none changes contraction on AMD and Intel.
    base = pre + "\n" + detlib + "\n" + detpre + "\n"

    bad = do_compile(ctx, HEAD + base)

    if a.dump:
        import numpy as np
        q, r, seed = inputs()
        for variant, root in (("pinned", PINNED), ("unpinned", UNPINNED)):
            f = root / f"{a.dump}.glsl"
            if not f.exists():
                continue
            body = f.read_text(encoding="utf-8")
            src = RUN_HEAD + base + body + RUN_TAIL % entry(body)
            prog = ctx.compute_shader(src)
            bq = ctx.buffer(q.tobytes())
            br = ctx.buffer(r.tobytes())
            bs = ctx.buffer(seed.tobytes())
            bo = ctx.buffer(reserve=4 * 6 * NRUN)
            bq.bind_to_storage_buffer(0)
            br.bind_to_storage_buffer(1)
            bs.bind_to_storage_buffer(2)
            bo.bind_to_storage_buffer(3)
            prog["uN"].value = NRUN
            try:
                prog["uT"].value = 0.375
            except KeyError:
                pass
            prog.run(group_x=(NRUN + 127) // 128)
            ctx.finish()
            arr = np.frombuffer(bo.read(), np.float32).reshape(NRUN, 6)
            out = PINNED / f"dump-{a.dump}-{variant}-{a.run or 'x'}.npy"
            np.save(out, arr)
            print(f"  dumped {variant} -> {out.name}")
        try:
            ctx.release()
        except Exception:
            pass
        return 0

    if a.run:
        rec = {"renderer": renderer,
               "gl_version": str(ctx.info.get("GL_VERSION", "?")),
               "samples": NRUN, "variants": {}}
        rec["variants"]["pinned"] = run_variant(ctx, RUN_HEAD + base, PINNED)
        if UNPINNED.exists():
            rec["variants"]["unpinned"] = run_variant(ctx, RUN_HEAD + base,
                                                      UNPINNED)
        out = PINNED / f"run-{a.run}.json"
        out.write_text(json.dumps(rec, indent=1), encoding="utf-8")
        for v, d in rec["variants"].items():
            errs = sum(1 for x in d.values() if "error" in x)
            print(f"  ran {len(d) - errs}/{len(d)} {v}"
                  + (f" ({errs} failed to compile)" if errs else ""))
        print(f"  wrote {out.name}")

    try:
        ctx.release()
    except Exception:
        pass
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
