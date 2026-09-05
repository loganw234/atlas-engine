# collatz: converted
plate GLSL lines: 28   positive lines: 84
gaps: none
notes: The shader lives on uint bit machinery: m rides uint32 (with
       wrap semantics), parities pack into a 32-bit shift window via
       `win = (win << 1) | par`, and the replay unpacks with
       `(win >> j) & 1`. The vocabulary has no bit operators and no
       ints beyond counters, and a plain float m would have been
       WRONG on the GPU: trajectories for n <= 50001 reach
       121,012,864, seven times past f32's exact-integer range, so
       3m+1 would round and every later parity would be garbage.
       Restated instead as 16-bit halves in exact small floats: m is
       (lo, hi) and the window is (wlo, whi), shifted left
       arithmetically on the descent (mod 65536 with an explicit
       carry) and right again on the replay (floor halving with the
       high bit fed across); every intermediate stays under 2^24, so
       both backends are exact, and the mod-2^32 drop of bit 31
       reproduces the uint wrap exactly (no trajectory in range
       actually wraps m, but the semantics carry). Verified outside
       smoke: pass 1 (window, length) is identical to a direct
       uint32 transliteration for every n in 1..50001, in f64 and in
       simulated f32 (Math.fround at every operation); the replay
       matches the shader's bit-indexed replay bitwise over 89,908
       (n, target) cases. The replay orbit needs a j state field
       counting steps because until() sees only state, and the
       snapshot fields ox, oy duplicate the px, py step expressions
       inside their (k == target) ternaries, expression-bodied
       duplication, value-identical. The orbit's until checks m == 1
       before each step exactly where the shader breaks; .count is
       the shader's len; keep = min(len, 32) becomes an int-typed
       ternary made float for the target draw and the palette. The
       target draw uses s.u() where the shader hashes seed once,
       value differs, law does not. One decline (n0 = 1, keep 0),
       plate sentinel again the -999 flavor. Trajectories that miss
       1 within 220 steps exhaust the orbit at count 220 exactly as
       the shader's loop cap; both then keep the last 32 parities of
       the truncated run.
