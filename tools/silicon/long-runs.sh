#!/bin/bash
# The card-scale cases that outlast libcft's default one-minute program-run
# wait, re-run with CFT_TIMEOUT_MS at its twenty-minute cap.
#
#   CFT_LIB=<patched libcft.so> bash tools/silicon/long-runs.sh [case,case ...]
#
# A run that times out leaves its handle finished and the compute unit
# possibly still busy with the program (backend_xrt.cpp says so in the
# error), so this waits out the longest such run before touching the card.
set -u
ROOT=${ATLAS_SILICON:-$HOME/atlas-silicon}
IMAGES=${CARD_IMAGES:-$HOME/cardday-round2}
LIB=${CFT_LIB:?set CFT_LIB to a libcft.so that can run past 32,768 lanes}
CASES=${1:-threebody.n65536,throughput.n65536}
LOG=$ROOT/logs
set +u; source /opt/xilinx/xrt/setup.sh >/dev/null 2>&1; set -u
export CFT_TIMEOUT_MS=1200000
stamp() { echo "=== $(date -Is) $*"; }
card()  { xrt-smi examine -d "${CARD_BDF:-0000:02:00.1}" -r thermal electrical 2>&1 | grep -E "FPGA  |Int Vcc  |^  Power  " | tr -s ' '; }

stamp "waiting 240 s for any program a timeout left running on a tile"; sleep 240
for img in single quad; do
  extra=""; [ "$img" = single ] && extra="--chunks 8"
  { stamp "long runs on $img: $CASES, CFT_TIMEOUT_MS=$CFT_TIMEOUT_MS $extra"; card
    python3 "$ROOT/tools/cft-silicon-time.py" --lib "$LIB" --device "$IMAGES/cft_hw_$img.xclbin" --dir "$ROOT/rate" \
      --cases "$CASES" --reps 2 $extra --jsonl "$LOG/rate-$img-long.jsonl"
    echo "RATE_EXIT=$?"; card; stamp done
  } > "$LOG/rate-$img-long.log" 2>&1
  cat "$LOG/rate-$img-long.log"
done
