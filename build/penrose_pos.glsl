vec3 shape_penrose_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 2090972659u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_sym = int(P[0] + 0.5);
  float foldf_1 = max(4.0, min(12.0, floor((P[0] + 0.5))));
  float M_2 = P[2];
  pt = hashu(pt);
  float nk0_3 = (floor((u2f(pt) * (((2.0 * M_2) + 1.0)))) - M_2);
  float ob_4_px = 0.0;
  float ob_4_py = 0.0;
  float ob_4_ix = 0.0;
  float ob_4_iy = 0.0;
  float ob_4_nk = nk0_3;
  int ob_4_count = 0;
  bool ob_4_esc = false;
  for (int ok_5 = 0; ok_5 < 12; ok_5++) {
    if (ok_5 >= li_sym) break;
    float ob_4_t_6 = (ob_4_px + (ob_4_nk * cos(((TAU * float(ok_5)) / foldf_1))));
    float ob_4_t_7 = (ob_4_py + (ob_4_nk * sin(((TAU * float(ok_5)) / foldf_1))));
    float ob_4_t_8 = (ob_4_ix + (ob_4_nk * cos((((2.0 * TAU) * float(ok_5)) / foldf_1))));
    float ob_4_t_9 = (ob_4_iy + (ob_4_nk * sin((((2.0 * TAU) * float(ok_5)) / foldf_1))));
    pt = hashu(pt);
    float ob_4_t_10 = (floor((u2f(pt) * (((2.0 * M_2) + 1.0)))) - M_2);
    ob_4_px = ob_4_t_6;
    ob_4_py = ob_4_t_7;
    ob_4_ix = ob_4_t_8;
    ob_4_iy = ob_4_t_9;
    ob_4_nk = ob_4_t_10;
    ob_4_count += 1;
  }
  if ((((ob_4_ix * ob_4_ix) + (ob_4_iy * ob_4_iy)) > (P[1] * P[1]))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float dep_c_11 = ((ob_4_px * P[3]) * 0.16);
  float dep_c_12 = ((ob_4_py * P[3]) * 0.16);
  float dep_c_13 = (length(vec2(ob_4_ix, ob_4_iy)) * P[4]);
  vec3 dep_col_14 = pal(((atan(ob_4_iy, ob_4_ix) / TAU) + 0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
  float dep_glow_15 = (0.5 + (0.7 * P[5]));
  col = dep_col_14 * dep_glow_15;
  return vec3(dep_c_11, dep_c_12, dep_c_13);
}
