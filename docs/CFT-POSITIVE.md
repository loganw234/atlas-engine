# The positive as a sequencer program

Step 3 of cft-fp256's `docs/ATLAS.md` "Order of work": the emitter
target. A positive becomes a program for that project's orbit
sequencer, and the program is held to the bits the positive's emitted
GLSL computes - through libcft's own program executor, through the
golden model the tile's RTL is held to, through that project's
assembler byte for byte, and through the runner that goes to the card.
Software only; no change to `core/emit.mjs`, no change to what a
positive means.

Two sessions on 2026-09-08, and this file is the record of both. The
first landed `hopf` at revision 1 of the sequencer - sixteen registers,
a 1,024-word image, constants inside the image - and measured the
corpus against it. The same day the coprocessor moved to revision 2 -
thirty-two registers, 4,096 words, the constant bank as run data - and
the second session moved this target to it, lowered the loop the
emitter writes for `s.orbit`, `sum`, `s.descend` and `s.window`, and
found the one cast that had been wrong all along. Every number below
came out of a run, and the command that produced it is named.

```bash
node tools/emit-cft.mjs positives/hopf.pos.mjs        # the image, its bank, its .cfta, its record
node tools/verify-cft-positive.mjs positives/jong.pos.mjs --points 2048 --golden 64
node tools/verify-cft-positive.mjs positives/stdmap.pos.mjs --levers 7   # off the defaults
node tools/emit-cft.mjs --all                         # the corpus, measured
```

Under `build/cft/`: `<id>.cftp` is the image - header and instruction
stream, `BANK_EXT`, exactly the bytes `cft_program_load` takes;
`<id>.default.bank` the bank for the lever defaults and `uT = 0`;
`<id>.cfta` the same program in the coprocessor's assembly text;
`<id>.cft.json` the record and `<id>.cft.txt` the listing. Everything
under `build/` is a product of `tools/` and is regenerated rather than
committed.

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

Five evaluations of a positive are compared, sample by sample, deposit
by deposit, by `tools/verify-cft-positive.mjs`:

| | reads | computes with | is |
|---|---|---|---|
| the reference | the emitted text, untouched | `core/glsl-f32.mjs`, binary32, one rounding per operation, real branches and loops | what the discipline says a driver computes |
| libcft | the image and the bank | `cft_program_load`, `cft_program_run_bank`, `cft_program_digest`, through the coprocessor project's node build | the run that goes to a card unchanged |
| the golden model | the image and the bank | `python/cft_golden/seq.py`, pure Python, on a subset of the lanes | the tile's specification |
| the assembler | the `.cfta` text | `python/cft_golden/asm.py`, held byte for byte to `host/cft-asm` | a second encoder, from the same spec, in another repository |
| the runner | the image, the bank and the streams as files | `host/positive-run`, the same binary on the software backend, in emulation and on the card | the tool the darkroom would call |

They share the text and the image bytes and nothing else. The
assembler check is the one that makes the encoding a fact rather than a
reading: the emitter's words and asm.py's words must be the same bytes,
header included, and they are on every program below. The digest -
SHA-256 over image then bank - is computed here and by
`cft_program_digest`, and compared.

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
bits by definition. It also retired ATLAS.md's third ask as stated -
"more inputs than three" - which counted the seven values rather than
the four a plate reads or the three it needs; that project withdrew
the ask the same day.

Two things the darkroom's camera adds, recorded so they are not
rediscovered. Its `q` is `fract(u2f(ia * K) + uSeqOffset)` - a per-pass
shift - and its `uT` is `uT0 + uShutter * (u2f(h7) - 0.5)`, per sample
when the shutter is open. Both are functions of the sample index and
per-run uniforms, computable on the host exactly as the seed is; the
open shutter is the one case where the clock stops being a per-run
constant.

## The bank: the program's constants, then the per-run tail

`P[0..7]` and `uT` are constants to the program and data to the
darkroom: they change per lever setting, per frame, per pass. They
occupy the LAST nine slots of the bank in a fixed order - `P[0]` through
`P[7]`, then `uT` - whatever the plate reads, so the layout is the
emitter's and not one positive's. Revision 2 made the bank per-run data
(`BANK_EXT`, `BANK_PTR`, `cft_program_run_bank`), and every image this
target writes uses it: the image is the schedule, header and
instructions; the bank a run brings is the program's own constants in
first-use order followed by the nine words of the tail. One image per
positive, loaded once; the levers, the clock and the pass ride as data;
the digest names image and bank together. A tail slot is never folded,
because its value is not known here.

## The loop

Fifty of the sixty-nine positives carry a `for` the emitter writes for
`s.orbit`, `sum`, `s.descend` and `s.window`, and it writes one shape:

```glsl
for (int V = 0; V < N; V++) {
  if (V >= li_iters) break;          // the lever's bound, as an exit
  ...                                // the body, assigning outer names
}
```

with a literal bound, a step of one, and a data-dependent `break` -
the lever's bound, or an escape test - inside. `core/cft-lower.mjs`
lowers exactly that shape, as `REPEAT N` around the body written once:

- **Carried values.** Every name the body assigns that was bound before
  the loop gets a register of its own - a phi - copied in before the
  `REPEAT`, read inside, and copied back at the end of every iteration.
  The copies are `IOR` against zero, exact on every bit pattern. A
  vector carries one phi per component; the counter is carried like
  any other; a copy-back whose source is another phi goes through a
  temporary, so the order of the copies cannot decide the answer.
- **The exit.** A body with a `break` carries a running flag as well:
  1.0 going in, and-ed with not-the-break's-condition at the end of
  each iteration. Every write to a carried value is selected against
  the flag, and a `break` snapshots the carried values at its path
  condition exactly as a `return` snapshots the function's - the
  first exit in source order winning - so a lane that has left the
  loop holds its values while the tile runs the remaining trips on it.
  That is what makes the early exit invisible (docs/SEQUENCER.md P3)
  whether or not the hardware takes it; `SETACT` is not emitted yet,
  and would change the time and nothing else.
- **What stays where.** Nothing moves across a `REPEAT` or an
  `ENDREP`: the scheduler works per straight-line segment, and the
  copies into and out of a loop stay at the ends of their segments.
  A value defined before a loop and read inside it is live to the
  loop's `ENDREP` - the outermost loop around the read that does not
  contain the definition - so its register is not reused by a body
  temporary; a body temporary dies inside the body, which is what
  makes the body's registers reusable across trips. Common-
  subexpression elimination is scoped to the body: a body op may
  reuse an outer one, an op after the loop may not reuse a body one.
- **Refused by name:** a `return` inside a loop (none of the sixty-
  nine writes one), a loop nested deeper than four, an array assigned
  inside a loop.

`jong` was the first customer, as ATLAS.md said: 701 words, one
`REPEAT 24`, seven carried values, 23 registers, and every deposit
bit-identical through all five evaluations on the first run. It was
not the loop that failed next; it was a cast.

## The cast that was wrong all along

`det_fract` is written `float(int(x))`, and the six positives that
still disagreed with the text after the loop landed - `wave`,
`stdmap`, `bifurc`, `arnold`, `mand`, `primes` - all reach it, or an
`int(P[k] + 0.5)`, or an `int(u2f(pt) * n)`, inside a loop. Bisected
with one-construct loops (`sum` of a counter, a divide, a `det_pow`, a
`det_fract`, a break, a nested pair): only `det_fract` failed.

The `int()` expansion the det library port wrote - add 1.5·2^23,
subtract the magic's bits, two instructions - assumed its argument was
already an integer. In the library it always is: `int(k)` comes off
the shift trick or the exponent field. A plate's does not, and GLSL
5.4.1 says the cast truncates toward zero; the old form rounded to
nearest. On `det_fract` inside a loop that is every sample wrong. On
the corpus's integer levers it was subtler and worse: `int(P[k] +
0.5)` rounds to the right integer whenever the default happens to be
even, so `hopf`, `jong`, `ifs` and `collatz` passed at their defaults
and would have failed one notch over. The replacement is six
instructions - floor of the magnitude through the 2^23 trick under
roundTowardNegative, whose bit pattern is `0x4B000000 + floor(|x|)`,
then the sign put back on the integer - exact for every finite
`|x| < 2^23`. The library pays four instructions at each of its seven
`int()` sites and computes the same bits (`docs/CFT-DETLIB.md`, the
second addendum).

The lesson is in the verifier now: `--levers <seed>` draws a setting
on every lever's own grid, the way `tools/smoke-pos.mjs` draws its
hashed rows, and the sweep below runs every fitting positive at its
defaults and off them. A positive that is right at its defaults and
wrong one notch over is a positive whose integer levers were never
exercised.

## The scheduler, and what a whole positive taught it

The library's functions fit sixteen registers under a kills-first list
schedule. A whole positive did not, and the reason is worth keeping.
Measured on `hopf`, 595 ALU instructions, at revision 1:

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
window within its segment, moves accepted when they lower the peak or,
at equal peak, the sum of live registers - fixed the one library
function the list schedule could not: `det_pow` went from 17 registers
to 16 by local moves alone, and to 14 under the depth-first order.

The scheduler tries the three kills-first policies, two recency
policies, the source order and three depth-first orders (results in
source order, reversed, and by register need) per segment, keeps the
lowest peak over the whole program, and improves it by local moves on
programs under 3,000 instructions. On the loop programs the winner
varies - `su-need` on `jong`, `arnold` and `stdmap`, `kills-deep` on
`newton`, `collatz` and `bifurc` - which is the reason to try several
rather than argue for one.

## The corpus, measured

`node tools/emit-cft.mjs --all`, against revision 2 - thirty-two
registers, 4,096 words, sixty-four deposits:

| positive | words | loops | registers | constants | fits |
|---|---|---|---|---|---|
| `psf` | 185 | 0 | 10 | 25 | yes |
| `chladni` | 346 | 0 | 13 | 52 | yes |
| `swallow` | 452 | 0 | 20 | 87 | yes |
| `buddha` | 488 | 2 | 24 | 58 | yes |
| `bifurc` | 553 | 2 | 28 | 68 | yes |
| `harm` | 567 | 0 | 14 | 60 | yes |
| `gibbs` | 582 | 1 | 22 | 57 | yes |
| `collatz` | 614 | 2 | 30 | 60 | yes |
| `wave` | 624 | 1 | 22 | 76 | yes |
| `hopf` | 638 | 0 | 16 | 48 | yes |
| `logz` | 674 | 0 | 15 | 65 | yes |
| `orbital` | 681 | 2 | 29 | 66 | yes |
| `nonorient` | 700 | 0 | 21 | 57 | yes |
| `qjulia` | 735 | 1 | 22 | 87 | yes |
| `penrose` | 740 | 1 | 26 | 64 | yes |
| `caustic` | 747 | 0 | 16 | 57 | yes |
| `jong` | 749 | 1 | 24 | 65 | yes |
| `modmul` | 749 | 0 | 17 | 53 | yes |
| `kleinian` | 752 | 1 | 27 | 52 | yes |
| `zeta` | 759 | 1 | 25 | 75 | yes |
| `invjulia` | 761 | 1 | 19 | 62 | yes |
| `arnold` | 767 | 3 | 23 | 63 | yes |
| `wpath` | 813 | 1 | 29 | 79 | yes |
| `relativity` | 861 | 1 | 29 | 82 | yes |
| `ifs` | 902 | 1 | 25 | 58 | yes |
| `lyap` | 912 | 2 | 24 | 82 | yes |
| `stdmap` | 928 | 1 | 24 | 67 | yes |
| `curves` | 934 | 0 | 21 | 73 | yes |
| `rmt` | 966 | 1 | 26 | 73 | yes |
| `primes` | 991 | 2 | 27 | 60 | yes |
| `dipole` | 1,019 | 1 | 22 | 81 | yes |
| `cursum` | 1,038 | 1 | 30 | 73 | yes |
| `mand` | 1,127 | 1 | 18 | 81 | yes |
| `newton` | 1,169 | 3 | 32 | 65 | yes |
| `bulb` | 1,489 | 1 | 31 | 94 | yes |
| `hyper` | 2,200 | 2 | 31 | 81 | yes |
| `halo` | 3,145 | 0 | 31 | 95 | yes |
| `conoscope` | 2,093 | 0 | 33 | 92 | registers |
| `dissipation` | 1,244 | 1 | 36 | 82 | registers |
| `breakdown` | 2,621 | 2 | 37 | 116 | registers |
| `critical` | 1,018 | 2 | 37 | 86 | registers |
| `drainage` | 1,778 | 2 | 37 | 107 | registers |
| `nodal` | 2,746 | 3 | 37 | 101 | registers |
| `tangle` | 2,168 | 1 | 37 | 99 | registers |
| `rainbow` | 3,110 | 0 | 38 | 119 | registers |
| `tpms` | 3,385 | 0 | 40 | 58 | registers |
| `cascade` | 1,783 | 3 | 41 | 92 | registers |
| `allpaths` | 1,826 | 1 | 45 | 86 | registers |
| `stoch` | 2,020 | 5 | 45 | 89 | registers |
| `vortex` | 2,290 | 3 | 45 | 96 | registers |
| `starfield` | 5,413 | 0 | 46 | 150 | registers, words |
| `ford` | 3,559 | 2 | 47 | 95 | registers |
| `mirage` | 2,586 | 3 | 48 | 120 | registers |
| `wavecat` | 4,159 | 2 | 49 | 168 | registers, words |
| `flows` | 969 | 1 | 59 | 89 | registers |
| `billiards` | 2,845 | 1 | 64 | 111 | registers |
| `diffract` | 4,276 | 3 | 64 | 134 | registers, words |
| `rulespace` | 2,324 | 11 | 68 | 118 | registers |
| `universal` | 2,876 | 8 | 95 | 138 | registers |
| `threebody` | 1,873 | 1 | 104 | 79 | registers |
| `rule30` | 4,221 | 9 | 133 | 126 | registers, words |
| `vlsi` | 8,693 | 4 | 149 | 256 | registers, words |
| `throughput` | 12,618 | 0 | 212 | 307 | registers, words |

Sixty-three of sixty-nine lower; **37 fit the tile at revision 2**, 57 of the sixty-three needing REGS32; 26 exceed thirty-two registers and 6 exceed 4,096 words.

Six are refused by name:

| refusal | positives |
|---|---|
| integer `/` (`domain`, `e8`, `elliptic`) or `%` (`hilbert`, `polytope`) - the ISA has no divider; the exact sequence is a reciprocal through `det_recip`, a truncation and two corrections | 5 |
| an array local indexed at run time - `precise float wts[28]`, written and read under loop counters (`nested`) - the ISA has no indexed access to a lane's registers | 1 |

What the numbers say for the coprocessor's side:

- **Thirty-two registers took the corpus from six fitting to
  thirty-seven**, and the image from 1,024 to 4,096 words from six
  over to six over: the loop body is written once under `REPEAT`, so
  the programs that exceed the image are the straight-line giants
  (`throughput`, `starfield`, `vlsi`) and the deepest nests (`rule30`,
  `diffract`, `wavecat`).
- **Twenty-six positives still exceed thirty-two registers** as
  scheduled, from 33 to 212. They are the plates that hold several
  vectors and a stream across nested descents; the init block of
  docs/ATLAS.md - a positive run as two programs with its live set
  carried through deposits - is what would reach them, and their
  peaks are its measured shape.
- **The bank as run data changed nothing measured and everything
  operational**: every image carries no constants, and a run brings
  its bank.

## The corpus, verified

`node tools/verify-cft-positive.mjs positives/<id>.pos.mjs --points 512 --golden 16`, once at the lever defaults and once with `--levers 7`, over every positive that fits. A row is "yes" when all five evaluations agree on every deposit of every sample in both runs: the reference against libcft's `cft_program_run_bank`, `cft_program_digest` against SHA-256(image ++ bank), asm.py's bytes against the emitter's, `positive-run`'s deposits against libcft's, and the golden model's sixteen lanes against both.

| positive | words | registers | defaults | hashed levers | seconds |
|---|---|---|---|---|---|
| `arnold` | 767 | 23 | yes | yes | 31 |
| `bifurc` | 553 | 28 | yes | yes | 27 |
| `buddha` | 488 | 24 | yes | yes | 12 |
| `bulb` | 1489 | 31 | yes | yes | 10 |
| `caustic` | 747 | 16 | yes | yes | 2 |
| `chladni` | 346 | 13 | yes | yes | 2 |
| `collatz` | 614 | 30 | yes | yes | 15 |
| `cursum` | 1038 | 30 | yes | yes | 46 |
| `curves` | 934 | 21 | yes | yes | 3 |
| `dipole` | 1019 | 22 | yes | yes | 6 |
| `gibbs` | 582 | 22 | yes | yes | 11 |
| `halo` | 3145 | 31 | yes | yes | 5 |
| `harm` | 567 | 14 | yes | yes | 3 |
| `hopf` | 638 | 16 | yes | yes | 3 |
| `hyper` | 2200 | 31 | yes | yes | 12 |
| `ifs` | 902 | 25 | yes | yes | 7 |
| `invjulia` | 761 | 19 | yes | yes | 10 |
| `jong` | 749 | 24 | yes | yes | 7 |
| `kleinian` | 752 | 27 | yes | yes | 8 |
| `logz` | 674 | 15 | yes | yes | 2 |
| `lyap` | 912 | 24 | yes | yes | 41 |
| `mand` | 1127 | 18 | yes | yes | 5 |
| `modmul` | 749 | 17 | yes | yes | 3 |
| `newton` | 1169 | 32 | yes | yes | 24 |
| `nonorient` | 700 | 21 | yes | yes | 2 |
| `orbital` | 681 | 29 | yes | yes | 4 |
| `penrose` | 740 | 26 | yes | yes | 4 |
| `primes` | 991 | 27 | yes | yes | 14 |
| `psf` | 185 | 10 | yes | yes | 1 |
| `qjulia` | 735 | 22 | yes | yes | 3 |
| `relativity` | 861 | 29 | yes | yes | 64 |
| `rmt` | 966 | 26 | yes | yes | 7 |
| `stdmap` | 928 | 24 | yes | yes | 71 |
| `swallow` | 452 | 20 | yes | yes | 2 |
| `wave` | 624 | 22 | yes | yes | 4 |
| `wpath` | 813 | 29 | yes | yes | 4 |
| `zeta` | 759 | 25 | yes | yes | 9 |

**37 of 37 reproduce the emitted text's bits through every evaluation, at the defaults and off them.**

## The accuracy column

Beside the bit comparison the verifier prints the distance of binary32
from the float64 walk run from the same stream state - a measurement,
not a parity claim, and the ULP column taken only where the reference
is at least 2^-8 from zero, because near zero a ULP count is a fact
about zero. On `hopf` the mean is four to nine ULPs per deposit. On
`jong` and `stdmap` the maxima are in the millions of ULPs and the
means in the thousands: those are the de Jong attractor over fourteen
iterations and the standard map over four hundred, and that is what
chaos does to two precisions from one starting point. It is the number
Phase 1 of `docs/DETERMINISM.md` wanted per plate and could not have,
and it says the plate is chaotic, not that either implementation is
wrong.

## What was not done

- **Integer division and modulus**, five positives.
- **The run-time-indexed array**, one positive; either both of its
  loops unrolled so every index is a literal, or the weights spilled
  through deposits and a second program, which is the init block again.
- **Deposit when ready.** Deposits sit at the end, so every result
  holds a register from its computation to the last instruction.
  Issuing a `DEPOSIT` as soon as its value is final would free those
  registers and reorder the deposit schema, which the record can carry.
- **Copy coalescing and `SETACT`.** A carried value costs a copy in and
  a copy back per iteration; the op that computes the next value could
  write the phi's register directly. And a top-level loop could
  `SETACT` on the running flag so the tile takes the early exit it is
  entitled to. Both change the time and not the bits.
- **The GPU record capture** is step 5 of ATLAS.md, and remains.
