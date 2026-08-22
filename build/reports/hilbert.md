# hilbert: converted
plate GLSL lines: 65   positive lines: 178
gaps: none. No bitwise operators exist in the subset and this plate is
      written almost entirely in them, so every one is said in
      arithmetic on exact small integers riding as floats (a coordinate
      never passes 2^8, a position along the thread never passes 2^18,
      so all of it is exact on both backends): x << 1 is x * 2, x >> 1
      is floor(x / 2), x & (Q-1) for a power of two Q is mod(x, Q), and
      the test (x & Q) != 0 is mod(floor(x / Q), 2) > 0.5. The two
      compound tricks in the excess-work loop are not really bitwise
      once read: x ^= M with M = Q-1 complements the low bits,
      x - 2 mod(x, Q) + Q - 1, and t = (x^y)&M; x ^= t; y ^= t is an
      exchange of the low bits of x and y (the plate's own comment
      calls the i = 0 case a self-exchange, which is the giveaway).
      Only the Gray decode needs a general XOR of two whole words; it
      is spelled bit by bit as sum(8, b => mod(...)*pow(2, b)), eight
      being every bit an ORDER can reach. The cross-check below drives
      real JS bitwise operators against these identities and finds them
      equal to the bit, so nothing is approximated here.
notes: hilbert_decode is called twice, on n and on n+1, and orbits
       cannot be shared, so the decode is written out twice: two
       bit-distribution orbits (bound 18, the shader's own, with a step
       counter j against nbits and a place value pw halving exactly),
       then, only when MORTON is off, two Gray decodes and two
       excess-work orbits. The morton early return is an if (!morton)
       block around all of that, so the Z-order arm does no more work
       on the GPU than the shader does.
       The excess-work loop is the one restructuring. Its three stages
       read each other's output within a single turn (the i = 1 stage
       sees the x0 the i = 2 stage just wrote), which a simultaneous
       orbit cannot express, so the orbit takes three steps per turn of
       the shader's loop, selecting the stage by k % 3 and doubling Q on
       the last of each three: 21 steps for the shader's 7. Q can only
       change at the end of a triple, so it can only reach top at a
       stage boundary, and until (v) => v.Q == top stops exactly where
       the shader's if (Q == top) break does. Within one stage both
       words still update from the same entry values, which is what the
       shader's single t means.
       Both clamps are kept verbatim although the lever ranges make
       them no-ops (ORDER's min is 1), including the 8^6 ceiling in 3D,
       which is live: ORDER 7 and 8 in DIMENSION 3 both decode at 6.
       The 2D arm lays the lattice flat in y, so the plane's second
       coordinate is the world z. rnd.xyz is three centered draws in
       source order, the walk's only draws.
       Cross-check (scratchpad, this session): the walk against a
       literal f64 transcription of the plate's GLSL using real JS <<,
       >>, & and ^, both on one recorded draw tape, 1500 points x 20
       settings covering DIMENSION 2 and 3, ORDER 1/2/4/6/8, MORTON on
       and off. 30000 deposits compared field by field, worst relative
       delta 0.000e+0: every field bit-equal, which is the strongest
       statement the arithmetic identities could have earned. Negative
       control fired in every row: shifting the Gray decode by 2
       instead of 1 moved the non-morton rows to 9e+2 relative, and
       widening the cell edge 2.4 to 2.4000002 moved the morton rows to
       6.2e-4, so both arms have a live detector.
       An independent property probe (not the transcription) confirms
       the mathematics the caption claims: over DIMENSION 2 and 3 at
       ORDER 1 to 4, consecutive cells share a face at every step (0
       exceptions, longest step 1), the enumeration is a bijection onto
       the lattice (all cells distinct, none outside), and MORTON is the
       positive control that fails it, half its steps teleporting up to
       31 cells at ORDER 4.
       Levers, cam, gain and accent diffed programmatically against the
       plate: all match, labels included.
       VOLUMETRIC: at DIMENSION 3, the default, the thread spreads
       points through the whole cube, and TUBE fogs each one across its
       cell (at 1.0 the thread dissolves into the lattice). Budget the
       sampling for a diffuse plate rather than reading a low
       correlation as a defect.
