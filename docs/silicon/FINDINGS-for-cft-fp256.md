# atlas-engine on the round-2 pair: findings for cft-fp256

**2026-09-17, amd-arc-box, the U50, XRT 2.19.194.** The first real use
of revision 6 silicon by a workload from outside this project: atlas-engine's
sixty-nine positives, lowered to sequencer programs, on the round-2 pair
built from 5b7aa19 (`cft_hw_single.xclbin` 97482ec7..., `cft_hw_quad.xclbin`
226d6c76..., both `sha256sum -c` clean), with host tools built fresh from
cft-fp256 56ad0cd (`make -C host XRT=1 all device-test`, a clean clone,
nothing modified). The gate first: `hw/run-device-test.sh
cft_hw_single.xclbin -q -n 8`, **2,248 checks, 0 failed**.

Everything below names the evidence, and every log it names is in
atlas-engine `docs/silicon/2026-09-17/`.

## 1. The XRT backend drops STATUS[5]. The tile raises it.

**What happens.** An image with `SCRATCH_STRICT` whose indexed accesses
run past the depth computes the right deposits on the card - stores
suppressed, loads reading +0 - and returns a status word of **0**. On the
software backend the same image returns **0x20**, `CFT_STATUS_SCRATCH_RANGE`,
which is what the golden model computes and what R8 says.

**Where.** Not the RTL. `CFT_XRT_TRACE=1` prints the tile's own register
after the run: `STATUS=0x00000020` (`probe-single-r8-strict-xrt-trace.log`).
The bit is lost on the host, in `host/src/backend_xrt.cpp`, which reduces
the tile's STATUS to the deposit-overflow bit before handing it back:

    2026:    *bus = st_acc & ST_DEPOSIT_OVERFLOW;        (the failure path)
    2186:    *bus = status_acc & ST_DEPOSIT_OVERFLOW;    (a successful run)

**The fix, verified on both images.** Two lines and a constant
(`runner/backend_xrt-status-range.diff`): `ST_SCRATCH_RANGE = 0x20u` and
`status_acc & (ST_DEPOSIT_OVERFLOW | ST_SCRATCH_RANGE)` at both sites.
Rebuilt in a separate worktree, the probe then reads 0x20 on the single
tile and on the quad, 0 for its modulo twin, with the deposits unchanged
(`probes-statusfix.log`).

**Why nothing caught it.** `device-test`'s strict leg checks that a strict
image LOADS on a device that publishes CAPS2[6] and is refused on one that
does not; no test runs an index past the depth on a device and reads the
status back. The probe that does is in the program set as `r8-strict` and
`r8-modulo`, with golden-model expectations.

## 2. A program run above 32,768 lanes overruns the lane-mask buffer

**What happens.** On the card, any program run with more than 32,768
lanes and no lane mask computes the right deposits and then corrupts the
host heap: `positive-run` aborts at teardown with glibc's "double free or
corruption (out)" (exit 134) or segfaults (exit 139), and a Python ctypes
harness that times the run through libcft dies inside the run call itself
- "malloc(): corrupted top size" at 65,536 lanes, a segfault at 1,048,576
(`segfault-probe.log`). Bisected with the stock `positive-run` over
prefixes of one stream set, on two programs with different deposit
widths (`bisect-hopf-lanes-single.log`, `bisect-heap-single.log`):

| lanes | `hopf`, 6 deposits a lane | a one-deposit loop |
|---|---|---|
| 32,768 | exit 0, deposits right | exit 0, deposits right |
| 33,792 | exit 134, deposits right | - |
| 40,960 and every size up to 262,144 | exit 134, deposits right | exit 134, deposits right |

The boundary follows the lane count and not the deposit buffer, and it is
exactly 4,096 bytes times eight.

**Where.** `host/src/backend_xrt.cpp`, `cftx_program_run`, ABI 0.14's R17
staging. With no mask the buffer is sized for one beat:

    const size_t mask_real = lane_mask ? cft_mask_bytes(mask_lanes) : 0;
    const size_t mask_pad = mask_real ? beat_round(mask_real) : 32u;

`ensure_one` rounds that to one page, 4,096 bytes - and then
`stage_mask(tile.mk, lane_mask, mask_first, mask_lanes, mask_pad)` calls
`cft_mask_repack`, which for a null mask writes `cft_mask_bytes(n)` bytes of
0xFF whatever the buffer's size. Past 32,768 lanes that is past the
mapping. The tile never reads the mask on a run whose MODE[23] is clear,
which is why every result is right; only host memory is damaged.
`mask_bits.h` says as much in its own comment - "the caller of a run with
no mask does not reach this, but a backend that binds the register
unconditionally does" - and this backend does. The round-2 card day's
program runs were at most a few thousand lanes, well under the boundary.

**The fix, verified.** Size the buffer for the run's lanes with or without
a mask (`runner/backend_xrt-status-range-and-mask.diff`, which carries both
patches in this note):

    const size_t mask_real = cft_mask_bytes(mask_lanes);
    const size_t mask_pad = beat_round(mask_real);

Rebuilt, the same bisect ran clean at every size it tried from 33,792 to
262,144 lanes with the deposits right (`bisect-heap-single-fixed.log`), and every
card-scale timing run below used that library, up to 1,048,576 lanes.

## 3. positive-run refuses SCRATCH_STRICT by its own subset of flags

`host/tools/positive-run.c` keeps `FLAGS_KNOWN` as `BANK_EXT | SCRATCH_IO`,
deliberately, with a comment from 2026-09-11 - "CFT_PROG_FLAG_SCRATCH_STRICT
exists and this cannot emit it, so an image asking for it is refused here
rather than written out as something no tile will load." Every card image
since the revision-4 pair loads it, libcft's `SEQ_FLAGS_KNOWN` has it and
`asm.py` emits it, so the runner is now the one tool on the path to a card
that turns a strict image away:

    positive-run: header flags 0x00000005: only BANK_EXT and SCRATCH_IO are defined

The one-line fix (`runner/positive-run-strict.diff`) adds
`CFT_PROG_FLAG_SCRATCH_STRICT` to the subset; every run in this record that
names `positive-run-strict` is that binary.

## 4. An operating limit a real workload reaches: the one-minute wait

Not a defect, recorded because a workload from outside this project
reached it on its first day. `threebody` - 2,029 instructions, one loop of 2,560 trips,
the heaviest spilling in the corpus - runs about 3.3 ms a lane on the card,
so 65,536 lanes is three and a half minutes, and libcft's XRT backend waits
sixty seconds for a program run by default:

    cft_program_run_ex: timed out: the compute unit did not complete a program (state 8) -
    the compute unit may still be active, so this handle is finished; close and reopen it
    (STATUS clean, so this is a hang or a genuinely long program ...)

`CFT_TIMEOUT_MS` raises it to a cap of twenty minutes, and with it set the
same runs completed and matched. Two things worth knowing for the next
caller: the handle is finished after a timeout, so a long-running tool
must reopen; and the tile may still be running the program, so the next
run on that tile has to wait it out - nothing tells the host when it is
done. A caller with a program that needs more than twenty minutes a run
has to split its lanes, which the contract allows and which this day
checked: every card-scale run on the single tile also matched when its
lanes went in as eight separate runs.

## 5. Two pieces of text that say revision 4 is not on silicon

- `docs/SEQUENCER.md`, "What revision 4 does not do": "It has not been
  built... no bitstream carries it, so every card in service reads CAPS2[6]
  as zero and turns a strict image away." The intro of the same file says
  every pair since `~/cardday-rev4` carries R8 and CAPS2[6], and this card
  loads strict images.
- `bindings/node/lib.mjs`'s `SEQ_FEATURE_NAMES` stops at `SCRATCH_IO`, so the
  node package prints CAPS2[6], [7], [9] and [10] as `bit10`, `bit11`,
  `bit13` and `bit14`.

## 6. What an instruction costs on the card, by kind

Measured, not a defect: five programs that differ only in the instruction
pair inside one `repeat 1024`, 16,384 lanes, fp32, the run alone timed
through libcft (the median of three), every deposit buffer matching the
golden model's (`probes/insn-cost/`, `cost-single.log`, `cost-quad.log`,
`cost-sw.log`):

| program, 1,024 trips | single tile | quad | software, one core |
|---|---|---|---|
| one arithmetic instruction (`ior`) | 1.24 µs a lane | 1.23 | 14.77 |
| two arithmetic instructions | 2.24 | 2.24 | 29.23 |
| `stl` and `ldl`, one slot | 8.18 | 8.18 | 16.08 |
| `stx` and `ldx`, index in a register | 8.41 | 8.41 | 23.34 |
| `ior` and `setact` on a non-zero register | 5.38 | 5.38 | 24.76 |

Per instruction, per lane: arithmetic **0.98 ns** on the card - with 128
fp32 lanes a block, about one cycle a beat at 135 MHz, which is revision
5's own number - and a scratch store or load **3.9 ns**, an indexed one
**4.0 ns**, a `SETACT` **4.0 ns**: about four cycles a beat, four times
arithmetic. On the software backend the order is reversed - a scratch
access is half the cost of arithmetic there.

The reading we would offer, for you to confirm or correct against the RTL:
every control-coded instruction measured pays the same four cycles a beat
whatever it does - a `setact` reading a register nothing near it writes
costs what an `stl`/`ldl` pair on one register costs - so the cost looks
like the issue of a control code, not the memory. If R12 to R15's overlap
does not extend to control codes, this is the size of what it would buy on
a workload that spills: atlas-engine's `throughput` - no loop - makes 259
stores and 1,924 loads through the scratch a lane, 2,183 of its 14,801
instructions, and its loop positives pay one `setact` a trip for their
early exit.

The quad ran every program at the single tile's rate to the hundredth, as
docs/SCALING.md says it should while a program run is one tile's, and paid
a fixed cost of about 0.3 s a `positive-run` call over the single tile
(`set-quad-strict.log`, the short cases).
