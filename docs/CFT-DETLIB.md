# The det library as sequencer programs

Step 1 of cft-fp256's `docs/ATLAS.md` "Order of work": the det library
gets a second edition, compiled for that project's orbit sequencer
instead of for a driver, and verified function by function against the
bits the GPUs already agree on. Software only. No hardware, no change
to the GLSL templates, no change to the pinned set, no change in
cft-fp256.

Done 2026-09-07. Every number below came out of a run, and the command
that produced it is named.

```bash
node tools/gen-detlib.mjs --target cft --isa-ext     # write the images
CFT_ROOT=../cft-fp256 \
  node tools/verify-cft-detlib.mjs --points 4096 --isa-ext
```

`core/detlib.cft.json` is the record: per function, the instructions in
`docs/SEQUENCER.md`'s encoding, the constant bank with exact bit
patterns, the register map and the deposit schema. `build/detlib.cft.txt`
is the same thing to read, and lives under `build/` because everything
there is a product of `tools/` and is regenerated rather than committed.

## What is being claimed, and against what

The det library **ships unfused**. `tools/gen-detlib.mjs` rewrites all
**56** `fma()` calls in `core/detlib.glsl.template` to a multiply and an
add before it compares the result, byte for byte, against the
darkroom's deployed `detlib.glsl` — and that comparison passes on this
tree (27,435 chars, identical). So the bits four GPU vendors agree on
are the bits of **two roundings, not one**, and a sequencer program that
reproduces the library has to spend two instructions where the source
reads as one.

Two evaluations of that same text are compared:

- **the reference**, `core/glsl-f32.mjs`: an interpreter over the
  parsed shipped text, with real branches, real calls, and one binary32
  rounding per operation. float64 arithmetic plus `Math.fround` is
  correctly rounded here because the library has no `fma` left in it —
  `a*b` is exact in binary64 (48 ≤ 53 significand bits) and `a+b`
  satisfies Figueroa's double-rounding condition (53 ≥ 2·24+2). A fused
  multiply-add would need the exact `a*b+c`, which 53 bits do not always
  hold, and that is exactly why this argument works only for the
  unfused library.
- **the sequence**, `core/cft-lower.mjs` + `core/cft-run.mjs`: the same
  parse compiled to a straight-line sequencer program — every call
  inlined, every branch turned into `SELECT`, every ISA gap expanded —
  and then executed one instruction at a time through libcft's
  `cft_run` at binary32.

They share the text and nothing else: an expression-tree interpreter in
JavaScript against a register machine running C. `docs/SEQUENCER.md`'s
**P1** is what makes the second one legitimate as a stand-in for the
tile — "the sequencer introduces no arithmetic … a sequencer program is
a schedule over verified operations" — so issuing each instruction
through `cft_run` is the same arithmetic the tile performs, in the same
order, under the same per-instruction rounding attribute. What is *not*
tested here is the scheduling hardware: the issue/drain machine, the
active mask, the deposit addressing. Those are cft-fp256's
`tb/test_seq_core.py`, scored against `python/cft_golden/seq.py`, and
nothing in this file speaks for them.

**One limitation of the oracle, stated rather than buried.** JavaScript
has one NaN and its bit pattern is a platform artifact, so the reference
cannot carry a NaN payload. Every deposit where both sides are NaN is
counted separately as "NaN payload only" and excluded from bit
identity. The library's own header already puts NaN payloads outside
the contract ("flushed downstream"), so this costs nothing, but it is a
gap in the instrument and not a property of the emission.

## The verification table

`node tools/verify-cft-detlib.mjs --points 4096 --isa-ext`, exit 0.

4,096 arguments per function. The sweep is built in
`core/cft-sweep.mjs` from three sources, and the first is the one that
matters: **every numeric literal the function and its callees contain**,
as a bit pattern, with its two one-ULP neighbours. A det function's
branches are unsigned magnitude compares against exactly those literals
— `0x00800000`, `0x7F800000`, `0x7EF127EA`, `0x7E000000`, `0x5F375A86`
— so reading them out of the parse puts a sample on both sides of every
guard the function has, and does it without anybody deciding which
guards were interesting. Then the specials (both zeros, both
infinities, a quiet NaN, the subnormal ends, ±1, ±2, ±½, ±max), the
cross product of those specials for two-argument functions, a linear
scan over a working range, and patterns whose exponents are drawn
across the whole format. The randomness is `core/measure.mjs`'s own
`hashu` seeded by the function name, so a re-run sweeps the same points.

`img` is the whole image: ALU instructions plus one `DEPOSIT` per
result plus `HALT`. `reg` is the peak register count, with the count
the unscheduled expression walk needed in brackets. `fused` is the same
function emitted with `FMA` instead of a multiply and an add, scored
against the same reference — see below.

| function | args | sweep | in domain | ALU | img | reg (walk) | consts | deposits | bit-identical | fused ALU | fused mismatches |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `det_split12` | 1 | 4096 | 4096 | 1 | 3 | 1 (1) | 1 | 1 | yes | 1 | 0 |
| `det_scale48` | 1 | 4096 | 2063 | 10 | 12 | 3 (3) | 5 | 1 | yes | 10 | 0 |
| `det_twoprod` | 2 | 4096 | 4096 | 13 | 16 | 6 (6) | 1 | 2 | yes | 13 | 0 |
| `det_recip` | 1 | 4096 | 4096 | 47 | 49 | 7 (9) | 15 | 1 | yes | 39 | 656 |
| `det_div` | 2 | 4096 | 4096 | 64 | 66 | 8 (12) | 16 | 1 | yes | 54 | 408 |
| `det_sqrt` | 1 | 4096 | 4096 | 58 | 60 | 6 (9) | 15 | 1 | yes | 52 | 428 |
| `det_exp2` | 1 | 4096 | 4082 | 41 | 43 | 7 (8) | 24 | 1 | yes | 35 | 99 |
| `det_log2_ef` | 1 | 4096 | 4096 | 117 | 120 | 11 (16) | 28 | 2 | yes | 103 | 187 |
| `det_log2` | 1 | 4096 | 4096 | 116 | 118 | 11 (16) | 28 | 1 | yes | 101 | 33 |
| `det_sincos` | 1 | 4096 | 4096 | 50 | 53 | 9 (9) | 19 | 2 | yes | 38 | 41 |
| `det_sin` | 1 | 4096 | 4096 | 46 | 48 | 8 (8) | 19 | 1 | yes | 34 | 31 |
| `det_cos` | 1 | 4096 | 4096 | 46 | 48 | 8 (8) | 18 | 1 | yes | 34 | 19 |
| `det_tan` | 1 | 4096 | 4096 | 114 | 116 | 9 (12) | 33 | 1 | yes | 92 | 174 |
| `det_atan` | 2 | 4096 | 4096 | 100 | 102 | 11 (16) | 27 | 1 | yes | 82 | 134 |
| `det_acos` | 1 | 4096 | 4096 | 161 | 163 | 11 (16) | 32 | 1 | yes | 137 | 122 |
| `det_mod` | 2 | 4096 | 4096 | 79 | 81 | 8 (12) | 17 | 1 | yes | 68 | 1441 |
| `det_pow` | 2 | 4096 | 2554 | 241 | 243 | **17** (18) | 43 | 1 | yes | 215 | 61 |
| `u2f` | 1 | 4096 | 4096 | 9 | 11 | 2 (2) | 5 | 1 | yes | 8 | 0 |
| `hashu` | 1 | 4096 | 4096 | 8 | 10 | 2 (2) | 4 | 1 | yes* | 8 | 0 |

**Every function reproduces the shipped library's bits, exactly, on
every point of its stated domain.** The asterisk on `hashu` is `IMUL`,
below.

Three functions have a stated domain narrower than the whole format,
and each one names an operation GLSL itself leaves undefined. The
predicates are in `core/cft-sweep.mjs` with the sentence in the library
that justifies them; the sweep still covers every point and the
verification prints the out-of-domain divergences rather than dropping
them.

| function | domain | out-of-domain divergences | why |
|---|---|---|---|
| `det_scale48` | `1 <= ux < 2^23` | 2,030 of 4,096 | The `findMSB` expansion below is exact only there. All three callers — `det_recip`, `det_sqrt`, `det_log2` — test `ux` against zero and against `0x00800000` before calling; the function is a helper handed a subnormal's mantissa, never an entry point. `det_scale48(0)` wants `findMSB(0) = -1`, and the float route gives `-127`. |
| `det_exp2` | any non-NaN `x` | 14 of 4,096 | `clamp(x, -150, 129)` brings every finite and infinite argument into the range `int()` is defined on, but a NaN passes the clamp unchanged and reaches `int(k)`, which GLSL leaves **undefined** — the library's own finding 70, "two stacks disagreeing about an out-of-range conversion return DIFFERENT SIGNS". The reference models it as `Math.trunc(NaN) = 0` and returns NaN; the magic-constant expansion yields a large positive integer, takes the `e > 128` arm and returns `+inf`. Neither is wrong, because GLSL says nothing. |
| `det_pow` | `0 < x < inf`, `y` not a NaN | 1,488 of 4,096 | The library header puts "log of a non-positive" outside the contract, and GLSL's own `pow` is undefined for `x < 0` and for `x = 0` with `y <= 0`. Every one of these divergences is the `det_exp2` line above reached through `y * det_log2(x)`: where that product is a NaN — `x <= 0`, or the `0 * inf` form at `det_pow(+inf, +0)` — `det_exp2` receives a NaN and the undefined `int()` decides the answer. |

NaN-payload-only differences, excluded from the count above and
attributable to the oracle rather than the emission: `det_split12` 2,
`det_twoprod` 463, `det_div` 27, `det_atan` 24, `det_mod` 162,
`det_pow` 78.

## Three corrections to `docs/ATLAS.md`'s census

### 1. `precise fma` does not map to `FMA`

The census row reads "`precise` fma, `+`, `-`, `*` → `FMA`, `ADD`,
`SUB`, `MUL` at fp32, RNE, denormals kept — bit-exact by construction".
It is not, because the library the cards run has no `fma` in it.
Emitting `FMA` computes a **different function**: more accurate, and
wrong.

Measured, same reference, same 4,096-point sweeps
(`node tools/verify-cft-detlib.mjs --points 4096 --isa-ext --fused`,
exit 1):

| | shipped (MUL + ADD) | fused (FMA) |
|---|---|---|
| ALU instructions, all 19 functions | 1,321 | 1,124 |
| functions bit-identical in domain | 19 | 5 |
| in-domain mismatches | 0 | 3,834 |

Four of the five that survive fusion have no `fma` in them to begin
with: `det_split12`, `det_scale48`, `hashu`, and `det_twoprod` — which
is written `precise` local by `precise` local exactly so that no pair of
its steps can be contracted, because a fused step there would be MORE
accurate and therefore wrong. The fifth, `u2f`, does take the FMA
(8 instructions rather than 9) and is bit-identical anyway, because
`hi * 65536` is exactly representable and the two forms round in the
same place. Worst offender `det_mod` at 1,441 of 4,096, better
than one argument in three, then `det_recip` 656, `det_sqrt` 428,
`det_div` 408. Every mismatch inspected was one ULP, which is the
point: a one-ULP shift is what `det_log2`'s own comment measured as
16,660,144 deposits moving in one bin of `starfield`. The 197
instructions the fused form saves buy a different library.

The census's `42 fma` is also low: the template contains **56**, which
is what `gen-detlib` rewrites and reports on every run.

### 2. GLSL's `min`/`max` are not the `MIN`/`MAX` opcodes

The census maps "`abs`, `min`, `max`, `clamp` → `ABS`, `MIN`, `MAX`,
`MIN`+`MAX`", with the note that "GLSL leaves `min`/`max` with a NaN
undefined; the det discipline keeps NaN out". GLSL 8.1 does not leave
them undefined — it *defines* `min(x,y)` as `y < x ? y : x` and
`max(x,y)` as `x < y ? y : x`. The tile's `MIN` and `MAX` are 754
`minimum` and `maximum`, which return a NaN when either operand is one
and return `-0` for `minimum(+0, -0)`. Those differ.

Measured (`--minmax-opcode`, exit 1): emitting the opcodes puts
`det_atan` **36 points** of 4,096 away from the shipped bits.
`det_atan(+0, NaN)` is `+0` through the GLSL form — `min` and `max`
both collapse to `+0` and the `mx == 0.0` guard fires — and a quiet NaN
through the opcode. So `min` and `max` are emitted as a `CMPLT` and a
`SELECT`. `clamp` follows GLSL 8.3's own spelling, `min(max(x, a), b)`,
so it costs four instructions rather than two.

The whole bill is **eight instructions across the library**: `det_exp2`
39 → 41, `det_atan` 99 → 100, `det_acos` 160 → 161, `det_pow` 237 →
241. `det_atan` pays for only one of its two rather than two, because
its `min(ay, ax)` needs `CMPLT(ax, ay)` and the `if (ay > ax)` two lines
later is the same comparison — common-subexpression elimination finds
it.

### 3. `u2f` is nine instructions, not six

The census says the integer-to-float conversion is "six instructions per
draw". Measured, `float(uint)` alone is **eight** without an FMA and
seven with one — `ISHR`, `IOR`, `SUB` for the high half, `IAND`, `IOR`,
`SUB` for the low half, then `hi*65536 + lo` as a `MUL` and an `ADD`.
`u2f` as the header writes it is that plus the multiply by 2^-32:
**nine instructions, five constants, two registers**, bit-identical to
the reference on all 4,096 sweep points including the whole uint range.
The mechanism is the one the census describes and it is exact:
`hi*65536` is exactly representable, so the add rounds once and the
result is what a conforming `float(uint)` returns.

## The register discipline

`r0`, `r1`, `r2` arrive from the three input streams `a`, `b`, `c`, and
`r3..r15` start at `+0` — `docs/SEQUENCER.md`, "the inputs are the
streams that already exist". A det function's arguments take the low
registers in declaration order: `det_div(a, b)` reads `a` from `r0` and
`b` from `r1`; every one-argument function reads `r0`. **No det
function takes three inputs**, so `docs/ATLAS.md`'s item 3 — a wider
per-lane input block — is not something the det library asks for. It is
the positive's problem, not the library's: the registry contract
delivers seven per-sample values, and that argument stands on its own
ground in step 3.

Everything above the arguments is a temporary. There is no fixed
assignment, and there should not be: the sequences are inlined into a
positive's program, where the surrounding code owns the register file.
What the record fixes is the **peak**, per function, which is what a
caller has to budget.

Allocation is a linear scan over the instruction order, with an
operand's register returned to the free list at the instruction that
last reads it — after that instruction's own reads, so a destination
may legally reuse a source's register, which is what the lane does
(read a, b, c; then write rd). Results stay where they were computed
until their `DEPOSIT`.

**The order matters more than the allocator.** The instructions form a
DAG of pure operations, so any topological order computes the same
values and only the peak changes. Four greedy list schedules are built
and the lowest peak is kept; they differ only in how they break ties,
and the expression-walk order is one of them so the table can say what
the reordering bought. `kills-deep` — take the ready instruction that
frees the most operands, ties to the node furthest from a result — wins
or draws on all nineteen. Measured, from the `reg (walk)` column above:
`det_log2` 16 → 11, `det_log2_ef` 16 → 11, `det_atan` 16 → 11,
`det_acos` 16 → 11, `det_div` 12 → 8, `det_mod` 12 → 8, `det_tan`
12 → 9, `det_sqrt` 9 → 6, `det_recip` 9 → 7, `det_pow` 18 → 17.

Only `det_pow` was ever over the wall, and it still is, by one. What
the scheduling buys the rest is headroom: `det_atan` at eleven leaves
five registers for whatever positive inlines it, where sixteen would
have left none. That headroom is the thing step 3 spends.

Deposits are one per result, in declaration order — the return value
first, then each `out` parameter. Only `det_sincos` (`s_out`, `c_out`),
`det_twoprod` (`p`, `lo`) and `det_log2_ef` (`e`, `f`) deposit two;
everything else deposits one. Against the tile's `MAXD = 64` slots a
lane that is not close to a constraint.

## The constant budget, and where sixteen runs out

Operand fields are four bits and `ka`/`kb`/`kc` redirect them at the
constant bank, so a program addresses **sixteen** constants whatever
`n_consts` says. Eleven of nineteen functions want more:

| fits in 16 | needs indexed constants (`kx`) |
|---|---|
| `det_split12` 1, `det_twoprod` 1, `hashu` 4, `det_scale48` 5, `u2f` 5, `det_sqrt` 15, `det_recip` 15, `det_div` 16 | `det_cos` 18, `det_sincos` 19, `det_sin` 19, `det_mod` 17, `det_exp2` 24, `det_atan` 27, `det_log2` 28, `det_log2_ef` 28, `det_acos` 32, `det_tan` 33, `det_pow` 43 |

`det_div` lands on exactly sixteen, which is the shape of the problem:
the library's own primitives just fit, and everything built on them does
not. And this is the budget for **one function alone**. `docs/ATLAS.md`
already counts eleven of the sixteen slots gone to `P[8]`, `uT`, `TAU`
and `PI` before a positive's first coefficient; an inlined `det_sincos`
wants nineteen more on top of that. There is no arrangement in which a
positive that calls one transcendental fits sixteen addressable
constants.

Across all nineteen functions there are **77 distinct constants**. The
whole set fits `KMEM_D = 256` — the memory is already there, and
`docs/studies/OPT-D-contract.md` 1.1 is what makes it addressable.

## What the ISA does not have, and what replaces it

Ten operations in the shipped library have no opcode. Each is expanded
into operations that do exist; each expansion is derived rather than
looked up, and each carries the domain it is exact on. They are in
`core/cft-lower.mjs`'s `EXPANSIONS`, printed by the verifier, and
carried into `core/detlib.cft.json`.

| gap | insns | exact on | how |
|---|---|---|---|
| `findMSB(u)` | 4 | `1 <= u < 2^23` | `u \| 0x4B000000` is the float `2^23 + u` exactly (u is below the binade's spacing of 1); subtracting `2^23` leaves `float(u)` exactly; its biased exponent field is `127 + floor(log2 u)`. |
| `int(k)` | 2 | `k` an exact integer, `\|k\| < 2^22` | `k + 1.5*2^23` lands in `[2^23, 2^24)` where the spacing is 1, so its encoding is `0x4B400000 + k` in two's complement; one `ISUB` of `0x4B400000` is `int(k)`. The same magic constant the library already rounds with, so no new number enters the bank. |
| `float(n)` | 2 | `\|n\| < 2^22` | the same identity read backwards. |
| `float(uint)` | 8 | all 2^32 | the 16-bit split above. |
| `floor(x)` | 13 | all finite `x` | `x + 2^23` under roundTowardNegative minus `2^23` is `floor(x)` for `x >= 0`; the same on `-x` under roundTowardPositive, negated, for `x < 0`; `\|x\| >= 2^23` is already integral and selects `x`; `±0` selects `x` too, because `floor(-0)` is `-0` and the positive branch would give `+0`. |
| `clamp(x,a,b)` | 4 | all `x` | GLSL 8.3's own spelling, `min(max(x, a), b)`, with `min` and `max` as the comparisons 8.1 defines them to be rather than as the `MIN`/`MAX` opcodes. |
| `isnan(x)` | 2 | all `x` | `1 - CMPEQ(x, x)`; a quiet compare is false on a NaN. |
| `isinf(x)` | 2 | all `x` | `CMPEQ(ABS(x), +inf)`. |
| signed `<` | 3 | all int32 pairs | `ICMPLT` is unsigned, so both operands are biased by `0x80000000`. A constant operand folds, leaving two. |
| integer `==` | 2 | all pairs | `ICMPLT(a ^ b, 1)`: the xor is zero exactly when they are equal, and unsigned-less-than-one is exactly zero. **Not** a float `CMPEQ` on the difference, which would also fire on a difference of `2^31`. |

Only `floor` uses a rounding attribute other than `rne`, and only in
`det_mod`: 1,319 instructions at `rne`, one `rdn`, one `rup`. The
per-instruction attribute `docs/SEQUENCER.md` argues for is used exactly
twice in the whole library, and it is load-bearing both times.

Nineteen distinct opcodes are used, out of the ISA's thirty:
`MUL` 334, `ADD` 237, `SELECT` 157, `SUB` 111, `ICMPLT` 97, `ISUB` 59,
`IAND` 54, `IOR` 44, `NEG` 43, `ISHL` 36, `IXOR` 33, `ISHR` 24,
`IADD` 24, `CMPLT` 20, `CMPEQ` 19, `ABS` 17, `MAX` 9, `IMUL` 2,
`CMPLE` 1. `MAX` is not `max()` — it is logical OR of two predicates,
which are exactly `1.0` or `+0.0`.

**`RECIP_SEED` and `RSQRT_SEED` are unusable here**, and that is worth
saying because they look like exactly what `det_recip` and `det_sqrt`
want. The library seeds Newton from `0x7EF127EA - m` and
`0x5F375A86 - (m >> 1)` and then runs a *fixed* number of rounds. A
different seed gives different iterates and different final bits, so
the tile's seed opcodes would compute a different function. The
integer opcodes the seeds are built from — `ISUB`, `ISHR` — are the
ones that matter.

## Instruction counts against the 1,024-instruction image

`IMEM_D = 1024` (`rtl/cft_krnl.sv`'s instantiation of `cft_seq`). All
nineteen functions together are **1,362 instructions**; the largest
single one is `det_pow` at 243, then `det_acos` 163, `det_log2_ef` 120,
`det_log2` 118, `det_tan` 116, `det_atan` 102. **No single det function
comes close to the image.**

The pressure is not one function, it is a positive that calls several.
With the per-call costs above, and reading the emitted GLSL for each of
the 69 positives (`emitWalk` under `pin`, counting `det_*`, `hashu` and
`u2f` calls and multiplying by the ALU counts in the table):

| positive | det-only instructions | calls |
|---|---|---|
| `throughput` | 10,100 | div×36 sqrt×2 sincos×8 mod×1 pow×2, hashu×499, u2f×303 |
| `vlsi` | 5,735 | div×27 sincos×3 mod×1 pow×4, hashu×210, u2f×126 |
| `starfield` | 4,940 | div×32 sqrt×12 log2×3 sincos×7 pow×4 |
| `hilbert` | 4,533 | div×22 mod×8 pow×10 |
| `diffract` | 3,965 | div×36 sqrt×8 exp2×2 log2×2 sincos×12 |
| … | | |
| `hopf` | 541 | div×3 sincos×6, hashu×5, u2f×1 |
| `jong` | 466 | sincos×8, hashu×6, u2f×2 |
| `buddha` | 147 | div×1, hashu×7, u2f×3 |

Median 707, maximum 10,100. **28 of the 69 positives are already over
the 1,024-instruction image on their det_* calls alone**, before a
single instruction of the positive's own arithmetic. That is the
measured form of `docs/ATLAS.md` item 4, and it is a good deal sharper
than the estimate there: the argument for `CALL` — or for
`OPT-D-contract.md` item 7, `IMEM_D` 1024 → 4096 for six BRAM — does
not rest on `hopf` being "roughly 600 instructions". It rests on two
fifths of the atlas not fitting at all.

`hopf` at 541 and `jong` at 466 do fit, with room for the positive's own
work. The README's "hopf and jong first" survives the measurement, and
step 3 has a budget rather than a hope. `hopf`'s number is also the
emitter's existing `det_sincos` hoist earning its keep: the twelve sine
or cosine calls `docs/ATLAS.md` counts become **six** `det_sincos` calls
in the emitted text, and at 50 instructions each that is 300 rather than
600.

## What needs which ISA step

| needs | functions | where it is specified |
|---|---|---|
| **indexed constants** (`kx`, instruction bit 30, 8-bit indices in `imm`, bank to 256) | `det_cos`, `det_sincos`, `det_sin`, `det_mod`, `det_exp2`, `det_atan`, `det_log2`, `det_log2_ef`, `det_acos`, `det_tan`, `det_pow` — eleven of nineteen | cft-fp256 `docs/studies/OPT-D-contract.md` 1.1 |
| **`IMUL`** (opcode 30, 32-bit low product) | `hashu`, and therefore every draw in every positive | `OPT-D-contract.md` 1.2 |
| **more than sixteen registers, or `CALL`** | `det_pow` alone, at 17 | `docs/ATLAS.md` item 4 |
| **a wider input block** | nothing in the det library | `docs/ATLAS.md` item 3 — it is the positive's ask, not the library's |

`hashu` is emitted only behind `--isa-ext`, and it is the one place this
work departs from libcft's arithmetic. Opcode 30 is unassigned there
today, and `softfloat.compute` answers an unassigned opcode with the
canonical quiet NaN and `invalid` **on purpose** — measured, `hashu`
comes back as `0x7fc07fc0` rather than a hash. So the interpreter
emulates the two `IMUL` instructions to the definition
`OPT-D-contract.md` 1.2 gives them, the report says how many
instructions were emulated (2), and `hashu`'s bit identity is a claim
about the *sequence*, conditional on that opcode arriving. Everything
else in every run is libcft's own arithmetic.

`det_pow` at seventeen registers is one over, and that is the whole
story: the arithmetic is right — it is bit-identical on all 2,554
in-domain sweep points, run on a widened lane and labelled as such —
and the sequence cannot be loaded. It is also the only function in the
library that does not fit, which makes it a poor argument for `CALL` on
its own and a good argument for the cheap fix: `det_pow` inlines
`det_log2_ef`, `det_log2`, `det_exp2` and two `det_twoprod`s, and the
seventeenth register is the price of holding `y`, `e`, `f`, `h1`, `h2`
and the twoSum's residual across `det_exp2`'s own working set.

## What was not done

- **No hardware and no ABI change.** Nothing in cft-fp256 was touched.
- **`core/emit-cft.mjs` and the per-positive image** are step 3, and
  are not here. The call counts above are a text scan over emitted
  GLSL, not an emitter.
- **The GPU record capture** is step 5. This work compares the sequence
  against an interpreter of the shipped text, not against a card. What
  makes that acceptable is the discipline itself: no `fma` survives, no
  division, no builtin with spec latitude, every intermediate bound to
  a `precise` local — so "what a conforming driver computes" is a
  function of the text. Where it is *not* a function of the text — the
  undefined `int()` of a NaN — this file says so and the three domain
  rows above are the whole list.
- **`REPEAT`, `SETACT` and `ACTALL` are unused.** Every det function is
  straight-line: ALU instructions, then `DEPOSIT`s, then `HALT`, which
  the verifier asserts rather than assumes. The active mask never
  moves, so P2 and P3 have nothing to be invisible about in these
  programs. Loops arrive with `s.orbit` in step 3.
- **Flags are not part of the claim**, as `docs/ATLAS.md` says. The
  predicated form evaluates paths a branch would have skipped, so it
  raises flags the GLSL does not; the union per function is recorded in
  `build/cft-detlib-verify.json` for reference.

## 2026-09-08 - the scheduler learned depth-first, and every function fits

The lowering above was reused for whole positives (`docs/CFT-POSITIVE.md`),
and a whole positive taught the scheduler two things the library could
not: a kills-first list schedule interleaves independent chains, and a
depth-first order needs eager completion or it leaves half of a shared
tree live. Both are described there. Re-run on the library, the new
policies and a local search over the schedule lower six functions'
peaks and leave the other thirteen where they were:

| function | was | is | | function | was | is |
|---|---|---|---|---|---|---|
| `det_exp2` | 7 | 6 | | `det_tan` | 9 | 8 |
| `det_sincos` | 9 | 8 | | `det_pow` | **17** | **14** |
| `det_sin` | 8 | 7 | | `det_cos` | 8 | 6 |

`det_pow` was the one function over the wall, by one, and "What needs
which ISA step" above lists it under "more than sixteen registers, or
CALL". It no longer needs either: local moves alone bring it to 16, and
the depth-first order to 14. **Every function of the shipped library
fits a lane.** The instruction ORDER of the six changed and their bits
did not - `node tools/verify-cft-detlib.mjs --points 4096 --isa-ext`
exits 0 on all nineteen, same sweeps, same domains - which is what a
scheduler is allowed to change and nothing else. The verification table
and the register discipline above are kept as written, as the record of
2026-09-07; `core/detlib.cft.json` carries today's schedules.

## 2026-09-08, later - revision 2, and a cast the library never needed

Two more changes to the record the same day, both from outside the
library.

**Revision 2 of the sequencer** (cft-fp256 docs/SEQUENCER.md, its
closing section): thirty-two registers a lane behind CAPS[5], a
4,096-word image, and a constant bank that arrives with the run behind
CAPS[6]. `core/cft-isa.mjs` encodes five-bit register fields with the
fifth bit in `imm[27:24]` and writes the `BANK_EXT` header. Nothing in
the library's nineteen programs uses a register above fifteen, so their
words are unchanged by R1; `gen-detlib --target cft` still writes them
self-contained, with the bank in the image, because a library function
has no per-run data.

**`int(x)` truncates.** The two-instruction `f2i` above - add
1.5·2^23, subtract the magic's bits - assumed its argument was already
an integer, which the library's every `int(k)` is (k comes off the
shift trick or the exponent field). A plate's `int(P[k] + 0.5)`,
`int(u2f(pt) * n)` and `det_fract`'s `float(int(x))` are not, and GLSL
5.4.1 says the cast truncates toward zero. The old form rounded them to
nearest: measured 2026-09-08 on `wave` and `stdmap`, wrong on every
sample, and on the corpus's integer levers, right exactly when the
default happened to be even. `f2i` is now six instructions - floor of
the magnitude through the 2^23 trick under roundTowardNegative, whose
bit pattern IS `0x4B000000 + floor(|x|)`, then the sign put back on the
integer - and exact for every finite `|x| < 2^23`. The library pays
four instructions at each of its seven `int()` sites and computes the
same bits:

| function | ALU was | ALU is | registers |
|---|---|---|---|
| `det_exp2` | 41 | 45 | 6 |
| `det_sincos` | 50 | 54 | 8 |
| `det_sin` | 46 | 50 | 8 (was 7) |
| `det_cos` | 46 | 50 | 7 (was 6) |
| `det_tan` | 114 | 118 | 8 |
| `det_pow` | 241 | 249 | 14 |
| all nineteen | 1,362 | 1,390 | |

`node tools/verify-cft-detlib.mjs --points 4096 --isa-ext` exits 0 on
all nineteen under the new form, same sweeps, same domains. The
verification table above is kept as the record of 2026-09-07;
`core/detlib.cft.json` carries today's programs.
