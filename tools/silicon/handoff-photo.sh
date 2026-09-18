#!/bin/bash
# Assemble what 2026-09-18 hands to cft-fp256, as one tarball.
#
#   bash tools/silicon/handoff-photo.sh <program-set dir> <out dir> <photo dir> [<photo dir> ...]
#
# <program-set dir> is tools/pack-cft-set.mjs's output from a commit; each
# <photo dir> is what tools/photo-gpu.py and tools/photo-cft.mjs --pack wrote
# for one plate, with the card's run already compared against it.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SET=${1:?program set dir}
OUT=${2:?out dir}
shift 2
[ $# -ge 1 ] || { echo "at least one photo dir"; exit 1; }
DAY=$ROOT/docs/silicon/2026-09-18

rm -rf "$OUT"
mkdir -p "$OUT/program-set" "$OUT/photographs" "$OUT/logs" "$OUT/tools"
cp "$SET"/* "$OUT/program-set/" 2>/dev/null || true
rm -rf "$OUT/program-set/logs"
( cd "$OUT/program-set" && sha256sum -c SHA256SUMS --quiet ) && echo "program-set SHA256SUMS clean"

# each photograph: the image, a bank a pass, pass 0's expected deposits byte
# for byte, every pass's buffer hash, the GPU's planes and the print
for PHOTO in "$@"; do
  plate=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['plate'])" "$PHOTO/photo-gpu.json" 2>/dev/null \
          || python -c "import json,sys; print(json.load(open(sys.argv[1]))['plate'])" "$PHOTO/photo-gpu.json")
  P=$OUT/photographs/$plate
  mkdir -p "$P"
  cp "$PHOTO/card/camera.cftp" "$PHOTO/card/camera.json" "$PHOTO"/card/camera.p*.bank "$P/"
  cp "$PHOTO/records.p0000.bin" "$P/camera.p0000.deposits.bin"
  cp "$PHOTO/planes.gpu.bin" "$PHOTO/photo-gpu.json" "$P/"
  ( cd "$PHOTO" && sha256sum records.p*.bin ) > "$P/deposits.SHA256"
  [ -f "$PHOTO/print.card.png" ] && cp "$PHOTO/print.card.png" "$P/print.png"
done
cp "$DAY"/*.jsonl "$DAY"/*.log "$DAY/INDEX.md" "$OUT/logs/"
cp "$ROOT/tools/cft-silicon-time.py" "$ROOT/tools/silicon/photo.sh" "$ROOT/tools/silicon/rate-compare.sh" \
   "$ROOT/tools/photo-bin.mjs" "$OUT/tools/"

cat > "$OUT/README.md" <<'EOF'
# From atlas-engine, 2026-09-18, for cft-fp256

The U50 with the revision-6 pair, the single tile, the library patched as in
the 2026-09-17 findings. Two things:

- `program-set/` - atlas-engine's sixty-nine positives again, 138 cases at
  1,001 lanes, packed from atlas-engine d4178cc. The lowering now prices its
  choices in what a lane executes on the card (a scratch access or SETACT
  four arithmetic instructions), coalesces loop copy-backs, and HOISTS every
  per-run value into the bank - so each case's bank carries values libcft
  computed for that run's levers, between the program's constants and the
  nine-word tail. Every case was agreed by libcft, the golden model, asm.py,
  positive-run and the emitted GLSL before it was packed; `run_set.py`
  replays it. The records say `d4178cc...+dirty`: the one modified file in
  the tree was core/detlib.cft.json, whose `generated` date gen-detlib
  rewrites and which nothing in the pack reads, and every case file is
  byte-identical to the set verified before the commit. On the card today's
  images ran 1.07x to 1.85x faster than the card day's on the same streams,
  with the same deposits (`logs/`).
- `photographs/` - a real workload's program cases with a GPU's answer: the
  darkroom's deterministic camera around a plate, one program per frame, one
  input stream - the sample index, so `positive-run --iota 1048576` - and
  five deposits a lane, the pixel and three fixed-point channels. `hopf` is
  1,081 words, straight-line (IMUL, kx, 32 registers); `mand` is 1,272 with
  a loop that exits early by SETACT. `camera.p000N.bank` is pass N's bank;
  `camera.p0000.deposits.bin` is pass 0's expected deposit buffer, the GPU's
  own record of every sample (RTX 5060 Ti, NVIDIA 591.86); `deposits.SHA256`
  holds every pass's buffer hash, which is what positive-run's last line
  prints. On the U50 every pass of both matches, and the planes
  `photo-bin.mjs` adds up from the card's deposits are the GPU's
  (`planes.gpu.bin`). `print.png` is the photograph.

Read atlas-engine's `docs/CFT-PHOTOGRAPH.md` and `docs/CFT-SILICON.md`
("The lowering, priced, on the card") for what these say.
EOF
tar -czf "$OUT.tar.gz" -C "$(dirname "$OUT")" "$(basename "$OUT")"
ls -la "$OUT.tar.gz"
