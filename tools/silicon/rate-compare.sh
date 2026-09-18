#!/bin/bash
# The lowering's images of 2026-09-17 against today's, on the same card,
# the same cases, back to back.
#
#   CFT_LIB=<patched libcft.so> bash tools/silicon/rate-compare.sh [single|quad]
#
# rate/      the card-day cases (images from 17331ea), streams and expected
#            deposits as they ran then
# rate-new/  today's images and banks, the SAME streams and expected
#            deposits by link - a new image that computes a different bit
#            is a MISMATCH here, so the rate and the parity are one run
# rate-rule30/old and /new
#            rule30 at 4,096 lanes, which had no card-day case: the expected
#            deposits come from the software backend on the OLD image, and
#            both images are held to them
set -u
ROOT=${ATLAS_SILICON:-$HOME/atlas-silicon}
IMAGES=${CARD_IMAGES:-$HOME/cardday-round2}
LIB=${CFT_LIB:?set CFT_LIB to a libcft.so that can run past 32,768 lanes}
IMG=${1:-single}
LOG=$ROOT/logs
set +u; source /opt/xilinx/xrt/setup.sh >/dev/null 2>&1; set -u
export CFT_TIMEOUT_MS=1200000
DEV=$IMAGES/cft_hw_$IMG.xclbin
CASES=psf.n65536,hopf.n65536,mand.n65536,jong.n65536,starfield.n65536,throughput.n65536,stdmap.n65536,nested.n65536,threebody.n65536
stamp() { echo "=== $(date -Is) $*"; }
card()  { xrt-smi examine -d "${CARD_BDF:-0000:02:00.1}" -r thermal electrical 2>&1 | grep -E "FPGA  |Int Vcc  |^  Power  " | tr -s ' '; }
T=$ROOT/tools/cft-silicon-time.py

stamp "rule30: expected deposits from the software backend, old image, 32 processes"
[ -f "$ROOT/rate-rule30/old/rule30.n4096.deposits.bin" ] || \
  python3 "$T" --lib "$LIB" --device sw --dir "$ROOT/rate-rule30/old" --cases rule30.n4096 --reps 1 \
    --no-whole --chunks 32 --procs 32 --write-expected --jsonl "$LOG/rate-rule30-sw.jsonl" | tail -2
ln -sf ../old/rule30.n4096.deposits.bin "$ROOT/rate-rule30/new/rule30.n4096.deposits.bin"

for set in rate rate-new; do
  stamp "$set on $IMG"; card
  python3 "$T" --lib "$LIB" --device "$DEV" --dir "$ROOT/$set" --cases "$CASES" --reps 2 \
    --jsonl "$LOG/cmp-$set-$IMG.jsonl" | grep -E "MATCH|MISMATCH|us/lane|lanes" | tail -12
done
for v in old new; do
  stamp "rule30 $v on $IMG"
  python3 "$T" --lib "$LIB" --device "$DEV" --dir "$ROOT/rate-rule30/$v" --cases rule30.n4096 --reps 3 \
    --jsonl "$LOG/cmp-rule30-$v-$IMG.jsonl" | tail -3
done
card; stamp done
