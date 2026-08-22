vec3 shape_bulb_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3863675111u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_iters = int(P[1] + 0.5);
  float power_1 = P[0];
  float ct_2 = (1.0 - (2.0 * q.x));
  float st_3 = sqrt(max(0.0, (1.0 - (ct_2 * ct_2))));
  float ph_4 = (TAU * q.y);
  pt = hashu(pt);
  float draw_5 = u2f(pt);
  float rad_6 = (1.3 * pow(draw_5, 0.33333));
  float posx_7 = ((st_3 * cos(ph_4)) * rad_6);
  float posy_8 = (ct_2 * rad_6);
  float posz_9 = ((st_3 * sin(ph_4)) * rad_6);
  float mode_10 = floor((P[3] + 0.5));
  float zx0_11 = ((((mode_10 == 0.0))) ? 0.0 : posx_7);
  float zy0_12 = ((((mode_10 == 0.0))) ? 0.0 : posy_8);
  float zz0_13 = ((((mode_10 == 0.0))) ? 0.0 : posz_9);
  float ccx_14 = ((((mode_10 == 0.0))) ? posx_7 : P[4]);
  float ccy_15 = ((((mode_10 == 0.0))) ? posy_8 : P[5]);
  float ccz_16 = ((((mode_10 == 0.0))) ? posz_9 : 0.0);
  float K_17 = P[1];
  float ob_18_x = zx0_11;
  float ob_18_y = zy0_12;
  float ob_18_z = zz0_13;
  int ob_18_count = 0;
  bool ob_18_esc = false;
  for (int ok_19 = 0; ok_19 < 16; ok_19++) {
    if (ok_19 >= li_iters) break;
    if ((length(vec3(ob_18_x, ob_18_y, ob_18_z)) > 2.0)) { ob_18_esc = true; break; }
    float ob_18_t_20 = (((pow(length(vec3(ob_18_x, ob_18_y, ob_18_z)), power_1) * sin((acos(clamp((ob_18_y / max(length(vec3(ob_18_x, ob_18_y, ob_18_z)), 1.0e-6)), (-1.0), 1.0)) * power_1))) * cos((atan(ob_18_z, ob_18_x) * power_1))) + ccx_14);
    float ob_18_t_21 = ((pow(length(vec3(ob_18_x, ob_18_y, ob_18_z)), power_1) * cos((acos(clamp((ob_18_y / max(length(vec3(ob_18_x, ob_18_y, ob_18_z)), 1.0e-6)), (-1.0), 1.0)) * power_1))) + ccy_15);
    float ob_18_t_22 = (((pow(length(vec3(ob_18_x, ob_18_y, ob_18_z)), power_1) * sin((acos(clamp((ob_18_y / max(length(vec3(ob_18_x, ob_18_y, ob_18_z)), 1.0e-6)), (-1.0), 1.0)) * power_1))) * sin((atan(ob_18_z, ob_18_x) * power_1))) + ccz_16);
    ob_18_x = ob_18_t_20;
    ob_18_y = ob_18_t_21;
    ob_18_z = ob_18_t_22;
    ob_18_count += 1;
  }
  int esc_23 = ((ob_18_esc) ? ob_18_count : (-1));
  if (((float(esc_23) >= 0.0) && (float(esc_23) < (P[2] * K_17)))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float glowE_24 = ((((float(esc_23) < 0.0))) ? 0.35 : 1.4);
  float hue_25 = ((((float(esc_23) < 0.0))) ? (rad_6 * 0.4) : (float(esc_23) / K_17));
  float dep_c_26 = (posx_7 * 0.95);
  float dep_c_27 = (posy_8 * 0.95);
  float dep_c_28 = (posz_9 * 0.95);
  vec3 dep_col_29 = ((pal(((hue_25 * 0.6) + 0.1), vec3(0.5, 0.4, 0.35), vec3(0.5, 0.4, 0.4), vec3(1.0, 0.9, 0.7), vec3(0.1, 0.3, 0.5)) * glowE_24) * (0.6 + (0.7 * P[6])));
  col = dep_col_29;
  return vec3(dep_c_26, dep_c_27, dep_c_28);
}
