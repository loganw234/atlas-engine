// Plate XLVI The Space-Filling Curve, as a positive - one unbroken
// thread through every cell of the cube. The plate decodes a position
// along the thread into a lattice cell by Skilling's transpose, which
// is written in bits: de-interleave, Gray decode, then undo the excess
// work. The vocabulary has no bitwise operators, so every bit
// operation here is said in arithmetic on exact small integers riding
// as floats, which is what the shader's uints are anyway (a coordinate
// never passes 2^8, a position never passes 2^18).
//
// Three of the four operations are arithmetic outright. A shift is a
// multiply or divide by two, AND with Q-1 for a power of two Q is
// mod(x, Q), and testing bit log2(Q) is mod(floor(x/Q), 2). The two
// bit tricks inside the excess-work loop are, once read, not really
// bitwise at all: XOR with the mask M = Q-1 complements the low bits,
// x - 2 mod(x, Q) + Q - 1, and the three-line t = (x^y)&M, x ^= t,
// y ^= t is an exchange of the low bits of x and y, which the plate's
// own comment gives away when it calls i = 0 a self-exchange. Only the
// Gray decode needs a general XOR of two whole words, and that one is
// spelled bit by bit as a sum over the eight bits an ORDER can reach.
//
// The excess-work loop's three stages read each other's output within
// one turn, which a simultaneous orbit cannot do, so the orbit takes
// three steps per turn of the shader's loop: stage k mod 3, with Q
// doubling on the last of each three. Q can only reach top at a stage
// boundary, so until says exactly what the shader's break says.
import { positive, lever, pal, mix, mod, sum } from "../core/measure.mjs";

export default positive("hilbert_pos", {
  dim:   lever("DIMENSION",   2, 3, 1,    3),
  order: lever("ORDER",       1, 8, 1,    4),
  mort:  lever("MORTON",      0, 1, 1,    0),
  tube:  lever("TUBE",        0, 1, 0.01, 0.25),
  cycle: lever("COLOR CYCLE", 0, 3, 0.01, 1.0),
  glow:  lever("GLOW",        0, 1, 0.01, 0.7),
  cam: { dist: 3.1, pitch: 0.3, tgtY: 0, rot: 0.05 },
  gain: 0.9, accent: "#ffb890",
},
(P, s, q, t) => {
  const D = (P.dim > 2.5) ? 3.0 : 2.0;
  let ord = Math.floor(P.order + 0.5);
  if (ord < 1.0) {
    ord = 1.0;
  }
  if (D == 3.0 && ord > 6.0) {
    ord = 6.0;                          // 8^6 cells is the 3D ceiling
  }
  const morton = P.mort > 0.5;
  const nb = D * ord;                   // at most 3*6 = 18 or 2*8 = 16
  const cells = Math.pow(2.0, nb);
  const top = Math.pow(2.0, ord);

  // the point's own place along the thread, and its successor: the
  // deposit lies on the segment joining their two cells
  const na = Math.min(Math.floor(q.x * (cells - 1.0)), cells - 2.0);
  const nz = na + 1.0;

  // Step 1: distribute the nb bits round robin from the most
  // significant end, axis = bit position mod D. pw walks the place
  // value down, halving exactly, and j counts the bits spent.
  const A = s.orbit(18, { x0: 0.0, x1: 0.0, x2: 0.0, pw: Math.pow(2.0, nb - 1.0), j: 0.0 }, (v, k) => ({
    x0: (mod(k, D) == 0.0) ? v.x0 * 2.0 + mod(Math.floor(na / v.pw), 2.0) : v.x0,
    x1: (mod(k, D) == 1.0) ? v.x1 * 2.0 + mod(Math.floor(na / v.pw), 2.0) : v.x1,
    x2: (mod(k, D) == 2.0) ? v.x2 * 2.0 + mod(Math.floor(na / v.pw), 2.0) : v.x2,
    pw: v.pw / 2.0,
    j: v.j + 1.0,
  }), { until: (v) => v.j >= nb });
  const B = s.orbit(18, { x0: 0.0, x1: 0.0, x2: 0.0, pw: Math.pow(2.0, nb - 1.0), j: 0.0 }, (v, k) => ({
    x0: (mod(k, D) == 0.0) ? v.x0 * 2.0 + mod(Math.floor(nz / v.pw), 2.0) : v.x0,
    x1: (mod(k, D) == 1.0) ? v.x1 * 2.0 + mod(Math.floor(nz / v.pw), 2.0) : v.x1,
    x2: (mod(k, D) == 2.0) ? v.x2 * 2.0 + mod(Math.floor(nz / v.pw), 2.0) : v.x2,
    pw: v.pw / 2.0,
    j: v.j + 1.0,
  }), { until: (v) => v.j >= nb });

  // Z-order stops at the de-interleave: the same cells, visited in an
  // order that teleports across the cube
  let ca0 = A.x0, ca1 = A.x1, ca2 = A.x2;
  let cb0 = B.x0, cb1 = B.x1, cb2 = B.x2;

  if (!morton) {
    // Step 2, the Gray decode. t is taken from the top word before
    // anything moves, and each assignment reads the word its
    // neighbour had on entry, so the three lines are simultaneous.
    const ta = (D == 3.0) ? Math.floor(A.x2 / 2.0) : Math.floor(A.x1 / 2.0);
    const a0 = sum(8, (b) => mod(Math.floor(A.x0 / Math.pow(2.0, b)) + Math.floor(ta / Math.pow(2.0, b)), 2.0) * Math.pow(2.0, b));
    const a1 = sum(8, (b) => mod(Math.floor(A.x1 / Math.pow(2.0, b)) + Math.floor(A.x0 / Math.pow(2.0, b)), 2.0) * Math.pow(2.0, b));
    const a2x = sum(8, (b) => mod(Math.floor(A.x2 / Math.pow(2.0, b)) + Math.floor(A.x1 / Math.pow(2.0, b)), 2.0) * Math.pow(2.0, b));
    const a2 = (D == 3.0) ? a2x : A.x2;
    const tb = (D == 3.0) ? Math.floor(B.x2 / 2.0) : Math.floor(B.x1 / 2.0);
    const b0 = sum(8, (b) => mod(Math.floor(B.x0 / Math.pow(2.0, b)) + Math.floor(tb / Math.pow(2.0, b)), 2.0) * Math.pow(2.0, b));
    const b1 = sum(8, (b) => mod(Math.floor(B.x1 / Math.pow(2.0, b)) + Math.floor(B.x0 / Math.pow(2.0, b)), 2.0) * Math.pow(2.0, b));
    const b2x = sum(8, (b) => mod(Math.floor(B.x2 / Math.pow(2.0, b)) + Math.floor(B.x1 / Math.pow(2.0, b)), 2.0) * Math.pow(2.0, b));
    const b2 = (D == 3.0) ? b2x : B.x2;

    // Step 3: undo the excess work, three stages to a turn. A set bit
    // at Q complements the low bits of x0; a clear one exchanges the
    // low bits of x0 with the word being tested. The third stage is
    // the i = 0 case, whose exchange with itself is nothing.
    const AE = s.orbit(21, { x0: a0, x1: a1, x2: a2, Q: 2.0 }, (v, k) => ({
      x0: (k % 3 == 0)
          ? ((D == 3.0)
              ? ((mod(Math.floor(v.x2 / v.Q), 2.0) > 0.5)
                  ? v.x0 - 2.0 * mod(v.x0, v.Q) + v.Q - 1.0
                  : v.x0 - mod(v.x0, v.Q) + mod(v.x2, v.Q))
              : v.x0)
          : ((k % 3 == 1)
              ? ((mod(Math.floor(v.x1 / v.Q), 2.0) > 0.5)
                  ? v.x0 - 2.0 * mod(v.x0, v.Q) + v.Q - 1.0
                  : v.x0 - mod(v.x0, v.Q) + mod(v.x1, v.Q))
              : ((mod(Math.floor(v.x0 / v.Q), 2.0) > 0.5)
                  ? v.x0 - 2.0 * mod(v.x0, v.Q) + v.Q - 1.0
                  : v.x0)),
      x1: (k % 3 == 1 && mod(Math.floor(v.x1 / v.Q), 2.0) < 0.5)
          ? v.x1 - mod(v.x1, v.Q) + mod(v.x0, v.Q)
          : v.x1,
      x2: (k % 3 == 0 && D == 3.0 && mod(Math.floor(v.x2 / v.Q), 2.0) < 0.5)
          ? v.x2 - mod(v.x2, v.Q) + mod(v.x0, v.Q)
          : v.x2,
      Q: (k % 3 == 2) ? v.Q * 2.0 : v.Q,
    }), { until: (v) => v.Q == top });
    const BE = s.orbit(21, { x0: b0, x1: b1, x2: b2, Q: 2.0 }, (v, k) => ({
      x0: (k % 3 == 0)
          ? ((D == 3.0)
              ? ((mod(Math.floor(v.x2 / v.Q), 2.0) > 0.5)
                  ? v.x0 - 2.0 * mod(v.x0, v.Q) + v.Q - 1.0
                  : v.x0 - mod(v.x0, v.Q) + mod(v.x2, v.Q))
              : v.x0)
          : ((k % 3 == 1)
              ? ((mod(Math.floor(v.x1 / v.Q), 2.0) > 0.5)
                  ? v.x0 - 2.0 * mod(v.x0, v.Q) + v.Q - 1.0
                  : v.x0 - mod(v.x0, v.Q) + mod(v.x1, v.Q))
              : ((mod(Math.floor(v.x0 / v.Q), 2.0) > 0.5)
                  ? v.x0 - 2.0 * mod(v.x0, v.Q) + v.Q - 1.0
                  : v.x0)),
      x1: (k % 3 == 1 && mod(Math.floor(v.x1 / v.Q), 2.0) < 0.5)
          ? v.x1 - mod(v.x1, v.Q) + mod(v.x0, v.Q)
          : v.x1,
      x2: (k % 3 == 0 && D == 3.0 && mod(Math.floor(v.x2 / v.Q), 2.0) < 0.5)
          ? v.x2 - mod(v.x2, v.Q) + mod(v.x0, v.Q)
          : v.x2,
      Q: (k % 3 == 2) ? v.Q * 2.0 : v.Q,
    }), { until: (v) => v.Q == top });

    ca0 = AE.x0;
    ca1 = AE.x1;
    ca2 = AE.x2;
    cb0 = BE.x0;
    cb1 = BE.x1;
    cb2 = BE.x2;
  }

  // the two cells in the world, the plane case laying the lattice flat
  // in y so the thread runs in x and z
  const sc = 2.4 / top;
  const ax = (ca0 + 0.5) * sc - 1.2;
  const ay = (D == 3.0) ? (ca1 + 0.5) * sc - 1.2 : 0.0;
  const az = (D == 3.0) ? (ca2 + 0.5) * sc - 1.2 : (ca1 + 0.5) * sc - 1.2;
  const bx = (cb0 + 0.5) * sc - 1.2;
  const by = (D == 3.0) ? (cb1 + 0.5) * sc - 1.2 : 0.0;
  const bz = (D == 3.0) ? (cb2 + 0.5) * sc - 1.2 : (cb1 + 0.5) * sc - 1.2;

  // one spot on one segment, fogged across the cell by TUBE
  const jx = s.centered();
  const jy = s.centered();
  const jz = s.centered();
  const fog = 2.0 * sc * P.tube;

  const along = (na + q.y) / (cells - 1.0);
  return s.deposit({
    xyz: [mix(ax, bx, q.y) + jx * fog,
          mix(ay, by, q.y) + jy * fog,
          mix(az, bz, q.y) + jz * fog],
    col: pal(along * P.cycle - t * 0.02,
             [0.52, 0.46, 0.42], [0.48, 0.42, 0.38],
             [1.0, 1.0, 1.0], [0.00, 0.25, 0.50]),
    glow: 0.5 + 0.7 * P.glow,
  });
});
