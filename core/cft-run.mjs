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
// r0, r1, r2; the rest start at +0; deposits come out in index order.
//
// The det library's sequences have no REPEAT, no SETACT and no ACTALL -
// they are straight-line - and tools/verify-cft-detlib.mjs asserts it
// rather than assuming it. A positive's program has REPEATs (since
// 2026-09-08), and this runs them as the model does: every trip, every
// lane, no early exit - which P3 says changes nothing but the time.
//
// This is the FALLBACK path. A program that fits a lane goes through
// cft_program_load and cft_program_run, the executor that goes to a
// card; this path scores the arithmetic of one that does not fit, on a
// lane as wide as it asks.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { OP, READS, ROUNDS, RND, CTRL, decode, NREG, SCRATCH_D } from "./cft-isa.mjs";

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
   *  Returns { deposits: [Uint32Array per deposit slot], flags, insns,
   *  executed, emulated }. */
  run(prog, argBits) {
    const n = argBits.length ? argBits[0].length : 0;
    if (argBits.some(a => a.length !== n))
      throw new Error("cft-run: the input streams differ in length");
    if (argBits.length > 3)
      throw new Error("cft-run: cft_program_run loads three streams");
    // A lane has thirty-two registers. A program whose peak exceeds that
    // is not loadable, and running it here on a wider lane is a
    // deliberate, labelled exception: it scores the ARITHMETIC of a
    // sequence the ISA cannot hold, which is the only way to say
    // "correct, and it does not fit" rather than just "it does not fit".
    const nregs = Math.max(NREG, prog.regsUsed);
    const regs = new Array(nregs).fill(null);
    const zero = new Array(n).fill(this.fromBits(0));
    for (let r = 0; r < nregs; r++) regs[r] = zero;
    argBits.forEach((a, i) => { regs[i] = Array.from(a, u => this.fromBits(u)); });
    const bank = this._bank(prog.consts, n);
    // Slots start at +0 for every lane, which is normative: a run whose
    // untouched scratch kept whatever was there would not be bit-exact.
    const scratch = new Array(SCRATCH_D).fill(null);

    let flags = 0;
    let emulated = 0, executed = 0;
    const stack = [];
    let pc = 0;
    // THE ACTIVE MASK, as docs/SEQUENCER.md P3 states it: SETACT narrows
    // it, ACTALL widens it, every register write is masked by it, and a
    // loop ends early once no lane is active - which must change nothing
    // but the time, and here is the check of that on a second machine.
    // The exception flags are NOT masked on this path, and are reported
    // as an aggregate only.
    const active = new Uint8Array(n).fill(1);
    let allActive = true;
    const write = (rd, out) => {
      if (allActive) { regs[rd] = out; return; }
      const old = regs[rd];
      regs[rd] = out.map((v, i) => (active[i] ? v : old[i]));
    };
    while (pc < prog.insns.length) {
      const ins = prog.insns[pc];
      if (ins.ctrl === "repeat") {
        if (ins.trip <= 0) throw new Error("cft-run: REPEAT 0");
        stack.push({ start: pc + 1, left: ins.trip });
        pc++; continue;
      }
      if (ins.ctrl === "endrep") {
        const f = stack[stack.length - 1];
        if (!f) throw new Error("cft-run: ENDREP without REPEAT");
        const anyActive = allActive || active.some(a => a);
        if (--f.left > 0 && anyActive) pc = f.start; else { stack.pop(); pc++; }
        continue;
      }
      if (ins.ctrl === "setact") {
        const src = regs[ins.ra];
        for (let i = 0; i < n; i++) if (this.toBits(src[i]) === 0) active[i] = 0;
        allActive = active.every(a => a);
        pc++; continue;
      }
      if (ins.ctrl === "actall") {
        if (stack.length) throw new Error("cft-run: ACTALL inside a loop");
        active.fill(1); allActive = true;
        pc++; continue;
      }
      // THE PER-LANE SCRATCH, revision 3's R4. Lane i's slot s is
      // reachable by lane i alone; a store is a register write for P3's
      // purposes and a load writes rd, so both go through the same mask
      // as any other write. An indexed slot is the low log2(SCRATCH_D)
      // bits of rb's BIT PATTERN read as an unsigned integer, reduced
      // modulo the depth - which is the contract's own wording, and
      // what FLAG_SCRATCH_STRICT would report instead.
      if (ins.ctrl === "stl" || ins.ctrl === "stx") {
        const src = regs[ins.ra];
        const idx = ins.ctrl === "stl" ? null : regs[ins.rb];
        for (let i = 0; i < n; i++) {
          if (!active[i]) continue;
          const slot = idx === null ? ins.slot : (this.toBits(idx[i]) >>> 0) % SCRATCH_D;
          if (!scratch[slot]) scratch[slot] = new Array(n).fill(this.fromBits(0));
          scratch[slot][i] = src[i];
        }
        pc++; continue;
      }
      if (ins.ctrl === "ldl" || ins.ctrl === "ldx") {
        const idx = ins.ctrl === "ldl" ? null : regs[ins.rb];
        const out = regs[ins.rd].slice();
        for (let i = 0; i < n; i++) {
          if (!active[i]) continue;
          const slot = idx === null ? ins.slot : (this.toBits(idx[i]) >>> 0) % SCRATCH_D;
          out[i] = scratch[slot] ? scratch[slot][i] : this.fromBits(0);
        }
        regs[ins.rd] = out;
        pc++; continue;
      }
      executed++;
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
        // IMUL IS EMULATED ON THIS PATH, AND THE NOTE BELOW IS HISTORY.
        // When this was written (2026-09-07) opcode 30 was unassigned in
        // libcft, and softfloat.compute answered an unassigned opcode
        // with the canonical quiet NaN and `invalid` on purpose -
        // measured here, hashu came back as 0x7fc07fc0 rather than a
        // hash. So the opcode was emulated, to the definition
        // docs/studies/OPT-D-contract.md section 1.2 gives it: the low
        // 32 bits of the product of the low 32 bits of the two operand
        // encodings. libcft has carried IMUL since later that day, and
        // the program-executor path tools/verify-cft-positive.mjs takes
        // runs it natively - hopf's two IMULs went through
        // cft_program_run on 2026-09-08. This instruction-by-instruction
        // path keeps the emulation until the two are measured to agree,
        // and every report still says how many instructions were
        // emulated so the distinction cannot be lost.
        const a = slot.a, b = slot.b;
        write(ins.rd, a.map((av, i) =>
          this.fromBits(Math.imul(this.toBits(av), this.toBits(b[i])) >>> 0)));
        emulated++;
        pc++; continue;
      }
      const out = ctx.map(ins.op, slot.a, slot.b, slot.c);
      flags |= ctx.lastFlags;
      write(ins.rd, out);
      pc++;
    }

    const deposits = prog.results.map(d => Uint32Array.from(regs[d.reg], f => this.toBits(f)));
    return { deposits, flags, insns: prog.insns.length, executed, emulated };
  }

  /** A program's HOISTED per-run values (core/cft-lower.mjs,
   *  hoistPerRun): its init program run on one lane, instruction by
   *  instruction through libcft, over the declared tail's bit patterns
   *  (`tailBits[0..8]` = P[0..7], uT). The same opcodes with the same
   *  rounding attributes the tile would have issued per lane, which is
   *  the whole of the claim that hoisting changes no bit. IMUL is the
   *  definition run() emulates, for run()'s reason. Returns one bit
   *  pattern per hoisted slot. */
  hoisted(hoist, tailBits) {
    const vals = new Array(hoist.ops.length);
    const get = (v) => (v.c !== undefined ? this.fromBits(v.c)
                      : v.t !== undefined ? this.fromBits(tailBits[v.t])
                      : vals[v.h]);
    hoist.ops.forEach((o, i) => {
      const slot = { a: null, b: null, c: null };
      for (const w of READS[o.op]) slot[w] = [get(o[w])];
      if (o.op === OP.IMUL) {
        vals[i] = this.fromBits(Math.imul(this.toBits(slot.a[0]), this.toBits(slot.b[0])) >>> 0);
        return;
      }
      const ctx = this.byRnd[ROUNDS.has(o.op) ? o.rnd : RND.RNE];
      vals[i] = ctx.map(o.op, slot.a, slot.b, slot.c)[0];
    });
    return Uint32Array.from(hoist.outs, h => this.toBits(vals[h]));
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
  if (prog.insns.some(i => i.ctrl)) return false;
  const tail = controlTail(prog);
  if (!tail) return true;   // unencodable: body is ALU by construction
  const okTail = tail.every((d, i) =>
    d.ctrl && (i < tail.length - 1 ? d.op === CTRL.DEPOSIT : d.op === CTRL.HALT));
  const noCtrlInBody = prog.words.slice(0, prog.insns.length)
    .every(w => !decode(w).ctrl);
  return okTail && noCtrlInBody;
}
