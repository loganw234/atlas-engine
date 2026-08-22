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
([emit.mjs:581](../core/emit.mjs)). Six reachable builtins have **no
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
