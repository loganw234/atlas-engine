vec3 shape_modmul_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3657359631u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float n_1 = P[1];
  float m_2 = mod((P[0] + (P[3] * uT)), n_1);
  float j_3 = floor((q.y * n_1));
  float tc_4 = q.x;
  float f2_5 = fract(((m_2 * j_3) / n_1));
  float a1_6 = ((TAU * j_3) / n_1);
  float a2_7 = (TAU * f2_5);
  float ax_8 = cos(a1_6);
  float ay_9 = sin(a1_6);
  float bx_10 = cos(a2_7);
  float by_11 = sin(a2_7);
  float y1_12 = ((P[2] * (((j_3 / n_1) - 0.5))) * 2.0);
  float y2_13 = ((P[2] * ((f2_5 - 0.5))) * 2.0);
  float clen_14 = (length(vec2((bx_10 - ax_8), (by_11 - ay_9))) * 0.5);
  vec3 byIdx_15 = pal((j_3 / n_1), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
  vec3 byLen_16 = pal((clen_14 * 0.9), vec3(0.52, 0.36, 0.30), vec3(0.45, 0.36, 0.30), vec3(1.0, 0.9, 0.8), vec3(0.05, 0.25, 0.50));
  float dep_c_17 = (mix(ax_8, bx_10, tc_4) * 1.25);
  float dep_c_18 = (mix(y1_12, y2_13, tc_4) * 1.25);
  float dep_c_19 = (mix(ay_9, by_11, tc_4) * 1.25);
  vec3 dep_col_20 = (mix(byIdx_15, byLen_16, P[4]) * (0.55 + (0.45 * sin((PI * tc_4)))));
  col = dep_col_20;
  return vec3(dep_c_17, dep_c_18, dep_c_19);
}
