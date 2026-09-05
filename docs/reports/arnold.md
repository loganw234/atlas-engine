# arnold: converted
plate GLSL lines: 48   positive lines: 90
gaps: none
notes: The 64+STEPS single loop is two successive orbits, the recorded
       one seeded from the warm-up's final phase; the transient count
       64 is the first orbit's literal bound, so the recorded orbit's
       runtime bound int(P[2]+0.5) equals the shader's total-64
       exactly. The advance d appears twice in the recorded step (the
       phase field and the accumulator field), verbatim copies of one
       pure expression, value-identical. The Farey break-out loop is
       an orbit whose bq field keeps its first find through a ternary
       and whose until stops on it, so denominators after the first
       hit are never tinted in either backend. int(P[0]+0.5) and
       int(P[2]+0.5) become floor(P+0.5) floats compared with ==,
       identical for lawful integer lever values (lyap precedent).
       The two mode returns are one deposit fed by an if/else that
       assigns pre-declared position components; the mode 1 arm draws
       its ribbon jitter (rnd.z in the plate) inside that branch,
       which both evaluators sequence identically. rnd.x becomes the
       first u() draw. No far sentinel in the plate and smoke shows
       zero declines. Levers, cam, gain, accent copied verbatim.
