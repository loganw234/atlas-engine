# The positive as a sequencer program: hopf

Step 3 of cft-fp256's `docs/ATLAS.md` "Order of work": the emitter
target. A positive becomes a program for that project's orbit
sequencer, and the program is held to the bits the positive's emitted
GLSL computes - through libcft's own program executor and through the
golden model the tile's RTL is held to. Software only; no hardware, no
change to `core/emit.mjs`, no change to what a positive means.

Done 2026-09-08 for `hopf`. Every number below came out of a run, and
the command that produced it is named.

```bash
node tools/emit-cft.mjs positives/hopf.pos.mjs        # the image and its record
node tools/verify-cft-positive.mjs positives/hopf.pos.mjs --points 4096 --golden 256
node tools/emit-cft.mjs --all                         # the corpus, measured
```

`build/cft/<id>.cftp` is the image - header, constant bank, instruction
stream, exactly the bytes `cft_program_load` takes. `build/cft/<id>.cft.json`
is the record: inputs, the per-run tail, the deposit schema, every
constant with its name where it has one, every instruction with the
source construct it came from. `build/cft/<id>.cft.txt` is the same to
read. Everything under `build/` is a product of `tools/` and is
regenerated rather than committed.

## What is claimed, and against what

`core/emit.mjs` stays the one emitter and writes the one text: the
pinned shape function the GPUs compile. `core/emit-cft.mjs` lowers THAT
text - with the shipped det library, the unfused prelude and the shared
header beneath it - through `core/cft-lower.mjs`, the same lowering that
compiled the library (`docs/CFT-DETLIB.md`). Nothing re-reads the walk.
Two backends reading one text is the argument the library port made and
this makes again one level up: under the pinned discipline the emitted
GLSL is what a conforming driver computes, so a program that reproduces
its bits reproduces the cards' bits.

Three evaluations of the positive are compared, sample by sample,
deposit by deposit:

| | reads | computes with | is |
|---|---|---|---|
| the reference | the emitted text, untouched | `core/glsl-f32.mjs`, binary32, one rounding per operation, real branches | what the discipline says a driver computes |
| libcft | the image | `cft_program_load` / `cft_program_run`, the coprocessor project's own executor through its node build | the run that goes to a card unchanged |
| the golden model | the image | `python/cft_golden/seq.py`, pure Python, the definition the RTL is held to | the tile's specification |

They share the text and the image bytes and nothing else. The prelude
and the plate are unfused before they are read, because that is how the
bake ships them (bakeemitted.py unfuses every part of the compute
shader since 2026-08-24); today no emitted plate carries an `fma` and
the record counts them so that stays a measurement.

## The input block is three streams, and that is enough

The registry contract hands a shape function seven per-sample values:
`q.x`, `q.y`, `rnd.xyzw`, `seed`. The sequencer loads three. Measured
over the sixty-nine emitted plates: none reads `rnd.y`, `rnd.z` or
`rnd.w`, and `seed` and `rnd.x` appear in exactly two lines, the first
two of every shape function -

```glsl
uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                     ^ hashu(floatBitsToUint(q.y) * <salt>u));
pt = hashu(pt ^ floatBitsToUint(rnd.x));
```

- and nowhere else (`core/emit-cft.mjs`'s `prologueOf` asserts it per
plate rather than trusting the survey). Everything after them reads
`pt`, `q.x`, `q.y`, the levers and the clock.

So the program takes `q.x`, `q.y` and `pt` as its three streams, and
the two lines run on the host per sample - evaluated from the SAME
parsed statements by the same interpreter that scores the program, so
nobody retypes the seed. They are five integer hashes, one integer
multiply and two bit reinterpretations. Integer arithmetic has no
latitude, so the partition costs the parity claim nothing: the tile
computes what the card computes from `pt` onward, and `pt` is the same
bits by definition. It also retires ATLAS.md's third ask as stated -
"more inputs than three" - which counted the seven values rather than
the four a plate reads or the three it needs. The day a fourth input
arrives (the init block, cft-fp256's OPT-D-contract.md item 6) the two
lines move back into the program and nothing is rewritten.

Two things the darkroom's camera adds, recorded so they are not
rediscovered. Its `q` is `fract(u2f(ia * K) + uSeqOffset)` - a per-pass
shift - and its `uT` is `uT0 + uShutter * (u2f(h7) - 0.5)`, per sample
when the shutter is open. Both are functions of the sample index and
per-run uniforms, computable on the host exactly as the seed is; the
open shutter is the one case where the clock stops being a per-run
constant, and it is worth knowing before a fourth stream is designed.

## The per-run tail

`P[0..7]` and `uT` are constants to the program and data to the
darkroom: they change per lever setting, per frame, per pass. They
occupy the LAST nine slots of the bank in a fixed order - `P[0]` through
`P[7]`, then `uT` - whatever the plate reads, so the layout is the
emitter's and not one positive's. The image written today carries the
lever defaults and `uT = 0`; a bank-per-run (OPT-D item 5) replaces
those nine words and nothing else. A tail slot is never folded, because
its value is not known here, and a result that is one is copied into a
register before its deposit.

## The scheduler, and what a whole positive taught it

The library's functions fit sixteen registers under a kills-first list
schedule (`docs/CFT-DETLIB.md`, "The register discipline"). A whole
positive does not, and the reason is worth keeping. Measured on `hopf`,
595 ALU instructions, 2026-09-08:

| schedule | registers | why |
|---|---|---|
| kills-deep | 32 | six independent `det_sincos` chains are ready from the start; every chain's next step kills its own last temporary, so "kills first" interleaves all six and their intermediates pile up together |
| kills-shallow | 22 | the same, tie-broken the other way |
| kills-narrow | 46 | the same, worse |
| recent (newest operand first) | 20 | depth first on chains, but the three `det_div`s all read the freshly computed divisor and interleave |
| walk (the source order) | 17 | the emitter's order is a depth-first order already; it computes both spin rotations' sines and cosines before applying either, and holds eight geometry values across the second `det_sincos` |
| **su** (Sethi-Ullman, eager) | **16** | the first deposit's tree evaluated to the end applies the first rotation and frees four values before the second `det_sincos` begins |
| su + local moves | 16 | no further gain here |

Two findings fell out. A pure Sethi-Ullman depth-first order gave 32,
not 16: `det_sincos` computes its sine and its cosine from one shared
tree, and strict depth-first takes one output, leaves the seven values
the other still needs live, and descends into another subtree before it
comes back. The fix is EAGER COMPLETION: after every instruction, any
ready instruction that is the last reader of one of its operands is
issued at once - it frees a register and holds one, so it never raises
the peak, and it finishes a shared tree while its pieces are in hand.
And a local search - each instruction tried at the two ends of its legal
window, moves accepted when they lower the peak or, at equal peak, the
sum of live registers - fixed the one library function the list
schedule could not: `det_pow` went from 17 registers to 16 by local
moves alone, and to 14 under the depth-first order.

The scheduler now tries the three kills-first policies, two recency
policies, the source order and three depth-first orders (results in
source order, reversed, and by register need), keeps the lowest peak,
and improves it by local moves on programs under 3,000 instructions.
The library's peaks after this, all nineteen re-verified bit-identical
(`tools/verify-cft-detlib.mjs --points 4096 --isa-ext`, exit 0):

| function | was | is | | function | was | is |
|---|---|---|---|---|---|---|
| `det_exp2` | 7 | 6 | | `det_tan` | 9 | 8 |
| `det_sincos` | 9 | 8 | | `det_pow` | **17** | **14** |
| `det_sin` | 8 | 7 | | `det_cos` | 8 | 6 |

The other thirteen are unchanged. **Every det function now fits a
lane**, which retires the one register ask the library made; the
register question is the positives', below.

## The verification: hopf

`node tools/verify-cft-positive.mjs positives/hopf.pos.mjs --points 4096 --golden 256`, exit 0.

| | |
|---|---|
| words | 602 of 1,024 (595 ALU, 6 `DEPOSIT`, `HALT`) |
| registers | 16 of 16 |
| constants | 48 program + 9 per-run tail = 57; needs `kx` |
| `IMUL` | 2 instructions, in the draw's `hashu` |
| inputs | a = `q.x`, b = `q.y`, c = `pt` (prologue on the host, salt 3510238319u) |
| deposits | `return.x` `return.y` `return.z` `col.x` `col.y` `col.z` |
| image | 5,076 bytes |
| samples | 4,096: `ia = 0..2047` in order, then 2,048 spread over the index range by the header's hash; `q`, `rnd.x` and `seed` derived from `ia` exactly as the atlas header derives them |
| reference vs libcft | **0 mismatches in 6 × 4,096 deposits**, 0 NaN-payload-only; flags 17 (inexact, invalid raised on predicated paths - not part of the claim), status 0, every lane deposited 6 |
| golden model | 256 lanes, 0.68 s, 602 instructions executed: **0 deposits differ from libcft, 0 from the reference** |
| time | 386 ms interpreting the text; 285 ms for `cft_program_load` and `cft_program_run` |

And the accuracy of binary32 against the float64 walk from the same
stream state - a measurement, not a parity claim, and the ULP column
taken only where the reference is at least 2^-8 from zero, because near
zero a ULP count is a fact about zero:

| deposit | max abs difference | mean | max ULP | mean ULP | over |
|---|---|---|---|---|---|
| `return.x` | 2.1e-6 | 6.6e-8 | 152.5 | 4.66 | 4,046 of 4,096 |
| `return.y` | 2.8e-6 | 6.6e-8 | 362.9 | 4.51 | 4,041 |
| `return.z` | 2.4e-6 | 7.8e-8 | 1,195.1 | 8.22 | 4,054 |
| `col.x` | 2.9e-7 | 4.2e-8 | 85.8 | 2.58 | 3,940 |
| `col.y` | 5.4e-7 | 8.6e-8 | 112.1 | 4.62 | 3,931 |
| `col.z` | 6.2e-7 | 1.2e-7 | 188.1 | 8.90 | 3,942 |

The positions are the stereographic projection `r / max(1 - rw, 0.035)`,
and the large ULP counts sit where the divisor is small; the mean of
four to nine ULPs is the det library's own accuracy composed through a
dozen operations. This is the number Phase 1 of `docs/DETERMINISM.md`
wanted per plate and could not have: the f64 evaluation and the f32
one, from identical inputs, on the same samples.

## The corpus, measured

`node tools/emit-cft.mjs --all`, against sixteen registers, 1,024 words,
sixty-four deposits:

| positive | words | ALU | registers | constants | fits |
|---|---|---|---|---|---|
| `psf` | 183 | 176 | 10 | 25 | yes |
| `chladni` | 322 | 315 | 12 | 51 | yes |
| `harm` | 535 | 528 | 13 | 60 | yes |
| `hopf` | 602 | 595 | 16 | 48 | yes |
| `logz` | 648 | 641 | 15 | 65 | yes |
| `caustic` | 719 | 712 | 16 | 57 | yes |
| `modmul` | 711 | 704 | 17 | 53 | registers |
| `swallow` | 440 | 433 | 19 | 87 | registers |
| `curves` | 878 | 871 | 21 | 73 | registers |
| `nonorient` | 672 | 665 | 21 | 57 | registers |
| `conoscope` | 2,065 | 2,058 | 33 | 92 | registers, words |
| `halo` | 3,105 | 3,098 | 31 | 95 | registers, words |
| `rainbow` | 3,042 | 3,035 | 38 | 119 | registers, words |
| `tpms` | 3,253 | 3,246 | 40 | 58 | registers, words |
| `starfield` | 5,349 | 5,342 | 46 | 150 | registers, words |
| `throughput` | 12,484 | 12,477 | 212 | 307 | registers, words |

Sixteen of sixty-nine lower today; six fit the tile as it stands. The
fifty-three that do not lower are refused by name:

| refusal | positives |
|---|---|
| a `for` loop - `s.orbit`, `sum`, `s.descend`, `s.window` | 50 |
| integer `/` (`e8`) or `%` (`polytope`) - the ISA has no divider | 2 |
| an array local indexed at run time - `precise float wts[28]`, written and read under a loop counter (`nested`) | 1 |

What the numbers say for the asks on the coprocessor's side, stated
against the three made on 2026-09-08:

- **Registers are the binding constraint, not the image.** Of the
  sixteen that lower, ten exceed sixteen registers and six exceed the
  image. The peaks run 17 to 46 with the best schedule this pass finds,
  and `throughput` at 212 is a different kind of program. Thirty-two
  registers would take the corpus's lowered half from six fitting to
  ten; what it would not take is `conoscope`, `halo`, `rainbow`, `tpms`
  and `starfield`, which want an image four times the size as well.
  The init block as an escape hatch - a positive run as two programs,
  its live set carried through deposits and back in as planes - is
  what would reach those, and `starfield`'s 46 live values across two
  programs is a measured shape for it rather than a guess.
- **The image ask stands at 4,096.** Every lowered positive but
  `throughput` fits 4,096 words; five sit between 2,065 and 5,349
  today and will grow when their loops are lowered, since a loop body
  is emitted once under `REPEAT` rather than unrolled, which is the one
  place the sequencer's program is SMALLER than the GLSL.
- **The per-run bank changes nothing measured here and everything
  operational**: every image in the table carries its nine-word tail at
  the end, ready to be replaced.

## What was not done

- **Loops.** Fifty of sixty-nine positives carry a `for` the emitter
  wrote for `s.orbit`, `sum`, `s.descend` or `s.window`, with a literal
  bound and a data-dependent `break`. The lowering for them is `REPEAT
  <bound>` with the body's writes predicated on a running flag that a
  `break` clears, the loop-carried values pinned to one register each
  across the back edge, and `SETACT` on the flag for a top-level loop so
  the early exit is real rather than simulated. `jong` is the first
  customer, as `docs/ATLAS.md` says. Not built; refused by name.
- **Integer division and modulus.** Two positives. The exact sequence is
  a reciprocal through the library's own `det_recip`, a truncation and
  two correction steps, on the int32 range the walks use.
- **An array local indexed at run time.** `nested`'s digit descent
  weighs 28 cells into `precise float wts[28]` under one loop counter
  and reads them back under another. The ISA has no indexed access to
  a lane's registers, so this is not a parser addition: it is either
  the two loops unrolled so every index is a literal (28 registers it
  does not have), or the weights spilled through deposits and a second
  program, which is the init block again. One positive.
- **Deposit when ready.** Deposits sit at the end today, so every result
  holds a register from its computation to the last instruction. Issuing
  a `DEPOSIT` as soon as its value is final would free those registers
  early and reorder the deposit schema, which the record can carry. It
  did not decide `hopf`, whose peak is mid-program, and it will matter
  for plates whose results are computed early.
- **The GPU record capture** is step 5, and the runner on the
  coprocessor's side (`host/tools/positive-run.c`) is that project's;
  until it exists the golden model is the second oracle, as above.
- **`IMUL` through libcft on the wide-lane path.** `core/cft-run.mjs`
  still emulates opcode 30 when it scores a program instruction by
  instruction; the executor path does not, and `hopf`'s run went
  through the executor. The emulation is now a fallback for programs
  that do not fit, and can be retired when it is measured to agree.
