#!/usr/bin/env python3
"""Run atlas-engine program cases through libcft on a device, and time them.

    python3 cft-silicon-time.py --lib HOST/libcft.so --device sw|IMAGE.xclbin
        --dir CASE_DIR [--cases a,b,...] [--reps 5] [--chunks K] [--procs P]
        [--write-expected] [--jsonl results.jsonl]

A case is the file set tools/pack-cft-set.mjs or tools/cft-streams.mjs
writes: CASE.cftp, CASE.bank, CASE.a.bin, CASE.b.bin, CASE.c.bin and,
when there is one, CASE.deposits.bin - the expected deposit buffer.

For each case the device is opened ONCE and the program loaded once, then
cft_program_run_ex is timed on its own, `reps` times, so the number is the
run and not process start-up, library initialisation or the image load
that positive-run's wall clock includes. The first rep is reported apart
from the median of the rest: it is where buffers are allocated.

    --chunks K   also run the lanes as K contiguous blocks, one run each,
                 and require the concatenated deposits to equal the whole
                 run's: a partition must not change a lane's result, and
                 on a program with an early exit it changes WHEN the
                 exit fires, which the contract says is invisible.
    --procs P    compute the chunks in P processes, each opening its own
                 device (the software backend is single-threaded, so this
                 is how a million-lane expected buffer is made in minutes).
    --write-expected
                 when a case has no expected buffer, write this run's as
                 CASE.deposits.bin (used on the software backend only).

Every check is on bits: the deposit buffer's SHA-256 against the expected
file's, the IEEE flags and STATUS word, and every lane's deposit count.
Standard library only; the ctypes declarations follow cft-fp256's
host/tools/gathertime.py, field for field against host/include/cft.h at
ABI 0.14.
"""
import argparse
import ctypes
import hashlib
import json
import os
import statistics
import struct
import sys
import time
from multiprocessing import Pool

CFT_OK = 0
MAGIC = 0x50544643


class RunArgs(ctypes.Structure):
    _fields_ = [("struct_size", ctypes.c_size_t),
                ("a", ctypes.c_void_p), ("b", ctypes.c_void_p), ("c", ctypes.c_void_p),
                ("n", ctypes.c_size_t),
                ("bank", ctypes.c_void_p), ("bank_bytes", ctypes.c_size_t),
                ("scratch_in", ctypes.c_void_p), ("scratch_in_bytes", ctypes.c_size_t),
                ("scratch_out", ctypes.c_void_p), ("scratch_out_bytes", ctypes.c_size_t),
                ("deposits", ctypes.c_void_p),
                ("counts", ctypes.POINTER(ctypes.c_uint32)),
                ("flags_out", ctypes.POINTER(ctypes.c_uint32)),
                ("bus_out", ctypes.POINTER(ctypes.c_uint32)),
                ("idx_a", ctypes.c_void_p), ("idx_b", ctypes.c_void_p), ("idx_c", ctypes.c_void_p),
                ("idx_a_src", ctypes.c_size_t), ("idx_b_src", ctypes.c_size_t), ("idx_c_src", ctypes.c_size_t),
                ("idx_scratch_in", ctypes.c_void_p), ("idx_scratch_src", ctypes.c_size_t),
                ("lane_mask", ctypes.c_void_p), ("lane_mask_bytes", ctypes.c_size_t)]


def load(libpath):
    lib = ctypes.CDLL(libpath)
    lib.cft_open.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.POINTER(ctypes.c_void_p)]
    lib.cft_open.restype = ctypes.c_int
    lib.cft_close.argtypes = [ctypes.c_void_p]
    lib.cft_program_load.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t,
                                     ctypes.POINTER(ctypes.c_void_p)]
    lib.cft_program_load.restype = ctypes.c_int
    lib.cft_program_free.argtypes = [ctypes.c_void_p]
    lib.cft_program_run_ex.argtypes = [ctypes.c_void_p, ctypes.POINTER(RunArgs)]
    lib.cft_program_run_ex.restype = ctypes.c_int
    lib.cft_strerror.argtypes = [ctypes.c_int]
    lib.cft_strerror.restype = ctypes.c_char_p
    lib.cft_last_error.restype = ctypes.c_char_p
    return lib


def fail(lib, what, st):
    raise SystemExit("%s: %s: %s" % (what, lib.cft_strerror(st).decode(),
                                     (lib.cft_last_error() or b"").decode()))


def header(image):
    magic, version, n_insns, n_consts, max_dep, prec, flags, sio = struct.unpack_from("<8I", image, 0)
    if magic != MAGIC:
        raise SystemExit("not a cft program image")
    return {"insns": n_insns, "consts": n_consts, "maxDeposits": max_dep, "precision": prec, "flags": flags}


class Runner:
    """One device, one loaded program, reusable buffers."""

    def __init__(self, libpath, device, image):
        self.lib = load(libpath)
        self.dev = ctypes.c_void_p()
        art = None if device == "sw" else device.encode()
        st = self.lib.cft_open(art, 0, ctypes.byref(self.dev))
        if st != CFT_OK:
            fail(self.lib, "cft_open", st)
        self.image = ctypes.create_string_buffer(image, len(image))
        self.prog = ctypes.c_void_p()
        st = self.lib.cft_program_load(self.dev, self.image, len(image), ctypes.byref(self.prog))
        if st != CFT_OK:
            fail(self.lib, "cft_program_load", st)

    def run(self, a, b, c, bank, n, D):
        dep = ctypes.create_string_buffer(n * D * 4)
        counts = (ctypes.c_uint32 * n)()
        flags = ctypes.c_uint32(0)
        bus = ctypes.c_uint32(0)
        A = RunArgs()
        A.struct_size = ctypes.sizeof(RunArgs)
        A.a = ctypes.cast(a, ctypes.c_void_p)
        A.b = ctypes.cast(b, ctypes.c_void_p) if b is not None else None
        A.c = ctypes.cast(c, ctypes.c_void_p) if c is not None else None
        A.n = n
        if bank is not None:
            A.bank = ctypes.cast(bank, ctypes.c_void_p)
            A.bank_bytes = ctypes.sizeof(bank)      # create_string_buffer(data, len) holds exactly len bytes
        A.deposits = ctypes.cast(dep, ctypes.c_void_p)
        A.counts = counts
        A.flags_out = ctypes.pointer(flags)
        A.bus_out = ctypes.pointer(bus)
        t0 = time.perf_counter()
        st = self.lib.cft_program_run_ex(self.prog, ctypes.byref(A))
        secs = time.perf_counter() - t0
        if st != CFT_OK:
            fail(self.lib, "cft_program_run_ex", st)
        return secs, dep.raw[:n * D * 4], list(counts), flags.value, bus.value

    def close(self):
        self.lib.cft_program_free(self.prog)
        self.lib.cft_close(self.dev)


def buf(data):
    return None if data is None else ctypes.create_string_buffer(data, len(data))


def part(data, lo, hi):
    return None if data is None else data[lo * 4:hi * 4]


def chunk_job(job):
    libpath, device, image, bank, a, b, c, n, D, lo, hi = job
    r = Runner(libpath, device, image)
    secs, dep, counts, flags, bus = r.run(buf(part(a, lo, hi)), buf(part(b, lo, hi)), buf(part(c, lo, hi)),
                                          buf(bank), hi - lo, D)
    r.close()
    return lo, secs, dep, counts, flags, bus


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lib", required=True)
    ap.add_argument("--device", default="sw")
    ap.add_argument("--dir", required=True)
    ap.add_argument("--cases", default="")
    ap.add_argument("--reps", type=int, default=5)
    ap.add_argument("--chunks", type=int, default=0)
    ap.add_argument("--procs", type=int, default=1)
    ap.add_argument("--write-expected", action="store_true")
    ap.add_argument("--whole", action="store_true", default=True)
    ap.add_argument("--no-whole", dest="whole", action="store_false")
    ap.add_argument("--jsonl", default="")
    a = ap.parse_args()

    names = [x for x in a.cases.split(",") if x] or sorted(
        f[:-5] for f in os.listdir(a.dir) if f.endswith(".cftp") and not f.startswith("."))
    names = [x[:-5] if x.endswith(".cftp") else x for x in names]
    log = open(a.jsonl, "a", encoding="utf-8") if a.jsonl else None
    bad = 0
    for name in names:
        p = lambda s: os.path.join(a.dir, name + s)
        image = open(p(".cftp"), "rb").read()
        opt_read = lambda s: open(p(s), "rb").read() if os.path.exists(p(s)) else None
        bank = opt_read(".bank")                   # absent for an image that carries its constants
        sa, sb, sc = open(p(".a.bin"), "rb").read(), opt_read(".b.bin"), opt_read(".c.bin")
        h = header(image)
        n, D = len(sa) // 4, h["maxDeposits"]
        want = open(p(".deposits.bin"), "rb").read() if os.path.exists(p(".deposits.bin")) else None
        rec = {"case": name, "device": a.device, "lanes": n, "words": h["insns"], "maxDeposits": D,
               "headerFlags": h["flags"], "time": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
        problems = []
        whole_sha = None
        if a.whole:
            r = Runner(a.lib, a.device, image)
            A_, B_, C_, K_ = buf(sa), buf(sb), buf(sc), buf(bank)
            times, first = [], None
            for rep in range(max(1, a.reps)):
                secs, dep, counts, flags, bus = r.run(A_, B_, C_, K_, n, D)
                times.append(secs)
                if first is None:
                    first = (dep, counts, flags, bus)
                elif dep != first[0] or flags != first[2] or bus != first[3]:
                    problems.append("rep %d differs from rep 0" % rep)
            r.close()
            dep, counts, flags, bus = first
            whole_sha = hashlib.sha256(dep).hexdigest()
            steady = statistics.median(times[1:]) if len(times) > 1 else times[0]
            rec.update({"firstRunSeconds": round(times[0], 6), "medianSeconds": round(steady, 6),
                        "microsecondsPerLane": round(steady / n * 1e6, 5),
                        "lanesPerSecond": round(n / steady, 1), "reps": len(times),
                        "depositSha256": whole_sha, "flags": flags, "status": bus})
            if bus:
                problems.append("status 0x%08x" % bus)
            if any(x != D for x in counts):
                problems.append("counts not all %d" % D)
            if want is not None:
                rec["expected"] = "file"
                if dep != want:
                    problems.append("deposits differ from the expected buffer")
                    for i in range(0, min(len(dep), len(want)), 4):
                        if dep[i:i + 4] != want[i:i + 4]:
                            lane, d = divmod(i // 4, D)
                            rec["first"] = {"lane": lane, "deposit": d, "want": want[i:i + 4][::-1].hex(),
                                            "got": dep[i:i + 4][::-1].hex()}
                            break
            elif a.write_expected:
                open(p(".deposits.bin"), "wb").write(dep)
                rec["expected"] = "written by this run"
                want = dep
        if a.chunks > 1:
            bounds = [(n * k // a.chunks, n * (k + 1) // a.chunks) for k in range(a.chunks)]
            jobs = [(a.lib, a.device, image, bank, sa, sb, sc, n, D, lo, hi) for lo, hi in bounds if hi > lo]
            t0 = time.perf_counter()
            if a.procs > 1:
                with Pool(a.procs) as pool:
                    parts = pool.map(chunk_job, jobs)
            else:
                parts = [chunk_job(j) for j in jobs]
            wall = time.perf_counter() - t0
            parts.sort(key=lambda x: x[0])
            cdep = b"".join(x[2] for x in parts)
            cflags = 0
            for x in parts:
                cflags |= x[4]
            csha = hashlib.sha256(cdep).hexdigest()
            rec.update({"chunks": len(parts), "procs": a.procs, "chunkWallSeconds": round(wall, 3),
                        "chunkRunSeconds": round(sum(x[1] for x in parts), 3), "chunkSha256": csha,
                        "chunkFlags": cflags})
            if any(x[5] for x in parts):
                problems.append("a chunk's status was non-zero")
            if whole_sha is not None and csha != whole_sha:
                problems.append("the chunked deposits differ from the whole run's")
            if whole_sha is not None and cflags != rec["flags"]:
                problems.append("the chunks' flags 0x%x differ from the whole run's 0x%x" % (cflags, rec["flags"]))
            if want is not None and cdep != want:
                problems.append("the chunked deposits differ from the expected buffer")
            if want is None and a.write_expected:
                open(p(".deposits.bin"), "wb").write(cdep)
                rec["expected"] = "written from the chunks"
        rec["verdict"] = "MATCH" if not problems else "MISMATCH"
        if problems:
            rec["problems"] = problems
            bad += 1
        line = "%-30s %-8s lanes %8d  words %5d" % (name, rec["verdict"], n, h["insns"])
        if "microsecondsPerLane" in rec:
            line += "  first %.3f s  median %.3f s  %9.2f us/lane  %11.0f lanes/s" % (
                rec["firstRunSeconds"], rec["medianSeconds"], rec["microsecondsPerLane"], rec["lanesPerSecond"])
        if "chunks" in rec:
            line += "  | %d chunks in %d procs %.1f s" % (rec["chunks"], rec["procs"], rec["chunkWallSeconds"])
        if problems:
            line += "  [" + "; ".join(problems) + "]"
        print(line, flush=True)
        if log:
            log.write(json.dumps(rec) + "\n")
            log.flush()
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
