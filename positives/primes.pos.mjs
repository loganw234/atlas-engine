// Plate XXIX The Prime Spirals, as a positive - the sieve spoken as
// an orbit. Each point owns one whole number (or one Gaussian
// lattice site) and asks the only question: is it prime? The plate's
// trial-division helper is restated as an orbit whose state walks
// d = 3, 5, 7... and latches a flag on the first divisor; the
// helper's early returns for 0, 1, 2, 3 and the evens fold into the
// verdict afterward. Integers ride as exact small floats, so the
// helper's int remainders become mod() on values that are integers,
// and the shader's int() casts become sign times floor of the
// magnitude, the same truncation toward zero.
import { positive, lever, pal, fract, mod, TAU, v3 } from "../core/measure.mjs";

export default positive("primes_pos", {
  mode:   lever("MODE",        0,    2,     1,    0),
  extent: lever("EXTENT N",    1000, 40000, 100,  20000),
  scale:  lever("SCALE",       0.5,  1.8,   0.01, 1.0),
  cycle:  lever("COLOR CYCLE", 0,    3,     0.01, 1.0),
  glow:   lever("GLOW",        0,    1,     0.01, 0.7),
  cam: { dist: 3.4, pitch: 0.7, tgtY: 0.0, rot: 0.04 },
  gain: 0.9, accent: "#ffd08a",
},
(P, s, q, t) => {
  const md = Math.floor(P.mode + 0.5);
  const N = P.extent;

  let sx = 0.0, sz = 0.0;
  let tint = v3(0.0, 0.0, 0.0);

  if (md < 2.0) {
    // Sacks and Vogel: the point's own whole number, dealt off q.x
    const n = Math.floor(q.x * N) + 2.0;

    // trial division by the odds, stopping when d*d passes n or a
    // divisor has already answered
    const tv = s.orbit(159, { d: 3.0, comp: 0.0 }, (v) => ({
      d: v.d + 2.0,
      comp: (mod(n, v.d) < 0.5) ? 1.0 : v.comp,
    }), { until: (v) => v.d * v.d > n || v.comp > 0.5 });
    const isp = (n < 2.0) ? 0.0 : (n < 4.0) ? 1.0
              : (mod(n, 2.0) < 0.5) ? 0.0 : (1.0 - tv.comp);
    if (isp < 0.5) {
      return s.decline();
    }

    // the square-root spiral, or the sunflower, lit only at primes
    const r = Math.sqrt(n);
    const ang = (md == 0.0) ? TAU * Math.sqrt(n) : n * 2.39996323;
    sx = r * Math.cos(ang) * P.scale * 0.06;
    sz = r * Math.sin(ang) * P.scale * 0.06;
    tint = pal(fract(Math.sqrt(n) * 0.1 * P.cycle) + 0.1,
               [0.5, 0.45, 0.4], [0.5, 0.45, 0.45],
               [1.0, 0.95, 0.85], [0.1, 0.3, 0.5]);
  } else {
    // the Gaussian lattice: the point's own site (a, b)
    const Mx = Math.sqrt(N);
    const ux = Math.floor(q.x * 2.0 * Mx) - Mx;
    const uy = Math.floor(q.y * 2.0 * Mx) - Mx;
    const ga = Math.sign(ux) * Math.floor(Math.abs(ux));
    const gb = Math.sign(uy) * Math.floor(Math.abs(uy));
    const norm = ga * ga + gb * gb;

    // on an axis the site is prime iff the coordinate's magnitude
    // is a rational prime congruent 3 mod 4; off the axes, iff the
    // norm a*a + b*b is prime
    const onax = ga == 0.0 || gb == 0.0;
    const mm = (ga == 0.0) ? Math.abs(gb) : Math.abs(ga);
    const nn = onax ? mm : norm;
    const tv = s.orbit(159, { d: 3.0, comp: 0.0 }, (v) => ({
      d: v.d + 2.0,
      comp: (mod(nn, v.d) < 0.5) ? 1.0 : v.comp,
    }), { until: (v) => v.d * v.d > nn || v.comp > 0.5 });
    const isp = (nn < 2.0) ? 0.0 : (nn < 4.0) ? 1.0
              : (mod(nn, 2.0) < 0.5) ? 0.0 : (1.0 - tv.comp);
    let gp = 0.0;
    if (onax) {
      gp = (isp > 0.5 && mod(mm, 4.0) == 3.0) ? 1.0 : 0.0;
    } else {
      gp = isp;
    }
    if (gp < 0.5) {
      return s.decline();
    }

    sx = ga * P.scale * 0.05;
    sz = gb * P.scale * 0.05;
    tint = pal(fract(norm * 0.01 * P.cycle) + 0.1,
               [0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
               [1.0, 1.0, 1.0], [0.0, 0.33, 0.67]);
  }

  return s.deposit({
    xyz: [sx, 0.0, sz],
    col: tint,
    glow: 0.5 + 0.7 * P.glow,
  });
});
