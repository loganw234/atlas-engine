vec3 shape_relativity_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 589174991u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float b_1 = (P[0] + ((((q.x * 2.0) - 1.0)) * P[1]));
  b_1 = max(b_1, 0.05);
  float u0_2 = (1.0 / 30.0);
  float phi0_3 = asin(clamp((b_1 * u0_2), (-1.0), 1.0));
  float w0_4 = (cos(phi0_3) / b_1);
  float k_5 = floor((q.y * P[2]));
  float dphi_6 = 0.03;
  float ob_7_u = u0_2;
  float ob_7_w = w0_4;
  float ob_7_qu = u0_2;
  float ob_7_qw = w0_4;
  float ob_7_cu = 0.0;
  float ob_7_cw = 0.0;
  float ob_7_phi = phi0_3;
  float ob_7_g = 0.0;
  float ob_7_n = 0.0;
  int ob_7_count = 0;
  bool ob_7_esc = false;
  for (int ok_8 = 0; ok_8 < 1440; ok_8++) {
    if ((((ob_7_n >= k_5) || (ob_7_u > 0.47)) || (((ob_7_w < 0.0) && (ob_7_u < 0.0285714))))) { ob_7_esc = true; break; }
    float ob_7_t_9 = ((((ob_7_g == 3.0))) ? 0.0 : ((ob_7_cu + ((((((ob_7_g == 0.0))) ? 1.0 : 2.0)) * ob_7_qw))));
    float ob_7_t_10 = ((((ob_7_g == 3.0))) ? 0.0 : ((ob_7_cw + ((((((ob_7_g == 0.0))) ? 1.0 : 2.0)) * ((((3.0 * ob_7_qu) * ob_7_qu) - ob_7_qu))))));
    float ob_7_t_11 = ((((ob_7_g == 3.0))) ? ((ob_7_u + ((dphi_6 / 6.0) * ((ob_7_cu + (1.0 * ob_7_qw)))))) : ob_7_u);
    float ob_7_t_12 = ((((ob_7_g == 3.0))) ? ((ob_7_w + ((dphi_6 / 6.0) * ((ob_7_cw + (1.0 * ((((3.0 * ob_7_qu) * ob_7_qu) - ob_7_qu)))))))) : ob_7_w);
    float ob_7_t_13 = ((((ob_7_g == 3.0))) ? ((ob_7_u + ((dphi_6 / 6.0) * ((ob_7_cu + (1.0 * ob_7_qw)))))) : ((ob_7_u + ((((((ob_7_g == 2.0))) ? dphi_6 : (0.5 * dphi_6))) * ob_7_qw))));
    float ob_7_t_14 = ((((ob_7_g == 3.0))) ? ((ob_7_w + ((dphi_6 / 6.0) * ((ob_7_cw + (1.0 * ((((3.0 * ob_7_qu) * ob_7_qu) - ob_7_qu)))))))) : ((ob_7_w + ((((((ob_7_g == 2.0))) ? dphi_6 : (0.5 * dphi_6))) * ((((3.0 * ob_7_qu) * ob_7_qu) - ob_7_qu))))));
    float ob_7_t_15 = ((((ob_7_g == 3.0))) ? ((ob_7_phi + dphi_6)) : ob_7_phi);
    float ob_7_t_16 = ((((ob_7_g == 3.0))) ? 0.0 : ((ob_7_g + 1.0)));
    float ob_7_t_17 = ((((ob_7_g == 3.0))) ? ((ob_7_n + 1.0)) : ob_7_n);
    ob_7_cu = ob_7_t_9;
    ob_7_cw = ob_7_t_10;
    ob_7_u = ob_7_t_11;
    ob_7_w = ob_7_t_12;
    ob_7_qu = ob_7_t_13;
    ob_7_qw = ob_7_t_14;
    ob_7_phi = ob_7_t_15;
    ob_7_g = ob_7_t_16;
    ob_7_n = ob_7_t_17;
    ob_7_count += 1;
  }
  bool dead_18 = ((ob_7_u > 0.47) || (((ob_7_w < 0.0) && (ob_7_u < 0.0285714))));
  if (dead_18) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float r_19 = (1.0 / max(ob_7_u, 1.0e-4));
  float plx_20 = (cos(ob_7_phi) * ((r_19 * P[4])));
  float ply_21 = (sin(ob_7_phi) * ((r_19 * P[4])));
  pt = hashu(pt);
  float draw_22 = u2f(pt) - 0.5;
  float psi_23 = ((draw_22 * TAU) * P[3]);
  float tc_24 = ((clamp((((b_1 - 5.1961524)) * 0.30), (-1.0), 1.0) * 0.5) + 0.5);
  float dep_c_25 = plx_20;
  float dep_c_26 = (ply_21 * cos(psi_23));
  float dep_c_27 = (ply_21 * sin(psi_23));
  vec3 dep_col_28 = pal(tc_24, vec3(0.95, 0.575, 0.35), vec3(0.10, 0.275, 0.20), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5));
  float dep_glow_29 = (((0.35 + (0.85 * P[5]))) * ((0.86 + (0.14 * sin(((5.0 * ob_7_phi) - (2.5 * uT)))))));
  col = dep_col_28 * dep_glow_29;
  return vec3(dep_c_25, dep_c_26, dep_c_27);
}
