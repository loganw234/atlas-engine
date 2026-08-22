vec3 shape_jong_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 552738893u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_iters = int(P[5] + 0.5);
  float a_1 = (P[0] + ((0.52 * P[4]) * sin((0.041 * uT))));
  float b_2 = (P[1] + ((0.37 * P[4]) * sin(((0.033 * uT) + 1.4))));
  float c_3 = (P[2] + ((0.36 * P[4]) * sin(((0.037 * uT) + 2.9))));
  float d_4 = (P[3] + ((0.41 * P[4]) * sin(((0.029 * uT) + 4.2))));
  pt = hashu(pt);
  float draw_5 = u2f(pt);
  float x0_6 = ((draw_5 * 4.0) - 2.0);
  pt = hashu(pt);
  float draw_7 = u2f(pt);
  float y0_8 = ((draw_7 * 4.0) - 2.0);
  float ob_9_x = x0_6;
  float ob_9_y = y0_8;
  float ob_9_px = x0_6;
  float ob_9_py = y0_8;
  int ob_9_count = 0;
  bool ob_9_esc = false;
  for (int ok_10 = 0; ok_10 < 24; ok_10++) {
    if (ok_10 >= li_iters) break;
    float ob_9_t_11 = (sin((a_1 * ob_9_y)) - cos((b_2 * ob_9_x)));
    float ob_9_t_12 = (sin((c_3 * ob_9_x)) - cos((d_4 * ob_9_y)));
    float ob_9_t_13 = ob_9_x;
    float ob_9_t_14 = ob_9_y;
    ob_9_x = ob_9_t_11;
    ob_9_y = ob_9_t_12;
    ob_9_px = ob_9_t_13;
    ob_9_py = ob_9_t_14;
    ob_9_count += 1;
  }
  float sp_15 = length(vec2((ob_9_x - ob_9_px), (ob_9_y - ob_9_py)));
  float dep_c_16 = (ob_9_x * 0.62);
  float dep_c_17 = (ob_9_y * 0.62);
  float dep_c_18 = (ob_9_px * P[6]);
  vec3 dep_col_19 = pal(clamp((sp_15 * 0.30), 0.0, 1.0), vec3(0.46, 0.34, 0.55), vec3(0.44, 0.33, 0.40), vec3(1.0, 0.95, 0.80), vec3(0.65, 0.40, 0.10));
  col = dep_col_19;
  return vec3(dep_c_16, dep_c_17, dep_c_18);
}
