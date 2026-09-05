// Plate XL Nodal Domains, as a positive. A probe point is seeded
// anywhere in a disk (2D) or a ball (3D) and Newton-projected onto the
// silent set of a random wave superposition - the places where a sum
// of M plane waves of one wavenumber cancels exactly. Berry's
// conjecture says a chaotic eigenfunction looks locally like this
// ensemble, so the figure the projection condenses onto is the nodal
// set of a generic high eigenmode: the sheets a Chladni plate would
// hold sand along, in three dimensions and without the plate.
//
// THE ENSEMBLE IS THE SUBJECT, and it is why this plate sat in
// docs/reports/nodal.md as "blocked" - a point-independent hash
// keyed by a lever and a loop index. The directions and phases must
// be the SAME for every point and the same at all five evaluations
// per point, or each probe descends onto its own field and the cloud
// fills the ball instead of condensing onto a surface. A stream draw
// is per point and cannot say it. s.vnoise CAN: it draws nothing from
// the stream, its value is a function of the lattice cell and the
// octave alone, and read at integer coordinates it is exactly one
// pinned hash of (cell x, cell y, octave). So the wave index rides the
// x lattice, WAVE SEED rides the y lattice, and four literal octaves
// stand in for the shader's h1..h4 chain. Four samples per wave rather
// than one hashu each is the honest cost of never hand-rolling a
// lattice hash in a plate body.
//
// It is a RE-AUTHORING, so the realisation differs from the registry
// plate's - a different draw of the same ensemble, the same law, the
// same figure at the same statistics.
//
// TWO BUILTINS THE VOCABULARY DOES NOT HAVE, both replaced rather than
// approximated:
//   inversesqrt(0.5*M) - the RMS normaliser. GLSL grants inversesqrt
//     spec latitude beyond a correctly rounded reciprocal square root,
//     which is exactly the kind of freedom this engine exists to
//     remove. Written as 1.0 / sqrt(max(0.5*M, 1e-6)): a pinned sqrt
//     and a pinned divide. WAVES M is at least 4, so the argument is
//     at least 2 and the max() never fires; it is there so the guard
//     does not depend on a lever's range staying where it is.
//   normalize(grad + 1e-6) - the shading normal. Written as len3 and
//     three guarded divides, the length floored at 1e-12 so a probe
//     that lands on a critical point of psi (grad exactly zero, which
//     the 1e-6 nudge alone does not make impossible under
//     cancellation) divides by a positive number and yields a finite
//     direction rather than NaN. NaN is where the spec stops promising
//     two GPUs the same answer.
// The Newton denominator carries the shader's own +1e-3, and the step
// cap divides by a length already known to exceed cap > 0 - floored
// anyway, for the same reason.
import { positive, lever, mix3, clamp, len2, len3, TAU } from "../core/measure.mjs";

export default positive("nodal_pos", {
  dim:    lever("DIMENSION",    2, 3,  1,    3),
  waves:  lever("WAVES M",      4, 24, 1,    12),
  knum:   lever("WAVENUMBER k", 6, 24, 0.1,  14),
  wseed:  lever("WAVE SEED",    0, 30, 1,    7),
  newton: lever("NEWTON STEPS", 1, 4,  1,    3),
  slab:   lever("SLAB CUT",     0, 1,  0.01, 0),
  glow:   lever("GLOW",         0, 1,  0.01, 0.5),
  cam: { dist: 3.2, pitch: 0.3, tgtY: 0.0, rot: 0.05 },
  gain: 0.9, accent: "#a8d8ff",
},
(P, s, q, t) => {
  // DIMENSION is a lever, so this branch is the same for every point
  // in a frame; nothing here can diverge point to point.
  const d3 = P.dim > 2.5;
  // the wavenumber divides three times below and its lever floor is 6
  const kw = Math.max(P.knum, 1.0e-3);
  // WAVE SEED as a lattice coordinate: an integer lever, so every
  // sample below lands exactly on a lattice corner and the value is
  // one hash rather than an interpolation
  const sd = P.wseed;

  // THE ONE DRAW, taken unconditionally. It is the ball's radial
  // coordinate and the plane figure has no use for it, but a draw
  // inside a branch makes the stream sequence depend on the branch.
  const rq = s.u();

  // the seat: uniform in the disk (xz plane) or uniform in the ball
  const rdisk = 1.3 * Math.sqrt(Math.max(q.x, 0.0));
  const thd = TAU * q.y;
  const czb = 2.0 * q.y - 1.0;
  const szb = Math.sqrt(Math.max(0.0, 1.0 - czb * czb));
  const azb = TAU * q.x;
  const rball = 1.3 * Math.pow(Math.max(rq, 1.0e-6), 0.3333333);
  const sox = d3 ? rball * szb * Math.cos(azb) : rdisk * Math.cos(thd);
  const soy = d3 ? rball * czb : 0.0;
  const soz = d3 ? rball * szb * Math.sin(azb) : rdisk * Math.sin(thd);

  // never jump past a sheet: one step may not exceed a fifth of a
  // wavelength, which is what keeps the descent on the nearest zero
  const cap = 1.6 / kw;

  // THE DESCENT. p moves against psi grad psi / |grad psi|^2, the
  // Newton step for a scalar field's zero set, up to NEWTON STEPS
  // times. The inner orbit is the field: psi and its gradient in one
  // pass, four carried floats, because a sum() reduces to one float
  // and would evaluate the ensemble four times over to get them.
  const O = s.orbit(P.newton, { px: sox, py: soy, pz: soz }, (v) => {
    const F = s.orbit(P.waves, { f: 0.0, gx: 0.0, gy: 0.0, gz: 0.0 }, (w, j) => {
      const a1 = s.vnoise(j, sd, 1301);
      const a2 = s.vnoise(j, sd, 2711);
      const a3 = s.vnoise(j, sd, 4409);
      const a4 = s.vnoise(j, sd, 6421);
      // isotropic in the plane, or uniform on the sphere: cos of the
      // polar angle drawn flat is Archimedes' theorem, not a hack
      const wcz = d3 ? 2.0 * a2 : 0.0;
      const wsz = Math.sqrt(Math.max(0.0, 1.0 - wcz * wcz));
      const waz = TAU * a1;
      const wnx = d3 ? wsz * Math.cos(waz) : Math.cos(waz);
      const wny = d3 ? wsz * Math.sin(waz) : 0.0;
      const wnz = d3 ? wcz : Math.sin(waz);
      // each wave seethes at its own slow rate, so the ensemble
      // decorrelates in time instead of rigidly sliding
      const arg = kw * (wnx * v.px + wny * v.py + wnz * v.pz)
                + TAU * a3 + t * (0.10 + 0.1 * a4);
      return {
        f: w.f + Math.cos(arg),
        gx: w.gx - kw * Math.sin(arg) * wnx,
        gy: w.gy - kw * Math.sin(arg) * wny,
        gz: w.gz - kw * Math.sin(arg) * wnz,
      };
    });
    // the shader's own +1e-3: a probe sitting at a critical point of
    // psi has no descent direction, and this is what keeps it finite
    const dnm = F.gx * F.gx + F.gy * F.gy + F.gz * F.gz + 1.0e-3;
    const bx = F.f * F.gx / dnm;
    const by = F.f * F.gy / dnm;
    const bz = F.f * F.gz / dnm;
    const sl = len3(bx, by, bz);
    const trim = (sl > cap) ? cap / Math.max(sl, 1.0e-12) : 1.0;
    return {
      px: v.px - bx * trim,
      py: d3 ? v.py - by * trim : 0.0,
      pz: v.pz - bz * trim,
    };
  });

  // psi in RMS units: the sum of M unit-amplitude cosines has variance
  // M/2, so this is inversesqrt(0.5*M) written as a pinned reciprocal
  const nrmf = 1.0 / Math.sqrt(Math.max(0.5 * P.waves, 1.0e-6));

  // the landing evaluation, at the point the descent actually reached.
  // The walk has no helper functions, so the ensemble is written out a
  // second time, value-identical to the loop above at the same p.
  const G = s.orbit(P.waves, { f: 0.0, gx: 0.0, gy: 0.0, gz: 0.0 }, (w, j) => {
    const a1 = s.vnoise(j, sd, 1301);
    const a2 = s.vnoise(j, sd, 2711);
    const a3 = s.vnoise(j, sd, 4409);
    const a4 = s.vnoise(j, sd, 6421);
    const wcz = d3 ? 2.0 * a2 : 0.0;
    const wsz = Math.sqrt(Math.max(0.0, 1.0 - wcz * wcz));
    const waz = TAU * a1;
    const wnx = d3 ? wsz * Math.cos(waz) : Math.cos(waz);
    const wny = d3 ? wsz * Math.sin(waz) : 0.0;
    const wnz = d3 ? wcz : Math.sin(waz);
    const arg = kw * (wnx * O.px + wny * O.py + wnz * O.pz)
              + TAU * a3 + t * (0.10 + 0.1 * a4);
    return {
      f: w.f + Math.cos(arg),
      gx: w.gx - kw * Math.sin(arg) * wnx,
      gy: w.gy - kw * Math.sin(arg) * wny,
      gz: w.gz - kw * Math.sin(arg) * wnz,
    };
  });

  // unconverged, or wandered out of the window: not part of the
  // picture. The residual tolerance scales with 1/k because that is
  // the sheet spacing.
  const fn = G.f * nrmf;
  const lim = d3 ? len3(O.px, O.py, O.pz) : len2(O.px, O.pz);
  if (Math.abs(fn) > 0.6 / kw || lim > 1.3) {
    return s.decline();
  }

  const glow = 0.45 + 0.75 * P.glow;

  if (d3) {
    // the slab cut shears the near half of the ball away
    if (O.pz > (0.5 - P.slab) * 2.9) {
      return s.decline();
    }
    // normalize(grad + 1e-6), by hand: the nudge keeps a direction
    // defined where the gradient is exactly zero, and the floor on the
    // length keeps the divide finite where the nudge cancels itself
    const gnx = G.gx + 1.0e-6;
    const gny = G.gy + 1.0e-6;
    const gnz = G.gz + 1.0e-6;
    const gnl = Math.max(len3(gnx, gny, gnz), 1.0e-12);
    return s.deposit({
      xyz: [O.px, O.py, O.pz],
      col: [
        (0.28 + 0.72 * Math.abs(gnx / gnl)) * 0.72,
        (0.28 + 0.72 * Math.abs(gny / gnl)) * 0.86,
        (0.28 + 0.72 * Math.abs(gnz / gnl)) * 1.08,
      ],
      glow: glow,
    });
  }

  // the plane figure reads |grad psi| instead of a normal: the nodal
  // lines cross where the gradient vanishes, so brightness marks how
  // steeply psi passes through zero
  const gm = len3(G.gx, G.gy, G.gz) * nrmf / kw;
  const tt = clamp(gm * 0.9, 0.0, 1.0);
  return s.deposit({
    xyz: [O.px, O.py, O.pz],
    col: mix3([0.07, 0.16, 0.30], [0.85, 0.95, 1.15], tt),
    glow: glow,
  });
});
