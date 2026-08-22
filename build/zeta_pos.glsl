vec3 shape_zeta_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 247374363u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float h_1 = (P[0] + (((q.y - 0.5)) * P[1]));
  float kf_2 = (1.0 + (q.x * ((P[2] - 1.0))));
  float ob_3_sx = 0.0;
  float ob_3_sy = 0.0;
  float ob_3_fn = 1.0;
  int ob_3_count = 0;
  bool ob_3_esc = false;
  for (int ok_4 = 0; ok_4 < 64; ok_4++) {
    if ((ob_3_fn > (kf_2 + 1.0))) { ob_3_esc = true; break; }
    float ob_3_t_5 = (ob_3_sx + ((clamp(((kf_2 - ob_3_fn) + 1.0), 0.0, 1.0) * ((1.0 / sqrt(ob_3_fn)))) * cos((h_1 * log(ob_3_fn)))));
    float ob_3_t_6 = (ob_3_sy + ((clamp(((kf_2 - ob_3_fn) + 1.0), 0.0, 1.0) * ((1.0 / sqrt(ob_3_fn)))) * ((-sin((h_1 * log(ob_3_fn)))))));
    float ob_3_t_7 = (ob_3_fn + 1.0);
    ob_3_sx = ob_3_t_5;
    ob_3_sy = ob_3_t_6;
    ob_3_fn = ob_3_t_7;
    ob_3_count += 1;
  }
  float dep_c_8 = (((ob_3_sx - 1.2)) * P[3]);
  float dep_c_9 = (((q.y - 0.5)) * P[4]);
  float dep_c_10 = (ob_3_sy * P[3]);
  vec3 dep_col_11 = (pal((q.x * 0.7), vec3(0.42, 0.40, 0.55), vec3(0.40, 0.38, 0.42), vec3(1.0, 0.95, 0.85), vec3(0.62, 0.45, 0.20)) * (0.35 + (1.25 * pow(q.x, 3.0))));
  col = dep_col_11;
  return vec3(dep_c_8, dep_c_9, dep_c_10);
}
