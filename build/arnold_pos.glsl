vec3 shape_arnold_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 1521741809u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_steps = int(P[2] + 0.5);
  float ml_1 = floor((P[0] + 0.5));
  float Om_2 = q.x;
  float K_3 = ((((ml_1 == 0.0))) ? (q.y * P[1]) : P[1]);
  pt = hashu(pt);
  float th0_4 = u2f(pt);
  float ob_5_th = th0_4;
  int ob_5_count = 0;
  bool ob_5_esc = false;
  for (int ok_6 = 0; ok_6 < 64; ok_6++) {
    float ob_5_t_7 = fract((ob_5_th + ((Om_2 + (((K_3 / TAU)) * sin((TAU * ob_5_th)))))));
    ob_5_th = ob_5_t_7;
    ob_5_count += 1;
  }
  float ob_8_th = ob_5_th;
  float ob_8_acc = 0.0;
  int ob_8_count = 0;
  bool ob_8_esc = false;
  for (int ok_9 = 0; ok_9 < 336; ok_9++) {
    if (ok_9 >= li_steps) break;
    float ob_8_t_10 = fract((ob_8_th + ((Om_2 + (((K_3 / TAU)) * sin((TAU * ob_8_th)))))));
    float ob_8_t_11 = (ob_8_acc + ((Om_2 + (((K_3 / TAU)) * sin((TAU * ob_8_th))))));
    ob_8_th = ob_8_t_10;
    ob_8_acc = ob_8_t_11;
    ob_8_count += 1;
  }
  float stepsl_12 = floor((P[2] + 0.5));
  float fsteps_13 = max(stepsl_12, 1.0);
  float rho_14 = (ob_8_acc / fsteps_13);
  float tol_15 = (1.2 / fsteps_13);
  float ob_16_qi = 1.0;
  float ob_16_bq = 0.0;
  int ob_16_count = 0;
  bool ob_16_esc = false;
  for (int ok_17 = 0; ok_17 < 8; ok_17++) {
    if ((ob_16_bq > 0.0)) { ob_16_esc = true; break; }
    float ob_16_t_18 = (ob_16_qi + 1.0);
    float ob_16_t_19 = ((((ob_16_bq > 0.0))) ? ob_16_bq : (((((abs((rho_14 - (floor(((rho_14 * ob_16_qi) + 0.5)) / ob_16_qi))) < tol_15))) ? ob_16_qi : 0.0)));
    ob_16_qi = ob_16_t_18;
    ob_16_bq = ob_16_t_19;
    ob_16_count += 1;
  }
  vec3 col_20 = vec3(0.22, 0.28, 0.42);
  if ((ob_16_bq > 0.0)) {
    col_20 = mix(vec3(0.8, 0.76, 0.8), pal((ob_16_bq * 0.125), vec3(0.62, 0.45, 0.52), vec3(0.38, 0.32, 0.38), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.28, 0.6)), clamp(P[4], 0.0, 1.0));
  }
  col_20 = (col_20 * (0.4 + (0.9 * P[5])));
  float px_21 = 0.0;
  float py_22 = 0.0;
  float pz_23 = 0.0;
  if ((ml_1 == 0.0)) {
    px_21 = (((Om_2 - 0.5)) * 2.4);
    py_22 = ((((rho_14 - Om_2)) * P[3]) * 4.0);
    pz_23 = (((q.y - 0.5)) * 2.4);
  } else {
    px_21 = (((Om_2 - 0.5)) * 2.6);
    py_22 = ((((rho_14 - 0.5)) * P[3]) * 1.8);
    pt = hashu(pt);
    pz_23 = ((u2f(pt) - 0.5) * 0.06);
  }
  float dep_c_24 = px_21;
  float dep_c_25 = py_22;
  float dep_c_26 = pz_23;
  vec3 dep_col_27 = col_20;
  col = dep_col_27;
  return vec3(dep_c_24, dep_c_25, dep_c_26);
}
