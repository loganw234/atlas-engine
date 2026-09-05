# What the constants oracle found

Phase 0 of `docs/DETERMINISM.md`, done 2026-08-22. Five findings, and
one of them changed the design of the checker that found it.

## What was built

| file | what it is |
|---|---|
| `core/constants.json` | the record: 36 constants and 5 approximations, each with bits, exact decimal, provenance, domain and bound |
| `tools/seed-constants.py` | derives the record. Its default mode **cannot write** — it diffs and exits 1 |
| `tools/verify-constants.py` | the checker: mpmath at 50 digits, three levels, plus seal / upstream / JS cross-checks |
| `tools/oracle.mjs` | the JavaScript side — the only way the engine may reach a constant |
| `tools/verify-negative-controls.py` | nine deliberate corruptions the checker must catch |

Run it:

```bash
python tools/verify-constants.py --samples 4001
```

```bash
python tools/verify-negative-controls.py
```

All 36 bit patterns match the darkroom's deployed `gendetlib.py`, so
this measures the library that is actually running, not a copy of it.

## The measurements

Swept at 8001 points per domain. "fit" is the polynomial evaluated
exactly at 50 digits with the float32 coefficients; "chain" is the same
polynomial as the GLSL runs it, float32 with `fma`, rounded once per
step.

| kernel | domain | fit abs | chain ulp | chain rel |
|---|---|---|---|---|
| `sin_kernel` | ±π/4 | 5.63e-09 | 0.64 | 6.45e-08 |
| `cos_kernel` | ±π/4 | 1.27e-10 | 1.19 | 9.92e-08 |
| `exp2_kernel` | ±0.5 | 1.36e-08 | 0.90 | 7.58e-08 |
| `atanh_series` | ±0.1716 | 6.06e-10 | 1.40 | 1.13e-07 |
| `atan_kernel` | [0, 1] | 1.70e-06 | **378.87** | **2.28e-05** |

Four of the five sit near or under one ulp. The fifth does not.

## 1. `det_sin` degrades near the top of its own domain

`TWO_OVER_PI` is the float32 nearest 2/π, off the real value by
**4.034e-8** relative. The reduction computes `k` as the nearest
integer to `x · float32(2/π)`, not to `x · (2/π)`, and at the top of
the admitted domain those differ by up to **0.169**.

So the residual reaches 0.669 instead of 0.5, and the reduced argument
reaches **|r| = 1.0498** — 34% outside the ±π/4 interval the
coefficients were fitted on.

Measured cost, over the whole admitted domain:

| | worst `|det_sin − sin|` |
|---|---|
| ordinary magnitudes (x ≲ 10⁵) | ~3e-08, sub-ulp |
| at the domain limit (x ≈ 6.58e6) | **1.01e-06**, ≈17 ulp |

**This is not a parity break, and the distinction is the whole point of
the library.** Every step is float32 with `fma` and `precise`, so every
conforming driver computes the same wide `r` and the same degraded
answer. Bits still match everywhere. What degrades is accuracy, only
above about 10⁶, and the displacement scales linearly with `x` — at
10⁵ it is 0.0026 and invisible.

The detlib header says "nothing this camera renders comes near the
limit", which is very likely true. The finding is that the domain
constant bounds *determinism*, not *accuracy*, and the two were not
distinguished.

The first version of this check asserted `|r| ≤ π/4` and failed. The
assertion was wrong, not the constant: what `SINCOS_LIM` actually
guarantees is that the reduction stays **bounded** (`|r| < π/2`) and
**int32-safe** (`|k| < 2³¹`), and that is what the checker now asserts,
with the accuracy figure recorded beside it rather than asserted away.

## 2. The atan kernel is a genuine minimax — and that is what costs it

Six alternating extrema, evenness **0.962**, with the fit error
**29×** above the float32 rounding floor. The darkroom's comment reads
"atan – odd minimax on [0, 1]" and names no source; equioscillation
substantiates the claim without one. **A measured property standing in
for a citation nobody can open.**

Minimax *on absolute error* is the criterion, and the price is paid in
relative error where the value is small:

| r | error | in ulp | relative |
|---|---|---|---|
| 1e-06 | 2.27e-11 | 200 | 2.28e-05 |
| 0.01 | 2.27e-07 | 244 | 2.27e-05 |
| 0.1 | 1.63e-06 | 218 | 1.63e-05 |
| 0.5 | 1.20e-06 | 40 | 2.58e-06 |
| 1.0 | 1.71e-06 | 29 | 2.17e-06 |

The relative floor is `|AT0 − 1| = 2.27e-05`, and no evaluation order
removes it — it is what the fit chose.

**Downstream:** `det_acos(x) = det_atan(sqrt(1−x²), x)` inherits it as
x → 1, where the ratio fed to the kernel goes to zero. Measured with
exact sqrt and divide, so this is the kernel's contribution alone:
relative error rises to 2.28e-05 at x = 0.99999, while **absolute error
stays under 1.6e-06 everywhere**.

For the practice's actual use this is fine. Plates colour by angle via
`pal(atan(z.y, z.x)/TAU + 0.5, …)`, and 1.7e-06 of angle is 2.7e-07 of
palette position. It is recorded because a library called deterministic
camera *math* should say where its accuracy went, not because a plate
is visibly wrong.

## 3. The π/2 split carries 55 bits, not 72

Three float32 limbs could hold ~72 bits of π/2. This split is seeded
from the **float64** π/2, so the residual it splits is already wrong at
the 2⁻⁵³ level and no number of limbs recovers it.

Measured: **55 bits**, relative error 6.123e-17. At the top of the
domain that contributes 2.568e-10 of reduction error — three orders
under finding 1, and harmless. Recorded because the generator says
nothing about it, and "three limbs" reads as a precision claim that
the derivation does not support.

## 4. Three "minimax" claims are inconclusive, not false

The first version of this checker reported sin, cos and exp2 as **NOT
SUPPORTED**: their errors do not equioscillate under absolute,
relative, or the natural polynomial weighting.

That verdict was wrong to publish. The coefficients in the record are
float32; whatever fitted them worked in higher precision, and rounding
each to float32 perturbs the finished error by an amount that has
nothing to do with the quality of the fit. Measured:

| kernel | rounding floor | total error | ratio |
|---|---|---|---|
| `sin_kernel` | 3.75e-09 | 5.63e-09 | 1.5× |
| `cos_kernel` | 7.23e-10 | 1.27e-10 | 0.2× |
| `exp2_kernel` | 1.70e-08 | 1.36e-08 | 0.8× |
| `atan_kernel` | 5.9e-08 | 1.70e-06 | **29×** |

Equioscillation cannot survive a perturbation its own size. For the
three cephes kernels its absence says nothing, and the checker now
reports **INCONCLUSIVE** with the ratio. Only atan clears the floor,
and only atan gets a verdict.

`cos_kernel` is the striking one: its total error is **five times
smaller** than a half-ulp nudge to a single coefficient. Whatever
produced those coefficients was aware of the float32 rounding, or got
lucky.

The floor also had a bug worth recording: it originally nudged every
coefficient including `NHALF`, which is exactly −0.5 and has no
rounding error at all. That inflated the cos floor to 1.9e-08 — 150×
the kernel's whole error, a nonsense number. Only *fitted* constants
are nudged now.

## 5. Behavioural bounds cannot see a one-ulp typo

Found by negative control, not by inspection. `AT1` moved one ulp with
its decimal kept consistent **passed all three levels**:

- Level 1 — provenance intact.
- Level 2 — a fitted coefficient cannot be re-derived. That is what
  fitted means.
- Level 3 — one ulp of `AT1` shifts atan by 3e-08, **sixty times under**
  a bound of 1.9e-06.

And the bound is not at fault. A bound loose enough to be a promise
about a whole domain cannot also be a tripwire for a typo; tightening
it until it was would break on ordinary re-measurement.

So the gap is closed structurally, with two checks that do not depend
on the value being derivable:

- **a seal** — sha256 over every bit pattern, pinned in the record,
  re-pinnable only by running the seeder on purpose;
- **an upstream comparison** — all 36 values checked against the
  darkroom's `gendetlib.py`, a different repository and a different
  generator. A missing upstream is a **failure**, not a skip.

All nine controls are now caught, each at the level that claims to
catch it.

## Gaps this opens for Phase 2

`core/emit.mjs` maps `Math.*` to GLSL builtins at one line
([emit.mjs:1184](../core/emit.mjs)). Six reachable builtins have **no
deterministic form** in the det library:

```
asin  sinh  cosh  tanh  round  sign
```

Phase 2 must grow a form or refuse them. `tools/oracle.mjs` carries
this list as `UNCOVERED` so the decision is made from data rather than
discovered when a plate emits something unpinned.

## What Phase 0 does not vouch for

The record says so in its own `scope` field, and `oracle.scope()`
returns it, so it travels with the numbers:

- Phase 0 covers the **constants** and the **polynomials built from
  them**, given exact inputs over the stated domain.
- It does **not** cover the surrounding machinery: the argument
  reduction in `det_sincos` (except as measured in finding 1), the
  `det_div` inside `det_log2` and `det_atan`, the Newton iterations in
  `det_recip` and `det_sqrt`, or the exponent assembly in `det_exp2`
  and `det_log2`.

Those are whole-function properties and they belong to Phase 2, when
the det library moves into the engine and can be emulated end to end.
Said here so the record cannot be read as claiming more than it
measured.

## 2026-08-27 — provenance closed from sources in hand

Written by the citations program, round 2. The research is in
`atlas-darkroom/docs/sources/dossiers/det-kernels-minimax.md`; this
section says what moved in `core/constants.json` and — more usefully —
what deliberately did not. **No bit pattern, decimal, coefficient,
domain or bound was touched.** `verify-constants.py` prints byte-for-byte
the report it printed before the edit.

### What flipped

Eighteen fitted coefficients stopped citing themselves and started
citing a source somebody opened.

| set | was | is |
|---|---|---|
| `SS1`–`SS3`, `CC1`–`CC3` | "cephes single-precision sin/cos kernel (Moshier) … cited from ubiquity, not from a copy of `sinf.c` in hand" | Moshier, *Cephes Mathematical Library*, `single/sinf.c`, Release 2.2 (June 1992), the `sincof[]`/`coscof[]` arrays |
| `E2P0`–`E2P5` | the same admission, naming the same wrong file | Moshier, `single/exp2f.c`, Release 2.2, `static float P[]` |
| `AT0`–`AT5` | "unattributed … no attribution I can stand behind, so none is asserted" | Hastings, *Approximations for Digital Computers*, RAND / Princeton, 1955, **Sheet 11, p. 135**, C1–C11 |

Each of the eighteen gained a `copy_checked` field naming the copies
actually read and when: two independent mirrors of the Cephes 2.2
single-precision distribution for the twelve, page images of a scanned
copy of Hastings for the six. All eighteen match **digit for digit and
on the exact decimal expansion** — 12/12 and 6/6, on both fields.

Three corroborations the record could not previously make are now in it.
Cephes' evaluation *form* and *domain* match the op lists `sin_kernel`,
`cos_kernel` and `exp2_kernel` already state. Hastings' `-1 ≤ X ≤ 1` is
`atan_kernel`'s `[0, 1]` by oddness. And cephes `atanf.c` — the obvious
guess for `AT0`–`AT5` — is **ruled out at the source rather than from
memory**: four terms, a different interval, an implicit leading 1.

`E2P5` gained a note of its own. It shares `LN2`'s bit pattern
`0x3F317218` by **coincidence, not derivation** — cephes' fitted leading
coefficient happens to round to the same float32 as ln 2, and the two
stay separate entries because their provenance is separate.

### What deliberately did not flip

**1. `verified_against_source` is still `false` on all eighteen.** Not
an oversight and not modesty. In this record that flag means *level 2
re-derives the value on every run*, and level 1 enforces exactly that:

```
if c["kind"] == "fitted" and src.get("verified_against_source"):
    "claims a verified source but is fitted - if that is true,
     say which copy was checked"
```

Setting it would fail LEVEL 1 eighteen times. It would also void
negative control 7, `lie_about_verification(E2P3)`, whose entire
mutation is to set that flag: on a record where it is already set, the
control mutates nothing and catches nothing. So the flag stays where the
checker can still use it, the copy that *was* checked is named in
`copy_checked` — which is what level 1's own message asks for — and the
archival match is carried in prose. Moving the flag needs a change to
`verify-constants.py` **and** a replacement for control 7. That is an
operator's decision, not a citation pass's.

**2. The `minimax` claims stand exactly where finding 4 left them.** The
words `minimax`, `Remes` and `Remez` appear **nowhere** in `sinf.c` or
`exp2f.c`. The source establishes the values, the form and the domain,
and asserts a *measured* peak error — not an optimality proof. So the
archival lookup upgrades transcription and leaves the characterisation
on the equioscillation test, which still reports **INCONCLUSIVE** for
sin, cos and exp2 and **SUPPORTED** only for atan. The record and the
source now agree about what is *not* known, which is the stronger
outcome.

Hastings carries the same caveat from the other side: the preface frames
the work as best approximation in the sense of Chebyshev *and* describes
the investigation as numerical and empirical. A graphically tuned
Chebyshev fit, not a Remez computation with a certificate.
`atan_kernel`'s 29× clearance over the rounding floor remains the
load-bearing evidence; the citation does not replace it.

### The two drifts — recorded, not reconciled

`UPSTREAM fitted vs darkroom` **FAILS with 19 problems**, and was
failing before this pass. It is one gate over two independent drifts:

| | this record (sealed) | darkroom `tools/determinism/gendetlib.py` |
|---|---|---|
| **atan**, refit 2026-08-25 | `AT0`–`AT5`, Hastings, an **absolute**-error fit | `ATQ0`–`ATQ7`, `atan(r) = r + r·z·q(z)`, refitted for **relative** error |
| **reduction**, adopted 2026-08-24 | `PIO2_1..3`, three limbs, `SINCOS_LIM` = 6 588 397 (2²²·π/2) | `PIO2_1..4`, **four** limbs with the low 15 bits of the first three zeroed, `SINCOS_LIM` = 51 471.85 (2¹⁵·π/2) |

19 = three limb mismatches + `SINCOS_LIM` + six `AT*` with no upstream
+ one `PIO2_4` and eight `ATQ*` that upstream has and the record does
not.

Two things worth saying plainly. The darkroom's `PIO2_1..4` *are* the
four constants the dossier verified against Jason Davies, "Accurate
sin/cos/tan on Tenstorrent" (2026-02-23) — `0x3FC90000`, `0x39FD8000`,
`0x34A88000`, `0x2E85A309`, 4/4 — so **those four have no entry in this
record at all**; they exist only upstream, and nothing here needed
their provenance. And the record still calls the four-limb form a
prototype while the deployed darkroom has adopted it.

Reconciling either side moves bit patterns, breaks the seal and retires
the census bundle. That is not a citation decision. It is recorded here
and in the `note` fields of `PIO2_1`, `PIO2_2`, `PIO2_3`, `SINCOS_LIM`
and `AT0`–`AT5`, so the next reader finds the reason rather than the
absence.

### The seal did not move — and the seeder now says it did

`digest_of()` hashes `name:BITS` and nothing else, so prose is outside
the seal by construction. Recomputed the checker's way after the edit:
unchanged at `sha256:9c9d3f12…`, **SEAL PASS**. Nothing needed
re-pinning and `seed-constants.py` was never run in a writing mode.

**Do not run `seed-constants.py --force` to quiet it.** The seeder
carries its own copy of the provenance strings and now reports 65
differences — all 65 prose, none numeric — under the advice *"--force to
accept this script's version"*. Taking that advice reverts every
citation in this section. Re-syncing means editing `CEPHES_SIN`,
`CEPHES_EXP2` and `ATAN_SRC` in `tools/seed-constants.py` to match the
record, which was out of scope for this pass and is the one remaining
piece of work it leaves behind.

### Checker results

| check | before the edit | after |
|---|---|---|
| LEVEL 1 provenance | PASS | PASS |
| LEVEL 2 transcription | PASS | PASS |
| SEAL bit patterns | PASS | PASS, same digest |
| UPSTREAM fitted vs darkroom | **FAIL (19)** | **FAIL (19)**, identical list |
| JS side `oracle.mjs` | PASS | PASS |
| derived properties | 3 of 3 ok | 3 of 3 ok |
| LEVEL 3 bounds | every kernel inside its promise | unchanged |

`verify-negative-controls.py` **cannot run at all**, and could not
before this pass either. Its first gate requires an untouched copy of
the record to make the checker exit 0; the upstream drift makes it exit
1, so the script prints `[BROKEN] untouched copy still passes (rc=1)`
and returns 2 **without running a single control**. All nine have been
dark for as long as the upstream gate has been failing — the drift's
real cost, and it is larger than the mismatch list suggests. The two
controls that touch LEVEL 1, the only level a provenance edit could
weaken, were re-run in isolation against the edited record and both are
still caught: `SS1: missing ['source']` and `E2P3: claims a verified
source but is fitted`.

### Stale lines noticed in passing

- `emit.mjs:581` for the `Math.*` map is **corrected to `emit.mjs:1184`**
  above, line number verified in the current file.
- That same paragraph still lists **six** builtins with no deterministic
  form. `oracle.mjs`'s `UNCOVERED` is down to `round` and `sign`;
  `asin`, `sinh`, `cosh` and `tanh` left it on 2026-08-22. Left as
  written — correcting a claim is not a pointer fix.
- *"All 36 bit patterns match the darkroom's deployed `gendetlib.py`"*
  near the top of this document is **no longer true**, and the count is
  37 (36 with upstream counterparts; `LN2` is engine-only). See the
  drift table. Left as written, for the same reason.

## 2026-09-04 - the record catches up with the deployed library

The two drifts recorded above are reconciled, and the way they were
reconciled is the part worth keeping.

### What moved, and where it came from

| | was (sealed 2026-08-22, seal `9c9d3f12…`) | is (seal `9983848e…`) |
|---|---|---|
| pi/2 split | three full-precision limbs seeded from float64 pi/2, `PIO2_1..3` | four limbs seeded from pi/2 at fifty digits, the first three with their low 15 mantissa bits cleared, `PIO2_1..4` |
| `SINCOS_LIM` | 6 588 397 (2²²·pi/2) | 51 471.85 (2¹⁵·pi/2, rounded down) |
| atan kernel | `AT0`–`AT5`, Hastings 1955, an absolute-error fit | `ATQ0`–`ATQ7`, fitatan.py 2026-08-25, `atan(r) = r + r·z·q(z)`, a relative-error fit |
| `LN2` | engine-only | matched upstream too: gendetlib.py carries it since 2026-08-25 |
| constants | 37 | 40, and `UPSTREAM fitted vs darkroom` matches all 40 |

Every value is the darkroom generator's, taken the way the seeder has
always taken values - by re-deriving them in its own code, not by
reading the record - and `verify-constants.py` re-derives the four
limbs independently at fifty digits, through float64 on the way to
float32 exactly as `gendetlib.py`'s `f32(float(rem))` does, so a double
rounding there is reproduced rather than idealised away.

### The library ships unfused, so the record models two roundings

The darkroom's generator has, since 2026-08-24, rewritten every `fma()`
in its source to `((a) * (b) + (c))` before writing `detlib.glsl`,
because five of eleven measured stacks collapse the fused form whatever
`precise` says and the unfused form is the one they all compute
identically. Two consequences for this repository:

- `tools/gen-detlib.mjs` could no longer be byte-identical to the
  deployed library from the fma-form template, whatever the constants
  said. `core/unfuse.mjs` is a port of `bakearchive.unfuse` - same
  innermost-first order, same parenthesis matching, same top-level
  comma split - and the byte comparison is the proof of the port:
  **IDENTICAL**, 27,435 characters, 56 rewrites on both sides.
  `compile-pinned.mjs` applies the same pass, so `build/pinned/detlib.glsl`
  is the deployed library now rather than a fused cousin of it.
- Level 3's chain error was modelled as one rounding per Horner step.
  The shader performs two. Every `eval` in the record is now spelled
  as the shipped text has it - a `mul` and an `add` per step - and the
  bounds were re-measured against that chain:

  | kernel | chain ulp, fused model | chain ulp, unfused (measured) | bound |
  |---|---|---|---|
  | sin_kernel | 0.64 | 0.639 | 0.71 |
  | cos_kernel | (recorded 1.19) | 1.185 | 1.40 |
  | exp2_kernel | 1.00 | 1.047 | 1.20 |
  | atanh_series | (recorded 1.40) | 1.404 | 1.60 |
  | atan_kernel | new kernel | 1.001 | 1.20 |

  The fit errors are unchanged where the kernels are unchanged, because
  the exact evaluation ignores rounding, and the equioscillation
  verdicts stand where they stood: INCONCLUSIVE for sin, cos and exp2.
  atan is no longer judged at all - its provenance makes no optimality
  claim, and the checker keys on the word.

### The derived properties, re-stated for the four-limb split

- the split carries **61 bits** of pi/2 (relative error 1.2e-18),
  against the 55 the float64-seeded three-limb split carried;
- each of the first three limbs has its low 15 bits clear, and every
  one of the 98,301 products `k * limb` for `|k| < 2¹⁵` came back exact
  through the same `mul32` the chain uses - which is the whole reason
  the reduction can run on a multiply and an add per stage;
- over `|x| <= SINCOS_LIM` the reduction, modelled unfused, stays
  bounded and int32-safe, and the displacement `TWO_OVER_PI`'s own
  rounding puts into `k` is reported as a number.

### The controls run again

`verify-negative-controls.py` had been dark since the upstream gate
first failed: its first step demands an untouched copy of the record
pass, and none could. With the gate green all nine controls run and
all nine are caught at the level that claims to catch them. Two
followed the record: the fitted-coefficient control moves `ATQ1`
rather than `AT1`, and the Horner-swap control trades the constants of
two adjacent `add` steps, since the add of each unfused pair is where
the coefficient lives.

### And the seeder agrees with the record again

The sixty-five prose differences `seed-constants.py` reported after the
citations round are gone: its provenance texts are the record's,
verbatim, with a note saying that keeping them in step by hand is the
only honest way for a file that is not allowed to read the record.
`seed-constants.py` in its default mode reports no drift.
