// Plate LVI The Sky at Nine-Tenths c, as a positive. The ship holds
// its flight axis and the rest-frame sky drifts past it, so every
// direction the plate draws goes through one map: aberration carries
// cos theta to (cos theta + beta) / (1 + beta cos theta), which folds
// the whole rear hemisphere into a cone of half-angle arccos beta,
// twenty-six degrees at beta = 0.9. Three populations ride that same
// map. The graticule is there to make the folding legible, since its
// emission is constant along each curve and the crowding toward the
// flight direction is therefore geometry rather than a drawn density.
// The stars carry the physics: the Doppler factor delta = gamma
// (1 + beta cos theta) shifts each blackbody to delta T and beams its
// bolometric intensity as delta^4, which at beta = 0.99 straight ahead
// is a factor near forty thousand and is why the knee is mandatory.
// The microwave shell is the same delta applied to 2.725 K.
//
// THE CATALOGUE IS THE ONE THING THE STREAM CANNOT SAY. The shader
// gives each point a star index and hashes that index for the star's
// direction, temperature and absolute magnitude, so every point that
// lands on a star agrees about that star. A stream draw cannot do
// that: it is a sequence, and two points reaching the same star have
// drawn a different number of times before they get there. The
// engine's one field primitive is s.vnoise, and read at an exact
// integer lattice site its interpolation weights are exactly zero, so
// it returns that cell's hashed corner and nothing else. That is the
// pinned per-index hash the catalogue needs, and it is the reason the
// index is split into a low ten bits and a high remainder: vnoise
// folds its lattice at 1024, and eight thousand stars have to land in
// eight thousand distinct cells. The split is by 2^-10, exact in
// binary, so no rounding decides which star a point belongs to.
//
// The vec3 helpers cannot carry the geometry here because an emitted
// vec3 has no component access, and the three directions have to be
// taken apart again after every step. So the cross products of the
// tangent basis are written out componentwise, where each product is
// bound to its own precise temporary and cannot be contracted, and
// normalisation is length3 spelled len3 over a guarded divisor.
import {
  positive, lever, mix, mix3, mul3, clamp, step, smoothstep,
  len2, len3, TAU, PI,
} from "../core/measure.mjs";

export default positive("starfield_pos", {
  speed: lever("SPEED",      0,    0.99, 0.001, 0.9),
  grid:  lever("GRID",       0,    1,    1,     1),
  cmb:   lever("CMB",        0,    1,    1,     1),
  count: lever("STAR COUNT", 1000, 8000, 100,   4000),
  tbias: lever("TEMP BIAS",  0,    1,    0.01,  0.65),
  glow:  lever("GLOW",       0,    1,    0.01,  0.5),
  cam: { dist: 0.5, pitch: 0.05, tgtY: 0.0, rot: 0.02 },
  gain: 0.95, accent: "#8fa8ff",
},
(P, s, q, t) => {
  // beta is held short of one so the Lorentz factor stays finite, and
  // the radicand carries its own floor besides: gamma is the first
  // place this subject could reach infinity and it is the last place
  // it should be allowed to.
  const beta = clamp(P.speed, 0.0, 0.995);
  const gam = 1.0 / Math.sqrt(Math.max(1.0 - beta * beta, 1.0e-6));
  const glow = 0.35 + 0.85 * clamp(P.glow, 0.0, 1.0);
  const R = 1.30;

  // the slow yaw of the ship against the rest frame. The flight axis
  // stays put and the sky turns past it.
  const yang = 0.30 + 0.02 * t;
  const yc = Math.cos(yang);
  const ysn = Math.sin(yang);

  // one draw splits the point budget between the three populations,
  // and each toggle either claims its share or leaves it to the stars
  const fGrid = step(0.5, P.grid) * 0.25;
  const fCmb = step(0.5, P.cmb) * 0.20;
  const gsel = s.u();

  if (gsel < fGrid) {
    // THE GRATICULE. Twelve meridians and five parallels of the rest
    // frame sphere, each sampled uniformly in its own arclength, then
    // pushed through exactly the aberration the stars get. Emission is
    // constant along a curve, so what the eye reads as brightening
    // toward the flight direction is the map and nothing else.
    const gkind = s.u();
    const gwhich = s.u();
    const merid = gkind < 0.5;
    const th = merid
      ? mix(0.03 * PI, 0.97 * PI, q.x)
      : (Math.floor(gwhich * 5.0) + 1.0) * (PI / 6.0);
    const lo = merid
      ? Math.floor(gwhich * 12.0) * (TAU / 12.0)
      : q.x * TAU;
    const sth = Math.sin(th);
    // a parallel at colatitude theta is shorter than the equator by
    // sin theta, and the weight puts its linear density back
    const w = merid ? 1.0 : 0.60 * sth;

    const dx = sth * Math.cos(lo);
    const dy = sth * Math.sin(lo);
    const dz = Math.cos(th);
    const rx = yc * dx + ysn * dz;
    const ry = dy;
    const rz = -ysn * dx + yc * dz;

    // aberration about the flight axis, which is -z so that the beamed
    // forward sky faces the plate's home camera. The denominator is at
    // least 1 - beta for every legal beta and is floored anyway.
    const mu = clamp(-rz, -1.0, 1.0);
    const den = Math.max(1.0 + beta * mu, 1.0e-4);
    const mup = clamp((mu + beta) / den, -1.0, 1.0);
    const sp = Math.sqrt(Math.max(1.0 - mup * mup, 0.0));
    const lt = len2(rx, ry);
    const on = step(1.0e-7, lt);
    const ld = Math.max(lt, 1.0e-7);
    const px = mix(1.0, rx / ld, on) * sp;
    const py = mix(0.0, ry / ld, on) * sp;
    const pz = -mup;

    // a tangent basis at the aberrated direction. The reference vector
    // swaps away from z near the poles so the cross product is never
    // near zero, and its length is floored regardless.
    const rfx = step(0.9, Math.abs(pz));
    const rfz = 1.0 - rfx;
    const c1x = py * rfz + 1.0e-9;
    const c1y = pz * rfx - px * rfz + 1.0e-9;
    const c1z = -py * rfx + 1.0e-9;
    const cl = Math.max(len3(c1x, c1y, c1z), 1.0e-9);
    const t1x = c1x / cl;
    const t1y = c1y / cl;
    const t1z = c1z / cl;
    const t2x = py * t1z - pz * t1y;
    const t2y = pz * t1x - px * t1z;
    const t2z = px * t1y - py * t1x;

    const jau = s.u();
    const jru = s.u();
    const ja = TAU * jau;
    const jr = 0.0022 * Math.sqrt(Math.max(jru, 0.0));
    const ca = Math.cos(ja);
    const sa = Math.sin(ja);
    const ox = px + (t1x * ca + t2x * sa) * jr + 1.0e-9;
    const oy = py + (t1y * ca + t2y * sa) * jr + 1.0e-9;
    const oz = pz + (t1z * ca + t2z * sa) * jr + 1.0e-9;
    const ol = Math.max(len3(ox, oy, oz), 1.0e-9);
    return s.deposit({
      xyz: [ox / ol * R, oy / ol * R, oz / ol * R],
      col: mul3([0.42, 0.60, 1.00], 0.060 * w * glow),
    });
  }

  if (gsel < fGrid + fCmb) {
    // THE MICROWAVE SHELL. The temperature of a blackbody transforms
    // by the same delta that beams the starlight, so T' = 2.725 delta,
    // and at the beta of the solar system's own motion that is the
    // three millikelvin dipole the sky actually carries.
    const cz = 2.0 * q.x - 1.0;
    const sz = Math.sqrt(Math.max(1.0 - cz * cz, 0.0));
    const ph = TAU * q.y;
    const dx = sz * Math.cos(ph);
    const dy = sz * Math.sin(ph);
    const dz = cz;
    const rx = yc * dx + ysn * dz;
    const ry = dy;
    const rz = -ysn * dx + yc * dz;

    const mu = clamp(-rz, -1.0, 1.0);
    const dop = gam * (1.0 + beta * mu);
    const den = Math.max(1.0 + beta * mu, 1.0e-4);
    const mup = clamp((mu + beta) / den, -1.0, 1.0);
    const sp = Math.sqrt(Math.max(1.0 - mup * mup, 0.0));
    const lt = len2(rx, ry);
    const on = step(1.0e-7, lt);
    const ld = Math.max(lt, 1.0e-7);
    const px = mix(1.0, rx / ld, on) * sp;
    const py = mix(0.0, ry / ld, on) * sp;
    const pz = -mup;

    // a dim magma ramp across the shifted temperature, seated just
    // outside the star shell so it reads as a backdrop
    const tp = 2.725 * dop;
    const tt = clamp((tp - 1.4) / 9.0, 0.0, 1.0);
    const m1 = mix3([0.06, 0.03, 0.16], [0.42, 0.09, 0.36],
                    smoothstep(0.00, 0.35, tt));
    const m2 = mix3(m1, [0.85, 0.28, 0.20], smoothstep(0.30, 0.68, tt));
    const m3 = mix3(m2, [1.00, 0.78, 0.42], smoothstep(0.62, 1.00, tt));
    const rad = R * 1.06;
    return s.deposit({
      xyz: [px * rad, py * rad, pz * rad],
      col: mul3(m3, (0.030 + 0.075 * tt) * glow),
    });
  }

  // THE STARS. One draw assigns this point to a catalogue entry, and
  // the entry's four attributes come from the lattice cell that entry
  // owns, so the star is a fact about the index rather than about the
  // point. The index is clamped below the count because a draw can
  // return exactly one and the catalogue has no such entry.
  const nst = clamp(P.count, 1000.0, 8000.0);
  const sdraw = s.u();
  const si = Math.min(Math.floor(sdraw * nst), nst - 1.0);
  const shi = Math.floor(si * 0.0009765625);
  const slo = si - shi * 1024.0;
  const a1 = s.vnoise(slo, shi, 101) + 0.5;
  const a2 = s.vnoise(slo, shi, 211) + 0.5;
  const a3 = s.vnoise(slo, shi, 307) + 0.5;
  const a4 = s.vnoise(slo, shi, 401) + 0.5;

  // uniform on the sphere, then yawed into the ship's frame
  const cz = 2.0 * a1 - 1.0;
  const sz = Math.sqrt(Math.max(1.0 - cz * cz, 0.0));
  const ph = TAU * a2;
  const dx = sz * Math.cos(ph);
  const dy = sz * Math.sin(ph);
  const dz = cz;
  const rx = yc * dx + ysn * dz;
  const ry = dy;
  const rz = -ysn * dx + yc * dz;

  const mu = clamp(-rz, -1.0, 1.0);
  const dop = gam * (1.0 + beta * mu);
  const den = Math.max(1.0 + beta * mu, 1.0e-4);
  const mup = clamp((mu + beta) / den, -1.0, 1.0);
  const sp = Math.sqrt(Math.max(1.0 - mup * mup, 0.0));
  const lt = len2(rx, ry);
  const on = step(1.0e-7, lt);
  const ld = Math.max(lt, 1.0e-7);
  const px = mix(1.0, rx / ld, on) * sp;
  const py = mix(0.0, ry / ld, on) * sp;
  const pz = -mup;

  // temperature from 2500 K to 12000 K, with TEMP BIAS bending the
  // draw toward the M dwarfs that a real catalogue is mostly made of,
  // and absolute magnitude spread over five magnitudes
  const ex = mix(1.0, 4.0, clamp(P.tbias, 0.0, 1.0));
  const tstar = 2500.0 + 9500.0 * Math.pow(Math.max(a3, 1.0e-4), ex);
  const lum = Math.pow(10.0, -0.4 * (5.0 * a4 - 1.0));

  // beaming. Bolometric intensity goes as delta^4, so the knee is not
  // a taste decision: without it the forward cone is four orders of
  // magnitude over everything else and the accumulator sees one blaze.
  const dd = dop * dop;
  const d4 = dd * dd;
  const br = d4 * lum;
  const cap = 6.0;
  const bs = br / (1.0 + br / cap);

  const rfx = step(0.9, Math.abs(pz));
  const rfz = 1.0 - rfx;
  const c1x = py * rfz + 1.0e-9;
  const c1y = pz * rfx - px * rfz + 1.0e-9;
  const c1z = -py * rfx + 1.0e-9;
  const cl = Math.max(len3(c1x, c1y, c1z), 1.0e-9);
  const t1x = c1x / cl;
  const t1y = c1y / cl;
  const t1z = c1z / cl;
  const t2x = py * t1z - pz * t1y;
  const t2y = pz * t1x - px * t1z;
  const t2z = px * t1y - py * t1x;

  // a bright star's image swells the way it does on a saturating
  // detector, which drains the forward cluster's peak density without
  // moving any energy off the star. The radius is a Box-Muller draw
  // whose logarithm is guarded away from zero and then capped.
  const sig = 0.0068 * (1.0 + 0.9 * Math.sqrt(clamp(bs / cap, 0.0, 1.0)));
  const bm = Math.max(-2.0 * Math.log(Math.max(1.0 - q.x, 1.0e-6)), 0.0);
  const jr = Math.min(sig * Math.sqrt(bm), 4.0 * sig);
  const ja = TAU * q.y;
  const ca = Math.cos(ja);
  const sa = Math.sin(ja);
  const ox = px + (t1x * ca + t2x * sa) * jr + 1.0e-9;
  const oy = py + (t1y * ca + t2y * sa) * jr + 1.0e-9;
  const oz = pz + (t1z * ca + t2z * sa) * jr + 1.0e-9;
  const ol = Math.max(len3(ox, oy, oz), 1.0e-9);

  // the blackbody, a Helland-style piecewise fit with every joint
  // smoothstepped and the whole thing raised to the three-halves power
  // so it sits in the roughly linear space the accumulator works in.
  // Each argument that reaches a power or a logarithm is floored at
  // one first, which is what keeps the fit finite below its own range.
  const bt = clamp(dop * tstar, 1000.0, 40000.0) * 0.01;
  const rh = 329.698727446 * Math.pow(Math.max(bt - 60.0, 1.0), -0.1332047592)
    / 255.0;
  const cr = mix(1.0, rh, smoothstep(64.0, 78.0, bt));
  const gc = (99.4708025861 * Math.log(Math.max(bt, 1.0)) - 161.1195681661)
    / 255.0;
  const gh = 288.1221695283 * Math.pow(Math.max(bt - 60.0, 1.0), -0.0755148492)
    / 255.0;
  const cg = mix(gc, gh, smoothstep(58.0, 74.0, bt));
  const bc0 = (138.5177312231 * Math.log(Math.max(bt - 10.0, 1.0))
    - 305.0447927307) / 255.0;
  const bc = bc0 * smoothstep(18.0, 25.0, bt);
  const cb = mix(bc, 1.0, smoothstep(60.0, 78.0, bt));
  const kr = clamp(cr, 0.0, 1.0);
  const kg = clamp(cg, 0.0, 1.0);
  const kb = clamp(cb, 0.0, 1.0);

  return s.deposit({
    xyz: [ox / ol * R, oy / ol * R, oz / ol * R],
    col: mul3([kr * Math.sqrt(kr), kg * Math.sqrt(kg), kb * Math.sqrt(kb)],
              0.22 * bs * glow),
  });
});
