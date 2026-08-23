// A POSITIVE, ANNOTATED. Copy this, delete what you do not need.
//
// It lives in docs/ rather than positives/ because that directory is
// globbed as the plate corpus and a template is not a plate. It is
// nonetheless a REAL positive and is meant to stay one: if it stops
// emitting, the vocabulary moved under it and this file should be the
// first thing fixed, not the last.
//
//     node tools/smoke-pos.mjs docs/TEMPLATE.pos.mjs
//
// Read `docs/CONVERSION.md` for the rules. Read `positives/hopf.pos.mjs`
// and `positives/jong.pos.mjs` for the register the comments should aim
// at: prose about the mathematics, in sentences, saying what a stanza
// MEANS rather than what a line does.
//
// ---------------------------------------------------------------
// WHAT A POSITIVE IS
//
// A JavaScript function that the CPU evaluator RUNS and the emitter
// READS, producing pinned GLSL. Those two must agree, so the file is
// real JavaScript with real semantics - never lean on a construct
// whose meaning differs between the two. `=> {` is a block in both.
// `=> ({...})` returns an object in both. `===` is a parse error here,
// so write `==`.
//
// A positive that restates an existing plate owes that plate its LAW,
// not its ARRANGEMENT. Where the subset cannot say a thing the way the
// shader said it, restate the law and report the difference.
// ---------------------------------------------------------------

import {
  positive, lever,          // the two structural words
  pal, mul3, mix3,          // colour
  sum, mix, clamp, mod,     // scalar helpers
  len2, len3, v2, cmul,     // geometry and complex arithmetic
} from "../core/measure.mjs";

export default positive("template", {
  // AT MOST EIGHT LEVERS. lever(label, min, max, step, default).
  // The label is what the operator sees; the key is what the walk
  // says. A lever with step 1 is an INTEGER lever and may bound a
  // loop or feed s.pick; a lever with any other step may not.
  count: lever("COUNT", 2, 12, 1, 7),
  scale: lever("SCALE", 0.2, 2.0, 0.01, 1.0),
  warp: lever("WARP", 0.0, 1.0, 0.005, 0.35),

  // camera, gain and accent are carried through to the plate. A
  // conversion copies these verbatim from the registry entry.
  cam: { dist: 3.0, pitch: 0.2, tgtY: 0.0, rot: 0.0 },
  gain: 0.8,
  accent: "#88aaff",
},
// P levers by name, s the stream, q the R2 point, t the clock.
(P, s, q, t) => {
  // ---- drawing ------------------------------------------------
  // s.u()        uniform [0,1)
  // s.centered() u - 0.5
  // s.pick(n)    integer in [0,n), n a literal or an INTEGER lever
  // s.coin(p)    a biased bool
  // s.jitter2()  a centred vec2, two draws
  // s.depth(P.x) an integer depth, optionally { bias: 0.65 }
  //
  // THE STREAM IS A SEQUENCE. Draw unconditionally and apply
  // conditionally; a draw inside a branch makes every later value
  // depend on which way the branch went.
  const a = s.u();
  const jitter = s.jitter2();

  // ---- a field, which the stream cannot give you ----------------
  // s.vnoise(x, y, octave) is value noise on a hashed lattice. It
  // draws NOTHING: the value depends on the cell and octave alone, so
  // two points landing in the same cell see the same thing however
  // many draws came before them.
  //
  // Read at WHOLE integer coordinates its interpolation weights are
  // exactly zero, so it returns the corner hash itself - which is the
  // pinned per-index hash to use when many points must agree about a
  // shared catalogue entry. Ten of the thirteen conversions in this
  // sweep needed exactly that. NEVER hand-roll a lattice hash: that is
  // unpinned arithmetic in a plate body, which is the thing the engine
  // exists to remove.
  const field = s.vnoise(q.x * 8.0, q.y * 8.0, 3);
  const catalogue = s.vnoise(Math.floor(a * 64.0), 0.0, 11);

  // ---- loops: there are three, and no raw ones ------------------
  // sum(n, k => expr)  a bounded float reduction, carries nothing
  const octaves = sum(P.count, (k) =>
    Math.sin((q.x + k) * (1.0 + k)) * Math.pow(0.5, k));

  // s.orbit(n, init, step, opts) carries named FLOAT fields. A vec2
  // rides as two fields; an integer rides as an exact small float
  // (keep every intermediate under 2^24 and VERIFY that, do not
  // assume it - see positives/collatz.pos.mjs and rulespace).
  //
  // The step may be an expression returning an object literal, or a
  // BLOCK that declares intermediates and ends in a return. The block
  // form is what lets a step hold a nested sum() or orbit().
  const o = s.orbit(P.count, { px: q.x - 0.5, py: q.y - 0.5, h: 0.0 },
    (v, k) => {
      const inner = sum(P.count, (j) => s.vnoise(v.px * (1.0 + j),
                                                 v.py * (1.0 + j), j));
      const step = 0.05 * P.warp;
      return {
        px: v.px + step * inner,
        py: v.py - step * (inner + field),
        h: v.h + inner * inner,
      };
    },
    // optional: stop early. Checked BEFORE each step, so the state a
    // stopping orbit reports is the one that tripped the test.
    { until: (v) => (v.px * v.px + v.py * v.py) > 4.0 });
  // o carries the fields plus o.count and o.escaped.

  // s.descend(grid2(b), levels, {child, keep}) walks a subdivision.

  // ---- guards --------------------------------------------------
  // NaN is where the specification stops promising two GPUs the same
  // answer, so a plate that can produce one is not portable. Guard
  // every divide, every sqrt of a difference, every normalise, and
  // every iteration that can run away. newton split three ways across
  // vendors for want of a divergence bail; a length that reaches zero
  // is the other common one.
  const l = Math.max(len2(o.px, o.py), 1.0e-12);
  const dirx = o.px / l;
  const diry = o.py / l;

  // ---- the deposit ---------------------------------------------
  // Exactly one, as the returned expression. s.decline() is the other
  // way out and means this point lights nothing.
  return s.deposit({
    xyz: [dirx * P.scale + jitter.x * 0.01,
          diry * P.scale + jitter.y * 0.01,
          o.h * 0.1],
    col: mul3(
      pal(0.2 + 0.3 * octaves + 0.1 * catalogue,
          [0.5, 0.5, 0.5], [0.42, 0.42, 0.42],
          [1.0, 1.0, 1.0], [0.02, 0.36, 0.70]),
      0.6 + 0.4 * P.warp),
  });
});

// ---------------------------------------------------------------
// BEFORE YOU ARE DONE
//
//   node tools/smoke-pos.mjs positives/<id>.pos.mjs   -> "smoke passes"
//   node tools/verify-pinned.mjs <id>                 -> fully pinned 1,
//                                                        refused 0
//
// Then, for a conversion, the instrument every agent in the sweep
// built unprompted and which is now expected: transcribe the plate's
// GLSL literally into throwaway JS, drive both on the same recorded
// draws, and compare field by field. Plant faults in the transcription
// and confirm the comparison SEES them - a comparator that cannot fail
// is not evidence. That check caught a bug in rule30 that no smoke
// gate could ever have seen: one corrupted cell in five hundred and
// twelve.
//
// Finally write build/reports/<id>.md per docs/CONVERSION.md.
// ---------------------------------------------------------------
