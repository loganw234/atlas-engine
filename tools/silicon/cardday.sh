#!/bin/bash
# atlas-engine's programs on cft-fp256 silicon: the card-day sequence.
#
#   bash tools/silicon/cardday.sh [step ...]      steps: identity set set-card set-sw rate rate-card cost probes all
#
# Run on the card's host with this layout under $ATLAS_SILICON
# (default ~/atlas-silicon):
#
#   cft-fp256/            a clean clone at the commit under test, host built with XRT=1
#   runner/positive-run-strict
#                         positive-run with SCRATCH_STRICT added to its own FLAGS_KNOWN
#                         (the one-line diff beside it); the stock binary refuses the bit
#   tools/                cft-silicon-time.py
#   set/                  the program set: tools/pack-cft-set.mjs's output, run_set.py inside
#   rate/                 card-scale cases from tools/cft-streams.mjs, expected deposits
#                         computed on the software backend in lane blocks
#
# Every step writes logs/<step>-<device>.log and, where the tool writes one,
# a JSON-lines record beside it. Nothing here writes to the card but runs;
# the images are the round-2 pair, checked against their SHA256SUMS first.
set -u
ROOT=${ATLAS_SILICON:-$HOME/atlas-silicon}
CFT=$ROOT/cft-fp256
IMAGES=${CARD_IMAGES:-$HOME/cardday-round2}
XS=$IMAGES/cft_hw_single.xclbin
XQ=$IMAGES/cft_hw_quad.xclbin
BDF=${CARD_BDF:-0000:02:00.1}
LOG=$ROOT/logs
STOCK=$CFT/host/positive-run
STRICT=$ROOT/runner/positive-run-strict
LIB=${CFT_LIB:-$CFT/host/libcft.so}   # override with a patched build: the stock 56ad0cd library corrupts the heap above 32,768 lanes
mkdir -p "$LOG"
set +u; source /opt/xilinx/xrt/setup.sh >/dev/null 2>&1; set -u

stamp() { echo "=== $(date -Is) $*"; }
card()  { xrt-smi examine -d "$BDF" -r thermal electrical 2>&1 | grep -E "FPGA  |Int Vcc  |^  Power  " | tr -s ' '; }
tag()   { case "$1" in sw) echo sw ;; *quad*) echo quad ;; *single*) echo single ;; *) basename "$1" .xclbin ;; esac; }

identity() {
  { stamp identity
    uname -a
    xrt-smi examine 2>&1 | sed -n '/^XRT/,/Device(s) Present/p' | head -12
    xrt-smi examine 2>&1 | grep -A3 "^|BDF"
    (cd "$IMAGES" && sha256sum -c SHA256SUMS)
    echo "cft-fp256 $(git -C "$CFT" rev-parse HEAD) $(git -C "$CFT" status --porcelain --untracked-files=no | wc -l) modified"
    echo "--- stock positive-run:";  "$STOCK" --capabilities
    echo "--- strict positive-run:"; "$STRICT" --capabilities
    echo "--- runner diff:"; cat "$ROOT/runner/positive-run-strict.diff"
    echo "--- card:"; card
  } > "$LOG/identity.log" 2>&1
  cat "$LOG/identity.log"
}

set_replay() {
  local dev=$1 runner=$2 name=$3
  local t; t=$(tag "$dev")
  stamp "set on $t with $name runner"
  { stamp "set on $t with $name runner"; card
    python3 "$ROOT/set/run_set.py" --runner "$runner" --device "$dev" --log "$LOG/set-$t-$name.jsonl"
    echo "RUN_SET_EXIT=$?"; card; stamp done
  } > "$LOG/set-$t-$name.log" 2>&1
  tail -2 "$LOG/set-$t-$name.log"
}

rate() {
  local dev=$1 extra=${2:-}
  local t; t=$(tag "$dev")
  stamp "rate on $t $extra"
  { stamp "rate on $t $extra"; card
    python3 "$ROOT/tools/cft-silicon-time.py" --lib "$LIB" --device "$dev" --dir "$ROOT/rate" --reps 3 $extra \
      --jsonl "$LOG/rate-$t.jsonl"
    echo "RATE_EXIT=$?"; card; stamp done
  } > "$LOG/rate-$t.log" 2>&1
  cat "$LOG/rate-$t.log"
}

cost() {
  local dev=$1
  local t; t=$(tag "$dev")
  stamp "cost on $t"
  { stamp "cost on $t"; card
    python3 "$ROOT/tools/cft-silicon-time.py" --lib "$LIB" --device "$dev" --dir "$ROOT/cost" --reps 3 \
      --jsonl "$LOG/cost-$t.jsonl"
    echo "COST_EXIT=$?"; card; stamp done
  } > "$LOG/cost-$t.log" 2>&1
  cat "$LOG/cost-$t.log"
}

probes() {
  local dev=$1
  local t; t=$(tag "$dev")
  stamp "probes on $t"
  { stamp "probes on $t"
    for c in r8-strict r8-modulo; do
      for r in "$STRICT" "$STOCK"; do
        echo "--- $c with $(basename "$r")"
        "$r" "$ROOT/set/$c.cftp" --a "$ROOT/set/$c.a.bin" --b "$ROOT/set/$c.b.bin" \
             --out "$LOG/probe-$t-$c-$(basename "$r").bin" --device "$dev"
        echo "exit $?"
        echo "expected status $(python3 -c "import json;print('0x%08x'%json.load(open('$ROOT/set/$c.json'))['expect']['status'])")," \
             "deposits $(python3 -c "import json;print(json.load(open('$ROOT/set/$c.json'))['expect']['deposits']['sha256'])")"
      done
    done; stamp done
  } > "$LOG/probes-$t.log" 2>&1
  cat "$LOG/probes-$t.log"
}

steps=${*:-all}
for s in $steps; do
  case $s in
    identity) identity ;;
    set)      for d in sw "$XS" "$XQ"; do set_replay "$d" "$STRICT" strict; set_replay "$d" "$STOCK" stock; done ;;
    set-card) for d in "$XS" "$XQ"; do set_replay "$d" "$STRICT" strict; set_replay "$d" "$STOCK" stock; done ;;
    set-sw)   set_replay sw "$STRICT" strict; set_replay sw "$STOCK" stock ;;
    probes)   for d in sw "$XS" "$XQ"; do probes "$d"; done ;;
    rate)     rate sw "--no-whole --chunks 32 --procs 32"; rate "$XS" "--chunks 8"; rate "$XQ" ;;
    rate-card) rate "$XS" "--chunks 8"; rate "$XQ" ;;
    cost)     cost "$XS"; cost "$XQ"; cost sw ;;
    all)      identity; for d in sw "$XS" "$XQ"; do probes "$d"; done
              for d in sw "$XS" "$XQ"; do set_replay "$d" "$STRICT" strict; set_replay "$d" "$STOCK" stock; done
              rate "$XS" "--chunks 8"; rate "$XQ" ;;
    *) echo "unknown step $s" >&2; exit 2 ;;
  esac
done
