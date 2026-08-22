# The first positive, previewed

The shape the implementation is measured against, shown to the
operator and approved 2026-08-22. If the built `positives/
critical.pos.mjs` drifts from this in anything but small signature
repairs, the drift must be argued, not slipped in.

## The decisions this preview settles

1. **A positive is a `.pos.mjs` file**: real JavaScript, hosted, zero
   dependencies. The native run under node IS the CPU evaluator. The
   emitter reads the same source, parses a disciplined subset, and
   writes registry-contract GLSL, or refuses. One source, two
   evaluators, no second implementation to drift.
2. **Loops are vocabulary; branches are allowed.** A `for` in a
   positive means the vocabulary is missing a word (`descend`,
   `evolve`, ...). Plain `if` and natural arithmetic stay. The
   emitter refuses what it cannot prove honest - a stream draw on the
   short-circuit side of `&&`/`||` or inside a ternary branch is the
   backend-divergence bug from the automaton suite, made
   inexpressible.
3. **Two kinds of randomness, two types.** `s` is the stream: the
   point's own consumable budget. An address is pure and derivable,
   identical for every point that ever looks at it. The Mk2 law
   (addressed, never stored; DEPTH redistributes light, never
   geometry) becomes the type system.

## The target text

    // LVIII The Critical Point, as a positive.
    import { positive, lever, grid2, pal } from "../core/measure.mjs";

    export default positive("critical", {
      occupancy: lever("OCCUPANCY p",  0.55, 0.98, 0.005, 0.76),
      b:         lever("SUBDIV b",     2,    4,    1,     3),
      depth:     lever("DEPTH",        4,    22,   1,     14),
      tint:      lever("CLUSTER TINT", 0,    1,    0.01,  0.55),
      slab:      lever("SLAB Z",       0,    0.5,  0.01,  0.10),
      hull:      lever("HULL BIAS",    0,    1,    0.01,  0.35),
      cam: { dist: 3.0, pitch: 0.34, tgtY: 0.0, rot: 0.0 },
      gain: 0.5, accent: "#7ad9c0",
    },
    (P, s) => {
      const d = s.depth(P.depth, { bias: 0.65 });
      const fall = s.descend(grid2(P.b), d, {
        tries: 6,
        child: (a) => a.child(s.pick(P.b), s.pick(P.b)),
        keep:  (child) => child.coin(P.occupancy),
      });
      let j = s.jitter2();
      const rim = j.chebyshev() * 2.0;
      if (s.u() < P.hull && rim < 0.62) j = j.scale(0.92 / Math.max(rim, 1e-3));
      const z = (fall.addr.u(0x2611) - 0.5 + s.centered() * 0.3)
              * P.slab * (0.25 + 3.0 * fall.cell.scale);
      const lv = fall.reached / P.depth;
      return s.deposit({
        xy:   fall.cell.at(j).scale(1.9),
        z,
        col:  pal(0.32 + fall.addr.u(0) * P.tint * 0.5 + lv * 0.12,
                  [0.45, 0.5, 0.47], [0.42, 0.5, 0.45],
                  [0.9, 1.0, 0.85], [0.15, 0.42, 0.6]),
        glow: 0.12 + 1.9 * lv * lv,
      });
    });

## Drift from the preview, argued

Two changes after approval, both at the operator's direction
(2026-08-22): "bit identical isn't a requirement, but the general
subject must be reproducible from the positive given the same
inputs."

1. **chains**: the positive gains
   `chains: { root: 2166136261, childKey: [97, 1], coin: "value" }`,
   pinning LVIII's exact address conventions. The world is part of
   the subject, so a restatement carries its plate's chains; a new
   positive omits the field and takes the canonical scheme.
2. **trail**: tint and slab now hash from `fall.trail` (the walk's
   path, folded, as the plate's `lineage` does) instead of
   `fall.addr`, so cluster colours and slab heights reproduce too.

With both, the emitted positive renders the plate's own picture:
survivors identical over all 6,561 level-4 cells, trails identical
over all 1,709 survivors, GPU-to-GPU cell correlation r = 0.9925
unsorted, totals 1.000.

## The verification contract

- The positive's two evaluators agree at cell level, measured by the
  probe rig pattern (project cells, read pixels, compare against the
  CPU evaluator's accumulation; rim and canvas-edge exclusions apply).
- Against the plate, the bar depends on the chains. As previewed the
  positive drew its own chains and owed only the law, as
  distributions at equal levers; with the plate's chains pinned (see
  the drift section) it owes the plate's world itself, survivors and
  trails identical at address level and the picture cell for cell.
- Bit-identity stays with the darkroom, which pins whatever program a
  print run uses. Not a constraint on this stage (operator's ruling).
