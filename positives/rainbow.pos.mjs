// Plate XXXIX The Rainbow, Derived, as a positive. Descartes' argument
// and nothing else: one ray enters a spherical drop at impact parameter
// b, refracts, bounces k times inside, refracts out, and lands at its
// deviation angle D. The bow is never drawn; it ignites where dD/db
// stalls and the exits crowd. Two MODE arms share the whole optical
// preamble and part only at the end, the sky arm seating the ray on the
// viewing sphere and the droplet arm drawing the ray's own polyline
// inside one magnified drop.
import { positive, lever, mix, clamp, smoothstep, mod, TAU, PI, len2 } from "../core/measure.mjs";

export default positive("rainbow_pos", {
  mode:   lever("MODE",       0, 1, 1,    0),
  orders: lever("ORDERS",     1, 4, 1,    2),
  disp:   lever("DISPERSION", 0, 3, 0.01, 1),
  sunw:   lever("SUN WIDTH",  0, 3, 0.01, 1),
  fres:   lever("FRESNEL",    0, 1, 0.01, 1),
  glow:   lever("GLOW",       0, 1, 0.01, 0.5),
  cam: { dist: 2.6, pitch: 0.1, tgtY: 0.0, rot: 0.03 },
  gain: 1.0, accent: "#ffd8b0",
},
(P, s, q, t) => {
  const mode = Math.floor(P.mode + 0.5);
  const M = P.orders - 0.001;
  const dsp = P.disp;
  const sunw = P.sunw;
  const fres = P.fres;
  const glow = P.glow;

  // q.x is the impact parameter, sin i = b. The wavelength is the arc
  // parameter q.y in the sky, and a free draw inside the droplet, where
  // q.y has already been spent walking along a segment.
  const b = q.x;
  let lt = q.y;
  if (mode != 0.0) {
    lt = s.u();
  }
  const lam = mix(400.0, 700.0, lt);

  // Cauchy fit n = 1.3247 + 3088.5/lam^2: n(400) = 1.3440, n(700) =
  // 1.3310. DISPERSION scales the spread about the mean index 1.3375.
  let n = 1.3247 + 3088.5 / (lam * lam);
  n = Math.max(1.3375 + (n - 1.3375) * dsp, 1.05);

  // Snell, once in: i is the incidence angle, tr the refraction angle
  // (the shader's t, renamed because t is the clock here).
  const i = Math.asin(clamp(b, 0.0, 0.999999));
  const st = clamp(b / n, 0.0, 1.0);
  const tr = Math.asin(st);
  const ci = Math.sqrt(Math.max(1.0 - b * b, 1.0e-8));
  const ct = Math.sqrt(Math.max(1.0 - st * st, 1.0e-8));

  // internal-reflection count: importance-sample low k, then divide by
  // the pick probability so brightness stays an unbiased estimate
  // across orders
  const u = s.u();
  let kf = 1.0 + Math.floor(u * u * M);
  if (kf > 4.0) {
    kf = 4.0;
  }
  const psel = Math.max(Math.sqrt(Math.min(kf / M, 1.0)) - Math.sqrt((kf - 1.0) / M), 1.0e-4);

  // Fresnel, unpolarized: s and p tracked separately through
  // transmit-in, k internal bounces, transmit-out, then averaged.
  // Denominators never vanish (n > 1 keeps ct > 0 even as ci -> 0),
  // guarded anyway.
  let rs = (ci - n * ct) / Math.max(ci + n * ct, 1.0e-6);
  rs = clamp(rs * rs, 1.0e-7, 1.0);
  let rp = (n * ci - ct) / Math.max(n * ci + ct, 1.0e-6);
  rp = clamp(rp * rp, 1.0e-7, 1.0);
  const ts = 1.0 - rs;
  const tp = 1.0 - rp;

  const D = 2.0 * (i - tr) + kf * (PI - 2.0 * tr);

  let px = 0.0, py = 0.0, pz = 0.0, w = 0.0;
  if (mode == 0.0) {
    // THE SKY. Antisolar axis = +z; viewing angle folds D into [0, PI].
    // Check: b = 0.86, n = 1.333, k = 1 gives D = 2.407 rad = 137.9
    // deg, tv = 42.1 deg; the k = 2 stationary point folds to ~50.4.
    const wf = 0.5 * (ts * ts * Math.pow(rs, kf) + tp * tp * Math.pow(rp, kf));
    w = mix(1.0, 9.0 * wf, fres) * b / psel;   // b = annulus measure b db
    let tv = Math.abs(mod(D, TAU) - PI);
    // the sun is not a point: a triangular jitter of about half a
    // degree smears every landing across the solar disc
    const gA = s.u();
    const gB = s.u();
    const gj = gA + gB - 1.0;
    tv = clamp(tv + gj * 0.008727 * sunw, 0.0, PI);
    const al = s.u() * TAU;
    px = 1.25 * (Math.sin(tv) * Math.cos(al));
    py = 1.25 * (Math.sin(tv) * Math.sin(al));
    pz = 1.25 * Math.cos(tv);
  } else {
    // THE DROPLET. Unit circle, beam along +x at height b; entry point
    // at angle a0 = PI - i, each internal chord advances the contact
    // point by -(PI - 2 tr), and the chord from vertex m has direction
    // angle (tr - i) - m(PI - 2 tr), so the exit ray leaves along
    // (cos D, -sin D). One draw picks which of the k + 3 segments this
    // point belongs to; q.y walks along it.
    const a0 = PI - i;
    const ca = PI - 2.0 * tr;
    const nseg = kf + 3.0;                     // beam + (k+1) chords + exit ray
    const sd = s.u();
    let sIdx = Math.floor(sd * nseg * 0.99999);
    if (sIdx > kf + 2.0) {
      sIdx = kf + 2.0;
    }
    let ax = 0.0, ay = 0.0, bx = 0.0, by = 0.0;
    let es = 0.0, ep = 0.0;                    // light left in each polarization
    if (sIdx == 0.0) {
      bx = Math.cos(a0);
      by = Math.sin(a0);
      ax = bx - 0.7;
      ay = by - 0.0;
      es = 1.0;
      ep = 1.0;
    } else if (sIdx <= kf + 1.0) {
      const m0 = sIdx - 1.0;
      ax = Math.cos(a0 - m0 * ca);
      ay = Math.sin(a0 - m0 * ca);
      bx = Math.cos(a0 - (m0 + 1.0) * ca);
      by = Math.sin(a0 - (m0 + 1.0) * ca);
      es = ts * Math.pow(rs, m0);
      ep = tp * Math.pow(rp, m0);
    } else {
      ax = Math.cos(a0 - (kf + 1.0) * ca);
      ay = Math.sin(a0 - (kf + 1.0) * ca);
      bx = ax + 0.95 * Math.cos(D);
      by = ay + 0.95 * (-Math.sin(D));
      es = ts * ts * Math.pow(rs, kf);
      ep = tp * tp * Math.pow(rp, kf);
    }
    const segLen = len2(bx - ax, by - ay);
    const p2x = mix(ax, bx, q.y);
    const p2y = mix(ay, by, q.y);
    w = mix(1.0, 0.5 * (es + ep), fres) * clamp(segLen, 0.05, 2.0) * 0.9;
    // Descartes' sweep: one lit pencil of rays drifts through b and
    // visibly stalls where dD/db = 0, the only intrinsic motion here
    const b0 = 0.5 + 0.45 * Math.sin(0.3 * t);
    w *= 1.0 + 0.7 * Math.exp(-(b - b0) * (b - b0) / 0.0009);
    px = 0.72 * p2x;
    py = 0.72 * p2y;
    pz = 0.0;
  }

  // spectral colour, lt = 0 (400nm violet) to 1 (700nm red); each
  // channel is a product/sum of smoothsteps, so it is never negative
  // and sums near-neutral
  const lc = clamp(lt, 0.0, 1.0);
  const cr = smoothstep(0.40, 0.62, lc) + 0.30 * (1.0 - smoothstep(0.02, 0.22, lc));
  const cg = smoothstep(0.10, 0.36, lc) * (1.0 - smoothstep(0.60, 0.88, lc));
  const cb = 1.0 - smoothstep(0.26, 0.50, lc);
  const cw = 0.62 + 0.38 * smoothstep(0.0, 0.10, lc);
  const tone = 0.35 + 0.85 * glow;

  return s.deposit({
    xyz: [px, py, pz],
    col: [cr * cw * w * tone, cg * cw * w * tone, cb * cw * w * tone],
  });
});
