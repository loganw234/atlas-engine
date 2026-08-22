vec3 shape_hyper_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 2009886601u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float np_1 = max(3.0, min(8.0, floor((P[0] + 0.5))));
  float nq0_2 = max(3.0, min(8.0, floor((P[1] + 0.5))));
  float sp_3 = sin((PI / np_1));
  float ob_4_nq = nq0_2;
  float ob_4_cq = cos((PI / nq0_2));
  int ob_4_count = 0;
  bool ob_4_esc = false;
  for (int ok_5 = 0; ok_5 < 8; ok_5++) {
    if ((((ob_4_cq * ob_4_cq) - (sp_3 * sp_3)) > 1.0e-4)) { ob_4_esc = true; break; }
    float ob_4_t_6 = (ob_4_nq + 1.0);
    float ob_4_t_7 = cos((PI / ((ob_4_nq + 1.0))));
    ob_4_nq = ob_4_t_6;
    ob_4_cq = ob_4_t_7;
    ob_4_count += 1;
  }
  float cq_8 = ob_4_cq;
  float root_9 = sqrt(max(((cq_8 * cq_8) - (sp_3 * sp_3)), 1.0e-6));
  float d_10 = (cq_8 / root_9);
  float r_11 = (sp_3 / root_9);
  float wedge_12 = (PI / np_1);
  float cw_13 = cos(wedge_12);
  float tv_14 = ((d_10 * cw_13) - sqrt(max(((((d_10 * d_10) * cw_13) * cw_13) - 1.0), 0.0)));
  float cpsiv_15 = clamp((((d_10 - (tv_14 * cw_13))) / max(r_11, 1.0e-9)), (-1.0), 1.0);
  float psiv_16 = acos(cpsiv_15);
  float psi_17 = ((((q.x - 0.5)) * 2.0) * psiv_16);
  float zx0_18 = (d_10 - (r_11 * cos(psi_17)));
  float zy0_19 = (0.0 - (r_11 * sin(psi_17)));
  if (((abs(atan(zy0_19, zx0_18)) > wedge_12) || (((zx0_18 * zx0_18) + (zy0_19 * zy0_19)) >= 1.0))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float wlen_20 = max(2.0, min(24.0, floor((P[2] + 0.5))));
  pt = hashu(pt);
  float draw_21 = u2f(pt);
  float klen_22 = floor((draw_21 * wlen_20));
  pt = hashu(pt);
  float draw_23 = u2f(pt);
  float first_24 = draw_23;
  vec2 Rv_25 = vec2(cos((TAU / np_1)), sin((TAU / np_1)));
  float ob_26_zx = zx0_18;
  float ob_26_zy = zy0_19;
  float ob_26_sc = 1.0;
  float ob_26_m = (1.0 + floor((first_24 * 2.99999)));
  pt = hashu(pt);
  float draw_27 = u2f(pt);
  float ob_26_uu = draw_27;
  float ob_26_left = klen_22;
  int ob_26_count = 0;
  bool ob_26_esc = false;
  for (int ok_28 = 0; ok_28 < 24; ok_28++) {
    if ((ob_26_left <= 0.0)) { ob_26_esc = true; break; }
    float ob_26_t_29 = (((((ob_26_m == 1.0))) ? (ob_26_zx * ob_26_sc) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).x : (d_10 + (((r_11 * r_11) * (((ob_26_zx * ob_26_sc) - d_10))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9)))))));
    float ob_26_t_30 = (((((ob_26_m == 1.0))) ? (-((ob_26_zy * ob_26_sc))) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).y : (((r_11 * r_11) * ((ob_26_zy * ob_26_sc))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9))))));
    float ob_26_t_31 = (((((((((((ob_26_m == 1.0))) ? (ob_26_zx * ob_26_sc) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).x : (d_10 + (((r_11 * r_11) * (((ob_26_zx * ob_26_sc) - d_10))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9))))))) * (((((ob_26_m == 1.0))) ? (ob_26_zx * ob_26_sc) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).x : (d_10 + (((r_11 * r_11) * (((ob_26_zx * ob_26_sc) - d_10))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9)))))))) + ((((((ob_26_m == 1.0))) ? (-((ob_26_zy * ob_26_sc))) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).y : (((r_11 * r_11) * ((ob_26_zy * ob_26_sc))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9)))))) * (((((ob_26_m == 1.0))) ? (-((ob_26_zy * ob_26_sc))) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).y : (((r_11 * r_11) * ((ob_26_zy * ob_26_sc))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9)))))))) > 0.998001))) ? (0.999 * ((1.0 / sqrt((((((((ob_26_m == 1.0))) ? (ob_26_zx * ob_26_sc) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).x : (d_10 + (((r_11 * r_11) * (((ob_26_zx * ob_26_sc) - d_10))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9))))))) * (((((ob_26_m == 1.0))) ? (ob_26_zx * ob_26_sc) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).x : (d_10 + (((r_11 * r_11) * (((ob_26_zx * ob_26_sc) - d_10))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9)))))))) + ((((((ob_26_m == 1.0))) ? (-((ob_26_zy * ob_26_sc))) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).y : (((r_11 * r_11) * ((ob_26_zy * ob_26_sc))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9)))))) * (((((ob_26_m == 1.0))) ? (-((ob_26_zy * ob_26_sc))) : ((((ob_26_m == 2.0))) ? cmul(Rv_25, vec2((ob_26_zx * ob_26_sc), (-((ob_26_zy * ob_26_sc))))).y : (((r_11 * r_11) * ((ob_26_zy * ob_26_sc))) / (((((((ob_26_zx * ob_26_sc) - d_10)) * (((ob_26_zx * ob_26_sc) - d_10))) + (((ob_26_zy * ob_26_sc)) * ((ob_26_zy * ob_26_sc)))) + 1.0e-9)))))))))))) : 1.0);
    float ob_26_t_32 = ((((ob_26_m == 1.0))) ? (((((ob_26_uu < 0.5))) ? 2.0 : 3.0)) : ((((ob_26_m == 2.0))) ? (((((ob_26_uu < 0.5))) ? 1.0 : 3.0)) : (((((ob_26_uu < 0.5))) ? 1.0 : 2.0))));
    pt = hashu(pt);
    float draw_33 = u2f(pt);
    float ob_26_t_34 = draw_33;
    float ob_26_t_35 = (ob_26_left - 1.0);
    ob_26_zx = ob_26_t_29;
    ob_26_zy = ob_26_t_30;
    ob_26_sc = ob_26_t_31;
    ob_26_m = ob_26_t_32;
    ob_26_uu = ob_26_t_34;
    ob_26_left = ob_26_t_35;
    ob_26_count += 1;
  }
  float zx1_36 = (ob_26_zx * ob_26_sc);
  float zy1_37 = (ob_26_zy * ob_26_sc);
  float aax_38 = (0.05 * cos((uT * 0.10)));
  float aay_39 = (0.05 * sin((uT * 0.073)));
  vec2 cm_40 = cmul(vec2(aax_38, (-aay_39)), vec2(zx1_36, zy1_37));
  vec2 zw_41 = cdiv(vec2((zx1_36 + aax_38), (zy1_37 + aay_39)), vec2((1.0 + cm_40.x), cm_40.y));
  float zx2_42 = zw_41.x;
  float zy2_43 = zw_41.y;
  float zz2_44 = ((zx2_42 * zx2_42) + (zy2_43 * zy2_43));
  if ((zz2_44 > 0.998001)) {
    float drift_45 = (0.999 * ((1.0 / sqrt(zz2_44))));
    zx2_42 *= drift_45;
    zy2_43 *= drift_45;
  }
  float mdl_46 = clamp(P[3], 0.0, 1.0);
  float s2_47 = ((zx2_42 * zx2_42) + (zy2_43 * zy2_43));
  if (((mdl_46 > 0.001) && (s2_47 > 0.970225))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float den_48 = max((1.0 - s2_47), 1.0e-4);
  float dep_c_49 = mix((zx2_42 * 1.2), ((0.6 * zx2_42) / den_48), mdl_46);
  float dep_c_50 = mix(0.0, (((0.3 * ((1.0 + s2_47))) / den_48) - 0.45), mdl_46);
  float dep_c_51 = mix((zy2_43 * 1.2), ((0.6 * zy2_43) / den_48), mdl_46);
  vec3 dep_col_52 = pal((((klen_22 / wlen_20) * 0.85) + P[4]), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
  float dep_glow_53 = (0.5 + (0.7 * P[5]));
  col = dep_col_52 * dep_glow_53;
  return vec3(dep_c_49, dep_c_50, dep_c_51);
}
