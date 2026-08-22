vec3 shape_critical_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3222782681u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_depth = int(P[2] + 0.5);
  int li_b = int(P[1] + 0.5);
  pt = hashu(pt);
  int depth_1 = int(pow(u2f(pt), 0.65) * float(li_depth));
  int d_2 = depth_1;
  vec2 dc_xy_3 = vec2(0.0);
  float dc_sc_4 = 1.0;
  uint dc_adr_5 = 2166136261u;
  uint dc_tr_7 = 2166136261u;
  int dc_n_6 = 0;
  int dlim_8 = d_2;
  for (int l = 0; l < 22; l++) {
    if (l >= dlim_8) break;
    bool moved = false;
    for (int k = 0; k < 6; k++) {
      pt = hashu(pt);
      int pick_9 = min(int(u2f(pt) * float(li_b)), li_b - 1);
      int cx_10 = pick_9;
      pt = hashu(pt);
      int pick_11 = min(int(u2f(pt) * float(li_b)), li_b - 1);
      int cy_12 = pick_11;
      uint cand_13 = hashu(dc_adr_5 ^ uint(cy_12 * 97 + cx_10 + 1));
      if ((u2f(cand_13) < P[0])) {
        dc_xy_3 += vec2(float(cx_10), float(cy_12)) * dc_sc_4 / float(li_b)
             - vec2(dc_sc_4 * 0.5 * (1.0 - 1.0 / float(li_b)));
        dc_sc_4 /= float(li_b);
        dc_adr_5 = cand_13;
        dc_tr_7 = hashu(dc_tr_7 ^ cand_13);
        dc_n_6 += 1;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  pt = hashu(pt);
  float jx_14 = u2f(pt) - 0.5;
  pt = hashu(pt);
  vec2 jit_15 = vec2(jx_14, u2f(pt) - 0.5);
  vec2 j_16 = jit_15;
  float rim_17 = (max(abs(j_16.x), abs(j_16.y)) * 2.0);
  pt = hashu(pt);
  float draw_18 = u2f(pt);
  if (((draw_18 < P[5]) && (rim_17 < 0.62))) {
    j_16 = (j_16 * (0.92 / max(rim_17, 1e-3)));
  }
  pt = hashu(pt);
  float draw_19 = u2f(pt) - 0.5;
  float z_20 = (((((u2f(hashu(dc_tr_7 ^ uint(39916801))) - 0.5) + (draw_19 * 0.3))) * P[4]) * ((0.25 + (3.0 * dc_sc_4))));
  float lv_21 = (float(dc_n_6) / P[2]);
  vec2 dep_xy_22 = ((dc_xy_3 + j_16 * dc_sc_4) * 1.9);
  float dep_z_23 = z_20;
  vec3 dep_col_24 = pal(((0.32 + ((u2f(hashu(dc_tr_7 ^ uint(0))) * P[3]) * 0.5)) + (lv_21 * 0.12)), vec3(0.45, 0.5, 0.47), vec3(0.42, 0.5, 0.45), vec3(0.9, 1.0, 0.85), vec3(0.15, 0.42, 0.6));
  float dep_glow_25 = (0.12 + ((1.9 * lv_21) * lv_21));
  col = dep_col_24 * dep_glow_25;
  return vec3(dep_xy_22.x, dep_xy_22.y, dep_z_23);
}
