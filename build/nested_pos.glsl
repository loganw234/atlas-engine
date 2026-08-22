vec3 stain_nested_pos(vec3 c, float a){
  float cs = cos(a), sn = sin(a);
  vec3 k = vec3(0.57735027);
  return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec3 shape_nested_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3638122319u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_nth = int(P[2] + 0.5);
  int li_depth = int(P[0] + 0.5);
  int prm_1 = (li_nth <= 1) ? 2 : (li_nth == 2) ? 3 : (li_nth == 3) ? 5 : 7;
  int p_2 = prm_1;
  int lv_L_3 = 0;
  int lv_R_4 = 1;
  {
    int lv_t_5 = 1 << li_depth;
    int lv_p_6 = p_2;
    for (int i = 0; i < 24; i++) {
      if (lv_R_4 >= lv_t_5) break;
      lv_R_4 *= lv_p_6;
      lv_L_3 += 1;
    }
  }
  float mg_7 = exp2(P[1]);
  ivec2 ctr_8 = ivec2((((2 * lv_R_4) - 1)) / 2, ((2 * lv_R_4)) / 2);
  ivec2 hrt_9 = ivec2(((lv_R_4) / (64)), ((2 * lv_R_4) - ((lv_R_4) / (32))));
  ivec2 wc_10 = ctr_8 + ivec2(vec2(hrt_9 - ctr_8) * (1.0 - 1.0 / mg_7));
  ivec2 hw_11 = ivec2(vec2(ctr_8) / mg_7);
  ivec4 win_12 = ivec4(wc_10 - hw_11, wc_10 + hw_11);
  float km_13 = ((2.85 / float(((2 * lv_R_4))))) * mg_7;
  int wd_14_p = p_2;
  int wd_14_R = lv_R_4;
  int wd_14_L = lv_L_3;
  int wd_14_n = 0;
  int wd_14_k = 0;
  int wd_14_s = wd_14_R / wd_14_p;
  int wd_14_v = 1;
  uint wd_14_lin = 2166136261u;
  bool wd_14_dead = false;
  for (int lev = 0; lev < 24; lev++) {
    if (lev >= wd_14_L) break;
    float wts[28];
    float wsum = 0.0;
    for (int a = 0; a < 7; a++) {
      if (a >= wd_14_p) break;
      int ny0 = 2 * (wd_14_n + a * wd_14_s);
      int ny1 = ny0 + 2 * wd_14_s;
      int oy = min(ny1, win_12.w) - max(ny0, win_12.y);
      for (int b = 0; b < 7; b++) {
        if (b > a) break;
        int sl = (a * (a + 1)) / 2 + b;
        wts[sl] = 0.0;
        if (oy > 0) {
          int xlo = 2 * (wd_14_k + b * wd_14_s) + (wd_14_R - 1) - (wd_14_n + (a + 1) * wd_14_s - 1);
          int xhi = 2 * (wd_14_k + b * wd_14_s + wd_14_s - 1) + (wd_14_R - 1) - (wd_14_n + a * wd_14_s);
          int ox = min(xhi + 1, win_12.z) - max(xlo, win_12.x);
          if (ox > 0) wts[sl] = float(oy) * float(ox);
        }
        wsum += wts[sl];
      }
    }
    if (wsum <= 0.0) { wd_14_dead = true; break; }
    pt = hashu(pt);
    float pick = u2f(pt) * wsum;
    float run = 0.0;
    int ca = 0;
    int cb = 0;
    int cc = 1;
    for (int a = 0; a < 7; a++) {
      if (a >= wd_14_p) break;
      for (int b = 0; b < 7; b++) {
        if (b > a) break;
        int sl = (a * (a + 1)) / 2 + b;
        run += wts[sl];
        if (pick < run && pick >= run - wts[sl] && wts[sl] > 0.0) {
          ca = a;
          cb = b;
          cc = (sl == 0) ? 1 : (sl == 1) ? 1 : (sl == 2) ? 1
             : (sl == 3) ? 1 : (sl == 4) ? 2 : (sl == 5) ? 1
             : (sl == 6) ? 1 : (sl == 7) ? 3 : (sl == 8) ? 3 : (sl == 9) ? 1
             : (sl == 10) ? 1 : (sl == 11) ? 4 : (sl == 12) ? 6 : (sl == 13) ? 4 : (sl == 14) ? 1
             : (sl == 15) ? 1 : (sl == 16) ? 5 : (sl == 17) ? 10 : (sl == 18) ? 10 : (sl == 19) ? 5 : (sl == 20) ? 1
             : (sl == 21) ? 1 : (sl == 22) ? 6 : (sl == 23) ? 15 : (sl == 24) ? 20 : (sl == 25) ? 15 : (sl == 26) ? 6 : 1;
        }
      }
    }
    wd_14_v = (wd_14_v * cc) % wd_14_p;
    wd_14_n += ca * wd_14_s;
    wd_14_k += cb * wd_14_s;
    wd_14_lin = hashu(wd_14_lin ^ (uint(ca * 7 + cb) + 1u) * 2654435761u);
    wd_14_s /= wd_14_p;
  }
  if (wd_14_dead) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  int xu_15 = ((2 * wd_14_k) + (((lv_R_4 - 1) - wd_14_n)));
  pt = hashu(pt);
  float jx_16 = (((u2f(pt) - 0.5)) * 1.88);
  pt = hashu(pt);
  float jy_17 = (((u2f(pt) - 0.5)) * 1.88);
  float lv_18 = (float(wd_14_n) / float(lv_R_4));
  float hue_19 = ((((p_2 == 2))) ? 0.0 : (float(((wd_14_v - 1))) / float(((p_2 - 1)))));
  pt = hashu(pt);
  float z_20 = ((((u2f(hashu(wd_14_lin ^ uint(0))) - 0.5) + ((u2f(pt) - 0.5) * 0.3))) * P[5]);
  vec2 dep_xy_21 = (((vec2(ivec2((xu_15 + 1), ((2 * wd_14_n) + 1)) - wc_10) + vec2(jx_16, jy_17)) * km_13) * vec2(1.0, -1.0));
  float dep_z_22 = z_20;
  vec3 dep_col_23 = stain_nested_pos(pal(((0.34 + ((0.45 * hue_19) * P[3])) + ((0.10 * lv_18) * P[4])), vec3(0.44, 0.52, 0.46), vec3(0.42, 0.48, 0.44), vec3(0.95, 1.0, 0.9), vec3(0.12, 0.40, 0.62)), (((P[7] - 0.5)) * 2.2));
  float dep_glow_24 = (((0.5 + (1.4 * P[6]))) * ((1.0 - ((P[4] * 0.55) * ((1.0 - lv_18))))));
  col = dep_col_23 * dep_glow_24;
  return vec3(dep_xy_21.x, dep_xy_21.y, dep_z_22);
}
