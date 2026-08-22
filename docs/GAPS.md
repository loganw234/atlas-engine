# Where the notation stops

The survey of the classic stratum was meant to draw the language's
boundary by trying to say every plate in it. Fifty-four plates
translated. Four did not, and they failed on just two things: three of
them want randomness shared between points, and one wants to name a
value twice inside an iteration step. Both have a small, measured fix,
and the fixes were found by the agents who hit them rather than
proposed from outside.

Blocked: XLIX Diffraction (shared randomness), XL Nodal Domains
(shared randomness), LVI Starfield (shared randomness), XXXIII
Billiards (naming a value twice).

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
ensemble, a per-frame shift. Three plates need exactly that, and the
third one shows what the construct should be.

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

### LVI Starfield wants one catalogue, and shows the way out

The star catalogue is four attributes per star, from a chain seeded by
the star index:

```glsl
s1 = hashu(si * 2654435761u + 101u);  s2 = hashu(s1);  s3 = hashu(s2); ...
```

Every point that lands on star `si` must agree about that star, which
is the same requirement as the other two.

But the agent who hit it noticed what the shape actually is: **those
four attributes are exactly the first four draws of a stream seeded at
`si * 2654435761 + 101`**, verified bit for bit at every index tried.
The chain is not exotic. It is the ordinary draw sequence, started
somewhere the artist chooses.

## What would close it: one construct, not a stratum

```js
s.reseed(si * 2654435761 + 101);   // the stream restarts here
const mag = s.u(), col = s.u(), ra = s.u(), dec = s.u();
```

`s.reseed(expr)` sets the stream's state from a value the walk names.
After it, the whole existing draw vocabulary applies unchanged. On the
GPU it is one assignment to `pt`, the register that is already there.

This is better than the `world()` object sketched in an earlier draft
of this document, because it introduces no new type: a reseeded stream
is the same stream. It also reaches all three blocked plates.

- **Starfield**: exactly as above, converts with no other change.
- **Nodal**: `h1..h4` are four successive `hashu` calls, which is four
  draws from a stream reseeded at `sbase + j`. The Newton projection
  re-derives the field five times per point and would get the same
  answer each time, because the reseed is a function of `j` alone.
- **Diffraction**: reseed from the frame, then two draws give the
  Cranley-Patterson shift. This one needs a second small thing as
  well, an integer key from the clock, since `Math.trunc` is admitted
  only as integer division.

The cost is real and worth stating: a reseed makes the stream's
sequence depend on where the walk chose to restart it, so a positive
can no longer be read as "one point, one budget, spent in order". The
draw discipline that keeps the two evaluators in step still holds
(draws stay in source order, still banned inside ternaries), but the
budget becomes segmented. That is a genuine change to what a positive
IS, which is why it belongs in this document rather than in a commit.

Two questions about `reseed` worth deciding deliberately, because both
touch what a positive IS:

1. **Does a positive get to see the clock as a key?** Diffraction
   needs a per-frame value, which means the walk's output changes
   between frames in a way that is not a function of the levers. The
   darkroom's bit-identical-print claim rests on a spec plus a clock
   reproducing one negative; a frame-keyed reseed keeps that, since
   the frame index is part of the spec. But it makes "the same inputs
   give the same subject" a statement about frames, not just levers.

2. **Should the ensemble be part of the work's identity?** Nodal's
   wave is chosen by a lever, so it is already reproducible. But a
   reseed keyed on something else - an edition number, a print date -
   would make each print a different member of an ensemble. That is a
   product decision and possibly an interesting one, not a technical
   one.

### And one unrelated small thing: statement bodies in an orbit step

XXXIII Billiards is blocked on something else entirely. Its bounce
loop is an ordinary orbit; the problem is `billiards_hit`, which
returns a distance and a normal through twelve local bindings and six
conditional best-updates. An orbit step is one expression per field,
so a value used twice must be written twice, and the duplication
compounds through the tree.

The agent measured the blow-up per step, with leaves already as cheap
as an orbit field allows: circle about 2 KB, ellipse 4 KB, Sinai
14.7 KB, and the Bunimovich stadium **109.1 KB**, where `B` to `disc`
to `sq` to the two roots to the gates to the winner each have two
consumers. Pipelining makes it worse. Nothing can be dropped: both cap
roots are live and a table arm cannot be omitted.

The fix is small and helps far beyond this plate, since several
converted positives note the same forced duplication:

```js
s.orbit(n, init, (st, k) => { const B = ...; return { x: ..., y: ... }; })
```

A statement body, with the same rules that already govern the walk
(draws in source order, none inside ternaries). That alone takes the
stadium step from 109 KB to about 2 KB.

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
- **An out-parameter.** Billiards' hit test returns a distance and a
  normal together, which looks like it needs two return values. It
  does not: a statement body lets the step name both, and the orbit
  record already carries several fields.

## What each gate actually caught

Three gates run on every positive, and the record now shows they catch
different things, which is the argument for keeping all three.

**Emit** catches what cannot be said: draws inside ternaries, float
modulo, integer division by `/`, a lever where a literal is needed. It
also now catches GLSL-reserved identifiers, because it learned to.

**Smoke** catches what the walk does wrong on its own: non-finite
seats, empty frames, a decline where the shader has no sentinel. It
runs the walk natively, so it sees the CPU evaluator only.

**The browser pair** catches what neither can: it is the only gate
that runs a GLSL compiler and the only one that compares against the
original plate. It found the `gl_` bug, which emit and smoke both
passed because both are CPU-side and neither links a shader. Five
plates carried a walk variable named `gl`, for glow, and the emitter
turned it into `gl_5`, an identifier GLSL reserves. Emit is now
guarded against the class, with the guard's own negative control
recorded in this repository's history, but the lesson is the gate
order: a check that never runs the real compiler cannot speak for it.

The same principle disposed of two false alarms. qjulia and bulb read
low against their originals and were not defective; they are diffuse
volumes whose per-cell counts carry Poisson noise, and both converge
at exactly the 1/N shot-noise rate as the point budget rises. Read a
low correlation as a question about the instrument first.
