vec3 shape_ford_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3998221037u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_depth = int(P[3] + 0.5);
  float md_1 = floor((P[0] + 0.5));
  float QM_2 = P[1];
  float xs_3 = (P[4] * 2.0);
  float lift_4 = (P[5] * 0.32);
  float vgl_5 = (0.5 + (0.7 * P[6]));
  float px_6 = 0.0;
  float py_7 = 0.0;
  float pz_8 = 0.0;
  vec3 tint_9 = vec3(0.0, 0.0, 0.0);
  float bright_10 = 0.0;
  if ((md_1 < 0.5)) {
    pt = hashu(pt);
    float draw_11 = u2f(pt);
    float ub_12 = pow(draw_11, 2.2);
    float qd_13 = (1.0 + floor((ub_12 * ((QM_2 - 0.001)))));
    pt = hashu(pt);
    float draw_14 = u2f(pt);
    float pn_15 = floor((draw_14 * ((qd_13 + 1.0))));
    float pd_16 = ((((pn_15 > qd_13))) ? qd_13 : pn_15);
    float ob_17_a = pd_16;
    float ob_17_b = qd_13;
    int ob_17_count = 0;
    bool ob_17_esc = false;
    for (int ok_18 = 0; ok_18 < 14; ok_18++) {
      if ((ob_17_b == 0.0)) { ob_17_esc = true; break; }
      float ob_17_t_19 = ob_17_b;
      float ob_17_t_20 = mod(ob_17_a, ob_17_b);
      ob_17_a = ob_17_t_19;
      ob_17_b = ob_17_t_20;
      ob_17_count += 1;
    }
    if ((ob_17_a > 1.0)) {
      col = vec3(0.0);
      return vec3(0.0, -20000.0, 0.0);
    }
    float r_21 = (0.5 / ((qd_13 * qd_13)));
    float fx_22 = (pd_16 / qd_13);
    float ang_23 = (q.x * TAU);
    float cx_24 = (fx_22 + (r_21 * sin(ang_23)));
    float cy_25 = (r_21 * ((1.0 - cos(ang_23))));
    float ex_26 = 0.45454545;
    float pq_27 = (pow((qd_13 / QM_2), ex_26) - pow(max((((qd_13 - 1.0)) / QM_2), 1.0e-9), ex_26));
    float nq_28 = max((pq_27 / ((qd_13 + 1.0))), 1.0e-7);
    float q0_29 = sqrt(QM_2);
    float n0_30 = (((pow((q0_29 / QM_2), ex_26) - pow(max((((q0_29 - 1.0)) / QM_2), 1.0e-9), ex_26))) / ((q0_29 + 1.0)));
    float ratio_31 = (n0_30 / nq_28);
    float wC_32 = min(ratio_31, 32.0);
    float wA_33 = min((((ratio_31 * q0_29) * q0_29) / ((qd_13 * qd_13))), 32.0);
    float w_34 = mix(wC_32, wA_33, P[2]);
    px_6 = (((cx_24 - 0.5)) * xs_3);
    py_7 = (cy_25 * xs_3);
    pz_8 = (lift_4 * log(qd_13));
    tint_9 = pal(((log(qd_13) / log(2.0)) * 0.16), vec3(0.55, 0.48, 0.40), vec3(0.35, 0.33, 0.30), vec3(1.0, 0.9, 0.7), vec3(0.0, 0.15, 0.35));
    bright_10 = ((w_34 * vgl_5) * ((1.0 + (0.25 * sin((ang_23 - (uT * ((0.4 + (0.08 * min(qd_13, 25.0)))))))))));
  } else {
    float D_35 = max(2.0, min(24.0, floor((P[3] + 0.5))));
    pt = hashu(pt);
    float draw_36 = u2f(pt);
    float ks_37 = min(floor((draw_36 * ((D_35 - 1.0)))), (D_35 - 2.0));
    float ob_38_pl = 0.0;
    float ob_38_ql = 1.0;
    float ob_38_pr = 1.0;
    float ob_38_qr = 1.0;
    float ob_38_pA = 1.0;
    float ob_38_qA = 2.0;
    float ob_38_pB = 1.0;
    float ob_38_qB = 2.0;
    pt = hashu(pt);
    float draw_39 = u2f(pt);
    float ob_38_coin = draw_39;
    int ob_38_count = 0;
    bool ob_38_esc = false;
    for (int ok_40 = 0; ok_40 < 24; ok_40++) {
      if (ok_40 >= li_depth) break;
      float ob_38_t_41 = ((((ob_38_coin < 0.5))) ? ob_38_pl : ((ob_38_pl + ob_38_pr)));
      float ob_38_t_42 = ((((ob_38_coin < 0.5))) ? ob_38_ql : ((ob_38_ql + ob_38_qr)));
      float ob_38_t_43 = ((((ob_38_coin < 0.5))) ? ((ob_38_pl + ob_38_pr)) : ob_38_pr);
      float ob_38_t_44 = ((((ob_38_coin < 0.5))) ? ((ob_38_ql + ob_38_qr)) : ob_38_qr);
      float ob_38_t_45 = ((((float(ok_40) == ks_37))) ? ((ob_38_pl + ob_38_pr)) : ob_38_pA);
      float ob_38_t_46 = ((((float(ok_40) == ks_37))) ? ((ob_38_ql + ob_38_qr)) : ob_38_qA);
      float ob_38_t_47 = ((((float(ok_40) == (ks_37 + 1.0)))) ? ((ob_38_pl + ob_38_pr)) : ob_38_pB);
      float ob_38_t_48 = ((((float(ok_40) == (ks_37 + 1.0)))) ? ((ob_38_ql + ob_38_qr)) : ob_38_qB);
      pt = hashu(pt);
      float draw_49 = u2f(pt);
      float ob_38_t_50 = draw_49;
      ob_38_pl = ob_38_t_41;
      ob_38_ql = ob_38_t_42;
      ob_38_pr = ob_38_t_43;
      ob_38_qr = ob_38_t_44;
      ob_38_pA = ob_38_t_45;
      ob_38_qA = ob_38_t_46;
      ob_38_pB = ob_38_t_47;
      ob_38_qB = ob_38_t_48;
      ob_38_coin = ob_38_t_50;
      ob_38_count += 1;
    }
    float tt_51 = q.x;
    float xA_52 = (ob_38_pA / ob_38_qA);
    float xB_53 = (ob_38_pB / ob_38_qB);
    px_6 = mix((((xA_52 - 0.5)) * xs_3), (((xB_53 - 0.5)) * xs_3), tt_51);
    py_7 = mix((xs_3 / ((ob_38_qA * ob_38_qA))), (xs_3 / ((ob_38_qB * ob_38_qB))), tt_51);
    pz_8 = mix((lift_4 * log(ob_38_qA)), (lift_4 * log(ob_38_qB)), tt_51);
    float hq_54 = mix(ob_38_qA, ob_38_qB, tt_51);
    tint_9 = pal(((log(hq_54) / log(2.0)) * 0.16), vec3(0.55, 0.48, 0.40), vec3(0.35, 0.33, 0.30), vec3(1.0, 0.9, 0.7), vec3(0.0, 0.15, 0.35));
    bright_10 = (vgl_5 * ((0.65 + (0.35 * sin((((TAU * tt_51) - (uT * 1.1)) + (ks_37 * 1.7)))))));
  }
  float dep_c_55 = px_6;
  float dep_c_56 = py_7;
  float dep_c_57 = pz_8;
  vec3 dep_col_58 = tint_9;
  float dep_glow_59 = bright_10;
  col = dep_col_58 * dep_glow_59;
  return vec3(dep_c_55, dep_c_56, dep_c_57);
}
