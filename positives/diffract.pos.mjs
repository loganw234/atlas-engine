// Plate XLIX Diffraction, Grain by Grain, as a positive. Each point is
// one photon landing on the screen with probability equal to the
// diffracted intensity, so the brightness this walk deposits is the
// Born rule estimated by counting arrivals. APERTURE runs from one slit
// to two, to a grating of N slits, to a round hole whose first dark
// ring is Rayleigh's, and last to Fresnel's near field: an opaque disk
// with Poisson's absurdity, the bright spot at the centre of its own
// shadow, which Arago found in 1818.
//
// This plate was blocked twice over and both blockers have since
// closed, so the two stanzas that answer them are worth naming.
//
// THE FRAME SHIFT. The shader rotates the whole R2 point set by ONE
// hashed offset per frame, a Cranley Patterson rotation, which slides
// the low discrepancy lattice rigidly and leaves its stratification
// exactly intact. No stream draw can say that, because a stream draw is
// per point and would replace a slid lattice with independent noise.
// s.vnoise read at WHOLE integer coordinates is the hash it wants: the
// interpolation weights are exactly zero there, so the call returns the
// lattice corner itself, a pure function of the frame index and the
// octave that takes nothing from the stream and answers every point in
// the frame identically.
//
// THE ARAGO QUADRATURE. A hundred and sixty midpoint steps carry a
// complex phase by one rotation apiece, and the integrand of each step
// calls a Bessel function whose small argument branch is a ten term
// recurrence. Both loops carry state, so both are orbits, and an orbit
// inside an orbit needs a step that can declare an intermediate. The
// block bodied step is what allows it.
//
// The array factor is called at two sites with different N, so it is
// written out twice, the tpms pattern.
import { positive, lever, TAU, PI, mod, fract, clamp, smoothstep,
         mix3, mul3, len2, cmul, v2 } from "../core/measure.mjs";

export default positive("diffract_pos", {
  ap:   lever("APERTURE",   0,   4,   1,    1),
  aw:   lever("SLIT WIDTH", 1,   12,  0.1,  4),
  dsp:  lever("SPACING",    2,   30,  0.1,  12),
  ns:   lever("N SLITS",    2,   8,   1,    5),
  lam:  lever("WAVELENGTH", 400, 700, 1,    633),
  nf:   lever("FRESNEL N",  0.5, 4,   0.05, 2),
  glow: lever("GLOW",       0,   1,   0.01, 0.5),
  cam: { dist: 2.5, pitch: 0.12, tgtY: 0.0, rot: 0.04 },
  gain: 0.95, accent: "#9fd4ff",
},
(P, s, q, t) => {
  // The shader reads three components of one texture fetch, so all
  // three are available to every arm at once. Here they are three
  // draws spent before any branch, in the shader's own z, x, y order,
  // so no arm can change what the next arm sees.
  const uz = s.u();
  const ux = s.u();
  const uy = s.u();

  const ap   = Math.floor(P.ap + 0.5);
  const aw   = Math.max(P.aw, 0.05);          // slit width a, in wavelengths
  const dsp  = Math.max(P.dsp, 0.05);         // slit spacing d, in wavelengths
  const NS   = Math.max(Math.floor(P.ns + 0.5), 2.0);
  const NF   = Math.max(P.nf, 0.05);
  const lift = 0.35 + 0.9 * P.glow;

  // Spectral tint from 400 nm violet to 700 nm red. Each channel is a
  // sum or product of smoothsteps and so never goes negative; the
  // triple is then normalised by its own largest channel and mixed
  // toward white, which is why WAVELENGTH changes hue and not exposure.
  const wt = clamp((P.lam - 400.0) / 300.0, 0.0, 1.0);
  const wr = smoothstep(0.42, 0.65, wt) + 0.28 * (1.0 - smoothstep(0.0, 0.20, wt));
  const wg = smoothstep(0.12, 0.38, wt) * (1.0 - smoothstep(0.58, 0.86, wt));
  const wb = 1.0 - smoothstep(0.24, 0.50, wt);
  const wn = Math.max(Math.max(wr, Math.max(wg, wb)), 0.30);
  const tint = mix3([1.0, 1.0, 1.0], [wr / wn, wg / wn, wb / wn], 0.85);

  // Fresh photons every frame. The frame index is the shader's own,
  // the clock folded to a whole number, and the shift is two lattice
  // corners read at that index. It is split across both lattice axes
  // because the lattice wraps every 1024 cells and the index runs to
  // sixteen million; the two octaves are the halves of the golden
  // ratio constant the shader salts its own hash with. The result is
  // the same rotation for every point of a frame and a fresh one the
  // next frame, which is what makes TRAILS integrate independent
  // arrivals rather than relight the same ones.
  const frame = Math.floor(mod(Math.max(t, 0.0) * 997.0, 16777216.0));
  const fhi = Math.floor(frame * 0.0009765625);
  const qsx = fract(q.x + (s.vnoise(frame, fhi, 0x9E37) + 0.5));
  const qsy = fract(q.y + (s.vnoise(frame, fhi, 0x79B9) + 0.5));

  // The aperture plane at z = -1: scenery, four percent of the points,
  // kept dim because it is decoration and not part of the measure.
  if (uz < 0.04) {
    const scen = mul3([0.09, 0.12, 0.17], lift);
    if (ap >= 3.0) {
      // the rim of the hole, or the opaque disk filled by the square
      // root that makes area uniform
      const ang = qsy * TAU;
      const rad = (ap == 3.0) ? 0.30 * (0.99 + 0.02 * qsx)
                              : 0.30 * Math.sqrt(qsx);
      return s.deposit({
        xyz: [rad * Math.cos(ang), rad * Math.sin(ang), -1.0],
        col: scen,
      });
    }
    // the bars of the screen: nn openings on a pitch, and a point
    // landing inside an opening is a point with no bar to sit on
    const bx  = (qsx - 0.5) * 1.9;
    const nn  = (ap == 0.0) ? 1.0 : ((ap == 1.0) ? 2.0 : NS);
    const pit = 1.5 / nn;
    const hw  = (ap == 0.0) ? clamp(0.02 * aw, 0.03, 0.28)
                            : 0.5 * pit * clamp(aw / dsp, 0.05, 0.6);
    const jf  = Math.floor(bx / pit + 0.5 * (nn - 1.0) + 0.5);
    const ctr = (jf - 0.5 * (nn - 1.0)) * pit;
    if (jf >= 0.0 && jf <= nn - 1.0 && Math.abs(bx - ctr) < hw) {
      return s.decline();
    }
    return s.deposit({ xyz: [bx, (qsy - 0.5) * 0.34, -1.0], col: scen });
  }

  const L    = 1.30;      // half-window on the screen, world units
  const umax = 0.30;      // sin(theta) at the edge of that window

  // The circular aperture and the opaque disk both spread their
  // pattern in two dimensions, so the seat is a radius and an angle.
  if (ap >= 3.0) {
    // The Arago spot narrows as 1/NF, so the importance sampled
    // Gaussian branch tracks it; the round hole keeps a fixed width.
    const sg = (ap == 4.0) ? clamp(0.33 / NF, 0.06, 0.50) : 0.26;
    let rad = 0.0;
    if (ux < 0.7) { rad = L * Math.sqrt(qsx); }
    else { rad = sg * Math.sqrt(-2.0 * Math.log(Math.max(qsx, 1.0e-7))); }
    if (rad > L) { return s.decline(); }
    // divide by the FULL mixture density, not one branch, or the
    // wings lie
    const pdf = 0.7 / (PI * L * L)
              + 0.3 * Math.exp(-0.5 * rad * rad / (sg * sg)) / (TAU * sg * sg);

    let inten = 0.0;
    let K = 0.0;
    if (ap == 3.0) {
      // Airy. x = k R sin(theta) with R = aw wavelengths, so D = 2 aw
      // and the first dark ring lands at x = 3.83171, which is
      // sin(theta) = 1.22 lambda / D.
      const x  = TAU * aw * umax * (rad / L);
      const xs = Math.max(x, 1.0e-6);
      // J1 by its eleven term series below x = 8, built from
      // term(k+1) = -term(k) (x^2/4) / ((k+1)(k+2)) starting at x/2,
      // and above it by the Hankel asymptotic carried to the first
      // correction. The series is what fixes the first dark ring: it
      // returns J1(3.83171) = -2e-6.
      const jax = Math.abs(xs);
      let jr = 0.0;
      if (jax < 8.0) {
        const jy = 0.25 * jax * jax;
        const j0t = 0.5 * jax;
        const ser = s.orbit(10, { term: j0t, r: j0t }, (v, k) => {
          const tn = -v.term * jy / ((k + 1.0) * (k + 2.0));
          return { term: tn, r: v.r + tn };
        });
        jr = ser.r;
      } else {
        const chi = jax - 0.75 * PI;
        jr = Math.sqrt(2.0 / (PI * jax))
           * (Math.cos(chi) - 3.0 * Math.sin(chi) / (8.0 * jax));
      }
      // J1 is odd and the sign is restored at the end, which here can
      // never fire: the argument was clamped positive above
      const j1 = (xs < 0.0) ? -jr : jr;
      const rj = 2.0 * j1 / xs;
      inten = (x < 1.0e-3) ? 1.0 : rj * rj;
      K = 0.95;
    } else {
      // POISSON-ARAGO. The Fresnel field behind an opaque disk of
      // radius A at screen radius w, written in the disk's own units:
      // sigma = rho/A, W = w/A, and the Fresnel number NF = A^2/(lambda z),
      // so kappa A^2 / 2 = pi NF and kappa A w = 2 pi NF W. Substituting
      // t = sigma^2 makes the quadratic phase exactly linear in t, and
      // against a linear phase the midpoint rule's leading error is a
      // single global scale factor rather than a distortion.
      //
      // The outer limit is a fixed phase budget rather than a fixed
      // radius. A zone is pi of phase and the disk edge sits at pi NF,
      // which is what makes NF the zone count, so the beam always
      // reaches nineteen zones past the rim however small NF is and the
      // step is a constant 0.375 radian, advanced by one complex
      // rotation per step instead of a sine and a cosine.
      //
      // The beam is apodized by g = (1 - s^4)^2: g and its derivative
      // both vanish at the outer limit so the truncation does not ring,
      // while g = 1 at the rim leaves the disk edge untouched.
      const W = 1.5 * rad / L;
      const PHI = 60.0;                         // total phase across the beam
      const T = 1.0 + PHI / (PI * NF);          // (rho_max / A)^2
      const dtq = (T - 1.0) / 160.0;
      const dph = PHI / 160.0;                  // = PI * NF * dtq by construction
      const rotx = Math.cos(dph);
      const roty = Math.sin(dph);
      const p0 = PI * NF * (1.0 + 0.5 * dtq);
      const E = s.orbit(160,
        { ex: 0.0, ey: 0.0, phx: Math.cos(p0), phy: Math.sin(p0) },
        (w, k) => {
          const tq  = 1.0 + (k + 0.5) * dtq;
          const sfr = (tq - 1.0) / (T - 1.0);
          const sq  = sfr * sfr;
          const s4  = sq * sq;
          const g1  = 1.0 - s4;
          const g   = g1 * g1;
          const al  = TAU * NF * W * Math.sqrt(Math.max(tq, 1.0e-6));
          // J0 by its eleven term power series below x = 5, where the
          // term ratio is -y/(k+1)^2 with y = x^2/4 and the last term is
          // 7e-6, and by the Hankel asymptotic above it carried to the
          // 1/(8x) correction. The leading term alone is four percent
          // low at the join and would put a visible step into this
          // integrand.
          const ax = Math.abs(al);
          let j0 = 0.0;
          if (ax < 5.0) {
            const y = 0.25 * ax * ax;
            const ser = s.orbit(10, { term: 1.0, acc: 1.0 }, (v, kk) => {
              const tn = -v.term * y / ((kk + 1.0) * (kk + 1.0));
              return { term: tn, acc: v.acc + tn };
            });
            j0 = ser.acc;
          } else {
            const chi = ax - 0.25 * PI;
            j0 = Math.sqrt(2.0 / (PI * ax))
               * (Math.cos(chi) + Math.sin(chi) / (8.0 * ax));
          }
          // the deposit into the accumulator reads the phase BEFORE the
          // rotation, which is what the orbit's simultaneous update says
          const gj = g * j0;
          const phn = cmul(v2(w.phx, w.phy), v2(rotx, roty));
          return {
            ex: w.ex + gj * w.phx,
            ey: w.ey + gj * w.phy,
            phx: phn.x,
            phy: phn.y,
          };
        });
      const ex = E.ex * (0.5 * dtq);
      const ey = E.ey * (0.5 * dtq);
      const amp = len2(ex, ey) * TAU * NF;
      // On axis W = 0 makes J0 = 1 and the integral collapses to its
      // lower endpoint, so this normalisation returns one: the spot at
      // the centre of the shadow really is as bright as the open beam.
      inten = amp * amp;
      K = 0.45;
    }
    const ang = qsy * TAU;
    const bright = inten / Math.max(pdf, 1.0e-6);
    return s.deposit({
      xyz: [rad * Math.cos(ang), rad * Math.sin(ang), 0.6],
      col: mul3(mul3(mul3(tint, bright), K), lift),
    });
  }

  // One slit, two slits, a grating: the pattern spreads along x, and
  // the seat is drawn from a uniform window mixed with a Gaussian
  // concentrated on the central order.
  const sg = 0.22;
  let sx = 0.0;
  if (ux < 0.7) { sx = (qsx - 0.5) * 2.0 * L; }
  else {
    sx = sg * Math.sqrt(-2.0 * Math.log(Math.max(qsx, 1.0e-7)))
       * Math.cos(TAU * uy);
  }
  if (Math.abs(sx) > L) { return s.decline(); }
  const pdf = 0.7 / (2.0 * L)
            + 0.3 * Math.exp(-0.5 * sx * sx / (sg * sg)) / (sg * Math.sqrt(TAU));
  const u = umax * sx / L;                      // u = sin(theta)

  // The single slit envelope, sinc squared with the removable
  // singularity handled. The divisor is never zero, so even an
  // evaluator that computes both arms of the select cannot make a NaN.
  const sarg = PI * aw * u;
  const sd = (Math.abs(sarg) < 1.0e-3) ? 1.0 : sarg;
  const sv = (Math.abs(sarg) < 1.0e-3) ? (1.0 - sarg * sarg / 6.0)
                                       : Math.sin(sarg) / sd;
  let inten = sv * sv;

  // The N-slit array factor [sin(N psi)/(N sin psi)]^2. Where sin psi
  // vanishes the numerator vanishes with it and the limit is exactly
  // one, those being the principal maxima, so the guard returns one
  // rather than dividing. This factor already IS the interference term:
  // at N = 2 it collapses to cos^2(psi), the textbook double slit, and
  // no extra cosine is laid on top of it. psi is folded into
  // [-pi/2, pi/2] first, which changes nothing mathematically because
  // the factor has period pi exactly; the fold is there because at
  // SPACING 30 the raw argument reaches 226 radians and GLSL ES only
  // specifies sin() to 2^-11 inside [-pi, pi]. After the fold the guard
  // sits far above any argument reduction error rather than alongside it.
  if (ap == 1.0) {
    const psi = PI * dsp * u;
    const pp = psi - PI * Math.floor(psi / PI + 0.5);
    const sp = Math.sin(pp);
    let af = 1.0;
    if (Math.abs(sp) >= 1.0e-4) {
      const rr = Math.sin(2.0 * pp) / (2.0 * sp);
      af = rr * rr;
    }
    inten *= af;
  }
  if (ap == 2.0) {
    const psi = PI * dsp * u;
    const pp = psi - PI * Math.floor(psi / PI + 0.5);
    const sp = Math.sin(pp);
    let af = 1.0;
    if (Math.abs(sp) >= 1.0e-4) {
      const rr = Math.sin(NS * pp) / (NS * sp);
      af = rr * rr;
    }
    inten *= af;
  }

  const bright = inten / Math.max(pdf, 1.0e-6);
  return s.deposit({
    xyz: [sx, (qsy - 0.5) * 0.95, 0.6],
    col: mul3(mul3(mul3(tint, bright), 0.28), lift),
  });
});
