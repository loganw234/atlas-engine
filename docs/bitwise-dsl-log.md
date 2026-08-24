# Bitwise operators in the walk DSL — working log

*Started 2026-08-24. A running record, kept as the work happens rather
than written up afterwards, so the dead ends are visible with the
rest.*

---

## Why

`universal` and `rule30` are **69% of a cpu census** — 149.6s of
216.9s after four emitter optimisations took the whole census from
610.5s. They are the same family: Rule 110 and Rule 30, both
P-complete, so no generation can be skipped and no point can borrow
another point's work without breaking the order-independence the
deposit model rests on. Every optimisation so far worked by finding
arithmetic that did not need to be deterministic. Their inner loops are
now floors, multiplies by exact reciprocals, and fma. There is nothing
left in them that is overkill.

What remains is a REPRESENTATION change. Both loops are boolean logic
emulated in float arithmetic, one cell at a time:

```
  Rule 110   new = (c | r) & ~(l & c & r)     14 iterations per step
  Rule 30    new = l ^ (c | r)                16 iterations per step
```

written as `(cb + rb - cb*rb) * (1 - lb*cb*rb)` and
`(l + o - 2*l*o)`. As word-parallel bit operations each is ONE
operation for all fourteen or sixteen cells.

`rule30.pos.mjs`'s own header says so plainly, and is the reason to
believe this is the right change rather than a clever one:

> THE CARRIED STATE IS A ROW OF BITS AND THE VOCABULARY HAS NO BITS.
> The collatz idiom carries it: up to 512 cells ride as thirty-two
> exact small floats of sixteen cells each... Everything stays an exact
> integer under 2^24 on both evaluators, so the arithmetic below IS the
> shader's uint arithmetic, wrap included. **The rule is stated as
> arithmetic rather than as bit operations.**

The author met this wall and routed around it. The invariant they state
- every value an exact integer under 2^24 - is also exactly what makes
bit operations safe here.

## The determinism argument

Integer arithmetic has **no ULP latitude**. The entire `det_` library
exists because GLSL permits error on float operations; `&`, `|`, `^`,
`~` on a 32-bit integer are exact on every conforming implementation
by definition. So this direction makes the plates MORE determinable,
not less - there is no det_ form to write because none is needed.

The risk is not accuracy, it is AGREEMENT BETWEEN THE TWO EVALUATORS.
The CPU evaluator runs the walk's actual JavaScript (`measure.mjs`
`evaluate` calls `pos.walk` directly), so JS semantics are the
reference and the emitted GLSL must match them. JS bitwise operators
coerce through ToInt32 and yield signed 32-bit; GLSL `int` is signed
32-bit. They agree - with caveats that Stage 0 exists to pin down.

## Known hazards, before writing anything

* **Shift count.** JS masks it to 5 bits, so `x << 32 === x << 0`.
  GLSL calls a shift >= the bit width undefined. Any shift support must
  bound the count, and a literal count is the only kind that can be
  checked at emit time.
* **Signed left-shift overflow.** JS wraps in int32. GLSL leaves signed
  overflow undefined. Under the plates' own < 2^24 invariant this
  cannot arise, but the emitter cannot prove that invariant.
* **`>>` on negatives.** Arithmetic in both, but the plates never form
  a negative here, and it is one more thing not to rely on.
* **`rule30` already broke once from a SMALLER loop body.** Removing
  its det_div calls tipped NVIDIA's unroller into taking a 32 x 16
  nest and the link failed with `too many instructions`. Bitwise Rule
  30 shrinks that body by an order of magnitude, which is the same
  direction. The anti-unroll story has to be part of this work, not a
  follow-up.

## Stages

0. **Prove the premise.** JS and GLSL bitwise results identical over
   the value range these plates use. No DSL changes until this passes.
1. Lexer and parser: `&` `|` `^` `~` and possibly shifts.
2. Emitter: type rules, and a refusal with a good message on floats.
3. Float to int and back, since the DSL has no conversion today.
4. `verify-pinned` teaches: these need no det_ form.
5. CPU/GPU agreement on a positive that exercises them.
6. Rewrite `rule30`'s inner loop; measure.
7. `universal` if 6 pays.

---

## Stage 0 — proving the premise: PASSED

A compute shader doing `&`, `|`, `^`, `~`, `<<`, `>>` over 4,096 int
pairs, read back and compared against numpy int32 - which follows the
same two's-complement 32-bit rules JS's ToInt32 does. Values chosen to
cover the plates' own range densely and the edges besides: 1,024 each
from `[0, 2^24)`, `[0, 2^16)` and `[0, 2^31)`, plus a fixed row of
0, 1, 2, 255, 65535, 2^23, 2^24-1, 2^24, 2^30, 2^31-1.

Shift counts masked to `& 7`, so 0-7 and always valid on both sides -
which is also the only shift form the DSL will accept, for the reason
in the hazards above.

```
  RTX 5060 Ti   & | ^ ~ << >>   6/6 identical on 4096/4096
  GTX 1080      & | ^ ~ << >>   6/6 identical
  RX 7600       & | ^ ~ << >>   6/6 identical
  Arc B580      & | ^ ~ << >>   6/6 identical

  within 0 <= v < 2^24 (2,766 rows): & | ^ ~ identical on all four
```

Four columns, two vendors, three driver families. **The premise
holds**, and it holds outside the invariant as well as inside it,
which means the emitter's inability to prove `< 2^24` is not by itself
a correctness problem for the logical operators. Shifts remain the
narrow case and stay bounded by a literal.

Reproduce: `<scratch>/bitspike.py [dev]`. Note the script must not sit
in a directory holding a module that shadows a stdlib one - `~/` on
the bench box has one and the import error it produces
(`ctypes.util` / `find_library`) looks nothing like the cause.

## Stages 1-3 — lexer, parser, emitter, the door: DONE

**Lexer.** `&` `|` `^` `~` `<<` `>>` added to `PUNCT`, with the
two-character pair placed in the two-character group. That ordering is
load-bearing: the matcher takes the first hit, so `<<` offered after
`<` would lex a shift as two comparisons.

**Parser.** Inserted at JavaScript's precedence, not a tidier one:

```
  orE (||) -> andE (&&) -> bOrE (|) -> bXorE (^) -> bAndE (&)
           -> cmpE -> shE (<< >>) -> addE -> mulE -> unE (- ! ~)
```

The CPU evaluator runs the walk's actual JavaScript, so a walk that
parsed differently here than the language it is written in would agree
with neither evaluator. `~` joins unary.

**Emitter.** `& | ^` take two ints and give an int. `~` takes an int.
No `det_` form for any of them, because there is no ULP latitude to
pin - which is the whole reason that library exists for floats.

Floats are REFUSED, not coerced: a silent conversion is how a walk
comes to mean something other than its own source.

Shifts take a **literal count 0-31**. JS masks the count to five bits
so `x << 32 === x << 0`; GLSL calls a shift at or past the width
undefined. They agree only in range, and a literal is the only kind
the emitter can check.

**The door.** `bits(x)` is the one crossing into the integer domain -
`int(x)` in GLSL, `x | 0` in JS, identical while |x| < 2^31 against
the plates' own "exact integer under 2^24". Coming back needs no door:
`asFloat` already emits `float(i)`, and on the JS side an int IS a
number.

### What went wrong on the way

* The test harness built its walk with `new Function`, which
  stringifies as `function anonymous(...)`. `emitWalk` reads
  `pos.walk.toString()` and parses it, so every case failed on
  `expected (, got function` - a harness fault reported as fifteen
  emitter faults. Walks are arrows; the harness builds one now.
* The shift-count check tested `Number.isInteger(n.r.v)` and refused
  every valid shift. The lexer keeps a literal as the **source slice**,
  a string, so the value has to be read out rather than tested in
  place. Caught by the new gate on its first run, which is the whole
  argument for writing the gate before the plate.

### The gate

`tools/verify-bitwise.mjs`, wired into `gates.yml`. Sixteen checks:
four on precedence against JS, five on refusals (float operands, a
count of 32, a negative count, a non-literal count), six that valid
forms emit and carry no `det_` wrapper, and one that the JS reference
values are what the operators say - so a future precedence change
fails here rather than in a census four hours later.

All five gates green, including the four that predate this.

## Stage 6 — rule30's inner loop

*(next)*
