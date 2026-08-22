# The vocabulary the plates already speak

Authored analysis over the generated survey (`SURVEY.md`, corpus of 68
plates from PrettyCloud @ af67aec, dumped 2026-08-22). Every number
here is from that survey; re-run `tools/survey.mjs` before trusting
this document against a newer corpus.

## Three strata, and a boundary the data draws by itself

The single sharpest measurement: **`qHashed` is 12 of 68, and the
twelve are exactly plates LVII through LXVIII** - the Mk2 series. The
corpus splits into strata with no fuzz at the edges:

1. **The classic fifty-six** (I-LVI): the low-discrepancy point `q` is
   a *coordinate* - it enters the subject's own parameter space (an
   angle on a torus, a c in the Mandelbrot plane, a seat on a curve).
   50 are plain coordinate maps, 6 lean on the shared complex library.
   These plates are also where motion lives: 30 of the corpus's plates
   reference time, nearly all of them classic.
2. **The addressed six** (LVII-LXII): `q` is hashed into a *budget
   stream*. Structure hashes from address chains; a depth draw decides
   how far down each point walks; every point deposits (zero culls in
   this stratum). The Mk2 design laws, held by convention.
3. **The windowed six** (LXIII-LXVIII): everything above plus the
   integer lattice, the `ivec4` window with clipped-extent importance
   weighting, the cull sentinel, the stain helper - and, in the
   automaton suite, word registers and toll loops.

The language's core is strata 2 and 3. They were already converging on
shared machinery by convention: the same six plates carry the stream
helper, the stain helper, the integer window, MAGNIFY, and the cull
sentinel. Conventions that recur under pressure are keywords asking to
be born; this is them asking.

## The constructs, one by one

Each entry: prevalence in the corpus, what it is, and what the
combinator would owe.

**stream** - 12 plates by convention, 6 with the literal helper.
Deterministic splittable randomness threaded through the point's walk.
As a language construct it is *explicit state*, which structurally
kills the bug class found while building the suite: a side-effecting
hash call inside a ternary evaluates differently on the D3D and GL
backends, and the two grow different objects. A pure language with an
explicit stream cannot express that bug.

**address** - the same 12. Identity as the argument of structure:
geometry hashes from address chains alone, never from the budget, so
DEPTH redistributes light and never moves geometry (the LXIII
contract, stated in its commit and held by every plate since). The
combinator: `addressed(key)` values whose meaning is a pure function
of key. This is the law the emitter can *enforce* rather than review.

**budget** - 11 plates carry DEPTH (ten Mk2, plus the de Jong
attractor's iteration dial). The point draws how deep it walks:
uniform for equal light per octave, biased where coarse levels would
fog the lace (critical's 0.65 power, throughput's fold-back). In
measure terms this is the normalisation of light across scales - a
first-class object, not a loop header.

**window** - 6 plates. The integer lattice window with children
weighted by clipped extent is *conditioning the measure on what is
visible*; MAGNIFY 0 is the unconditioned measure, which is why the
editions expose there. Combinator: `within(win, measure)`, plus the
lattice arithmetic discipline (integer offsets subtracted before the
one float conversion) as an emission guarantee.

**descent** - the windowed six again, in three shapes: a guillotine
tree (vlsi), digit descent (nested), separable grids (throughput,
rulespace). All are sequential weighted choice - conditional sampling
- and all reimplement the same two-pass weigh-then-pick by hand. One
combinator, three instantiations.

**toll** - 3 plates (rule30, universal, rulespace). The data-dependent
loop: rows earned one at a time because the rule is computationally
irreducible and no shortcut would be honest. The language should mark
it: `evolve(rule, seed, t)` declared irreducible, priced by t.

**theorem** - nested. The same slot as a toll, filled by algebra
instead: Kummer and Lucas make row sixteen million addressable in its
digits. That `toll` and `theorem` fill the *same hole* in a positive
is the suite's deepest lesson, and the language should make the choice
between them a stated, visible act - and refuse to fake a theorem
where none exists.

**register** - 3 plates. Word-parallel bit state with static
neighbour wiring. A small library concern (rotate, rule step, popcount)
with one sharp emission rule learned by measurement: interior words
take neighbours statically, only the ring's ends pay runtime selects.

**engines** - 3 plates (vlsi, throughput, and halo before either: the
convention leaked backward, which is evidence it wants to be a rule).
Furniture requests filled by branches, every primitive drawn at one
call site at the tail. This is compile-cost discipline as architecture; an
emitter can guarantee it mechanically instead of by review.

**channel** - universal's particle/domain/fabric split: light routed
by a *measured* classification per cell, each channel with its own
glow and hue, any channel able to decline. `channel(predicate, grade)`
- and the negative control (a world where every channel is silent)
falls out of the notation for free.

**cull** - 6 plates use the sentinel. The measure declines a point:
positives are partial by design, and the sentinel is the emitted form
of `nothing here`.

**deposit and grade** - the near-universal dials: `pal` in 49 plates,
GLOW on 41, SCALE on 18; the stain rotation on the six. The lever
table is itself stratified: grade dials shared by dozens, family dials
(MODE 12, DEPTH 11, ITERATIONS 10), and 223 of 271 distinct labels
appearing exactly once - the subject-specific dials. The language
should type these tiers: grade belongs to the engine, family dials to
the construct that implies them, singletons to the positive.

**chains** - added at the operator's direction after the first
positive: the world's identity as an explicit option. Root, child-key
packing, and coin convention travel with the positive; a restatement
pins its plate's exact chains (and colours from the `trail`, the
walk's folded path) so the same inputs reproduce the same subject,
cell for cell - while a new positive takes the canonical scheme and
its world is its own. Bit-identity stays downstream with the
darkroom; what chains buy is subject-identity.

## What stays authored

The survey also measures what the language must *not* try to own: 223
singleton levers and sixty-eight palettes are the editorial layer.
What deserves light (the vacuum subtracted), where a dive anchors (the
gasket's centre is a void; its edge rail is not), what a subject is
for - the notation names these decisions so they can be read, checked
and diffed. It does not make them.

## Where implementation starts

1. **The measure core**, as an embedded combinator library (plain JS,
   zero dependencies, like everything else in the practice) emitting
   registry-contract GLSL: stream, address, budget, deposit, grade,
   cull. The emitter owns the disciplines the review process currently
   owns: evaluation order, address purity, one call site per
   primitive.
2. **Two evaluators from day one**: the GLSL emitter and a plain-JS
   reference that evaluates the same positive on the CPU. Agreement is
   checked at cell level with the probe rig pattern from the automaton
   suite (project lattice points through the camera, read pixels,
   compare against the reference; rim and canvas-edge exclusions
   apply). Not bit-identity: that remains the darkroom's per-program
   guarantee, downstream, per the operator's ruling.
3. **First positive: restate LVIII The Critical Point.** At 69 lines
   it is the smallest complete speaker of the addressed stratum
   (stream, address, budget, depth-biased draw, slab, tint). Written
   as a new positive beside the plate, never replacing it; the plate
   is the reference implementation.
4. **Second positive: restate LXVI The Nested Rule**, the cleanest
   windowed descent, to force window, descent and theorem into the
   core.
5. **Then stop and judge.** If the two positives read better than
   their GLSL and verified cheaper, grow the vocabulary toward the
   toll plates and the register. Syntax beyond combinators only when
   the vocabulary stops moving.
6. **The Trace** (atlas-darkroom/PLATES-AHEAD.md) waits on exactly
   this: its compiler wants to emit a positive - seed row, expected
   tape, probe from one source - not raw GLSL. Build the engine first
   and that plate becomes its printout.

## Non-goals

- Replacing the sixty-eight. They are the corpus and the reference,
  not debt.
- A general shader language. The denotation is a measure; anything
  that is not a measure is out of scope.
- Automating taste. The engine holds the laws; the operator holds the
  light.
