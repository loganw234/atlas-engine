vec3 shape_qjulia_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3554295333u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_iters = int(P[5] + 0.5);
  float ct_1 = (1.0 - (2.0 * q.x));
  float st_2 = sqrt(max(0.0, (1.0 - (ct_1 * ct_1))));
  float ph_3 = (TAU * q.y);
  pt = hashu(pt);
  float rad_4 = (1.35 * pow(u2f(pt), 0.33333));
  float x0_5 = ((st_2 * cos(ph_3)) * rad_4);
  float y0_6 = (ct_1 * rad_4);
  float z0_7 = ((st_2 * sin(ph_3)) * rad_4);
  float K_8 = P[5];
  float ob_9_x = x0_5;
  float ob_9_y = y0_6;
  float ob_9_z = z0_7;
  float ob_9_w = P[4];
  int ob_9_count = 0;
  bool ob_9_esc = false;
  for (int ok_10 = 0; ok_10 < 16; ok_10++) {
    if (ok_10 >= li_iters) break;
    if ((((((ob_9_x * ob_9_x) + (ob_9_y * ob_9_y)) + (ob_9_z * ob_9_z)) + (ob_9_w * ob_9_w)) > 16.0)) { ob_9_esc = true; break; }
    float ob_9_t_11 = (((ob_9_x * ob_9_x) - ((((ob_9_y * ob_9_y) + (ob_9_z * ob_9_z)) + (ob_9_w * ob_9_w)))) + P[0]);
    float ob_9_t_12 = (((2.0 * ob_9_x) * ob_9_y) + P[1]);
    float ob_9_t_13 = (((2.0 * ob_9_x) * ob_9_z) + P[2]);
    float ob_9_t_14 = (((2.0 * ob_9_x) * ob_9_w) + P[3]);
    ob_9_x = ob_9_t_11;
    ob_9_y = ob_9_t_12;
    ob_9_z = ob_9_t_13;
    ob_9_w = ob_9_t_14;
    ob_9_count += 1;
  }
  float q4_15 = ((((ob_9_x * ob_9_x) + (ob_9_y * ob_9_y)) + (ob_9_z * ob_9_z)) + (ob_9_w * ob_9_w));
  float esc_16 = ((((q4_15 > 16.0))) ? ((float(ob_9_count) - 1.0)) : (-1.0));
  if (((esc_16 >= 0.0) && (esc_16 < (P[6] * K_8)))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float glow_17 = ((((esc_16 < 0.0))) ? 0.35 : 1.5);
  float hue_18 = ((((esc_16 < 0.0))) ? (rad_4 * 0.45) : (esc_16 / K_8));
  float dep_c_19 = (x0_5 * 0.95);
  float dep_c_20 = (y0_6 * 0.95);
  float dep_c_21 = (z0_7 * 0.95);
  vec3 dep_col_22 = pal(((hue_18 * 0.6) + 0.12), vec3(0.42, 0.30, 0.50), vec3(0.45, 0.35, 0.40), vec3(1.0, 0.90, 0.70), vec3(0.78, 0.52, 0.18));
  float dep_glow_23 = glow_17;
  col = dep_col_22 * dep_glow_23;
  return vec3(dep_c_19, dep_c_20, dep_c_21);
}
