# The positive as a sequencer program

Step 3 of cft-fp256's `docs/ATLAS.md` "Order of work": the emitter
target. A positive becomes a program for that project's orbit
sequencer, and the program is held to the bits the positive's emitted
GLSL computes - through libcft's own program executor, through the
golden model the tile's RTL is held to, through that project's
assembler byte for byte, and through the runner that goes to the card.
Software only; no change to `core/emit.mjs`, no change to what a
positive means.

**Sixty-nine of sixty-nine positives lower, and all sixty-nine fit the
tile.** That is the state on 2026-09-11, after four sessions, and it
took three revisions of the coprocessor's sequencer to reach - each
one asked for with a measurement and built the same day.

The first session landed `hopf` at revision 1 - sixteen registers, a
1,024-word image, constants inside the image - and measured the corpus
against it: six fitted. The same day the coprocessor moved to revision
2 - thirty-two registers, 4,096 words, the constant bank as run data -
and the second session moved this target to it, lowered the loop the
emitter writes for `s.orbit`, `sum`, `s.descend` and `s.window`, and
found the one cast that had been wrong all along: thirty-seven fitted.
The third lowered integer division by a literal, which is what the
five plates that divide were waiting on, lowered a top-level `break`
as `SETACT`, and measured what stopped the rest - `docs/CFT-GAPS.md`
is that record and the three asks it produced. Revision 3 was built
that evening: a per-lane scratch memory, 16,384 words, a 512-entry
bank. **The fourth session, 2026-09-11, adopted it** - a spiller, an
array local that lives in the scratch, and division by a divisor known
only at run time - and the last positive fell.

Every number below came out of a run, and the command that produced
it is named.

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
constant. Since 2026-09-18 the camera itself is lowered, and both run on
the tile with the rest of it (`docs/CFT-PHOTOGRAPH.md`).

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

Since 2026-09-18 the values a run's levers and clock decide alone sit
between the two - the hoisted per-run values of "Priced in what a lane
executes" below - so a bank is the program's constants, then the hoisted
values libcft computes for that run's tail, then the tail. The tail is
still the last nine words and `tailBase` still names `P[0]`.

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
- **The exit, two ways.** At the top level a `break` is `SETACT`
  (since the third session; the second lowered every break the other
  way). Where the break is, every carried value whose value on the
  breaking path differs from its register is written to that register
  by a `SELECT` on the break's path condition, the register itself as
  the other arm - pinned to the end of the segment the `SETACT` closes,
  so every read of a carried register in that segment precedes it -
  and then `SETACT` on the negation of that condition. The select is
  load-bearing, and the sweep is what said so: the first form was a
  bare copy, on the argument that a body reads a reassigned value and
  never the register, and `bulb` came back wrong on 435 of 512 samples
  while libcft, the golden model and the runner agreed with each other.
  Its `esc = true; break;` sits inside the break's own `if`, so the
  reassignment is the breaking path's alone; the lanes that stayed had
  their register overwritten and read it later as the value they never
  changed. From there the hardware's mask
  holds the lane's registers and skips its deposits; the loop's
  copy-backs are masked for it; the `REPEAT` ends early once every
  lane has left; and `ACTALL` after the `ENDREP`, legal only at the
  top level, brings them back. A loop inside an `if` gets a `SETACT`
  on the `if`'s condition before its `REPEAT`, so the lanes not on
  its path sit it out. Nothing in the body is selected for a leaving
  lane's sake. Inside another loop a `break` keeps the second form: a
  running flag, 1.0 going in, and-ed with not-the-break's-condition at
  the end of each iteration, every write to a carried value selected
  against it, the break snapshotting the carried values at its path
  condition exactly as a `return` snapshots the function's - because
  `SETACT` there would leave the lane dark for the rest of the OUTER
  body, and `ACTALL` is illegal inside a loop. Both forms leave the
  early exit invisible (docs/SEQUENCER.md P3); the first lets the tile
  take it. `docs/CFT-GAPS.md` measures what that is worth: a median
  of twice fewer trips at the defaults over the corpus, ten times
  fewer on sixteen positives, with `universal`'s 1,048,576-trip loop
  needing 16,321 the extreme. `jong` under the first form: 737 words
  and 22 registers where the flag had cost 749 and 24; the golden model
  executed 3,859 instructions for eight lanes where the flag form ran
  every trip.
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

## Integer division, by a literal

GLSL 5.9 truncates integer division toward zero and defines `%` for
non-negative operands as the remainder of that division; the ISA has
no divider, integer or float. Five plates divide, every one by a
literal - `/ 2`, `/ 4`, `/ 8`, `/ 16`, `/ 32` and `% 2` in `e8`, `/ 5`
and `% 5` in `domain`, `/ 2` in `elliptic`, `% 4` in `polytope`, `%`
in `hilbert` - so the divisor's reciprocal is a constant, and
`core/cft-lower.mjs` lowers `a / d` as: the magnitude of `a` to float
exactly (`i2f`, or `u2f` for a uint), one multiply by `float(1/|d|)`,
the `2^23` trick under roundTowardNegative to truncate, then the
remainder `|a| - q*|d|` says which way the estimate missed - negative
is one too many, at least `|d|` is one too few - and one select each
puts it right; the signs of `a` and `d` come back on the quotient.
Twenty instructions, seven when `|d|` is a power of two (a shift on
the magnitude), two when it is one. `a % d` is `a - (a / d) * d`
over the same sequence, twenty-two, or a mask on the magnitude and the
sign for a power of two. Exact for `|a| < 2^22` (the `i2f` domain) at
any literal `d != 0`, and for a uint `a < (2^23 - 1) * d`: on that
domain the float estimate is within a quarter of the true quotient,
so one correction is always enough. `EXPANSIONS.idiv` and `.imod`
carry the derivation; the record's `gaps` count the sites.

Verified 2026-09-08 by `tools/verify-cft-positive.mjs`, 512 samples,
16 golden lanes, at the defaults and under `--levers 7`: `polytope`
(846 words, 27 registers) bit-identical through libcft, the golden
model, the assembler's bytes and the runner; `domain` (38 registers),
`e8` (45), `elliptic` (58) and `hilbert` (40) bit-identical on the
widened lane, since they do not load as they stand. A divisor that is
not a literal stays refused by name - `nested`'s `% wd_15_p` is one,
a per-run integer from a lever, which the hoisting `docs/CFT-GAPS.md`
measures would make a constant too.

A divisor known only at run time - `nested`'s `% p`, where `p` is an
integer lever - has no constant reciprocal, so the estimate comes from
`det_div` instead: the shipped library's own division, refined from a
bit-trick seed with exact arithmetic and already held bit for bit to
what the GPUs compute (`docs/CFT-DETLIB.md`). The correction is the
same one, unchanged. Exact on the same domain and for the same
reason - `det_div` is within an ulp of the true quotient, and an ulp
of a quotient below 2^22 is below one, so the truncation is off by at
most one either way. It is the only place this target calls a library
function that the plate did not write.

## The scratch, and the two things that live in it

Revision 3 gave a lane 256 scratch slots and four control codes -
`STL` and `LDL` by static slot, `STX` and `LDX` by the low bits of a
register - in answer to `docs/CFT-GAPS.md`'s first ask. A store is a
register write for P3's purposes, masked by the lane's active bit; a
load writes `rd` and is masked the same way; neither is arithmetic.
Two things live there.

**Spilled values.** The allocator's pool is unbounded on purpose, so a
program that wants more registers than a lane has is a number rather
than an exception. When that number exceeds thirty-two, the values
that hold a register longest for the fewest reads move into the
scratch, and the program is re-profiled and re-allocated; the target
drops by two each round, because the reloads want registers of their
own. A spilled value is computed into a register and stored at once,
and every later read loads it into a register of its own. A
loop-carried value spills more naturally than an ordinary one: its
copy-in becomes a store, its copy-back a store, each read inside the
body a load, and the slot persists across iterations exactly as the
pinned register did - including for a lane that has left the loop,
whose stores are masked just as its register writes were.

**An array local.** `nested`'s `precise float wts[28]`, written and
read under loop counters, is the one construct in the corpus whose
address is not known until the run, and the indexed form is what it is
for. The array takes slots from the bottom of the scratch before
anything is spilled, so its base is a constant of the program and the
index register carries only the subscript - which is an `int`, held as
its own bit pattern, which is exactly what the instruction reads. The
subscript is clamped into the array, the way a driver's robust-access
mode clamps it, because out of range the instruction would wrap: the
contract reduces an index modulo the depth, and a program whose answer
depends on the tile's scratch depth is not something this repository
ships. `SCRATCH_STRICT` - revision 4's R8, which reports such an index
instead of reducing it - is the durable answer, and since 2026-09-17
every image that touches the scratch sets it (`core/emit-cft.mjs`); on
2026-09-10 it existed in the golden model alone and `cft_program_load`
refused a header that carried it. The clamp stays, so an index this
file emits is in range whatever the flag says.

A store under a condition reads the element back and selects, because
the instruction's own mask is the lane's active bit and says nothing
about the path that reached the statement. That is the shape every
other conditional assignment here has.

Two rules the round had to get right, both of them rules the
instruction set already stated about some other instruction:

- **A store reads a register, never the bank** - the same rule
  `DEPOSIT` has. A carried value whose initial value is a constant
  stored from the *register whose number is that constant's bank
  index*: measured on `dissipation`, whose two carried values
  initialised to zero both stored from `r9` because the zero constant
  sat at bank slot 9. Every deposit of every sample wrong, with libcft,
  the golden model and this repository's own executor all agreeing
  about it - which is what said the fault was in the lowering and not
  in the encoding.
- **A scratch access orders a segment.** Two accesses to the same slot
  are ordered by the slot and not by any operand the scheduler can
  see, so nothing may be reordered across one. Segments are how this
  file already says that, and scratch uses them.

## The vector constructor that was not converting

`nested` is the only positive that builds integer vectors, and it was
the only one that could have found this: a constructor was RELABELLING
its components rather than converting them. GLSL 5.4.2 says a
constructor's arguments are converted as by the scalar constructor of
the element type, so `ivec2(vec2(...) * s)` truncates each component
and `vec2(ivec2)` converts each to float. Both the lowering and the
binary32 reference took the components as they were and changed the
type label, which computes a different number the moment the two
differ - and `nested` divides by, scales and re-rounds a window
rectangle, so they differ everywhere.

Worth stating plainly: **this was a fault in the reference too**, not
only in the program, so it is a correction to what this repository
says a conforming driver computes rather than a port bug. It was
invisible for as long as it was because every other positive builds
its vectors out of floats, where relabelling and converting are the
same thing.

## And one the assembler caught on its own

`throughput` addresses 316 constants, the only positive past 256, so
it is the only one whose operands carry revision 3's ninth index bit.
The `.cfta` text form was writing the byte and dropping the bit, so a
program addressing constant 300 was written `k44` and assembled as
`k44` - a valid program computing something else. Every other
evaluation agreed with the emitter, because every other evaluation
reads the emitter's own image: the reference matched, libcft matched,
the golden model matched, the runner matched, and the digest matched
itself. The one check that could see it is the one that hands the text
to the coprocessor's assembler and compares the bytes, which is the
whole reason for holding two encoders to each other rather than
trusting one of them twice.

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

## Priced in what a lane executes

2026-09-18. The card day measured what an instruction costs on silicon
(`docs/CFT-SILICON.md`): an arithmetic instruction about a nanosecond a
lane, and every control-coded one - a scratch store or load, `SETACT` -
about four. Until then the lowering counted words, and a store cost the
same as an addition. Four changes follow from the measurement, each
scored by `tools/cft-cost-model.mjs`: every instruction weighted by the
trips of the loops around it (the slowest of 128 sampled lanes, from
`build/cft/gaps.json`) and priced one unit for arithmetic, four for the
rest. The model is a ranking device and the calibration it prints says
how good a one: against today's images on the card it is 1.0 to 1.2
nanoseconds a unit on seven of the ten timed positives, and 1.8 on `psf`,
2.8 on `mand` and 0.5 on `nested` - `mand`'s trips are the ones the
128-lane sample was already known to misrepresent (`docs/CFT-SILICON.md`,
the early exit).

**The spill is chosen by what it costs a lane.** A candidate's price is
its store and its reloads, each weighted by its loop's trips; its worth is
how much of the over-pressure it covers. The old choice counted the
benefit once, from the first profile, and on the loop programs it spilled
nearly every carried value in the first round. The benefit is now
recounted after every pick (a Fenwick tree over the positions still over
the target), an instruction reads a spilled value once however many of
its operands name it, and a slot's consecutive reloads share one register
where the profile allows. Together: 8.9% less executed cost over the
corpus, and every positive that spills fits thirty-two registers.

**A carried value's copy-back goes into the instruction that computes it**
where nothing reads the old value after that instruction and nothing else
writes the register between: the instruction writes the carried register
directly (`coalesceCopyBacks`). 336 copies across 52 positives, 0.4% of
executed cost - small, because the spiller had already put most of the
heaviest carried values in the scratch.

**Per-run values leave the lane** (`hoistPerRun`). An instruction that
reads only the program's constants, the levers, the clock and other such
instructions computes the same bits on every lane of a run and on every
trip of any loop around it - the sine of a lever times the clock, an
integer lever's cast - so libcft computes it once per run instead, and the
value arrives in the bank. Only the frontier takes a slot, a per-run value
some per-lane instruction reads; the rest is the init program, a straight
list of the same opcodes with the same rounding attributes over constants
and the tail, which `Machine.hoisted` (`core/cft-run.mjs`) runs through
libcft's element operations on one lane. By the sequencer's own P1 - it
adds no arithmetic of its own - those are the bits the lane would have
computed. The hoisted slots sit between the program's constants and the
nine-slot tail, so the tail is still the bank's last nine words and
`tailBase` still names `P[0]`. A deposit, the value `SETACT` tests and a
scratch access's operands need registers and stay on the tile, with their
per-run inputs hoisted all the same. Over the corpus 20,854 instructions
leave the lanes for 1,338 bank slots, and the step took 18.5% of the
corpus's words on its own; the bank goes to 428 of 512 on `throughput`,
the deepest.

**A spilling program's schedule is chosen by what it executes.** Hoisting
exposed it: on `threebody` two schedules with the same register peak came
out of the spiller at 4.89 and 3.86 million executed units a block, and the
tie had gone to the dearer one for being tried first. The four schedules
nearest the lowest peak now each go through the whole register wall -
spill, shared reloads, coalescing - and the one whose lane executes least
is kept. The wall steps its target down when the allocator needs a
register or two past the profile's peak, which `cascade` did after
hoisting (32 profiled, 34 allocated).

What the four bought, on the card: the card-day images and today's, on the
same cases with the same streams and the same expected deposits, back to
back on the single tile (`docs/CFT-SILICON.md`, "The lowering, priced, on
the card"). The model column is today's modelled cost a lane over the card
day's.

| positive | words | registers | scratch slots | hoisted slots | model, a lane | card, µs a lane | card speed-up | both images' deposits |
|---|---|---|---|---|---|---|---|---|
| `psf` | 185 → 118 | 10 → 6 | - → - | 5 | 0.62x | 0.268 → 0.200 | **1.34x** | match (65,536 lanes) |
| `hopf` | 638 → 526 | 16 → 14 | - → - | 6 | 0.82x | 0.721 → 0.608 | **1.19x** | match (65,536 lanes) |
| `mand` | 1,111 → 832 | 17 → 17 | - → - | 15 | 0.76x | 3.003 → 2.592 | **1.16x** | match (65,536 lanes) |
| `jong` | 737 → 508 | 22 → 17 | - → - | 5 | 0.93x | 3.968 → 3.697 | **1.07x** | match (65,536 lanes) |
| `starfield` | 5,475 → 4,483 | 32 → 32 | 17 → 10 | 50 | 0.81x | 5.857 → 4.724 | **1.24x** | match (65,536 lanes) |
| `throughput` | 14,801 → 11,356 | 32 → 32 | 186 → 201 | 145 | 0.67x | 24.98 → 15.42 | **1.62x** | match (65,536 lanes) |
| `stdmap` | 912 → 733 | 23 → 20 | - → - | 12 | 0.85x | 95.45 → 81.35 | **1.17x** | match (65,536 lanes) |
| `nested` | 1,401 → 1,055 | 32 → 32 | 46 → 38 | 23 | 0.89x | 171.4 → 147.2 | **1.16x** | match (65,536 lanes) |
| `threebody` | 2,029 → 1,754 | 31 → 31 | 70 → 70 | 23 | 0.83x | 3286.3 → 2617.0 | **1.26x** | match (65,536 lanes) |
| `rule30` | 4,720 → 3,671 | 32 → 32 | 105 → 100 | 92 | 0.58x | 9437.5 → 5103.2 | **1.85x** | match (4,096 lanes) |

Over the 69 positives: 132,977 words to 105,700 (-20.5%), modelled cost -21.0%, executed scratch traffic 3.97e+6 to 2.76e+6 a block; 69 cheaper, 0 dearer, 0 unchanged.

## The corpus, measured

`node tools/emit-cft.mjs --all`, against revision 2 - thirty-two
registers, 4,096 words, sixty-four deposits:

| positive | words | loops | registers | scratch | constants | fits |
|---|---|---|---|---|---|---|
| `psf` | 185 | 0 | 10 | - | 25 | yes |
| `chladni` | 346 | 0 | 13 | - | 52 | yes |
| `buddha` | 450 | 2 | 20 | - | 58 | yes |
| `swallow` | 452 | 0 | 20 | - | 87 | yes |
| `bifurc` | 532 | 2 | 24 | - | 68 | yes |
| `harm` | 567 | 0 | 14 | - | 60 | yes |
| `gibbs` | 571 | 1 | 21 | - | 57 | yes |
| `collatz` | 574 | 2 | 27 | - | 60 | yes |
| `wave` | 618 | 1 | 21 | - | 76 | yes |
| `hopf` | 638 | 0 | 16 | - | 48 | yes |
| `orbital` | 656 | 2 | 28 | - | 66 | yes |
| `logz` | 674 | 0 | 15 | - | 65 | yes |
| `nonorient` | 700 | 0 | 21 | - | 57 | yes |
| `qjulia` | 713 | 1 | 18 | - | 87 | yes |
| `penrose` | 722 | 1 | 25 | - | 64 | yes |
| `jong` | 737 | 1 | 22 | - | 65 | yes |
| `kleinian` | 737 | 1 | 26 | - | 52 | yes |
| `arnold` | 746 | 3 | 22 | - | 63 | yes |
| `zeta` | 746 | 1 | 24 | - | 75 | yes |
| `caustic` | 747 | 0 | 16 | - | 57 | yes |
| `invjulia` | 747 | 1 | 18 | - | 62 | yes |
| `modmul` | 749 | 0 | 17 | - | 53 | yes |
| `wpath` | 794 | 1 | 29 | - | 79 | yes |
| `relativity` | 836 | 1 | 26 | - | 82 | yes |
| `polytope` | 846 | 0 | 27 | - | 54 | yes |
| `ifs` | 885 | 1 | 24 | - | 58 | yes |
| `lyap` | 900 | 2 | 23 | - | 82 | yes |
| `stdmap` | 912 | 1 | 23 | - | 67 | yes |
| `curves` | 934 | 0 | 21 | - | 73 | yes |
| `rmt` | 953 | 1 | 25 | - | 73 | yes |
| `primes` | 969 | 2 | 26 | - | 60 | yes |
| `flows` | 998 | 1 | 32 | 24 | 89 | yes |
| `dipole` | 1,009 | 1 | 21 | - | 81 | yes |
| `cursum` | 1,016 | 1 | 27 | - | 73 | yes |
| `critical` | 1,022 | 2 | 32 | 3 | 86 | yes |
| `mand` | 1,111 | 1 | 17 | - | 81 | yes |
| `newton` | 1,112 | 3 | 29 | - | 65 | yes |
| `dissipation` | 1,216 | 1 | 32 | 3 | 82 | yes |
| `nested` | 1,401 | 6 | 32 | 46 | 101 | yes |
| `bulb` | 1,470 | 1 | 29 | - | 94 | yes |
| `drainage` | 1,748 | 2 | 32 | 4 | 107 | yes |
| `cascade` | 1,774 | 3 | 32 | 6 | 92 | yes |
| `elliptic` | 1,847 | 6 | 32 | 25 | 85 | yes |
| `allpaths` | 1,855 | 1 | 32 | 11 | 86 | yes |
| `stoch` | 1,917 | 5 | 31 | 9 | 89 | yes |
| `e8` | 2,024 | 3 | 32 | 13 | 152 | yes |
| `threebody` | 2,029 | 1 | 31 | 70 | 79 | yes |
| `conoscope` | 2,096 | 0 | 32 | 1 | 92 | yes |
| `hyper` | 2,168 | 2 | 30 | - | 81 | yes |
| `tangle` | 2,168 | 1 | 32 | 4 | 99 | yes |
| `vortex` | 2,323 | 3 | 32 | 12 | 96 | yes |
| `rulespace` | 2,363 | 11 | 32 | 34 | 118 | yes |
| `breakdown` | 2,574 | 2 | 32 | 4 | 116 | yes |
| `mirage` | 2,586 | 3 | 32 | 15 | 120 | yes |
| `domain` | 2,616 | 1 | 32 | 6 | 105 | yes |
| `nodal` | 2,724 | 3 | 32 | 2 | 101 | yes |
| `billiards` | 2,921 | 1 | 32 | 29 | 111 | yes |
| `universal` | 3,123 | 8 | 32 | 64 | 138 | yes |
| `rainbow` | 3,138 | 0 | 32 | 7 | 119 | yes |
| `halo` | 3,145 | 0 | 31 | - | 95 | yes |
| `tpms` | 3,476 | 0 | 32 | 8 | 58 | yes |
| `hilbert` | 3,548 | 10 | 32 | 8 | 80 | yes |
| `ford` | 3,569 | 2 | 31 | 13 | 95 | yes |
| `wavecat` | 4,203 | 2 | 32 | 17 | 168 | yes |
| `diffract` | 4,379 | 3 | 32 | 30 | 134 | yes |
| `rule30` | 4,720 | 9 | 32 | 105 | 126 | yes |
| `starfield` | 5,475 | 0 | 32 | 17 | 150 | yes |
| `vlsi` | 9,676 | 4 | 32 | 122 | 256 | yes |
| `throughput` | 14,801 | 0 | 32 | 186 | 307 | yes |

Sixty-nine of sixty-nine lower and **all sixty-nine fit the tile at revision 3**; 63 need REGS32, 31 need the scratch (the deepest 186 slots of the 256 a lane has), 6 exceed what revision 2's image held and 1 what its bank addressed.

**Nothing is refused.** The corpus reached that in three steps, each
of them a thing the tile gained or a thing this side learned to
lower: integer division by a literal (five plates), the same division
by a divisor known only at run time (one), and the array local in the
per-lane scratch (one).

What the numbers say for the coprocessor's side:

- **Each revision moved the count, and the measurement asked for the
  next one.** Sixteen registers and a 1,024-word image fitted six
  positives. Thirty-two registers and 4,096 words fitted thirty-seven,
  and the division expansion thirty-eight. Revision 3 - the scratch,
  16,384 words, a 512-entry bank - fits **all sixty-nine**, and the
  binding constraint at every stage was registers: of the thirty that
  exceeded thirty-two, every one that also exceeded the image or the
  bank was already over on registers, so the two capacities would have
  changed no count on their own. The scratch is what did it.
- **What spilling costs.** The programs grew where they had to and
  nowhere else: the corpus's straight-line giant `throughput` went
  from 12,618 words at 212 registers to 14,801 at 32, and `threebody`
  from 1,776 at 101 to 2,029 at 31, while the thirty-eight that
  already fitted are untouched. Thirty-one positives reach the scratch
  at all, and the deepest reaches 186 slots of the 256 a lane has -
  `throughput` again, with 259 values spilled and nothing carried,
  since it has no loop to carry anything. **256 was the right number
  to ask for**: the sizing table in `docs/CFT-GAPS.md` said 128 would
  leave `throughput` out and 256 would close the corpus, and it does,
  with the margin a slot-reuse pass would widen and nothing to spare
  at 128.
- **The bank as run data changed nothing measured and everything
  operational**: every image carries no constants, and a run brings
  its bank.

## The corpus, verified

`node tools/verify-cft-positive.mjs positives/<id>.pos.mjs --points 512 --golden 16`, once at the lever defaults and once with `--levers 7`, over every positive that fits. A row is "yes" when all five evaluations agree on every deposit of every sample in both runs: the reference against libcft's `cft_program_run_bank`, `cft_program_digest` against SHA-256(image ++ bank), asm.py's bytes against the emitter's, `positive-run`'s deposits against libcft's, and the golden model's sixteen lanes against both.

| positive | words | registers | defaults | hashed levers | seconds |
|---|---|---|---|---|---|
| `allpaths` | 1855 | 32 | yes | yes | 19 |
| `arnold` | 746 | 22 | yes | yes | 18 |
| `bifurc` | 532 | 24 | yes | yes | 17 |
| `billiards` | 2921 | 32 | yes | yes | 23 |
| `breakdown` | 2574 | 32 | yes | yes | 13 |
| `buddha` | 450 | 20 | yes | yes | 3 |
| `bulb` | 1470 | 29 | yes | yes | 7 |
| `cascade` | 1774 | 32 | yes | yes | 30 |
| `caustic` | 747 | 16 | yes | yes | 3 |
| `chladni` | 346 | 13 | yes | yes | 2 |
| `collatz` | 574 | 27 | yes | yes | 9 |
| `conoscope` | 2096 | 32 | yes | yes | 7 |
| `critical` | 1022 | 32 | yes | yes | 8 |
| `cursum` | 1016 | 27 | yes | yes | 14 |
| `curves` | 934 | 21 | yes | yes | 4 |
| `diffract` | 4379 | 32 | yes | yes | 10 |
| `dipole` | 1009 | 21 | yes | yes | 7 |
| `dissipation` | 1216 | 32 | yes | yes | 10 |
| `domain` | 2616 | 32 | yes | yes | 17 |
| `drainage` | 1748 | 32 | yes | yes | 14 |
| `e8` | 2024 | 32 | yes | yes | 13 |
| `elliptic` | 1847 | 32 | yes | yes | 13 |
| `flows` | 998 | 32 | yes | yes | 306 |
| `ford` | 3569 | 31 | yes | yes | 5 |
| `gibbs` | 571 | 21 | yes | yes | 4 |
| `halo` | 3145 | 31 | yes | yes | 4 |
| `harm` | 567 | 14 | yes | yes | 2 |
| `hilbert` | 3548 | 32 | yes | yes | 14 |
| `hopf` | 638 | 16 | yes | yes | 2 |
| `hyper` | 2168 | 30 | yes | yes | 8 |
| `ifs` | 885 | 24 | yes | yes | 4 |
| `invjulia` | 747 | 18 | yes | yes | 6 |
| `jong` | 737 | 22 | yes | yes | 5 |
| `kleinian` | 737 | 26 | yes | yes | 4 |
| `logz` | 674 | 15 | yes | yes | 2 |
| `lyap` | 900 | 23 | yes | yes | 33 |
| `mand` | 1111 | 17 | yes | yes | 4 |
| `mirage` | 2586 | 32 | yes | yes | 19 |
| `modmul` | 749 | 17 | yes | yes | 3 |
| `nested` | 1401 | 32 | yes | yes | 17 |
| `newton` | 1112 | 29 | yes | yes | 10 |
| `nodal` | 2724 | 32 | yes | yes | 41 |
| `nonorient` | 700 | 21 | yes | yes | 2 |
| `orbital` | 656 | 28 | yes | yes | 3 |
| `penrose` | 722 | 25 | yes | yes | 3 |
| `polytope` | 846 | 27 | yes | yes | 3 |
| `primes` | 969 | 26 | yes | yes | 4 |
| `psf` | 185 | 10 | yes | yes | 1 |
| `qjulia` | 713 | 18 | yes | yes | 3 |
| `rainbow` | 3138 | 32 | yes | yes | 5 |
| `relativity` | 836 | 26 | yes | yes | 18 |
| `rmt` | 953 | 25 | yes | yes | 4 |
| `rule30` | 4720 | 32 | yes | yes | 524 |
| `rulespace` | 2363 | 32 | yes | yes | 750 |
| `starfield` | 5475 | 32 | yes | yes | 7 |
| `stdmap` | 912 | 23 | yes | yes | 67 |
| `stoch` | 1917 | 31 | yes | yes | 19 |
| `swallow` | 452 | 20 | yes | yes | 2 |
| `tangle` | 2168 | 32 | yes | yes | 10 |
| `threebody` | 2029 | 31 | yes | yes | 848 |
| `throughput` | 14801 | 32 | yes | yes | 21 |
| `tpms` | 3476 | 32 | yes | yes | 5 |
| `universal` | 3123 | 32 | yes | yes | 280 |
| `vlsi` | 9676 | 32 | yes | yes | 15 |
| `vortex` | 2323 | 32 | yes | yes | 13 |
| `wave` | 618 | 21 | yes | yes | 4 |
| `wavecat` | 4203 | 32 | yes | yes | 14 |
| `wpath` | 794 | 29 | yes | yes | 4 |
| `zeta` | 746 | 24 | yes | yes | 6 |

**69 of 69 reproduce the emitted text's bits through every evaluation, at the defaults and off them.**

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

Nothing in the corpus is refused any more, so what is left is speed and
size rather than reach.

- Hoisting, copy coalescing and spilling by what a lane executes were
  here until 2026-09-18, and are "Priced in what a lane executes" above.
- **Deposit when ready.** Deposits sit at the end, so every result
  holds a register from its computation to the last instruction.
  Issuing a `DEPOSIT` as soon as its value is final would free those
  registers and reorder the deposit schema, which the record can carry.
- **Rematerialisation.** A spilled value that is cheaper to recompute
  than to reload - four arithmetic instructions buy one load on the
  card - is still stored and reloaded.
- **More coalescing.** Most of the 1,958 copies are copy-ins, break
  snapshots and values in the scratch, and some copy-backs are kept
  only because the schedule put a read of the old value after the
  instruction that computes the new one; a schedule that knew would
  take them.
- **`CALL`**, measured at 41,435 words of inlined copies across the
  corpus and asked for by nobody, because at 16,384 words it decides
  no fit.
- The GPU record capture was step 5 of ATLAS.md; it is built, for the
  darkroom's own camera, in `docs/CFT-PHOTOGRAPH.md`.
