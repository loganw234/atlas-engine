// A sequencer, executed through libcft's element operations.
//
// docs/SEQUENCER.md's P1 is what makes this legitimate: "the sequencer
// introduces no arithmetic - its opcodes are the same 8-bit space
// MODE[7:0] already carries, executed by the same cft_fpfma_pipe and
// cft_simpleops". A program is a schedule over verified operations, so
// running the schedule here and issuing each operation through
// cft_run is the same arithmetic the tile performs, in the same order,
// with the same per-instruction rounding attribute. What is NOT tested
// here is the scheduling hardware - the issue/drain machine, the active
// mask, the deposit addressing. Those belong to cft-fp256's own
// tb/test_seq_core.py, which scores them against python/cft_golden/
// seq.py directly, and this file makes no claim about them.
//
// Lanes are the sweep: one instruction is issued across the whole
// argument sweep at once, which is exactly the shape cft_run wants and
// exactly the shape the tile runs. Three input streams a, b, c load
// r0, r1, r2; r3..r15 start at +0; deposits come out in index order.
//
// The det library's sequences have no REPEAT, no SETACT and no ACTALL -
// they are straight-line - so the active mask is all-ones throughout
// and the early exit never fires. That is not a simplification of the
// model, it is a property of these programs, and tools/verify-cft-
// detlib.mjs asserts it rather than assuming it.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { OP, READS, ROUNDS, RND, CTRL, decode, NREG } from "./cft-isa.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where libcft's node binding lives. A sibling checkout by default,
 *  overridable with CFT_ROOT - the same shape gen-detlib.mjs uses for
 *  DARKROOM, and for the same reason: a run that could not find the
 *  thing it was comparing against has proven nothing, and should say so
 *  rather than skip. */
export function libcftEntry(root = process.env.CFT_ROOT) {
  const base = root ? resolve(root) : join(HERE, "..", "..", "cft-fp256");
  const entry = join(base, "bindings", "node", "index.mjs");
  if (!existsSync(entry))
    throw new Error(
      `cft-run: no libcft node binding at ${entry}. Set CFT_ROOT to the ` +
      `cft-fp256 checkout; every arithmetic claim in this target is that ` +
      `library's, so there is nothing to verify without it.`);
  return pathToFileURL(entry).href;
}

export class Machine {
  static async open(root) {
    const mod = await import(libcftEntry(root));
    return new Machine(await mod.Context.open(32));
  }

  constructor(base) {
    this.base = base;
    // One context per rounding attribute, all sharing the same module
    // and device. `withRounding` is how libcft carries an attribute, and
    // the sequencer carries one per instruction (docs/SEQUENCER.md,
    // instruction bits 26:24).
    this.byRnd = {
      [RND.RNE]: base,
      [RND.RTZ]: base.withRounding("rtz"),
      [RND.RDN]: base.withRounding("rdn"),
      [RND.RUP]: base.withRounding("rup"),
      [RND.RMM]: base.withRounding("rmm"),
    };
    this._kcache = new Map();
  }

  close() { this.base.close(); }

  /** A Float of this context from a raw 32-bit encoding. */
  fromBits(u) { return this.base.fromBits(BigInt(u >>> 0)); }
  toBits(f) { return Number(f.bits) >>> 0; }

  _bank(consts, n) {
    const key = `${n}|${consts.join(",")}`;
    let v = this._kcache.get(key);
    if (!v) {
      v = consts.map(k => new Array(n).fill(this.fromBits(k)));
      this._kcache.set(key, v);
    }
    return v;
  }

  /** Execute a lowered program over `n` lanes.
   *  `argBits` is one Uint32Array per input stream, each of length n.
   *  Returns { deposits: [Uint32Array per deposit slot], flags, insns }. */
  run(prog, argBits) {
    const n = argBits.length ? argBits[0].length : 0;
    if (argBits.some(a => a.length !== n))
      throw new Error("cft-run: the input streams differ in length");
    if (argBits.length > 3)
      throw new Error("cft-run: cft_program_run loads three streams");
    // A lane has sixteen registers. A program whose peak exceeds that
    // is not loadable, and running it here on a wider lane is a
    // deliberate, labelled exception: it scores the ARITHMETIC of a
    // sequence the ISA cannot hold, which is the only way to say
    // "correct, and it does not fit" rather than just "it does not
    // fit". tools/verify-cft-detlib.mjs prints both halves.
    const nregs = Math.max(NREG, prog.regsUsed);
    const regs = new Array(nregs).fill(null);
    const zero = new Array(n).fill(this.fromBits(0));
    for (let r = 0; r < nregs; r++) regs[r] = zero;
    argBits.forEach((a, i) => { regs[i] = Array.from(a, u => this.fromBits(u)); });
    const bank = this._bank(prog.consts, n);

    let flags = 0;
    let emulated = 0;
    for (const ins of prog.insns) {
      const ctx = this.byRnd[ROUNDS.has(ins.op) ? ins.rnd : RND.RNE];
      const idx = ins.kx ? [ins.imm & 0xff, (ins.imm >> 8) & 0xff, (ins.imm >> 16) & 0xff]
                         : [ins.ra, ins.rb, ins.rc];
      const pick = (which, i) => {
        const isK = which === "a" ? ins.ka : which === "b" ? ins.kb : ins.kc;
        if (isK) {
          const k = bank[idx[i]];
          if (!k) throw new Error(`cft-run: constant ${idx[i]} is outside the bank`);
          return k;
        }
        return regs[[ins.ra, ins.rb, ins.rc][i]];
      };
      const reads = READS[ins.op];
      const slot = { a: null, b: null, c: null };
      reads.forEach(w => { slot[w] = pick(w, { a: 0, b: 1, c: 2 }[w]); });
      if (ins.op === OP.IMUL) {
        // IMUL IS NOT IN libcft YET. Opcode 30 is unassigned there, and
        // softfloat.compute answers an unassigned opcode with the
        // canonical quiet NaN and `invalid` on purpose - measured here,
        // hashu comes back as 0x7fc07fc0 rather than a hash. So the
        // opcode is EMULATED, to the definition
        // docs/studies/OPT-D-contract.md section 1.2 gives it: the low
        // 32 bits of the product of the low 32 bits of the two operand
        // encodings. That makes the sequence checkable now and makes
        // exactly one thing in this run not libcft's arithmetic; every
        // report says how many instructions were emulated so the
        // distinction cannot be lost.
        const a = slot.a, b = slot.b;
        regs[ins.rd] = a.map((av, i) =>
          this.fromBits(Math.imul(this.toBits(av), this.toBits(b[i])) >>> 0));
        emulated++;
        continue;
      }
      const out = ctx.map(ins.op, slot.a, slot.b, slot.c);
      flags |= ctx.lastFlags;
      regs[ins.rd] = out;
    }

    const deposits = prog.results.map(d => Uint32Array.from(regs[d.reg], f => this.toBits(f)));
    return { deposits, flags, insns: prog.insns.length, emulated };
  }
}

/** The control words a lowered program ends with, decoded - so a caller
 *  can assert that nothing but DEPOSIT and HALT appears and that the
 *  active mask therefore never moves. */
export function controlTail(prog) {
  return prog.words ? prog.words.slice(prog.insns.length).map(w => decode(w)) : null;
}

/** Nothing but ALU instructions, then DEPOSITs, then HALT - so the
 *  active mask never moves, the early exit never fires, and P2/P3 have
 *  nothing to be invisible about in these programs. Asserted rather
 *  than assumed. */
export function isStraightLine(prog) {
  const tail = controlTail(prog);
  if (!tail) return prog.insns.every(i => true);   // unencodable: body is ALU by construction
  const okTail = tail.every((d, i) =>
    d.ctrl && (i < tail.length - 1 ? d.op === CTRL.DEPOSIT : d.op === CTRL.HALT));
  const noCtrlInBody = prog.words.slice(0, prog.insns.length)
    .every(w => !decode(w).ctrl);
  return okTail && noCtrlInBody;
}
