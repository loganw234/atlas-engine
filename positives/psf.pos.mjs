// The optical bench's own target: a flat grid of point sources.
//
// A point source's image IS the point spread function, and with a PSF
// at every field position every other aberration falls out of the same
// exposure rather than needing a target of its own. Distortion is
// where a centroid lands against where it should; field curvature is
// which focus makes each node sharpest; lateral colour is the split
// between per-channel centroids and axial colour the split between
// their best focus; relative illumination is integrated energy against
// field radius; bokeh is these same nodes deliberately defocused.
//
// THE TARGET IS FLAT, and that is the measurement rather than a
// convenience. A three-dimensional cloud projects most densely on its
// far side, so an aberration-free aperture reads about eight percent
// long against a target dialled at three metres - scene geometry
// reported as lens. A plane has no depth distribution to be biased by,
// so what comes back is the lens and nothing else. A plane is also the
// only object whose defocus at the corners IS the Petzval sag, which
// measures field curvature directly instead of fitting a quadratic to
// it afterwards.
//
// WHAT THIS CAN AND CANNOT CHECK. The rendered image reflects the
// coefficients the shader was HANDED, so measuring distortion back out
// of it proves the shader applied them correctly. It does not prove the
// coefficients themselves are right, which is the prescription's
// business. That distinction is exactly the half that has broken here
// before: spherical shipped sign-inverted, coma forty to three hundred
// times small and backwards, both chromatic terms exactly double,
// astigmatism inverted and doubled. Every one was a correct
// coefficient applied wrongly, every one produced a plausible picture,
// and a spot grid would have caught all four in one exposure.
//
// WHY IT LIVES HERE NOW. It began as a synthetic plate built in Python
// on demand, kept out of the registry because plates.json mirrors the
// atlas and is regenerated from it, so anything added there is lost on
// the next dump. A positive has no such problem: the engine is where
// plates are authored, so an instrument authored the same way is
// carried by the same tooling, pinned by the same emitter, and proved
// by the same gates as the photographs it measures. An optical bench
// whose target is less trustworthy than the pictures would be a poor
// bench.
import { positive, lever } from "../core/measure.mjs";

export default positive("psf", {
  // nodes per side, so grid squared sources
  grid: lever("GRID", 2, 24, 1, 9),
  // half-width of the plane in world units. The default fills about
  // 86% of a 26 degree frame at three metres: dist * tan(fov/2) * 0.86.
  // Sized to the FIELD rather than chosen - a grid wider than the frame
  // silently drops its outer nodes, and a half-extent of 1.0 at those
  // settings puts 31 of 81 sources outside the picture, so the corner
  // measurements are simply not there to read.
  extent: lever("EXTENT", 0.05, 3.0, 0.005, 0.596),
  // a spread that turns each delta into a small disc. Leave at zero for
  // PSF work; raise it only to make the target legible by eye.
  jitter: lever("JITTER", 0, 0.1, 0.001, 0.0),
  // square-on deliberately: yaw and pitch both zero, so the plane is
  // normal to the axis and every node sits at its own field height with
  // no foreshortening to unpick first.
  cam: { dist: 3.0, pitch: 0.0, tgtY: 0.0, rot: 0.0 },
  gain: 1.0, accent: "#ffffff",
},
(P, s, q, t) => {
  const g = Math.max(Math.floor(P.grid + 0.5), 2.0);

  // THE NODE COMES FROM q, NOT FROM THE STREAM, and this is the whole
  // reason the target measures illumination at all. q is the R2
  // low-discrepancy point, so binning it gives every node the same
  // population to within a point or two. Drawing the node from a hash
  // instead would make the counts Poisson and put sqrt(N) shot noise
  // BETWEEN nodes - which is the one thing that would ruin measuring
  // falloff, since falloff is exactly a comparison of energy between
  // nodes at different field heights.
  const ix = Math.min(Math.floor(q.x * g), g - 1.0);
  const iy = Math.min(Math.floor(q.y * g), g - 1.0);

  const fx = (ix + 0.5) / g * 2.0 - 1.0;
  const fy = (iy + 0.5) / g * 2.0 - 1.0;

  // Drawn unconditionally and scaled by the lever, rather than drawn
  // inside a branch on jitter being nonzero. A draw behind a branch
  // makes the stream's position depend on a lever, so two settings
  // would disagree about every subsequent value - and at jitter zero
  // the product is exactly zero anyway, which is the delta the bench
  // wants.
  const j = s.jitter2();

  // NEUTRAL WHITE ON PURPOSE: any colour that reaches the film is then
  // the optics' doing, so a per-channel split is a measurement of the
  // lens rather than of the target.
  return s.deposit({
    xyz: [fx * P.extent + j.x * P.jitter,
          fy * P.extent + j.y * P.jitter,
          0.0],
    col: [1.0, 1.0, 1.0],
  });
});
