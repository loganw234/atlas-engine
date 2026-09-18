# A photograph on the card

2026-09-18. Plate I, the Hopf fibration, through atlas-darkroom's own
deterministic camera, computed sample by sample on cft-fp256's orbit
sequencer, and held to a GPU's record of every one of those samples.

A darkroom photograph is its compute kernel run over every sample of every
pass. `splat(ia)` derives the sample's point and random numbers from its
index, calls the plate's shape function, carries the point through the view,
the lens and the projection to a pixel, quantises its colour to fixed point,
and hands three integers to `imageAtomicAdd`. Integer addition is
associative, so the negative is the same whatever order the samples arrive
in. That is what makes it possible to compute the samples somewhere else
entirely and add them up on the host, and it is the whole of the plan: the
card computes each sample's record (the pixel and three fixed-point
channels), and the host adds them.

**On the card, every one of the 4,194,304 samples of a four-pass 512 x 512
photograph is the GPU's record of that sample, bit for bit** - the pixel and
all three fixed-point channels - and the planes the host adds up from the
card's deposits are the GPU's planes, SHA-256
`bbbd38e6adc845fb2ec855cc9c2c8ca8e7b27e948088fefe593237ce5418be9b`.
Developed by the darkroom's own `develop` at its defaults, the card's print
and the GPU's are the same PNG, byte for byte.

![Plate I, the Hopf fibration: 512 x 512, four passes of a million samples,
every sample computed on the U50 and developed by the darkroom -
identical, byte for byte, to the GPU's print](photograph-on-the-card.png)

## The camera, as the tile reads it

`core/cft-camera.mjs` makes the TILE FORM of the kernel: the darkroom's
text, with only edits that leave what a sample computes unchanged.

- What belongs to a GPU dispatch and not to a sample goes: `#version`, the
  layout, image and buffer declarations, the `ADDF` macro, the sample-count
  atomic, and `main()`.
- `splat(uint ia)` takes five `out` parameters, the pixel and the three
  channels, set first to the "no deposit" record (x = y = -1), so an early
  `return;` (behind the eye, off the tile, vignetted) leaves exactly that.
- Each `ADDF(acc, px, v)` becomes the macro's own expression,
  `uint(clamp(v * DET_FIX_SCALE + 0.5, 0.0, 4200000000.0))`, assigned to
  that channel. Adding a zero is adding nothing, so the macro's
  `if (_q != 0u)` guard needs no counterpart.
- The eight-lever copy loop `P[i] = uP[i]` goes, and the shape function is
  handed `uP`, which it only reads.

The GPU's side is `captureKernelOf`: the SAME record edits made to the
untouched kernel, everything else as the darkroom compiles it (the copy
loop included), and a `main()` that writes each sample's five words to a
buffer at the sample's index. The dispatch is the darkroom's, eight samples
an invocation.

**The capture is checked against the kernel it came from.**
`tools/photo-gpu.py` renders the tile through the darkroom's own
`Exposure` first, then runs the capture over the same passes with every
uniform copied across byte for byte. Binning the captured records on the
host with integer adds reproduces the GPU's own three planes exactly. A
capture that differed from what the kernel deposits would be a record of
something else, and this check is what rules that out.

## The program, specialised to the frame

Every uniform is read back from GL as the bytes it holds after the darkroom
has aimed the frame, and the camera is lowered with each one bound to those
bits: the view and projection matrices, the tile's crop, the lens's
settings, the levers. Two change per pass, the Cranley-Patterson rotation
`uSeqOffset` and the hash salt `uSeedSalt`, and they are the per-run tail,
three words at the end of the bank. The sample index is the one input
stream; `positive-run --iota` supplies it as the lane index, which is what
the GPU's `uFirst + gid * 8 + k` is too.

The lens branches are why specialising matters. The kernel carries a
thin-lens camera with bladed irises, a sixteen-trip rejection loop for
curved blades, a catadioptric obstruction, third-order aberrations, axial
and lateral colour, distortion, a fisheye, mechanical vignetting and focus
peaking. A pinhole frame runs none of it. The lowering folds a comparison
between two known values - a comparison rounds nothing, so deciding it is
not deciding a rounding - and a known condition takes one arm and never
lowers the other. On this frame thirteen comparisons fold and eight
branches are taken statically, and what is left is:

| | |
|---|---|
| words | 1,081 (1,075 arithmetic, no loops, no scratch) |
| registers | 17 |
| bank | 67 program constants, 9 hoisted per-pass values (59 instructions off the lane), 3 tail words |
| deposits | `recX` `recY` `recR` `recG` `recB` - the record, in the capture's order |
| uniforms GL dropped | `uAxialCA`, `uPt`: bound to zero, which nothing live reads |

The front end had to learn the camera's GLSL, which is the whole language
rather than an emitter's output: `mat2`-`mat4`, `uvec` and `bvec`,
swizzles read and written (`vpos.xy +=`, `cp.xy`), `precise` on
parameters, `++i`, vector `==` and `!=`, `any`/`all` and the relational
builtins, componentwise builtins on vectors, a uniform array, a global
written by the function being lowered (the camera sets `uT` to the
sample's instant and then calls the shape function), and overloads - the
bake gives every `det_*` function vector forms under the same name, so a
call is resolved by its argument types (`core/glsl-sub.mjs`). `uint(x)` is
exact over the whole range a `uint` holds now, since the deposit's clamp
reaches 4.2e9 and the old cast was exact to 2^23 (`core/cft-lower.mjs`,
`f2u`). None of it moved a positive's bits: the 138-case pack, every
positive at its defaults and at a hashed lever setting, verified five ways
after all of it went in.

## Three executions of every sample, and the GPU's

| execution | samples | records equal to the GPU's | planes |
|---|---|---|---|
| the reference: the tile form at binary32 (`core/glsl-f32.mjs`) | 4 x 4,096 | all 16,384 | - |
| libcft's program executor, software (`cft_program_run`) | 4 x 1,048,576 | all 4,194,304 | `bbbd38e6...`, identical |
| **the card**: U50, revision 6, single tile (`positive-run`, patched library) | 4 x 1,048,576 | **all 4,194,304** | **`bbbd38e6...`, identical** |
| the GPU: RTX 5060 Ti, NVIDIA 591.86, the darkroom's kernel with its deposits recorded | 4 x 1,048,576 | the record | `bbbd38e6...` |

Each pass's deposit buffer, as the card wrote it and as the GPU recorded
it (`photo-hopf-512-single.log`, in `docs/silicon/2026-09-18/`):

| pass | `uSeqOffset` | `uSeedSalt` | SHA-256, card and GPU |
|---|---|---|---|
| 0 | (0, 0) | `0x00000000` | `c3de029663d4154a93855cdfb24cbdaa478dd6a110f4d4a98bda95789ed3673b` |
| 1 | (0.6180, 0.7549) | `0x9e3779b9` | `077c3252aea1c408b029076b0cb89cab8f231ba14b2c57862107f046e4722ef9` |
| 2 | (0.2361, 0.5098) | `0x3c6ef372` | `750ddad59c7c5f95d42e78e4be287f1ef2b483b220434d73f595fd371ecb65c8` |
| 3 | (0.8541, 0.2646) | `0xdaa66d2b` | `81c593c573dcbe3b58b8ce094bf41f943b6a9d84e1ff398960f365a70267e22c` |

4,060,869 of the samples deposit; the other 133,435 fall outside the tile or
behind the eye, and their record is the "no deposit" record on both sides.
On the card a pass is 1.21 s, 1.15 µs a sample - the median of three runs of
pass 0, the run alone on the clock - and the same pass run as eight
contiguous blocks gives the same buffer. libcft's software executor took 150
to 166 s a pass on this PC (one thread, beside the verification pack), and
the GPU 7 ms for all four passes.

## A second plate: a loop that exits early

The same harness, the same camera, around `mand` - the plate whose walk
iterates until the point escapes, which lowers to a `REPEAT` whose early exit
is `SETACT`, inlined into `splat` with the rest. 512 x 512, two passes of
1,048,576 samples, on the same GPU:

| | |
|---|---|
| words | 1,272 (1,261 arithmetic, one loop) |
| registers | 18 |
| bank | 97 program constants, 19 hoisted per-pass values (240 instructions off the lane), 3 tail words |
| folded | 33 comparisons; 24 branches taken statically |

Both passes' deposit buffers on the card are the GPU's records, byte for
byte (`1ede9316...` and `5cafbac6...`, `photo-mand-512-single.log`), the
planes the host adds up from them are the GPU's (`adaeb2d8...`), and so is
the print. 3.02 µs a sample on the card. The same pass as eight contiguous
blocks gives the same buffer, and on a program with an early exit that is
a statement about more than addresses: a block ends when its slowest lane
leaves, so the partition moves WHEN the exit fires, and the contract says
that changes nothing but the time.

![Plate mand under the darkroom's camera: 512 x 512, two passes, every
sample computed on the U50](photograph-on-the-card-mand.png)

## What it does not show

- **Two plates, one frame each, one lens.** Other plates are other shape
  functions under the same camera, and each is a lowering the corpus
  already verifies. A lens with an aperture is not: the iris, the
  aberrations and the rejection loop were folded away here, and a frame
  that runs them lowers them. The loop has a `break`, which is SETACT's
  shape, so nothing is missing for it; it has simply not been run.
- **An open shutter.** `uT` is each sample's own instant then, so the
  values that follow the clock stop being per-pass and come back onto the
  lane. The lowering already treats `uT` as the per-sample value the
  camera computes; the frame here has the shutter closed, and the
  arithmetic that writes `uT` still runs on every lane.
- **The GPU's speed.** The RTX 5060 Ti rendered the four passes in 7 ms.
  The card's rate is in the table, and it is not the point: the point is
  that the two produce the same negative from the same text, and that
  cft-fp256, whose contract is the stricter, is the one a disagreement
  would be settled by.

## Re-running it

```bash
python tools/photo-gpu.py --plate hopf --side 512 --ppd 1048576 --passes 4
node tools/photo-cft.mjs --dir build/cft/photo/hopf-512 --ref 4096 --lib 1048576 --pack
python tools/photo-gpu.py --plate mand --side 512 --ppd 1048576 --passes 2
node tools/photo-cft.mjs --dir build/cft/photo/mand-512 --ref 1024 --lib 16384 --pack
# on the card's host, with build/cft/photo/hopf-512 copied to ~/atlas-silicon/photo/hopf-512:
bash tools/silicon/photo.sh ~/atlas-silicon/photo/hopf-512 single
```

`photo-gpu.py` needs the darkroom checkout beside this one (`--darkroom`)
and a GL 4.3 context; `photo-cft.mjs` needs libcft's node binding, as the
verifier does; `photo.sh` needs the patched library of
`docs/CFT-SILICON.md`, because a pass is a million lanes.
