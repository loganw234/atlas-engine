# Card day logs, 2026-09-17

Everything here was copied from `~/atlas-silicon/logs` and `~/atlas-silicon/runner`
on amd-arc-box. `docs/CFT-SILICON.md` is the narrative and
`docs/silicon/FINDINGS-for-cft-fp256.md` the findings; this is where each
of their claims can be checked. A `.jsonl` beside a `.log` is the same
run as one JSON record a case.

| log | what it is |
|---|---|
| `identity.log` | host, XRT, shell, BDF, the images' `sha256sum -c`, the cft-fp256 commit, both runners' capabilities, the runner diff |
| `build-host-xrt.log` | the clean clone's `make -C host XRT=1 all device-test` |
| `gate-device-test-single-n8.log` | their gate: `device-test -q -n 8` on the single image, 2,248 checks, 0 failed |
| `first-light-probe.log` | `hopf` and `nested` through `positive-run` on software and on the single tile |
| `smoke-time.jsonl` | the timing harness's first run, the same two cases whole and in seven blocks |
| `probes-sw.log`, `probes-single.log`, `probes-quad.log` | the strict-scratch probe and its modulo twin with both runners on each device |
| `probe-single-r8-strict-xrt-trace.log` | the same probe under `CFT_XRT_TRACE`: the tile's STATUS register reads 0x20 |
| `build-statusfix.log`, `backend_xrt-status-range.diff`, `probes-statusfix.log` | finding 1's patch, its build, and the probe reporting 0x20 on both images with it |
| `positive-run-strict.diff` | finding 3: the runner's flag subset, one line |
| `set-{sw,single,quad}-{strict,stock}.{log,jsonl}` | the program set replayed through `run_set.py`; the software strict log holds two runs (the first finished after its parent script was stopped) and the tables use the last record per case |
| `cardday-set-card.out` | the card replays' step stamps and power readings |
| `cost-{single,quad,sw}.{log,jsonl}` | the instruction-cost probes |
| `rate-sw-expected.attempt1-no-xrt-env.log` | the first software run, which failed because XRT's environment was not sourced - kept because it failed |
| `rate-sw-expected.{log,jsonl}` | the card-scale expected buffers, computed on the software backend in 32 lane blocks by 32 processes |
| `cardday-rate-cost-sw.out` | the first card-scale attempt with the stock library: both images segfault within seconds (finding 2 found here) |
| `segfault-probe.log` | the crash reproduced under a Python fault trace at 65,536 and 1,048,576 lanes, and in the stock `positive-run` |
| `bisect-hopf-lanes-single.log`, `bisect-heap-single.log` | finding 2 bisected with the stock runner: correct deposits at every size, heap corruption above 32,768 lanes, for a six-deposit and a one-deposit program |
| `build-maskfix.log`, `backend_xrt-status-range-and-mask.diff`, `bisect-heap-single-fixed.log` | finding 2's patch on top of finding 1's, its build, and the same bisect running clean |
| `cardday-rate-card-fixed.out`, `rate-single.{log,jsonl}`, `rate-quad.{log,jsonl}` | card-scale timings with the patched library; the single run stops at `threebody`'s one-minute timeout (finding 4), and the quad run stops partway through `stdmap` when a stop command meant for another process reached it |
| `long-runs.out`, `rate-{single,quad}-long.{log,jsonl}` | `threebody` and `throughput` with `CFT_TIMEOUT_MS` at its cap, on both images |
| `followups.log`, `rate-quad-followup.jsonl`, `allpaths-{single,quad}.jsonl` | `stdmap` on the quad, and `allpaths` re-measured: its slow first call on each image was the bitstream load |
| `earlyexit.log`, `earlyexit-{setact,flag}.jsonl` | the early exit priced: three loop positives in `SETACT` form and in the selected form, same inputs, same expected buffers |
