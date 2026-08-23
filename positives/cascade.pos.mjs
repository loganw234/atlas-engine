// Plate LX The Turbulent Cascade, as a positive. A parcel of ink is
// seeded anywhere in the stirred square and advected a few steps
// through a velocity field summed octave by octave at Kolmogorov's
// amplitudes - equal structure per octave, by physics rather than by
// construction. The octave that dominates each parcel is drawn
// uniformly, so a zoom always finds an eddy being resolved at its own
// scale, and intermittency gates the parcel's whole contribution: the
// roughness real dissipation fields carry beyond K41.
//
// This is the plate that needed the vocabulary to grow twice. The
// advection is a stateful loop whose body contains another one - a
// per-step reduction over octaves - so it needs an orbit step with a
// BLOCK body, which the step arrow could not have until now. And the
// field itself is value noise on a hashed lattice, which the stream
// cannot produce: the stream is sequential, and a field has to hand
// the same value to any two parcels passing through the same cell.
// s.vnoise is that, pinned, rather than a lattice hash written out in
// a plate body where nothing checks it.
//
// The curl is a finite difference on the summed field, which is why
// each octave costs four noise samples rather than one: the velocity
// is perpendicular to the gradient, and taking it numerically keeps
// the field and its flow consistent at every scale.
import { positive, lever, pal, mul3, mix, len2 } from "../core/measure.mjs";

export default positive("cascade", {
  octs:   lever("OCTAVES",       3,   12,  1,     9),
  slope:  lever("SLOPE",         0.2, 0.55, 0.005, 0.333),
  stir:   lever("STIR",          0.2, 2.0, 0.01,  1.0),
  steps:  lever("STREAM STEPS",  2,   12,  1,     7),
  interm: lever("INTERMITTENCY", 0,   1,   0.01,  0.35),
  slabz:  lever("SLAB Z",        0,   0.4, 0.005, 0.08),
  ink:    lever("INK",           0,   1,   0.01,  0.55),
  cam: { dist: 3.0, pitch: 0.3, tgtY: 0.0, rot: 0.0 },
  gain: 0.5, accent: "#e0a56f",
},
(P, s, q, t) => {
  // seed position: uniform over the stirred square
  const p0x = s.u() * 2.4 - 1.2;
  const p0y = s.u() * 2.4 - 1.2;

  // the parcel's focus octave - equal budget per scale
  const focus = s.pick(P.octs);

  // INTERMITTENCY, a multiplicative gate per octave below the focus.
  // The draw is unconditional and the multiply is not: a stream draw
  // inside a branch would make the sequence depend on the branch, and
  // then two parcels with different focus octaves would see different
  // noise for the same octave.
  const G = s.orbit(P.octs, { gate: 1.0 }, (v, k) => {
    const r = s.u();
    const f = mix(1.0, 0.35 + 1.3 * r, P.interm);
    return { gate: (k < focus) ? v.gate * f : v.gate };
  });

  const dt = 0.16 / P.steps;
  const decay = Math.pow(0.5, 1.0 - P.slope) * 0.62;

  // THE ADVECTION. Each step sums the curl of the field over octaves,
  // then moves the parcel along it. The inner orbit carries the two
  // velocity components, the running height, and the octave's own
  // frequency and amplitude - five fields, which is the reason it is
  // an orbit rather than three sums: a sum would evaluate the four
  // noise samples once per component.
  const O = s.orbit(P.steps, { px: p0x, py: p0y, h: 0.0 }, (v, k) => {
    const I = s.orbit(P.octs, {
      vx: 0.0, vy: 0.0, hh: 0.0, freq: 2.0, amp: 1.0,
    }, (w, j) => {
      const e = 0.02 / w.freq;
      const oc = j * 101 + 17;
      const n1 = s.vnoise(v.px * w.freq, (v.py + e) * w.freq, oc);
      const n2 = s.vnoise(v.px * w.freq, (v.py - e) * w.freq, oc);
      const n3 = s.vnoise((v.px + e) * w.freq, v.py * w.freq, oc);
      const n4 = s.vnoise((v.px - e) * w.freq, v.py * w.freq, oc);
      const boost = (j == focus) ? 2.2 : 1.0;
      const g = w.amp * boost;
      const den = 2.0 * e;
      return {
        vx: w.vx + g * (n1 - n2) / den,
        vy: w.vy + g * (n4 - n3) / den,
        hh: w.hh + g * (n1 + n2 + n3 + n4) * 0.25,
        freq: w.freq * 2.0,
        amp: w.amp * decay,
      };
    });
    // the 1e-6 is the registry's, and it is load-bearing: it keeps the
    // direction defined where the summed curl is exactly zero, which a
    // parcel sitting on a stagnation point will find
    const ax = I.vx + 1.0e-6;
    const ay = I.vy + 1.0e-6;
    const L = len2(ax, ay);
    const move = dt * P.stir * G.gate;
    return {
      px: v.px + (ax / L) * move,
      py: v.py + (ay / L) * move,
      h: v.h + I.hh,
    };
  });

  // deposited anywhere along its own path, so the trail is the subject
  // rather than its endpoint
  const along = s.u();
  const seatx = mix(p0x, O.px, along);
  const seaty = mix(p0y, O.py, along);
  const z = (s.u() - 0.5) * P.slabz * (0.4 + 0.6 * G.gate);

  const lv = focus / Math.max(P.octs - 1.0, 1.0);
  return s.deposit({
    xyz: [seatx, seaty, z],
    col: mul3(
      pal(0.08 + 0.5 * lv + 0.12 * O.h,
          [0.5, 0.42, 0.36], [0.5, 0.4, 0.35],
          [1.0, 0.85, 0.6], [0.0, 0.2, 0.5]),
      0.35 + 1.3 * G.gate * (0.5 + P.ink)),
  });
});
