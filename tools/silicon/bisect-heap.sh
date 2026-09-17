#!/bin/bash
# tools/silicon/bisect-heap.sh - run on the card host from ~/atlas-silicon; the bisect behind FINDINGS finding 2.
# Where does a program run on the card start corrupting the host heap:
# at a lane count, or at a deposit-buffer size?
cd ~/atlas-silicon && mkdir -p bisect && source /opt/xilinx/xrt/setup.sh >/dev/null 2>&1
X=${1:-$HOME/cardday-round2/cft_hw_single.xclbin}
R=${RUNNER:-runner/positive-run-strict}   # RUNNER=runner/positive-run-fixed re-runs it against the patched library
run() { # image a b c bank want k label
  local out; out=$($R "$1" --a "$2" ${3:+--b "$3"} ${4:+--c "$4"} ${5:+--bank "$5"} --out bisect/got.bin --device "$X" 2>&1); local ex=$?
  local got want; got=$(sha256sum bisect/got.bin 2>/dev/null | cut -c1-16); want=$(sha256sum "$6" | cut -c1-16)
  echo "$8 k=$7 exit=$ex $([ "$got" = "$want" ] && echo MATCH || echo "got=$got want=$want") $(echo "$out" | grep -i -E "corrupt|double free|fault|error" | head -1)"
  rm -f bisect/got.bin
}
echo "## hopf, 6 deposits a lane, 24 bytes a lane of deposits"
S=rate/hopf.n65536
for k in 33792 34816 35840 36864 37888 38912 39936; do
  for s in a b c; do head -c $((k*4)) $S.$s.bin > bisect/h.$s.bin; done
  head -c $((k*24)) $S.deposits.bin > bisect/h.want.bin
  run $S.cftp bisect/h.a.bin bisect/h.b.bin bisect/h.c.bin $S.bank bisect/h.want.bin $k hopf
done
echo "## cost-alu1, 1 deposit a lane, 4 bytes a lane; the expected deposit is stream a"
C=cost/cost-alu1.t1024.n16384
for k in 32768 40960 65536 131072 196608 262144; do
  python3 - "$k" <<PY
import struct, sys
k = int(sys.argv[1])
a = b"".join(struct.pack("<f", (i % 9973) * 0.25 + 1.0) for i in range(k))
open("bisect/c.a.bin", "wb").write(a); open("bisect/c.want.bin", "wb").write(a)
PY
  run $C.cftp bisect/c.a.bin "" "" "" bisect/c.want.bin $k alu1
done
