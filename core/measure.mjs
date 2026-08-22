// The measure core: runtime primitives for positives.
// A positive runs natively under node with these objects - that run
// IS the CPU evaluator. The emitter (core/emit.mjs) reads the same
// source and writes GLSL whose arithmetic matches this file exactly:
// same hash, same u2f rounding (f32 emulated with fround), same
// geometry. Change one side and you have changed both, or you have
// made a liar of the conformance probe.

const fr = Math.fround;
export const TAU = 6.28318530718;
export const PI = 3.14159265359;

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
  flipY() { return new Vec2(this.x, -this.y); }
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

// ---- the windowed vocabulary ---------------------------------------
// the nth prime, for levers that walk 2, 3, 5, 7
export function prime(nth) {
  const i = Math.round(nth);
  return i <= 1 ? 2 : i === 2 ? 3 : i === 3 ? 5 : 7;
}
// rows R = p^L, the smallest power of p reaching 2^depth
export function levels(p, depth) {
  const target = 1 << Math.round(depth);
  let L = 0, R = 1;
  for (let i = 0; i < 24; i++) {
    if (R >= target) break;
    R *= p; L += 1;
  }
  return { L, R };
}
// the digit-triangle domain: base-p Pascal subdivision under Kummer
// and Lucas - the THEOREM domain. Only nonzero cells exist (every
// digit pair b <= a < p gives a unit mod p), and the digit binomial
// rides the descent as the cell's residue.
const CAB = [1, 1, 1, 1, 2, 1, 1, 3, 3, 1, 1, 4, 6, 4, 1,
             1, 5, 10, 10, 5, 1, 1, 6, 15, 20, 15, 6, 1];
export function digitTriangle(p, R) {
  return { kind: "digitTriangle", p: Math.round(p), R: Math.round(R) };
}
// rotation about grey: the STAIN grade
export function stain(c, a) {
  const cs = Math.cos(a), sn = Math.sin(a);
  const k = 0.57735027;
  const dot = k * (c[0] + c[1] + c[2]);
  const cross = [k * (c[2] - c[1]), k * (c[0] - c[2]), k * (c[1] - c[0])];
  return [0, 1, 2].map(i => c[i] * cs + cross[i] * sn + k * dot * (1 - cs));
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
  // the window: MAGNIFY as the loupe. Integer lattice throughout, the
  // centre subtracted before the one conversion to float - the
  // exactness discipline lives here, once, instead of in every plate.
  window(cfg) {
    const mg = fr(Math.pow(2, cfg.magnify));
    const ctr = [Math.trunc(cfg.span[0] / 2), Math.trunc(cfg.span[1] / 2)];
    const wc = [
      ctr[0] + Math.trunc(fr(fr(cfg.heart[0] - ctr[0]) * fr(1 - 1 / mg))),
      ctr[1] + Math.trunc(fr(fr(cfg.heart[1] - ctr[1]) * fr(1 - 1 / mg))),
    ];
    const hw = [Math.trunc(fr(ctr[0]) / mg), Math.trunc(fr(ctr[1]) / mg)];
    const win = [wc[0] - hw[0], wc[1] - hw[1], wc[0] + hw[0], wc[1] + hw[1]];
    const km = cfg.unit * mg;
    return {
      kind: "window", win, wc, km,
      seat(ix, iy, jx, jy) {
        return new Vec2(((ix - wc[0]) + jx) * km, ((iy - wc[1]) + jy) * km);
      },
    };
  }
  // the measure declines this point
  decline() { return null; }
  // orbit: iterate a named-record state up to n times; until() stops
  // early. Simultaneous update: every component of the next state is
  // computed from the previous one, as an object literal naturally
  // does. Returns the final state plus count and escaped.
  orbit(n, init, stepFn, opts = {}) {
    let st = { ...init };
    const N = Math.round(n);
    let count = 0, escaped = false;
    const until = opts.until;
    for (let k = 0; k < N; k++) {
      if (until && until(st)) { escaped = true; break; }
      st = stepFn(st, k);
      count++;
    }
    return { ...st, count, escaped };
  }
  // the descent: addressed survival on a subdivision domain. The
  // stream proposes children; the address decides, identically for
  // every point. Stops where the structure dies.
  descend(domain, levels, cfg) {
    if (domain.kind === "digitTriangle") return this.descendDigits(domain, levels, cfg);
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
  // the weighted descent on the theorem domain: at each level the
  // candidate digit pairs are weighed by what the window can see
  // (conservative box of the child's parallelogram), one draw picks,
  // and the digit binomial multiplies into the residue. Mirrors the
  // emitted GLSL draw for draw.
  descendDigits(dom, L, cfg) {
    const w = cfg.within;
    const p = dom.p, R = dom.R;
    let n0 = 0, k0 = 0, sc = Math.trunc(R / p);
    let v = 1, lineage = 2166136261 >>> 0;
    let dead = false;
    for (let lev = 0; lev < L; lev++) {
      const wts = new Float64Array(28);
      let wsum = 0;
      for (let a = 0; a < p; a++) {
        const ny0 = 2 * (n0 + a * sc), ny1 = ny0 + 2 * sc;
        const oy = Math.min(ny1, w.win[3]) - Math.max(ny0, w.win[1]);
        for (let b = 0; b <= a; b++) {
          const sl = (a * (a + 1)) / 2 + b;
          if (oy > 0) {
            const xlo = 2 * (k0 + b * sc) + (R - 1) - (n0 + (a + 1) * sc - 1);
            const xhi = 2 * (k0 + b * sc + sc - 1) + (R - 1) - (n0 + a * sc);
            const ox = Math.min(xhi + 1, w.win[2]) - Math.max(xlo, w.win[0]);
            if (ox > 0) wts[sl] = fr(fr(oy) * fr(ox));
          }
          wsum = fr(wsum + wts[sl]);
        }
      }
      if (wsum <= 0) { dead = true; break; }
      const pick = fr(this.u() * wsum);
      let run = 0;
      let ca = 0, cb = 0, cc = 1;
      for (let a = 0; a < p; a++) {
        for (let b = 0; b <= a; b++) {
          const sl = (a * (a + 1)) / 2 + b;
          run = fr(run + wts[sl]);
          if (pick < run && pick >= run - wts[sl] && wts[sl] > 0) {
            ca = a; cb = b; cc = CAB[sl];
          }
        }
      }
      v = (v * cc) % p;
      n0 += ca * sc; k0 += cb * sc;
      lineage = hashu((lineage ^ (Math.imul((ca * 7 + cb) + 1, 2654435761) >>> 0)) >>> 0);
      sc = Math.trunc(sc / p);
    }
    return { n: n0, k: k0, v, sig: new Address(lineage, this.chains), dead };
  }
  deposit(d) {
    const glow = d.glow === undefined ? 1.0 : d.glow;
    const at = d.xyz
      ? { x: d.xyz[0], y: d.xyz[1], z: d.xyz[2] }
      : { x: d.xy.x, y: d.xy.y, z: d.z === undefined ? 0 : d.z };
    return {
      ...at,
      r: d.col[0] * glow, g: d.col[1] * glow, b: d.col[2] * glow,
    };
  }
}

// IQ palette, the shared header's pal()
export function pal(t, a, b, c, d) {
  return [0, 1, 2].map(i => a[i] + b[i] * Math.cos(TAU * (c[i] * t + d[i])));
}

// ---- GLSL parity: the builtins plates reach for --------------------
export function fract(x) { return x - Math.floor(x); }
export function mix(a, b, t) { return a + (b - a) * t; }
export function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
export function step(edge, x) { return x < edge ? 0 : 1; }
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function mod(x, y) { return x - y * Math.floor(x / y); }

// complex arithmetic on Vec2 (z.x + i z.y), matching the shared
// header's cmul/cdiv/cinv/csqrt exactly
export function v2(x, y) { return new Vec2(x, y); }
export function cmul(a, b) { return new Vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
export function cdiv(a, b) {
  const d = b.x * b.x + b.y * b.y + 1e-30;
  return new Vec2((a.x * b.x + a.y * b.y) / d, (a.y * b.x - a.x * b.y) / d);
}
export function cinv(a) {
  const d = a.x * a.x + a.y * a.y + 1e-30;
  return new Vec2(a.x / d, -a.y / d);
}
export function csqrt(z) {
  const r = Math.hypot(z.x, z.y);
  const re = Math.sqrt(Math.max(0, 0.5 * (r + z.x)));
  const im = Math.sqrt(Math.max(0, 0.5 * (r - z.x))) * (z.y < 0 ? -1 : 1);
  return new Vec2(re, im);
}

// vec3 helpers for colour and geometry work
export function v3(x, y, z) { return [x, y, z]; }
export function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function mul3(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
export function mix3(a, b, t) { return [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t); }
export function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function normalize3(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function length3(a) { return Math.hypot(a[0], a[1], a[2]); }

// sum(n, k => term): the reduction loop as vocabulary
export function sum(n, f) {
  let acc = 0;
  const N = Math.round(n);
  for (let k = 0; k < N; k++) acc += f(k);
  return acc;
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
// the classic stratum's two extra givens: the point's own coordinate
// (the R2 sequence, exactly as the shared vertex header computes it)
// and the clock. A walk that ignores them is a Mk2 walk; a walk that
// uses them is a coordinate map.
export function r2(i) {
  return new Vec2(u2f(Math.imul(i, 3242174889) >>> 0),
                  u2f(Math.imul(i, 2447445414) >>> 0));
}
export function evaluate(pos, P, i, t = 0) {
  const seed = hashu(hashu((i >>> 0) ^ 0xA5F15EED) ^ Math.imul(i, 2654435761) >>> 0);
  const s = new Stream(seed, pos.chains);
  return pos.walk(P, s, r2(i), t);
}
