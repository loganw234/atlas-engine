// The cft-fp256 sequencer's instruction set, as this repository needs
// to speak it.
//
// Every number here is read out of the coprocessor's golden model -
// python/cft_golden/softfloat.py for the opcodes and the rounding
// ladder, python/cft_golden/seq.py for the encoding and the control
// codes - and docs/SEQUENCER.md is the prose. Nothing is invented on
// this side; where a value could have been guessed it is instead
// spelled with the model's own line beside it, because a wrong opcode
// number computes a different operation and says nothing about it.
//
// TWO EXTENSIONS, DEFINED HERE BEFORE THEY EXISTED. Both come from
// cft-fp256's docs/studies/OPT-D-contract.md, sections 1.1 and 1.2.
// They were built there on 2026-09-07 - golden model, libcft, RTL, a
// formal proof for the multiply - and are published in the tile's
// capability word (CAPS[4] for kx, CAPS[28] for IMUL), so a host asks
// rather than guesses. The node build of libcft loads and runs both,
// measured 2026-09-08 (docs/CFT-POSITIVE.md).
//
//   kx   instruction bit 30, reserved-must-be-zero before. Set, the
//        three operands take 8-bit constant indices from imm[7:0],
//        imm[15:8], imm[23:16], the 4-bit operand fields of any
//        operand whose k bit is set must be zero, and the addressable
//        bank grows from 16 to 256.
//   IMUL opcode 30, the low 32 bits of the product of the low 32 bits
//        of the two operand encodings, zero-extended to the format
//        width.
//
// The library tools still take --isa-ext to emit either, so the record
// can be produced for a tile that predates them and a program that
// needs one cannot be mistaken for one that runs everywhere; the plate
// target (core/emit-cft.mjs) always enables both, because every draw
// in every positive needs the multiply.

// ---- opcodes (softfloat.py:641-670) ---------------------------------
export const OP = {
  FMA: 0, ADD: 1, SUB: 2, MUL: 3,
  ABS: 4, NEG: 5, COPYSIGN: 6,
  MIN: 7, MAX: 8, MINNUM: 9, MAXNUM: 10,
  SELECT: 11, CMPLT: 12, CMPLE: 13, CMPEQ: 14,
  IAND: 16, IOR: 17, IXOR: 18, IADD: 19,
  ISUB: 20, ISHL: 21, ISHR: 22, ICMPLT: 23,
  RECIP_SEED: 26, RSQRT_SEED: 27,
  // extension, OPT-D 1.2
  IMUL: 30,
};
export const OP_NAME = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k.toLowerCase()]));
export const EXT_OPS = new Set([OP.IMUL]);

/** Which operand fields each opcode actually reads, in the order the
 *  model's `steer` and SIMPLE_IMPL take them. ADD and SUB are the ones
 *  worth noticing: softfloat.steer() sends them through the FMA as
 *  (a, 1.0, +-c), so they read ra and rc and NOT rb - which is also
 *  how python/cft_golden/seqprogs.py writes them. */
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

// ---- control codes (seq.py:52) ---------------------------------------
export const CTRL = { HALT: 0, REPEAT: 1, ENDREP: 2, DEPOSIT: 3, SETACT: 4, ACTALL: 5 };
export const CTRL_NAME = Object.fromEntries(
  Object.entries(CTRL).map(([k, v]) => [v, k.toLowerCase()]));

// ---- capacities ------------------------------------------------------
// Build parameters of cft_seq, not part of the program model
// (docs/SEQUENCER.md, "A tile also has three capacities"). They are
// here because a program that does not fit one of them is refused at
// the header, and an emitter that cannot see them finds that out on
// card day.
export const NREG = 16;          // registers per lane, fixed by the encoding
export const KREG = 16;          // addressable constants without kx
export const KMEM_D = 256;       // constants the header may declare; kx's ceiling
export const IMEM_D = 1024;      // instructions per image
export const MAXD = 64;          // deposit slots per lane

export const MAGIC = 0x50544643n;   // "CFTP"
export const PROGRAM_VERSION = 1;

// ---- encoding (seq.py:79) --------------------------------------------

const B = (n) => BigInt(n);

/** One 64-bit instruction word, as a BigInt. Field checks mirror
 *  seq.encode()'s, including the ones the loader will repeat. */
export function encode({ op, rd = 0, ra = 0, rb = 0, rc = 0, rnd = RND.RNE,
                         ka = false, kb = false, kc = false, kx = false,
                         ctrl = false, imm = 0 }) {
  for (const [n, v] of [["rd", rd], ["ra", ra], ["rb", rb], ["rc", rc]])
    if (!(Number.isInteger(v) && v >= 0 && v < NREG))
      throw new Error(`cft-isa: ${n}=${v} outside 0..${NREG - 1}`);
  if (!(Number.isInteger(op) && op >= 0 && op < 256))
    throw new Error(`cft-isa: op=${op} does not fit the opcode byte`);
  if (!(rnd >= 0 && rnd <= 4)) throw new Error(`cft-isa: rnd=${rnd}`);
  if (!(imm >= 0 && imm < 2 ** 32)) throw new Error(`cft-isa: imm=${imm}`);
  return B(op) | (B(rd) << 8n) | (B(ra) << 12n) | (B(rb) << 16n) | (B(rc) << 20n)
       | (B(rnd) << 24n) | (B(ka ? 1 : 0) << 27n) | (B(kb ? 1 : 0) << 28n)
       | (B(kc ? 1 : 0) << 29n) | (B(kx ? 1 : 0) << 30n)
       | (B(ctrl ? 1 : 0) << 31n) | (B(imm) << 32n);
}

export function decode(word) {
  const w = BigInt(word);
  const n = (sh, mask) => Number((w >> B(sh)) & B(mask));
  return {
    op: n(0, 0xff), rd: n(8, 0xf), ra: n(12, 0xf), rb: n(16, 0xf), rc: n(20, 0xf),
    rnd: n(24, 0x7), ka: !!n(27, 1), kb: !!n(28, 1), kc: !!n(29, 1),
    kx: !!n(30, 1), ctrl: !!n(31, 1), imm: Number((w >> 32n) & 0xffffffffn),
  };
}

/** A readable line for a decoded word, in the listing's spelling. */
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

/** header (8 u32) + n_consts format-width constants + n_insns u64. */
export function imageBytes({ insns, consts, maxDeposits, precisionCode, width = 32 }) {
  const bytesPerConst = width / 8;
  const buf = new ArrayBuffer(32 + consts.length * bytesPerConst + insns.length * 8);
  const dv = new DataView(buf);
  dv.setUint32(0, Number(MAGIC), true);
  dv.setUint32(4, PROGRAM_VERSION, true);
  dv.setUint32(8, insns.length, true);
  dv.setUint32(12, consts.length, true);
  dv.setUint32(16, maxDeposits, true);
  dv.setUint32(20, precisionCode, true);
  let o = 32;
  for (const k of consts) { dv.setUint32(o, k >>> 0, true); o += bytesPerConst; }
  for (const w of insns) { dv.setBigUint64(o, BigInt(w), true); o += 8; }
  return new Uint8Array(buf);
}
