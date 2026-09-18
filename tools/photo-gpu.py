"""A photograph's GPU side, recorded for the card to be held to.

    python tools/photo-gpu.py [--plate hopf] [--side 512] [--ppd 1048576]
                              [--passes 4] [--capture 4] [--out DIR]
                              [--darkroom ../atlas-darkroom]

Renders one tile of a plate through atlas-darkroom's own Exposure on the
deterministic compute engine - the census's construction, the bundle's
kernel, the plate's own levers and camera - and writes down everything a
second implementation needs to reproduce it and be compared:

  kernel.glsl         the compute source the darkroom compiled
  capture.glsl        the same kernel with each sample's deposit RECORDED
                      (core/cft-camera.mjs, captureKernelOf)
  uniforms.json       every active uniform's raw bytes as GL holds them,
                      read back from the program after the frame was
                      aimed, and each pass's own uSeqOffset / uSeedSalt
  planes.gpu.bin      the three u32 accumulation planes after all passes,
                      the whole buffer, rows bottom-up as the kernel
                      addresses them (plane-major: R, then G, then B)
  records.pNNNN.bin   per captured pass, five u32 a sample in sample
                      order: x, y, r, g, b - x = y = 0xFFFFFFFF where the
                      sample deposited nothing
  photo-gpu.json      the manifest: frame, device, hashes, and the check
                      that the captured records, binned on the host with
                      integer adds, ARE the GPU's planes

The last check is what makes the records worth comparing against: a
capture that differed from what the kernel deposits would be a record of
something else. Integer addition is associative, so binning order does
not matter, and every pass that is captured is binned.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import time

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent

ap = argparse.ArgumentParser()
ap.add_argument("--darkroom", default=str(ROOT.parent / "atlas-darkroom"))
ap.add_argument("--bundle", default=None, help="default: the darkroom's det bundle")
ap.add_argument("--plate", default="hopf")
ap.add_argument("--side", type=int, default=512)
ap.add_argument("--ppd", type=int, default=1 << 20, help="samples a pass")
ap.add_argument("--passes", type=int, default=4)
ap.add_argument("--capture", type=int, default=None, help="passes to record (default: all)")
ap.add_argument("--device-index", type=int, default=None)
ap.add_argument("--out", default=None)
args = ap.parse_args()

sys.path.insert(0, args.darkroom)
from darkroom.render import Exposure, GOLD, PLASTIC  # noqa: E402
from darkroom import bundles  # noqa: E402

bundle_path = pathlib.Path(args.bundle) if args.bundle else pathlib.Path(bundles.det_bundle_path(args.darkroom))
bundle = json.loads(bundle_path.read_text())
b = bundle["plates"][args.plate]
cam = b["cam"]
out = pathlib.Path(args.out or ROOT / "build" / "cft" / "photo" / f"{args.plate}-{args.side}")
out.mkdir(parents=True, exist_ok=True)
sha = lambda by: hashlib.sha256(by).hexdigest()  # noqa: E731

kernel = b["sources"]["compute"]
(out / "kernel.glsl").write_text(kernel, newline="\n")
cap_path = out / "capture.glsl"
made = subprocess.run(["node", str(ROOT / "tools" / "cft-camera.mjs"), "capture",
                       "--kernel", str(out / "kernel.glsl"), "--plate", args.plate,
                       "--out", str(cap_path)], capture_output=True, text=True, check=True)
capture_text = cap_path.read_text()

kw = {}
if args.device_index is not None:
    kw["device_index"] = args.device_index
exp = Exposure(b["plate"], args.side, args.side, sources=b["sources"], engine="compute",
               tile=args.side, points_per_draw=args.ppd, draws_per_pass=1,
               levers=b["levers"],
               yaw=float(cam.get("yaw", 0.0)), pitch=float(cam.get("pitch", 0.0)),
               dist=float(cam.get("dist", 3.0)), tgt_y=float(cam.get("tgtY", 0.0)),
               fov_deg=float(cam.get("fovDeg", 35.0)), sim_t=0.0, **kw)
ctx = exp.ctx
renderer = str(ctx.info.get("GL_RENDERER", "?"))
gl_version = str(ctx.info.get("GL_VERSION", "?"))
print(f"{args.plate}: {args.side}x{args.side}, {args.ppd} samples a pass, {args.passes} passes on {renderer} ({gl_version})",
      flush=True)
exp.begin_frame()
if exp.plane_dtype != "u4":
    raise SystemExit("photo-gpu: this kernel's planes are not r32ui - not the fixed-point camera")

# ---- the GPU's own negative: the darkroom's render_tile, no readback,
# then the three planes read whole in their own format
t0 = time.time()
exp.render_tile(0, 0, args.passes, pass_offset=0, clear=True, harvest=False)
render_s = time.time() - t0
csh = exp.csh
vp = np.frombuffer(csh["uVpSize"].read(), np.int32)
bw, bh = int(vp[0]), int(vp[1])
planes = np.stack([np.frombuffer(exp.fbo.read(components=1, dtype="u4", attachment=ci,
                                              viewport=(0, 0, bw, bh)), np.uint32).reshape(bh, bw)
                   for ci in range(3)])
(out / "planes.gpu.bin").write_bytes(planes.tobytes())

# ---- every active uniform, as the bytes GL holds - after render_tile,
# so the tile-scoped ones (uTileC, uTileS, uVpSize, uSubOrg, uSubExt) are
# the ones this tile used; the per-pass pair is recomputed below exactly
# as render_tile sets it and read back through the same program
def members(prog):
    names = []
    for name in prog:
        try:
            m = prog[name]
        except KeyError:
            continue
        if hasattr(m, "read") and hasattr(m, "dimension"):
            names.append(name)
    return names


uniforms = {}
for name in members(csh):
    u = csh[name]
    raw = u.read()
    uniforms[name] = {"bytes": raw.hex(), "dimension": u.dimension, "array_length": u.array_length,
                      "gl_type": getattr(u, "gl_type", None)}
per_pass = []
for ps in range(args.passes):
    exp._u("uSeqOffset", ((ps * GOLD) % 1.0, (ps * PLASTIC) % 1.0))
    exp._u("uSeedSalt", (ps * 0x9E3779B9) & 0xFFFFFFFF)
    per_pass.append({"pass": ps, "uSeqOffset": csh["uSeqOffset"].read().hex(),
                     "uSeedSalt": csh["uSeedSalt"].read().hex()})

# ---- the capture: the same kernel with each sample's deposit recorded,
# every uniform copied across byte for byte, one dispatch a pass
cap = ctx.compute_shader(capture_text)
for name in members(cap):
    if name in uniforms:
        cap[name].write(bytes.fromhex(uniforms[name]["bytes"]))
total = args.ppd
groups = -(-total // (256 * 8))
buf = ctx.buffer(reserve=total * 5 * 4)
buf.bind_to_storage_buffer(6)
n_cap = args.passes if args.capture is None else min(args.capture, args.passes)
binned = np.zeros((3, bh, bw), np.uint64)
passes_rec = []
t1 = time.time()
for ps in range(n_cap):
    cap["uSeqOffset"].write(bytes.fromhex(per_pass[ps]["uSeqOffset"]))
    cap["uSeedSalt"].write(bytes.fromhex(per_pass[ps]["uSeedSalt"]))
    cap["uFirst"].write(np.uint32(0).tobytes())
    cap["uCountN"].write(np.uint32(total).tobytes())
    buf.clear()
    cap.run(group_x=groups)
    ctx.memory_barrier()
    ctx.finish()
    rec = np.frombuffer(buf.read(), np.uint32).reshape(total, 5)
    fname = f"records.p{ps:04d}.bin"
    (out / fname).write_bytes(rec.tobytes())
    hit = rec[:, 0] != 0xFFFFFFFF
    xs, ys = rec[hit, 0].astype(np.int64), rec[hit, 1].astype(np.int64)
    for ci in range(3):
        np.add.at(binned[ci], (ys, xs), rec[hit, 2 + ci].astype(np.uint64))
    passes_rec.append({"pass": ps, "file": fname, "sha256": sha(rec.tobytes()),
                       "deposited": int(hit.sum())})
capture_s = time.time() - t1
binned32 = (binned & 0xFFFFFFFF).astype(np.uint32)
captured_all = n_cap == args.passes
agree = bool(np.array_equal(binned32, planes)) if captured_all else None

manifest = {
    "schema": "atlas-engine photo-gpu, 1",
    "plate": args.plate, "roman": b.get("roman"),
    "bundle": {"path": str(bundle_path), "sha256": sha(bundle_path.read_bytes()), "era": bundle.get("era"),
               "date": bundle.get("date"), "camera_version": bundle.get("camera_version")},
    "frame": {"side": args.side, "tile": args.side, "buffer": [bw, bh], "samples_a_pass": total,
              "passes": args.passes, "levers": b["levers"], "cam": cam, "fix_scale": exp.fix_scale},
    "device": {"renderer": renderer, "gl_version": gl_version},
    "kernel": {"file": "kernel.glsl", "sha256": sha(kernel.encode())},
    "capture": {"file": "capture.glsl", "sha256": sha(capture_text.encode()), "made_by": json.loads(made.stdout)},
    "uniforms": uniforms,
    "per_pass": per_pass,
    "planes": {"file": "planes.gpu.bin", "sha256": sha(planes.tobytes()), "layout": "3 x bh x bw u32, rows bottom-up",
               "lit": float((planes.sum(axis=0) > 0).mean())},
    "records": passes_rec,
    "records_binned_equal_planes": agree,
    "seconds": {"render": render_s, "capture": capture_s},
}
(out / "photo-gpu.json").write_text(json.dumps(manifest, indent=2))
print(f"  planes sha256 {manifest['planes']['sha256']}, lit {manifest['planes']['lit']:.3f}; "
      f"{n_cap} pass(es) recorded; records binned == planes: {agree}; render {render_s:.2f} s, capture {capture_s:.2f} s")
print(f"  wrote {out}")
exp.release()
