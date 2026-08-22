vec3 shape_harm_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 927234243u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float ct_1 = (1.0 - (2.0 * q.x));
  float st_2 = sqrt(max(0.0, (1.0 - (ct_1 * ct_1))));
  float ph_3 = (TAU * q.y);
  float s2_4 = (st_2 * st_2);
  float Y20_5 = (0.5 * ((((3.0 * ct_1) * ct_1) - 1.0)));
  float Y32_6 = (((2.2 * s2_4) * ct_1) * cos((2.0 * ph_3)));
  float Y43_7 = ((((3.4 * s2_4) * st_2) * ct_1) * cos((3.0 * ph_3)));
  float Y55_8 = ((((4.2 * s2_4) * s2_4) * st_2) * cos((5.0 * ph_3)));
  float w0_9 = (P[0] + (P[4] * cos((0.19 * uT))));
  float w1_10 = (P[1] + (P[4] * cos(((0.23 * uT) + 2.1))));
  float w2_11 = (P[2] + (P[4] * cos(((0.17 * uT) + 4.2))));
  float w3_12 = (P[3] + (P[4] * cos(((0.13 * uT) + 1.1))));
  float f_13 = (0.30 * (((((w0_9 * Y20_5) + (w1_10 * Y32_6)) + (w2_11 * Y43_7)) + (w3_12 * Y55_8))));
  float r_14 = (0.58 + (P[5] * f_13));
  pt = hashu(pt);
  r_14 = (r_14 * ((1.0 + (P[6] * (u2f(pt) - 0.5)))));
  float rr_15 = (max(r_14, 0.03) * 1.05);
  float dep_c_16 = ((st_2 * cos(ph_3)) * rr_15);
  float dep_c_17 = (ct_1 * rr_15);
  float dep_c_18 = ((st_2 * sin(ph_3)) * rr_15);
  vec3 dep_col_19 = mix(vec3(0.22, 0.58, 1.0), vec3(1.0, 0.55, 0.20), step(0.0, f_13));
  float dep_glow_20 = (0.20 + (1.6 * abs(f_13)));
  col = dep_col_19 * dep_glow_20;
  return vec3(dep_c_16, dep_c_17, dep_c_18);
}
