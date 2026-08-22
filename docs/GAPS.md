# Where the notation stops

The survey of the classic stratum was meant to draw the language's
boundary by trying to say every plate in it. It found exactly one
thing the notation cannot say, and found it twice, in two plates that
have nothing else in common. Everything else in all sixty-odd plates
translated, and the two blocked plates translate completely apart from
this.

## The gap: randomness shared between points

A positive has two kinds of randomness today.

**The stream** is the point's own consumable budget. `s.u()` answers
differently for every point, which is what stochastic texture wants.

**The address** is pure: the same address answers the same for every
point that ever asks, which is what structure wants. But an `Address`
is only reachable through `s.descend`, whose depth comes from
`s.depth(...)`, a per-point draw. There is no way to hold an address
that the artist names directly.

So there is no way to write **a value that is the same for every point
but keyed to something other than a descent** - a world constant, an
ensemble, a per-frame shift. Two plates need exactly that.

### XLIX Diffraction wants one shift per frame

Every arm reads

```glsl
qs = fract(q + vec2(u2f(fh), u2f(hashu(fh))))
```

a Cranley-Patterson rotation: one shift per frame, shared by all
points, applied to the low-discrepancy coordinate. This is a variance
reduction that only works because it is shared - it slides the whole
lattice, preserving its uniformity while decorrelating it from the
grid.

Substituting a per-point draw is not the same law, and the difference
is measurable rather than aesthetic. Over 64 bins of `qs.x`, the
rotated R2 sequence gives chi-square 0.2, worst bin 0.5% off uniform;
a per-point draw gives 70.5, worst bin 17.1% off. The plate would
still make a picture; it would not make this picture.

The clock also cannot become an integer in the subset (`Math.trunc` is
admitted only as integer division), so even the key is out of reach.

### XL Nodal Domains wants one ensemble per lever setting

`nodal_field` builds a random superposition from a hash chain keyed by
a lever and the term index:

```glsl
uint sbase = uint(P[3] + 0.5) * 1000u + 77u;
h1 = hashu(sbase + uint(j)); h2 = hashu(h1); h3 = hashu(h2); h4 = hashu(h3);
```

The ensemble IS the subject: the plate draws the nodal set of one
random wave, and every point must see the same wave. Worse, each point
evaluates the field five times during a Newton projection onto the
zero set, so the field must answer identically within a single walk,
not merely across points. With per-point randomness the cloud fills
the ball instead of condensing onto a surface.

Note the shape: a chain of four successive hashes. `addr.u(salt)` is
exactly one `hashu`, and `descend`, the only iterated hasher, is
statement-level and cannot live inside `sum`.

## What would close it

A third stratum, named by the artist rather than reached through a
descent. Sketch, not a decision:

```js
const w = world(P.seed);        // an Address, not tied to any descent
const a = w.u(j);               // same answer for every point, keyed by j
const b = w.chain(4, j);        // four successive hashes, the nodal shape
```

`world(...)` would take a lever, a literal, or the clock, and return
the existing `Address` object, whose semantics already are "the same
address answers the same for every point that ever asks". The
emitter's work is small: an `Address` is a `uint` in a register and
`hashu` is already in the shared header.

Two questions worth deciding deliberately before building it, because
both touch what a positive IS:

1. **Does a positive get to see the clock as a key?** Diffraction
   needs a per-frame value, which means the walk's output changes
   between frames in a way that is not a function of the levers. The
   darkroom's bit-identical-print claim rests on a spec plus a clock
   reproducing one negative; a frame-keyed hash keeps that, since the
   frame index is part of the spec. But it makes "the same inputs give
   the same subject" a statement about frames, not just levers.

2. **Should the ensemble be part of the work's identity?** Nodal's
   wave is chosen by a lever, so it is already reproducible. But a
   world keyed on something else - an edition number, a print date -
   would make each print a different member of an ensemble. That is a
   product decision and possibly an interesting one, not a technical
   one.

## Non-gaps, recorded so nobody re-litigates them

These looked like gaps and were not. Each was restated exactly, and
the restatement was verified bit-for-bit against a literal port of the
plate's own GLSL.

- **No bitwise operators.** XLVI Hilbert is almost entirely bit
  manipulation, and every operation is exact small-integer arithmetic:
  `<<1` is `*2`, `>>1` is `floor(/2)`, `&(Q-1)` is `mod(x,Q)`, a bit
  test is `mod(floor(x/Q),2)`, and `t=(x^y)&M; x^=t; y^=t` is an
  exchange of low bits. Verified against a transcription using real
  JS bitwise operators: bit-exact over 30000 deposits, 20 lever
  settings, with controls firing in both branches.
- **No `log2`.** Say `Math.log(x) / Math.log(2.0)`; the identity holds
  to 4e-15 and touches only palette arguments in the plates that want
  it.
- **No `inversesqrt`.** Say `1.0 / Math.sqrt(s)`, inside the 2 ULP
  GLSL ES allows anyway.
- **No `radians()`.** Say `x * PI / 180.0`, which is the spec's own
  definition. Worst measured cost 8.9e-12 absolute at the most extreme
  lever setting.
- **No `isnan`/`isinf`.** Ask for finiteness instead: `Math.abs(x) <
  1e30` excludes NaN and Inf in both JS and GLSL. In the two plates
  that gate on it the branch proved unreachable in lawful lever space
  (zero non-finite deposits over thousands of probes, largest
  coordinate 1.4757), and in one case the shader's own condition
  `!(dot <= 16.0)` is exactly equivalent rather than an approximation.
- **A constant table indexed at runtime.** Expected to block XLIV E8
  and did not: the roots come out of sign patterns the plate derives,
  not a table it stores.
- **Nested stateful iteration.** Wanted only by diffraction's
  Poisson-Arago arm, which is blocked on the frame shift anyway. If it
  ever matters alone, the honest fix is a construct, not a hand
  unrolling: two hand-compilations exist and neither can be read
  against the shader, which fails the point of the notation.
