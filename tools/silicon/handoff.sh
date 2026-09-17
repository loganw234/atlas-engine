#!/bin/bash
# Assemble what the 2026-09-17 card day hands to cft-fp256, as one tarball.
#
#   bash tools/silicon/handoff.sh <program-set dir> <tested program-set dir> [out dir]
#
# The program set is packed from a clean commit; the tested one is the set
# that actually went through the card that day. Every binary file of every
# case must be byte-identical between the two - only the JSON provenance may
# differ - or this stops, because the card results belong to the bits.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SET=${1:?program set dir}
TESTED=${2:?tested program set dir}
OUT=${3:-$ROOT/build/cft/handoff-2026-09-17}
DAY=$ROOT/docs/silicon/2026-09-17

bad=0
for f in "$SET"/*.cftp "$SET"/*.bank "$SET"/*.bin "$SET"/*.cfta; do
  b=$(basename "$f")
  if ! cmp -s "$f" "$TESTED/$b"; then echo "DIFFERS from the tested set: $b"; bad=1; fi
done
[ "$bad" = 0 ] || { echo "the clean set is not the set the card ran; stopping"; exit 1; }
echo "every case file identical to the set the card ran"

rm -rf "$OUT"
mkdir -p "$OUT/program-set" "$OUT/probes/insn-cost" "$OUT/findings/logs" "$OUT/tools"
cp "$SET"/* "$OUT/program-set/" 2>/dev/null || true
rm -rf "$OUT/program-set/logs"
cp "$ROOT"/build/cft/cost/* "$OUT/probes/insn-cost/"
cp "$ROOT/docs/silicon/FINDINGS-for-cft-fp256.md" "$OUT/findings/"
cp "$DAY"/*.diff "$OUT/findings/"
for l in identity.log gate-device-test-single-n8.log first-light-probe.log probes-sw.log probes-single.log \
         probes-quad.log probe-single-r8-strict-xrt-trace.log probes-statusfix.log \
         bisect-hopf-lanes-single.log bisect-heap-single.log bisect-heap-single-fixed.log \
         set-single-strict.log set-single-stock.log set-quad-strict.log set-quad-stock.log \
         set-sw-strict.log set-sw-stock.log cost-single.log cost-quad.log cost-sw.log \
         rate-single.log rate-quad.log rate-single-long.log rate-quad-long.log segfault-probe.log; do
  [ -f "$DAY/$l" ] && cp "$DAY/$l" "$OUT/findings/logs/"
done
cp "$DAY/INDEX.md" "$OUT/findings/logs/"
cp "$ROOT/tools/cft-silicon-time.py" "$OUT/tools/"
cp "$ROOT/tools/silicon/cardday.sh" "$ROOT/tools/silicon/long-runs.sh" "$OUT/tools/"
[ -f "$ROOT/tools/silicon/bisect-heap.sh" ] && cp "$ROOT/tools/silicon/bisect-heap.sh" "$OUT/tools/"
cp "$ROOT/tools/probes/r8-scratch-strict.py" "$ROOT/tools/probes/insn-cost.py" "$OUT/tools/"

cat > "$OUT/README.md" <<'EOF'
# From atlas-engine's first card day, for cft-fp256

2026-09-17, the round-2 pair (revision 6) on the U50. Three things:

- `program-set/` - atlas-engine's sixty-nine positives as a program-model test
  set: 138 cases at 1,001 lanes each (every positive at its lever defaults and
  at a hashed setting) plus two strict-scratch probes. Every case's expected
  deposits were agreed by libcft, the golden model, asm.py, positive-run and
  the emitted GLSL interpreted at binary32 before it was packed; its README
  says how and `run_set.py` replays it through positive-run on any device.
  On the card the set replays 139 of 140 on both images, and the one miss is
  finding 1 below.
- `findings/` - what the day found, each with its evidence. Three defects, each
  with a patch verified on the card: STATUS[5] dropped by the XRT backend, a
  lane-mask buffer overrun above 32,768 lanes, and positive-run's own flag
  subset refusing SCRATCH_STRICT. Then an operating limit (the one-minute run
  wait), two pieces of stale text, and what each kind of instruction costs on
  the card.
- `probes/insn-cost/` and `tools/` - five programs that price one instruction of
  each kind on a device, and the harness that times program runs through libcft
  with the run alone on the clock.

Read `findings/FINDINGS-for-cft-fp256.md` first. It names its evidence by the
paths it has in atlas-engine: the logs it cites are in `findings/logs/` here
(`INDEX.md` says what each is), and the patches it cites are in `findings/`.
EOF
( cd "$OUT/program-set" && sha256sum -c SHA256SUMS --quiet ) && echo "program-set SHA256SUMS clean"
tar -czf "$OUT.tar.gz" -C "$(dirname "$OUT")" "$(basename "$OUT")"
ls -la "$OUT.tar.gz"
