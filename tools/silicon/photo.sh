#!/bin/bash
# The photograph on the card: the darkroom's camera around a plate, one
# program run a pass, the lane index as the sample index.
#
#   bash tools/silicon/photo.sh PHOTO_DIR [single|quad|sw]
#
# PHOTO_DIR is what tools/photo-gpu.py and tools/photo-cft.mjs --pack
# wrote, copied to the box: the GPU's records.pNNNN.bin beside card/, which
# holds camera.cftp, camera.json and one camera.pNNNN.bank a pass. Each
# pass runs through positive-run (the patched library: a pass is a million
# lanes, past the 32,768 where the stock one overruns its mask buffer)
# with --iota, so stream a IS the sample index the GPU dispatched, and the
# deposit buffer - five words a lane, x y r g b - is compared with the
# GPU's record of the same pass, byte for byte. Then the same case goes
# through cft-silicon-time.py for the rate and for a partition check.
set -u
ROOT=${ATLAS_SILICON:-$HOME/atlas-silicon}
IMAGES=${CARD_IMAGES:-$HOME/cardday-round2}
DIR=${1:?usage: photo.sh PHOTO_DIR [single|quad|sw]}
IMG=${2:-single}
set +u; source /opt/xilinx/xrt/setup.sh >/dev/null 2>&1; set -u
LIBDIR=$ROOT/cft-fp256-statusfix/host
export LD_LIBRARY_PATH=$LIBDIR:${LD_LIBRARY_PATH:-}
RUN=$ROOT/runner/positive-run-fixed
dev=$IMAGES/cft_hw_$IMG.xclbin; [ "$IMG" = sw ] && dev=sw
CARD=$DIR/card
N=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['frame']['samples_a_pass'])" "$CARD/camera.json")
stamp() { echo "=== $(date -Is) $*"; }

stamp "photograph on $IMG: $N samples a pass, $(ls "$CARD"/camera.p*.bank | wc -l) pass(es)"
for bank in "$CARD"/camera.p*.bank; do
  p=$(basename "$bank" .bank); p=${p#camera.}
  out=$CARD/deposits.$IMG.$p.bin
  t0=$(date +%s%N)
  "$RUN" "$CARD/camera.cftp" --iota "$N" --bank "$bank" --out "$out" --device "$dev" | tail -2
  t1=$(date +%s%N)
  want=$(sha256sum < "$DIR/records.$p.bin" | cut -c1-64)
  got=$(sha256sum < "$out" | cut -c1-64)
  verdict=$([ "$want" = "$got" ] && echo "MATCH - the GPU's records, bit for bit" || echo "DIFFER")
  echo "pass $p: $(( (t1 - t0) / 1000000 )) ms wall; deposits $got; GPU records $want; $verdict"
done

# the rate, and a partition: the case files the timing tool reads, as links
RATE=$CARD/rate
mkdir -p "$RATE"
for bank in "$CARD"/camera.p*.bank; do
  p=$(basename "$bank" .bank); p=${p#camera.}
  ln -sf "../camera.cftp" "$RATE/camera.$p.cftp"
  ln -sf "../camera.$p.bank" "$RATE/camera.$p.bank"
  ln -sf "../camera.a.bin" "$RATE/camera.$p.a.bin"
  ln -sf "../../records.$p.bin" "$RATE/camera.$p.deposits.bin"
done
[ "$IMG" = sw ] || python3 "$ROOT/tools/cft-silicon-time.py" --lib "$LIBDIR/libcft.so" --device "$dev" --dir "$RATE" \
  --cases camera.p0000 --reps 3 --chunks 8 --jsonl "$CARD/rate-$IMG.jsonl" | tail -4
stamp done
