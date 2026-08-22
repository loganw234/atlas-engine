vec3 shape_bifurc_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3741239531u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_burn = int(P[0] + 0.5);
  float r_1 = mix(P[1], P[2], q.x);
  float mt_2 = P[4];
  float rs_3 = (r_1 * 0.25);
  float mu_4 = (r_1 * 0.5);
  pt = hashu(pt);
  float draw_5 = u2f(pt);
  float x0_6 = (0.2 + (0.6 * draw_5));
  pt = hashu(pt);
  int pick_7 = min(int(u2f(pt) * float(60)), 60 - 1);
  int extra_8 = pick_7;
  float ob_9_x = x0_6;
  int ob_9_count = 0;
  bool ob_9_esc = false;
  for (int ok_10 = 0; ok_10 < 500; ok_10++) {
    if (ok_10 >= li_burn) break;
    float ob_9_t_11 = (((mt_2 == 0.0)) ? ((r_1 * ob_9_x) * ((1.0 - ob_9_x))) : (((mt_2 == 1.0)) ? (rs_3 * sin((PI * ob_9_x))) : ((((ob_9_x < 0.5)) ? (mu_4 * ob_9_x) : (mu_4 * ((1.0 - ob_9_x)))))));
    ob_9_x = ob_9_t_11;
    ob_9_count += 1;
  }
  float ob_12_x = ob_9_x;
  float ob_12_n = 0.0;
  float ob_12_acc = 0.0;
  int ob_12_count = 0;
  bool ob_12_esc = false;
  for (int ok_13 = 0; ok_13 < 60; ok_13++) {
    if ((ob_12_n >= float(extra_8))) { ob_12_esc = true; break; }
    float ob_12_t_14 = (((mt_2 == 0.0)) ? ((r_1 * ob_12_x) * ((1.0 - ob_12_x))) : (((mt_2 == 1.0)) ? (rs_3 * sin((PI * ob_12_x))) : ((((ob_12_x < 0.5)) ? (mu_4 * ob_12_x) : (mu_4 * ((1.0 - ob_12_x)))))));
    float ob_12_t_15 = (ob_12_n + 1.0);
    float ob_12_t_16 = (ob_12_acc + log((abs((((mt_2 == 0.0)) ? (r_1 * ((1.0 - (2.0 * ob_12_x)))) : (((mt_2 == 1.0)) ? ((rs_3 * PI) * cos((PI * ob_12_x))) : ((((ob_12_x < 0.5)) ? mu_4 : (-mu_4)))))) + 1.0e-9)));
    ob_12_x = ob_12_t_14;
    ob_12_n = ob_12_t_15;
    ob_12_acc = ob_12_t_16;
    ob_12_count += 1;
  }
  float lam_17 = (ob_12_acc / max(float(ob_12_count), 1.0));
  float pz_18 = (P[3] * clamp(lam_17, (-1.0), 1.0));
  float dep_c_19 = (((q.x - 0.5)) * 2.6);
  float dep_c_20 = (((ob_12_x - 0.5)) * 2.2);
  float dep_c_21 = pz_18;
  vec3 dep_col_22 = (mix(vec3(0.3, 0.6, 1.0), vec3(1.0, 0.5, 0.2), smoothstep((-0.12), 0.12, lam_17)) * (0.4 + (0.9 * P[5])));
  col = dep_col_22;
  return vec3(dep_c_19, dep_c_20, dep_c_21);
}
