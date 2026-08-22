vec3 shape_collatz_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 2374135881u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float n0_1 = (1.0 + floor((q.x * P[0])));
  float ob_2_lo = n0_1;
  float ob_2_hi = 0.0;
  float ob_2_wlo = 0.0;
  float ob_2_whi = 0.0;
  int ob_2_count = 0;
  bool ob_2_esc = false;
  for (int ok_3 = 0; ok_3 < 220; ok_3++) {
    if (((ob_2_lo == 1.0) && (ob_2_hi == 0.0))) { ob_2_esc = true; break; }
    float ob_2_t_4 = ((((mod(ob_2_lo, 2.0) < 0.5))) ? (floor((ob_2_lo / 2.0)) + (mod(ob_2_hi, 2.0) * 32768.0)) : mod(((3.0 * ob_2_lo) + 1.0), 65536.0));
    float ob_2_t_5 = ((((mod(ob_2_lo, 2.0) < 0.5))) ? floor((ob_2_hi / 2.0)) : mod(((3.0 * ob_2_hi) + floor(((((3.0 * ob_2_lo) + 1.0)) / 65536.0))), 65536.0));
    float ob_2_t_6 = mod(((ob_2_wlo * 2.0) + mod(ob_2_lo, 2.0)), 65536.0);
    float ob_2_t_7 = mod(((ob_2_whi * 2.0) + floor(((((ob_2_wlo * 2.0) + mod(ob_2_lo, 2.0))) / 65536.0))), 65536.0);
    ob_2_lo = ob_2_t_4;
    ob_2_hi = ob_2_t_5;
    ob_2_wlo = ob_2_t_6;
    ob_2_whi = ob_2_t_7;
    ob_2_count += 1;
  }
  float keepf_8 = ((((ob_2_count < 32))) ? ((float(ob_2_count) + 0.0)) : 32.0);
  if ((keepf_8 <= 0.0)) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  pt = hashu(pt);
  float target_9 = floor((u2f(pt) * keepf_8));
  float ob_10_j = 0.0;
  float ob_10_wlo = ob_2_wlo;
  float ob_10_whi = ob_2_whi;
  float ob_10_dir = (PI * 0.5);
  float ob_10_px = 0.0;
  float ob_10_py = 0.0;
  float ob_10_ox = 0.0;
  float ob_10_oy = 0.0;
  float ob_10_dep = 0.0;
  int ob_10_count = 0;
  bool ob_10_esc = false;
  for (int ok_11 = 0; ok_11 < 32; ok_11++) {
    if ((ob_10_j >= keepf_8)) { ob_10_esc = true; break; }
    float ob_10_t_12 = (ob_10_j + 1.0);
    float ob_10_t_13 = (floor((ob_10_wlo / 2.0)) + (mod(ob_10_whi, 2.0) * 32768.0));
    float ob_10_t_14 = floor((ob_10_whi / 2.0));
    float ob_10_t_15 = (ob_10_dir + (((((mod(ob_10_wlo, 2.0) < 0.5))) ? P[1] : (-P[2]))));
    float ob_10_t_16 = (ob_10_px + (P[3] * cos((ob_10_dir + (((((mod(ob_10_wlo, 2.0) < 0.5))) ? P[1] : (-P[2])))))));
    float ob_10_t_17 = (ob_10_py + (P[3] * sin((ob_10_dir + (((((mod(ob_10_wlo, 2.0) < 0.5))) ? P[1] : (-P[2])))))));
    float ob_10_t_18 = ((((float(ok_11) == target_9))) ? (ob_10_px + (P[3] * cos((ob_10_dir + (((((mod(ob_10_wlo, 2.0) < 0.5))) ? P[1] : (-P[2]))))))) : ob_10_ox);
    float ob_10_t_19 = ((((float(ok_11) == target_9))) ? (ob_10_py + (P[3] * sin((ob_10_dir + (((((mod(ob_10_wlo, 2.0) < 0.5))) ? P[1] : (-P[2]))))))) : ob_10_oy);
    float ob_10_t_20 = ((((float(ok_11) == target_9))) ? ((float(ok_11) + 0.0)) : ob_10_dep);
    ob_10_j = ob_10_t_12;
    ob_10_wlo = ob_10_t_13;
    ob_10_whi = ob_10_t_14;
    ob_10_dir = ob_10_t_15;
    ob_10_px = ob_10_t_16;
    ob_10_py = ob_10_t_17;
    ob_10_ox = ob_10_t_18;
    ob_10_oy = ob_10_t_19;
    ob_10_dep = ob_10_t_20;
    ob_10_count += 1;
  }
  float dep_c_21 = (ob_10_ox * P[4]);
  float dep_c_22 = (ob_10_oy * P[4]);
  float dep_c_23 = 0.0;
  vec3 dep_col_24 = pal((((ob_10_dep / keepf_8) * 0.7) + 0.05), vec3(0.4, 0.5, 0.4), vec3(0.4, 0.45, 0.4), vec3(1.0, 0.95, 0.8), vec3(0.2, 0.35, 0.15));
  float dep_glow_25 = (0.5 + (0.7 * P[5]));
  col = dep_col_24 * dep_glow_25;
  return vec3(dep_c_21, dep_c_22, dep_c_23);
}
