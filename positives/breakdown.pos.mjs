// Plate LVII Dielectric Breakdown, as a positive. An insulator that
// loses does not fail gracefully. Charge advances where the potential
// gradient is steepest, every advance sharpens the gradient at its own
// tip, and the runaway writes a branching figure whose trunk carries
// limbs, whose limbs carry twigs, and whose twigs carry hair too fine
// to see. The same law holds at every size, so the figure has no
// native scale and the budget is spent evenly over the levels rather
// than over the length: a zoom finds as many points on the hair as on
// the trunk, which is what the Mk2 series was made for.
//
// THE TREE IS ADDRESSED, NEVER STORED, and that is the whole shape of
// this walk. In the shader every node's geometry hangs off a hash of
// the node's address alone, so the thousands of points that walk the
// same path down the tree agree about the same filament and the
// accumulation is coherent across passes. The point's own stream
// chooses only which way to turn at each fork and where to sit on the
// filament it ends on. A stream draw cannot say the addressed half:
// the stream is a sequence, and two points reaching the same node have
// drawn a different number of times on the way, so they would get two
// different jitters and the figure would be a fan of fog rather than a
// tree of filaments.
//
// s.vnoise is the engine's field, and read at whole lattice
// coordinates its interpolation weights are exactly zero, so what it
// returns is that cell's hashed corner and nothing else: a uniform on
// [-0.5, 0.5) addressed by the cell and the octave and by nothing
// else. That is the pinned per-address hash the tree needs. The trunk
// takes it at the segment index, which is why every point sees ONE
// trunk. The branch chain takes it at a cell that rolls forward with
// the walk, each level's cell hashed from the previous cell and the
// fork just taken, which is the shader's `addr = hashu(addr ^ side)`
// restated in the one primitive the engine will vouch for. Attributes
// are separated by OCTAVE rather than by cell, and the level rides in
// the octave too, so no two attributes of any two nodes collide and a
// cell that happened to recur could not make the chain periodic.
//
// WHAT THE ROLLING CELL COSTS, stated plainly because the next reader
// should not have to measure it. The lattice folds at 1024, so the
// carried address is twenty bits where the shader's is thirty two.
// Two nodes whose paths differ can therefore land on one cell and
// share a jitter and a survival draw. Their positions still differ,
// since position accumulates from each node's own path, so the visible
// effect is a pair of congruent twigs somewhere in a figure of tens of
// thousands, never a doubled filament. At the default levers the
// surviving tree is a few thousand nodes against a million cells and
// collisions are a fraction of a percent; driven to DEPTH 22 with
// BRANCH PROB at 0.95 the tree outgrows the lattice and repeated
// motifs appear below the level where a pixel could resolve one. That
// is the same honest trade dissipation states for its shift register,
// and it is the trade the lattice imposes rather than a choice.
//
// KEEL is dead at its default and is written anyway, because the
// shader writes it: the lever ships at zero, where the subtraction is
// exactly nothing, and an operator who turns it up gets the shader's
// own behaviour, each branch subtree translating rigidly with its
// attachment so the channel lies in the strip's band at any scale.
import { positive, lever, pal, mul3, mix, len2 } from "../core/measure.mjs";

export default positive("breakdown_pos", {
  depth:  lever("DEPTH",        4,    22,   1,     16),
  prob:   lever("BRANCH PROB",  0.35, 0.95, 0.01,  0.72),
  angle:  lever("BRANCH ANGLE", 12,   80,   1,     38),
  contr:  lever("CONTRACTION",  0.55, 0.86, 0.005, 0.70),
  wander: lever("WANDER",       0,    1,    0.01,  0.4),
  tip:    lever("TIP GLOW",     0,    1,    0.01,  0.6),
  span:   lever("SPAN",         1.2,  3.2,  0.05,  2.6),
  keel:   lever("KEEL",         0,    1,    0.01,  0),
  cam: { dist: 3.0, pitch: 0.16, tgtY: 0.0, rot: 0.0 },
  gain: 0.55, accent: "#b48cff",
},
(P, s) => {
  // equal budget per level, so the zoom never starves. This is the
  // draw that decides how far down the hierarchy the point walks, and
  // it is the orbit's bound directly, which is how the emitted loop
  // breaks exactly where the shader's `if (l >= d) break;` does.
  const d = s.depth(P.depth);

  // and this is where along the trunk the point's limb hangs
  const segTarget = s.pick(24);

  const segLen = P.span / 24.0;
  const angRad = P.angle * 0.0174533;

  // THE TRUNK, twenty four segments marching along +x. The wander
  // angle belongs to the segment INDEX and not to the point, so every
  // point in the frame walks the same channel and the trunk is one
  // curve rather than a smear of them. The mean reversion toward +x is
  // the field winning against the wander; a rotation of a unit vector
  // is already unit, so that mix is the only step here that has to be
  // renormalised, which is the census's first find on this plate. The
  // divisor is floored although it cannot reach zero: mixing a unit
  // vector 0.78 of the way toward (1, 0) leaves a length of at least
  // 0.56, so the floor never binds and only makes the division total.
  const T = s.orbit(24, {
    px: -0.5 * P.span, py: 0.0, dx: 1.0, dy: 0.0, i: 0.0,
  }, (v, i) => {
    const w = s.vnoise(i, 0.0, 101) * 1.6 * P.wander;
    const c = Math.cos(w * 0.35);
    const sn = Math.sin(w * 0.35);
    const rx = v.dx * c - v.dy * sn;
    const ry = v.dx * sn + v.dy * c;
    const mx = mix(rx, 1.0, 0.22);
    const my = mix(ry, 0.0, 0.22);
    const ml = Math.max(len2(mx, my), 1.0e-6);
    const ndx = mx / ml;
    const ndy = my / ml;
    return {
      px: v.px + ndx * segLen,
      py: v.py + ndy * segLen,
      dx: ndx, dy: ndy,
      i: v.i + 1.0,
    };
  }, { until: (v) => v.i >= segTarget });

  // The branch chain hangs off the trunk where the point left it, so
  // its root address is the trunk segment's. The segment index is
  // hashed into the lattice rather than used as a cell directly, so a
  // root and a node twenty levels down are drawn from the same
  // distribution of cells and neither crowds the other.
  const rax = Math.min(Math.floor((s.vnoise(segTarget, 0.0, 601) + 0.5) * 1024.0), 1023.0);
  const ray = Math.min(Math.floor((s.vnoise(segTarget, 0.0, 607) + 0.5) * 1024.0), 1023.0);

  // Does the root node branch at all? The survival draw belongs to the
  // node, not to the point, so it is read here and carried into the
  // orbit: `until` sees the state before the step, which is exactly
  // where the shader tests a starved limb and dies.
  const live0 = s.vnoise(rax, ray, 1000) + 0.5;

  // THE BREAKDOWN HIERARCHY. Each level turns by the node's own
  // hashed jitter about the branch angle, contracts by the physics
  // dial, and thins by a fixed 0.62, and the walking point rides the
  // orbit beside the rolling address that decides all of it. The fork
  // is the point's draw and the geometry is the address's, which is
  // the division of labour the whole plate is built on.
  const B = s.orbit(d, {
    px: T.px, py: T.py, dx: T.dx, dy: T.dy,
    len: segLen, wid: 0.012,
    ax: rax, ay: ray, live: live0,
  }, (v, k) => {
    const r = s.u();
    const side = (r < 0.5) ? -1.0 : 1.0;
    const bit = (r < 0.5) ? 0 : 1;
    const jit = s.vnoise(v.ax, v.ay, 2000 + k * 2 + bit) * 0.7;
    const a = side * angRad * (1.0 + jit);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const nlen = v.len * P.contr;
    const ndx = v.dx * c - v.dy * sn;
    const ndy = v.dx * sn + v.dy * c;
    // the child's cell, hashed from the parent's cell and the fork
    const cx = s.vnoise(v.ax, v.ay, 3000 + k * 2 + bit) + 0.5;
    const cy = s.vnoise(v.ax, v.ay, 4000 + k * 2 + bit) + 0.5;
    const nax = Math.min(Math.floor(cx * 1024.0), 1023.0);
    const nay = Math.min(Math.floor(cy * 1024.0), 1023.0);
    return {
      px: v.px + ndx * nlen,
      py: v.py + ndy * nlen,
      dx: ndx, dy: ndy,
      len: nlen,
      wid: v.wid * 0.62,
      ax: nax, ay: nay,
      live: s.vnoise(nax, nay, 1000 + k + 1) + 0.5,
    };
  }, { until: (v) => v.live > P.prob });

  const lived = B.count;

  // The seat along the final filament, and the texture cell it falls
  // in. The shader draws one uniform and takes floor(t * 97) for the
  // cell; the cell is drawn first here and the uniform built back out
  // of it, which is the same joint law and is the only way the cell
  // reaches the octave as an integer. Ninety seven cells along each
  // run is what makes the channel a run of hashed grain rather than a
  // smooth tube.
  const tc = s.pick(97);
  const tt = (tc + s.u()) / 97.0;

  const bx = B.px - B.dx * B.len * (1.0 - tt);
  const by = B.py - B.dy * B.len * (1.0 - tt);
  const wLocal = B.wid * mix(1.15, 0.62, tt);

  // Current crowds the channel's surface, so the transverse seat is
  // bank weighted into twin rails instead of an airbrushed capsule,
  // and the width tapers toward the child it feeds so a limb meets its
  // twigs instead of fading beside them. The floor under the magnitude
  // is there for the one draw that lands exactly on the middle: the
  // sign is zero there and kills the term either way, but the floor is
  // what keeps a pinned pow from being handed a logarithm of zero. Any
  // other draw is at least 1e-7 from the middle, so it never binds.
  const uu = 2.0 * s.u() - 1.0;
  const bank = Math.sign(uu)
             * Math.pow(Math.max(Math.abs(uu), 1.0e-30), 0.30) * 0.5;
  const core = s.centered() * 0.35;
  const off = (bank + core) * wLocal;
  const seatx = bx - B.dy * off;
  const seaty0 = by + B.dx * off;

  // The keel subtracts the walk's own accumulated height. A point that
  // never branched has no attachment above it, so it subtracts its own
  // seat; every other point subtracts the trunk's landing, which is
  // what translates a whole subtree rigidly instead of shearing it.
  const yRef = (lived == 0) ? by : T.py;
  const seaty = seaty0 - P.keel * yRef;
  const z = s.centered() * wLocal * 2.0;

  // the channel is not uniform: hashed micro-texture along its run
  const tex = 0.7 + 0.6 * (s.vnoise(B.ax, B.ay, 5000 + tc) + 0.5);

  // colour reads the level reached, so the figure is graded by the
  // hierarchy that made it: hot at the trunk, and TIP GLOW brings the
  // far twigs back up
  const lv = lived / Math.max(P.depth, 1.0);
  const hot = 1.0 - lv;
  return s.deposit({
    xyz: [seatx, seaty * 0.92, z],
    col: mul3(pal(0.62 + 0.25 * lv,
                  [0.42, 0.36, 0.52], [0.5, 0.45, 0.5],
                  [1.0, 0.85, 0.7], [0.05, 0.2, 0.45]),
              (0.5 + 1.6 * hot * hot + P.tip * lv * lv * 1.8) * tex),
  });
});
