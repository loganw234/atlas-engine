# primes: converted
plate GLSL lines: 42   positive lines: 96
gaps: none
notes: The plate's helper primes_isPrime(int n) is called once per
       point from either MODE arm, so each arm inlines one copy: the
       trial-division loop is an orbit walking d = 3, 5, 7... (bound
       159, the shader's d < 320 by twos) that latches comp on the
       first divisor, with until stopping on d*d > n or on the latch,
       exactly where the shader breaks or early-returns; the guards
       for n < 2, n < 4 and the evens fold into a ternary verdict
       after the orbit. All integer arithmetic rides exact small
       floats: the helper's (n - (n/d)*d) == 0 becomes
       mod(n, d) < 0.5, and mm mod 4 == 3 becomes
       mod(mm, 4.0) == 3.0 (all values are exact integers well under
       2^24, and the fractional margin 1/319 dwarfs f32 division
       rounding, so the comparisons cannot misfire on either
       backend). The shader's int() casts on floor(q*2Mx) - Mx
       truncate toward zero on a NON-integer float (Mx = sqrt(N));
       the vocabulary has no float truncation, so the cast is said as
       sign(u) * floor(abs(u)), the same function on this range (a
       negative zero can appear at u in (-1, 0); it compares and
       renders as zero). The hand-written int abs ternaries become
       Math.abs, value-identical. Two decline sites (one per arm),
       one deposit site; the identical col *= 0.5 + 0.7*P[4] of both
       arms is the deposit's glow. Sentinel is again the plate's
       -999 flavor, emitted as the canonical -20000 by decline.
       Verified beyond smoke (which only reached modes 0 and 1): all
       three MODE arms driven directly through the CPU evaluator,
       and the primality verdicts cross-checked against an
       independent sieve on 30000 Sacks points and 60000 Gaussian
       sites, zero mismatches including the axis 3-mod-4 rule.
