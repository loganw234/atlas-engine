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
# the pi/2 three-part split, exactly as the darkroom generator does it
#
# Seeded from the FLOAT64 pi/2, not from the real pi/2. That caps the
# split's accuracy near 2^-54 rather than the ~2^-72 three float32
# limbs could carry. verify-constants.py measures which of those two it
# actually is rather than assuming, because the difference decides how
# far the argument reduction can be trusted.
pio2_f64 = np.float64(np.pi / 2)
c1 = f32(pio2_f64)
r1 = pio2_f64 - np.float64(c1)
c2 = f32(r1)
r2 = r1 - np.float64(c2)
c3 = f32(r2)

# the largest |x| whose shift-trick reduction is still exact: 2^22*pi/2,
# rounded DOWN so the admitted set is a subset of the exact one
sincos_lim = np.nextafter(f32(np.float64(2 ** 22) * pio2_f64), f32(0.0))

MATH = {"kind": "mathematical",
        "text": "closed form; mpmath re-derives it from the mathematics",
        "verified_against_source": True}

CEPHES_SIN = {
    "kind": "fitted",
    "text": "cephes single-precision sin/cos kernel (Moshier), as carried "
            "in atlas-darkroom tools/determinism/gendetlib.py",
    "claimed": "minimax on the reduced interval |r| <= pi/4",
    "verified_against_source": False,
    "note": "cited from ubiquity, not from a copy of sinf.c in hand. The "
            "measured bound and the equioscillation test in "
            "verify-constants.py are what this actually rests on.",
}
CEPHES_EXP2 = dict(CEPHES_SIN)
CEPHES_EXP2["text"] = ("cephes single-precision exp2 kernel (Moshier), as "
                       "carried in atlas-darkroom "
                       "tools/determinism/gendetlib.py")
CEPHES_EXP2["claimed"] = "minimax on [-0.5, 0.5]"

ATAN_SRC = {
    "kind": "fitted",
    "text": "unattributed in atlas-darkroom tools/determinism/gendetlib.py; "
            "the generator's comment reads 'atan - odd minimax on [0, 1]'",
    "claimed": "odd minimax on [0, 1]",
    "verified_against_source": False,
    "note": "no attribution I can stand behind, so none is asserted. "
            "Whether it is in fact a minimax fit is decided by the "
            "equioscillation test, not by the comment.",
}

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
    "SQRT2": scalar(np.sqrt(2.0), "closed", MATH, expr="sqrt(2)"),
    "PI_F": scalar(np.pi, "closed", MATH, expr="pi"),
    "PIO2_F": scalar(np.pi / 2, "closed", MATH, expr="pi/2"),
    "TWOP48": scalar(2.0 ** 48, "closed", MATH, expr="2**48", exact=True),
    "TWOM24": scalar(2.0 ** -24, "closed", MATH, expr="2**-24", exact=True),
    "TWOM126": scalar(2.0 ** -126, "closed", MATH, expr="2**-126",
                      exact=True),

    # ------------------------------------------------------- derived
    "PIO2_1": scalar(c1, "derived", MATH,
                     expr="f32(f64(pi/2))",
                     note="limb 1 of 3 of pi/2"),
    "PIO2_2": scalar(c2, "derived", MATH,
                     expr="f32(f64(pi/2) - f64(PIO2_1))",
                     note="limb 2 of 3"),
    "PIO2_3": scalar(c3, "derived", MATH,
                     expr="f32(f64(pi/2) - f64(PIO2_1) - f64(PIO2_2))",
                     note="limb 3 of 3. The chain starts at the float64 "
                          "pi/2, which is what caps the split's accuracy - "
                          "measured, not assumed, in verify-constants.py"),
    "SINCOS_LIM": scalar(sincos_lim, "derived", MATH,
                         expr="nextafter(f32(2**22 * f64(pi/2)), 0)",
                         domain_role="upper bound on |x| for det_sincos",
                         note="rounded toward zero so the admitted set is a "
                              "subset of the exactly-reducible one, not one "
                              "ulp past it"),

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
    "E2P5": scalar(6.931472028550421e-1, "fitted", CEPHES_EXP2),

    # ------------------------------------------- fitted: atan kernel
    "AT0": scalar(0.99997726, "fitted", ATAN_SRC),
    "AT1": scalar(-0.33262347, "fitted", ATAN_SRC),
    "AT2": scalar(0.19354346, "fitted", ATAN_SRC),
    "AT3": scalar(-0.11643287, "fitted", ATAN_SRC),
    "AT4": scalar(0.05265332, "fitted", ATAN_SRC),
    "AT5": scalar(-0.01172120, "fitted", ATAN_SRC),
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
# constant names, or decimal literals. Ops are fma/mul/add/sub, each
# rounded to float32 exactly once, which is what `precise` buys in the
# GLSL.
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
            ["p", "fma", "r2", "SS3", "SS2"],
            ["p2", "fma", "r2", "p", "SS1"],
            ["r3", "mul", "r2", "r"],
            ["ss", "fma", "r3", "p2", "r"],
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
            ["p", "fma", "r2", "CC3", "CC2"],
            ["p2", "fma", "r2", "p", "CC1"],
            ["w", "fma", "r2", "NHALF", "1.0"],
            ["r4", "mul", "r2", "r2"],
            ["cc", "fma", "r4", "p2", "w"],
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
            ["p0", "fma", "f", "E2P0", "E2P1"],
            ["p1", "fma", "f", "p0", "E2P2"],
            ["p2", "fma", "f", "p1", "E2P3"],
            ["p3", "fma", "f", "p2", "E2P4"],
            ["p4", "fma", "f", "p3", "E2P5"],
            ["y", "fma", "f", "p4", "1.0"],
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
            ["p", "fma", "z", "NINTH", "SEVENTH"],
            ["p2", "fma", "z", "p", "FIFTH"],
            ["p3", "fma", "z", "p2", "THIRD"],
            ["q", "fma", "z", "p3", "1.0"],
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
                       "covered here.",
        "coefficients": ["AT0", "AT1", "AT2", "AT3", "AT4", "AT5"],
        "eval": [
            ["z", "mul", "r", "r"],
            ["p", "fma", "z", "AT5", "AT4"],
            ["p2", "fma", "z", "p", "AT3"],
            ["p3", "fma", "z", "p2", "AT2"],
            ["p4", "fma", "z", "p3", "AT1"],
            ["p5", "fma", "z", "p4", "AT0"],
            ["a", "mul", "r", "p5"],
        ],
        "result": "a",
        "odd": True,
        "expected_alternations": 7,
    },
}

SCOPE = [
    "Phase 0 covers the CONSTANTS and the POLYNOMIALS built from them, "
    "given exact inputs over the stated domain.",
    "It does NOT cover the surrounding reduction: the Payne-Hanek-free "
    "argument reduction in det_sincos, the det_div inside det_log2 and "
    "det_atan, the Newton iterations in det_recip and det_sqrt, or the "
    "exponent assembly in det_exp2 and det_log2.",
    "Those are whole-function properties and they belong to Phase 2, "
    "when the det library moves into the engine and can be emulated "
    "end to end. Saying so here so the record cannot be read as "
    "claiming more than it measured.",
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
