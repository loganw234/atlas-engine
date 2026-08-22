vec3 shape_wavecat_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3425474409u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float form_1 = floor((P[0] + 0.5));
  float fs_2 = P[1];
  float drop_3 = max(P[2], 0.05);
  float tint_4 = clamp(P[4], 0.0, 1.0);
  float vgl_5 = (0.35 + (0.85 * P[5]));
  vec3 warm_6 = vec3(1.00, 0.76, 0.53);
  float sMin_7 = (-((3.0 + (7.0 * fs_2))));
  float sMax_8 = (1.0 + (2.0 * fs_2));
  if ((form_1 == 1.0)) {
    float ps_9 = (0.65 + (0.35 * fs_2));
    float sz_10 = (1.30 / ((4.75 * ps_9)));
    float sy_11 = (1.30 / ((6.50 * ps_9)));
    float X_12 = 0.0;
    float Y_13 = 0.0;
    vec3 cv_14 = vec3(0.0, 0.0, 0.0);
    pt = hashu(pt);
    float draw_15 = u2f(pt);
    float coin_16 = draw_15;
    if ((coin_16 < 0.03)) {
      float tp_17 = mix((-1.15), 1.15, q.x);
      X_12 = (((-6.0) * tp_17) * tp_17);
      Y_13 = (((8.0 * tp_17) * tp_17) * tp_17);
      cv_14 = ((vec3(0.62, 0.78, 1.00) * 0.055) * vgl_5);
    } else {
      X_12 = (mix((-6.5), 3.0, q.x) * ps_9);
      Y_13 = (mix((-6.5), 6.5, q.y) * ps_9);
      float NS_18 = clamp(floor((P[3] + 0.5)), 8.0, 256.0);
      float T_19 = clamp(pow((0.275 * NS_18), 0.25), 2.0, 3.2);
      float dt_20 = ((2.0 * T_19) / NS_18);
      float T2_21 = (T_19 * T_19);
      float ob_22_sr = 0.0;
      float ob_22_si = 0.0;
      float ob_22_tt = ((-T_19) + (0.5 * dt_20));
      float ob_22_i = 0.0;
      int ob_22_count = 0;
      bool ob_22_esc = false;
      for (int ok_23 = 0; ok_23 < 256; ok_23++) {
        if ((ob_22_i >= NS_18)) { ob_22_esc = true; break; }
        float ob_22_t_24 = (ob_22_sr + (exp(((-((((((ob_22_tt * ob_22_tt)) / T2_21)) * ((((ob_22_tt * ob_22_tt)) / T2_21))))) * ((((((ob_22_tt * ob_22_tt)) / T2_21)) * ((((ob_22_tt * ob_22_tt)) / T2_21)))))) * cos((((((ob_22_tt * ob_22_tt)) * ((ob_22_tt * ob_22_tt))) + (X_12 * ((ob_22_tt * ob_22_tt)))) + (Y_13 * ob_22_tt)))));
        float ob_22_t_25 = (ob_22_si + (exp(((-((((((ob_22_tt * ob_22_tt)) / T2_21)) * ((((ob_22_tt * ob_22_tt)) / T2_21))))) * ((((((ob_22_tt * ob_22_tt)) / T2_21)) * ((((ob_22_tt * ob_22_tt)) / T2_21)))))) * sin((((((ob_22_tt * ob_22_tt)) * ((ob_22_tt * ob_22_tt))) + (X_12 * ((ob_22_tt * ob_22_tt)))) + (Y_13 * ob_22_tt)))));
        float ob_22_t_26 = ((-T_19) + (((float(((ok_23 + 1))) + 0.5)) * dt_20));
        float ob_22_t_27 = (ob_22_i + 1.0);
        ob_22_sr = ob_22_t_24;
        ob_22_si = ob_22_t_25;
        ob_22_tt = ob_22_t_26;
        ob_22_i = ob_22_t_27;
        ob_22_count += 1;
      }
      float sr_28 = (ob_22_sr * dt_20);
      float si_29 = (ob_22_si * dt_20);
      float Ir_30 = ((((sr_28 * sr_28) + (si_29 * si_29))) / 3.29);
      float Ip_31 = (Ir_30 / ((1.0 + (0.46 * Ir_30))));
      cv_14 = (((mix(vec3(0.85, 0.50, 0.26), vec3(1.02, 0.86, 0.66), clamp(Ip_31, 0.0, 1.0)) * Ip_31) * vgl_5) * 1.05);
    }
    float wpx_32 = (Y_13 * sy_11);
    float wpz_33 = (((X_12 + (1.75 * ps_9))) * sz_10);
    if (((abs(wpx_32) > 1.305) || (abs(wpz_33) > 1.305))) {
      col = vec3(0.0);
      return vec3(0.0, -20000.0, 0.0);
    }
    float dep_c_34 = wpx_32;
    float dep_c_35 = 0.0;
    float dep_c_36 = wpz_33;
    vec3 dep_col_37 = cv_14;
    col = dep_col_37;
    return vec3(dep_c_34, dep_c_35, dep_c_36);
  }
  float sv_38 = 0.0;
  float wrf_39 = 0.0;
  float lt_40 = 0.0;
  if ((form_1 == 2.0)) {
    pt = hashu(pt);
    float draw_41 = u2f(pt);
    lt_40 = draw_41;
    sv_38 = mix(sMin_7, sMax_8, q.y);
  } else {
    pt = hashu(pt);
    float draw_42 = u2f(pt);
    float coin_43 = draw_42;
    wrf_39 = ((((coin_43 < 0.02))) ? 1.0 : 0.0);
    sv_38 = ((((wrf_39 > 0.5))) ? 0.0 : mix(sMin_7, sMax_8, q.y));
  }
  float ax_44 = max(abs(sv_38), 1.0e-8);
  float z_45 = (0.66666667 * pow(ax_44, 1.5));
  float am_46 = (1.0 / ((1.77245385 * pow(ax_44, 0.25))));
  float cq_47 = (5.0 / ((72.0 * max(z_45, 1.0e-3))));
  float ai_48 = 0.0;
  if ((sv_38 > 3.0)) {
    ai_48 = (((0.5 * am_46) * exp((-min(z_45, 60.0)))) * ((1.0 - cq_47)));
  } else {
    if ((sv_38 < (-7.0))) {
      ai_48 = (am_46 * ((sin((z_45 + (0.25 * PI))) - (cq_47 * cos((z_45 + (0.25 * PI)))))));
    } else {
      float x3_49 = ((sv_38 * sv_38) * sv_38);
      float ob_50_f = 1.0;
      float ob_50_af = 1.0;
      float ob_50_g = sv_38;
      float ob_50_bg = sv_38;
      int ob_50_count = 0;
      bool ob_50_esc = false;
      for (int ok_51 = 0; ok_51 < 24; ok_51++) {
        float ob_50_t_52 = (ob_50_af * ((x3_49 / (((((3.0 * float(ok_51)) + 2.0)) * (((3.0 * float(ok_51)) + 3.0)))))));
        float ob_50_t_53 = (ob_50_f + (ob_50_af * ((x3_49 / (((((3.0 * float(ok_51)) + 2.0)) * (((3.0 * float(ok_51)) + 3.0))))))));
        float ob_50_t_54 = (ob_50_bg * ((x3_49 / (((((3.0 * float(ok_51)) + 3.0)) * (((3.0 * float(ok_51)) + 4.0)))))));
        float ob_50_t_55 = (ob_50_g + (ob_50_bg * ((x3_49 / (((((3.0 * float(ok_51)) + 3.0)) * (((3.0 * float(ok_51)) + 4.0))))))));
        ob_50_af = ob_50_t_52;
        ob_50_f = ob_50_t_53;
        ob_50_bg = ob_50_t_54;
        ob_50_g = ob_50_t_55;
        ob_50_count += 1;
      }
      float ser_56 = ((0.3550280539 * ob_50_f) - (0.2588194038 * ob_50_g));
      if ((sv_38 > (-6.0))) {
        ai_48 = ser_56;
      } else {
        ai_48 = mix(ser_56, (am_46 * ((sin((z_45 + (0.25 * PI))) - (cq_47 * cos((z_45 + (0.25 * PI))))))), ((-sv_38) - 6.0));
      }
    }
  }
  if ((form_1 == 2.0)) {
    float lam_57 = mix(400.0, 700.0, lt_40);
    float nr_58 = (1.3247 + (3088.5 / ((lam_57 * lam_57))));
    float bR_59 = sqrt(max((((4.0 - (nr_58 * nr_58))) / 3.0), 1.0e-6));
    float i0_60 = asin(clamp(bR_59, 0.0, 0.999999));
    float t0_61 = asin(clamp((bR_59 / nr_58), 0.0, 0.999999));
    float thR_62 = ((4.0 * t0_61) - (2.0 * i0_60));
    float wRf_63 = (0.0044 * pow((1.0 / drop_3), 0.66666667));
    float cw_64 = pow((lam_57 / 600.0), 0.66666667);
    float wA_65 = (wRf_63 * cw_64);
    float th_66 = (thR_62 + (sv_38 * wA_65));
    float lo_67 = (0.70694 + ((sMin_7 * wRf_63) * 1.12));
    float hi_68 = (0.73949 + ((sMax_8 * wRf_63) * 1.12));
    float Mg_69 = (0.84 / max((hi_68 - lo_67), 1.0e-3));
    float rho_70 = (0.97 + (Mg_69 * ((th_66 - (0.5 * ((lo_67 + hi_68)))))));
    float phi_71 = mix((-1.05), 1.05, q.x);
    float I2_72 = ((ai_48 * ai_48) / 0.28693);
    float p0_73 = (1.0 * sin((0.22 * uT)));
    float swp_74 = (0.30 * exp((((-((phi_71 - p0_73))) * ((phi_71 - p0_73))) / 0.03)));
    float lc_75 = clamp(lt_40, 0.0, 1.0);
    float cr_76 = (smoothstep(0.42, 0.66, lc_75) + (0.26 * ((1.0 - smoothstep(0.0, 0.20, lc_75)))));
    float cg_77 = (smoothstep(0.12, 0.40, lc_75) * ((1.0 - smoothstep(0.58, 0.90, lc_75))));
    float cb_78 = (1.0 - smoothstep(0.24, 0.52, lc_75));
    vec3 cA_79 = (mix(warm_6, vec3(cr_76, cg_77, cb_78), tint_4) * I2_72);
    vec3 cB_80 = ((cA_79 * rho_70) * cw_64);
    vec3 cv_81 = (((cB_80 * 0.66) * vgl_5) * (1.0 + swp_74));
    pt = hashu(pt);
    float draw_82 = u2f(pt);
    float jy_83 = draw_82;
    float wpx_84 = (rho_70 * sin(phi_71));
    float wpy_85 = (((jy_83 - 0.5)) * 0.05);
    float wpz_86 = ((rho_70 * cos(phi_71)) - 0.83);
    if ((((abs(wpx_84) > 1.48) || (abs(wpy_85) > 1.48)) || (abs(wpz_86) > 1.48))) {
      col = vec3(0.0);
      return vec3(0.0, -20000.0, 0.0);
    }
    float dep_c_87 = wpx_84;
    float dep_c_88 = wpy_85;
    float dep_c_89 = wpz_86;
    vec3 dep_col_90 = cv_81;
    col = dep_col_90;
    return vec3(dep_c_87, dep_c_88, dep_c_89);
  }
  float u_91 = mix((-1.0), 1.0, q.x);
  float Cx_92 = (1.20 * u_91);
  float Cy_93 = ((0.42 * u_91) * u_91);
  float sp_94 = sqrt(((1.20 * 1.20) + (((0.84 * u_91)) * ((0.84 * u_91)))));
  float nvx_95 = ((-((0.84 * u_91))) / max(sp_94, 1.0e-6));
  float nvy_96 = (1.20 / max(sp_94, 1.0e-6));
  float kp_97 = (1.008 / (((sp_94 * sp_94) * sp_94)));
  float nn_98 = ((-sv_38) * ((0.95 / ((3.0 + (7.0 * fs_2))))));
  float I0_99 = ((ai_48 * ai_48) / 0.28693);
  float jc_100 = (sp_94 * max((1.0 - (kp_97 * nn_98)), 0.04));
  float u0_101 = (1.05 * sin((0.22 * uT)));
  float sw_102 = (0.30 * exp((((-((u_91 - u0_101))) * ((u_91 - u0_101))) / 0.03)));
  vec3 tn_103 = warm_6;
  if ((wrf_39 > 0.5)) {
    tn_103 = vec3(0.42, 0.58, 0.88);
  }
  float amp_104 = ((((wrf_39 > 0.5))) ? 0.10 : ((I0_99 * jc_100) * 0.66));
  vec3 cv_105 = (((tn_103 * amp_104) * vgl_5) * (1.0 + sw_102));
  pt = hashu(pt);
  float draw_106 = u2f(pt);
  float jr_107 = draw_106;
  float wpx_108 = (((Cx_92 + (nn_98 * nvx_95))) * 0.95);
  float wpy_109 = (((jr_107 - 0.5)) * 0.05);
  float wpz_110 = ((((Cy_93 + (nn_98 * nvy_96)) - 0.46)) * 0.95);
  if ((((abs(wpx_108) > 1.48) || (abs(wpy_109) > 1.48)) || (abs(wpz_110) > 1.48))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float dep_c_111 = wpx_108;
  float dep_c_112 = wpy_109;
  float dep_c_113 = wpz_110;
  vec3 dep_col_114 = cv_105;
  col = dep_col_114;
  return vec3(dep_c_111, dep_c_112, dep_c_113);
}
