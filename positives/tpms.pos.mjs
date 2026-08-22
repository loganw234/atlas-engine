// Plate XVI Minimal Surfaces, as a positive. A probe point falls
// through a block of unit cells and Newton-projects onto the level set
// F(p) = level of one of four triply periodic minimal surfaces; the
// residual test throws away the few that missed, so brightness traces
// the surface's own area. The shader binds F once as a helper; the
// walk has no helper functions, so the four-surface selector repeats
// at every probe of F, value-identical at each site. The Newton loop
// binds intermediates (f, the gradient, the shared denominator), which
// an orbit step cannot, so the four bounded iterations are written out
// as four guarded stanzas, each the shader's loop body verbatim.
import { positive, lever, TAU, len3 } from "../core/measure.mjs";

export default positive("tpms_pos", {
  surface: lever("SURFACE",      0,    3,   1,    0),
  level:   lever("LEVEL c",     -1.3,  1.3, 0.01, 0.0),
  cells:   lever("CELLS",        1,    4,   1,    2),
  newton:  lever("NEWTON STEPS", 1,    4,   1,    3),
  slab:    lever("SLAB CUT",     0,    1,   0.01, 0.0),
  glow:    lever("GLOW",         0,    1,   0.01, 0.5),
  cam: { dist: 3.2, pitch: 0.28, tgtY: 0.0, rot: 0.05 },
  gain: 0.85, accent: "#b6e08f",
},
(P, s, q) => {
  // which surface: gyroid, Schwarz P, Schwarz D, Neovius
  const sf = Math.floor(P.surface + 0.5);
  const level = P.level;
  const cells = P.cells;
  const e = 0.012;

  // the probe: two coordinates from the point itself, the third a
  // draw, spread over a block of CELLS unit cells
  let px = (q.x - 0.5) * (TAU * cells);
  let py = (q.y - 0.5) * (TAU * cells);
  let pz = (s.u() - 0.5) * (TAU * cells);

  // Newton projection onto F = 0: p moves against f grad F / |grad F|^2,
  // the gradient by central differences at radius e. Up to four steps,
  // NEWTON STEPS of them taken.
  if (0.0 < P.newton) {
    const f = ((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz) - Math.sin(px) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz)) - level;
    const gx = ((((sf == 0.0) ? Math.sin(px + e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px + e)
      : (sf == 1.0) ? Math.cos(px + e) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px + e) * Math.cos(py) * Math.cos(pz) - Math.sin(px + e) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px + e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px + e) * Math.cos(py) * Math.cos(pz)) - level)
      - (((sf == 0.0) ? Math.sin(px - e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px - e)
      : (sf == 1.0) ? Math.cos(px - e) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px - e) * Math.cos(py) * Math.cos(pz) - Math.sin(px - e) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px - e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px - e) * Math.cos(py) * Math.cos(pz)) - level)) / (2.0 * e);
    const gy = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py + e) + Math.sin(py + e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py + e) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py + e) * Math.cos(pz) - Math.sin(px) * Math.sin(py + e) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py + e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py + e) * Math.cos(pz)) - level)
      - (((sf == 0.0) ? Math.sin(px) * Math.cos(py - e) + Math.sin(py - e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py - e) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py - e) * Math.cos(pz) - Math.sin(px) * Math.sin(py - e) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py - e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py - e) * Math.cos(pz)) - level)) / (2.0 * e);
    const gz = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz + e) + Math.sin(pz + e) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz + e)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz + e) - Math.sin(px) * Math.sin(py) * Math.sin(pz + e)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz + e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz + e)) - level)
      - (((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz - e) + Math.sin(pz - e) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz - e)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz - e) - Math.sin(px) * Math.sin(py) * Math.sin(pz - e)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz - e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz - e)) - level)) / (2.0 * e);
    const dnm = gx * gx + gy * gy + gz * gz + 1.0e-4;
    px -= f * gx / dnm;
    py -= f * gy / dnm;
    pz -= f * gz / dnm;
  }
  if (1.0 < P.newton) {
    const f = ((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz) - Math.sin(px) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz)) - level;
    const gx = ((((sf == 0.0) ? Math.sin(px + e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px + e)
      : (sf == 1.0) ? Math.cos(px + e) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px + e) * Math.cos(py) * Math.cos(pz) - Math.sin(px + e) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px + e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px + e) * Math.cos(py) * Math.cos(pz)) - level)
      - (((sf == 0.0) ? Math.sin(px - e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px - e)
      : (sf == 1.0) ? Math.cos(px - e) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px - e) * Math.cos(py) * Math.cos(pz) - Math.sin(px - e) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px - e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px - e) * Math.cos(py) * Math.cos(pz)) - level)) / (2.0 * e);
    const gy = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py + e) + Math.sin(py + e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py + e) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py + e) * Math.cos(pz) - Math.sin(px) * Math.sin(py + e) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py + e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py + e) * Math.cos(pz)) - level)
      - (((sf == 0.0) ? Math.sin(px) * Math.cos(py - e) + Math.sin(py - e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py - e) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py - e) * Math.cos(pz) - Math.sin(px) * Math.sin(py - e) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py - e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py - e) * Math.cos(pz)) - level)) / (2.0 * e);
    const gz = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz + e) + Math.sin(pz + e) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz + e)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz + e) - Math.sin(px) * Math.sin(py) * Math.sin(pz + e)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz + e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz + e)) - level)
      - (((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz - e) + Math.sin(pz - e) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz - e)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz - e) - Math.sin(px) * Math.sin(py) * Math.sin(pz - e)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz - e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz - e)) - level)) / (2.0 * e);
    const dnm = gx * gx + gy * gy + gz * gz + 1.0e-4;
    px -= f * gx / dnm;
    py -= f * gy / dnm;
    pz -= f * gz / dnm;
  }
  if (2.0 < P.newton) {
    const f = ((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz) - Math.sin(px) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz)) - level;
    const gx = ((((sf == 0.0) ? Math.sin(px + e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px + e)
      : (sf == 1.0) ? Math.cos(px + e) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px + e) * Math.cos(py) * Math.cos(pz) - Math.sin(px + e) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px + e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px + e) * Math.cos(py) * Math.cos(pz)) - level)
      - (((sf == 0.0) ? Math.sin(px - e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px - e)
      : (sf == 1.0) ? Math.cos(px - e) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px - e) * Math.cos(py) * Math.cos(pz) - Math.sin(px - e) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px - e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px - e) * Math.cos(py) * Math.cos(pz)) - level)) / (2.0 * e);
    const gy = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py + e) + Math.sin(py + e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py + e) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py + e) * Math.cos(pz) - Math.sin(px) * Math.sin(py + e) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py + e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py + e) * Math.cos(pz)) - level)
      - (((sf == 0.0) ? Math.sin(px) * Math.cos(py - e) + Math.sin(py - e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py - e) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py - e) * Math.cos(pz) - Math.sin(px) * Math.sin(py - e) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py - e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py - e) * Math.cos(pz)) - level)) / (2.0 * e);
    const gz = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz + e) + Math.sin(pz + e) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz + e)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz + e) - Math.sin(px) * Math.sin(py) * Math.sin(pz + e)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz + e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz + e)) - level)
      - (((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz - e) + Math.sin(pz - e) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz - e)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz - e) - Math.sin(px) * Math.sin(py) * Math.sin(pz - e)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz - e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz - e)) - level)) / (2.0 * e);
    const dnm = gx * gx + gy * gy + gz * gz + 1.0e-4;
    px -= f * gx / dnm;
    py -= f * gy / dnm;
    pz -= f * gz / dnm;
  }
  if (3.0 < P.newton) {
    const f = ((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz) - Math.sin(px) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz)) - level;
    const gx = ((((sf == 0.0) ? Math.sin(px + e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px + e)
      : (sf == 1.0) ? Math.cos(px + e) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px + e) * Math.cos(py) * Math.cos(pz) - Math.sin(px + e) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px + e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px + e) * Math.cos(py) * Math.cos(pz)) - level)
      - (((sf == 0.0) ? Math.sin(px - e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px - e)
      : (sf == 1.0) ? Math.cos(px - e) + Math.cos(py) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px - e) * Math.cos(py) * Math.cos(pz) - Math.sin(px - e) * Math.sin(py) * Math.sin(pz)
      : 3.0 * (Math.cos(px - e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px - e) * Math.cos(py) * Math.cos(pz)) - level)) / (2.0 * e);
    const gy = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py + e) + Math.sin(py + e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py + e) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py + e) * Math.cos(pz) - Math.sin(px) * Math.sin(py + e) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py + e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py + e) * Math.cos(pz)) - level)
      - (((sf == 0.0) ? Math.sin(px) * Math.cos(py - e) + Math.sin(py - e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py - e) + Math.cos(pz)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py - e) * Math.cos(pz) - Math.sin(px) * Math.sin(py - e) * Math.sin(pz)
      : 3.0 * (Math.cos(px) + Math.cos(py - e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py - e) * Math.cos(pz)) - level)) / (2.0 * e);
    const gz = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz + e) + Math.sin(pz + e) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz + e)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz + e) - Math.sin(px) * Math.sin(py) * Math.sin(pz + e)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz + e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz + e)) - level)
      - (((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz - e) + Math.sin(pz - e) * Math.cos(px)
      : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz - e)
      : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz - e) - Math.sin(px) * Math.sin(py) * Math.sin(pz - e)
      : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz - e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz - e)) - level)) / (2.0 * e);
    const dnm = gx * gx + gy * gy + gz * gz + 1.0e-4;
    px -= f * gx / dnm;
    py -= f * gy / dnm;
    pz -= f * gz / dnm;
  }

  // the residual test: a point that did not land on the surface is
  // not part of the picture
  const fres = ((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
    : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz)
    : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz) - Math.sin(px) * Math.sin(py) * Math.sin(pz)
    : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz)) - level;
  if (Math.abs(fres) > 0.08) { return s.decline(); }

  const scl = 2.6 / (TAU * cells);
  const wx = px * scl;
  const wy = py * scl;
  const wz = pz * scl;

  // the slab cut shears the block away from the near side
  if (wz > (0.5 - P.slab) * 5.2) { return s.decline(); }

  // colour is the surface normal: the gradient once more at the landed
  // point, nudged off zero and normalized by hand
  const ngx = ((((sf == 0.0) ? Math.sin(px + e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px + e)
    : (sf == 1.0) ? Math.cos(px + e) + Math.cos(py) + Math.cos(pz)
    : (sf == 2.0) ? Math.cos(px + e) * Math.cos(py) * Math.cos(pz) - Math.sin(px + e) * Math.sin(py) * Math.sin(pz)
    : 3.0 * (Math.cos(px + e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px + e) * Math.cos(py) * Math.cos(pz)) - level)
    - (((sf == 0.0) ? Math.sin(px - e) * Math.cos(py) + Math.sin(py) * Math.cos(pz) + Math.sin(pz) * Math.cos(px - e)
    : (sf == 1.0) ? Math.cos(px - e) + Math.cos(py) + Math.cos(pz)
    : (sf == 2.0) ? Math.cos(px - e) * Math.cos(py) * Math.cos(pz) - Math.sin(px - e) * Math.sin(py) * Math.sin(pz)
    : 3.0 * (Math.cos(px - e) + Math.cos(py) + Math.cos(pz)) + 4.0 * Math.cos(px - e) * Math.cos(py) * Math.cos(pz)) - level)) / (2.0 * e) + 1.0e-5;
  const ngy = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py + e) + Math.sin(py + e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
    : (sf == 1.0) ? Math.cos(px) + Math.cos(py + e) + Math.cos(pz)
    : (sf == 2.0) ? Math.cos(px) * Math.cos(py + e) * Math.cos(pz) - Math.sin(px) * Math.sin(py + e) * Math.sin(pz)
    : 3.0 * (Math.cos(px) + Math.cos(py + e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py + e) * Math.cos(pz)) - level)
    - (((sf == 0.0) ? Math.sin(px) * Math.cos(py - e) + Math.sin(py - e) * Math.cos(pz) + Math.sin(pz) * Math.cos(px)
    : (sf == 1.0) ? Math.cos(px) + Math.cos(py - e) + Math.cos(pz)
    : (sf == 2.0) ? Math.cos(px) * Math.cos(py - e) * Math.cos(pz) - Math.sin(px) * Math.sin(py - e) * Math.sin(pz)
    : 3.0 * (Math.cos(px) + Math.cos(py - e) + Math.cos(pz)) + 4.0 * Math.cos(px) * Math.cos(py - e) * Math.cos(pz)) - level)) / (2.0 * e) + 1.0e-5;
  const ngz = ((((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz + e) + Math.sin(pz + e) * Math.cos(px)
    : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz + e)
    : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz + e) - Math.sin(px) * Math.sin(py) * Math.sin(pz + e)
    : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz + e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz + e)) - level)
    - (((sf == 0.0) ? Math.sin(px) * Math.cos(py) + Math.sin(py) * Math.cos(pz - e) + Math.sin(pz - e) * Math.cos(px)
    : (sf == 1.0) ? Math.cos(px) + Math.cos(py) + Math.cos(pz - e)
    : (sf == 2.0) ? Math.cos(px) * Math.cos(py) * Math.cos(pz - e) - Math.sin(px) * Math.sin(py) * Math.sin(pz - e)
    : 3.0 * (Math.cos(px) + Math.cos(py) + Math.cos(pz - e)) + 4.0 * Math.cos(px) * Math.cos(py) * Math.cos(pz - e)) - level)) / (2.0 * e) + 1.0e-5;
  const nl = len3(ngx, ngy, ngz);

  return s.deposit({
    xyz: [wx, wy, wz],
    col: [0.30 + 0.70 * Math.abs(ngx / nl), 0.30 + 0.70 * Math.abs(ngy / nl), 0.30 + 0.70 * Math.abs(ngz / nl)],
    glow: 0.55 + 0.7 * P.glow,
  });
});
