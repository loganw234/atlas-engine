#!/usr/bin/env python3
"""Derives core/constants.json - the record of every pinned constant.

THIS SCRIPT IS NOT IN THE TRUST CHAIN. It states how each value was
derived, in executable form, and it exists so that the record can be
re-derived and compared rather than transcribed by hand. The thing
that actually vouches for the record is tools/verify-constants.py,
which re-derives every value in a different language from a different
lineage (mpmath, not numpy) and never reads this file.

So this runs in three modes, and the default one cannot write:

  (no flag)   re-derive and DIFF against the committed record; exit 1
              if anything moved. This is the drift detector.
  --write     write only if core/constants.json does not exist.
  --force     overwrite, loudly.

The asymmetry is deliberate. A seeder that silently rewrites the record
to match whatever the code currently produces is a seeder that launders
a bug into the ground truth: change a coefficient by a digit, re-run
the seeder, and every check passes forever. Making the write path
explicit means the record can only move when someone means it.

Provenance is recorded honestly. Values with a closed form say so and
mpmath re-derives them from the mathematics. Values fitted by somebody
else carry the attribution I can actually stand behind, marked as
CLAIMED and unverified against a copy of the source, and their weight
is carried by the measured behaviour in verify-constants.py instead.
An unverifiable citation is worth less than a measured error bound.
"""
import argparse
import json
import pathlib
import sys
from decimal import Decimal

import numpy as np

f32 = np.float32
HERE = pathlib.Path(__file__).resolve().parent
RECORD = HERE.parent / "core" / "constants.json"


def bits_of(x):
    """The uint32 bit pattern of the float32 nearest x."""
    return int(f32(x).view(np.uint32))


def exact_decimal(x):
    """The EXACT decimal value of a float32 - always finite, always
    round-trips. Not a rounded display: Decimal(float(...)) of a binary
    fraction is exact, so anything that parses this string correctly
    lands on the same bits."""
    return str(Decimal(float(f32(x))))


def scalar(x, kind, source, **extra):
    rec = {
        "bits": "0x%08X" % bits_of(x),
        "decimal": exact_decimal(x),
        "kind": kind,
        "source": source,
    }
    rec.update(extra)
    return rec


# ------------------------------------------------------------------
# the pi/2 four-limb split, exactly as the darkroom generator does it
#
# Adopted upstream on 2026-08-24 (atlas-darkroom 6b878c9, "adopt the
# fma-free camera"), after Jason Davies, "Accurate sin/cos/tan on
# Tenstorrent" (2026-02-23). Seeded from pi/2 at fifty significant
# digits carried in Decimal: by the fourth limb the residual is ten
# decimal orders below pi/2, and a float64 remainder would have about
# five correct digits left. Each of the first three limbs has its low
# 15 mantissa bits cleared, so it carries 9 significant bits and
# k * limb is EXACTLY a float32 for every |k| below 2**15 - nothing is
# shed in the reduction, so nothing needs a fused multiply-add to
# capture it, which is what lets the library ship fma-free. The fourth
# limb keeps every bit it can.
#
# Each limb goes Decimal -> float64 -> float32, exactly as gendetlib.py's
# f32(float(rem)) does, and verify-constants.py re-derives it the same
# way at 50 digits so the two agree bit for bit rather than modulo a
# double rounding.
def _trunc_low(x, nbits=15):
    u = f32(x).view(np.uint32)
    return np.uint32(u & ~np.uint32((1 << nbits) - 1)).view(np.float32)


_rem = Decimal("1.5707963267948966192313216916397514420985846996876")
c1 = _trunc_low(f32(float(_rem)))
_rem -= Decimal(float(c1))
c2 = _trunc_low(f32(float(_rem)))
_rem -= Decimal(float(c2))
c3 = _trunc_low(f32(float(_rem)))
_rem -= Decimal(float(c3))
c4 = f32(float(_rem))

# the largest |x| the reduction is still exact for. It used to be
# 2**22 * pi/2, where the shift trick stops rounding to an integer; the
# binding limit is the split now, whose products stay representable only
# while |k| < 2**15. Rounded DOWN to a float32 so the admitted set is a
# subset of the exact one rather than one ulp past it.
pio2_f64 = np.float64(np.pi / 2)
sincos_lim = np.nextafter(f32(np.float64(2 ** 15) * pio2_f64), f32(0.0))

MATH = {"kind": "mathematical",
        "text": "closed form; mpmath re-derives it from the mathematics",
        "verified_against_source": True}

# THE PROVENANCE TEXTS BELOW ARE THE RECORD'S, verbatim. The citations
# programme closed them from sources in hand on 2026-08-26 and edited the
# record directly; this script carried its older wording until 2026-09-04
# and reported sixty-five prose differences it would have reverted under
# --force. Kept in step by hand, which is the only honest way for a file
# that is not allowed to read the record.
CEPHES_SIN = {
    "kind": "fitted",
    "text": "Stephen L. Moshier, Cephes Mathematical Library, single/sinf.c, Release 2.2 (June 1992) - the sincof[] and coscof[] float arrays; carried into this record through atlas-darkroom tools/determinism/gendetlib.py",
    "claimed": "minimax on the reduced interval |r| <= pi/4",
    "copy_checked": "sinf.c read 2026-08-26 from two independent mirrors of the Cephes 2.2 single-precision distribution (netlib.org/cephes, single.tgz): raw.githubusercontent.com/jeremybarnes/cephes/master/single/sinf.c and docs.rs/crate/special-fun/latest/source/cephes-single/sinf.c",
    "verified_against_source": False,
    "note": "A copy of sinf.c IS in hand now, so the old 'cited from ubiquity' admission is retired: all six published decimals were read on 2026-08-26 and each rounds to the bit pattern above AND to its exact decimal - 6/6 on both fields. Domain and evaluation form match too: the header gives sine as x + x**3 P(x**2) and cosine as 1 - x**2 Q(x**2) between 0 and pi/4, which is the op list sin_kernel and cos_kernel run. What the source does NOT say is minimax - the words minimax, Remes and Remez appear nowhere in sinf.c, and cephes states a measured peak error rather than an optimality proof - so `claimed` above still rests on the equioscillation test in verify-constants.py, which reports INCONCLUSIVE for this kernel. `verified_against_source` stays false on purpose: level 1 reserves that flag for values level 2 re-derives on every run, which a fitted coefficient by definition is not, so the archival match is carried by this note and by docs/CONSTANTS-FINDINGS.md rather than by the flag."
}
CEPHES_EXP2 = {
    "kind": "fitted",
    "text": "Stephen L. Moshier, Cephes Mathematical Library, single/exp2f.c, Release 2.2 (June 1992) - the static float P[] array; carried into this record through atlas-darkroom tools/determinism/gendetlib.py",
    "claimed": "minimax on [-0.5, 0.5]",
    "copy_checked": "exp2f.c read 2026-08-26 from two independent mirrors of the Cephes 2.2 single-precision distribution (netlib.org/cephes, single.tgz): raw.githubusercontent.com/jeremybarnes/cephes/master/single/exp2f.c and docs.rs/crate/special-fun/latest/source/cephes-single/exp2f.c",
    "verified_against_source": False,
    "note": "A copy of exp2f.c IS in hand now, so the old 'cited from ubiquity' admission is retired: all six published decimals of P[] were read on 2026-08-26 and each rounds to the bit pattern above AND to its exact decimal - 6/6 on both fields. The domain is confirmed at the source - the header puts the polynomial for 2**x in the basic range [-0.5, 0.5] - and so is the form, 2**x = 1 + x P(x) by Horner, which is exp2_kernel's op list. What the source does NOT say is minimax - the words minimax, Remes and Remez appear nowhere in exp2f.c; its ACCURACY table gives a measured RELATIVE peak of 1.7e-7 over the whole reconstructed range, which is a different quantity from the fit_abs_max recorded here and does not contradict it - so `claimed` above still rests on the equioscillation test in verify-constants.py, which reports INCONCLUSIVE for this kernel. `verified_against_source` stays false on purpose: level 1 reserves that flag for values level 2 re-derives on every run, which a fitted coefficient by definition is not, so the archival match is carried by this note and by docs/CONSTANTS-FINDINGS.md rather than by the flag."
}

ATAN_SRC = {
    "kind": "fitted",
    "text": "atlas-darkroom tools/determinism/fitatan.py (2026-08-25): "
            "atan(r) = r + r*z*q(z), z = r*r, q of degree 7, fitted by "
            "iteratively reweighted least squares against RELATIVE error "
            "on a Chebyshev grid over [0, 1] in float64, then rounded to "
            "float32 and re-measured in float32; carried into this record "
            "through gendetlib.py, whose comment records max 2.19 ULP over "
            "the whole [0, 1] fold",
    "claimed": "relative-error least-squares fit, max 2.19 ULP over [0, 1] "
               "after rounding to float32; no optimality claim is made, "
               "so level 3 judges none",
    "verified_against_source": False,
    "copy_checked": "fitatan.py and gendetlib.py read in the darkroom "
                    "checkout on 2026-09-04; the eight ATQ values in "
                    "gendetlib.py's K are what this record carries, and "
                    "cross_check_upstream compares them bit for bit on "
                    "every run",
    "note": "REPLACED the Hastings 1955 six-term set (AT0-AT5) that this "
            "record sealed until 2026-09-04. That set minimised ABSOLUTE "
            "error, so atan(r) came back scaled by AT0 = 0.99997726 for "
            "small r - a fixed 382 ULP that never improved as r shrank, and "
            "det_asin inherited all of it. Splitting off the leading r makes "
            "small arguments exact by construction and leaves q to carry "
            "only the correction. There is no equioscillation claim to test "
            "here: the objective was relative error, so level 3 records the "
            "bound and judges no minimax.",
}

LIMB_NOTE = ("low 15 mantissa bits cleared, so k * limb is exact for every "
             "|k| < 2**15 - verified as a derived property on every run. "
             "Adopted from the darkroom's four-limb split of 2026-08-24, "
             "after Jason Davies (2026-02-23); seeded from pi/2 at fifty "
             "digits, through float64, as gendetlib.py does it.")

CONSTANTS = {
    # -------------------------------------------------- closed forms
    "TWO_OVER_PI": scalar(2 / np.pi, "closed", MATH, expr="2/pi"),
    "RND_MAGIC": scalar(12582912.0, "closed", MATH, expr="1.5 * 2**23",
                        exact=True,
                        note="the shift-trick round-to-integer magic; "
                             "exactly representable, so `exact` holds"),
    "NHALF": scalar(-0.5, "closed", MATH, expr="-1/2", exact=True),
    "THIRD": scalar(1 / 3, "closed", MATH, expr="1/3"),
    "FIFTH": scalar(1 / 5, "closed", MATH, expr="1/5"),
    "SEVENTH": scalar(1 / 7, "closed", MATH, expr="1/7"),
    "NINTH": scalar(1 / 9, "closed", MATH, expr="1/9"),
    "LOG2E": scalar(1.4426950408889634, "closed", MATH, expr="1/log(2)"),
    # Added for Phase 2 as engine-only, because the emitter turns
    # Math.log(x) into det_log2(x) * LN2 and the darkroom then had no
    # det_log. The darkroom's library carries LN2 since 2026-08-25, so
    # it is matched upstream now as well as re-derived here; the match
    # is a check, not a dependency.
    "LN2": scalar(np.log(2.0), "closed", MATH, expr="log(2)",
                  note="re-derived from the mathematics at level 2; carried "
                       "upstream by gendetlib.py since 2026-08-25, so "
                       "matched there too"),
    "SQRT2": scalar(np.sqrt(2.0), "closed", MATH, expr="sqrt(2)"),
    "PI_F": scalar(np.pi, "closed", MATH, expr="pi"),
    "PIO2_F": scalar(np.pi / 2, "closed", MATH, expr="pi/2"),
    "TWOP48": scalar(2.0 ** 48, "closed", MATH, expr="2**48", exact=True),
    "TWOM24": scalar(2.0 ** -24, "closed", MATH, expr="2**-24", exact=True),
    "TWOM126": scalar(2.0 ** -126, "closed", MATH, expr="2**-126",
                      exact=True),

    # ------------------------------------------------------- derived
    "PIO2_1": scalar(c1, "derived", MATH,
                     expr="trunc15(f32(f64(pi/2)))",
                     note="limb 1 of 4 of pi/2; " + LIMB_NOTE),
    "PIO2_2": scalar(c2, "derived", MATH,
                     expr="trunc15(f32(f64(pi/2 - PIO2_1)))",
                     note="limb 2 of 4; " + LIMB_NOTE),
    "PIO2_3": scalar(c3, "derived", MATH,
                     expr="trunc15(f32(f64(pi/2 - PIO2_1 - PIO2_2)))",
                     note="limb 3 of 4; " + LIMB_NOTE),
    "PIO2_4": scalar(c4, "derived", MATH,
                     expr="f32(f64(pi/2 - PIO2_1 - PIO2_2 - PIO2_3))",
                     note="limb 4 of 4, the tail: every bit kept, so the "
                          "split's own accuracy is set by this rounding. "
                          "Its product with k is NOT exact and does not "
                          "need to be - it is the last, smallest stage."),
    "SINCOS_LIM": scalar(sincos_lim, "derived", MATH,
                         expr="nextafter(f32(2**15 * f64(pi/2)), 0)",
                         domain_role="upper bound on |x| for det_sincos",
                         note="rounded toward zero so the admitted set is a "
                              "subset of the exactly-reducible one, not one "
                              "ulp past it. 2**15 because the split's "
                              "products are exact only while |k| < 2**15 - "
                              "a 128x smaller domain than the shift trick's "
                              "2**22, bought to make the reduction fma-free; "
                              "measured upstream 2026-08-24, no plate of the "
                              "68 passes det_sincos an argument above ~804"),

    # ------------------------------------- fitted: sin kernel (cephes)
    "SS1": scalar(-1.6666654611e-1, "fitted", CEPHES_SIN),
    "SS2": scalar(8.3321608736e-3, "fitted", CEPHES_SIN),
    "SS3": scalar(-1.9515295891e-4, "fitted", CEPHES_SIN),

    # ------------------------------------- fitted: cos kernel (cephes)
    "CC1": scalar(4.166664568298827e-2, "fitted", CEPHES_SIN),
    "CC2": scalar(-1.388731625493765e-3, "fitted", CEPHES_SIN),
    "CC3": scalar(2.443315711809948e-5, "fitted", CEPHES_SIN),

    # ------------------------------------ fitted: exp2 kernel (cephes)
    "E2P0": scalar(1.535336188319500e-4, "fitted", CEPHES_EXP2),
    "E2P1": scalar(1.339887440266574e-3, "fitted", CEPHES_EXP2),
    "E2P2": scalar(9.618437357674640e-3, "fitted", CEPHES_EXP2),
    "E2P3": scalar(5.550332471162809e-2, "fitted", CEPHES_EXP2),
    "E2P4": scalar(2.402264791363012e-1, "fitted", CEPHES_EXP2),
    "E2P5": scalar(6.931472028550421e-1, "fitted", CEPHES_EXP2,
                   note="shares LN2's bit pattern by coincidence, not by derivation: cephes' fitted leading coefficient 6.931472028550421E-001 happens to round to the same float32 as log(2). The two stay separate entries because their provenance is separate - LN2 is re-derived from the mathematics at level 2 and this one cannot be."),

    # ------------------------------ fitted: atan kernel (fitatan.py)
    "ATQ0": scalar(-0.333331525, "fitted", ATAN_SRC),
    "ATQ1": scalar(0.199937746, "fitted", ATAN_SRC),
    "ATQ2": scalar(-0.14211069, "fitted", ATAN_SRC),
    "ATQ3": scalar(0.106660537, "fitted", ATAN_SRC),
    "ATQ4": scalar(-0.0755230486, "fitted", ATAN_SRC),
    "ATQ5": scalar(0.0432127789, "fitted", ATAN_SRC),
    "ATQ6": scalar(-0.0163684115, "fitted", ATAN_SRC),
    "ATQ7": scalar(0.00292079593, "fitted", ATAN_SRC),
}

# ------------------------------------------------------------------
# The approximations, as executable data.
#
# The evaluation order is HERE, in the record, rather than transcribed
# into the checker. That is the whole point of level 3: a correctly
# transcribed coefficient evaluated in the wrong Horner order passes
# levels 1 and 2 and is still wrong, and it can only be caught by a
# checker that runs the same op sequence the GLSL runs. Writing that
# sequence out twice - once in GLSL, once in Python - just moves the
# transcription error somewhere quieter.
#
# Each step is [dest, op, *args]. Args are input names, earlier dests,
# constant names, or decimal literals. Ops are mul/add/sub/fma, each
# rounded to float32 exactly once.
#
# UNFUSED SINCE 2026-09-04, because that is how the library ships. The
# generator writes each Horner step as fma(x, p, c) and rewrites it to
# ((x) * (p) + (c)) before the file is written - a multiply rounded
# once and an add rounded once - so the chain here does the same, and
# the chain error it reports is the one the shader delivers. Modelling
# a single rounding would describe arithmetic five of eleven measured
# stacks do not perform.
PI4 = float(np.pi / 4)
# m in (sqrt2/2, sqrt2] => s = (m-1)/(m+1) in [-(3-2sqrt2), 3-2sqrt2]
S_LIM = float((np.sqrt(2.0) - 1) / (np.sqrt(2.0) + 1))

APPROXIMATIONS = {
    "sin_kernel": {
        "approximates": "sin(r)",
        "inputs": ["r"],
        "domain": {"r": [-PI4, PI4]},
        "domain_note": "|r| <= pi/4, the reduced argument det_sincos hands "
                       "the kernel. The reduction itself is NOT covered "
                       "here - see scope, below.",
        "coefficients": ["SS1", "SS2", "SS3"],
        "eval": [
            ["r2", "mul", "r", "r"],
            ["pm", "mul", "r2", "SS3"],
            ["p", "add", "pm", "SS2"],
            ["p2m", "mul", "r2", "p"],
            ["p2", "add", "p2m", "SS1"],
            ["r3", "mul", "r2", "r"],
            ["ssm", "mul", "r3", "p2"],
            ["ss", "add", "ssm", "r"],
        ],
        "result": "ss",
        "odd": True,
        "expected_alternations": 5,
    },
    "cos_kernel": {
        "approximates": "cos(r)",
        "inputs": ["r"],
        "domain": {"r": [-PI4, PI4]},
        "domain_note": "as sin_kernel",
        "coefficients": ["CC1", "CC2", "CC3", "NHALF"],
        "eval": [
            ["r2", "mul", "r", "r"],
            ["pm", "mul", "r2", "CC3"],
            ["p", "add", "pm", "CC2"],
            ["p2m", "mul", "r2", "p"],
            ["p2", "add", "p2m", "CC1"],
            ["wm", "mul", "r2", "NHALF"],
            ["w", "add", "wm", "1.0"],
            ["r4", "mul", "r2", "r2"],
            ["ccm", "mul", "r4", "p2"],
            ["cc", "add", "ccm", "w"],
        ],
        "result": "cc",
        "even": True,
        "expected_alternations": 5,
    },
    "exp2_kernel": {
        "approximates": "2**f",
        "inputs": ["f"],
        "domain": {"f": [-0.5, 0.5]},
        "domain_note": "f is the fractional part after the exact split in "
                       "det_exp2; the integer part is applied by exponent "
                       "bits and is exact.",
        "coefficients": ["E2P0", "E2P1", "E2P2", "E2P3", "E2P4", "E2P5"],
        "eval": [
            ["p0m", "mul", "f", "E2P0"],
            ["p0", "add", "p0m", "E2P1"],
            ["p1m", "mul", "f", "p0"],
            ["p1", "add", "p1m", "E2P2"],
            ["p2m", "mul", "f", "p1"],
            ["p2", "add", "p2m", "E2P3"],
            ["p3m", "mul", "f", "p2"],
            ["p3", "add", "p3m", "E2P4"],
            ["p4m", "mul", "f", "p3"],
            ["p4", "add", "p4m", "E2P5"],
            ["ym", "mul", "f", "p4"],
            ["y", "add", "ym", "1.0"],
        ],
        "result": "y",
        "expected_alternations": 7,
    },
    "atanh_series": {
        "approximates": "log((1+s)/(1-s))",
        "inputs": ["s"],
        "domain": {"s": [-S_LIM, S_LIM]},
        "domain_note": "s = (m-1)/(m+1) for m in (sqrt2/2, sqrt2], the "
                       "mantissa fold in det_log2. NOTE the real det_log2 "
                       "forms s with det_div, not exact division; this "
                       "sweep feeds the series an exact s so the "
                       "coefficients are measured alone.",
        "coefficients": ["THIRD", "FIFTH", "SEVENTH", "NINTH"],
        "eval": [
            ["z", "mul", "s", "s"],
            ["pm", "mul", "z", "NINTH"],
            ["p", "add", "pm", "SEVENTH"],
            ["p2m", "mul", "z", "p"],
            ["p2", "add", "p2m", "FIFTH"],
            ["p3m", "mul", "z", "p2"],
            ["p3", "add", "p3m", "THIRD"],
            ["qm", "mul", "z", "p3"],
            ["q", "add", "qm", "1.0"],
            ["twos", "add", "s", "s"],
            ["ln", "mul", "twos", "q"],
        ],
        "result": "ln",
        "odd": True,
        "series": "truncated atanh, not a fit: the coefficients ARE 1/3, "
                  "1/5, 1/7, 1/9, so the error is a truncation tail and "
                  "does NOT equioscillate. Checked as a series, not as a "
                  "minimax.",
        "expected_alternations": None,
    },
    "atan_kernel": {
        "approximates": "atan(r)",
        "inputs": ["r"],
        "domain": {"r": [0.0, 1.0]},
        "domain_note": "r = min(|y|,|x|)/max(|y|,|x|) after the octant fold "
                       "in det_atan, so r is in [0,1] by construction. As "
                       "with atanh_series, the fold's det_div is not "
                       "covered here. atan(r) = r + r*z*q(z): the leading "
                       "r is exact and q carries only the correction.",
        "coefficients": ["ATQ0", "ATQ1", "ATQ2", "ATQ3", "ATQ4", "ATQ5",
                         "ATQ6", "ATQ7"],
        "eval": [
            ["z", "mul", "r", "r"],
            ["q0m", "mul", "z", "ATQ7"],
            ["q0", "add", "q0m", "ATQ6"],
            ["q1m", "mul", "z", "q0"],
            ["q1", "add", "q1m", "ATQ5"],
            ["q2m", "mul", "z", "q1"],
            ["q2", "add", "q2m", "ATQ4"],
            ["q3m", "mul", "z", "q2"],
            ["q3", "add", "q3m", "ATQ3"],
            ["q4m", "mul", "z", "q3"],
            ["q4", "add", "q4m", "ATQ2"],
            ["q5m", "mul", "z", "q4"],
            ["q5", "add", "q5m", "ATQ1"],
            ["q6m", "mul", "z", "q5"],
            ["q6", "add", "q6m", "ATQ0"],
            ["rz", "mul", "r", "z"],
            ["am", "mul", "rz", "q6"],
            ["a", "add", "am", "r"],
        ],
        "result": "a",
        "odd": True,
        "fit": "relative-error least squares (fitatan.py), not a minimax: "
               "the error curve is not expected to equioscillate and no "
               "such claim is judged. The bound is what level 3 records.",
        "expected_alternations": None,
    },
}

SCOPE = [
    "Phase 0 covers the CONSTANTS and the POLYNOMIALS built from them, "
    "given exact inputs over the stated domain.",
    "It does NOT cover the surrounding reduction: the argument reduction "
    "in det_sincos (whose exact-product property IS checked, as a derived "
    "property), the det_div inside det_log2 and det_atan, the Newton "
    "iterations in det_recip and det_sqrt, or the exponent assembly in "
    "det_exp2 and det_log2.",
    "Since 2026-09-04 the chain is modelled as the library ships: every "
    "fma in the generator's source is unfused to a multiply and an add, "
    "each rounded once, because five of eleven measured stacks collapse "
    "the fused form regardless of `precise` and the unfused one is what "
    "every stack computes identically.",
    "Those whole-function properties belong to the end-to-end emulation "
    "the engine's Phase 2 planned. Saying so here so the record cannot be "
    "read as claiming more than it measured.",
]


def digest_of(constants):
    """A seal over every bit pattern, so a hand edit to one of them is
    visible without re-deriving anything.

    The negative controls proved this was needed: a fitted coefficient
    nudged one ulp, with its decimal kept consistent, passed all three
    levels of the checker. Level 2 cannot re-derive a fitted value, and
    the behavioural bound is a hundred times too loose to see one ulp.
    The seal closes that gap structurally - and it can only be re-pinned
    by running this script on purpose, which is the whole point."""
    import hashlib
    h = hashlib.sha256()
    for name in sorted(constants):
        h.update(f"{name}:{constants[name]['bits'].upper()}\n".encode())
    return "sha256:" + h.hexdigest()


def build():
    return {
        "schema": 1,
        "what": "Pinned constants for deterministic GLSL emission, with "
                "provenance, and the polynomials built from them as "
                "executable data.",
        "derived_by": "tools/seed-constants.py",
        "checked_by": "tools/verify-constants.py (mpmath, 50 digits)",
        "scope": SCOPE,
        "levels": {
            "1": "provenance: every value names where it came from, in "
                 "data rather than in a comment",
            "2": "transcription: the value equals what that source says, "
                 "re-derived by an independent implementation",
            "3": "behaviour: the approximation built from those constants "
                 "is measured over its whole admitted domain and its worst "
                 "error asserted",
        },
        "digest": digest_of(CONSTANTS),
        "constants": CONSTANTS,
        "approximations": APPROXIMATIONS,
    }


def carry_bounds(new, old):
    """Bounds belong to the checker, not to this script.

    verify-constants.py measures them and writes them; this script
    derives the values and their provenance. Rebuilding the record here
    must not silently drop somebody else's measurements - so they are
    carried across, and if a kernel's evaluation order changed the
    bound comes with a note saying it now describes different code."""
    moved = []
    for name, a in new["approximations"].items():
        prev = old.get("approximations", {}).get(name)
        if not prev or prev.get("bound") is None:
            continue
        a["bound"] = prev["bound"]
        if prev.get("eval") != a.get("eval"):
            a["bound"]["stale"] = ("the evaluation order changed after "
                                   "this bound was measured - re-record it")
            moved.append(name)
    return moved


def diff(old, new, path=""):
    out = []
    if isinstance(old, dict) and isinstance(new, dict):
        for k in sorted(set(old) | set(new)):
            if k not in old:
                out.append(f"  + {path}{k} = {new[k]!r}")
            elif k not in new:
                out.append(f"  - {path}{k} = {old[k]!r}")
            else:
                out += diff(old[k], new[k], f"{path}{k}.")
    elif old != new:
        out.append(f"  ~ {path[:-1]}: {old!r} -> {new!r}")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(prog="seed-constants")
    ap.add_argument("--write", action="store_true",
                    help="write the record if it does not exist yet")
    ap.add_argument("--force", action="store_true",
                    help="overwrite an existing record")
    a = ap.parse_args(argv)

    rec = build()
    old = (json.loads(RECORD.read_text(encoding="utf-8"))
           if RECORD.exists() else {})
    moved = carry_bounds(rec, old)
    text = json.dumps(rec, indent=2, sort_keys=False) + "\n"

    if a.force or (a.write and not RECORD.exists()):
        RECORD.parent.mkdir(parents=True, exist_ok=True)
        existed = RECORD.exists()
        RECORD.write_text(text, encoding="utf-8")
        verb = "OVERWROTE" if existed else "wrote"
        print(f"{verb} {RECORD}  "
              f"({len(rec['constants'])} constants, "
              f"{len(rec['approximations'])} approximations)")
        print(f"  seal {rec['digest'][7:23]}...")
        if moved:
            print(f"  bounds carried but now STALE (evaluation order "
                  f"changed): {', '.join(moved)}")
        if existed:
            print("  the record moved on purpose - verify-constants.py "
                  "now has to agree with the new values")
        return 0

    if not RECORD.exists():
        print(f"no record at {RECORD}; --write to create it",
              file=sys.stderr)
        return 1

    have = json.loads(RECORD.read_text(encoding="utf-8"))
    d = diff(have, rec)
    if d:
        print(f"RECORD HAS DRIFTED from what this script derives "
              f"({len(d)} difference(s)):")
        print("\n".join(d[:40]))
        if len(d) > 40:
            print(f"  ... and {len(d) - 40} more")
        print("\nneither side is automatically right. --force to accept "
              "this script's version.")
        return 1
    print(f"record matches: {len(rec['constants'])} constants, "
          f"{len(rec['approximations'])} approximations, no drift")
    return 0


if __name__ == "__main__":
    sys.exit(main())
