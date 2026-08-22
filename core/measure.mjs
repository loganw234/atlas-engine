// The measure core: runtime primitives for positives.
// A positive runs natively under node with these objects - that run
// IS the CPU evaluator. The emitter (core/emit.mjs) reads the same
// source and writes GLSL whose arithmetic matches this file exactly:
// same hash, same u2f rounding (f32 emulated with fround), same
// geometry. Change one side and you have changed both, or you have
// made a liar of the conformance probe.

const fr = Math.fround;
export const TAU = 6.28318530718;

// the atlas's hash, verbatim (glsl-lib.js hashu)
export function hashu(x) {
  x >>>= 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16; return x >>> 0;
}
// float(x) * 2.3283064365386963e-10 at f32 precision, like the GPU
export function u2f(x) {
  return fr(fr(x >>> 0) * fr(2.3283064365386963e-10));
}
// FNV-1a over the id string: the root address constant of a positive
export function fnv1a(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// ---- levers and the positive itself --------------------------------
export function lever(label, min, max, step, def) {
  return { kind: "lever", label, min, max, step, def };
}

export function positive(id, meta, walk) {
  const levers = [], leverNames = [];
  const rest = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v && v.kind === "lever") { levers.push(v); leverNames.push(k); }
    else rest[k] = v;
  }
  if (levers.length > 8) throw new Error(id + ": max 8 levers");
  // chains: the world's identity. Same inputs must reproduce the same
  // subject (operator's rule), so a positive that restates a plate
  // pins the plate's own conventions here - root, child-key packing,
  // and coin - and a new positive takes the canonical defaults.
  const c = rest.chains || {};
  const chains = {
    root: (c.root === undefined ? fnv1a(id) : c.root) >>> 0,
    childKey: c.childKey || null,          // [mult, add] or null = spread
    coin: c.coin || "salted",              // "salted" | "value"
  };
  delete rest.chains;
  return { kind: "positive", id, levers, leverNames, meta: rest, walk,
           chains, root: chains.root };
}

// ---- the two kinds of randomness -----------------------------------
// Address: pure. The same address answers the same for every point
// that ever asks - structure hashes from here and only here. The
// scheme (from the positive's chains) decides how children derive
// and what a coin is, so a restatement can speak its plate's exact
// chains while a new positive takes the canonical ones.
export const CANONICAL = { root: 0, childKey: null, coin: "salted" };
export class Address {
  constructor(h, scheme = CANONICAL) { this.h = h >>> 0; this.scheme = scheme; }
  child(cx, cy) {
    const key = this.scheme.childKey
      ? ((cy | 0) * this.scheme.childKey[0] + (cx | 0) + this.scheme.childKey[1]) >>> 0
      : Math.imul((cy * 1031 + cx + 1) | 0, 2654435761) >>> 0;
    return new Step(hashu((this.h ^ key) >>> 0), cx | 0, cy | 0, this.scheme);
  }
  u(salt = 0) { return u2f(hashu((this.h ^ (salt >>> 0)) >>> 0)); }
  coin(p, salt = 0xC01F) {
    if (this.scheme.coin === "value") return u2f(this.h) < p;
    return this.u(salt) < p;
  }
}
// Step: an address plus the grid move that reached it
export class Step extends Address {
  constructor(h, cx, cy, scheme) { super(h, scheme); this.cx = cx; this.cy = cy; }
}

// ---- geometry ------------------------------------------------------
export class Vec2 {
  constructor(x, y) { this.x = x; this.y = y; }
  scale(k) { return new Vec2(this.x * k, this.y * k); }
  chebyshev() { return Math.max(Math.abs(this.x), Math.abs(this.y)); }
}
// a b-ary square subdivision domain, centred on the origin, unit size
export function grid2(b) { return { kind: "grid2", b: Math.round(b) }; }

export class Cell {
  constructor(x, y, scale, b) { this.x = x; this.y = y; this.scale = scale; this.b = b; }
  into(cx, cy) {
    const b = this.b;
    return new Cell(
      this.x + (cx * this.scale) / b - this.scale * 0.5 * (1 - 1 / b),
      this.y + (cy * this.scale) / b - this.scale * 0.5 * (1 - 1 / b),
      this.scale / b, b);
  }
  at(j) { return new Vec2(this.x + j.x * this.scale, this.y + j.y * this.scale); }
}

// ---- the stream: the point's own consumable budget -----------------
export class Stream {
  constructor(seed, chains) {
    this.state = seed >>> 0;
    this.chains = chains && chains.root !== undefined
      ? chains
      : { root: (chains >>> 0) || 0, childKey: null, coin: "salted" };
  }
  u() { this.state = hashu(this.state); return u2f(this.state); }
  centered() { return this.u() - 0.5; }
  pick(n) {
    n = Math.round(n);
    return Math.min(Math.trunc(this.u() * n), n - 1);
  }
  jitter2() { const x = this.centered(); const y = this.centered(); return new Vec2(x, y); }
  // the budget: how deep this point walks; bias < 1 leans deep
  depth(max, opts = {}) {
    const bias = opts.bias === undefined ? 1.0 : opts.bias;
    return Math.trunc(Math.pow(this.u(), bias) * Math.round(max));
  }
  // the descent: addressed survival on a subdivision domain. The
  // stream proposes children; the address decides, identically for
  // every point. Stops where the structure dies.
  descend(domain, levels, cfg) {
    if (domain.kind !== "grid2") throw new Error("descend: unknown domain");
    const sch = this.chains;
    let cell = new Cell(0, 0, 1, domain.b);
    let addr = new Address(sch.root, sch);
    let trail = sch.root >>> 0;            // the path, folded
    let reached = 0;
    const tries = cfg.tries === undefined ? 1 : cfg.tries;
    for (let l = 0; l < levels; l++) {
      let kept = null;
      for (let k = 0; k < tries && !kept; k++) {
        const cand = cfg.child(addr);
        if (cfg.keep(cand)) kept = cand;
      }
      if (!kept) break;
      cell = cell.into(kept.cx, kept.cy);
      addr = new Address(kept.h, sch);
      trail = hashu((trail ^ kept.h) >>> 0);
      reached += 1;
    }
    return { cell, addr, trail: new Address(trail, sch), reached };
  }
  deposit(d) {
    const glow = d.glow === undefined ? 1.0 : d.glow;
    return {
      x: d.xy.x, y: d.xy.y, z: d.z === undefined ? 0 : d.z,
      r: d.col[0] * glow, g: d.col[1] * glow, b: d.col[2] * glow,
    };
  }
}

// IQ palette, the shared header's pal()
export function pal(t, a, b, c, d) {
  return [0, 1, 2].map(i => a[i] + b[i] * Math.cos(TAU * (c[i] * t + d[i])));
}

// ---- native evaluation ---------------------------------------------
// P by lever NAME; the emitter maps names to P[0..7] by declaration
// order. Point i seeds the stream the way any point stream is seeded:
// by hashing.
export function leverDefaults(pos) {
  const P = {};
  pos.leverNames.forEach((n, i) => P[n] = pos.levers[i].def);
  return P;
}
export function evaluate(pos, P, i) {
  const seed = hashu(hashu((i >>> 0) ^ 0xA5F15EED) ^ Math.imul(i, 2654435761) >>> 0);
  const s = new Stream(seed, pos.chains);
  return pos.walk(P, s);
}
