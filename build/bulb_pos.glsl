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
  float rad_5 = (1.3 * pow(u2f(pt), 0.33333));
  float posx_6 = ((st_3 * cos(ph_4)) * rad_5);
  float posy_7 = (ct_2 * rad_5);
  float posz_8 = ((st_3 * sin(ph_4)) * rad_5);
  float mode_9 = floor((P[3] + 0.5));
  float zx0_10 = ((((mode_9 == 0.0))) ? 0.0 : posx_6);
  float zy0_11 = ((((mode_9 == 0.0))) ? 0.0 : posy_7);
  float zz0_12 = ((((mode_9 == 0.0))) ? 0.0 : posz_8);
  float ccx_13 = ((((mode_9 == 0.0))) ? posx_6 : P[4]);
  float ccy_14 = ((((mode_9 == 0.0))) ? posy_7 : P[5]);
  float ccz_15 = ((((mode_9 == 0.0))) ? posz_8 : 0.0);
  float K_16 = P[1];
  float ob_17_x = zx0_10;
  float ob_17_y = zy0_11;
  float ob_17_z = zz0_12;
  int ob_17_count = 0;
  bool ob_17_esc = false;
  for (int ok_18 = 0; ok_18 < 16; ok_18++) {
    if (ok_18 >= li_iters) break;
    if ((length(vec3(ob_17_x, ob_17_y, ob_17_z)) > 2.0)) { ob_17_esc = true; break; }
    float ob_17_t_19 = (((pow(length(vec3(ob_17_x, ob_17_y, ob_17_z)), power_1) * sin((acos(clamp((ob_17_y / max(length(vec3(ob_17_x, ob_17_y, ob_17_z)), 1.0e-6)), (-1.0), 1.0)) * power_1))) * cos((atan(ob_17_z, ob_17_x) * power_1))) + ccx_13);
    float ob_17_t_20 = ((pow(length(vec3(ob_17_x, ob_17_y, ob_17_z)), power_1) * cos((acos(clamp((ob_17_y / max(length(vec3(ob_17_x, ob_17_y, ob_17_z)), 1.0e-6)), (-1.0), 1.0)) * power_1))) + ccy_14);
    float ob_17_t_21 = (((pow(length(vec3(ob_17_x, ob_17_y, ob_17_z)), power_1) * sin((acos(clamp((ob_17_y / max(length(vec3(ob_17_x, ob_17_y, ob_17_z)), 1.0e-6)), (-1.0), 1.0)) * power_1))) * sin((atan(ob_17_z, ob_17_x) * power_1))) + ccz_15);
    ob_17_x = ob_17_t_19;
    ob_17_y = ob_17_t_20;
    ob_17_z = ob_17_t_21;
    ob_17_count += 1;
  }
  int esc_22 = ((ob_17_esc) ? ob_17_count : (-1));
  if (((float(esc_22) >= 0.0) && (float(esc_22) < (P[2] * K_16)))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float glowE_23 = ((((float(esc_22) < 0.0))) ? 0.35 : 1.4);
  float hue_24 = ((((float(esc_22) < 0.0))) ? (rad_5 * 0.4) : (float(esc_22) / K_16));
  float dep_c_25 = (posx_6 * 0.95);
  float dep_c_26 = (posy_7 * 0.95);
  float dep_c_27 = (posz_8 * 0.95);
  vec3 dep_col_28 = ((pal(((hue_24 * 0.6) + 0.1), vec3(0.5, 0.4, 0.35), vec3(0.5, 0.4, 0.4), vec3(1.0, 0.9, 0.7), vec3(0.1, 0.3, 0.5)) * glowE_23) * (0.6 + (0.7 * P[6])));
  col = dep_col_28;
  return vec3(dep_c_25, dep_c_26, dep_c_27);
}
