// The cft-fp256 sequencer's instruction set, as this repository needs
// to speak it - at REVISION 2 of the contract (2026-09-08).
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
// The two extensions of 2026-09-07 - kx (instruction bit 30, 8-bit
// constant indices in imm[23:0], a 256-entry bank) and IMUL (opcode 30,
// the low 32 bits of the product of the low 32 bits) - are published in
// CAPS[4] and CAPS[28]; the registers in CAPS[5], the bank in CAPS[6].
// A host asks before it loads, and cft_program_load refuses by name.

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

// ---- control codes (seq.py:95) ---------------------------------------
export const CTRL = { HALT: 0, REPEAT: 1, ENDREP: 2, DEPOSIT: 3, SETACT: 4, ACTALL: 5 };
export const CTRL_NAME = Object.fromEntries(
  Object.entries(CTRL).map(([k, v]) => [v, k.toLowerCase()]));

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
export const KMEM_D = 256;       // constants the header may declare; kx's ceiling
export const IMEM_D = 4096;      // instructions per image, revision 2 (CAPS[23:20] reads 12)
export const MAXD = 64;          // deposit slots per lane (rtl/cft_krnl.sv SEQ_MAXD)
export const MAX_LOOP_DEPTH = 4; // REPEATs nest four deep

export const MAGIC = 0x50544643n;   // "CFTP"
export const PROGRAM_VERSION = 1;    // the PROGRAM version; the CSR VERSION is another thing
export const FLAG_BANK_EXT = 1;      // header flags bit 0: the constants arrive per run
export const REG_HI_SHIFT = { rd: 24, ra: 25, rb: 26, rc: 27 };

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
    if (rd || rb || rc || imm || ka || kb || kc || kx)
      throw new Error(`cft-isa: ${CTRL_NAME[op] ?? op} reads at most ra`);
    if (op !== CTRL.DEPOSIT && op !== CTRL.SETACT) {
      if (ra) throw new Error(`cft-isa: ${CTRL_NAME[op] ?? op} names no register`);
      return B(op) | bit(true, 31);
    }
    return B(op) | (B(ra & 15) << 12n) | bit(true, 31) | (bit(ra >> 4, REG_HI_SHIFT.ra) << 32n);
  }
  if (imm & 0xF0000000) throw new Error("cft-isa: imm[31:28] is reserved");
  if (kx && (imm & 0x0F000000)) throw new Error("cft-isa: imm[27:24] are the register high bits, not indices");
  if (!kx && imm) throw new Error("cft-isa: an ALU instruction without kx has no immediate");
  for (const [k, r, n] of [[ka, ra, "ra"], [kb, rb, "rb"], [kc, rc, "rc"]]) {
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
    return name;
  }
  const idx = d.kx ? [d.imm & 0xff, (d.imm >> 8) & 0xff, (d.imm >> 16) & 0xff]
                   : [d.ra, d.rb, d.rc];
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
                             bankExt = false, nConsts = consts.length }) {
  const bytesPerConst = width / 8;
  const stored = bankExt ? [] : consts;
  const buf = new ArrayBuffer(32 + stored.length * bytesPerConst + insns.length * 8);
  const dv = new DataView(buf);
  dv.setUint32(0, Number(MAGIC), true);
  dv.setUint32(4, PROGRAM_VERSION, true);
  dv.setUint32(8, insns.length, true);
  dv.setUint32(12, nConsts, true);
  dv.setUint32(16, maxDeposits, true);
  dv.setUint32(20, precisionCode, true);
  dv.setUint32(24, bankExt ? FLAG_BANK_EXT : 0, true);
  dv.setUint32(28, 0, true);
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
