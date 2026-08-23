// Plate LIX The Drainage Basin, as a positive. Rain falls without a
// plan and every landscape still drains through the same architecture:
// rivulets into creeks into rivers, junction by junction, under
// scaling laws so stable that a hillside gully and the Amazon are the
// same picture at two magnifications. The basin here is grown by those
// laws. A trunk river meanders seaward in twenty four reaches; a point
// leaves it at one of them and climbs the orders, each tributary
// joining at the junction angle, shorter than its parent by the length
// ratio, and wandering more the smaller it gets, because a big river is
// held straight by its own discharge and a headwater is not. Depth is
// drawn uniformly, so every order of stream receives the same sample
// budget and a gully resolves the way the river does.
//
// THE BASIN IS ADDRESSED, WHICH DECIDES THE SHAPE OF THIS WALK. In the
// shader every reach of the trunk and every junction of every tributary
// hangs off a hash chain, not off the point's own randomness, and that
// is the whole plate: the thousands of points that walk the same
// tributary must agree about where it bends, or there are no streams,
// only a fog in the shape of a basin. The stream cannot say that. It is
// the point's own budget, and two points asking it for a junction
// jitter get two jitters. s.vnoise is the engine's field, addressed by
// the lattice cell and the octave and by nothing else, answering the
// same for every point that asks however many draws came before it, so
// it is what an address wants. Read at whole integer coordinates its
// interpolation weights are exactly zero and what comes back is the
// corner hash itself, a uniform on [-0.5, 0.5), which is precisely the
// shader's own (u2f(addr) - 0.5).
//
// WHAT RIDES WHERE. The trunk's twenty four reaches are addressed by
// the reach index alone, so the index is the cell. The tributary's
// address is a PATH rather than an index, and a path cannot be a uint
// chain here because an orbit's fields are floats, so it rides as a
// shift register over the side bits, the way LXII's cascade rides its
// child digits and LVII's tree its forks. The lattice folds at 1024 in
// each coordinate, so the two together hold twenty bits, and the
// register is laid across both: the low word takes each new fork and
// the high word catches the bit the low word loses. DEPTH reaches
// twenty two, so twenty junctions of every path are held exactly and
// only the last two can alias, which is honest about what the lattice
// holds and is far below the point where it could be seen: at defaults
// the tenth junction's reach is already 8e-4 wide against a span of
// 2.8, under two thirds of a pixel at 2048, and every junction after
// it is half the one before.
//
// The reach the basin hangs off and the ORDER of the junction ride in
// the OCTAVE rather than the cell. The reach because the shader seeds
// this chain from the trunk's own address, so it is part of the
// address and not an attribute; the order because path 1 at the first
// junction and path 0,0,1 at the third leave the same bits in the
// register, and the shader's chain tells them apart by its length. The
// three attributes of a junction are separated by octave too, so no
// two attributes of any two junctions can collide.
//
// What the point draws for itself is what the shader draws from pt and
// rnd: how far up the orders it walks, which reach it leaves from,
// which side each junction takes, its seat along the last reach, and
// the two numbers that throw it off the centreline onto the bank.
// Those are stream draws. Their values differ from the shader's and
// their law does not.
import { positive, lever, pal, mix, mod, len2 } from "../core/measure.mjs";

export default positive("drainage_pos", {
  depth:  lever("DEPTH",        4,   22,   1,     15),
  junc:   lever("JUNCTION DEG", 30,  85,   1,     58),
  lratio: lever("LENGTH RATIO", 0.4, 0.62, 0.005, 0.52),
  wander: lever("MEANDER",      0,   1,    0.01,  0.55),
  relief: lever("RELIEF",       0,   0.4,  0.005, 0.12),
  span:   lever("SPAN",         1.2, 3.2,  0.05,  2.8),
  flow:   lever("FLOW GLOW",    0,   1,    0.01,  0.5),
  keel:   lever("KEEL",         0,   1,    0.01,  0),
  cam: { dist: 3.0, pitch: 0.2, tgtY: 0.0, rot: 0.0 },
  gain: 0.55, accent: "#6fb3e0",
},
(P, s) => {
  const angRad = P.junc * 0.0174533;
  const segLen = P.span / 24.0;

  // the budget: how far up the orders this point climbs, uniform, so
  // the gullies are sampled as densely as the trunk
  const d = s.depth(P.depth);

  // and which of the trunk's twenty four reaches its basin hangs off
  const segT = s.pick(24);

  // THE TRUNK RIVER, meandering seaward from the western edge. Each
  // reach turns by its own addressed angle and is then pulled back
  // toward due east by a third, which is what keeps a trunk a trunk
  // rather than a random walk. The pull is also what makes the
  // normalise safe: mixing any unit vector three tenths of the way to
  // (1, 0) leaves a length of at least 0.4, so the floor below is a
  // proof obligation discharged rather than a value ever taken.
  const T = s.orbit(24, {
    px: -0.5 * P.span, py: 0.0, dx: 1.0, dy: 0.0, n: 0.0,
  }, (v, k) => {
    const w = s.vnoise(k, 0.0, 997) * 2.2 * P.wander;
    const c = Math.cos(w * 0.30);
    const sn = Math.sin(w * 0.30);
    const rx = v.dx * c - v.dy * sn;
    const ry = v.dx * sn + v.dy * c;
    const mx = mix(rx, 1.0, 0.30);
    const my = mix(ry, 0.0, 0.30);
    const L = Math.max(len2(mx, my), 1.0e-9);
    const nx = mx / L;
    const ny = my / L;
    return {
      px: v.px + nx * segLen,
      py: v.py + ny * segLen,
      dx: nx, dy: ny,
      n: v.n + 1.0,
    };
  }, { until: (v) => v.n >= segT });
  // the reach count rides as a field because until reads the state and
  // not the index; it stops exactly where the shader's i >= segTarget
  // does, and the seaward height it leaves behind is the datum the keel
  // measures every seat against
  const yBase = T.py;

  // THE TRIBUTARIES, climbing the orders away from the trunk. Each
  // junction takes a side, turns off by the junction angle jittered
  // about it, then meanders by an amount that grows as the stream
  // shrinks, and the reach that follows is shorter than its parent by
  // the length ratio. Width falls by three fifths a level, which is the
  // channel the seat is scattered across further down.
  const B = s.orbit(d, {
    px: T.px, py: T.py, dx: T.dx, dy: T.dy,
    len: segLen * 0.9, wid: 0.010, alo: 0.0, ahi: 0.0,
  }, (v, k) => {
    const coin = s.u();
    const side = (coin < 0.5) ? -1.0 : 1.0;
    const bit = (side < 0.0) ? 0.0 : 1.0;
    // the path, as a twenty bit shift register laid across the two
    // lattice coordinates: the low word takes the fork just made and
    // the high word catches the bit the low word is about to lose,
    // which is twenty junctions held exactly out of the twenty two
    // DEPTH can reach
    const nlo = mod(v.alo * 2.0 + bit, 1024.0);
    const nhi = mod(v.ahi * 2.0 + Math.floor(v.alo / 512.0), 1024.0);
    // the reach the basin hangs off and the ORDER both ride in the
    // octave, the first because the shader seeds this chain from the
    // trunk's own address and the second because two different orders
    // can hold the same bits and must not share a junction
    const oc = 4096 + segT * 66 + 3 * k;

    const jitter = s.vnoise(nlo, nhi, oc + 1) * 0.55;
    const a = side * angRad * (1.0 + jitter);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const rx = v.dx * c - v.dy * sn;
    const ry = v.dx * sn + v.dy * c;

    const mw = s.vnoise(nlo, nhi, oc + 2) * P.wander * (0.4 + 0.08 * k);
    const mc = Math.cos(mw);
    const ms = Math.sin(mw);
    const nx = rx * mc - ry * ms;
    const ny = rx * ms + ry * mc;

    const nl = v.len * (P.lratio + 0.5 * (1.0 - P.lratio)
                        * (s.vnoise(nlo, nhi, oc + 3) + 0.5));
    return {
      px: v.px + nx * nl,
      py: v.py + ny * nl,
      dx: nx, dy: ny,
      len: nl,
      wid: v.wid * 0.60,
      alo: nlo, ahi: nhi,
    };
  });

  // the seat: anywhere along the last reach the point reached, so a
  // stream is drawn by its whole length rather than by its head, and
  // the channel is wider upstream of the seat than downstream of it
  const along = s.u();
  const seatx0 = B.px - B.dx * B.len * (1.0 - along);
  const seaty0 = B.py - B.dy * B.len * (1.0 - along);
  const wLocal = B.wid * mix(1.1, 0.6, along);

  // across the channel: the 0.35 power crowds the light onto the two
  // banks and leaves the thread of the channel itself dark, which is
  // what a river looks like from above. The floor under the absolute
  // value is not the plate's and takes no value the plate can take:
  // sign(0) is 0, so the only argument it changes is an exact zero,
  // where it turns a pow whose logarithm is minus infinity into a
  // finite number that is then multiplied by that zero regardless.
  const u = 2.0 * s.u() - 1.0;
  const bank = Math.sign(u)
             * Math.pow(Math.max(Math.abs(u), 1.0e-30), 0.35) * 0.5;
  const off = bank + s.centered() * 0.3;
  const seatx = seatx0 + (-B.dy) * off * wLocal;
  const seaty1 = seaty0 + B.dx * off * wLocal;

  // the keel: a point that never left the trunk is measured against its
  // own seat, everything else against the height the trunk had reached
  // where the basin hangs off it
  const yRef = (B.count == 0) ? seaty0 : yBase;
  const seaty = seaty1 - P.keel * yRef;

  // relief: headwaters sit high on the divide and the trunk lies in its
  // valley, so the order of a stream is also its altitude
  const lv = B.count / Math.max(P.depth, 1.0);
  const z = lv * P.relief + s.centered() * wLocal * 2.0;

  const order = 1.0 - lv;
  return s.deposit({
    xyz: [seatx, seaty * 0.92, z],
    col: pal(0.55 + 0.18 * lv,
             [0.40, 0.46, 0.50], [0.45, 0.42, 0.38],
             [0.9, 0.8, 1.0], [0.52, 0.30, 0.15]),
    glow: 0.45 + 1.5 * order * order + P.flow * lv * 0.9,
  });
});
