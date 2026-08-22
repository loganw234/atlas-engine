# kleinian: converted
plate GLSL lines: 26   positive lines: 71
gaps: none
notes: The random-inversion loop is one orbit with the chaos-game
       coin-ahead pattern (the ifs precedent): a step cannot both draw
       its circle index and share it across sibling fields, so kv is
       drawn at the end of each step and spent by the next, the init
       draws the first, and last trails one behind, finishing on the
       index the final inversion actually used. One draw more than the
       plate in total, same law. The centre C and the difference d are
       inlined per coordinate (orbit fields are single expressions);
       value-identical, just long. The start (rnd.xy - 0.5)*2*ring is
       s.jitter2() scaled, law-equal. nc's max(3, min(6, ...)) clamp
       is copied even though the lever range makes it dead. No far
       sentinel in the plate and smoke shows zero declines. Labels
       "RADIUS ×tan" and "SPHERE ↔ FLAT" carry their Unicode verbatim;
       levers/cam/gain/accent diffed programmatically: match. Identity
       probe: a literal f64 transcription of the shader (draws aligned
       to the walk's order) matches every deposit bit-for-bit (worst
       rel delta 0.0) over 4 configs x 4000 points; a 1 percent
       perturbation of cr diffs at 4.6e-1, so the probe sees.
