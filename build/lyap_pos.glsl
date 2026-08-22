vec3 shape_lyap_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3447483707u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_steps = int(P[1] + 0.5);
  float sq_1 = P[0];
  int per_2 = 0;
  if ((sq_1 == 0.0)) {
    per_2 = 2;
  } else {
    if ((sq_1 <= 2.0)) {
      per_2 = 3;
    } else {
      per_2 = 4;
    }
  }
  float aLo_3 = P[3];
  float span_4 = min(P[4], (4.0 - aLo_3));
  pt = hashu(pt);
  float jx_5 = u2f(pt) - 0.5;
  pt = hashu(pt);
  vec2 jit_6 = vec2(jx_5, u2f(pt) - 0.5);
  vec2 jt_7 = jit_6;
  float a_8 = clamp((aLo_3 + (((q.x + (jt_7.x * 0.0015))) * span_4)), 2.4, 4.0);
  float b_9 = clamp((aLo_3 + (((q.y + (jt_7.y * 0.0015))) * span_4)), 2.4, 4.0);
  pt = hashu(pt);
  float draw_10 = u2f(pt);
  float x0_11 = (0.25 + (0.5 * draw_10));
  float ob_12_x = x0_11;
  float ob_12_m = 0.0;
  int ob_12_count = 0;
  bool ob_12_esc = false;
  for (int ok_13 = 0; ok_13 < 40; ok_13++) {
    float ob_12_t_14 = clamp(((((((sq_1 == 0.0)) ? ((((ob_12_m == 0.0)) ? a_8 : b_9)) : (((sq_1 == 1.0)) ? ((((ob_12_m < 2.0)) ? a_8 : b_9)) : (((sq_1 == 2.0)) ? ((((ob_12_m == 0.0)) ? a_8 : b_9)) : (((sq_1 == 3.0)) ? ((((ob_12_m < 2.0)) ? a_8 : b_9)) : (((sq_1 == 4.0)) ? ((((ob_12_m < 3.0)) ? a_8 : b_9)) : ((((ob_12_m == 0.0)) ? a_8 : b_9)))))))) * ob_12_x) * ((1.0 - ob_12_x))), 1.0e-6, (1.0 - 1.0e-6));
    float ob_12_t_15 = mod((ob_12_m + 1.0), float(per_2));
    ob_12_x = ob_12_t_14;
    ob_12_m = ob_12_t_15;
    ob_12_count += 1;
  }
  float ob_16_x = ob_12_x;
  float ob_16_m = ob_12_m;
  float ob_16_acc = 0.0;
  int ob_16_count = 0;
  bool ob_16_esc = false;
  for (int ok_17 = 0; ok_17 < 384; ok_17++) {
    if (ok_17 >= li_steps) break;
    float ob_16_t_18 = clamp(((((((sq_1 == 0.0)) ? ((((ob_16_m == 0.0)) ? a_8 : b_9)) : (((sq_1 == 1.0)) ? ((((ob_16_m < 2.0)) ? a_8 : b_9)) : (((sq_1 == 2.0)) ? ((((ob_16_m == 0.0)) ? a_8 : b_9)) : (((sq_1 == 3.0)) ? ((((ob_16_m < 2.0)) ? a_8 : b_9)) : (((sq_1 == 4.0)) ? ((((ob_16_m < 3.0)) ? a_8 : b_9)) : ((((ob_16_m == 0.0)) ? a_8 : b_9)))))))) * ob_16_x) * ((1.0 - ob_16_x))), 1.0e-6, (1.0 - 1.0e-6));
    float ob_16_t_19 = mod((ob_16_m + 1.0), float(per_2));
    float ob_16_t_20 = (ob_16_acc + log(max(abs((((((sq_1 == 0.0)) ? ((((ob_16_m == 0.0)) ? a_8 : b_9)) : (((sq_1 == 1.0)) ? ((((ob_16_m < 2.0)) ? a_8 : b_9)) : (((sq_1 == 2.0)) ? ((((ob_16_m == 0.0)) ? a_8 : b_9)) : (((sq_1 == 3.0)) ? ((((ob_16_m < 2.0)) ? a_8 : b_9)) : (((sq_1 == 4.0)) ? ((((ob_16_m < 3.0)) ? a_8 : b_9)) : ((((ob_16_m == 0.0)) ? a_8 : b_9)))))))) * ((1.0 - (2.0 * ob_16_x))))), 1.0e-12)));
    ob_16_x = ob_16_t_18;
    ob_16_m = ob_16_t_19;
    ob_16_acc = ob_16_t_20;
    ob_16_count += 1;
  }
  float lam_21 = clamp((ob_16_acc / max(float(ob_16_count), 1.0)), (-4.0), 4.0);
  float u_22 = (((a_8 - aLo_3)) / max(span_4, 1.0e-6));
  float v_23 = (((b_9 - aLo_3)) / max(span_4, 1.0e-6));
  float relief_24 = clamp((-lam_21), (-1.0), 2.5);
  float bay_25 = (1.0 - smoothstep((-0.06), 0.06, lam_21));
  float rise_26 = clamp(((-lam_21) * 0.4), 0.0, 1.0);
  vec3 warm_27 = (pal(((0.15 + (0.35 * rise_26)) + (0.3 * ((P[5] - 0.5)))), vec3(0.46, 0.50, 0.16), vec3(0.36, 0.42, 0.12), vec3(1.0, 1.0, 1.0), vec3(0.54, 0.50, 0.0)) * (0.55 + (0.75 * rise_26)));
  vec3 cold_28 = (vec3(0.09, 0.14, 0.30) * (1.0 - (0.4 * clamp((lam_21 * 0.8), 0.0, 1.0))));
  float dep_c_29 = (((u_22 - 0.5)) * 2.4);
  float dep_c_30 = ((relief_24 * P[2]) * 0.4);
  float dep_c_31 = (((v_23 - 0.5)) * 2.4);
  vec3 dep_col_32 = (mix(cold_28, warm_27, bay_25) * (0.4 + (0.9 * P[6])));
  col = dep_col_32;
  return vec3(dep_c_29, dep_c_30, dep_c_31);
}
