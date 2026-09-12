// The cft-fp256 sequencer's instruction set, as this repository needs
// to speak it - at REVISION 3 of the contract (2026-09-08 evening),
// with revision 4's R8 (2026-09-10).
//
// Every number here is read out of the coprocessor's golden model -
// python/cft_golden/softfloat.py for the opcodes and the rounding
// ladder, python/cft_golden/seq.py and asm.py for the encoding and the
// control codes - and docs/SEQUENCER.md is the prose, its "Revision 2
// (2026-09-08)" section the changes. Nothing is invented on this side;
// where a value could have been guessed it is instead spelled with the
// model's own line beside it, because a wrong opcode number computes a
// different operation and says nothing about it.
//
// WHAT REVISION 2 CHANGED, and what this file does about each:
//
//   R1  Thirty-two registers a lane. A register field is five bits: the
//       low four in the operand field where they always were, the fifth
//       in imm[27:24] - imm[24] for rd, [25] ra, [26] rb, [27] rc. An
//       operand whose k bit is set names a constant, so its high bit is
//       not read and must be zero; REPEAT reads imm whole as its trip
//       count and names no register. encode() splits a register number
//       for the caller, exactly as seq.encode does.
//   R2  4,096 instructions a tile, published in CAPS[23:20].
//   R3  The header's first reserved word is `flags`; bit 0, BANK_EXT,
//       says the image carries NO constant section and every run brings
//       the bank - n_consts format-width values, dense, in index order.
//       imageBytes() writes either form; bankBytes() writes the bank.
//
// WHAT REVISION 3 CHANGED. It is this repository's second round of asks
// (docs/CFT-GAPS.md, 2026-09-08), built the same evening, plus one
// mechanism that round added on its own:
//
//   R4  A PER-LANE SCRATCH MEMORY, SCRATCH_D = 256 slots, four control
//       codes: STL/LDL by static slot in imm[23:0], STX/LDX by the low
//       log2(SCRATCH_D) bits of a register's bit pattern. A store is a
//       register write for P3's purposes - masked by the lane's active
//       bit - and a load writes rd, so it is masked too; neither is
//       arithmetic. This is what a value too many spills into, and what
//       an array local indexed at run time lives in.
//   R5  THE SCRATCH AS A PER-RUN BLOCK. The header's second reserved
//       word becomes `scratch_io`, [15:0] slots preloaded into every
//       lane and [31:16] read back, behind flags bit 1. Not asked for
//       and not used here yet: this target's per-run data is uniform
//       across lanes, which is what the bank is for. Recorded because
//       imageBytes() must write the word and the flag.
//   R6  16,384 instructions (CAPS[23:20] reads 14).
//   R7  A NINTH CONSTANT-INDEX BIT: under kx, imm[28], imm[29] and
//       imm[30] are the ninth bits of ka's, kb's and kc's indices, so
//       the bank reaches 512. imm[31] stays reserved-must-be-zero.
//   R8  (revision 4, 2026-09-10, golden model first) flags bit 2,
//       SCRATCH_STRICT: an INDEXED access at or past SCRATCH_D is
//       reported in STATUS bit 5 rather than reduced modulo the depth.
//       Every image this repository writes that touches the scratch
//       sets it, because a program whose answer depends on the tile's
//       scratch depth is exactly what this project does not ship.
//
// The two extensions of 2026-09-07 - kx (instruction bit 30, 8-bit
// constant indices in imm[23:0], a 256-entry bank) and IMUL (opcode 30,
// the low 32 bits of the product of the low 32 bits) - are published in
// CAPS[4] and CAPS[28]; the registers in CAPS[5], the bank in CAPS[6],
// the ninth index bit in CAPS[7], and the scratch and its I/O in
// CAPS2[4] and CAPS2[5]. A host asks before it loads, and
// cft_program_load refuses by name.

// ---- opcodes (softfloat.py:641-670) ---------------------------------
export const OP = {
  FMA: 0, ADD: 1, SUB: 2, MUL: 3,
  ABS: 4, NEG: 5, COPYSIGN: 6,
  MIN: 7, MAX: 8, MINNUM: 9, MAXNUM: 10,
  SELECT: 11, CMPLT: 12, CMPLE: 13, CMPEQ: 14,
  IAND: 16, IOR: 17, IXOR: 18, IADD: 19,
  ISUB: 20, ISHL: 21, ISHR: 22, ICMPLT: 23,
  RECIP_SEED: 26, RSQRT_SEED: 27,
  // 2026-09-07, OPT-D 1.2; CAPS[28]
  IMUL: 30,
};
export const OP_NAME = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k.toLowerCase()]));
export const EXT_OPS = new Set([OP.IMUL]);

/** Which operand fields each opcode actually reads, in the order the
 *  model's `steer` and SIMPLE_IMPL take them. ADD and SUB are the ones
 *  worth noticing: softfloat.steer() sends them through the FMA as
 *  (a, 1.0, +-c), so they read ra and rc and NOT rb - which is also
 *  how python/cft_golden/seqprogs.py and the .cfta text form write
 *  them. */
export const READS = {
  [OP.FMA]: ["a", "b", "c"],
  [OP.ADD]: ["a", "c"],
  [OP.SUB]: ["a", "c"],
  [OP.MUL]: ["a", "b"],
  [OP.ABS]: ["a"], [OP.NEG]: ["a"], [OP.COPYSIGN]: ["a", "b"],
  [OP.MIN]: ["a", "b"], [OP.MAX]: ["a", "b"],
  [OP.MINNUM]: ["a", "b"], [OP.MAXNUM]: ["a", "b"],
  [OP.SELECT]: ["a", "b", "c"],
  [OP.CMPLT]: ["a", "b"], [OP.CMPLE]: ["a", "b"], [OP.CMPEQ]: ["a", "b"],
  [OP.IAND]: ["a", "b"], [OP.IOR]: ["a", "b"], [OP.IXOR]: ["a", "b"],
  [OP.IADD]: ["a", "b"], [OP.ISUB]: ["a", "b"],
  [OP.ISHL]: ["a", "b"], [OP.ISHR]: ["a", "b"], [OP.ICMPLT]: ["a", "b"],
  [OP.RECIP_SEED]: ["a"], [OP.RSQRT_SEED]: ["a"],
  [OP.IMUL]: ["a", "b"],
};

/** The opcodes that round. Everything else ignores the attribute
 *  entirely (softfloat.compute: "everything else is a direct function
 *  of the operand bits"). */
export const ROUNDS = new Set([OP.FMA, OP.ADD, OP.SUB, OP.MUL]);

// ---- rounding attributes (softfloat.py:64-68) ------------------------
export const RND = { RNE: 0, RTZ: 1, RDN: 2, RUP: 3, RMM: 4 };
export const RND_NAME = { 0: "rne", 1: "rtz", 2: "rdn", 3: "rup", 4: "rmm" };

// ---- control codes (seq.py:143) --------------------------------------
export const CTRL = {
  HALT: 0, REPEAT: 1, ENDREP: 2, DEPOSIT: 3, SETACT: 4, ACTALL: 5,
  // revision 3's R4, the per-lane scratch
  STL: 6, LDL: 7, STX: 8, LDX: 9,
};
export const CTRL_NAME = Object.fromEntries(
  Object.entries(CTRL).map(([k, v]) => [v, k.toLowerCase()]));
/** The four that touch the scratch, and which register field each
 *  reads or writes - seq.py's IMM_ALLOWED in this file's terms. */
export const SCRATCH_CODES = new Set([CTRL.STL, CTRL.LDL, CTRL.STX, CTRL.LDX]);
export const SCRATCH_FIELDS = {
  [CTRL.STL]: { reads: ["ra"], writes: null, slot: "imm" },
  [CTRL.LDL]: { reads: [], writes: "rd", slot: "imm" },
  [CTRL.STX]: { reads: ["ra", "rb"], writes: null, slot: "rb" },
  [CTRL.LDX]: { reads: ["rb"], writes: "rd", slot: "rb" },
};

// ---- capacities ------------------------------------------------------
// Build parameters of cft_seq, not part of the program model
// (docs/SEQUENCER.md, "A tile also has three capacities"), published in
// CAPS since 2026-09-07 so a host asks rather than guesses. They are
// here because a program that does not fit one of them is refused at
// the header, and an emitter that cannot see them finds that out on
// card day.
export const NREG = 32;          // registers per lane, revision 2 (CAPS[5])
export const NREG_REV1 = 16;     // what a lane had before, and what a program under 16 needs
export const KREG = 16;          // addressable constants without kx
export const KMEM_D = 512;       // constants the header may declare, revision 3 (CAPS[27:24] reads 9)
export const KMEM_D_REV2 = 256;  // kx's ceiling before the ninth index bit; CAPS[7] is the guard
export const IMEM_D = 16384;     // instructions per image, revision 3 (CAPS[23:20] reads 14)
export const IMEM_D_REV2 = 4096; // what an image had at revision 2
export const SCRATCH_D = 256;    // scratch slots per lane, revision 3 (CAPS2[3:0] log2, CAPS2[4])
export const MAXD = 64;          // deposit slots per lane (rtl/cft_krnl.sv SEQ_MAXD)
export const MAX_LOOP_DEPTH = 4; // REPEATs nest four deep

export const MAGIC = 0x50544643n;   // "CFTP"
export const PROGRAM_VERSION = 1;    // the PROGRAM version; the CSR VERSION is another thing
export const FLAG_BANK_EXT = 1;      // header flags bit 0: the constants arrive per run
export const FLAG_SCRATCH_IO = 2;    // bit 1: the header's second word is scratch_io (R5)
export const FLAG_SCRATCH_STRICT = 4; // bit 2: an indexed slot past the depth is REPORTED (R8)
export const REG_HI_SHIFT = { rd: 24, ra: 25, rb: 26, rc: 27 };
/** Under kx, the ninth bit of each operand's constant index
 *  (seq.py KX9_SHIFT). imm[31] stays reserved-must-be-zero. */
export const KX9_SHIFT = { ra: 28, rb: 29, rc: 30 };

/** The three constant indices packed into one immediate, and back -
 *  the byte at 0, 8, 16 and the ninth bit at KX9_SHIFT. One place, so
 *  the encoder, the disassembler and the .cfta writer cannot disagree
 *  about where a 400th constant lives. */
export function packKx(ia = 0, ib = 0, ic = 0) {
  for (const [n, v] of [["a", ia], ["b", ib], ["c", ic]])
    if (!(Number.isInteger(v) && v >= 0 && v < KMEM_D))
      throw new Error(`cft-isa: constant index ${n}=${v} outside 0..${KMEM_D - 1}`);
  return ((ia & 0xff) | ((ib & 0xff) << 8) | ((ic & 0xff) << 16)
        | (((ia >> 8) & 1) << KX9_SHIFT.ra) | (((ib >> 8) & 1) << KX9_SHIFT.rb)
        | (((ic >> 8) & 1) << KX9_SHIFT.rc)) >>> 0;
}
export function unpackKx(imm) {
  return [(imm & 0xff) | (((imm >>> KX9_SHIFT.ra) & 1) << 8),
          ((imm >>> 8) & 0xff) | (((imm >>> KX9_SHIFT.rb) & 1) << 8),
          ((imm >>> 16) & 0xff) | (((imm >>> KX9_SHIFT.rc) & 1) << 8)];
}

// ---- encoding (seq.py encode/decode, revision 2) ---------------------

const B = (n) => BigInt(n);

/** One 64-bit instruction word, as a BigInt. Field checks mirror
 *  seq.encode()'s, including the ones the loader will repeat: a
 *  register is 0..31 and its fifth bit rides in imm[27:24]; a constant
 *  operand's register high bit is not read and is not set; REPEAT's imm
 *  is its trip count, whole. */
export function encode({ op, rd = 0, ra = 0, rb = 0, rc = 0, rnd = RND.RNE,
                         ka = false, kb = false, kc = false, kx = false,
                         ctrl = false, imm = 0 }) {
  for (const [n, v] of [["rd", rd], ["ra", ra], ["rb", rb], ["rc", rc]])
    if (!(Number.isInteger(v) && v >= 0 && v < NREG))
      throw new Error(`cft-isa: ${n}=${v} outside 0..${NREG - 1}`);
  if (!(Number.isInteger(op) && op >= 0 && op < 256))
    throw new Error(`cft-isa: op=${op} does not fit the opcode byte`);
  if (!(rnd >= 0 && rnd <= 4)) throw new Error(`cft-isa: rnd=${rnd}`);
  if (!(Number.isInteger(imm) && imm >= 0 && imm < 2 ** 32)) throw new Error(`cft-isa: imm=${imm}`);
  const bit = (v, sh) => (v ? 1n : 0n) << B(sh);
  if (ctrl) {
    if (op === CTRL.REPEAT) {
      if (rd || ra || rb || rc || ka || kb || kc || kx)
        throw new Error("cft-isa: REPEAT names no register and no constant");
      return B(op) | bit(true, 31) | (B(imm) << 32n);
    }
    if (SCRATCH_CODES.has(op)) {
      // R4. STL/LDL carry the slot in imm[23:0]; STX/LDX take it from
      // rb and leave the immediate at zero. Every field the code does
      // not read must be zero, which is seq.py's IMM_ALLOWED read the
      // other way round.
      const f = SCRATCH_FIELDS[op];
      if (ka || kb || kc || kx) throw new Error(`cft-isa: ${CTRL_NAME[op]} names no constant`);
      if (rnd !== RND.RNE) throw new Error(`cft-isa: ${CTRL_NAME[op]} takes no rounding attribute`);
      if (rc) throw new Error(`cft-isa: ${CTRL_NAME[op]} does not read rc`);
      if (!f.writes && rd) throw new Error(`cft-isa: ${CTRL_NAME[op]} writes no register`);
      if (!f.reads.includes("ra") && ra) throw new Error(`cft-isa: ${CTRL_NAME[op]} does not read ra`);
      if (f.slot === "imm") {
        if (rb) throw new Error(`cft-isa: ${CTRL_NAME[op]} takes its slot from the immediate, not rb`);
        if (!(imm >= 0 && imm < SCRATCH_D))
          throw new Error(`cft-isa: scratch slot ${imm} outside 0..${SCRATCH_D - 1}`);
      } else if (imm) {
        throw new Error(`cft-isa: ${CTRL_NAME[op]} takes its slot from rb, so imm must be zero`);
      }
      const shi = (bit(rd >> 4, REG_HI_SHIFT.rd) | bit(ra >> 4, REG_HI_SHIFT.ra)
                 | bit(rb >> 4, REG_HI_SHIFT.rb));
      return B(op) | (B(rd & 15) << 8n) | (B(ra & 15) << 12n) | (B(rb & 15) << 16n)
           | bit(true, 31) | ((B(imm) | shi) << 32n);
    }
    if (rd || rb || rc || imm || ka || kb || kc || kx)
      throw new Error(`cft-isa: ${CTRL_NAME[op] ?? op} reads at most ra`);
    if (op !== CTRL.DEPOSIT && op !== CTRL.SETACT) {
      if (ra) throw new Error(`cft-isa: ${CTRL_NAME[op] ?? op} names no register`);
      return B(op) | bit(true, 31);
    }
    return B(op) | (B(ra & 15) << 12n) | bit(true, 31) | (bit(ra >> 4, REG_HI_SHIFT.ra) << 32n);
  }
  if (imm & 0x80000000) throw new Error("cft-isa: imm[31] is reserved");
  if (kx && (imm & 0x0F000000)) throw new Error("cft-isa: imm[27:24] are the register high bits, not indices");
  if (!kx && imm) throw new Error("cft-isa: an ALU instruction without kx has no immediate");
  for (const [k, r, n] of [[ka, ra, "ra"], [kb, rb, "rb"], [kc, rc, "rc"]]) {
    // R7: the ninth index bit is read only under kx for an operand
    // whose k flag is set. Set anywhere else it is an unread field and
    // the loader refuses the program, so refuse it here.
    if ((imm >>> KX9_SHIFT[n]) & 1) {
      if (!kx || !k)
        throw new Error(`cft-isa: imm[${KX9_SHIFT[n]}] is ${n}'s ninth constant-index bit, ` +
                        `read only under kx for a constant operand`);
    }
    if (!k) continue;
    // a constant operand: the 4-bit field is the index without kx and
    // zero under kx; the register high bit is not read and is not set
    if (kx && r) throw new Error(`cft-isa: ${n} names a constant through imm under kx, so its field must be zero`);
    if (!kx && r >= KREG) throw new Error(`cft-isa: constant index ${r} in ${n} needs kx`);
  }
  const hi = (bit(rd >> 4, REG_HI_SHIFT.rd) | (ka ? 0n : bit(ra >> 4, REG_HI_SHIFT.ra))
            | (kb ? 0n : bit(rb >> 4, REG_HI_SHIFT.rb)) | (kc ? 0n : bit(rc >> 4, REG_HI_SHIFT.rc)));
  return B(op) | (B(rd & 15) << 8n) | (B(ra & 15) << 12n) | (B(rb & 15) << 16n) | (B(rc & 15) << 20n)
       | (B(rnd) << 24n) | bit(ka, 27) | bit(kb, 28) | bit(kc, 29) | bit(kx, 30)
       | ((B(imm) | hi) << 32n);
}

/** The fields of a word. Registers come back as whole five-bit numbers
 *  where the field names a register; a constant operand's field comes
 *  back as it is (the index, or zero under kx); REPEAT's imm is its
 *  trip count. */
export function decode(word) {
  const w = BigInt(word);
  const n = (sh, mask) => Number((w >> B(sh)) & B(mask));
  const d = {
    op: n(0, 0xff), rd: n(8, 0xf), ra: n(12, 0xf), rb: n(16, 0xf), rc: n(20, 0xf),
    rnd: n(24, 0x7), ka: !!n(27, 1), kb: !!n(28, 1), kc: !!n(29, 1),
    kx: !!n(30, 1), ctrl: !!n(31, 1), imm: Number((w >> 32n) & 0xffffffffn),
  };
  const hi = (name) => ((d.imm >>> REG_HI_SHIFT[name]) & 1) << 4;
  if (d.ctrl) {
    if (d.op === CTRL.DEPOSIT || d.op === CTRL.SETACT) d.ra |= hi("ra");
    if (SCRATCH_CODES.has(d.op)) {
      const f = SCRATCH_FIELDS[d.op];
      if (f.writes) d.rd |= hi("rd");
      if (f.reads.includes("ra")) d.ra |= hi("ra");
      if (f.slot === "rb" || f.reads.includes("rb")) d.rb |= hi("rb");
      d.slot = f.slot === "imm" ? (d.imm & 0x00ffffff) : null;
    }
    return d;
  }
  d.rd |= hi("rd");
  if (!d.ka) d.ra |= hi("ra");
  if (!d.kb) d.rb |= hi("rb");
  if (!d.kc) d.rc |= hi("rc");
  return d;
}

/** A readable line for a decoded word, in the listing's spelling - the
 *  same spelling the .cfta text form uses for an instruction. */
export function disasm(d, kNames = null) {
  const kn = (i) => (kNames && kNames[i] !== undefined ? kNames[i] : `k${i}`);
  if (d.ctrl) {
    const name = CTRL_NAME[d.op] ?? `ctrl${d.op}`;
    if (d.op === CTRL.REPEAT) return `${name} ${d.imm}`;
    if (d.op === CTRL.DEPOSIT || d.op === CTRL.SETACT) return `${name} r${d.ra}`;
    if (d.op === CTRL.STL) return `${name} r${d.ra}, ${d.slot}`;
    if (d.op === CTRL.LDL) return `${name} r${d.rd}, ${d.slot}`;
    if (d.op === CTRL.STX) return `${name} r${d.ra}, r${d.rb}`;
    if (d.op === CTRL.LDX) return `${name} r${d.rd}, r${d.rb}`;
    return name;
  }
  const idx = d.kx ? unpackKx(d.imm) : [d.ra, d.rb, d.rc];
  const src = (which, i) => {
    const isK = which === "a" ? d.ka : which === "b" ? d.kb : d.kc;
    return isK ? kn(idx[i]) : `r${[d.ra, d.rb, d.rc][i]}`;
  };
  const reads = READS[d.op] ?? ["a", "b", "c"];
  const ops = reads.map((w) => src(w, { a: 0, b: 1, c: 2 }[w]));
  const name = OP_NAME[d.op] ?? `op${d.op}`;
  const rnd = ROUNDS.has(d.op) && d.rnd !== RND.RNE ? `.${RND_NAME[d.rnd]}` : "";
  return `${name}${rnd} r${d.rd}, ${ops.join(", ")}`;
}

// ---- the program image ----------------------------------------------

/** header (8 u32) + [n_consts format-width constants] + n_insns u64.
 *  Under `bankExt` the constant section is absent and `nConsts` says how
 *  many the run must bring; otherwise `consts` is written and counted. */
export function imageBytes({ insns, consts = [], maxDeposits, precisionCode, width = 32,
                             bankExt = false, nConsts = consts.length,
                             scratchStrict = false, scratchIn = 0, scratchOut = 0 }) {
  const bytesPerConst = width / 8;
  const scratchIo = !!(scratchIn || scratchOut);
  if (scratchIn > SCRATCH_D || scratchOut > SCRATCH_D)
    throw new Error(`cft-isa: scratch_io ${scratchIn}/${scratchOut} past the ${SCRATCH_D}-slot depth`);
  const stored = bankExt ? [] : consts;
  const buf = new ArrayBuffer(32 + stored.length * bytesPerConst + insns.length * 8);
  const dv = new DataView(buf);
  dv.setUint32(0, Number(MAGIC), true);
  dv.setUint32(4, PROGRAM_VERSION, true);
  dv.setUint32(8, insns.length, true);
  dv.setUint32(12, nConsts, true);
  dv.setUint32(16, maxDeposits, true);
  dv.setUint32(20, precisionCode, true);
  dv.setUint32(24, (bankExt ? FLAG_BANK_EXT : 0) | (scratchIo ? FLAG_SCRATCH_IO : 0)
                 | (scratchStrict ? FLAG_SCRATCH_STRICT : 0), true);
  // R5's scratch_io word, meaningful only behind the flag; zero
  // otherwise, which a revision-2 tile enforces and is the guard.
  dv.setUint32(28, scratchIo ? (((scratchOut & 0xffff) << 16) | (scratchIn & 0xffff)) >>> 0 : 0, true);
  let o = 32;
  for (const k of stored) { dv.setUint32(o, k >>> 0, true); o += bytesPerConst; }
  for (const w of insns) { dv.setBigUint64(o, BigInt(w), true); o += 8; }
  return new Uint8Array(buf);
}

/** The bank a BANK_EXT program's run brings: n_consts format-width
 *  values, dense, in index order - exactly an image's constant section
 *  laid out on its own. */
export function bankBytes(consts, width = 32) {
  const bytesPerConst = width / 8;
  const buf = new ArrayBuffer(consts.length * bytesPerConst);
  const dv = new DataView(buf);
  consts.forEach((k, i) => dv.setUint32(i * bytesPerConst, k >>> 0, true));
  return new Uint8Array(buf);
}
