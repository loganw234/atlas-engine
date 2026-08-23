# Determinism by construction

A plan. Written 2026-08-22, before the work, so that what was intended
can be compared against what happened.

## The goal, stated precisely

**One hash, everywhere, and every number in the chain checkable against
a source outside this project.**

Three claims, in the order they have to be earned:

1. A positive's meaning is *defined* by the language, not discovered by
   running it somewhere.
2. Every implementation that runs it — the native evaluator, emitted
   GLSL on any driver, any card — produces bit-identical output, or is
   wrong by definition.
3. Every constant and every approximation underneath that definition
   can be checked by someone who trusts none of this code, against
   published values they can look up themselves.

The third is the one that makes the first two worth anything. A
deterministic system whose constants nobody can audit is a system that
reproduces the same answer everywhere and cannot say whether it is the
right answer.

## Why here and not in the darkroom

The darkroom corrects **afterwards**. `bakearchive` regex-substitutes
`det_*` over GLSL that was hand-written by sixty-eight different
authors, and the operations it deliberately leaves alone — raw
division, `dot`, `mix`, `smoothstep`, `fract`, `floor` — are a judgement
call about what is "exact or near-exact enough".

Measured 2026-08-22 across four machines and six stacks, that judgement
has a ceiling:

| pair | plates agreeing, of 68 |
|---|---|
| GTX 1080 vs RTX 5060 Ti | 68 |
| Arc B580 vs RX 7600 | 61 |
| RX 7600 vs NVIDIA | 59 |
| llvmpipe vs *any GPU* | 1 |

And the divergence is not attributable: correlating every unpinned
operation against the nine cross-vendor diverging plates separates
nothing. `inversesqrt` shows 3.9× off a base of 0.3 against 0.1, which
is noise; raw-division density puts mostly *agreeing* plates at the top.
Whatever it is, it is not one source-level operation, and it cannot be
found by looking harder at text nobody controls.

The engine controls the text. Three properties are already in place:

- **One choke point.** `emit.mjs` has exactly one line where a binary
  operator becomes GLSL. Every `/` in every emitted plate passes
  through it.
- **Association is already explicit.** Every binary op emits
  `(l op r)`, fully parenthesised, by construction.
- **The refusal machinery already exists and already targets this.** It
  refuses float `%` because it "diverges between JS and GLSL", and
  refuses stream draws on the short-circuit side of `&&`. Determinism
  pinning is that same principle with wider coverage.

And `measure.mjs` dissolves the question the darkroom cannot answer,
though not the way I first wrote here — see the correction in Phase 1.
It computes the walk in **float64**, which makes it an *accuracy*
reference rather than a bit-exact one. That is better for this purpose:
there is no need to decide whether NVIDIA or llvmpipe is "correct",
because a higher-precision evaluation of the same program can be asked
directly, and both are scored against it.

## What a verifiable oracle means here

Three levels, each stricter than the last. A constant is only admitted
when all three hold.

**Level 1 — provenance.** Every constant names where it came from, in
data rather than in a comment: a source, an edition, a page or symbol.
"cephes minimax on [-0.5, 0.5]" becomes a record a script can read.

**Level 2 — transcription.** The constant equals what that source says,
checked by an independent implementation. π is the correctly-rounded
f32 nearest the real π, and `mpmath` at 50 digits says so — not numpy,
which shares too much lineage with the thing being checked.

**Level 3 — behaviour.** The *approximation built from* those constants
is measured against a high-precision reference over its whole admitted
domain, and its worst error is asserted against the published bound.
This is the level that catches a correctly-transcribed coefficient used
in the wrong polynomial, which levels 1 and 2 both pass.

Level 3 is the one that matters and the one usually skipped. A minimax
polynomial with the right coefficients and a wrong Horner order is
still wrong, and only measurement says so.

## Phases

Each phase ends with something checkable. No phase depends on a later
one being finished.

### Phase 0 — the oracle — **DONE 2026-08-22**

`core/constants.json`, `tools/seed-constants.py`,
`tools/verify-constants.py`, `tools/oracle.mjs`,
`tools/verify-negative-controls.py`.

36 constants and 5 approximations, each with bits, exact decimal,
provenance, domain and bound. All 36 bit patterns match the darkroom's
deployed `gendetlib.py`, so this measures the running library rather
than a copy. Findings in `docs/CONSTANTS-FINDINGS.md`.

**Done when:** `verify-constants.py` passes with every constant at all
three levels, and fails loudly if any bit pattern is edited. — Met.
Nine negative controls, each caught at the level that claims to catch
it (`verify-negative-controls.py`).

Four things turned out differently from this plan, and they are worth
carrying forward because each was a mistake this phase caught in
itself:

**The published bound was replaced by a measured one.** The plan said
"asserting the published bound". There is no bound anyone can open: the
cephes attribution is cited from ubiquity, and the atan coefficients
carry no attribution at all. Asserting a citation I could not check
would have been the exact failure this phase exists to prevent. So
bounds are **measured over the admitted domain with the exact
evaluation order and pinned**, which is a stronger claim than a
citation — a fact about this code rather than about someone else's.

**A citation was replaced by a measurement.** The atan coefficients
claim "odd minimax on [0, 1]" and name no source. Equioscillation tests
that claim without one, and it holds: six alternating extrema, evenness
0.962. Where a source cannot be opened, a falsifiable property can
still be checked.

**The equioscillation test had to be given a power analysis before its
verdicts meant anything.** It first reported sin, cos and exp2 as "not
minimax". That was reading the instrument's own noise: rounding those
coefficients to float32 perturbs the result by as much as the total
error, so equioscillation could not survive regardless of the fit.
Those three are now reported **INCONCLUSIVE** with the ratio.

**Behavioural bounds cannot catch a one-ulp typo, and a negative
control is what proved it.** A fitted coefficient moved one ulp passed
all three levels — sixty times under its own bound. Closed with a
sha256 seal over the bit patterns and a cross-check against the
darkroom generator. A missing upstream is a failure, not a skip.

Two accuracy findings came out of it, neither a parity break:
`det_sin` reaches ~1.0e-6 error (≈17 ulp) near the top of its stated
domain, because `float32(2/π)` widens the reduced argument to 1.05 rad;
and `det_atan` carries a 2.28e-5 relative floor near zero, which is
what an absolute-minimax fit costs. Both deterministic — every driver
gets the same answer — so the library's actual promise stands.

### Phase 1 — the accuracy oracle, which already exists

**Corrected before starting.** The plan above said to *add* a float64
mode. Inspection says there is nothing to add: `measure.mjs` uses
`Math.fround` in exactly nine places — the `u2f` RNG conversion, the
magnify/heart geometry, and the weighted pick — and nowhere else. Every
vector operation is plain JavaScript (`Vec2.scale` is `this.x * k`),
and every positive's walk is plain JavaScript arithmetic
(`j.chebyshev() * 2.0`, `0.92 / Math.max(rim, 1e-3)`).

**The native evaluator computes the walk in float64. Emitted GLSL
computes it in float32.** The f32 pinning is at the boundaries where
the two must agree structurally — the hash, the RNG, the geometry — not
through the arithmetic.

That is the right architecture, and it means the reference this project
has never had was already sitting here. It also means one thing in
`measure.mjs`'s own header — "writes GLSL whose arithmetic matches this
file exactly" — is true of the structure and cannot be true of the
arithmetic. f64 and f32 do not match, and no amount of care makes them.

So the roles separate cleanly, and two different tests measure two
different properties:

| | is | measured by |
|---|---|---|
| native evaluator | what the answer **should** be (f64) | error against it, per cell |
| emitted GLSL | **one** answer, everywhere (f32) | bit-identity across implementations |

**Done when:** `cascade` is evaluated natively and its two GPU answers
are scored against it — which of llvmpipe and radeonsi is nearer the
true measure, and by how much. That question is currently unanswerable
and becomes a afternoon's work.

#### Answered 2026-08-22 — and not from here

The engine could not answer it. `cascade` is one of the fourteen plates
with no positive, and it is the only one of the six most fragile plates
missing — `wpath`, `vortex`, `stdmap`, `logz` and `hilbert` all have
one. Worse, a positive would not have settled it anyway: conformance
between a positive and its plate is measured at `r ≈ 0.99`, four
significant figures, while the driver divergence being adjudicated is
1e-8 to 8e-5. **The restatement's own fidelity is coarser than the
effect**, so scoring GPUs against a positive would have measured the
restatement.

So it was answered in the darkroom instead, with
`tools/determinism/shapeprobe.py`: call `shape_<id>` directly on fixed
input bits, skip the renderer, score every stack against a float64
evaluation of the same function. Full record in the darkroom at
`docs/test-records/2026-08-22c-which-stack-is-nearest-the-truth.md`.

The result, on 65,536 paired samples across five stacks:

- **llvmpipe is farthest from the truth**, not nearest — beaten by
  every GPU on 52.3–52.7% of the samples where they differ, p < 0.001.
- **And it barely matters.** Every stack sits 5.6e-6 from the truth and
  3.2e-7 from its neighbours: seventeen times nearer each other than
  any is to the answer. Float32 sets the accuracy; the stack does not.
- The GTX 1080 and RTX 5060 Ti are **bit-identical on all 65,536
  positions** while their colours differ — colour goes through `cos()`,
  position does not.

Two things this changes for the phases below. First, **the reference
question has no single answer**: llvmpipe is six orders more accurate
at `sin`/`cos` (where two GPUs are simply wrong above |x| ≈ 1e5) and
marginally worse on chaotic pure arithmetic. Picking a column was never
the way out; `det_*` is. Second, `det_sin`'s 1.01e-6 worst error from
Phase 0 turns out to be **four orders better than the best GPU builtin
at large arguments** — so Phase 2's pinning buys accuracy as well as
parity, which was not the argument for it.

### Phase 2 — emit through the pinned set

`emit.mjs` stops emitting raw operators for the cases that have a
deterministic form.

- `/` → `det_div`
- transcendentals → `det_sin`, `det_cos`, `det_exp2`, …
- `precise` on the accumulation chain, by construction
- the refusal list extended to anything without a pinned form

The det library moves into the engine — generated from the verified
constants of Phase 0, not copied.

**Done when:** an emitted plate contains no unpinned float operation,
and the emitter refuses a positive that would require one.

#### Met for the emitted text, 2026-08-22 — and not yet for the header

`emitWalk(pos, { pin: true })`. Without the flag the emitter behaves
exactly as before, so nothing already built moves until asked.

| | |
|---|---|
| fully pinned | **50 of 54** |
| refused | **4** — `asin` ×3, `cosh` ×1 |
| emitted text still carrying an unpinned op | **0** |
| compile on NVIDIA, radeonsi, iris, llvmpipe | **50/50 each** |

The det library moved in as the plan said, and the check that makes it
worth anything is byte-identity: `tools/gen-detlib.mjs` fills the
extracted template from the verified record and the result is
**identical to the darkroom's proven `detlib.glsl`**, all 16,138
characters. Every guarantee that file has earned transfers.

New pinned forms live in `core/detpre.glsl.template`, separate so
`detlib.glsl` is never added to: `det_len2/3`, `det_dot3`, `det_cross`,
`det_mix/mix3`, `det_smoothstep`, `det_div2`, `det_rodrigues`.

**THE GAP, stated because it would otherwise be invisible.** Emitted
text *calls* functions whose bodies live in the registry's shared
header, and a text scan cannot see into them. Measured: **38 of 54
positives** reach unpinned arithmetic that way —

| | calls | what is unpinned in it |
|---|---|---|
| `cmul` | 113 | products and a difference, contraction free |
| `pal` | 44 | `cos()` |
| `cdiv` | 7 | `dot()` and a raw division |
| `csqrt` | 2 | `sqrt()`, twice |

So "fully pinned" above means *the text the engine writes*, not the
whole program. Closing it needs det_ versions emitted alongside the
plate, or a change to the registry contract — a Phase 5 question.

Three things the work turned up:

**`Math.round` was already wrong, before any determinism question.**
JS rounds a half toward +∞; GLSL says a 0.5 fraction "will round in a
direction chosen by the implementation". It is both a JS/GLSL mismatch
and a parity hazard, and it now emits `floor(x + 0.5)` — exactly what
JS does — unconditionally, because a correctness fix does not wait for
a flag.

**A claim in the checker was false and checking it caught that.**
`verify-pinned.mjs` admitted `dot` and `mix` "because nothing emitted
uses them". Putting them in the scan dropped the pinned count from 50
to 35: fifteen positives used one or the other. The claim had never
been measured.

**Most of the unpinned operations were the emitter's own, not the
author's.** Swapping the `Math.*` map covered 19 of 54. The remaining
31 came from generated code — `length()` from `len2`/`len3`, the `pow`
deciding a descend depth, the divisions in cell and magnify
arithmetic, `cos`/`sin` in the rotation helper. The one choke point
the plan counted on turned out to be several.

### Phase 3 — bit-identity as the bar

The conformance harness currently reports cell correlation `r =
0.9915`, with GPU-to-GPU at `0.9925` — the method's own noise floor
sits at that scale.

Bit-identity is not an increment on that; it is a different
measurement. It needs the harness to compare deposits, not tonemapped
cells.

**NOT native-against-GLSL.** Per the correction in Phase 1, those two
compute at different precisions and can never be bit-identical. The bar
is emitted GLSL against emitted GLSL, on different implementations —
which is the property the commons actually needs, and the one the
darkroom already tries to hold.

**Done when:** for at least one positive, emitted GLSL produces
identical integer deposit counts over a full supertile on two different
implementations — and its error against the native f64 evaluation is
stated.

#### MET between GPUs, 2026-08-22 — 50 of 50, and llvmpipe ruled out

Emitted plates over **65,536** fixed input bits on four stacks, with the
same positives emitted **unpinned as the control**. Position,
bit-identical:

| pair | pinned | ignoring signed zero | control |
|---|---|---|---|
| NVIDIA ↔ radeonsi | 49/50 | **50/50** | 10/50 |
| iris ↔ radeonsi | 49/50 | **50/50** | 13/50 |
| NVIDIA ↔ iris | 48/50 | **50/50** | 11/50 |
| anything ↔ **llvmpipe** | 15–17/50 | 17/50 | 8–12/50 |

Colour, which goes through `pal`, reaches 40–46/50 from 15–21 before the
pinned header twins.

**The bar is met for GPUs.** The two plates still listed under the
strict column, `lyap` and `arnold`, differ *only* in the sign of a
zero — which deposits into the same pixel and which the census, hashing
accumulated counts, cannot see at all.

It took five things, and each was found rather than designed:

1. **`precise` on every declared local** — 12/50 → 46/50.
2. **Operand hoisting**, because `precise` on the destination does not
   stop radeonsi cancelling `(A - level) - (B - level)` into `A - B`.
   That closed `tpms`.
3. **Pinned twins for the registry's shared header** — `det_pal`,
   `det_cmul`, `det_cdiv`, `det_cinv`, `det_csqrt` — so an emitted
   plate no longer reaches an unpinned `cos()` at one remove. 38 of 54
   positives did.
4. **Hoisting inside ternary branches too**, which closed `mirage` at
   this size. It costs: a bound branch is computed whether or not it is
   selected, `tpms` pays for four of them, and `mirage`'s emitted
   source roughly doubles. Correctness over speed is what the `pin`
   flag is for.
5. **Binding the operands of COMPARISONS**, 2026-08-23, which is what
   actually closed `mirage` — item 4 did not, and the census found it
   still split NVIDIA against Mesa. A comparison's result is a `bool`
   and cannot be `precise`, so an expression feeding one and nothing
   else reached no precise destination at all. `mirage` switches its
   leapfrog on `n*n - C*C > 0.0` where the two are both near 1.02 and
   the difference is the ray's turning point: 23.2% of 345,600 rays
   present that comparison a value below the rounding error of its own
   subtraction. **66 of 69 positives carried at least one such
   comparison**, so the hole was general and `mirage` was only the
   plate sitting on a knife edge. `Math.*` call arguments were bound at
   the same time for the same reason. `verify-pinned` gates it, and the
   gate was faulted against the previous emitter first.

   Adding it moved NVIDIA's hash on ZERO of 67 plates re-censused on
   the same card, and moved Mesa's on `mirage`. So NVIDIA already read
   `precise` as reaching through the comparison and Mesa did not; the
   binding removes the need for either reading.

And then the last plate found a defect in the det library itself. See
below.

**llvmpipe is out, for a reason under the plates.** `tools/detbits.py`
finds **16 of 23 det_ functions differ on llvmpipe** while the three
GPUs agree exactly. The cause, isolated by `fmaprobe.py`: **llvmpipe
does not single-round `fma()` even under `precise`** — it returns
bit-for-bit the two-rounding `a*b + c` on all 262,144 inputs, where the
GPUs differ from that form on 49,632. Scoped further: radeonsi's *LLVM*
backend is correct, and llvmpipe fails identically on Mesa 24.0.5/LLVM
17 and 26.1.7/LLVM 20. It is llvmpipe's own lowering, so no GPU is at
risk. Bug report drafted in the darkroom at
`docs/bug-reports/mesa-llvmpipe-fma-not-single-rounded.md`.

**What is still not met.** This is the shape function over 65,536
samples, not integer deposit counts over a full supertile — stronger
per sample, weaker in coverage; the supertile run belongs with Phase 4.
And the error against the native f64 evaluation is still not stated.

#### The two that resisted, and what each one was

Both were chased to a named cause. Neither was in the plan.

**`tpms` — `precise` on the destination does not pin an inline
expression.** Two hypotheses died first and both deserved to: the cull
boundaries agree exactly (12,623 culled on both stacks, zero
disagreement), and every decimal literal in the corpus parses to the
same bits on all three stacks (26 of 26, `litprobe.py`), so `TAU =
6.28318530718` in the shared header is not the culprit either.

Bisecting put the boundary between `f` (identical) and `gx`
(differing). Three spellings of the same central difference, on
radeonsi:

| how `(A - level) - (B - level)` is written | radeonsi |
|---|---|
| argument bound to a local, results inline | differs |
| **results bound to `precise` locals** | **agrees** |
| fully inline — what the emitter wrote | differs |

Written inline, radeonsi cancels it to `A - B` and the rounding
changes. `precise` on the destination does not prevent that; `precise`
on the intermediates does. Which is the darkroom's own rule arrived at
from the other end — `shader.py` says *"never hand a compound
expression to a function the bake will rename. Bind it to a local
first."*

**`hyper` — the det library was missing `precise` on its own `fma`.**
`tools/firstdiff.py` instruments every `precise float` declaration in
an emitted plate to write itself to an output slot, runs it on two
stacks, and names the first slot whose bits differ. On `hyper` that was
`psiv_29 = det_acos(cpsiv_28)`, differing on all 4,096 samples while
its input agreed.

`det_acos` and `det_mod` were written as one-liners whose `fma` result
carried **no qualifier** — and an unqualified `fma` is single-rounded
on NVIDIA and iris and is not on radeonsi. The guarantee the whole
library rests on, left off two of the library's own functions.
Measured: `det_mod` on radeonsi differed from the qualified form on
27,871 of 65,536 inputs.

The fix is **hash-preserving on NVIDIA and iris** — both already
single-round an unqualified `fma`, so no `det_` hash moved on either,
`det_sin` still `27c0f355e6837dd5`. Every census in the darkroom was
taken on NVIDIA and remains valid. Fixed at source in
`gendetlib.py`; the template here was re-extracted and byte-identity
against the regenerated library still holds.

### Phase 4 — across the matrix

Planometer already does this. Emitted plates go through the ladder on
every proven stack.

**Done when:** an emitted positive produces one hash across radeonsi,
iris, NVIDIA and llvmpipe — the case that when this was written only
`collatz`, at 0.166% lit, managed.

**MET**, on all three emitted plates, at 16384², on NVIDIA + radeonsi
+ iris. llvmpipe is struck for the measured reason below. For scale
against the original bar: on the corrected bundle the *conversion*
path now gets 61 of 68 hand-written plates to one hash across those
same three cards, where before the correction exactly one plate
managed it.

#### MET on all three emitted plates at full size, 2026-08-22

Final state of this phase, measured last and stated first. Three
engine-emitted plates at **16384 × 16384** — the census's `full`
geometry, 268 megapixels, sixteen supertiles of 4096 at 256 passes —
on three cards from three vendors:

| plate | hash | lit |
|---|---|---|
| `hilbert` | `87c7744ece6e32d68e98449c4df3cce2` | 95.35% |
| `logz` | `b500ebc7735498ac8bc928f65087bff4` | 79.81% |
| `stdmap` | `38eec4663a4eb74a5552a74cae76f2cb` | 84.39% |

RTX 5060 Ti, RX 7600 on `radeonsi-aco`, Arc B580 on `iris`. One hash
each. Same emitted bundle on every box by sha256 —
`192c572fc614ebd8…`, stamped into each census file rather than
asserted.

`hilbert` is the sharp case: on the hand-written archive bundle it is
the **only plate in sixty-eight on which no two of those three cards
agree**, and the other six splits there are two-way (both Mesa cards on
one side). Three hashes hand-written, one hash emitted, same picture,
same three cards.

The rest of this section is how it got there, including two readings
that were wrong.

#### MET on one plate — and the first attempt was wrong

One correction to the criterion first: **llvmpipe is struck**, for the
measured reason in Phase 3. It cannot single-round `fma`, so requiring
it would make the bar unmeetable for a reason unrelated to this work.

`tools/determinism/bakeemitted.py` in the darkroom bakes a bundle from
emitted GLSL **without converting it** — the emitted region is
delimited, the usual conversion runs over the whole shader, and the
region is put back verbatim. The camera around it still converts. Two
variants are needed: `vs`/`fs` are `#version 330`, where `precise` is a
syntax error, so the unpinned emitted GLSL goes to the preview path and
the pinned one to compute.

Three plates chosen *because they already diverge*, at the `cpu` rung,
against a control of the same three from the registry baked the same
day by the same tool:

| plate | emitted | control |
|---|---|---|
| `hilbert` | **one hash on all three GPUs** | three different hashes |
| `logz` | NVIDIA = radeonsi, iris differs | NVIDIA = radeonsi, iris differs |
| `stdmap` | all three differ | all three differ |

**`hilbert` meets the bar.** An emitted positive produces one hash
across NVIDIA, radeonsi and iris where the hand-written plate produces
three. One of three, not a general fix — but the criterion asked for
one positive and this is one, with a control showing the original
fails on the same plate.

**The first attempt reported the opposite, and the error is the useful
part.** `bakeemitted` applied `cas_port` and stopped, where the
committed bundle's derivation ends with `port_fixed`. A float
compare-and-swap deposit accumulates through **non-associative
addition**, so the sum depends on the order warps arrive in — two
stacks then differ for a reason having nothing to do with the plate,
the camera, or anything this project can pin. The run measured warp
arrival order and reported it as a plate result. It also made every
`pixeldiff` conservation figure meaningless, since that tool reads the
buffer as integer counts.

A second thing fell out: the control's NVIDIA hashes reproduce the
**committed census values exactly**, so the det library corrections
made today are hash-preserving on NVIDIA at the full-render level, not
just per-function.

#### The residue was `fract`, and the fix had never compiled

Two readings of what remained were wrong before the right one. It was
not a cull — `cullcount.py` gave every early `return` an atomic
counter and found all five sites agreeing exactly, 574,767 survivors
on both stacks. It was not a moved pixel either: `depositdiff.py`,
eight stores at one site indexed by sample, found **0 pixels
differing** and 427 colours, with the plate's own `col` differing
before the camera scaled it.

Then four candidate fixes measured **exactly zero** in a row — vector
hoisting, routing `fract` through `det_fract`, pinning `vCol`, and the
reverted deposit-tail binding. Four zeroes is not four facts about the
plate; it is a reason to doubt the compilation.

`detbits.py`, which isolates one library function per column, found
it. `det_fract` — written as the spec defines it, `precise f =
floor(x); precise r = x - f;` — hashed **identically to the bare
builtin on iris**. That is impossible honestly: `floor` is exact and
bit-identical on all four stacks, and the subtraction is one IEEE
operation. The compiler was pattern-matching the identity and folding
it back into the instruction it was written to replace. A bitcast
round trip on the intermediate does not stop it; that was measured
too.

The builtin it folded back into is wrong: **iris rounds `fract`
toward zero** where `x - floor(x)` rounds to nearest — one ULP low,
never high, on 45.5% of `x ∈ (-0.5, 0)`, and on nothing outside that
range. Confirmed against exact rational arithmetic, 869 of 869 both
ways. Drafted for filing at
`docs/bug-reports/mesa-iris-fract-rounds-toward-zero.md` in the
darkroom.

Rebuilding `floor` from `float(int(x))` leaves no idiom to match and
gives one hash on NVIDIA, radeonsi, iris and llvmpipe. With that in
both the engine's `detpre` and the bake's own definition:

```
  reached the deposit on both : 1,149,528
  PIXEL differs  : 0 (0.0000% of live)
  COLOUR differs : 0 (0.0000% of live)
```

Zero, on 128× the samples of the run that found 427.

**The lesson worth keeping** is not about `fract`. A determinism fix
that measures *exactly* zero should be suspected of not having been
compiled, and tested in isolation — one function, hashed across
stacks — before the search moves on. Prefer a replacement built from a
different primitive over the textbook identity, because the textbook
identity is precisely what the peephole matches.

One camera fix was tried and **reverted**: binding every intermediate
in `px = ivec2(floor(win))`'s chain — the shape that broke `tpms` here
— changed the delta by exactly zero, and the cull counts later
explained why: nothing was crossing a bounds test at all.

Full record in the darkroom at
`docs/test-records/2026-08-22d-emitted-plates-through-the-ladder.md`.

### Phase 5 — adoption

Two routes, and they are not exclusive:

- **Retrofit.** Emitted GLSL replaces a hand-written plate's source in
  PrettyCloud. Changes the plate's hash, so it wants doing before works
  publish.
- **New plates authored as positives.** No retrofit, no hash churn, and
  the deterministic corpus grows from the new end.

**Done when:** one emitted plate is live in PrettyCloud and renders
byte-identically to the engine's own evaluation.

## Risks, and what this does not promise

**It does not promise the GPUs were wrong.** Phase 1 may find llvmpipe
is the outlier *and* the more accurate one, or the reverse, or that the
difference is below any meaningful threshold. The plan is built to find
out, not to confirm.

**Bit-identity across drivers may not be reachable for every
operation.** Some GLSL builtins have spec-permitted ULP latitude that
no amount of pinning removes short of reimplementing them — which is
what `det_*` does, at a cost in speed. If a construct cannot be pinned,
the honest outcome is refusal, and the language gets smaller.

**Coverage is not there.** 54 of 68 plates convert. Four are blocked on
two genuinely missing language features. A full deterministic corpus
needs those closed first, and that is language design, not plumbing.

**This makes the engine the source of truth for plate GLSL.** Today
PrettyCloud is canonical and the engine emits to its contract. Phase 5
inverts that for any plate it touches. That is a real architectural
commitment and it should be taken deliberately.

## Order of work

Phase 0 and Phase 1 first, and they are independent of everything after
them. Phase 1 turned out to need no change at all — the reference was
already there, and the work is using it rather than building it. Phase
0 is what makes any of this auditable by someone who trusts none of it,
and it is where the real effort sits.

**Phase 0 and Phase 1 are both done** (2026-08-22). Phase 1 was
answered in the darkroom rather than here, because `cascade` has no
positive and a positive would have been too coarse an instrument
anyway — see the note under Phase 1. The answer: no float32 stack is
meaningfully the accurate one, llvmpipe is not the CPU reference the
question assumed, and `det_*` rather than a chosen column is the way
out.

Next is **Phase 2**: route `emit.mjs` through the pinned set. Phase 0
left it a concrete starting list — six builtins the emitter can reach
today with no deterministic form behind them (`asin`, `sinh`, `cosh`,
`tanh`, `round`, `sign`), carried in `oracle.mjs` as `UNCOVERED` so the
decision to grow a form or refuse them is made from data.
