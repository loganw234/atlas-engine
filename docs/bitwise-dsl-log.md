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

## Stages 6-7 — both automata rewritten: DONE

Each rewrite was **proved equivalent in JavaScript before the positive
was touched**, exhaustively, not by sampling:

```
  Rule 30   all 65,536 chunks x 4 (below, above) corners = 262,144 cases
  Rule 110  all 16,384 chunks x 4                        =  65,536 cases
  disagreeing: 0 and 0
```

The word-parallel forms, over a chunk W with the cell below and the
cell above:

```
  Rule 30    l = ((W << 1) | below) & 0xFFFF
             r = (W >> 1) | (above << 15)
             new = (l ^ (W | r)) & 0xFFFF

  Rule 110   l = ((W << 1) | below) & 0x3FFF      (14-cell chunks)
             r = (W >> 1) | (above << 13)
             new = ((W | r) & ~(l & W & r)) & 0x3FFF
```

### The result

`cpu` census, RTX 5060 Ti, against the 610.5s baseline this whole
sequence started from:

```
                       baseline   before bits    after bits
  universal              416.4s        105.6s          8.1s    51.41x
  rule30                 110.0s         44.0s          7.0s    15.71x
  whole census           610.5s        211.1s         76.6s     7.97x
```

**Zero hashes moved.** Not two, not "moved but agreed" - zero. The
word-parallel form computes the same function over values that are all
exact integers, so the same float reaches the accumulator either way.
The exhaustive proofs predicted precisely this, which is why they were
run first.

### The anti-unroll apparatus dissolved

`universal` carried the count in its state, an `until`, and a bound
written as 4096 instead of 14; `rule30` had gained the same three
hours earlier. All of it existed because fourteen or sixteen copies
inside a loop of a million met NVIDIA's `too many instructions`.

There is no inner loop left to unroll. The heuristic is not satisfied,
it is out of the picture - and `rule30`'s emitted shape function came
out 2.1% SMALLER despite gaining a whole vocabulary.

### What went wrong on the way

* `const P = bits(w.prev) >> 15` shadowed the lever namespace and
  emitted as `P used bare`, which reads like a missing construct
  rather than a name clash. Renamed blw/wrd/abv.
* `const B = { acc: ... }` - a stand-in for the orbit result it
  replaced - is an object literal, and the emitter admits those only
  inside known calls. It became a plain const, which is what it should
  have been.

## Stage 8 — the gate that was missing, found the hard way

Not planned, and the most useful thing in this log.

Improving the CSE cache's invalidation (a separate optimisation, same
day) reused a temporary across `} else {`: the net brace change on
that line is zero, so entries bound in the branch that had just closed
survived into the branch that opened. **Fifteen plates failed to
bake**, and **all five gates passed**.

They passed because none of them compiles anything. `compile-pinned`
EMITS GLSL and never hands it to a driver, so a scoping error was
invisible to CI by construction - it took a GPU bake, at the end of a
chain, on another machine, hours later.

`tools/verify-scope.mjs` closes it: a scope tracker over the narrow
shape the emitter produces, over-permissive where unsure so it can
miss a fault but never invent one. Verified against the real
regression rather than asserted - reintroduce the net-brace counting
and it flags exactly the fifteen plates that failed to bake, while
`compile-pinned` still reports OK.

**It ships with a self-test, which found two defects in the checker
itself before it found anything else.** The file-scope pre-pass used
`^\s*` and swept every indented temporary into file scope, so the gate
reported 142 clean shaders while seeing nothing at all; and the
declaration pattern anchored at `^` with no allowance for indentation,
so it matched no emitted declaration. Each hid the other - remove
either alone and it still looks correct. Without the self-test this
would have been committed as a gate that passes because it checks
nothing, which is worse than no gate, and believed.

The general lesson, since it will recur: every optimisation in this
sequence edits emitted GLSL STRUCTURE, and the only thing standing
between a structural bug and a broken bundle was that somebody
happened to bake on a machine with a card.

### Two plate headers are now wrong

Both say the vocabulary has no bits. `rule30.pos.mjs`: *"THE CARRIED
STATE IS A ROW OF BITS AND THE VOCABULARY HAS NO BITS."*
`universal.pos.mjs`: *"the shader ... steps thirty-two cells at a time
with shifts, ands and ors, which is the one thing the vocabulary
cannot say: it has no bitwise operators, not even in its lexer."*

They were true when written and are now the most misleading lines in
either file. Rewriting them is part of this work, not a tidy-up.

**Done, and two more besides.** `rule30` and `universal` say what they
used to do, what they do now, and what was measured. `rulespace` and
`collatz` carried the same claim and are NOT rewritten - each now says
so and why: `rulespace` because it draws all 256 rules so the rule is
a runtime value, making it eight masks plus a popcount for about 2x
rather than three operations for 16x; `collatz` because it costs 0.3s
at the cpu rung and the rewrite would spend a hash movement to buy
nothing. `docs/CONVERSION.md` told every future author the subset "has
no uint, no bitwise operators and no `hashu`" - one third of that is
now false and it is the document authors are pointed at first.

## Where it stands

```
  cpu census, RTX 5060 Ti      610.5s -> 76.6s     7.97x
  tiny census, 4 columns       68/68 agreeing on all four
  quick census, RTX 5060 Ti    89.8 min, complete=True, 0 skipped
```

That `quick` result is the first complete one this project has had:
the previous run took 206.6 minutes with `universal` excluded, so it
could not be `complete` by definition.

Still open: `rulespace` (~2x, scoped above), `threebody`'s remaining
7 `det_div` and 3 `det_sqrt` per step, and whether `1.0/Math.sqrt(x)`
should map to `det_isqrt` - a peephole, not a keyword, and one that
WOULD move hashes.
