# Converting a plate to a positive

The brief for conversion agents. Read this whole file before touching
a plate.

## The mission

Each original plate in `../PrettyCloud/atlas/js/plates/NN-<id>.js` is a
GLSL vertex-shader shape function. You restate it as a **positive**: a
single JavaScript walk in `positives/<id>.pos.mjs` that IS the artwork.
The same source runs natively under node (that run is the CPU
evaluator) and is read by the emitter (`core/emit.mjs`), which writes
registry-contract GLSL. You never write GLSL yourself.

The subject must be reproducible from the positive given the same
inputs: same levers, same clock, same picture. Copy every constant
verbatim. Do not improve, simplify, or re-derive the mathematics; the
walk should read better than the shader, but it must say the same
thing.

## The contract

- File `positives/<id>.pos.mjs`, default export via `positive(...)`.
- id is `"<id>_pos"` where `<id>` is the original plate's `id:` field.
- **Levers: same count, same order, same label, min, max, step, def.**
  The conformance rig diffs these against the original and fails the
  pair on any mismatch. Lever KEYS (your `P.<name>` names) are yours to
  choose; the label strings are not.
- Copy `cam`, `gain`, `accent` from the plate into the meta object.
- The walk signature is `(P, s)` or `(P, s, q, t)`:
  - `P` levers by name, `s` the stream.
  - `q` is the point's own coordinate, a vec2 in [0,1)^2, the same R2
    sequence the shared vertex header hands the shape function. Any
    plate that reads `q` in its GLSL is a coordinate map: take the
    4-param form.
  - `t` is the clock, the shader's `uT`. Every `uT` becomes `t`.
- One deposit per walk: `return s.deposit({...})`, or `return
  s.decline()` where the plate returns the far-sentinel
  `vec3(0.0, -20000.0, 0.0)`.

## The subset that parses

Statements: `const`/`let` (multiple declarators fine), assignment and
`+=` `-=` `*=` `/=`, `if`/`else`, `return`. Expressions: arithmetic
`+ - * / %`, comparisons, `&& || !`, ternaries, array literals, object
literals, arrow functions (only as construct arguments). Numbers,
`Math.*` from the list below, and the vocabulary.

Not in the subset, by design: `while`/`for` (loops are vocabulary:
`sum`, `s.orbit`, `s.descend`), closures over mutable state,
`Math.random`, `Date`, strings, template literals, destructuring.

**Draw discipline.** Every `s.` draw advances shared state. Draw order
is source order. The emitter REFUSES a draw inside a ternary branch or
on the short-circuit side of `&&`/`||` - that shape diverges between
backends. Restructure into plain `if`/`else` statements, where both
evaluators sequence identically. When you hit a refusal, restructure;
never work around it.

Integer arithmetic: an int-typed expression divided with `/` refuses;
use `Math.trunc(a / b)` for integer division. `%` between ints is int
modulo; between floats it refuses - use `mod(x, y)` (GLSL semantics,
always positive for positive y).

## Vocabulary

Givens and stream:

| construct | meaning |
|---|---|
| `q.x`, `q.y` | the point's coordinate in [0,1)^2 |
| `t` | the clock (uT) |
| `s.u()` | one uniform draw in [0,1) |
| `s.centered()` | `u() - 0.5` |
| `s.pick(n)` | integer draw in [0,n) |
| `s.jitter2()` | vec2 of two centered draws |
| `s.depth(max, {bias})` | budget draw: `trunc(pow(u, bias) * max)` |
| `s.orbit(n, init, step, opts)` | see below |
| `s.deposit({xy \| xyz, z, col, glow})` | the one deposit |
| `s.decline()` | the measure declines the point |

`s.orbit(n, {a: a0, b: b0}, (st, k) => ({a: ..., b: ...}), {until: (st) => cond})`
iterates a named-record state. `n` may be a lever or literal (the
static bound comes from the lever's max). All next-state fields are
computed from the previous state (simultaneous update). `until` checks
BEFORE each step and stops with `escaped` true. The result carries the
final fields plus `.count` (int) and `.escaped` (bool). Escape-time
sets, attractors, Newton iterations, mapping loops - all orbits.

`sum(n, (k) => term)` is the reduction loop (harmonic series, partial
sums). `k` is an int; make it float by using it in float context
(write `(k + 1.0)`).

Pure helpers (import what you use from `../core/measure.mjs`):

- `TAU`, `PI`
- `fract, mix, clamp, step, smoothstep, mod` - GLSL semantics
- `Math.sin cos tan asin acos atan2 exp log pow sqrt abs min max floor
  sign trunc sinh cosh tanh round` (`Math.round` emits
  `floor(x + 0.5)`)
- `len2(x, y)`, `len3(x, y, z)` - GLSL `length()`. Use these, never
  `Math.hypot`, which the emitter refuses: hypot scales to avoid
  overflow and so answers more accurately than `length()` does, which
  makes the two evaluators disagree in the last bits. `Math.sqrt(x*x +
  y*y)` is the same thing spelled out and is equally fine.
- `v2(x, y)` and vec2 methods `.x .y .scale(k) .flipY() .chebyshev()`
- `v3(x,y,z), add3, mul3, mix3, dot3, cross3, normalize3, length3` -
  vec3s as values for `col` and `xyz`; componentwise scalar math is
  equally welcome and often reads better
- `cmul, cdiv, cinv, csqrt` - complex numbers as vec2, matching the
  shared header exactly
- `pal(u, a, b, c, d)` - the IQ palette, vec3 args as `[r,g,b]` arrays
- `stain(col, amount)` - the hue rotation about grey
- `prime(P.nth)`, `levels(p, P.depth)`, `grid2(b)`, `digitTriangle(p, L)`,
  `s.window({span, heart, magnify, unit})`, `s.descend(...)` - the
  addressed and windowed strata; classic plates will not need these

## Mapping guide, plate GLSL to positive

| in the shader | in the positive |
|---|---|
| `q` | `q` (take the 4-param walk) |
| `uT` | `t` |
| `P[0]`, `P[3]` | `P.<name>` by your lever key |
| `rnd.x` brightness texture | `glow: a + b * s.u()` |
| `rnd.zw` jitter | `s.centered()` / `s.jitter2()` |
| `seed`-derived hashing | usually a draw: `s.u()`; addressed structure only if the plate builds worlds (classics do not) |
| MODE arms (`if (mode == 2)`) | `if`/`else if` chains on the int lever |
| fixed-bound `for` accumulating | `sum(...)` |
| iterate-then-project loops | `s.orbit(...)` |
| escape loops (`if (dot(z,z) > 4.) break`) | `s.orbit(..., {until: z => ...})` |
| `pal(...)` | `pal(...)` with array args |
| `mix/clamp/fract/smoothstep/mod` | same names, imported |
| `cmul/cdiv/csqrt` | same names, imported |
| vec2/vec3/vec4 component math | componentwise scalars, or v2/v3 helpers |
| mat2 rotations | write the four products out |
| far sentinel `vec3(0., -20000., 0.)` | `return s.decline();` |

The stochastic texture does not need the plate's exact draw sequence -
`rnd.zw` versus two `s.u()` draws differ in value but not in law. The
deterministic geometry DOES need exactness: formulas, constants,
signs, clamps, all verbatim.

## Self-checks, in order

```
node tools/emit.mjs positives/<id>.pos.mjs
node tools/smoke-pos.mjs positives/<id>.pos.mjs
```

Emit must print GLSL line counts with no refusal. Smoke must PASS all
rows: it runs the walk natively at defaults, defaults at t=1.7, and
two hashed lever settings, checking finiteness, deposit rate, seat
bounds, and nonzero light. A classic plate should have zero declines;
if smoke reports declines on a plate whose shader has no far sentinel,
your walk is wrong.

Do not run browsers, CDP, or verify-pair; picture conformance runs
centrally after conversion.

## When the vocabulary cannot say it

Stop on that plate. Do not extend `core/`, do not approximate, do not
drop features. Write the blocker into your report with the exact GLSL
lines that would not translate and what construct you would have
needed. A blocked plate with a precise gap report is a good outcome;
a plate that silently says something different from its shader is the
one forbidden result.

## The report

For each assigned plate append to `build/reports/<id>.md`:

```
# <id>: converted | blocked
plate GLSL lines: N   positive lines: M
gaps: none | <the constructs you needed and lacked>
notes: <anything the next reader must know - constants of concern,
       draw-order choices, MODE arm structure>
```

## Do not

- modify `core/`, `tools/`, `harness/`, other agents' positives, or
  anything in PrettyCloud
- rename or reorder levers
- commit (the session lead reviews and commits)
- "fix" plate mathematics, even where a formula looks wrong; plates
  ship as they are

House style for comments: prose about the mathematics, in sentences,
no em dashes. Comments say what a stanza means, not what a line does.
Look at `positives/hopf.pos.mjs` and `positives/jong.pos.mjs` for the
register to aim at.

## The cross-check that wave one invented

Every wave-one agent, unprompted, built the same instrument and it is
now expected of you. After smoke passes, transcribe the plate's GLSL
literally into a throwaway JS function in your scratch area, drive
your walk with a draw-recording stream, replay the transcription on
the same draws, and compare every deposit field. Wave one found
agreement from 4e-16 to 2e-14 across four lever and clock settings,
which is what "the same subject" should look like.

Validate the comparator before you trust it: perturb one constant in
the transcription and confirm the check reports a difference. A
checker that cannot see a planted fault is not evidence. Report the
worst delta you measured and the fact that the negative control
fired.

## What the picture check will and will not tell you

Conformance runs centrally, and two plates have already taught the
rig that a low correlation is not automatically a defect. Plates that
spread points thinly through a volume (qjulia, bulb) carry a per-cell
Poisson noise floor that falls as 1/N: bulb reads r = 0.864, 0.962,
0.980 at 2^20, 2^22, 2^23 points, converging on its original at
exactly the shot-noise rate. So a diffuse plate is measured with more
points rather than a lower threshold. If your plate is volumetric,
say so in your report; it saves the lead a diagnosis.
