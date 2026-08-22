// Plate LXVI The Nested Rule, as a positive - the windowed layer's
// first speaker. The descent rides the THEOREM: Kummer and Lucas make
// every cell of Pascal's triangle mod p an arithmetic fact about its
// own address, so only nonzero cells are ever constructed, and the
// window weighs each digit choice by what it can see. No chains: the
// support is a theorem's, not a world's; the one hashed convention
// (the lineage under the slab) is the canonical digit fold.
import { positive, lever, pal, prime, levels, digitTriangle, stain } from "../core/measure.mjs";

export default positive("nested_pos", {
  depth:   lever("DEPTH",     4, 24,  1,    12),
  magnify: lever("MAGNIFY",   0, 22,  0.25, 0),
  nth:     lever("NTH PRIME", 1, 4,   1,    1),
  tint:    lever("TINT",      0, 1,   0.01, 0.6),
  band:    lever("BAND",      0, 1,   0.01, 0.25),
  slab:    lever("SLAB Z",    0, 0.4, 0.005, 0.08),
  ink:     lever("INK",       0, 1,   0.01, 0.5),
  st:      lever("STAIN",     0, 1,   0.01, 0.5),
  cam: { dist: 3.0, pitch: 0.26, tgtY: 0.0, rot: 0.0 },
  gain: 0.55, accent: "#6fe0b8",
},
(P, s) => {
  const p = prime(P.nth);
  const g = levels(p, P.depth);          // rows R = p^L, R >= 2^DEPTH

  // the window: MAGNIFY is the site's loupe and the editions expose
  // at 0. The dive anchors just inside the bottom-left corner, on the
  // k = 0 rail - C(n,0) = 1 for every p, structure at every scale;
  // the centre of the p = 2 gasket is its great void.
  const w = s.window({
    span:    [2 * g.R - 1, 2 * g.R],
    heart:   [Math.trunc(g.R / 64), 2 * g.R - Math.trunc(g.R / 32)],
    magnify: P.magnify,
    unit:    2.85 / (2 * g.R),
  });

  // the descent: digit by digit from the window down, each level
  // weighted by the visible extent of its candidate blocks
  const fall = s.descend(digitTriangle(p, g.R), g.L, { within: w });
  if (fall.dead) return s.decline();

  // the cell: (n, k) sits at xu = 2k + (R-1-n), two units square on
  // the alternating brick lattice
  const xu = 2 * fall.k + (g.R - 1 - fall.n);
  const jx = (s.u() - 0.5) * 1.88;
  const jy = (s.u() - 0.5) * 1.88;

  const lv = fall.n / g.R;
  const hue = (p == 2) ? 0.0 : (fall.v - 1) / (p - 1);
  const z = (fall.sig.u(0) - 0.5 + s.centered() * 0.3) * P.slab;

  return s.deposit({
    xy: w.seat(xu + 1, 2 * fall.n + 1, jx, jy).flipY(),
    z,
    col: stain(pal(0.34 + 0.45 * hue * P.tint + 0.10 * lv * P.band,
                   [0.44, 0.52, 0.46], [0.42, 0.48, 0.44],
                   [0.95, 1.0, 0.9], [0.12, 0.40, 0.62]),
               (P.st - 0.5) * 2.2),
    glow: (0.5 + 1.4 * P.ink) * (1.0 - P.band * 0.55 * (1.0 - lv)),
  });
});
