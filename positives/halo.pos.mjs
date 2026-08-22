// Plate LI The Ice Halo, as a positive. One hexagonal ice crystal per
// point: pick its c-axis, pick a pair of faces, refract the sunlight in
// at one and out at the other, and seat the point where the eye must
// look to receive that ray. Nothing draws a ring. The ring is where the
// deviation is stationary and the exits crowd, and the swept-empty sky
// inside it is the minimum deviation, below which no ray can go.
//
// The plate never reads uT, so this walk takes no clock: it is a still
// subject, and every frame of it is the same sky. Vectors ride as
// scalar triples because the notation gives a vec3 no components; the
// three helpers the shader binds (halo_basis, halo_snell, halo_spec)
// are inlined at their call sites, and their vec3 ternaries become
// if/else, which is what the notation asks for anyway.
import { positive, lever, clamp, smoothstep, mix, dot3, TAU, PI, len3 } from "../core/measure.mjs";

export default positive("halo_pos", {
  orient: lever("ORIENTATION", 0, 2,  1,    0),
  face:   lever("FACE PAIR",   0, 2,  1,    2),
  wobble: lever("WOBBLE",      0, 15, 0.1,  2),
  sunalt: lever("SUN ALT",     0, 40, 0.5,  20),
  disp:   lever("DISPERSION",  0, 4,  0.01, 1),
  glow:   lever("GLOW",        0, 1,  0.01, 0.5),
  cam: { dist: 2.7, pitch: 0.15, tgtY: 0.2, rot: 0.03 },
  gain: 0.95, accent: "#c9ecf5",
},
(P, s, q) => {
  const omode = Math.floor(P.orient + 0.5);
  const fmode = Math.floor(P.face + 0.5);
  const wob = P.wobble;
  const alt = (PI / 180.0) * clamp(P.sunalt, 0.0, 89.0);
  const dsp = P.disp;
  const glow = P.glow;

  // Sun frame: y is up, the sun sits toward -z at elevation SUN ALT.
  // sd is the observer's line to the sun, l the way the light travels.
  const sdx = 0.0, sdy = Math.sin(alt), sdz = -Math.cos(alt);
  const lx = -sdx, ly = -sdy, lz = -sdz;

  const g0 = s.u();
  let px = 0.0, py = 0.0, pz = 0.0;
  let cr = 0.0, cg = 0.0, cb = 0.0;

  if (g0 < 0.015) {
    // dim sun marker, scenery only: a disc 1.2 degrees across,
    // deliberately wider than the sun's true 0.53 so it stays faint
    let tvx = 0.0, tvy = 0.0, tvz = 0.0;
    if (Math.abs(sdz) < 0.9) {
      tvx = 0.0; tvy = 0.0; tvz = 1.0;
    } else {
      tvx = 1.0; tvy = 0.0; tvz = 0.0;
    }
    const kx = sdy * tvz - sdz * tvy + 1.0e-9;
    const ky = sdz * tvx - sdx * tvz + 1.0e-9;
    const kz = sdx * tvy - sdy * tvx + 1.0e-9;
    const kl = len3(kx, ky, kz);
    const uax = kx / kl, uay = ky / kl, uaz = kz / kl;
    const ubx = sdy * uaz - sdz * uay;
    const uby = sdz * uax - sdx * uaz;
    const ubz = sdx * uay - sdy * uax;
    const rr = (PI / 180.0) * 0.6 * Math.sqrt(q.x);
    const ap = TAU * q.y;
    const ca = Math.cos(ap), sa = Math.sin(ap), tr = Math.tan(rr);
    const dx = sdx + (uax * ca + ubx * sa) * tr + 1.0e-9;
    const dy = sdy + (uay * ca + uby * sa) * tr + 1.0e-9;
    const dz = sdz + (uaz * ca + ubz * sa) * tr + 1.0e-9;
    const dl = len3(dx, dy, dz);
    px = 1.3 * (dx / dl);
    py = 1.3 * (dy / dl);
    pz = 1.3 * (dz / dl);
    cr = 0.022 * (0.5 + glow);
    cg = 0.021 * (0.5 + glow);
    cb = 0.017 * (0.5 + glow);
  } else {
    // the c-axis of the crystal, the prism axis, per ORIENTATION.
    // 0: uniform on the sphere times a uniform roll, which is Haar
    // measure on SO(3). 1: plate, c vertical with a gaussian WOBBLE
    // tilt. 2: column, c horizontal at a random azimuth, same wobble.
    let cax = 0.0, cay = 0.0, caz = 0.0;
    if (omode == 0.0) {
      const uz = s.u();
      const ua = s.u();
      const z = 2.0 * uz - 1.0;
      const az = TAU * ua;
      const rr = Math.sqrt(Math.max(1.0 - z * z, 0.0));
      cax = rr * Math.cos(az);
      cay = z;
      caz = rr * Math.sin(az);
    } else {
      let bsx = 0.0, bsy = 0.0, bsz = 0.0;
      if (omode == 1.0) {
        bsx = 0.0; bsy = 1.0; bsz = 0.0;
      } else {
        const uh = s.u();
        const ha = TAU * uh;
        bsx = Math.cos(ha); bsy = 0.0; bsz = Math.sin(ha);
      }
      let tvx = 0.0, tvy = 0.0, tvz = 0.0;
      if (Math.abs(bsz) < 0.9) {
        tvx = 0.0; tvy = 0.0; tvz = 1.0;
      } else {
        tvx = 1.0; tvy = 0.0; tvz = 0.0;
      }
      const kx = bsy * tvz - bsz * tvy + 1.0e-9;
      const ky = bsz * tvx - bsx * tvz + 1.0e-9;
      const kz = bsx * tvy - bsy * tvx + 1.0e-9;
      const kl = len3(kx, ky, kz);
      const wax = kx / kl, way = ky / kl, waz = kz / kl;
      const wbx = bsy * waz - bsz * way;
      const wby = bsz * wax - bsx * waz;
      const wbz = bsx * way - bsy * wax;
      // one standard normal deviate, Box-Muller from two uniforms
      const n1 = Math.max(s.u(), 1.0e-7);
      const n2 = s.u();
      const gs = Math.sqrt(-2.0 * Math.log(n1)) * Math.cos(TAU * n2);
      const tl = clamp((PI / 180.0) * wob * gs, -0.6, 0.6);
      const uw = s.u();
      const wz = TAU * uw;
      const ctl = Math.cos(tl), stl = Math.sin(tl);
      const cwz = Math.cos(wz), swz = Math.sin(wz);
      const mx = bsx * ctl + (wax * cwz + wbx * swz) * stl + 1.0e-9;
      const my = bsy * ctl + (way * cwz + wby * swz) * stl + 1.0e-9;
      const mz = bsz * ctl + (waz * cwz + wbz * swz) * stl + 1.0e-9;
      const ml = len3(mx, my, mz);
      cax = mx / ml; cay = my / ml; caz = mz / ml;
    }

    // Side (prism) faces are parallel to the c-axis, so their normals
    // lie in the perpendicular plane, 60 degrees apart; basal faces
    // have normals plus and minus c. Alternate side faces meet at apex
    // angle A = 60, a side face and a basal face at A = 90. The roll
    // psi comes from the stratified q.x, the coordinate the deviation
    // folds along.
    let tvx = 0.0, tvy = 0.0, tvz = 0.0;
    if (Math.abs(caz) < 0.9) {
      tvx = 0.0; tvy = 0.0; tvz = 1.0;
    } else {
      tvx = 1.0; tvy = 0.0; tvz = 0.0;
    }
    const kx = cay * tvz - caz * tvy + 1.0e-9;
    const ky = caz * tvx - cax * tvz + 1.0e-9;
    const kz = cax * tvy - cay * tvx + 1.0e-9;
    const kl = len3(kx, ky, kz);
    const e1x = kx / kl, e1y = ky / kl, e1z = kz / kl;
    const e2x = cay * e1z - caz * e1y;
    const e2y = caz * e1x - cax * e1z;
    const e2z = cax * e1y - cay * e1x;

    const psi = TAU * q.x;
    const cp = Math.cos(psi), sp = Math.sin(psi);
    const cq = Math.cos(psi + 2.09439510), sq = Math.sin(psi + 2.09439510);
    const f0x = e1x * cp + e2x * sp;
    const f0y = e1y * cp + e2y * sp;
    const f0z = e1z * cp + e2z * sp;
    const f2x = e1x * cq + e2x * sq;
    const f2y = e1y * cq + e2y * sq;
    const f2z = e1z * cq + e2z * sq;

    let use90 = 0.0;
    if (fmode == 0.0) {
      use90 = 0.0;
    } else if (fmode == 1.0) {
      use90 = 1.0;
    } else {
      const u4 = s.u();
      use90 = (u4 < 0.30) ? 1.0 : 0.0;
    }

    let F1x = f0x, F1y = f0y, F1z = f0z;
    let F2x = f2x, F2y = f2y, F2z = f2z;
    if (use90 == 1.0) {
      const u5 = s.u();
      const sg = (u5 < 0.5) ? 1.0 : -1.0;
      F2x = cax * sg; F2y = cay * sg; F2z = caz * sg;
    }
    // entry and exit faces are not interchangeable for the 90 pair,
    // basal-in and basal-out being different arcs, so swap them half
    // the time
    const u6 = s.u();
    if (u6 < 0.5) {
      const swx = F1x, swy = F1y, swz = F1z;
      F1x = F2x; F1y = F2y; F1z = F2z;
      F2x = swx; F2y = swy; F2z = swz;
    }

    // Negating both normals names the diametrically opposite pair of
    // faces on the same crystal, an equally valid pair, so use it and
    // face 1 always faces the sun. Both stay outward normals.
    const d1 = dot3([lx, ly, lz], [F1x, F1y, F1z]);
    if (d1 > 0.0) {
      F1x = -F1x; F1y = -F1y; F1z = -F1z;
      F2x = -F2x; F2y = -F2y; F2z = -F2z;
    }
    const d2 = dot3([lx, ly, lz], [F1x, F1y, F1z]);
    if (d2 > -1.0e-4) {
      return s.decline();
    }

    const lt = q.y;                            // 0 violet to 1 red
    const lam = mix(400.0, 700.0, lt);
    // refractive index of ice: a Cauchy fit through n(400) = 1.317 and
    // n(700) = 1.306. DISPERSION scales the spread about 1.31, and the
    // clamp keeps n > 1 for every lever setting.
    let n = 1.3006667 + 2613.34 / Math.max(lam * lam, 1.0);
    n = Math.max(1.31 + (n - 1.31) * dsp, 1.02);

    // vector Snell into the ice. The normal is flipped to oppose the
    // propagation direction; k < 0 is total internal reflection, which
    // for an air-to-ice entry cannot happen, but the plate tests it.
    const eta1 = 1.0 / n;
    let N1x = F1x, N1y = F1y, N1z = F1z;
    if (dot3([F1x, F1y, F1z], [lx, ly, lz]) > 0.0) {
      N1x = -F1x; N1y = -F1y; N1z = -F1z;
    }
    const c11 = -dot3([N1x, N1y, N1z], [lx, ly, lz]);
    const k1 = 1.0 - eta1 * eta1 * (1.0 - c11 * c11);
    if (k1 < 0.0) {
      return s.decline();
    }
    const c21 = Math.sqrt(Math.max(k1, 0.0));
    const b1 = eta1 * c11 - c21;
    const t1x = eta1 * lx + b1 * N1x;
    const t1y = eta1 * ly + b1 * N1y;
    const t1z = eta1 * lz + b1 * N1z;

    // the refracted ray must actually run toward face 2
    if (dot3([t1x, t1y, t1z], [F2x, F2y, F2z]) <= 1.0e-4) {
      return s.decline();
    }

    // out again, or trapped: this is the total internal reflection
    // that cuts the outer skirt off
    let N2x = F2x, N2y = F2y, N2z = F2z;
    if (dot3([F2x, F2y, F2z], [t1x, t1y, t1z]) > 0.0) {
      N2x = -F2x; N2y = -F2y; N2z = -F2z;
    }
    const c12 = -dot3([N2x, N2y, N2z], [t1x, t1y, t1z]);
    const k2 = 1.0 - n * n * (1.0 - c12 * c12);
    if (k2 < 0.0) {
      return s.decline();
    }
    const c22 = Math.sqrt(Math.max(k2, 0.0));
    const b2 = n * c12 - c22;
    const t2x = n * t1x + b2 * N2x;
    const t2y = n * t1y + b2 * N2y;
    const t2z = n * t1z + b2 * N2z;

    // the eye looks back along the outgoing ray; undeviated light
    // returns the sun itself, and the halo is the pile-up at
    // stationary deviation
    const gx = t2x + 1.0e-9, gy = t2y + 1.0e-9, gz = t2z + 1.0e-9;
    const gl = len3(gx, gy, gz);
    px = 1.3 * (-(gx / gl));
    py = 1.3 * (-(gy / gl));
    pz = 1.3 * (-(gz / gl));

    // compact spectral ramp, lt = 0 violet to 1 red, weighted by the
    // projected area of the entry face
    const w = -d2;
    const lc = clamp(lt, 0.0, 1.0);
    const hr = smoothstep(0.42, 0.64, lc) + 0.26 * (1.0 - smoothstep(0.0, 0.20, lc));
    const hg = smoothstep(0.12, 0.38, lc) * (1.0 - smoothstep(0.62, 0.90, lc));
    const hb = 1.0 - smoothstep(0.24, 0.48, lc);
    const hw = 0.60 + 0.40 * smoothstep(0.0, 0.12, lc);
    const e1c = 0.35 + 0.85 * glow;
    const e2c = 0.35 + 0.90 * w;
    cr = hr * hw * e1c * e2c;
    cg = hg * hw * e1c * e2c;
    cb = hb * hw * e1c * e2c;
  }

  return s.deposit({ xyz: [px, py, pz], col: [cr, cg, cb] });
});
