// Plate XXXIII Billiards, Tamed and Wild, as a positive. A particle is
// set down on the wall of a table, launched inward at an angle between
// tangent and normal, and thereafter obeys the only rule a billiard
// has: travel straight, and at the wall reflect specularly about the
// inward normal. TABLE chooses which universe it lives in. The circle
// and the ellipse are integrable, so a conserved quantity pins every
// chord tangent to a caustic and no orbit ever fills the table; the
// Bunimovich stadium and Sinai's square with a disk are ergodic, so a
// generic orbit does fill it and brightness, which is literally the
// orbit family's time average, goes flat.
//
// THE BOUNCE LOOP IS THE ORBIT, and its state is the ray: origin,
// direction, the running chord sum, the seat this point will take, and
// a stop code. The shader's two breaks are the code's two values, 2
// for the miss and 1 for arrival at the drawn chord, and `until` reads
// it before each step, so the step that stops is the step that freezes
// the state. Everything after the orbit reads the frozen ray.
//
// THE INTERSECTION IS WHY THIS PLATE WAITED. billiards_hit answers two
// things at once, the distance and the normal there, through a dozen
// local bindings and six conditional best-updates, and an orbit step
// that had to BE one object literal could only say that by writing the
// whole function out once per field it feeds. Measured, the stadium
// arm came to a hundred kilobytes of expression per step. With a BLOCK
// body the step declares its intermediates once and the four tables
// keep the shader's own shape: a running `best`, a normal beside it,
// and each surface tested in the shader's order under the same strict
// `<`, which is what decides ties at a wall-cap junction.
//
// The two seed hashes are a fair coin for the launch handedness and a
// uniform integer for which chord gets deposited, so they are one draw
// and one pick, in the shader's own order: the aim jitter first, then
// the coin, then the chord. normalize() has no vocabulary spelling and
// no deterministic form, so every unit vector here is written out as
// v / length(v), which is what the GLSL says and what the evaluator
// computes.
import { positive, lever, pal, mul3, mix, clamp, len2, TAU, PI } from "../core/measure.mjs";

export default positive("billiards_pos", {
  table:  lever("TABLE",        0, 3,    1,     0),
  bounce: lever("BOUNCES",      1, 40,   1,     26),
  ecc:    lever("ECCENTRICITY", 0, 1,    0.01,  0.55),
  aim:    lever("AIM",          0, 1,    0.01,  0.32),
  spread: lever("SPREAD",       0, 1,    0.01,  0.18),
  lift:   lever("LIFT",         0, 0.05, 0.001, 0),
  glow:   lever("GLOW",         0, 1,    0.01,  0.5),
  cam: { dist: 3.0, pitch: 0.9, tgtY: 0.0, rot: 0.03 },
  gain: 0.85, accent: "#8fe0d0",
},
(P, s, q, t) => {
  const tb = Math.floor(P.table + 0.5);
  const nb = Math.floor(P.bounce + 0.5);
  const ecc = P.ecc;

  // THE LAUNCH SEAT, billiards_start: the boundary point at perimeter
  // fraction q.x with its inward normal. The circle and the ellipse
  // are parameterised by angle; the stadium and the square are walked
  // by arc length, each segment peeled off the running measure until
  // one of them contains the seat.
  let o0x = 0.0, o0y = 0.0;
  let nmx = 0.0, nmy = 0.0;
  if (tb == 0.0) {
    const a = q.x * TAU;
    const cx = Math.cos(a), cy = Math.sin(a);
    nmx = -cx; nmy = -cy;
    o0x = 1.15 * cx; o0y = 1.15 * cy;
  } else if (tb == 1.0) {
    // the inward normal is minus the gradient of x2/a2 + y2/b2, made a
    // unit; the 1e-9 is the plate's own floor on a gradient that would
    // otherwise vanish at the centre
    const ea = 1.25, eb = mix(1.18, 0.45, ecc);
    const ph = q.x * TAU;
    const hx = ea * Math.cos(ph), hy = eb * Math.sin(ph);
    const gx = hx / (ea * ea) + 1.0e-9;
    const gy = hy / (eb * eb) + 1.0e-9;
    const glen = len2(gx, gy);
    nmx = -gx / glen; nmy = -gy / glen;
    o0x = hx; o0y = hy;
  } else if (tb == 2.0) {
    const sr = 0.62, sL = mix(0.06, 0.88, ecc);
    const per = 4.0 * sL + TAU * sr;
    let arc = q.x * per;
    if (arc < 2.0 * sL) {
      nmx = 0.0; nmy = -1.0;
      o0x = arc - sL; o0y = sr;
    } else {
      arc -= 2.0 * sL;
      if (arc < 2.0 * sL) {
        nmx = 0.0; nmy = 1.0;
        o0x = sL - arc; o0y = -sr;
      } else {
        arc -= 2.0 * sL;
        if (arc < PI * sr) {
          // the right cap, ninety degrees down to minus ninety
          const a = 0.5 * PI - arc / sr;
          const rx = Math.cos(a), ry = Math.sin(a);
          nmx = -rx; nmy = -ry;
          o0x = sL + sr * rx; o0y = 0.0 + sr * ry;
        } else {
          // the left cap, ninety degrees up to two hundred and seventy
          arc -= PI * sr;
          const a = 0.5 * PI + arc / sr;
          const rx = Math.cos(a), ry = Math.sin(a);
          nmx = -rx; nmy = -ry;
          o0x = -sL + sr * rx; o0y = 0.0 + sr * ry;
        }
      }
    }
  } else {
    // the Sinai square: only its half-width names the perimeter, since
    // the dispersing disk sits in the middle and is never a seat
    const sd = 1.12;
    let arc = q.x * 8.0 * sd;
    if (arc < 2.0 * sd) {
      nmx = 0.0; nmy = -1.0;
      o0x = arc - sd; o0y = sd;
    } else {
      arc -= 2.0 * sd;
      if (arc < 2.0 * sd) {
        nmx = -1.0; nmy = 0.0;
        o0x = sd; o0y = sd - arc;
      } else {
        arc -= 2.0 * sd;
        if (arc < 2.0 * sd) {
          nmx = 0.0; nmy = 1.0;
          o0x = sd - arc; o0y = -sd;
        } else {
          arc -= 2.0 * sd;
          nmx = 1.0; nmy = 0.0;
          o0x = -sd; o0y = arc - sd;
        }
      }
    }
  }

  // AIM carries the launch from tangent to normal and SPREAD scatters
  // it; the clamp keeps the ray off exact tangency, where a chord has
  // no length to give. The handedness is a fair coin, and the coin is
  // drawn after the scatter because that is the shader's order.
  const psi0 = mix(0.045, 0.5, P.aim) * PI;
  const scat = s.centered();
  const psi = clamp(psi0 + scat * P.spread * PI, 0.035, PI - 0.035);
  const coin = s.u();
  const sgn = (coin < 0.5) ? -1.0 : 1.0;
  const tvx = -nmy, tvy = nmx;
  const cps = Math.cos(psi), sps = Math.sin(psi);
  const d0x = sgn * cps * tvx + sps * nmx;
  const d0y = sgn * cps * tvy + sps * nmy;

  // Hue names the conserved quantity where one exists. In the circle
  // that is the impact parameter, the caustic radius over R. In the
  // ellipse it is the product of the angular momenta about the two
  // foci, whose sign says whether the chord misses the segment between
  // them, giving a confocal ellipse, or crosses it, giving a
  // hyperbola. The ergodic tables conserve nothing, so they are graded
  // by launch angle instead.
  let hval = 0.0;
  if (tb == 0.0) {
    hval = Math.abs(cps);
  } else if (tb == 1.0) {
    const ea = 1.25, eb = mix(1.18, 0.45, ecc);
    const cf = Math.sqrt(Math.max(ea * ea - eb * eb, 0.0));
    const r1x = o0x - cf, r1y = o0y;
    const r2x = o0x + cf, r2y = o0y;
    const L1 = r1x * d0y - r1y * d0x;
    const L2 = r2x * d0y - r2y * d0x;
    hval = 0.5 + 0.5 * Math.tanh(2.0 * L1 * L2);
  } else {
    hval = psi / PI;
  }

  // which chord of the orbit this point lights
  const kk = s.pick(P.bounce);

  // THE BOUNCE LOOP. The ray is nudged off the wall it starts on, and
  // each step finds the nearest boundary ahead, either takes its seat
  // on that chord or reflects and carries on. stop is 0 while running,
  // 1 once the drawn chord has been seated, 2 on a miss or a
  // degenerate ray; until reads it before the step, so the values
  // standing when the loop ends are the ones the stopping step wrote.
  const O = s.orbit(P.bounce, {
    rox: o0x + nmx * 1.0e-5,
    roy: o0y + nmy * 1.0e-5,
    dx: d0x, dy: d0y,
    acc: 0.0, ptx: o0x, pty: o0y, tlen: 0.0, stop: 0.0,
  }, (v, j) => {
    // billiards_hit: the smallest positive ray-boundary intersection,
    // with the inward normal there. A distance of minus one means
    // nothing was hit and the caller gives up on the point.
    let hitT = -1.0;
    let nx = 0.0, ny = 1.0;
    if (tb == 0.0) {
      // the circle takes the far root, which is the only one ahead of
      // a ray that starts inside
      const R = 1.15;
      const b = v.rox * v.dx + v.roy * v.dy;
      const disc = Math.max(0.0, b * b - (v.rox * v.rox + v.roy * v.roy) + R * R);
      hitT = -b + Math.sqrt(disc);
      const hx = v.rox + v.dx * hitT;
      const hy = v.roy + v.dy * hitT;
      nx = -hx / R; ny = -hy / R;
    } else if (tb == 1.0) {
      // the ellipse is the circle again after scaling both axes to
      // one; the 1e-12 keeps A positive for a direction scaled to
      // nothing
      const ea = 1.25, eb = mix(1.18, 0.45, ecc);
      const osx = v.rox / ea, osy = v.roy / eb;
      const dsx = v.dx / ea, dsy = v.dy / eb;
      const A = dsx * dsx + dsy * dsy + 1.0e-12;
      const B = osx * dsx + osy * dsy;
      const C = osx * osx + osy * osy - 1.0;
      const disc = Math.max(0.0, B * B - A * C);
      hitT = (-B + Math.sqrt(disc)) / A;
      const hx = v.rox + v.dx * hitT;
      const hy = v.roy + v.dy * hitT;
      const gx = hx / (ea * ea) + 1.0e-9;
      const gy = hy / (eb * eb) + 1.0e-9;
      const glen = len2(gx, gy);
      nx = -gx / glen; ny = -gy / glen;
    } else if (tb == 2.0) {
      // the Bunimovich stadium: two straight walls and two caps, kept
      // by a running minimum. The walls take any t greater than zero
      // rather than an epsilon, because each test is direction-gated
      // and reflection flips the component toward the wall just left,
      // so a self-hit cannot happen while an epsilon floor would
      // reject a genuine hit at the junction and leak the ray.
      const sr = 0.62, sL = mix(0.06, 0.88, ecc);
      let best = 1.0e9;
      if (v.dy > 1.0e-7) {
        const tTop = (sr - v.roy) / v.dy;
        if (tTop > 0.0 && tTop < best &&
            Math.abs(v.rox + v.dx * tTop) <= sL + 1.0e-6) {
          best = tTop; nx = 0.0; ny = -1.0;
        }
      }
      if (v.dy < -1.0e-7) {
        const tBot = (-sr - v.roy) / v.dy;
        if (tBot > 0.0 && tBot < best &&
            Math.abs(v.rox + v.dx * tBot) <= sL + 1.0e-6) {
          best = tBot; nx = 0.0; ny = 1.0;
        }
      }
      // the right cap. Both roots are live: a ray crossing the cap
      // circle from inside the stadium enters at hx1 below L and
      // leaves at hx2 beyond it, so the near root is taken when the
      // near crossing is on the cap and the far one otherwise. After a
      // cap bounce the nudged origin sits strictly inside the circle,
      // which puts t1 behind the ray and leaves t2 as the genuine
      // next hit.
      const ocRx = v.rox - sL, ocRy = v.roy;
      const BR = ocRx * v.dx + ocRy * v.dy;
      const CR = ocRx * ocRx + ocRy * ocRy - sr * sr;
      const discR = BR * BR - CR;
      if (discR > 0.0) {
        const sqR = Math.sqrt(discR);
        const tR1 = -BR - sqR;
        const tR2 = -BR + sqR;
        const hR1 = v.rox + v.dx * tR1;
        const hR2 = v.rox + v.dx * tR2;
        const vR1 = tR1 > 0.0 && hR1 >= sL - 1.0e-6;
        const vR2 = tR2 > 0.0 && hR2 >= sL - 1.0e-6;
        const tR = vR1 ? tR1 : (vR2 ? tR2 : -1.0);
        if (tR > 0.0 && tR < best) {
          best = tR;
          const hx = v.rox + v.dx * tR;
          const hy = v.roy + v.dy * tR;
          nx = (sL - hx) / sr; ny = (0.0 - hy) / sr;
        }
      }
      // the left cap, the same test about minus L
      const ocLx = v.rox + sL, ocLy = v.roy;
      const BL = ocLx * v.dx + ocLy * v.dy;
      const CL = ocLx * ocLx + ocLy * ocLy - sr * sr;
      const discL = BL * BL - CL;
      if (discL > 0.0) {
        const sqL = Math.sqrt(discL);
        const tL1 = -BL - sqL;
        const tL2 = -BL + sqL;
        const hL1 = v.rox + v.dx * tL1;
        const hL2 = v.rox + v.dx * tL2;
        const vL1 = tL1 > 0.0 && hL1 <= -sL + 1.0e-6;
        const vL2 = tL2 > 0.0 && hL2 <= -sL + 1.0e-6;
        const tL = vL1 ? tL1 : (vL2 ? tL2 : -1.0);
        if (tL > 0.0 && tL < best) {
          best = tL;
          const hx = v.rox + v.dx * tL;
          const hy = v.roy + v.dy * tL;
          nx = (-sL - hx) / sr; ny = (0.0 - hy) / sr;
        }
      }
      hitT = best < 1.0e8 ? best : -1.0;
    } else {
      // Sinai's table: four walls and a dispersing disk seen from
      // outside, so the disk takes its near root. A corner hit needs
      // the second wall within about a hundred-thousandth, and the
      // direction gate already forbids re-hitting the wall just left.
      const sd = 1.12, rho = mix(0.15, 0.95, ecc);
      let best = 1.0e9;
      if (v.dx > 1.0e-7) {
        const tW = (sd - v.rox) / v.dx;
        if (tW > 0.0 && tW < best) { best = tW; nx = -1.0; ny = 0.0; }
      }
      if (v.dx < -1.0e-7) {
        const tW = (-sd - v.rox) / v.dx;
        if (tW > 0.0 && tW < best) { best = tW; nx = 1.0; ny = 0.0; }
      }
      if (v.dy > 1.0e-7) {
        const tW = (sd - v.roy) / v.dy;
        if (tW > 0.0 && tW < best) { best = tW; nx = 0.0; ny = -1.0; }
      }
      if (v.dy < -1.0e-7) {
        const tW = (-sd - v.roy) / v.dy;
        if (tW > 0.0 && tW < best) { best = tW; nx = 0.0; ny = 1.0; }
      }
      const BD = v.rox * v.dx + v.roy * v.dy;
      const CD = v.rox * v.rox + v.roy * v.roy - rho * rho;
      const discD = BD * BD - CD;
      if (discD > 0.0) {
        const tD = -BD - Math.sqrt(discD);
        if (tD > 1.0e-4 && tD < best) {
          best = tD;
          nx = (v.rox + v.dx * tD) / rho;
          ny = (v.roy + v.dy * tD) / rho;
        }
      }
      hitT = best < 1.0e8 ? best : -1.0;
    }

    // the shader's two breaks. A miss or a chord longer than the
    // table can hold gives up on the point; arrival at the drawn
    // chord seats it at fraction q.y along that chord and stops.
    // Otherwise the ray advances, reflects about the normal, is made
    // a unit again, and is nudged off the wall it just left.
    let nstop = v.stop;
    let nrox = v.rox, nroy = v.roy, ndx = v.dx, ndy = v.dy;
    let nacc = v.acc, nptx = v.ptx, npty = v.pty, ntlen = v.tlen;
    if (hitT <= 0.0 || hitT > 4.0) {
      nstop = 2.0;
    } else if (j == kk) {
      ntlen = hitT;
      nacc = v.acc + hitT * q.y;
      nptx = v.rox + v.dx * (hitT * q.y);
      npty = v.roy + v.dy * (hitT * q.y);
      nstop = 1.0;
    } else {
      const ax = v.rox + v.dx * hitT;
      const ay = v.roy + v.dy * hitT;
      nacc = v.acc + hitT;
      const dn = v.dx * nx + v.dy * ny;
      const rx = v.dx - 2.0 * dn * nx + 1.0e-9;
      const ry = v.dy - 2.0 * dn * ny;
      const rl = len2(rx, ry);
      ndx = rx / rl;
      ndy = ry / rl;
      nrox = ax + nx * 1.0e-5;
      nroy = ay + ny * 1.0e-5;
    }
    return {
      rox: nrox, roy: nroy, dx: ndx, dy: ndy,
      acc: nacc, ptx: nptx, pty: npty, tlen: ntlen, stop: nstop,
    };
  }, { until: (v) => v.stop > 0.5 });

  // a point whose ray was lost, or one that leaked through a junction
  // and left the table, is not on the subject and is declined
  if (O.stop != 1.0 || Math.abs(O.ptx) > 1.6 || Math.abs(O.pty) > 1.6) {
    return s.decline();
  }

  // LIFT lifts the bounce index into y, so the table lies in the
  // xz-plane and the orbit reads as a stack of planes rather than one
  const yy = (kk - 0.5 * (nb - 1.0)) * P.lift;

  // brightness is the time average: weight by the chord's own length,
  // then a faint pulse riding the unit-speed flow along the orbit
  const base = pal(hval * 0.75 + 0.06,
                   [0.46, 0.52, 0.50], [0.38, 0.38, 0.36],
                   [0.90, 0.85, 0.70], [0.12, 0.36, 0.55]);
  const wgt = clamp(O.tlen * 0.75, 0.05, 2.0);
  const pulse = 1.0 + 0.22 * Math.cos(2.6 * O.acc - 1.3 * t);
  return s.deposit({
    xyz: [O.ptx, yy, O.pty],
    col: mul3(mul3(mul3(base, wgt), pulse), 0.35 + 0.85 * P.glow),
  });
});
