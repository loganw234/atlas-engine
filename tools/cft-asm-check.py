#!/usr/bin/env python3
"""Hold this repository's encoder to cft-fp256's assembler, byte for byte.

    python tools/cft-asm-check.py <program.cfta> <program.cftp> [--cft-root ../cft-fp256]

core/emit-cft.mjs writes a program twice: as the image its own encoder
(core/cft-isa.mjs) produces, and as `.cfta` text in the coprocessor's
assembly form (its docs/PROGRAMS.md). python/cft_golden/asm.py - the
reference assembler there, held byte for byte to the C tool - assembles
the text here, and the result must equal the image. Two encoders
written from the same specification, in two repositories, agreeing on
every byte is what makes the encoding a fact rather than a reading.

Exit 0 and one line when identical; exit 1 and the first differing
offset otherwise. A disassembly of the image is written beside it on a
mismatch, so the two spellings can be read side by side.
"""
import argparse
import pathlib
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cfta")
    ap.add_argument("cftp")
    ap.add_argument("--cft-root", default=None)
    args = ap.parse_args()

    here = pathlib.Path(__file__).resolve().parent
    root = pathlib.Path(args.cft_root) if args.cft_root else here.parent.parent / "cft-fp256"
    pydir = root / "python"
    if not (pydir / "cft_golden" / "asm.py").exists():
        sys.exit(f"cft-asm-check: no assembler at {pydir} - pass --cft-root")
    sys.path.insert(0, str(pydir))
    from cft_golden import asm  # noqa: E402

    text = pathlib.Path(args.cfta).read_text(encoding="utf-8")
    image = pathlib.Path(args.cftp).read_bytes()
    try:
        mine = asm.assemble(text, source=args.cfta)
    except Exception as e:  # noqa: BLE001 - the refusal IS the report
        sys.exit(f"cft-asm-check: asm.py refused the text: {e}")
    if mine == image:
        print(f"identical: {len(image)} bytes, {(len(image) - 32) // 8} words")
        return
    n = min(len(mine), len(image))
    off = next((i for i in range(n) if mine[i] != image[i]), n)
    out = pathlib.Path(args.cftp).with_suffix(".asm-dis.txt")
    try:
        out.write_text(asm.disassemble(image), encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        out.write_text(f"disassembly refused: {e}\n", encoding="utf-8")
    word = (off - 32) // 8 if off >= 32 else -1
    sys.exit(f"cft-asm-check: DIFFERENT at byte {off} (word {word}); asm.py {len(mine)} bytes, "
             f"emitter {len(image)} bytes; disassembly of the emitter's image at {out}")


if __name__ == "__main__":
    main()
