// Plate XXVI The Mandelbulb, as a positive. Each point probes a ball
// of space: a spherical direction from q, a radius from one draw with
// the cube root that makes the ball uniform. The invented 3D power
// map raises radius to n and multiplies both angles by n; the orbit
// carries the trap. Quick escapers are discarded below SHELL CUT, the
// boundary blazes, the trapped interior glows dim. Orbit fields are
// single expressions, so the radius, the two angles and the power all
// recompute inside each coordinate where the shader bound them once,
// value-identical at every site.
import { positive, lever, pal, mul3, clamp, TAU, len3 } from "../core/measure.mjs";

export default positive("bulb_pos", {
  power: lever("POWER n",     2,  12,  0.05,  8),
  iters: lever("ITERATIONS",  6,  16,  1,     10),
  cut:   lever("SHELL CUT",   0,  0.9, 0.01,  0.45),
  mode:  lever("MODE",        0,  1,   1,     0),
  jx:    lever("JULIA X",    -1,  1,   0.005, 0.2),
  jy:    lever("JULIA Y",    -1,  1,   0.005, 0.0),
  glow:  lever("GLOW",        0,  1,   0.01,  0.6),
  cam: { dist: 3.0, pitch: 0.22, tgtY: 0.0, rot: 0.05 },
  gain: 0.6, accent: "#ff7a6a",
},
(P, s, q) => {
  const power = P.power;

  // the probe: direction from the point's own coordinate, radius from
  // one draw, cube-rooted so the ball fills uniformly
  const ct = 1.0 - 2.0 * q.x;
  const st = Math.sqrt(Math.max(0.0, 1.0 - ct * ct));
  const ph = TAU * q.y;
  const rad = 1.3 * Math.pow(s.u(), 0.33333);
  const posx = st * Math.cos(ph) * rad;
  const posy = ct * rad;
  const posz = st * Math.sin(ph) * rad;

  // Mandelbrot mode iterates from zero with c the probe; Julia mode
  // iterates from the probe with c the fixed constant
  const mode = Math.floor(P.mode + 0.5);
  const zx0 = (mode == 0.0) ? 0.0 : posx;
  const zy0 = (mode == 0.0) ? 0.0 : posy;
  const zz0 = (mode == 0.0) ? 0.0 : posz;
  const ccx = (mode == 0.0) ? posx : P.jx;
  const ccy = (mode == 0.0) ? posy : P.jy;
  const ccz = (mode == 0.0) ? posz : 0.0;
  const K = P.iters;

  // the spherical power map z -> z^n + c: r^n, theta n, phi n, checked
  // for escape past radius 2 before each step, exactly the shader's
  // order (budget break, then escape, then update)
  const o = s.orbit(P.iters, { x: zx0, y: zy0, z: zz0 }, (z) => ({
    x: Math.pow(len3(z.x, z.y, z.z), power)
       * Math.sin(Math.acos(clamp(z.y / Math.max(len3(z.x, z.y, z.z), 1.0e-6), -1.0, 1.0)) * power)
       * Math.cos(Math.atan2(z.z, z.x) * power) + ccx,
    y: Math.pow(len3(z.x, z.y, z.z), power)
       * Math.cos(Math.acos(clamp(z.y / Math.max(len3(z.x, z.y, z.z), 1.0e-6), -1.0, 1.0)) * power) + ccy,
    z: Math.pow(len3(z.x, z.y, z.z), power)
       * Math.sin(Math.acos(clamp(z.y / Math.max(len3(z.x, z.y, z.z), 1.0e-6), -1.0, 1.0)) * power)
       * Math.sin(Math.atan2(z.z, z.x) * power) + ccz,
  }), { until: (z) => len3(z.x, z.y, z.z) > 2.0 });

  // esc is the step count at escape, -1 for the trapped
  const esc = o.escaped ? o.count : -1;
  if (esc >= 0.0 && esc < P.cut * K) { return s.decline(); }

  const glowE = (esc < 0.0) ? 0.35 : 1.4;
  const hue = (esc < 0.0) ? rad * 0.4 : esc / K;
  return s.deposit({
    xyz: [posx * 0.95, posy * 0.95, posz * 0.95],
    col: mul3(mul3(pal(hue * 0.6 + 0.1, [0.5, 0.4, 0.35], [0.5, 0.4, 0.4],
                       [1.0, 0.9, 0.7], [0.1, 0.3, 0.5]),
                   glowE),
              0.6 + 0.7 * P.glow),
  });
});
