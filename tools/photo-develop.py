"""A photograph's planes, developed into a print by the darkroom's own
`develop` at its defaults.

    python tools/photo-develop.py PLANES.bin --manifest photo-gpu.json --out print.png
                                  [--darkroom ../atlas-darkroom]

PLANES.bin is three u32 planes (R, G, B), each the tile buffer's size,
rows bottom-up as the kernel addresses them - what tools/photo-gpu.py
reads from the GPU and tools/photo-cft.mjs or the card's deposits bin on
the host. The words are fixed point at the camera's DET_FIX_SCALE (2^12,
`uintBitsToFloat(0x45800000u)` in the kernel), so the negative is the
words over 4096: exactly the decode the darkroom's own readback does.
Nothing here is part of any comparison - the comparisons are on the
words - it is only the picture.
"""
import argparse
import json
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
ap = argparse.ArgumentParser()
ap.add_argument("planes")
ap.add_argument("--manifest", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--darkroom", default=str(HERE.parent.parent / "atlas-darkroom"))
args = ap.parse_args()
sys.path.insert(0, args.darkroom)
from darkroom.develop import develop  # noqa: E402
from PIL import Image  # noqa: E402

man = json.loads(pathlib.Path(args.manifest).read_text())
bw, bh = man["frame"]["buffer"]
words = np.frombuffer(pathlib.Path(args.planes).read_bytes(), np.uint32).reshape(3, bh, bw)
neg = (words.astype(np.float64) / 4096.0).astype(np.float32)
neg = np.ascontiguousarray(np.transpose(neg, (1, 2, 0))[::-1])   # rows top-down, channels last
img, exposure = develop(neg)                # the print, and the exposure it metered
arr = np.asarray(img)
if arr.dtype != np.uint8:
    arr = np.clip(arr * 255.0 + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(arr).save(args.out)
print(f"{args.out}: {arr.shape[1]}x{arr.shape[0]}, metered exposure {float(exposure):.6g}, from {args.planes}")
