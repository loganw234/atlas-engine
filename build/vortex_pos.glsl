vec3 shape_vortex_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 233254921u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float KW_1 = 20.0;
  float lf_2 = max((-5.0), min(5.0, floor((P[0] + 0.5))));
  float Lf_3 = abs(lf_2);
  float pnf_4 = max(0.0, min(3.0, floor((P[1] + 0.5))));
  float md_5 = max(0.0, min(2.0, floor((P[2] + 0.5))));
  float w0_6 = max(0.08, P[3]);
  float zR_7 = (((0.5 * KW_1) * w0_6) * w0_6);
  pt = hashu(pt);
  float draw_8 = u2f(pt);
  float dz_9 = draw_8;
  float zp_10 = (P[4] * (((2.0 * dz_9) - 1.0)));
  float wz_11 = (w0_6 * sqrt((1.0 + (((zp_10 / zR_7)) * ((zp_10 / zR_7))))));
  float envf_12 = ((2.6 + (0.4 * Lf_3)) + (0.35 * pnf_4));
  float Rmax_13 = min((envf_12 * wz_11), 1.45);
  float rr_14 = (Rmax_13 * sqrt(q.x));
  float ph_15 = (TAU * q.y);
  float rc_16 = (0.25 * wz_11);
  pt = hashu(pt);
  float draw_17 = u2f(pt);
  float core_18 = draw_17;
  if ((core_18 < 0.02)) {
    pt = hashu(pt);
    float draw_19 = u2f(pt);
    rr_14 = (rc_16 * sqrt(draw_19));
  }
  float xv_20 = (((2.0 * rr_14) * rr_14) / ((wz_11 * wz_11)));
  float sq_21 = sqrt(max(xv_20, 0.0));
  float psi_22 = atan(zp_10, zR_7);
  float curv_23 = (((((0.5 * KW_1) * rr_14) * rr_14) * zp_10) / (((zp_10 * zp_10) + (zR_7 * zR_7))));
  float tw_24 = (uT * ((2.0 * P[5])));
  float inten_25 = 0.0;
  float phase_26 = 0.0;
  if ((md_5 == 2.0)) {
    float ob_27_m = 1.0e-6;
    float ob_27_xk = 0.0;
    float ob_27_sk = 0.0;
    int ob_27_count = 0;
    bool ob_27_esc = false;
    for (int ok_28 = 0; ok_28 < 31; ok_28++) {
      float ob_27_t_29 = max(ob_27_m, abs(((((((Lf_3 == 0.0))) ? 1.0 : ((((Lf_3 == 1.0))) ? ob_27_sk : ((((Lf_3 == 2.0))) ? (ob_27_sk * ob_27_sk) : ((((Lf_3 == 3.0))) ? ((ob_27_sk * ob_27_sk) * ob_27_sk) : ((((Lf_3 == 4.0))) ? (((ob_27_sk * ob_27_sk) * ob_27_sk) * ob_27_sk) : ((((ob_27_sk * ob_27_sk) * ob_27_sk) * ob_27_sk) * ob_27_sk))))))) * exp(((-0.5) * ob_27_xk)))));
      float ob_27_t_30 = (0.2 * float(((ok_28 + 1))));
      float ob_27_t_31 = sqrt(max((0.2 * float(((ok_28 + 1)))), 0.0));
      ob_27_m = ob_27_t_29;
      ob_27_xk = ob_27_t_30;
      ob_27_sk = ob_27_t_31;
      ob_27_count += 1;
    }
    float ob_32_m = 1.0e-6;
    float ob_32_xk = 0.0;
    float ob_32_sk = 0.0;
    int ob_32_count = 0;
    bool ob_32_esc = false;
    for (int ok_33 = 0; ok_33 < 31; ok_33++) {
      float ob_32_t_34 = max(ob_32_m, abs((((((((Lf_3 == 0.0))) ? 1.0 : ((((Lf_3 == 1.0))) ? ob_32_sk : ((((Lf_3 == 2.0))) ? (ob_32_sk * ob_32_sk) : ((((Lf_3 == 3.0))) ? ((ob_32_sk * ob_32_sk) * ob_32_sk) : ((((Lf_3 == 4.0))) ? (((ob_32_sk * ob_32_sk) * ob_32_sk) * ob_32_sk) : ((((ob_32_sk * ob_32_sk) * ob_32_sk) * ob_32_sk) * ob_32_sk))))))) * (((1.0 + Lf_3) - ob_32_xk))) * exp(((-0.5) * ob_32_xk)))));
      float ob_32_t_35 = (0.2 * float(((ok_33 + 1))));
      float ob_32_t_36 = sqrt(max((0.2 * float(((ok_33 + 1)))), 0.0));
      ob_32_m = ob_32_t_34;
      ob_32_xk = ob_32_t_35;
      ob_32_sk = ob_32_t_36;
      ob_32_count += 1;
    }
    float pk_37 = (ob_27_m + ob_32_m);
    float A0_38 = (((((((Lf_3 == 0.0))) ? 1.0 : ((((Lf_3 == 1.0))) ? sq_21 : ((((Lf_3 == 2.0))) ? (sq_21 * sq_21) : ((((Lf_3 == 3.0))) ? ((sq_21 * sq_21) * sq_21) : ((((Lf_3 == 4.0))) ? (((sq_21 * sq_21) * sq_21) * sq_21) : ((((sq_21 * sq_21) * sq_21) * sq_21) * sq_21))))))) * exp(((-0.5) * xv_20))) / pk_37);
    float A1_39 = ((((((((Lf_3 == 0.0))) ? 1.0 : ((((Lf_3 == 1.0))) ? sq_21 : ((((Lf_3 == 2.0))) ? (sq_21 * sq_21) : ((((Lf_3 == 3.0))) ? ((sq_21 * sq_21) * sq_21) : ((((Lf_3 == 4.0))) ? (((sq_21 * sq_21) * sq_21) * sq_21) : ((((sq_21 * sq_21) * sq_21) * sq_21) * sq_21))))))) * (((1.0 + Lf_3) - xv_20))) * exp(((-0.5) * xv_20))) / pk_37);
    float ux_40 = (A0_38 + (A1_39 * cos((2.0 * psi_22))));
    float uy_41 = ((-A1_39) * sin((2.0 * psi_22)));
    inten_25 = ((ux_40 * ux_40) + (uy_41 * uy_41));
    float ex_42 = (((((abs(ux_40) + abs(uy_41)) > 1.0e-9))) ? atan(uy_41, ux_40) : 0.0);
    phase_26 = ((((((lf_2 * ph_15) + (KW_1 * zp_10)) + curv_23) - (((Lf_3 + 1.0)) * psi_22)) - tw_24) + ex_42);
  } else {
    float ob_43_m = 1.0e-6;
    float ob_43_xk = 0.0;
    float ob_43_sk = 0.0;
    int ob_43_count = 0;
    bool ob_43_esc = false;
    for (int ok_44 = 0; ok_44 < 31; ok_44++) {
      float ob_43_t_45 = max(ob_43_m, abs((((((((Lf_3 == 0.0))) ? 1.0 : ((((Lf_3 == 1.0))) ? ob_43_sk : ((((Lf_3 == 2.0))) ? (ob_43_sk * ob_43_sk) : ((((Lf_3 == 3.0))) ? ((ob_43_sk * ob_43_sk) * ob_43_sk) : ((((Lf_3 == 4.0))) ? (((ob_43_sk * ob_43_sk) * ob_43_sk) * ob_43_sk) : ((((ob_43_sk * ob_43_sk) * ob_43_sk) * ob_43_sk) * ob_43_sk))))))) * (((((pnf_4 <= 0.0))) ? 1.0 : ((((pnf_4 == 1.0))) ? ((1.0 + Lf_3) - ob_43_xk) : ((((pnf_4 == 2.0))) ? ((((0.5 * ob_43_xk) * ob_43_xk) - (((Lf_3 + 2.0)) * ob_43_xk)) + ((0.5 * ((Lf_3 + 1.0))) * ((Lf_3 + 2.0)))) : (((((((-ob_43_xk) * ob_43_xk) * ob_43_xk) / 6.0) + (((0.5 * ((Lf_3 + 3.0))) * ob_43_xk) * ob_43_xk)) - (((0.5 * ((Lf_3 + 2.0))) * ((Lf_3 + 3.0))) * ob_43_xk)) + (((((Lf_3 + 1.0)) * ((Lf_3 + 2.0))) * ((Lf_3 + 3.0))) / 6.0))))))) * exp(((-0.5) * ob_43_xk)))));
      float ob_43_t_46 = (0.2 * float(((ok_44 + 1))));
      float ob_43_t_47 = sqrt(max((0.2 * float(((ok_44 + 1)))), 0.0));
      ob_43_m = ob_43_t_45;
      ob_43_xk = ob_43_t_46;
      ob_43_sk = ob_43_t_47;
      ob_43_count += 1;
    }
    float A_48 = ((((((((Lf_3 == 0.0))) ? 1.0 : ((((Lf_3 == 1.0))) ? sq_21 : ((((Lf_3 == 2.0))) ? (sq_21 * sq_21) : ((((Lf_3 == 3.0))) ? ((sq_21 * sq_21) * sq_21) : ((((Lf_3 == 4.0))) ? (((sq_21 * sq_21) * sq_21) * sq_21) : ((((sq_21 * sq_21) * sq_21) * sq_21) * sq_21))))))) * (((((pnf_4 <= 0.0))) ? 1.0 : ((((pnf_4 == 1.0))) ? ((1.0 + Lf_3) - xv_20) : ((((pnf_4 == 2.0))) ? ((((0.5 * xv_20) * xv_20) - (((Lf_3 + 2.0)) * xv_20)) + ((0.5 * ((Lf_3 + 1.0))) * ((Lf_3 + 2.0)))) : (((((((-xv_20) * xv_20) * xv_20) / 6.0) + (((0.5 * ((Lf_3 + 3.0))) * xv_20) * xv_20)) - (((0.5 * ((Lf_3 + 2.0))) * ((Lf_3 + 3.0))) * xv_20)) + (((((Lf_3 + 1.0)) * ((Lf_3 + 2.0))) * ((Lf_3 + 3.0))) / 6.0))))))) * exp(((-0.5) * xv_20))) / ob_43_m);
    if ((md_5 == 1.0)) {
      float a2_49 = (A_48 * cos(((lf_2 * ph_15) + ((0.15 * P[5]) * uT))));
      inten_25 = (a2_49 * a2_49);
      phase_26 = ((((KW_1 * zp_10) + curv_23) - (((((2.0 * pnf_4) + Lf_3) + 1.0)) * psi_22)) - tw_24);
      if ((a2_49 < 0.0)) {
        phase_26 += PI;
      }
    } else {
      inten_25 = (A_48 * A_48);
      phase_26 = (((((lf_2 * ph_15) + (KW_1 * zp_10)) + curv_23) - (((((2.0 * pnf_4) + Lf_3) + 1.0)) * psi_22)) - tw_24);
      if ((A_48 < 0.0)) {
        phase_26 += PI;
      }
    }
  }
  float cw_50 = (Rmax_13 / ((envf_12 * wz_11)));
  float dens_51 = (0.98 + (((((rr_14 < rc_16))) ? (((0.02 * Rmax_13) * Rmax_13) / ((rc_16 * rc_16))) : 0.0)));
  inten_25 = (((clamp(inten_25, 0.0, 1.0) * cw_50) * cw_50) / dens_51);
  if ((inten_25 < 2.0e-4)) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float dep_c_52 = zp_10;
  float dep_c_53 = (rr_14 * cos(ph_15));
  float dep_c_54 = (rr_14 * sin(ph_15));
  vec3 dep_col_55 = (pal(fract((phase_26 / TAU)), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67)) * inten_25);
  float dep_glow_56 = (0.45 + (0.9 * P[6]));
  col = dep_col_55 * dep_glow_56;
  return vec3(dep_c_52, dep_c_53, dep_c_54);
}
