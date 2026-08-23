// Plate LXII The Dissipation Field, as a positive. Turbulence does not
// spend its energy evenly: it clots into sheets and strands, calm for
// miles and then violent in a filament. The classical account of that
// roughness is the multiplicative cascade, each octave multiplying the
// last by a random weight of mean one, and after enough octaves the
// measure is almost nowhere large and yet holds almost everything.
// This walk runs one parcel down its octaves with the variance of the
// weights on a dial: smooth rain at zero, at full a storm concentrated
// on threads.
//
// WHY THIS IS AN ORBIT AND NOT s.descend. The shape is a subdivision
// walk and looks like the descent, but it is not one, for two reasons
// that both point the same way. First, this measure has full support:
// every cell of the b-ary subdivision exists, nothing is ever culled,
// and there is no survival question for a keep predicate to answer.
// Second and decisively, s.descend hands back only where the walk
// ended - the final cell, the final address, the folded trail - and
// the cascade is not about where the walk ended. It is about a product
// accumulated from every level's own address on the way down, and the
// descent has no place to put one. An orbit does: the cell rides as
// two float fields with its scale, and the log weight and the shear
// ride beside them, so the thing the plate is actually about is a
// carried quantity rather than a discarded one.
//
// THE WEIGHT IS A FIELD, NOT A DRAW, and that distinction is the plate.
// Every parcel that walks into the same cell must find the same weight
// there, or the cascade is per-parcel noise with no filaments in it.
// The stream cannot give that, so the weight comes from s.vnoise read
// at the cell's own b-ary index, one octave per level. The index rides
// as a shift register over the child digits, exactly the cell address
// while it fits and its low digits after, which is honest about what a
// 1024-wide lattice can hold: coarse levels, the ones a picture can
// resolve, are addressed exactly, and levels below that are already
// deeper than a pixel, where the statistics are the structure anyway.
// Read at integer coordinates the interpolation weights are zero, so
// the value is the lattice hash itself and nothing is smeared between
// neighbouring cells.
import { positive, lever, pal, clamp, mod } from "../core/measure.mjs";

export default positive("dissipation_pos", {
  lambda:  lever("LAMBDA",   0, 1.2, 0.01,  0.55),
  b:       lever("SUBDIV b", 2, 4,   1,     2),
  maxd:    lever("DEPTH",    6, 22,  1,     16),
  stretch: lever("STRETCH",  0, 0.8, 0.01,  0.35),
  slab:    lever("SLAB Z",   0, 0.4, 0.005, 0.06),
  ember:   lever("EMBER",    0, 1,   0.01,  0.5),
  cam: { dist: 3.0, pitch: 0.4, tgtY: 0.0, rot: 0.0 },
  gain: 0.5, accent: "#e08fb8",
},
(P, s) => {
  // the subdivision, as the plate reads it off its lever, and held at
  // two or more so no level can divide by zero however the lever is
  // driven
  const bf = Math.max(Math.round(P.b), 2.0);

  // the budget, drawn uniformly. Equal light per octave is what makes
  // the statistics the same at every scale, so this one is not biased
  // the way a lace plate's would be.
  const d = s.depth(P.maxd);

  // THE CASCADE. Each level picks a child, folds it into the address,
  // and multiplies the parcel's weight by that address's own lognormal
  // draw: two hashed uniforms centred and scaled make a passable
  // gaussian, and the minus half lambda squared is the correction that
  // holds the weight's mean at one however wide its logarithm spreads.
  // The shear accumulates beside it, because dissipation sheets
  // stretch along the strain rather than staying square.
  const O = s.orbit(P.maxd, {
    cx: 0.0, cy: 0.0, sc: 1.0, ax: 0.0, ay: 0.0,
    logw: 0.0, ani: 0.0, lev: 0.0,
  }, (v, k) => {
    const ex = s.pick(P.b);
    const ey = s.pick(P.b);
    const nx = mod(v.ax * bf + ex, 1024.0);
    const ny = mod(v.ay * bf + ey, 1024.0);
    const g1 = s.vnoise(nx, ny, k * 4 + 1);
    const g2 = s.vnoise(nx, ny, k * 4 + 2);
    const sh = s.vnoise(nx, ny, k * 4 + 3);
    return {
      cx: v.cx + (ex * v.sc) / bf - v.sc * 0.5 * (1.0 - 1.0 / bf),
      cy: v.cy + (ey * v.sc) / bf - v.sc * 0.5 * (1.0 - 1.0 / bf),
      sc: v.sc / bf,
      ax: nx,
      ay: ny,
      logw: v.logw + P.lambda * ((g1 + g2) * 1.73) - 0.5 * P.lambda * P.lambda,
      ani: v.ani + sh * P.stretch,
      lev: v.lev + 1.0,
    };
  }, { until: (v) => v.lev >= d });

  // the seat: anywhere inside the cell the walk reached, sheared along
  // the strain the descent accumulated
  const jx0 = s.centered();
  const jy = s.centered();
  const jx = jx0 + jy * O.ani;
  const seatx = O.cx + jx * O.sc;
  const seaty = O.cy + jy * O.sc;

  // the burn. The log weight is a sum of at most twenty two bounded
  // terms, so it cannot reach infinity, but it is clamped before the
  // exponential regardless: an exp with an unbounded argument is where
  // a plate stops promising two cards the same answer, and the clamp
  // sits far outside anything the levers can produce.
  const w = Math.exp(clamp(O.logw, -50.0, 20.0));
  const heat = clamp(w * 0.35, 0.0, 2.5);

  // fine cells lie flat, so the slab cannot smear the threads it took
  // levels to reach; the height is the reached address's own, jittered
  const z = (s.vnoise(O.ax, O.ay, d + 4096) + s.centered() * 0.3)
          * P.slab * (0.25 + 3.0 * O.sc);

  const lv = d / Math.max(P.maxd, 1.0);
  return s.deposit({
    xyz: [seatx * 1.9, seaty * 1.9, z],
    col: pal(0.05 + 0.35 * clamp(heat, 0.0, 1.2) + 0.1 * lv,
             [0.5, 0.4, 0.38], [0.5, 0.42, 0.4],
             [1.0, 0.8, 0.55], [0.0, 0.15, 0.35]),
    glow: 0.15 + heat * (0.6 + P.ember),
  });
});
