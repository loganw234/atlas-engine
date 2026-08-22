vec3 shape_arnold_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 1521741809u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_steps = int(P[2] + 0.5);
  float ml_1 = floor((P[0] + 0.5));
  float Om_2 = q.x;
  float K_3 = ((((ml_1 == 0.0))) ? (q.y * P[1]) : P[1]);
  pt = hashu(pt);
  float draw_4 = u2f(pt);
  float th0_5 = draw_4;
  float ob_6_th = th0_5;
  int ob_6_count = 0;
  bool ob_6_esc = false;
  for (int ok_7 = 0; ok_7 < 64; ok_7++) {
    float ob_6_t_8 = fract((ob_6_th + ((Om_2 + (((K_3 / TAU)) * sin((TAU * ob_6_th)))))));
    ob_6_th = ob_6_t_8;
    ob_6_count += 1;
  }
  float ob_9_th = ob_6_th;
  float ob_9_acc = 0.0;
  int ob_9_count = 0;
  bool ob_9_esc = false;
  for (int ok_10 = 0; ok_10 < 336; ok_10++) {
    if (ok_10 >= li_steps) break;
    float ob_9_t_11 = fract((ob_9_th + ((Om_2 + (((K_3 / TAU)) * sin((TAU * ob_9_th)))))));
    float ob_9_t_12 = (ob_9_acc + ((Om_2 + (((K_3 / TAU)) * sin((TAU * ob_9_th))))));
    ob_9_th = ob_9_t_11;
    ob_9_acc = ob_9_t_12;
    ob_9_count += 1;
  }
  float stepsl_13 = floor((P[2] + 0.5));
  float fsteps_14 = max(stepsl_13, 1.0);
  float rho_15 = (ob_9_acc / fsteps_14);
  float tol_16 = (1.2 / fsteps_14);
  float ob_17_qi = 1.0;
  float ob_17_bq = 0.0;
  int ob_17_count = 0;
  bool ob_17_esc = false;
  for (int ok_18 = 0; ok_18 < 8; ok_18++) {
    if ((ob_17_bq > 0.0)) { ob_17_esc = true; break; }
    float ob_17_t_19 = (ob_17_qi + 1.0);
    float ob_17_t_20 = ((((ob_17_bq > 0.0))) ? ob_17_bq : (((((abs((rho_15 - (floor(((rho_15 * ob_17_qi) + 0.5)) / ob_17_qi))) < tol_16))) ? ob_17_qi : 0.0)));
    ob_17_qi = ob_17_t_19;
    ob_17_bq = ob_17_t_20;
    ob_17_count += 1;
  }
  vec3 col_21 = vec3(0.22, 0.28, 0.42);
  if ((ob_17_bq > 0.0)) {
    col_21 = mix(vec3(0.8, 0.76, 0.8), pal((ob_17_bq * 0.125), vec3(0.62, 0.45, 0.52), vec3(0.38, 0.32, 0.38), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.28, 0.6)), clamp(P[4], 0.0, 1.0));
  }
  col_21 = (col_21 * (0.4 + (0.9 * P[5])));
  float px_22 = 0.0;
  float py_23 = 0.0;
  float pz_24 = 0.0;
  if ((ml_1 == 0.0)) {
    px_22 = (((Om_2 - 0.5)) * 2.4);
    py_23 = ((((rho_15 - Om_2)) * P[3]) * 4.0);
    pz_24 = (((q.y - 0.5)) * 2.4);
  } else {
    px_22 = (((Om_2 - 0.5)) * 2.6);
    py_23 = ((((rho_15 - 0.5)) * P[3]) * 1.8);
    pt = hashu(pt);
    float draw_25 = u2f(pt) - 0.5;
    pz_24 = (draw_25 * 0.06);
  }
  float dep_c_26 = px_22;
  float dep_c_27 = py_23;
  float dep_c_28 = pz_24;
  vec3 dep_col_29 = col_21;
  col = dep_col_29;
  return vec3(dep_c_26, dep_c_27, dep_c_28);
}
