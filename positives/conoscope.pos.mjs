// Plate LII Between Crossed Polarizers, as a positive. Each point is
// one viewing direction inside the aperture cone carrying one
// wavelength, and the colour it lands is sin^2(2 chi) sin^2(Gamma/2),
// the crossed-polarizer law, averaged over the visible band by the
// draw that picks the wavelength. Nothing iterates here: the plate is
// four small helpers over one direction, and the walk inlines all
// four, so the whole subject is a single straight run from q to the
// spherical cap that stands in for the back focal plane.
//
// Two CRYSTAL arms. The uniaxial arm carries the extraordinary index
// of the direction and the azimuth of the plane through the optic
// axis; the biaxial arm splits the axis in two, multiplies the two
// sines for Gamma, and takes the Biot-Fresnel mean of the two
// azimuths. The transverse frame is the parallel transport of the
// polarizer out to the ray, which is what keeps the four arms of the
// Maltese cross the same width.
import { positive, lever, clamp, mix, smoothstep, TAU, PI }
  from "../core/measure.mjs";

export default positive("conoscope_pos", {
  crystal: lever("CRYSTAL",     0,  2,   1,    0),
  thick:   lever("THICKNESS",   10, 800, 5,    55),
  tilt:    lever("TILT",        0,  40,  0.5,  0),
  aper:    lever("APERTURE",    20, 60,  1,    40),
  axial:   lever("AXIAL ANGLE", 0,  90,  1,    40),
  mono:    lever("MONO",        0,  1,   1,    0),
  glow:    lever("GLOW",        0,  1,   0.01, 0.5),
  cam: { dist: 2.8, pitch: 0.35, tgtY: 0.0, rot: 0.03 },
  gain: 1.0, accent: "#ee9fd6",
},
(P, s, q) => {
  const cry  = Math.floor(P.crystal + 0.5);
  const d    = P.thick;                        // micrometres
  const tlt  = P.tilt * PI / 180.0;
  const apr  = Math.max(P.aper, 1.0) * PI / 180.0;
  const hv   = P.axial * 0.5 * PI / 180.0;     // half the axial angle 2V
  const mono = Math.floor(P.mono + 0.5);
  const glow = P.glow;

  // one viewing direction, uniform on the disk the aperture cone
  // projects to, so the figure is weighted evenly across itself
  const r   = Math.sqrt(clamp(q.x, 0.0, 1.0));
  const ph  = TAU * q.y;
  const th  = r * apr;
  const sth = Math.sin(th), cth = Math.cos(th);
  const cph = Math.cos(ph), sph = Math.sin(ph);
  const vx  = sth * cph, vy = sth * sph, vz = cth;

  // one wavelength per point: the band in white light, the sodium
  // line when MONO is set. The draw stands in for rnd.x.
  const rx    = s.u();
  const lamNm = (mono == 1.0) ? 589.0 : mix(400.0, 700.0, rx);
  const lam   = lamNm * 0.001;                 // micrometres
  const lt    = (lamNm - 400.0) / 300.0;

  // The transverse frame at v. The condenser bends each ray inside its
  // own meridian, which parallel-transports the lab polarizer from the
  // axis out to v: a rotation about the azimuthal tangent, carrying
  // the radial tangent to the meridian tangent and fixing the
  // azimuthal one. Transport preserves the angle to the meridian,
  // which is what makes chi equal phi for the untilted figure. Bare
  // projection across v would skew the cross by cos(theta).
  const ethx = cth * cph, ethy = cth * sph, ethz = -sth;
  const ephx = -sph,      ephy = cph,       ephz = 0.0;
  const u1x = cph * ethx - sph * ephx;         // polarizer, transported
  const u1y = cph * ethy - sph * ephy;
  const u1z = cph * ethz - sph * ephz;
  const u2x = sph * ethx + cph * ephx;         // analyzer,  transported
  const u2y = sph * ethy + cph * ephy;
  const u2z = sph * ethz + cph * ephz;

  const ctl = Math.cos(tlt), stl = Math.sin(tlt);
  let gam = 0.0;
  let chi = 0.0;

  if (cry == 2.0) {
    // Biaxial, in the Biot-Fresnel approximation: two optic axes split
    // by 2V and laid in the 45 degree plane so the brushes open the
    // classical way, with Gamma proportional to the product of the two
    // sines. The 0.12 birefringence is aragonite territory, chosen so
    // the brushes carry a few rings at the THICKNESS that suits
    // calcite. Both axes are the tilt rotation applied about the
    // polarizer direction.
    const sv = Math.sin(hv), cv = Math.cos(hv);
    const c45 = 0.70710678;
    const a1x = sv * c45;
    const a1y = sv * c45 * ctl - cv * stl;
    const a1z = sv * c45 * stl + cv * ctl;
    const a2x = -sv * c45;
    const a2y = -sv * c45 * ctl - cv * stl;
    const a2z = -sv * c45 * stl + cv * ctl;

    const dot1 = a1x * vx + a1y * vy + a1z * vz;
    const dot2 = a2x * vx + a2y * vy + a2z * vz;
    const sn1 = Math.sqrt(Math.max(1.0 - dot1 * dot1, 0.0));
    const sn2 = Math.sqrt(Math.max(1.0 - dot2 * dot2, 0.0));
    gam = TAU * d * 0.12 * sn1 * sn2 / Math.max(lam, 1.0e-4);

    // the azimuth of the plane through the ray and each axis, in the
    // transported frame. At a melatope the plane is undefined, but the
    // retardation vanishes there too, so zero is harmless. Each
    // azimuth is defined only mod PI, which shifts chi by PI/2 and
    // leaves sin^2(2 chi) alone, so the bare mean is safe.
    const e1x = a1x - dot1 * vx;
    const e1y = a1y - dot1 * vy;
    const e1z = a1z - dot1 * vz;
    const p1x = e1x * u1x + e1y * u1y + e1z * u1z;
    const p1y = e1x * u2x + e1y * u2y + e1z * u2z;
    const az1 = (p1x * p1x + p1y * p1y < 1.0e-12) ? 0.0 : Math.atan2(p1y, p1x);

    const e2x = a2x - dot2 * vx;
    const e2y = a2y - dot2 * vy;
    const e2z = a2z - dot2 * vz;
    const p2x = e2x * u1x + e2y * u1y + e2z * u1z;
    const p2y = e2x * u2x + e2y * u2y + e2z * u2z;
    const az2 = (p2x * p2x + p2y * p2y < 1.0e-12) ? 0.0 : Math.atan2(p2y, p2x);

    chi = 0.5 * (az1 + az2);
  } else {
    // 0 is calcite, negative uniaxial; 1 is quartz, positive and so
    // weakly birefringent that it needs a far thicker plate for the
    // same rings. The single optic axis is the tilt applied to z, so
    // it leaves (0, -sin tilt, cos tilt).
    const nOrd = (cry == 1.0) ? 1.544 : 1.658;
    const nExt = (cry == 1.0) ? 1.553 : 1.486;
    const aax = 0.0;
    const aay = -stl;
    const aaz = ctl;
    const dot0 = aax * vx + aay * vy + aaz * vz;

    // the extraordinary index of this direction, from the index
    // ellipsoid; n_e(0) is exactly n_o, so the melatope is dark. The
    // obliquity factor of the path through the plate is dropped, which
    // is standard at conoscopic angles.
    const c2 = clamp(dot0 * dot0, 0.0, 1.0);
    const inv = c2 / (nOrd * nOrd) + (1.0 - c2) / (nExt * nExt);
    const ne = 1.0 / Math.sqrt(Math.max(inv, 1.0e-9));
    gam = TAU * d * (ne - nOrd) / Math.max(lam, 1.0e-4);

    // the fast axis is radial here, so chi is the azimuth itself
    const e0x = aax - dot0 * vx;
    const e0y = aay - dot0 * vy;
    const e0z = aaz - dot0 * vz;
    const p0x = e0x * u1x + e0y * u1y + e0z * u1z;
    const p0y = e0x * u2x + e0y * u2y + e0z * u2z;
    chi = (p0x * p0x + p0y * p0y < 1.0e-12) ? 0.0 : Math.atan2(p0y, p0x);
  }

  // crossed polarizers. Counted in sodium light, calcite at the
  // default THICKNESS and APERTURE has n_e(40 deg) = 1.5800, so
  // Gamma/2pi = 55*0.0780/0.589 = 7.3 rings out at the rim.
  const sc = Math.sin(2.0 * chi);
  const sg = Math.sin(0.5 * gam);
  const inten = sc * sc * sg * sg;
  const vig = 1.0 - smoothstep(0.86, 1.0, r);

  // the back focal plane made object: a gentle spherical cap, centred
  // so the dish straddles y = 0, and cos 0.78 = 0.710914
  const psi = r * 0.78;
  const R = 1.35;
  const wx = R * Math.sin(psi) * cph;
  const wy = R * Math.cos(psi) - R * 0.5 * (1.0 + 0.710914);
  const wz = R * Math.sin(psi) * sph;

  // the spectral colour of this wavelength, every channel a sum of
  // products of smoothsteps so none can go negative. The sodium line
  // sits at 0.63 and lands on a yellow with no blue, as it should.
  const lc = clamp(lt, 0.0, 1.0);
  const sr = smoothstep(0.42, 0.66, lc) + 0.28 * (1.0 - smoothstep(0.0, 0.18, lc));
  const sgr = smoothstep(0.12, 0.40, lc) * (1.0 - smoothstep(0.58, 0.86, lc));
  const sbl = 1.0 - smoothstep(0.24, 0.52, lc);
  const dim = 0.60 + 0.40 * smoothstep(0.0, 0.12, lc);

  return s.deposit({
    xyz: [wx, wy, wz],
    col: [sr * dim, sgr * dim, sbl * dim],
    glow: inten * vig * (0.55 + 1.15 * glow),
  });
});
