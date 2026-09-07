// The argument sweeps the sequencer target is scored on.
//
// Three sources, and the first is the one that matters: EVERY LITERAL
// THE FUNCTION AND ITS CALLEES CONTAIN, taken as a bit pattern, with
// its two neighbours one ULP away. A det function's branches are
// unsigned magnitude compares against exactly those literals -
// 0x00800000, 0x7F800000, 0x7EF127EA, 0x7E000000, 0x5F375A86 - so
// reading them out of the parsed source puts a sample on both sides of
// every guard the function has, and does it without anybody deciding
// which guards were interesting. Adding a hand-written list would be
// exactly the kind of "the harness happened to sample" that
// det_pow's own comment blames for a 100 ULP error going unnoticed.
//
// Then the specials - both zeros, both infinities, a quiet NaN, the
// subnormal ends, +-1 - and then a deterministic spread: a linear scan
// over a working range, and random patterns whose exponents are drawn
// across the format. The randomness is core/measure.mjs's own hashu
// seeded by the function's name, so a re-run sweeps the same points and
// a reported mismatch can be reproduced.

import { hashu, fnv1a } from "./measure.mjs";

const _b = new DataView(new ArrayBuffer(4));
export const f32bits = (x) => { _b.setFloat32(0, x, true); return _b.getUint32(0, true) >>> 0; };
export const bitsF32 = (u) => { _b.setUint32(0, u >>> 0, true); return _b.getFloat32(0, true); };

const SPECIALS = [
  0x00000000, 0x80000000,               // +-0
  0x00000001, 0x80000001,               // +-smallest subnormal
  0x007fffff, 0x807fffff,               // +-largest subnormal
  0x00800000, 0x80800000,               // +-smallest normal
  0x3f800000, 0xbf800000,               // +-1
  0x40000000, 0xc0000000,               // +-2
  0x3f000000, 0xbf000000,               // +-0.5
  0x7f7fffff, 0xff7fffff,               // +-max normal
  0x7f800000, 0xff800000,               // +-inf
  0x7fc00000,                           // quiet NaN
];

/** Every numeric literal reachable from `name`, as a 32-bit pattern. */
export function literalsOf(lib, name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const f = lib.byName.get(name);
  if (!f) return [];
  const out = [];
  const walk = (e) => {
    if (!e || typeof e !== "object") return;
    if (e.n === "lit") out.push(e.type === "float" ? f32bits(e.value) : e.value >>> 0);
    if (e.n === "call" && lib.byName.has(e.name)) out.push(...literalsOf(lib, e.name, seen));
    for (const k of ["a", "b", "c", "l", "r", "value", "init", "then", "els"])
      if (e[k]) walk(e[k]);
    for (const k of ["args", "body", "decls"]) if (Array.isArray(e[k])) e[k].forEach(walk);
  };
  walk(f.body);
  return out;
}

/** A deterministic stream of uint32, seeded by a string. */
export function stream(seed) {
  let s = fnv1a(seed) >>> 0;
  return () => { s = hashu((s + 0x9e3779b9) >>> 0); return s >>> 0; };
}

/** Float patterns spread across the exponent range, so the sweep sees
 *  subnormals, ordinary magnitudes and the overflow edge in proportion
 *  rather than whatever a uniform draw over [0,1) happens to give. */
function spreadFloats(next, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = next(), q = next();
    const sign = (r >>> 31) & 1;
    const exp = q % 256;                       // 0..255: subnormals through inf
    const man = r & 0x7fffff;
    out.push(((sign << 31) | (exp << 23) | man) >>> 0);
  }
  return out;
}

function linear(lo, hi, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(f32bits(lo + (hi - lo) * i / (n - 1)));
  return out;
}

/** Working ranges, one line each, with where the range comes from. A
 *  range is not a claim that the function is only correct there - the
 *  spread and the literals cover the whole format - it is where the
 *  sweep spends its linear samples. */
export const RANGES = {
  det_sincos: [[-804, 804], "docs/detlib header: no plate in the atlas passes an argument above about 804"],
  det_sin: [[-804, 804], "as det_sincos"],
  det_cos: [[-804, 804], "as det_sincos"],
  det_tan: [[-804, 804], "as det_sincos"],
  det_exp2: [[-150, 130], "the clamp in the function body, plus a margin"],
  det_log2: [[1e-6, 1e6], "the magnify lever and the descend depths the emitter routes through log2"],
  det_log2_ef: [[1e-6, 1e6], "as det_log2"],
  det_sqrt: [[0, 1e4], "lengths and radii in world units"],
  det_recip: [[-1e4, 1e4], "as det_div"],
  det_div: [[-1e4, 1e4], "world coordinates and lever values"],
  det_atan: [[-1e3, 1e3], "atan2 of a pair of world coordinates"],
  det_acos: [[-1, 1], "the whole domain of acos"],
  det_mod: [[-1e3, 1e3], "wrapping a world coordinate"],
  det_pow: [[0.01, 30], "bases the plates raise; the exponent sweeps separately"],
  det_split12: [[-1e3, 1e3], "an operand of det_twoprod"],
  det_twoprod: [[-1e3, 1e3], "as det_split12"],
  det_scale48: [[1, 0x7fffff], "a subnormal's mantissa - the only thing any caller passes"],
  u2f: [[0, 0xffffffff], "the whole uint range: a draw is a hash output"],
  hashu: [[0, 0xffffffff], "the whole uint range"],
};

/** The domain each function is CONTRACTUALLY defined on, as a
 *  predicate over the argument bit patterns, with the sentence in the
 *  library that says so.
 *
 *  This is not a way of hiding failures. The sweep still covers every
 *  point; the verification counts in-domain and out-of-domain
 *  mismatches separately and prints both, and docs/CFT-DETLIB.md
 *  explains every out-of-domain divergence and what causes it. A
 *  function with no entry here is claimed on the WHOLE format, which is
 *  the stronger claim and is what most of them get.
 *
 *  Only three functions need one, and each names an operation GLSL
 *  itself leaves undefined. */
const isNaNb = (u) => ((u & 0x7f800000) === 0x7f800000) && (u & 0x007fffff) !== 0;
export const DOMAINS = {
  det_scale48: {
    test: (a) => a[0] >= 1 && a[0] < 0x00800000,
    says: "1 <= ux < 2^23 - a subnormal's mantissa. All three callers " +
          "(det_recip, det_sqrt, det_log2) test ux against zero and against " +
          "0x00800000 before calling; the function's own comment is \"a " +
          "denormal's bits ARE its mantissa\". It is a helper, not an entry " +
          "point, and findMSB is only reached from inside those guards.",
  },
  det_exp2: {
    test: (a) => !isNaNb(a[0]),
    says: "any non-NaN x. clamp(x, -150, 129) brings every finite and " +
          "infinite argument into the range int() is defined on, but a NaN " +
          "passes the clamp unchanged - GLSL's min and max on a NaN return " +
          "the NaN - and reaches int(k), which GLSL leaves UNDEFINED. The " +
          "library's own header calls that out as finding 70: \"two stacks " +
          "disagreeing about an out-of-range conversion return DIFFERENT " +
          "SIGNS\".",
  },
  det_pow: {
    test: (a) => !isNaNb(a[1]) && a[0] > 0 && a[0] < 0x7f800000,
    says: "0 < x < inf, y not a NaN. The library header puts \"log of a " +
          "non-positive\" outside the contract and det_pow reaches det_log2 " +
          "or det_log2_ef for every x; GLSL's own pow is undefined for " +
          "x < 0 and for x = 0 with y <= 0. Where det_log2 returns a NaN or " +
          "an infinity, y*log2(x) can be the 0*inf form - det_pow(+inf, +0) " +
          "is the whole of what x = inf adds - and det_exp2 then receives a " +
          "NaN, which is the det_exp2 line above.",
  },
};

/** Build one sweep. `argTypes` is the function's input types in order.
 *  Returns one Uint32Array per input, all the same length. */
export function sweepFor(lib, name, argTypes, points = 4096) {
  const next = stream("cft-detlib:" + name);
  const lits = [...new Set(literalsOf(lib, name))];
  const neighbours = [];
  for (const u of lits) {
    neighbours.push(u >>> 0);
    neighbours.push((u + 1) >>> 0);
    neighbours.push((u - 1) >>> 0);
  }
  const fixed = [...new Set([...SPECIALS, ...neighbours])];
  const [range, why] = RANGES[name] ?? [[-1e3, 1e3], "no recorded range"];

  const cols = argTypes.map((t, ai) => {
    const pool = [];
    pool.push(...fixed);
    if (t === "uint") {
      const [lo, hi] = range;
      // half the budget inside the function's own range, so a function
      // with a narrow stated domain still gets a dense sweep there
      const n = Math.min(Math.floor(points / 2), Math.max(2, Math.floor(hi - lo) + 1));
      for (let i = 0; i < n; i++) pool.push(Math.round(lo + (hi - lo) * i / (n - 1)) >>> 0);
      while (pool.length < points) pool.push(next());
    } else {
      pool.push(...linear(range[0], range[1], 1024));
      while (pool.length < points) pool.push(...spreadFloats(next, 256));
    }
    // a second and later argument is decorrelated from the first, so a
    // two-argument function does not only ever see equal operands
    if (ai > 0) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = next() % (i + 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    return pool;
  });

  // A two-argument function must see both operands special at once -
  // det_div(0, 0), det_atan(-0, -1), det_mod(x, inf) - and a column
  // built independently never produces those pairs. So the cross
  // product of the specials goes in front of everything else.
  if (argTypes.length >= 2) {
    const tuples = [];
    const build = (depth, acc) => {
      if (depth === argTypes.length) { tuples.push(acc.slice()); return; }
      for (const s of SPECIALS) { acc.push(s); build(depth + 1, acc); acc.pop(); }
    };
    build(0, []);
    cols.forEach((c, i) => c.unshift(...tuples.map(t => t[i])));
  }

  const n = Math.min(points, ...cols.map(c => c.length));
  return { cols: cols.map(c => Uint32Array.from(c.slice(0, n))), n, range, why,
           literals: lits.length, fixed: fixed.length };
}
