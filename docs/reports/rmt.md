# rmt: converted
plate GLSL lines: 33   positive lines: 69
gaps: none
notes: Three MODE arms on ENSEMBLE (int lever, compared as floats
       against 0/1/2 after floor(P+0.5), the shader's int(P[0]+0.5)).
       The Kostlan sum is the one structural move: its budget k is a
       computed draw, not a lever, and sum() cannot bound on a value,
       so the arm is an orbit with static bound 100 (the shader's own
       loop cap) carrying an explicit counter i, with until i >= k;
       iteration counts match the shader for every k including k=100.
       One exponential draw per step in the acc field only. N takes
       the shader's int(P[1]) truncation as Math.floor, exact for the
       integer lever, and the dead max(4, min(100, ...)) clamp is
       copied. Wigner and MP arms are pure curtains; rnd.z thickness
       jitters are s.centered(). No far sentinel, zero declines.
       Levers/cam/gain/accent diffed programmatically: match.
       Identity probe: literal f64 transcription matches bit-for-bit
       (worst rel delta 0.0) over 6 configs x 4000 points covering all
       three arms and both N extremes; a 1 percent perturbation of the
       Ginibre radius diffs at 1.7e-2, so the probe is live.
