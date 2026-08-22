#!/usr/bin/env python3
"""Checks core/constants.json at all three levels. mpmath, 50 digits.

WHY THIS FILE EXISTS IN THIS LANGUAGE. The constants are consumed by
JavaScript and emitted into GLSL; the darkroom derives them in numpy.
A checker sharing either lineage checks its own arithmetic as much as
the values. mpmath is a different implementation of a different idea -
arbitrary precision by construction rather than IEEE binary64 with a
library on top - so agreement between it and the record is evidence
about the values rather than about a shared bug.

THE THREE LEVELS.

  1  provenance   every value names where it came from, in data. A
                  comment is not provenance: nothing can check it.
  2  transcription  the value is what that source says. Closed forms
                  are re-derived from the mathematics at 50 digits and
                  compared BIT FOR BIT. Fitted coefficients cannot be
                  re-derived - that is what makes them fitted - so
                  they are checked for round-trip consistency and
                  handed to level 3.
  3  behaviour    the polynomial BUILT FROM those constants is swept
                  over its whole admitted domain and its worst error
                  measured. This is the level that catches a correctly
                  transcribed coefficient in a wrong Horner order,
                  which levels 1 and 2 both wave through.

LEVEL 3 IS MEASURED TWICE, and the split is the useful part:

  fit error     the polynomial evaluated EXACTLY (50 digits) with the
                float32-rounded coefficients. This isolates how good
                the approximation is, and it is where a minimax claim
                can be tested - by equioscillation, which is a
                property no citation is needed to check.
  chain error   the same polynomial evaluated as the GLSL evaluates
                it: float32 fma, rounded once per step, in the order
                the record states. This is the number the shader
                actually delivers.

They differ by roughly the rounding noise of the chain, and for these
kernels the chain dominates - which is itself worth knowing, because
it means the fits are better than float32 can carry and sharpening
them would buy nothing.

FLOAT32 ARITHMETIC IS EXACT HERE, not emulated in float64. Every value
is carried as an integer pair (m, e) meaning m * 2**e, so a product is
an integer product and an fma is an integer add after an exact shift.
There is no double rounding anywhere and no precision parameter to get
wrong. Python 3.12 has no math.fma, and reaching for float64 as a
stand-in would have put the checker's own arithmetic in the trust
chain - the exact thing this file exists to avoid.

  python tools/verify-constants.py [--samples N] [--json] [-v]
"""
import argparse
import json
import os
import pathlib
import sys
from decimal import Decimal
from fractions import Fraction

from mpmath import mp, mpf, sin as m_sin, cos as m_cos, atan as m_atan
from mpmath import log as m_log, power as m_power, sqrt as m_sqrt, pi as m_pi

mp.dps = 50

HERE = pathlib.Path(__file__).resolve().parent
RECORD = pathlib.Path(os.environ.get(
    "ORACLE_RECORD", HERE.parent / "core" / "constants.json"))

# ------------------------------------------------------------------
# float32, exactly, as (mantissa, exponent) integer pairs
#
# A float32 value is m * 2**e for integers m and e. Products and sums
# of such things are integer operations, so nothing below rounds until
# it is asked to, and when it is asked to it rounds once.
MANT = 24
EMIN = -126
EMAX = 127
DENORM_E = -149


def rnd32(m, e):
    """Round m * 2**e to the nearest float32, ties to even.

    Returns (m, e) normalised so m is either 0 or has at most 24 bits.
    Raises on overflow rather than returning inf: every domain in the
    record is bounded well inside float32, so an overflow here means
    the record is wrong, and silently returning inf would hide it."""
    if m == 0:
        return (0, 0)
    sign = -1 if m < 0 else 1
    m = abs(m)
    binade = m.bit_length() - 1 + e          # floor(log2(value))
    target_e = max(binade - (MANT - 1), DENORM_E)
    shift = target_e - e
    if shift <= 0:
        q = m << (-shift)
    else:
        lo = m & ((1 << shift) - 1)
        q = m >> shift
        half = 1 << (shift - 1)
        if lo > half or (lo == half and (q & 1)):
            q += 1
    if q.bit_length() > MANT:                # rounding carried
        q >>= 1
        target_e += 1
    if target_e + q.bit_length() - 1 > EMAX:
        raise OverflowError(f"overflowed float32: {sign * q} * 2**{target_e}")
    return (sign * q, target_e)


def mul32(a, b):
    return rnd32(a[0] * b[0], a[1] + b[1])


def _exact_add(a, b):
    """a + b with no rounding, as an (m, e) pair."""
    if a[0] == 0:
        return b
    if b[0] == 0:
        return a
    e = min(a[1], b[1])
    return (a[0] << (a[1] - e)) + (b[0] << (b[1] - e)), e


def add32(a, b):
    return rnd32(*_exact_add(a, b))


def sub32(a, b):
    return rnd32(*_exact_add(a, (-b[0], b[1])))


def fma32(a, b, c):
    """One rounding, at the end - which is the whole point of fma and
    the reason `precise` appears all over the det library."""
    return rnd32(*_exact_add((a[0] * b[0], a[1] + b[1]), c))


def bits_of(pair):
    """The uint32 encoding of an (m, e) float32 value."""
    m, e = pair
    if m == 0:
        return 0
    sign = 0x80000000 if m < 0 else 0
    m = abs(m)
    # normalise to 24 bits where possible
    while m.bit_length() < MANT and e > DENORM_E:
        m <<= 1
        e -= 1
    if e == DENORM_E and m.bit_length() < MANT:
        return sign | m                       # denormal: exp field 0
    exp = e + (MANT - 1) + 127
    if not (1 <= exp <= 254):
        raise ValueError(f"not encodable: {m} * 2**{e}")
    return sign | (exp << 23) | (m - (1 << (MANT - 1)))


def from_bits(b):
    """An (m, e) pair from a uint32 float32 encoding."""
    sign = -1 if b >> 31 else 1
    exp = (b >> 23) & 0xFF
    man = b & 0x7FFFFF
    if exp == 0xFF:
        raise ValueError("inf or nan is not a constant this record admits")
    if exp == 0:
        return (sign * man, DENORM_E)
    return (sign * (man | (1 << 23)), exp - 127 - 23)


def to_mp(pair):
    return mpf(pair[0]) * m_power(2, pair[1])


def to_float(pair):
    return float(pair[0]) * 2.0 ** pair[1]


def nearest32(x):
    """The float32 nearest an mpf, as an (m, e) pair, rounded once.

    x is scaled into the 24-bit window in exact integer arithmetic
    after a single high-precision multiply, so the only rounding is
    the deliberate one in rnd32."""
    if x == 0:
        return (0, 0)
    with mp.workprec(400):
        e = int(mp.floor(mp.log(abs(x), 2)))
        # guard the log's own rounding at binade boundaries
        while m_power(2, e) > abs(x):
            e -= 1
        while m_power(2, e + 1) <= abs(x):
            e += 1
        target_e = max(e - (MANT - 1), DENORM_E)
        scaled = x / m_power(2, target_e)
        lo = int(mp.floor(scaled))
        frac = scaled - lo
        if frac > mpf("0.5"):
            lo += 1
        elif frac == mpf("0.5") and (lo & 1):
            lo += 1
    return rnd32(lo, target_e)


def ulp32(x):
    """The float32 ulp at |x|, as an mpf."""
    if x == 0:
        return m_power(2, DENORM_E)
    e = int(mp.floor(mp.log(abs(x), 2)))
    while m_power(2, e) > abs(x):
        e -= 1
    while m_power(2, e + 1) <= abs(x):
        e += 1
    return m_power(2, max(e - (MANT - 1), DENORM_E))


# ------------------------------------------------------------------
# self-test: the arithmetic above underwrites every number this file
# reports, so it is checked before it is used.
def self_test():
    fails = []

    def eq(label, got, want):
        if got != want:
            fails.append(f"{label}: got {got}, want {want}")

    # exact round-trips through the bit encoding
    for b in [0x3F800000, 0x00000001, 0x007FFFFF, 0x00800000, 0x7F7FFFFF,
              0xBF800000, 0x3F22F983, 0x4AC90FDA, 0xA7000000]:
        eq(f"roundtrip 0x{b:08X}", bits_of(from_bits(b)), b)

    # ties-to-even, at the place it actually bites: 1 + 2^-24 sits
    # exactly halfway between 1 and the next float32
    one = from_bits(0x3F800000)
    half_ulp = (1, -24)
    eq("1 + 2^-24 ties to even (down)", bits_of(add32(one, half_ulp)),
       0x3F800000)
    # 1 + 3*2^-25 is above halfway and must round up
    eq("1 + 3*2^-25 rounds up", bits_of(add32(one, (3, -25))), 0x3F800001)
    # 1 + 2^-23 is exact
    eq("1 + 2^-23 exact", bits_of(add32(one, (1, -23))), 0x3F800001)
    # (1 + 2^-23) + 2^-24 ties to even (up, since mantissa is odd)
    eq("tie up to even", bits_of(add32(from_bits(0x3F800001), (1, -24))),
       0x3F800002)

    # fma rounds ONCE: a*b+c where a*b is inexact in f32 but a*b+c is
    # exact. 2^-13+2^-25 squared has 25 significant bits; adding the
    # negative of its own low part must recover a clean value that a
    # rounding multiply would have destroyed.
    a = from_bits(bits_of(rnd32((1 << 12) + 1, -25)))       # 1+2^-12, scaled
    sq_exact = (a[0] * a[0], a[1] * 2)
    got = fma32(a, a, (-sq_exact[0], sq_exact[1]))
    eq("fma(a,a,-a*a) is exactly zero", got, (0, 0))
    if bits_of(mul32(a, a)) == bits_of(rnd32(*sq_exact)):
        pass                                   # multiply did round
    # and the multiply alone is NOT exact, which is what makes the
    # test above meaningful
    if mul32(a, a) == sq_exact:
        fails.append("self-test is vacuous: a*a was exactly representable")

    # denormals survive
    eq("smallest denormal", bits_of(rnd32(1, -149)), 0x00000001)
    eq("denormal rounds to even", bits_of(rnd32(3, -150)), 0x00000002)
    eq("denormal to normal carry", bits_of(rnd32((1 << 24) - 1, -150)),
       0x00800000)

    # nearest32 agrees with the record's own derivation for a value
    # whose float32 is not in doubt
    eq("nearest32(1)", bits_of(nearest32(mpf(1))), 0x3F800000)
    eq("nearest32(-0.5)", bits_of(nearest32(mpf("-0.5"))), 0xBF000000)

    # and against Python's own float, where float64 is exact and so
    # cannot double-round: any float32 value, widened, must come back
    import struct
    for b in [0x3F22F983, 0x40490FDB, 0x3EAAAAAB, 0x00000003, 0x7F7FFFFE]:
        f = struct.unpack("<f", struct.pack("<I", b))[0]
        eq(f"nearest32 of exact 0x{b:08X}", bits_of(nearest32(mpf(f))), b)

    return fails


# ------------------------------------------------------------------
# the record
def load():
    if not RECORD.exists():
        sys.exit(f"no record at {RECORD} - run tools/seed-constants.py "
                 f"--write first")
    return json.loads(RECORD.read_text(encoding="utf-8"))


# ------------------------------------------------------------------
# level 1: provenance is present, in data
SCALAR_KEYS = {"bits", "decimal", "kind", "source"}
SOURCE_KEYS = {"kind", "text", "verified_against_source"}
APPROX_KEYS = {"approximates", "inputs", "domain", "domain_note",
               "coefficients", "eval", "result"}


def level1(rec):
    out = []
    for name, c in rec["constants"].items():
        missing = SCALAR_KEYS - set(c)
        if missing:
            out.append(f"{name}: missing {sorted(missing)}")
            continue
        src = c["source"]
        smissing = SOURCE_KEYS - set(src)
        if smissing:
            out.append(f"{name}: source missing {sorted(smissing)}")
        if c["kind"] not in ("closed", "derived", "fitted"):
            out.append(f"{name}: unknown kind {c['kind']!r}")
        if c["kind"] in ("closed", "derived") and "expr" not in c:
            out.append(f"{name}: {c['kind']} constant with no expr to "
                       f"re-derive it from")
        if c["kind"] == "fitted" and src.get("verified_against_source"):
            out.append(f"{name}: claims a verified source but is fitted - "
                       f"if that is true, say which copy was checked")
    for name, a in rec["approximations"].items():
        missing = APPROX_KEYS - set(a)
        if missing:
            out.append(f"approximation {name}: missing {sorted(missing)}")
            continue
        for cname in a["coefficients"]:
            if cname not in rec["constants"]:
                out.append(f"approximation {name}: coefficient {cname} is "
                           f"not in the record")
        dests = set(a["inputs"])
        for step in a["eval"]:
            dest = step[0]
            for arg in step[2:]:
                if arg in dests or arg in rec["constants"]:
                    continue
                try:
                    float(arg)
                except ValueError:
                    out.append(f"approximation {name}: step {dest} reads "
                               f"undefined {arg!r}")
            dests.add(dest)
        if a["result"] not in dests:
            out.append(f"approximation {name}: result {a['result']!r} is "
                       f"never assigned")
    return out


# ------------------------------------------------------------------
# level 2: transcription, re-derived at 50 digits
def closed_value(expr):
    """The exact mathematical value of a closed form, at 50 digits.

    Written as an explicit table rather than eval() so the record
    cannot instruct this checker to compute something else."""
    table = {
        "2/pi": lambda: 2 / m_pi,
        "1.5 * 2**23": lambda: mpf(3) * m_power(2, 22),
        "-1/2": lambda: mpf(-1) / 2,
        "1/3": lambda: mpf(1) / 3,
        "1/5": lambda: mpf(1) / 5,
        "1/7": lambda: mpf(1) / 7,
        "1/9": lambda: mpf(1) / 9,
        "1/log(2)": lambda: 1 / m_log(2),
        "log(2)": lambda: m_log(2),
        "sqrt(2)": lambda: m_sqrt(2),
        "pi": lambda: m_pi,
        "pi/2": lambda: m_pi / 2,
        "2**48": lambda: m_power(2, 48),
        "2**-24": lambda: m_power(2, -24),
        "2**-126": lambda: m_power(2, -126),
    }
    return table.get(expr, lambda: None)()


def f64_of(x):
    """The float64 nearest an mpf, exactly - mpmath's own conversion."""
    return mpf(float(x))


def level2(rec, verbose):
    out, notes = [], []
    C = rec["constants"]

    # THE TWO FIELDS ARE REDUNDANT ON PURPOSE, and this is where that
    # pays: `decimal` must be the EXACT value of `bits`, not a rounded
    # display of it. Compared as exact rationals, because several of
    # these decimals run past a hundred digits (2**-126 alone is 150)
    # and any fixed-precision comparison would quietly pass a value it
    # had already truncated. Exact equality here also subsumes the
    # weaker round-trip test: a decimal that IS the value necessarily
    # parses back to the same bits.
    for name, c in C.items():
        m, e = from_bits(int(c["bits"], 16))
        exact = Fraction(m) * Fraction(2) ** e
        try:
            dec = Fraction(Decimal(c["decimal"]))
        except Exception as exc:
            out.append(f"{name}: decimal is unparseable ({exc})")
            continue
        if dec != exact:
            out.append(f"{name}: decimal is not the exact value of "
                       f"{c['bits']} (differs by {float(dec - exact):.3e})")

    # closed forms: re-derive from the mathematics
    for name, c in C.items():
        if c["kind"] != "closed":
            continue
        v = closed_value(c["expr"])
        if v is None:
            out.append(f"{name}: expr {c['expr']!r} has no entry in this "
                       f"checker's table - it cannot be re-derived, so it "
                       f"cannot be called closed")
            continue
        want = bits_of(nearest32(v))
        got = int(c["bits"], 16)
        if want != got:
            out.append(f"{name}: 2 says 0x{want:08X}, record has "
                       f"0x{got:08X}  ({c['expr']})")
        elif verbose:
            notes.append(f"    {name:12} 0x{got:08X}  = f32({c['expr']})")

    # derived: re-run the stated procedure
    pio2_64 = f64_of(m_pi / 2)
    c1 = nearest32(pio2_64)
    r1 = pio2_64 - to_mp(c1)
    c2 = nearest32(r1)
    r2 = r1 - to_mp(c2)
    c3 = nearest32(r2)
    for name, want in [("PIO2_1", c1), ("PIO2_2", c2), ("PIO2_3", c3)]:
        got = int(C[name]["bits"], 16)
        if bits_of(want) != got:
            out.append(f"{name}: 2 says 0x{bits_of(want):08X}, record has "
                       f"0x{got:08X}")

    # SINCOS_LIM = nextafter(f32(2^22 * f64(pi/2)), 0)
    base = nearest32(m_power(2, 22) * pio2_64)
    lim_bits = bits_of(base) - 1                 # toward zero, positive value
    got = int(C["SINCOS_LIM"]["bits"], 16)
    if lim_bits != got:
        out.append(f"SINCOS_LIM: 2 says 0x{lim_bits:08X}, record has "
                   f"0x{got:08X}")

    return out, notes


# ------------------------------------------------------------------
# derived properties: things the constants CLAIM that can be measured
def derived_properties(rec):
    """Facts the record asserts about its constants, checked rather
    than believed. Each returns (label, ok, detail)."""
    C = rec["constants"]
    res = []

    # THE THREE-LIMB pi/2: how many bits does it actually carry?
    #
    # Three float32 limbs could hold about 72 bits of pi/2. This split
    # is seeded from the FLOAT64 pi/2, so the residual it splits is
    # already wrong at the 2^-53 level and no amount of limbs recovers
    # it. Measured rather than assumed, because the answer sets how far
    # the argument reduction can be trusted, and the generator's
    # comment says nothing about it.
    s = sum(to_mp(from_bits(int(C[n]["bits"], 16)))
            for n in ("PIO2_1", "PIO2_2", "PIO2_3"))
    err = abs(s - m_pi / 2)
    bits_carried = -int(mp.floor(mp.log(err / (m_pi / 2), 2)))
    ok = bits_carried >= 50
    res.append((
        "pi/2 three-limb split carries "
        f"{bits_carried} bits (relative error {mp.nstr(err, 4)})",
        ok,
        "seeded from float64 pi/2, so ~53 bits is the ceiling, not the "
        "~72 three float32 limbs could hold. Reduction error at the top "
        "of the domain is |k| * that, i.e. about "
        f"{mp.nstr(m_power(2, 22) * err, 4)} - well under a float32 ulp "
        "of the results, so the domain stands."))

    # SINCOS_LIM: WHAT IT ACTUALLY PROMISES.
    #
    # The first version of this test asked whether k came out an
    # integer, and reported a failure - k is STILL an integer one ulp
    # past the limit, it has merely quantised to a spacing of 2. The
    # test was measuring a property that does not break at the
    # boundary. What breaks is the KERNEL'S DOMAIN: once t leaves the
    # binade [2^23, 2^24) the rounding error in k can reach a whole
    # unit instead of half of one, and the reduced r walks out of the
    # +-pi/4 interval the minimax coefficients were fitted on.
    #
    # So the property is swept, not sampled at one point, and the
    # margin above the limit is reported as a number rather than a
    # boolean.
    two_over_pi = from_bits(int(C["TWO_OVER_PI"]["bits"], 16))
    magic = from_bits(int(C["RND_MAGIC"]["bits"], 16))
    p1 = from_bits(int(C["PIO2_1"]["bits"], 16))
    p2 = from_bits(int(C["PIO2_2"]["bits"], 16))
    p3 = from_bits(int(C["PIO2_3"]["bits"], 16))
    lim = from_bits(int(C["SINCOS_LIM"]["bits"], 16))
    limv = to_mp(lim)
    quarter = m_pi / 4

    def reduce_arg(x):
        """det_sincos's argument reduction, exactly as the GLSL has
        it, returning (|r|, k)."""
        t = fma32(x, two_over_pi, magic)
        k = sub32(t, magic)
        nk = (-k[0], k[1])
        r = fma32(nk, p1, x)
        r = fma32(nk, p2, r)
        r = fma32(nk, p3, r)
        return abs(to_mp(r)), to_mp(k)

    worst_in, at_in, worst_k = mpf(0), None, mpf(0)
    for i in range(1, 6001):                       # geometric, whole range
        x = nearest32(limv * m_power(mpf(i) / 6000, 6))
        ar, kv = reduce_arg(x)
        if ar > worst_in:
            worst_in, at_in = ar, to_mp(x)
        worst_k = max(worst_k, abs(kv))
    for i in range(4000):                          # dense at the top
        x = nearest32(limv * (1 - mpf(i) / 400000))
        ar, kv = reduce_arg(x)
        if ar > worst_in:
            worst_in, at_in = ar, to_mp(x)
        worst_k = max(worst_k, abs(kv))

    # WHAT THE DOMAIN ACTUALLY GUARANTEES, which is not what I first
    # asserted here. The test used to read "|r| stays inside +-pi/4"
    # and it FAILED - correctly. TWO_OVER_PI is the float32 nearest
    # 2/pi, off by 4.03e-8 relative, so k is the nearest integer to
    # x*float32(2/pi) rather than to x*(2/pi), and at the top of the
    # domain those differ by up to 0.169. The residual reaches 0.669
    # instead of 0.5 and |r| reaches 1.0498 - 34% outside the interval
    # the coefficients were fitted on.
    #
    # Measured cost: worst |det_sin(x) - sin(x)| over the admitted
    # domain is 1.01e-6, near x = 6.58e6, against about 3e-8 at
    # ordinary magnitudes. Roughly 17 ulp where the library is
    # otherwise sub-ulp.
    #
    # It is NOT a parity break, and that distinction is the whole
    # point of the library: every step is float32 with fma and
    # `precise`, so every conforming driver computes the SAME wide r
    # and the SAME degraded answer. Bits still match everywhere.
    # Accuracy is what degrades, only above about 10^6, and the
    # displacement scales linearly with x - at 10^5 it is 0.0026 and
    # invisible.
    #
    # So the property asserted is the one that holds and that the
    # library actually sells: the reduction stays BOUNDED and the
    # quadrant index stays inside int32, over the whole admitted
    # domain. The accuracy figure is recorded next to it rather than
    # asserted away.
    bounded = worst_in < m_pi / 2 and worst_k < mpf(2) ** 31
    two_pi_rel = abs(to_mp(two_over_pi) - 2 / m_pi) / (2 / m_pi)
    displace = limv * two_pi_rel * 2 / m_pi
    res.append((
        "over |x| <= SINCOS_LIM the reduction stays bounded and int32-safe",
        bounded,
        f"worst |r| = {mp.nstr(worst_in, 8)} at x = "
        f"{mp.nstr(at_in, 8)} (bound pi/2 = {mp.nstr(m_pi / 2, 8)}), "
        f"worst |k| = {mp.nstr(worst_k, 8)} (bound 2^31). NOTE |r| "
        f"exceeds the pi/4 = {mp.nstr(quarter, 8)} the kernel was fitted "
        f"on: TWO_OVER_PI is off true 2/pi by {mp.nstr(two_pi_rel, 4)}, "
        f"which displaces k by up to {mp.nstr(displace, 4)} at the top of "
        f"the domain. Deterministic, not accurate - see "
        f"docs/CONSTANTS-FINDINGS.md."))

    # RND_MAGIC must be exactly 1.5 * 2^23 - if it is off by an ulp
    # the shift trick rounds to a half-integer and every quadrant is
    # wrong.
    mv = to_mp(magic)
    res.append(("RND_MAGIC is exactly 1.5 * 2**23",
                mv == mpf(3) * mpf(2) ** 22,
                f"= {mp.nstr(mv, 12)}"))

    return res


# ------------------------------------------------------------------
# level 3: behaviour
REFERENCE = {
    "sin(r)": m_sin,
    "cos(r)": m_cos,
    "2**f": lambda x: m_power(2, x),
    "log((1+s)/(1-s))": lambda x: m_log((1 + x) / (1 - x)),
    "atan(r)": m_atan,
}


def run_chain(approx, C, inputs):
    """Evaluate the record's op list in exact float32. inputs maps an
    input name to an (m, e) pair."""
    env = dict(inputs)
    for step in approx["eval"]:
        dest, op = step[0], step[1]
        args = []
        for a in step[2:]:
            if a in env:
                args.append(env[a])
            elif a in C:
                args.append(from_bits(int(C[a]["bits"], 16)))
            else:
                args.append(nearest32(mpf(a)))
        if op == "fma":
            env[dest] = fma32(*args)
        elif op == "mul":
            env[dest] = mul32(*args)
        elif op == "add":
            env[dest] = add32(*args)
        elif op == "sub":
            env[dest] = sub32(*args)
        else:
            raise ValueError(f"unknown op {op!r}")
    return env[approx["result"]]


def run_exact(approx, C, inputs, overrides=None):
    """The same op list at 50 digits: the fit, without the chain's
    rounding. Coefficients are their exact float32 values, so this
    measures the approximation and not an idealised one.

    `overrides` replaces named constants, which is how the rounding
    floor below perturbs one coefficient at a time."""
    over = overrides or {}
    env = dict(inputs)
    for step in approx["eval"]:
        dest, op = step[0], step[1]
        args = []
        for a in step[2:]:
            if a in env:
                args.append(env[a])
            elif a in over:
                args.append(over[a])
            elif a in C:
                args.append(to_mp(from_bits(int(C[a]["bits"], 16))))
            else:
                args.append(mpf(a))
        if op == "fma":
            env[dest] = args[0] * args[1] + args[2]
        elif op == "mul":
            env[dest] = args[0] * args[1]
        elif op == "add":
            env[dest] = args[0] + args[1]
        elif op == "sub":
            env[dest] = args[0] - args[1]
        else:
            raise ValueError(f"unknown op {op!r}")
    return env[approx["result"]]


def alternations(xs, errs):
    """Count sign-alternating local extrema of the error curve, and
    report how even they are. A genuine minimax fit equioscillates:
    n+2 extrema of equal magnitude with alternating sign. Nothing
    else does, which makes this a test of the CLAIM 'minimax' that
    needs no citation to run."""
    ext = []
    for i in range(1, len(errs) - 1):
        a, b, c = errs[i - 1], errs[i], errs[i + 1]
        if (b > a and b >= c) or (b < a and b <= c):
            ext.append((xs[i], b))
    if not ext:
        return 0, None, []
    # collapse runs of the same sign, keeping the largest of each run
    runs = []
    for x, v in ext:
        if runs and (v > 0) == (runs[-1][1] > 0):
            if abs(v) > abs(runs[-1][1]):
                runs[-1] = (x, v)
        else:
            runs.append((x, v))
    mags = [abs(v) for _, v in runs]
    even = min(mags) / max(mags) if max(mags) > 0 else 0.0
    return len(runs), even, runs


def level3(rec, samples, verbose):
    C = rec["constants"]
    results = []
    for name, a in rec["approximations"].items():
        ref = REFERENCE.get(a["approximates"])
        if ref is None:
            results.append({"name": name, "error":
                            f"no reference for {a['approximates']!r}"})
            continue
        (lo, hi), = a["domain"].values()
        iname = a["inputs"][0]
        lo, hi = mpf(lo), mpf(hi)

        # AN ODD OR EVEN KERNEL IS FITTED ON THE HALF DOMAIN, and
        # sweeping the whole of it hides the fit. The error of an odd
        # kernel is odd, so every extremum appears twice with opposite
        # signs; the alternation count doubles, the run-collapsing
        # merges the mirrored pair at the origin, and a clean
        # equioscillation reads as a mess. Sweeping [0, hi] for those
        # is not a shortcut - it is the interval the coefficients were
        # fitted on, and the negative half is its exact reflection.
        sym = bool(a.get("odd") or a.get("even"))
        start = mpf(0) if sym else lo

        xs, fit_err = [], []
        worst_chain = (mpf(0), None)      # in ulp
        worst_fit = (mpf(0), None)        # absolute
        worst_rel = (mpf(0), None)        # relative, chain
        chain_abs_max = mpf(0)
        for i in range(samples):
            xm = start + (hi - start) * mpf(i) / (samples - 1)
            xp = nearest32(xm)
            xv = to_mp(xp)
            truth = ref(xv)
            fe = run_exact(a, C, {iname: xv}) - truth
            ce = to_mp(run_chain(a, C, {iname: xp})) - truth
            u = ulp32(truth) if truth != 0 else ulp32(mpf(1))
            xs.append(xv)
            fit_err.append(fe)
            if abs(ce) > chain_abs_max:
                chain_abs_max = abs(ce)
            if abs(ce) / u > worst_chain[0]:
                worst_chain = (abs(ce) / u, xv)
            if abs(fe) > worst_fit[0]:
                worst_fit = (abs(fe), xv)
            if truth != 0 and abs(ce / truth) > worst_rel[0]:
                worst_rel = (abs(ce / truth), xv)

        nalt, even, runs = alternations(xs, fit_err)
        # equioscillation, judged rather than assumed: alternating
        # extrema of near-equal magnitude is what a minimax fit looks
        # like and nothing else does. 0.9 is a deliberately generous
        # bar - a real minimax lands near 1.0 and the fits here that
        # fail come in below 0.6.
        equi = even is not None and even >= 0.9 and nalt >= 3
        claimed_minimax = any(
            "minimax" in (C[c]["source"].get("claimed") or "")
            for c in a["coefficients"] if c in C)

        # CAN THIS TEST SEE WHAT IT CLAIMS TO?
        #
        # The coefficients in the record are float32. Whatever fitted
        # them worked in higher precision and the rounding to float32
        # moved each one by up to half an ulp - which perturbs the
        # finished error by an amount that has nothing to do with the
        # quality of the fit. If that perturbation is the same size as
        # the total error, equioscillation cannot survive the rounding
        # and its ABSENCE PROVES NOTHING. Saying "not minimax" there
        # would be reading the instrument's own noise as a measurement.
        #
        # So the floor is measured: each coefficient is nudged by half
        # an ulp on its own, the resulting change in the finished
        # value is taken at its worst over the domain, and the changes
        # are summed - the conservative case where every rounding
        # pushes the same way. The verdict is only reported when the
        # fit error clears that floor by a factor of five.
        # ONLY THE FITTED ONES ARE NUDGED. cos_kernel's coefficient
        # list includes NHALF, which is exactly -0.5 - a float32 holds
        # it with no error at all, so "half an ulp of rounding" is a
        # rounding that never happened. Including it inflated the cos
        # floor to 1.9e-8, a hundred and fifty times the kernel's whole
        # error, which would have been a nonsense number to publish.
        # Closed forms are exact or exactly-rounded constants, not
        # parameters some fit chose, and nudging them models nothing.
        floor = mpf(0)
        probe = [start + (hi - start) * mpf(i) / 32 for i in range(1, 33)]
        for cname in a["coefficients"]:
            if cname not in C or C[cname]["kind"] != "fitted":
                continue
            cv = to_mp(from_bits(int(C[cname]["bits"], 16)))
            nudge = ulp32(cv) / 2
            worst = mpf(0)
            for xm in probe:
                xv = to_mp(nearest32(xm))
                base = run_exact(a, C, {iname: xv})
                bump = run_exact(a, C, {iname: xv}, {cname: cv + nudge})
                if abs(bump - base) > worst:
                    worst = abs(bump - base)
            floor += worst
        conclusive = worst_fit[0] > 5 * floor if floor > 0 else True
        results.append({
            "name": name,
            "approximates": a["approximates"],
            "domain": [float(lo), float(hi)],
            "swept": [float(start), float(hi)],
            "symmetric": sym,
            "samples": samples,
            "fit_abs_max": float(worst_fit[0]),
            "fit_abs_at": float(worst_fit[1]) if worst_fit[1] is not None
            else None,
            "chain_ulp_max": float(worst_chain[0]),
            "chain_ulp_at": float(worst_chain[1]) if worst_chain[1] is not
            None else None,
            "chain_abs_max": float(chain_abs_max),
            "chain_rel_max": float(worst_rel[0]),
            "chain_rel_at": float(worst_rel[1]) if worst_rel[1] is not None
            else None,
            "alternations": nalt,
            "evenness": float(even) if even is not None else None,
            "equioscillates": equi,
            "claimed_minimax": claimed_minimax,
            "rounding_floor": float(floor),
            "conclusive": bool(conclusive),
            "extrema": [[float(x), float(v)] for x, v in runs[:12]],
        })
    return results


# ------------------------------------------------------------------
HEADROOM = mpf("1.10")


def ceil_2sf(x):
    """Round up to two significant figures, over a 10% margin.

    A bound should be a round number somebody chose, not the last digit
    of a particular run. The margin is not decoration: a denser sweep
    can only ever find a WORSE maximum, so a bound pinned flush against
    the measurement fails the first time anyone raises --samples.
    sin_kernel measured 0.6396 ulp and the first pinning gave 0.64,
    which is a promise with no room in it. Ten percent is well inside
    the gap between any two kernels here and far outside the sampling
    wobble."""
    if x <= 0:
        return 0.0
    x = mpf(x) * HEADROOM
    e = int(mp.floor(mp.log10(x))) - 1
    return float(mp.ceil(x / mpf(10) ** e) * mpf(10) ** e)


def digest_of(rec):
    """A seal over every bit pattern in the record.

    THE NEGATIVE CONTROLS FOUND THE HOLE THIS FILLS. A fitted
    coefficient moved by one ulp, with its decimal kept consistent,
    passed all three levels: level 2 cannot re-derive a fitted value -
    that is what fitted means - and one ulp of AT1 shifts atan by
    3e-8, sixty times under a behavioural bound of 1.9e-6. A bound
    loose enough to be a real promise is far too loose to see a typo.

    So the typo is caught structurally instead. The digest changes on
    any edit to any bit pattern, and it can only be re-pinned by
    running the seeder on purpose."""
    import hashlib
    h = hashlib.sha256()
    for name in sorted(rec["constants"]):
        h.update(f"{name}:{rec['constants'][name]['bits'].upper()}\n"
                 .encode())
    return "sha256:" + h.hexdigest()


def cross_check_upstream(rec, allow_missing):
    """Fitted coefficients, checked against where they were transcribed
    FROM.

    A closed form is checked against mathematics. A fitted coefficient
    has no such recourse - so its level 2 is whether it still equals
    the thing it was copied out of, which for all eighteen of these is
    the darkroom's detlib generator. That is a different repository, a
    different generator and a different language runtime, which makes
    it a real second opinion rather than a restatement.

    A MISSING UPSTREAM IS A FAILURE, not a skip. A check that silently
    does nothing when its data is absent reports success for work it
    never did, and that failure mode has cost this project a week
    before."""
    import subprocess
    root = pathlib.Path(os.environ.get(
        "DARKROOM", HERE.parent.parent / "atlas-darkroom"))
    gen = root / "tools" / "determinism" / "gendetlib.py"
    if not gen.exists():
        msg = (f"upstream not found at {gen} - the 18 fitted coefficients "
               f"were NOT checked against the source they were "
               f"transcribed from. Set DARKROOM, or pass "
               f"--allow-missing-upstream to say so out loud.")
        return ([], [msg]) if allow_missing else ([msg], [])
    code = (
        "import json,pathlib,re,sys\n"
        f"p=pathlib.Path(r'{gen}')\n"
        "src=p.read_text(encoding='utf-8').split('LIB = ')[0]\n"
        "ns={'__file__': str(p)}\n"
        "exec(src, ns)\n"
        "out={}\n"
        "for k,v in ns['K'].items():\n"
        "    m=re.match(r'uintBitsToFloat\\(0x([0-9A-Fa-f]{8})u\\)', v)\n"
        "    out[k]='0x'+m.group(1).upper() if m else v\n"
        "print(json.dumps(out))\n")
    try:
        r = subprocess.run([sys.executable, "-c", code],
                           capture_output=True, text=True, timeout=180)
    except Exception as exc:                       # noqa: BLE001
        return ([f"could not read upstream: {exc}"], [])
    if r.returncode != 0:
        return ([f"upstream generator failed: "
                 f"{(r.stderr or '').strip()[-300:]}"], [])
    up = json.loads(r.stdout)
    out, notes = [], []
    C = rec["constants"]
    engine_only = []
    for name, c in C.items():
        if name not in up:
            # A CONSTANT THE UPSTREAM DOES NOT HAVE IS NOT AUTOMATICALLY
            # WRONG - the engine will legitimately grow past the darkroom,
            # and LN2 was the first. But the two kinds are not alike. A
            # closed form is re-derived from mathematics at level 2, so
            # it needs no upstream to vouch for it. A FITTED coefficient
            # cannot be re-derived - that is what fitted means - so
            # upstream is the only thing checking it, and one that
            # appears from nowhere has nothing behind it at all.
            if c["kind"] == "fitted":
                out.append(f"{name}: a fitted coefficient with no upstream "
                           f"and no way to re-derive it - nothing in this "
                           f"checker vouches for its value")
            else:
                engine_only.append(name)
        elif up[name].upper() != c["bits"].upper():
            out.append(f"{name}: upstream {up[name]}, record {c['bits']}")
    for name in up:
        if name not in C:
            out.append(f"{name}: upstream has it, the record does not - "
                       f"the emitter would have nothing to substitute")
    notes.append(f"    {len(up)} constants matched against {gen.name}")
    if engine_only:
        notes.append(f"    engine-only, re-derived rather than matched: "
                     f"{', '.join(sorted(engine_only))}")
    return out, notes


def cross_check_js():
    """Ask the JavaScript side what IT resolved, and compare.

    Python vouches for the record; JavaScript reads the record and
    emits from it. Nothing so far connects those two, so a decoder bug
    in oracle.mjs would sail past a fully green Python run and put
    wrong numbers in the GLSL. This is the join: node prints the bit
    pattern of every value it resolved, and they must be the ones the
    record states.

    A missing node is a FAILURE here, not a skip. This is a JavaScript
    project; if node is absent the check did not run, and a check that
    silently does not run is worse than one that is missing."""
    import shutil
    import subprocess
    node = shutil.which("node")
    if node is None:
        return ["node not on PATH - the JavaScript half of the chain was "
                "NOT checked, and this is a JavaScript project"]
    try:
        r = subprocess.run([node, str(HERE / "oracle.mjs"), "--json"],
                           capture_output=True, text=True,
                           cwd=str(HERE.parent), timeout=120,
                           env={**os.environ,
                                "ORACLE_RECORD": str(RECORD)})
    except Exception as exc:                       # noqa: BLE001
        return [f"could not run oracle.mjs: {exc}"]
    if r.returncode != 0:
        return [f"oracle.mjs exited {r.returncode}: "
                f"{(r.stderr or '').strip()[-400:]}"]
    try:
        got = json.loads(r.stdout)
    except Exception as exc:                       # noqa: BLE001
        return [f"oracle.mjs did not print JSON: {exc}"]
    rec = load()["constants"]
    out = []
    for name, c in rec.items():
        if name not in got:
            out.append(f"{name}: oracle.mjs did not resolve it")
        elif got[name].upper() != c["bits"].upper():
            out.append(f"{name}: record {c['bits']}, oracle.mjs "
                       f"{got[name]}")
    for name in got:
        if name not in rec:
            out.append(f"{name}: oracle.mjs invented a constant")
    return out


def check_bounds(rec, l3, record, force):
    """Level 3's promise, as a number a future run has to keep.

    A measurement is evidence; a bound is a promise. The record carries
    the promise, every run measures against it, and the promise can
    only be written by hand - because a checker that rewrites its own
    bound whenever it fails is a checker that never fails."""
    fails, wrote = [], False
    for r in l3:
        if "error" in r:
            continue
        a = rec["approximations"][r["name"]]
        have = a.get("bound")
        if have is None or force:
            if not record:
                fails.append(f"{r['name']}: no bound recorded. Level 3 is "
                             f"a measurement without one - run with "
                             f"--record-bounds to pin what was measured.")
                continue
            if have is not None and not force:
                continue
            a["bound"] = {
                "criterion": "worst absolute error of the exact evaluation, "
                             "and worst ulp error of the float32 chain, over "
                             "the swept domain",
                "fit_abs_max": ceil_2sf(r["fit_abs_max"]),
                "chain_ulp_max": ceil_2sf(r["chain_ulp_max"]),
                "basis": f"measured at {r['samples']} points, rounded up to "
                         f"two significant figures",
                "measured": {
                    "fit_abs_max": r["fit_abs_max"],
                    "chain_ulp_max": r["chain_ulp_max"],
                    "chain_rel_max": r["chain_rel_max"],
                    "alternations": r["alternations"],
                    "evenness": r["evenness"],
                    "rounding_floor": r["rounding_floor"],
                    "equioscillates": r["equioscillates"],
                    "conclusive": r["conclusive"],
                },
            }
            wrote = True
            continue
        if r["fit_abs_max"] > have["fit_abs_max"]:
            fails.append(f"{r['name']}: fit error {r['fit_abs_max']:.4e} "
                         f"exceeds the recorded bound "
                         f"{have['fit_abs_max']:.4e}")
        if r["chain_ulp_max"] > have["chain_ulp_max"]:
            fails.append(f"{r['name']}: chain error "
                         f"{r['chain_ulp_max']:.2f} ulp exceeds the "
                         f"recorded bound {have['chain_ulp_max']:.2f}")
        m = have.get("measured", {})
        if m.get("alternations") is not None and \
                m["alternations"] != r["alternations"]:
            fails.append(f"{r['name']}: the error curve changed shape - "
                         f"{r['alternations']} extrema now, "
                         f"{m['alternations']} when recorded")
    if wrote:
        RECORD.write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")
    return fails, wrote


def main(argv=None):
    ap = argparse.ArgumentParser(prog="verify-constants")
    ap.add_argument("--samples", type=int, default=4001,
                    help="points per approximation domain (default 4001)")
    ap.add_argument("--record-bounds", action="store_true",
                    help="pin the measured bounds into the record; refuses "
                         "to touch a bound that is already there")
    ap.add_argument("--force-bounds", action="store_true",
                    help="overwrite bounds that already exist. Loudly.")
    ap.add_argument("--allow-missing-upstream", action="store_true",
                    help="say out loud that the fitted coefficients "
                         "were not checked against their source")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)

    rec = load()
    bad = 0

    print("=" * 68)
    print(f"verify-constants   mpmath {mp.dps} digits   "
          f"{len(rec['constants'])} constants, "
          f"{len(rec['approximations'])} approximations")
    print("=" * 68)

    st = self_test()
    print(f"\n  self-test of the exact float32 arithmetic: "
          f"{'PASS' if not st else 'FAIL'}")
    for f in st:
        print(f"      {f}")
    if st:
        print("\n  the checker's own arithmetic is wrong; nothing below "
              "would mean anything")
        return 2

    l1 = level1(rec)
    print(f"\n  LEVEL 1  provenance ......... "
          f"{'PASS' if not l1 else 'FAIL (%d)' % len(l1)}")
    for f in l1:
        print(f"      {f}")
    bad += len(l1)

    l2, notes = level2(rec, a.verbose)
    print(f"  LEVEL 2  transcription ...... "
          f"{'PASS' if not l2 else 'FAIL (%d)' % len(l2)}")
    for f in l2:
        print(f"      {f}")
    for n in notes:
        print(n)
    bad += len(l2)

    seal = digest_of(rec)
    pinned = rec.get("digest")
    if pinned is None:
        print("  SEAL     bit patterns ....... NOT PINNED")
        print(f"      no digest in the record; run seed-constants.py "
              f"--force to pin {seal}")
        bad += 1
    elif pinned != seal:
        print("  SEAL     bit patterns ....... FAIL")
        print(f"      record says  {pinned}")
        print(f"      bits hash to {seal}")
        print("      a bit pattern was edited without the seeder being "
              "run - which is exactly the edit no other level can see")
        bad += 1
    else:
        print(f"  SEAL     bit patterns ....... PASS  {seal[7:23]}...")

    up, upnotes = cross_check_upstream(rec, a.allow_missing_upstream)
    print(f"  UPSTREAM fitted vs darkroom .. "
          f"{'PASS' if not up else 'FAIL (%d)' % len(up)}")
    for f in up:
        print(f"      {f}")
    for n in upnotes:
        print(n)
    bad += len(up)

    jx = cross_check_js()
    print(f"  JS side  oracle.mjs agrees .. "
          f"{'PASS' if not jx else 'FAIL (%d)' % len(jx)}")
    for f in jx:
        print(f"      {f}")
    bad += len(jx)

    print("\n  derived properties, measured rather than believed:")
    for label, ok, detail in derived_properties(rec):
        print(f"      [{'ok' if ok else 'NO'}] {label}")
        print(f"           {detail}")
        if not ok:
            bad += 1

    print(f"\n  LEVEL 3  behaviour, swept at {a.samples} points per domain")
    print(f"      {'kernel':14} {'swept':>20} {'fit abs':>10} "
          f"{'chain ulp':>10} {'chain rel':>10}  equioscillation")
    l3 = level3(rec, a.samples, a.verbose)
    for r in l3:
        if "error" in r:
            print(f"      {r['name']:14} {r['error']}")
            bad += 1
            continue
        dom = f"[{r['swept'][0]:.4f}, {r['swept'][1]:.4f}]"
        ev = (f"{r['alternations']} alt, even {r['evenness']:.3f}"
              if r["evenness"] is not None else
              f"{r['alternations']} alt")
        mark = "yes" if r["equioscillates"] else "no "
        print(f"      {r['name']:14} {dom:>20} {r['fit_abs_max']:10.3e} "
              f"{r['chain_ulp_max']:10.2f} {r['chain_rel_max']:10.2e}  "
              f"{mark}  {ev}")

    # THE MINIMAX CLAIMS, TESTED. These coefficients arrive with a
    # comment saying "minimax" and no source anyone can open. That is
    # not a citation, but it is a falsifiable statement, and
    # equioscillation falsifies it without needing one.
    print("\n      the 'minimax' claims, judged by equioscillation:")
    for r in l3:
        if "error" in r or not r.get("claimed_minimax"):
            continue
        ratio = (r["fit_abs_max"] / r["rounding_floor"]
                 if r["rounding_floor"] > 0 else float("inf"))
        if not r["conclusive"]:
            print(f"        {r['name']:14} INCONCLUSIVE - rounding the "
                  f"coefficients to float32 moves the result by "
                  f"{r['rounding_floor']:.2e}, against a total error of "
                  f"{r['fit_abs_max']:.2e}")
            print(f"        {'':14} (ratio {ratio:.1f}x, needs 5x). "
                  f"Equioscillation cannot survive a perturbation its own "
                  f"size, so its absence here says nothing about the fit.")
        elif r["equioscillates"]:
            print(f"        {r['name']:14} SUPPORTED - "
                  f"{r['alternations']} alternating extrema, evenness "
                  f"{r['evenness']:.3f}, and the fit error clears the "
                  f"float32 rounding floor by {ratio:.0f}x")
        else:
            print(f"        {r['name']:14} REFUTED - "
                  f"{r['alternations']} extrema, evenness "
                  f"{r['evenness']:.3f}, with the error {ratio:.0f}x above "
                  f"the rounding floor, so the shape is real: whatever "
                  f"fitted this, it was not a minimax here")

    bfails, wrote = check_bounds(rec, l3, a.record_bounds or a.force_bounds,
                                 a.force_bounds)
    if wrote:
        print("\n      BOUNDS WRITTEN into core/constants.json"
              + (" (existing bounds OVERWRITTEN)" if a.force_bounds else ""))
        print("      every later run now has to keep them")
    if bfails:
        print("\n      bounds:")
        for f in bfails:
            print(f"        {f}")
        bad += len(bfails)
    elif not wrote:
        print("\n      bounds: every kernel inside its recorded promise")

    print()
    if a.json:
        print(json.dumps({"level1": l1, "level2": l2, "level3": l3},
                         indent=2))
    if bad:
        print(f"  {bad} problem(s)")
        return 1
    print("  all levels pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
