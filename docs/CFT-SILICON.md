# The positives on silicon

**2026-09-17.** The first run of this engine's programs on cft-fp256
hardware, and the first real use of revision 6 of that project's
sequencer by a workload from outside it. Every positive, lowered by
`core/emit-cft.mjs` and held to its emitted GLSL through four evaluations
(`docs/CFT-POSITIVE.md`), went to a Xilinx U50 and came back bit for bit.
This file is the record; the raw logs are `docs/silicon/2026-09-17/`, and
what the day found for the coprocessor project is
`docs/silicon/FINDINGS-for-cft-fp256.md`.

| | |
|---|---|
| host | amd-arc-box, Ubuntu 24.04.4, Linux 6.8.0-139, XRT 2.19.194 (2025.1) |
| card | U50, shell `xilinx_u50_gen3x16_xdma_base_5`, BDF 0000:02:00.1 |
| images | cft-fp256's round-2 pair, both from 5b7aa19, revision 6, VERSION 0xA00, 135 MHz: `cft_hw_single.xclbin` (97482ec7...) and `cft_hw_quad.xclbin` (226d6c76...), `sha256sum -c` clean |
| host tools | a clean clone of cft-fp256 at 56ad0cd, `make -C host XRT=1 all device-test`, ABI 0.14 |
| the gate | `hw/run-device-test.sh cft_hw_single.xclbin -q -n 8`: **2,248 checks, 0 failed** |

## What changed on this side first

- **`SCRATCH_STRICT` is set** on every image that touches the scratch, and
  written as `.scratch strict` in the assembly text. It waited for this
  day: every card image since the revision-4 pair carries it. An indexed
  access past the depth is now reported rather than wrapped, so an image
  means the same thing on any tile deep enough to load it.
- **The verifier scores two things it only printed.** Every lane's deposit
  count, and a clean run's STATUS word.
- **A race in the verifier, found by running it in parallel.** Its working
  files were named for the positive rather than for the case, so the
  defaults run and the hashed-lever run of one positive, started side by
  side, wrote one bank file. `mand`'s golden-model check read the other
  setting's bank and reported 64 deposits differing from a libcft run that
  was right. Named for the case now; the whole pack was re-run after the
  fix.
- **The sample points have one definition**, `core/cft-samples.mjs`, shared
  by the verifier and by the tool that writes card-scale streams. The
  refactor was checked by re-packing a case through it: every file
  byte-identical.

## The program set

`tools/pack-cft-set.mjs` packs every positive at its lever defaults and at
a hashed setting as a self-contained test case - image, bank, three input
streams, the expected deposit buffer, the assembly text, and a record of
what agreed on it - and nothing is packed that did not agree everywhere:
libcft over all 1,001 lanes, the golden model on the first sixteen, the
assembler's bytes, the runner where it would load the image, and the
emitted GLSL interpreted at binary32. **138 cases packed of 138.** Two
probe cases ride beside them (below). The set carries its own replayer,
`run_set.py`, and is written to go to cft-fp256 as a program-model test
set, because that project's conformance profile makes the program model
normative but holds no program cases in its identity.

The set replayed through `run_set.py` on every device, with both runners:

| device | `positive-run` | cases | matched | mismatched | refused by name | seconds |
|---|---|---|---|---|---|---|
| software backend | strict-capable | 140 | 140 | 0 | 0 | 1,500 |
| software backend | stock | 140 | 77 | 0 | 63 | 94 |
| single tile | strict-capable | 140 | 139 | 1 | 0 | 105 |
| single tile | stock | 140 | 77 | 0 | 63 | 14 |
| quad | strict-capable | 140 | 139 | 1 | 0 | 125 |
| quad | stock | 140 | 77 | 0 | 63 | 20 |

"Strict-capable" is `positive-run` with `SCRATCH_STRICT` added to its own flag subset, one line; the stock binary refuses every image that sets the bit, by name. Every mismatch: r8-strict: status 0x00000000.

## First light, and the probe that found a host defect

The first two programs on the card were `hopf` - no loop, 638 words - and
`nested` - loops, an array local through indexed scratch, strict - and
both deposit buffers matched their packed expectations to the byte, with
the program digest and the IEEE flags the software backend reports.

The strict-scratch probe is two eight-instruction programs, the same
indexed store and load with and without `.scratch strict`, over 1,024 lanes
whose indices run past the 256-slot depth. The golden model says the strict
one returns STATUS 0x20. On both images the card's deposits were exactly
right - out-of-range stores suppressed, loads reading +0 - and the status
word came back 0. `CFT_XRT_TRACE` printed the tile's own register as
`STATUS=0x00000020`: the tile raised the bit and the host library dropped
it, in `host/src/backend_xrt.cpp`, which reduces STATUS to the
deposit-overflow bit on both return paths. A two-line patch, built in a
separate worktree, made both images report 0x20. Their `device-test`
checks that a strict image loads; nothing had run an index past the depth
on a device.

## How fast, at card scale

Nine positives chosen to span the corpus - 185 to 14,801 instructions,
no loop and loops with and without an early exit, the deepest scratch
users - went to the card at 65,536 lanes, and the four quickest also at a
million. The streams are `tools/cft-streams.mjs`'s, from the verifier's own
sample definition; the expected deposit buffers are the software backend's,
computed on the host in 32 lane blocks. Timed with the run alone on the
clock, the median of three, on the single tile with the lanes also run as
eight separate blocks, and on the quad. The software column is the same
program's cost on one core of the host at 1,001 lanes, from the whole-set
replay; the last column is darkroom's default exposure - 200 passes of
2^24 points - on one tile.

| positive | instructions | lanes | card, µs a lane | quad, µs a lane | card, lanes a second | software, µs a lane | card over software | one tile, a default exposure |
|---|---|---|---|---|---|---|---|---|
| `psf` | 185 | 1,048,576 | 0.27 | 0.27 | 3,752,504 | 22.0 | 82x | 15 min |
| `hopf` | 638 | 1,048,576 | 0.72 | 0.72 | 1,390,034 | 82.7 | 115x | 40 min |
| `mand` | 1,111 | 1,048,576 | 3.00 | 3.00 | 333,682 | 174.3 | 58x | 2.8 h |
| `jong` | 737 | 1,048,576 | 3.96 | 3.96 | 252,396 | 491.4 | 124x | 3.7 h |
| `starfield` | 5,475 | 65,536 | 5.85 | 5.86 | 170,797 | 621.9 | 106x | 5.5 h |
| `throughput` | 14,801 | 65,536 | 24.98 | 24.98 | 40,025 | 1,154.4 | 46x | 23.3 h |
| `stdmap` | 912 | 65,536 | 95.44 | 95.44 | 10,478 | 11,020.5 | 115x | 3.7 days |
| `nested` | 1,401 | 65,536 | 171.35 | 171.35 | 5,836 | 3,874.4 | 23x | 6.7 days |
| `threebody` | 2,029 | 65,536 | 3,286.19 | 3,286.23 | 304 | 163,794.6 | 50x | 127.6 days |

Every row matched its expected deposit buffer on both images - the software backend's, computed in 32 lane blocks - and on the single tile 13 of 13 runs also matched when the lanes went in as eight separate runs.

**Three things the table says.** The card's cost a lane is the program's
executed instructions, not its length: `starfield`'s 5,475 instructions
with no loop cost a sixteenth of what `stdmap`'s 912 cost around a 400-trip
loop. The slow rows are the loops that run long - the tile runs a block of
128 lanes until its slowest lane leaves, and `stdmap`'s slowest in the
sampled lanes needs 221 of its 400 trips at the defaults, while `nested`
runs every trip of its inner loops, which keep the selected form because
they sit inside another loop.
The quad runs a program exactly as fast as the single tile, because
libcft runs a program on one tile. And the card's advantage over one host
core is smallest where a lane's work is scratch traffic - `nested` 23x,
`throughput` 46x, `threebody` 50x - which is the instruction cost above
showing through; the `SETACT` loops `jong` and `stdmap` are among the
largest. `mand`, at 58x, is the loop that does not fit, and the likely
reason is the block rather than the instructions: the software backend runs
64 lanes a block against the card's 128, and `mand`'s lanes mostly leave
within a few trips, so its smaller blocks hold a slow lane less often. The
software column is `positive-run`'s wall clock over 1,001 lanes, so process
start-up is in it, which flatters the card least on the slow rows and most
on `psf` and `hopf`.

**One cost that is not a program's.** The first run after switching images
pays for loading the bitstream: 3.9 s on the single tile and 7.6 s on the
larger quad, against 0.14 s for the same `allpaths` run once loaded. It
made `allpaths`, alphabetically first, look twice as slow on the quad in
the set replay; timed with the run alone it is 142 µs a lane on both.

**Two limits this measurement ran into, both in the host library, neither
in the arithmetic.** Above 32,768 lanes the stock library corrupts the
host heap after writing correct deposits, and every card-scale number
here used a library with that fixed (`docs/silicon/FINDINGS-for-cft-fp256.md`,
finding 2). And a program run that takes more than a minute times out
unless `CFT_TIMEOUT_MS` says otherwise - `threebody` at 65,536 lanes takes
three and a half.

## What one instruction costs on silicon

`tools/probes/insn-cost.py` writes five programs that differ only in the
instruction pair inside one `repeat 1024`: one arithmetic instruction, two,
a static scratch store and load, an indexed store and load, and an
arithmetic instruction beside a `SETACT` that keeps every lane. Timed on
16,384 lanes with the run alone on the clock (`cft-silicon-time.py`, the
median of three), every buffer matching the golden model's:

| program, 1,024 trips | card, µs a lane | software, µs a lane |
|---|---|---|
| one arithmetic instruction | 1.24 | 14.77 |
| two arithmetic instructions | 2.24 | 29.23 |
| static scratch store and load | 8.18 | 16.08 |
| indexed scratch store and load | 8.41 | 23.34 |
| arithmetic and `SETACT` | 5.38 | 24.76 |

The single tile and the quad gave the same numbers to the hundredth: a
program run is one tile's. Taken apart per instruction and per lane:

| instruction | card | software |
|---|---|---|
| arithmetic | 0.98 ns | 14.1 ns |
| static scratch store or load | 3.9 ns | 7.7 ns |
| indexed scratch store or load | 4.0 ns | 11.2 ns |
| `SETACT` | 4.0 ns | 9.8 ns |

**On the card every control-coded instruction measured costs about four
arithmetic ones.** On the software backend the order is the other way
round: a scratch access is cheaper than arithmetic. An fp32 lane block is
128 lanes, so the arithmetic figure is about one clock cycle a beat -
revision 5's measured number - and the other three about four.

What that means here. The spiller was built to minimise registers and then
words; it counts a store or a load as one word, the same as an addition.
On silicon each costs four. `throughput`, the deepest spiller, reaches 186
slots with no loop around them, so its traffic is paid once a lane; a
positive that spills inside a loop pays it every trip. And the top-level
`SETACT` that gave the loops their early exit costs four arithmetic
instructions a trip, which is the question the next section answers.

## What the early exit is worth on silicon

A top-level `break` became `SETACT` on 2026-09-08 so the tile's early exit
could fire; the measurement above says each `SETACT` costs four
arithmetic instructions a trip. So the three loop positives were lowered
both ways - `SETACT`, and the selected form every loop used before - with
identical input streams, and timed on the single tile at 65,536 lanes. Both
forms matched the same expected deposit buffer
(`earlyexit.log`):

| positive | `SETACT` exit, µs a lane | selected exit, µs a lane | the early exit buys |
|---|---|---|---|
| `mand` | 3.01 | 5.99 | 1.99x |
| `jong` | 3.97 | 6.22 | 1.57x |
| `stdmap` | 95.45 | 177.59 | 1.86x |

The choice was right. The projection behind it held for two of the three
and failed for the third: `docs/CFT-GAPS.md` put `jong` at 1.6 and `stdmap` at
1.81, and the card says 1.57 and 1.86, but it put `mand` at thirty, from the
slowest of 128 sampled lanes needing 4 of its 120 trips. On the card a block
is 128 lanes and runs until its slowest lane leaves; across 65,536 lanes
nearly every block holds a lane near the set's edge, so `mand` saves a factor
of two. What the early exit buys is bounded by the block, and a sample of one
block is a sample of one.

## A photograph on the card, sized

What the rates mean for the next step. A darkroom photograph at its
default exposure is about 3.4 billion shape evaluations. On one tile that
is a quarter of an hour for `psf` and forty minutes for `hopf`, a few hours
for `mand`, `jong` or `starfield`, a day for `throughput`, days for
`stdmap` and `nested`, and four months for `threebody`. A
first photograph on the card is therefore a question of choosing the plate
and the exposure rather than of waiting for hardware, and two pieces are
still missing whichever plate it is. The camera's own per-sample work -
the lens, the projection, the tint and the pixel address - is not lowered,
so it runs on the host from each deposit. And the per-sample comparison
against a GPU's records is not built, so the photograph would be the
card's photograph, held to the software backend's bits, until it is.

## Re-running it

On the card's host, with the layout `tools/silicon/cardday.sh` describes:

```bash
node tools/pack-cft-set.mjs --points 1001 --golden 16 --levers 7 --jobs 6
node tools/cft-streams.mjs --points 65536 --out build/cft/silicon positives/hopf.pos.mjs
python tools/probes/r8-scratch-strict.py --cft-root ../cft-fp256 --out build/cft/probes
python tools/probes/insn-cost.py --cft-root ../cft-fp256 --out build/cft/cost
bash tools/silicon/cardday.sh identity probes set-card cost set-sw
CFT_LIB=<patched libcft.so> bash tools/silicon/cardday.sh rate-card
CFT_LIB=<patched libcft.so> bash tools/silicon/long-runs.sh
RUNNER=runner/positive-run-fixed bash tools/silicon/bisect-heap.sh
```

`rate-card` and `long-runs.sh` need a libcft built with finding 2's fix:
the stock 56ad0cd library cannot run a program above 32,768 lanes without
corrupting the host heap. `long-runs.sh` also sets `CFT_TIMEOUT_MS` to its
twenty-minute cap. Both patches are
`docs/silicon/2026-09-17/backend_xrt-status-range-and-mask.diff`, and the
runner's is `positive-run-strict.diff` beside it.
