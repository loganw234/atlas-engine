vec3 shape_rainbow_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 558472505u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float mode_1 = floor((P[0] + 0.5));
  float M_2 = (P[1] - 0.001);
  float dsp_3 = P[2];
  float sunw_4 = P[3];
  float fres_5 = P[4];
  float glow_6 = P[5];
  float b_7 = q.x;
  float lt_8 = q.y;
  if ((mode_1 != 0.0)) {
    pt = hashu(pt);
    float draw_9 = u2f(pt);
    lt_8 = draw_9;
  }
  float lam_10 = mix(400.0, 700.0, lt_8);
  float n_11 = (1.3247 + (3088.5 / ((lam_10 * lam_10))));
  n_11 = max((1.3375 + (((n_11 - 1.3375)) * dsp_3)), 1.05);
  float i_12 = asin(clamp(b_7, 0.0, 0.999999));
  float st_13 = clamp((b_7 / n_11), 0.0, 1.0);
  float tr_14 = asin(st_13);
  float ci_15 = sqrt(max((1.0 - (b_7 * b_7)), 1.0e-8));
  float ct_16 = sqrt(max((1.0 - (st_13 * st_13)), 1.0e-8));
  pt = hashu(pt);
  float draw_17 = u2f(pt);
  float u_18 = draw_17;
  float kf_19 = (1.0 + floor(((u_18 * u_18) * M_2)));
  if ((kf_19 > 4.0)) {
    kf_19 = 4.0;
  }
  float psel_20 = max((sqrt(min((kf_19 / M_2), 1.0)) - sqrt((((kf_19 - 1.0)) / M_2))), 1.0e-4);
  float rs_21 = (((ci_15 - (n_11 * ct_16))) / max((ci_15 + (n_11 * ct_16)), 1.0e-6));
  rs_21 = clamp((rs_21 * rs_21), 1.0e-7, 1.0);
  float rp_22 = ((((n_11 * ci_15) - ct_16)) / max(((n_11 * ci_15) + ct_16), 1.0e-6));
  rp_22 = clamp((rp_22 * rp_22), 1.0e-7, 1.0);
  float ts_23 = (1.0 - rs_21);
  float tp_24 = (1.0 - rp_22);
  float D_25 = ((2.0 * ((i_12 - tr_14))) + (kf_19 * ((PI - (2.0 * tr_14)))));
  float px_26 = 0.0;
  float py_27 = 0.0;
  float pz_28 = 0.0;
  float w_29 = 0.0;
  if ((mode_1 == 0.0)) {
    float wf_30 = (0.5 * ((((ts_23 * ts_23) * pow(rs_21, kf_19)) + ((tp_24 * tp_24) * pow(rp_22, kf_19)))));
    w_29 = ((mix(1.0, (9.0 * wf_30), fres_5) * b_7) / psel_20);
    float tv_31 = abs((mod(D_25, TAU) - PI));
    pt = hashu(pt);
    float draw_32 = u2f(pt);
    float gA_33 = draw_32;
    pt = hashu(pt);
    float draw_34 = u2f(pt);
    float gB_35 = draw_34;
    float gj_36 = ((gA_33 + gB_35) - 1.0);
    tv_31 = clamp((tv_31 + ((gj_36 * 0.008727) * sunw_4)), 0.0, PI);
    pt = hashu(pt);
    float draw_37 = u2f(pt);
    float al_38 = (draw_37 * TAU);
    px_26 = (1.25 * ((sin(tv_31) * cos(al_38))));
    py_27 = (1.25 * ((sin(tv_31) * sin(al_38))));
    pz_28 = (1.25 * cos(tv_31));
  } else {
    float a0_39 = (PI - i_12);
    float ca_40 = (PI - (2.0 * tr_14));
    float nseg_41 = (kf_19 + 3.0);
    pt = hashu(pt);
    float draw_42 = u2f(pt);
    float sd_43 = draw_42;
    float sIdx_44 = floor(((sd_43 * nseg_41) * 0.99999));
    if ((sIdx_44 > (kf_19 + 2.0))) {
      sIdx_44 = (kf_19 + 2.0);
    }
    float ax_45 = 0.0;
    float ay_46 = 0.0;
    float bx_47 = 0.0;
    float by_48 = 0.0;
    float es_49 = 0.0;
    float ep_50 = 0.0;
    if ((sIdx_44 == 0.0)) {
      bx_47 = cos(a0_39);
      by_48 = sin(a0_39);
      ax_45 = (bx_47 - 0.7);
      ay_46 = (by_48 - 0.0);
      es_49 = 1.0;
      ep_50 = 1.0;
    } else {
      if ((sIdx_44 <= (kf_19 + 1.0))) {
        float m0_51 = (sIdx_44 - 1.0);
        ax_45 = cos((a0_39 - (m0_51 * ca_40)));
        ay_46 = sin((a0_39 - (m0_51 * ca_40)));
        bx_47 = cos((a0_39 - (((m0_51 + 1.0)) * ca_40)));
        by_48 = sin((a0_39 - (((m0_51 + 1.0)) * ca_40)));
        es_49 = (ts_23 * pow(rs_21, m0_51));
        ep_50 = (tp_24 * pow(rp_22, m0_51));
      } else {
        ax_45 = cos((a0_39 - (((kf_19 + 1.0)) * ca_40)));
        ay_46 = sin((a0_39 - (((kf_19 + 1.0)) * ca_40)));
        bx_47 = (ax_45 + (0.95 * cos(D_25)));
        by_48 = (ay_46 + (0.95 * ((-sin(D_25)))));
        es_49 = ((ts_23 * ts_23) * pow(rs_21, kf_19));
        ep_50 = ((tp_24 * tp_24) * pow(rp_22, kf_19));
      }
    }
    float segLen_52 = length(vec2((bx_47 - ax_45), (by_48 - ay_46)));
    float p2x_53 = mix(ax_45, bx_47, q.y);
    float p2y_54 = mix(ay_46, by_48, q.y);
    w_29 = ((mix(1.0, (0.5 * ((es_49 + ep_50))), fres_5) * clamp(segLen_52, 0.05, 2.0)) * 0.9);
    float b0_55 = (0.5 + (0.45 * sin((0.3 * uT))));
    w_29 *= (1.0 + (0.7 * exp((((-((b_7 - b0_55))) * ((b_7 - b0_55))) / 0.0009))));
    px_26 = (0.72 * p2x_53);
    py_27 = (0.72 * p2y_54);
    pz_28 = 0.0;
  }
  float lc_56 = clamp(lt_8, 0.0, 1.0);
  float cr_57 = (smoothstep(0.40, 0.62, lc_56) + (0.30 * ((1.0 - smoothstep(0.02, 0.22, lc_56)))));
  float cg_58 = (smoothstep(0.10, 0.36, lc_56) * ((1.0 - smoothstep(0.60, 0.88, lc_56))));
  float cb_59 = (1.0 - smoothstep(0.26, 0.50, lc_56));
  float cw_60 = (0.62 + (0.38 * smoothstep(0.0, 0.10, lc_56)));
  float tone_61 = (0.35 + (0.85 * glow_6));
  float dep_c_62 = px_26;
  float dep_c_63 = py_27;
  float dep_c_64 = pz_28;
  vec3 dep_col_65 = vec3((((cr_57 * cw_60) * w_29) * tone_61), (((cg_58 * cw_60) * w_29) * tone_61), (((cb_59 * cw_60) * w_29) * tone_61));
  col = dep_col_65;
  return vec3(dep_c_62, dep_c_63, dep_c_64);
}
