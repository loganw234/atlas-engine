#!/usr/bin/env python3
"""Proves verify-constants.py can see the failures it exists to catch.

A checker that passes is not evidence until you have watched it fail.
Every control here corrupts a COPY of the record in one specific way,
runs the full checker against the copy, and asserts it comes back
non-zero AND for the stated reason. If a control passes the checker,
that level is theatre and this script says so.

The last two are the ones that matter. Level 3 is justified entirely
by the claim that it catches a correctly-transcribed coefficient
evaluated in the wrong order - a mistake levels 1 and 2 both wave
through, because every constant is still right. If the Horner control
does not fail, level 3 is an expensive way of measuring nothing.

  python tools/verify-negative-controls.py
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
RECORD = HERE.parent / "core" / "constants.json"
CHECKER = HERE / "verify-constants.py"
SAMPLES = "301"          # enough to see gross damage; these are controls


def run(record_path):
    r = subprocess.run(
        [sys.executable, str(CHECKER), "--samples", SAMPLES],
        capture_output=True, text=True, cwd=str(HERE.parent),
        env={**os.environ, "ORACLE_RECORD": str(record_path)}, timeout=1800)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


# ---------------------------------------------------------- mutations
def bump_bits(rec, name):
    """Move one constant by a single ulp - the smallest edit anyone
    could make and the one most likely to be a typo rather than a
    decision."""
    c = rec["constants"][name]
    b = int(c["bits"], 16) + 1
    c["bits"] = "0x%08X" % b
    return f"{name} moved one ulp"


def bump_bits_and_decimal(rec, name):
    """The same edit, done CONSISTENTLY. The redundancy between bits
    and decimal no longer catches it, so only re-derivation or
    behaviour can - which is the point of having two more levels."""
    import struct
    c = rec["constants"][name]
    b = int(c["bits"], 16) + 1
    c["bits"] = "0x%08X" % b
    from decimal import Decimal
    c["decimal"] = str(Decimal(
        struct.unpack("<f", struct.pack("<I", b))[0]))
    return f"{name} moved one ulp, both fields kept consistent"


def swap_horner(rec, name):
    """THE CONTROL LEVEL 3 EXISTS FOR. Every coefficient stays exactly
    right; two Horner steps trade places. Levels 1 and 2 cannot see
    this - there is nothing wrong with any constant - and it is a
    plausible mistake, being one line moved in a hand-written kernel."""
    ev = rec["approximations"][name]["eval"]
    # find two adjacent fma steps and swap the constants they add
    idx = [i for i, s in enumerate(ev) if s[1] == "fma"]
    i, j = idx[0], idx[1]
    ev[i][-1], ev[j][-1] = ev[j][-1], ev[i][-1]
    return f"{name}: two Horner coefficients traded places"


def drop_provenance(rec, name):
    rec["constants"][name].pop("source")
    return f"{name} lost its provenance"


def lie_about_verification(rec, name):
    rec["constants"][name]["source"]["verified_against_source"] = True
    return (f"{name} claims a source was verified when it is a fitted "
            f"coefficient nobody opened")


def corrupt_decimal(rec, name):
    c = rec["constants"][name]
    c["decimal"] = c["decimal"][:-1] + ("1" if c["decimal"][-1] != "1"
                                        else "2")
    return f"{name}'s decimal edited without its bits"


CONTROLS = [
    ("closed constant, one ulp", lambda r: bump_bits(r, "PI_F"),
     ["LEVEL 2"]),
    ("closed constant, one ulp, consistently",
     lambda r: bump_bits_and_decimal(r, "TWO_OVER_PI"), ["LEVEL 2"]),
    ("derived constant, one ulp",
     lambda r: bump_bits_and_decimal(r, "PIO2_2"), ["LEVEL 2"]),
    # THE CONTROL THAT MOVED THE DESIGN. This was expected to fail on
    # the behavioural bound and did not: one ulp of AT1 shifts atan by
    # 3e-8, sixty times under a bound of 1.9e-6. A bound loose enough
    # to be a promise about a whole domain cannot also be a tripwire
    # for a typo, and pretending otherwise would mean pinning bounds so
    # tight that ordinary re-measurement broke them. So the seal and
    # the upstream comparison were added to catch it structurally, and
    # this control now expects THOSE - not the bound, which is doing
    # its own job correctly.
    ("fitted coefficient, one ulp, consistently",
     lambda r: bump_bits_and_decimal(r, "AT1"), ["SEAL", "UPSTREAM"]),
    ("decimal edited alone", lambda r: corrupt_decimal(r, "SQRT2"),
     ["LEVEL 2"]),
    ("provenance removed", lambda r: drop_provenance(r, "SS1"),
     ["LEVEL 1"]),
    ("false verification claim",
     lambda r: lie_about_verification(r, "E2P3"), ["LEVEL 1"]),
    ("HORNER ORDER SWAPPED, every constant correct",
     lambda r: swap_horner(r, "exp2_kernel"), ["bounds"]),
    ("HORNER ORDER SWAPPED in atan",
     lambda r: swap_horner(r, "atan_kernel"), ["bounds"]),
]


def main():
    base = json.loads(RECORD.read_text(encoding="utf-8"))
    if any(a.get("bound") is None
           for a in base["approximations"].values()):
        sys.exit("the record has no bounds pinned yet - run "
                 "verify-constants.py --record-bounds first, or the "
                 "level 3 controls cannot fail for the right reason")

    print("=" * 68)
    print("negative controls: the checker must FAIL on each of these")
    print("=" * 68)

    # the control on the controls: an untouched copy must still pass,
    # or every failure below could just be the copying
    tmp = pathlib.Path(tempfile.mkdtemp())
    clean = tmp / "clean.json"
    clean.write_text(json.dumps(base, indent=2) + "\n", encoding="utf-8")
    rc, out = run(clean)
    print(f"\n  [{'ok' if rc == 0 else 'BROKEN'}] untouched copy still "
          f"passes (rc={rc})")
    if rc != 0:
        print("      the controls below would prove nothing - the copy "
              "itself is broken")
        print("\n".join("      " + ln for ln in out.splitlines()[-12:]))
        return 2

    bad = 0
    for i, (label, mutate, want) in enumerate(CONTROLS):
        rec = json.loads(json.dumps(base))
        detail = mutate(rec)
        path = tmp / f"ctl{i}.json"
        path.write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")
        rc, out = run(path)
        caught = rc != 0
        # and it must fail at the level that claims to catch it, not
        # incidentally somewhere else
        right = caught and any(
            any(w in ln for w in want) and
            ("FAIL" in ln or "exceeds the recorded bound" in ln or
             "no bound" in ln or "changed shape" in ln)
            for ln in out.splitlines())
        # bounds failures print under a "bounds:" heading
        if caught and not right and "bounds" in want:
            right = ("exceeds the recorded bound" in out or
                     "changed shape" in out)
        mark = "ok" if right else ("weak" if caught else "MISSED")
        if not right:
            bad += 1
        print(f"\n  [{mark}] {label}")
        print(f"        {detail}")
        if caught:
            hits = [ln.strip() for ln in out.splitlines()
                    if ("FAIL" in ln or "exceeds the recorded bound" in ln
                        or "no bound" in ln or "changed shape" in ln
                        or "claims a verified" in ln
                        or ": missing [" in ln)][:3]
            for h in hits:
                print(f"        -> {h}")
        else:
            print("        -> CHECKER PASSED IT. That level does not "
                  "measure what it claims to.")

    print()
    if bad:
        print(f"  {bad} control(s) not caught cleanly - the checker's "
              f"reach is smaller than advertised")
        return 1
    print(f"  all {len(CONTROLS)} controls caught, each at the level "
          f"that claims to catch it")
    return 0


if __name__ == "__main__":
    sys.exit(main())
