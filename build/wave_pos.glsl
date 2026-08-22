vec3 shape_wave_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 2005405733u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_sources = int(P[0] + 0.5);
  float wx_1 = (((q.x - 0.5)) * 3.6);
  float wy_2 = (((q.y - 0.5)) * 3.6);
  float acc_3 = 0.0;
  for (int sk_4 = 0; sk_4 < 6; sk_4++) {
    if (sk_4 >= li_sources) break;
    acc_3 += ((P[2] / ((P[5] + length(vec2((wx_1 - (P[4] * cos((((float(sk_4) * TAU) / max(P[0], 1.0)) + (0.10 * uT))))), (wy_2 - (P[4] * sin((((float(sk_4) * TAU) / max(P[0], 1.0)) + (0.10 * uT)))))))))) * sin(((((P[1] + (3.0 * float(sk_4)))) * length(vec2((wx_1 - (P[4] * cos((((float(sk_4) * TAU) / max(P[0], 1.0)) + (0.10 * uT))))), (wy_2 - (P[4] * sin((((float(sk_4) * TAU) / max(P[0], 1.0)) + (0.10 * uT)))))))) - ((2.2 * pow((P[1] + (3.0 * float(sk_4))), P[3])) * uT))));
  }
  float h_5 = acc_3;
  float hn_6 = clamp((h_5 * 4.5), (-1.0), 1.0);
  vec3 shade_7 = mix(vec3(0.03, 0.30, 0.46), vec3(0.80, 0.97, 1.0), ((hn_6 * 0.5) + 0.5));
  float dep_c_8 = wx_1;
  float dep_c_9 = (h_5 * 1.05);
  float dep_c_10 = wy_2;
  vec3 dep_col_11 = (shade_7 * (0.35 + (0.9 * abs(hn_6))));
  col = dep_col_11;
  return vec3(dep_c_8, dep_c_9, dep_c_10);
}
