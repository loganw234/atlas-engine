// Plate XXXVII The Photon Sphere, as a positive. Parallel light falls
// past a Schwarzschild black hole and each ray integrates the exact
// null geodesic equation d2u/dphi2 = -u + 3u^2 in units where GM and c
// are one, so the horizon sits at r = 2, the photon sphere at r = 3 and
// the critical impact parameter at 3 sqrt(3). Each point is one instant
// of one ray, laid down uniformly in orbital angle, so brightness is
// the winding angle light spends at each radius and the photon sphere
// ignites by density alone.
//
// The four Runge Kutta stages chain, and an orbit step is one
// expression per field with no local to bind, so each step becomes four
// passes: the pass reads the acceleration at its probe, weighs it into
// the running sum, and chooses the next probe, and the fourth pass
// commits. Unlike the other two flow plates this one does not need a
// separate evaluating pass, because the whole derivative is
// 3u^2 - u and the probe's own w: recomputing that costs four short
// copies rather than a field and a second pass.
import { positive, lever, pal, clamp, TAU } from "../core/measure.mjs";

export default positive("relativity_pos", {
  center: lever("BEAM CENTER", 1,    8,    0.01,  4.75),
  width:  lever("BEAM WIDTH",  0.05, 5,    0.01,  4.25),
  steps:  lever("STEPS",       60,   360,  1,     220),
  plane:  lever("PLANE 3D",    0,    1,    0.01,  0.15),
  scale:  lever("SCALE",       0.02, 0.09, 0.001, 0.045),
  glow:   lever("GLOW",        0,    1,    0.01,  0.5),
  cam: { dist: 3.2, pitch: 0.35, tgtY: 0.0, rot: 0.04 },
  gain: 0.9, accent: "#ff9a70",
},
(P, s, q, t) => {
  // where this ray crosses the beam, and the straight line it arrives
  // on: u = 1/r at r0 = 30, with phi the angle the undeflected ray
  // already subtends and w = du/dphi its slope there
  let b = P.center + (q.x * 2.0 - 1.0) * P.width;
  b = Math.max(b, 0.05);
  const u0 = 1.0 / 30.0;
  const phi0 = Math.asin(clamp(b * u0, -1.0, 1.0));
  const w0 = Math.cos(phi0) / b;
  const k = Math.floor(q.y * P.steps);
  const dphi = 0.03;

  // the ray. u and w are the state at the top of the step, qu and qw
  // the probe this pass reads, cu and cw the two running weighted sums,
  // and phi advances once per completed step exactly as the shader
  // advances it. The walk stops where the shader stops: before a step
  // once this point's share of the ray is flown, and after a step that
  // has crossed toward the horizon or escaped past r = 35.
  const o = s.orbit(1440, {
    u: u0, w: w0, qu: u0, qw: w0, cu: 0.0, cw: 0.0, phi: phi0,
    g: 0.0, n: 0.0,
  }, (v) => ({
    // the sum of the four readings, weighted one, two, two, one, and
    // emptied where the step closes
    cu: (v.g == 3.0) ? 0.0 : (v.cu + ((v.g == 0.0) ? 1.0 : 2.0) * v.qw),
    cw: (v.g == 3.0) ? 0.0
      : (v.cw + ((v.g == 0.0) ? 1.0 : 2.0) * (3.0 * v.qu * v.qu - v.qu)),

    // the fourth pass spends the whole sum at once
    u: (v.g == 3.0) ? (v.u + dphi / 6.0 * (v.cu + 1.0 * v.qw)) : v.u,
    w: (v.g == 3.0)
      ? (v.w + dphi / 6.0 * (v.cw + 1.0 * (3.0 * v.qu * v.qu - v.qu)))
      : v.w,

    // and the next probe: half a step along this reading twice, a whole
    // step along the third, and the freshly moved state once it closes
    qu: (v.g == 3.0) ? (v.u + dphi / 6.0 * (v.cu + 1.0 * v.qw))
      : (v.u + ((v.g == 2.0) ? dphi : 0.5 * dphi) * v.qw),
    qw: (v.g == 3.0)
      ? (v.w + dphi / 6.0 * (v.cw + 1.0 * (3.0 * v.qu * v.qu - v.qu)))
      : (v.w + ((v.g == 2.0) ? dphi : 0.5 * dphi)
         * (3.0 * v.qu * v.qu - v.qu)),

    phi: (v.g == 3.0) ? (v.phi + dphi) : v.phi,
    g: (v.g == 3.0) ? 0.0 : (v.g + 1.0),
    n: (v.g == 3.0) ? (v.n + 1.0) : v.n,
  }), {
    until: (v) => v.n >= k
      || v.u > 0.47
      || (v.w < 0.0 && v.u < 0.0285714),
  });

  // a ray that is about to cross the horizon, or that has passed
  // perihelion and run out past r = 35, is not drawn. The shader sets
  // its flag inside the loop, after an update; since u and w move only
  // when a step closes, the flag is exactly these two tests read on the
  // final state, and neither can be true of the arriving ray, where u
  // is always 1/30.
  const dead = o.u > 0.47 || (o.w < 0.0 && o.u < 0.0285714);
  if (dead) {
    return s.decline();
  }

  // back to a radius, and out into the orbit plane, which PLANE 3D
  // tilts about the beam axis to fan the rays into the shell
  const r = 1.0 / Math.max(o.u, 1.0e-4);
  const plx = Math.cos(o.phi) * (r * P.scale);
  const ply = Math.sin(o.phi) * (r * P.scale);
  const psi = s.centered() * TAU * P.plane;

  // pale gold outside the critical impact parameter 3 sqrt(3), ember
  // red inside it, and a slow breath along the winding angle
  const tc = clamp((b - 5.1961524) * 0.30, -1.0, 1.0) * 0.5 + 0.5;
  return s.deposit({
    xyz: [plx, ply * Math.cos(psi), ply * Math.sin(psi)],
    col: pal(tc, [0.95, 0.575, 0.35], [0.10, 0.275, 0.20],
             [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
    glow: (0.35 + 0.85 * P.glow) * (0.86 + 0.14 * Math.sin(5.0 * o.phi - 2.5 * t)),
  });
});
