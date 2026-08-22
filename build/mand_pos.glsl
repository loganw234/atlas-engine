vec3 shape_mand_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 2000225857u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_iters = int(P[0] + 0.5);
  float K_1 = P[0];
  pt = hashu(pt);
  float jx_2 = u2f(pt) - 0.5;
  pt = hashu(pt);
  vec2 jit_3 = vec2(jx_2, u2f(pt) - 0.5);
  vec2 j_4 = jit_3;
  float wx_5 = (mix((-1.55), 1.55, q.x) + (j_4.x * 0.002));
  float wy_6 = ((((q.y - 0.5)) * 2.6) + (j_4.y * 0.002));
  float cx_7 = (P[2] + (wx_5 / P[1]));
  float cy_8 = (P[3] + (wy_6 / P[1]));
  float ob_9_x = 0.0;
  float ob_9_y = 0.0;
  int ob_9_count = 0;
  bool ob_9_esc = false;
  for (int ok_10 = 0; ok_10 < 120; ok_10++) {
    if (ok_10 >= li_iters) break;
    if ((((ob_9_x * ob_9_x) + (ob_9_y * ob_9_y)) > 40.0)) { ob_9_esc = true; break; }
    float ob_9_t_11 = (((ob_9_x * ob_9_x) - (ob_9_y * ob_9_y)) + cx_7);
    float ob_9_t_12 = (((2.0 * ob_9_x) * ob_9_y) + cy_8);
    ob_9_x = ob_9_t_11;
    ob_9_y = ob_9_t_12;
    ob_9_count += 1;
  }
  float m2_13 = ((ob_9_x * ob_9_x) + (ob_9_y * ob_9_y));
  float n_14 = ((((m2_13 > 40.0))) ? ((float(ob_9_count) - 1.0)) : K_1);
  float hgt_15 = 0.0;
  vec3 tint_16 = vec3(0.0, 0.0, 0.0);
  if ((n_14 >= K_1)) {
    hgt_15 = P[4];
    tint_16 = (vec3(0.60, 0.16, 0.05) * 0.5);
  } else {
    float nu_17 = ((n_14 + 1.0) - (log(max(1.0, (0.5 * log(m2_13)))) / log(2.0)));
    float x_18 = clamp((nu_17 / K_1), 0.0, 1.0);
    hgt_15 = (P[4] * pow(x_18, 2.0));
    tint_16 = (pal(fract(((P[5] * x_18) + (0.02 * uT))), vec3(0.50, 0.33, 0.20), vec3(0.50, 0.38, 0.30), vec3(1.0, 1.0, 1.0), vec3(0.00, 0.12, 0.30)) * (0.22 + (1.15 * x_18)));
  }
  float dep_c_19 = (wx_5 * 0.72);
  float dep_c_20 = hgt_15;
  float dep_c_21 = (wy_6 * 0.72);
  vec3 dep_col_22 = tint_16;
  col = dep_col_22;
  return vec3(dep_c_19, dep_c_20, dep_c_21);
}
