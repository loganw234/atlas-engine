# What closes the gaps, measured: the second round of asks

2026-09-08, the third session on the emitter target. The corpus stands
at sixty-eight of sixty-nine positives lowering to cft-fp256 sequencer
programs and thirty-eight fitting the tile at revision 2, every one of
the thirty-eight bit-identical to its emitted text five ways
(`docs/CFT-POSITIVE.md`). This file is about the other thirty: what
stops each one, how much of that the engine can remove on its own, and
what remains for the coprocessor - stated as three asks with the
measurement behind each, the way the first three (thirty-two
registers, a 4,096-word image, the bank as run data) were asked and
built the same day.

Every number here is from one command over the scheduled programs:

```bash
node tools/measure-cft-gaps.mjs            # writes build/cft/gaps.json
node tools/emit-cft.mjs --all              # the corpus table it starts from
```

`core/cft-lower.mjs` now returns the graph it scheduled beside the
program - the ops after dead-code elimination with their operands, the
order the registers were allocated over, the loop geometry, and the det
function each op was inlined from - and the tool reads that rather than
the encoding. Four measurements:

- **Hoisting.** A value that depends on nothing per-sample - only on
  the levers, the clock and the program's constants - is the same on
  every lane and in every iteration. Moved into the bank it needs no
  register, since an operand can name a constant. The peak register
  count is re-profiled over the same schedule with every such value
  removed (an upper bound on what a re-schedule would reach). Only the
  FRONTIER of that sub-graph - a per-run value some per-sample op reads
  - needs a bank slot; the rest is computed once, off the tile, and
  never reaches it. The clock-dependent share is counted apart, because
  `uT` is per sample when the darkroom's shutter is open.
- **`CALL`.** Every det function is inlined at each use. The words a
  `CALL` would save are counted per function as the copies beyond the
  first, less one call word and one move per parameter and result at
  each site, over the ops that would stay on the tile after hoisting.
- **Break as `SETACT`.** A loop with a `break` carries a running flag
  and every write in its body is selected against it. Were a lane that
  left the loop simply inactive, those words would go; and the loop's
  early exit becomes real. The trips are measured by the reference
  interpreter over a block of 128 samples at the lever defaults - a
  frame's own points, as the verifier draws them - per loop invocation,
  with a block's cost as the trips of its slowest lane, against the
  literal bound the tile runs today.
- **Nesting.** Whether a loop with a break sits inside another loop,
  because `SETACT` alone cannot express that: a lane it turns off stays
  off until `ACTALL`, and `ACTALL` is illegal inside a loop.

## Registers

Thirty positives exceed thirty-two registers as scheduled, from 33 to
212. With every per-run value in the bank:

| positive | registers | after hoisting | per-run values | of them bank slots | words hoisted in loops |
|---|---|---|---|---|---|
| `throughput` | 212 | **183** | 2,223 | 148 | 0 |
| `vlsi` | 149 | **134** | 1,320 | 53 | 44 |
| `rule30` | 133 | **128** | 742 | 93 | 94 |
| `threebody` | 104 | **102** | 195 | 25 | 44 |
| `universal` | 95 | **91** | 782 | 37 | 90 |
| `rulespace` | 68 | **63** | 522 | 14 | 2 |
| `elliptic` | 58 | **47** | 228 | 29 | 2 |
| `billiards` | 64 | **46** | 514 | 47 | 198 |
| `flows` | 59 | **45** | 205 | 22 | 106 |
| `starfield` | 46 | **45** | 905 | 55 | 0 |
| `e8` | 45 | **43** | 66 | 8 | 0 |
| `diffract` | 64 | **41** | 1,993 | 61 | 52 |
| `domain` | 38 | **38** | 130 | 7 | 0 |
| `stoch` | 45 | **38** | 145 | 20 | 74 |
| `ford` | 47 | **37** | 913 | 21 | 1 |
| `mirage` | 48 | **37** | 871 | 43 | 67 |
| `hilbert` | 40 | **36** | 740 | 28 | 100 |
| `rainbow` | 38 | **36** | 518 | 31 | 0 |
| `cascade` | 41 | **35** | 391 | 13 | 6 |
| `breakdown` | 37 | **34** | 229 | 21 | 31 |
| `drainage` | 37 | **34** | 158 | 17 | 33 |
| `tangle` | 37 | **34** | 26 | 6 | 1 |
| `wavecat` | 49 | **34** | 1,544 | 59 | 50 |
| `tpms` | 40 | **32** | 141 | 14 | 0 |
| `vortex` | 45 | **32** | 331 | 57 | 81 |
| `allpaths` | 45 | **31** | 380 | 24 | 6 |
| `critical` | 37 | **31** | 122 | 12 | 55 |
| `dissipation` | 36 | **31** | 154 | 15 | 72 |
| `nodal` | 37 | **29** | 284 | 20 | 59 |
| `conoscope` | 33 | **27** | 757 | 45 | 0 |

30 positives exceed thirty-two registers as scheduled; **23 still do with every per-run value in the bank** (18 of them at 64 or fewer, 5 above 64: throughput 183, vlsi 134, rule30 128, threebody 102, universal 91).

The five above sixty-four are the plates that carry large state
through a loop - `rule30` and `universal` a cellular row, `threebody`
three bodies' positions and velocities, `vlsi` and `throughput` many
independent chains of `det_*` calls whose results are all wanted at
the end. Those are live values, not scheduling slack: the schedule is
the best of nine list and depth-first orders plus local moves
(`docs/CFT-POSITIVE.md`, "The scheduler"), and hoisting takes what it
can. What is left is the register wall.

### Ask 1. A per-lane spill memory: load and store by slot

A lane needs somewhere to put a value it will read later without
holding a register for it. The demand, once the per-run values are in
the bank:

| positive | live values after hoisting | beyond thirty-two registers |
|---|---|---|
| `throughput` | 183 | 151 |
| `vlsi` | 134 | 102 |
| `rule30` | 128 | 96 |
| `threebody` | 102 | 70 |
| `universal` | 91 | 59 |
| `rulespace` | 63 | 31 |
| `elliptic` | 47 | 15 |
| `billiards` | 46 | 14 |
| `flows` | 45 | 13 |
| `starfield` | 45 | 13 |
| `e8` | 43 | 11 |
| `diffract` | 41 | 9 |
| `domain` | 38 | 6 |
| `stoch` | 38 | 6 |
| `ford` | 37 | 5 |
| `mirage` | 37 | 5 |
| `hilbert` | 36 | 4 |
| `rainbow` | 36 | 4 |
| `cascade` | 35 | 3 |
| `breakdown` | 34 | 2 |
| `drainage` | 34 | 2 |
| `tangle` | 34 | 2 |
| `wavecat` | 34 | 2 |

A spill memory of 32 slots a lane reaches 18 of the 23, 64 slots 19,
128 slots 22, 256 slots all 23; sixty-four registers alone would reach
18 and leave the five that matter most.

The shape asked for, in the terms of `docs/SEQUENCER.md`:

- Two instructions, `STL ra, slot` and `LDL rd, slot`, with the slot in
  `imm[23:0]` - which every ALU instruction reserves as zero unless `kx`
  is set - so the encoding costs nothing that is not already there.
  And an indexed pair, `STX ra, rb` and `LDX rd, rb`, with the slot in a
  register's low bits: that is what `nested`'s `precise float wts[28]`
  needs, an array local written and read under loop counters, the one
  construct in the corpus still refused by name.
- A store is a register write for P3's purposes: masked by the lane's
  active bit, so an all-inactive loop body stays a no-op. A load is a
  read. Neither is arithmetic, so P1 holds as it did for `IMUL`.
- The depth is a build parameter published in `CAPS` as `MAXD` and
  `IMEM_D` are, and `cft_program_load` refuses a slot past it by name.
  The table above is the sizing: 256 closes the corpus; 128 all but
  `throughput`.

One route reuses what exists. The deposit buffer already is per-lane,
index-addressed and sized `max_deposits * LATENCY beats * 32 bytes`;
the orbits and Collatz workloads asked on 2026-09-04 for "a way to
load registers from the deposit buffer". An indexed `DEPOSIT` and a
`LOAD` from the lane's own window would be that ask and this one in one
mechanism, with the spill slots declared beyond the program's real
deposits in the header. A separate scratch is cleaner for the host,
which then never sees a spill; the choice is the tile's.

With it, the engine writes a spiller: the values live longest, and
the loop-carried state read least often, go to slots, and the
allocator keeps the thirty-two registers for the values in flight.
Spill code is words - the count is bounded by the demand above times
two, a store and a load each - which is one reason Ask 2 is sized as
it is.

## Words

Six positives exceed 4,096 words. What the engine can take out of each
- the per-run values, the running flags and their selects - and what
`CALL` would:

| positive | words | per-run values | flag and selects | CALL would save | left with all three | left without CALL |
|---|---|---|---|---|---|---|
| `throughput` | 12,618 | -2,223 | -0 | -2,065 | **8,330** | 10,395 |
| `vlsi` | 8,693 | -1,320 | -86 | -1,664 | **5,623** | 7,287 |
| `starfield` | 5,413 | -905 | -0 | -2,650 | **1,858** | 4,508 |
| `diffract` | 4,276 | -1,993 | -14 | -1,178 | **1,091** | 2,269 |
| `rule30` | 4,221 | -742 | -257 | -574 | **2,648** | 3,222 |
| `wavecat` | 4,159 | -1,544 | -22 | -1,314 | **1,279** | 2,593 |

Across the sixty-three, the inlined copies beyond a function's first cost 41,435 words, the per-run values 23,661, the running flags and their selects 2,143, and the copies into and out of the loops' carried registers 1,958.

So the engine side brings three of the six under the image on its own
(`wavecat`, `rule30`, `diffract`); `starfield` needs `CALL` or a bigger
image; `vlsi` and `throughput` are over 4,096 either way, and the spill
traffic of Ask 1 will add to them.

### Ask 2. The image to 16,384 words

`IMEM_D` is a build parameter the contract does not fix, published in
`CAPS[23:20]` as log2 and refused at the header when exceeded; revision
2 took it from 1,024 to 4,096 and the deeper memory "landed in an
UltraRAM the tile was not using" (`docs/ATLAS.md`, item 4). 16,384 is
four of them, and it holds every positive as it lowers today - the
largest is 12,618 - with room for spills. 8,192 would hold all but
`throughput`.

`CALL` is measured rather than asked: 41,435 words of inlined copies
across the corpus, 2,065 of them in `throughput`, which it would still
leave at 8,330. It halves most images and does not decide any
positive's fit once the image is 16,384, so it stays where
`docs/ATLAS.md` put it - optional, with its number known.

## The bank

`kx` addresses 256 constants and the tile stores `KMEM_D = 256`. The
fit check did not know this until today; `throughput`, with 307 program
constants and the nine-slot tail, does not load whatever its registers
and words say, and `vlsi`, at 256 plus the tail, does not either. With
the per-run frontier of Ask 1's hoisting in the bank as well:

| positive | bank as emitted | with the per-run frontier | of it the clock's |
|---|---|---|---|
| `throughput` | 316 | **464** | 0 |
| `vlsi` | 265 | **318** | 0 |
| `wavecat` | 177 | **236** | 2 |
| `rule30` | 135 | **228** | 0 |
| `starfield` | 159 | **214** | 3 |
| `diffract` | 143 | **204** | 2 |

### Ask 3. The bank to 512: a ninth index bit

`imm[31:28]` is reserved-must-be-zero on every ALU form and holds
nothing under `kx`. Three of those bits - `imm[28]`, `imm[29]`,
`imm[30]` - as the ninth bits of the three constant indices make the
addressable bank 512, the same construction as R1's fifth register bits
in `imm[27:24]`, and `KMEM_D` follows as a build parameter `CAPS[27:24]`
already publishes. An old loader refuses the set bit as it refused
`kx`'s and the register bits', so the version guard is the reserved-bit
rule again. Storage: one more 8 KiB at fp32's element width, shared by
every lane, since the bank is the tile's and not the lane's.

Two positives need it; both are the largest in the corpus, and
without it neither runs on any tile at any register count.

## The loops

Forty-eight positives reach a loop at the defaults. What the tile runs
today - every trip of the literal bound, for every lane, the lanes that
left holding their values by selection - against what a block would run
with the early exit real:

| positive | loops | with a break | of them nested | literal trips a block runs | trips the slowest lane needs | ratio |
|---|---|---|---|---|---|---|
| `stoch` | 5 | 5 | 0 | 200, 200, 200, 200, 200 | 2, 0, 0, 0, 0 | **2455.17** |
| `relativity` | 1 | 1 | 0 | 1,440 | 1 | **1440** |
| `mirage` | 3 | 3 | 0 | 240, 240, 200 | 1, 0, 0 | **563.23** |
| `rule30` | 9 | 6 | 3 | 17, 16, 16, 48, 16, 131,072, 32, 3, 16 | 9, 16, 16, 2, 1, 256, 32, 3, 16 | **511.96** |
| `cursum` | 1 | 1 | 0 | 768 | 2 | **384** |
| `primes` | 2 | 2 | 0 | 159, 159 | 1, 0 | **318** |
| `buddha` | 2 | 2 | 0 | 400, 400 | 3, 0 | **308.94** |
| `collatz` | 2 | 2 | 0 | 220, 32 | 1, 0 | **253.86** |
| `universal` | 8 | 7 | 1 | 15, 16, 16, 48, 14, 1,048,576, 14, 14 | 10, 2, 2, 7, 14, 16,321, 14, 14 | **64.1** |
| `newton` | 3 | 3 | 0 | 80, 80, 80 | 7, 0, 0 | **35.66** |
| `mand` | 1 | 1 | 0 | 120 | 4 | **30** |
| `gibbs` | 1 | 1 | 0 | 64 | 3 | **21.33** |
| `zeta` | 1 | 1 | 0 | 64 | 3 | **21.33** |
| `elliptic` | 6 | 4 | 0 | 131, 9, 12, 8, 8, 49 | 13, 9, 0, 0, 0, 0 | **16.3** |
| `wavecat` | 2 | 1 | 0 | 256, 24 | 0, 24 | **15.61** |
| `wpath` | 1 | 1 | 0 | 24 | 2 | **12** |
| `ford` | 2 | 2 | 0 | 14, 24 | 7, 0 | **4.72** |
| `rulespace` | 11 | 5 | 1 | 9, 16, 16, 16, 16, 16, 16, 512, 8, 16, 16 | 8, 16, 16, 16, 16, 2, 1, 127, 8, 16, 16 | **4.06** |
| `flows` | 1 | 1 | 0 | 3,040 | 1,129 | **2.69** |
| `critical` | 2 | 2 | 1 | 22, 6 | 14, 6 | **2.27** |
| `nodal` | 3 | 3 | 1 | 4, 24, 24 | 4, 13, 13 | **2.27** |
| `hyper` | 2 | 2 | 0 | 8, 24 | 1, 12 | **2.23** |
| `vortex` | 3 | 0 | 0 | 31, 31, 31 | 0, 0, 31 | **2.19** |
| `cascade` | 3 | 3 | 1 | 12, 12, 12 | 10, 8, 10 | **2.04** |
| `penrose` | 1 | 1 | 0 | 12 | 6 | **2** |
| `stdmap` | 1 | 1 | 0 | 400 | 221 | **1.81** |
| `kleinian` | 1 | 1 | 0 | 40 | 23 | **1.74** |
| `rmt` | 1 | 1 | 0 | 100 | 61 | **1.64** |
| `jong` | 1 | 1 | 0 | 24 | 15 | **1.6** |
| `threebody` | 1 | 1 | 0 | 2,560 | 1,601 | **1.6** |
| `arnold` | 3 | 2 | 0 | 64, 336, 8 | 64, 201, 2 | **1.54** |
| `lyap` | 2 | 1 | 0 | 40, 384 | 40, 251 | **1.5** |
| `wave` | 1 | 1 | 0 | 6 | 4 | **1.5** |
| `billiards` | 1 | 1 | 0 | 40 | 27 | **1.48** |
| `ifs` | 1 | 1 | 0 | 28 | 19 | **1.47** |
| `invjulia` | 1 | 1 | 0 | 60 | 41 | **1.46** |
| `bulb` | 1 | 1 | 0 | 16 | 11 | **1.45** |
| `bifurc` | 2 | 2 | 0 | 500, 60 | 301, 60 | **1.43** |
| `breakdown` | 2 | 2 | 0 | 24, 22 | 24, 12 | **1.38** |
| `dissipation` | 1 | 1 | 0 | 22 | 16 | **1.38** |
| `hilbert` | 10 | 4 | 0 | 18, 18, 8, 8, 8, 8, 8, 8, 21, 21 | 13, 13, 8, 8, 8, 8, 8, 8, 10, 10 | **1.35** |
| `qjulia` | 1 | 1 | 0 | 16 | 12 | **1.33** |
| `drainage` | 2 | 2 | 0 | 24, 22 | 24, 15 | **1.22** |
| `tangle` | 1 | 1 | 0 | 6 | 5 | **1.2** |
| `orbital` | 2 | 2 | 0 | 9, 2 | 8, 1 | **1.19** |
| `vlsi` | 4 | 4 | 0 | 5, 14, 4, 4 | 0, 14, 2, 4 | **1.07** |
| `allpaths` | 1 | 0 | 0 | 320 | 320 | **1** |
| `e8` | 3 | 3 | 0 | 7, 25, 7 | 7, 25, 7 | **1** |

48 positives with loops reached at the defaults; the ratio's median is 2.04, 25 are at two or more and 16 at ten or more. 6 positives have a break inside a nested loop: cascade, critical, nodal, rule30, rulespace, universal.

This is not an ask. `SETACT` and the early exit exist, and for a loop
at the top level - forty-two of the forty-eight - the engine can use
them today: `SETACT` on the break's condition where the break is, the
loop's `ENDREP` reached only by the lanes still running, `ACTALL`
after it, which is legal at the top level. The running flag and its
selects go with it. The engine will do this next; the table is the
reason. The literal bounds the emitter writes are generous by design -
`universal`'s 1,048,576 against 16,321 needed, `rule30`'s 131,072
against 256, `relativity`'s 1,440 against 1 at these defaults - and a
tile that runs them out is a tile spending its time on no-ops.

What `SETACT` cannot reach is a break inside a nested loop - six
positives, `cascade`, `critical`, `nodal`, `rule30`, `rulespace`,
`universal` - because a lane it turns off stays off past the inner
loop's end, and `ACTALL` is illegal there. Those inner loops keep the
selected form. Their bounds are 6 to 32 and the waste is bounded with
them, which is why "the active mask saved at `REPEAT` and restored at
`ENDREP`" is recorded here as measured and not asked: it would let the
inner loops exit early too, P3 intact since the restore is where the
loop closes whether or not the exit fired, and it is worth a fraction
of the work on six positives.

## What the engine side does next, in order

1. **Integer division by a literal - done this session.** The five
   plates that divide lower; `polytope` fits and is verified five ways;
   the other four are register-bound (`docs/CFT-POSITIVE.md`, "Integer
   division, by a literal").
2. **Break as `SETACT` at the top level**, as above.
3. **Hoisting**: the per-run frontier into the bank, computed per run
   from the same text by the reference interpreter or by an init
   program on libcft's software backend - either way held to the other,
   and the digest still names image and bank together. Thirty over the
   registers become twenty-three; 23,661 words leave the programs.
4. **Copy coalescing**: the 1,958 copies into and out of the loops'
   carried registers, most of which can be the register itself.
5. Then Asks 1 to 3 as they land, the spiller with Ask 1, and the parity
   harness - the GPU's per-sample records against the tile's - behind
   them.

## Not asked, measured

- `CALL`: 41,435 words across the corpus; decides no fit at 16,384.
- The active mask scoped to the loop: six positives' inner loops, bounds
  6 to 32.
- A per-sample clock: the frontier's clock-dependent share is 0 to 3
  slots per positive here, so when the shutter is open those few values
  go back to being computed on the tile, and nothing else moves.
