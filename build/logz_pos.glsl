vec3 shape_logz_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 41692001u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float rho_1 = sqrt(mix((P[3] * P[3]), (P[4] * P[4]), q.x));
  float th_2 = ((((q.y - 0.5)) * TAU) * P[0]);
  float re_3 = log(rho_1);
  float im_4 = th_2;
  float beta_5 = (P[1] * uT);
  float y_6 = (((((cos(beta_5) * 0.115) * im_4) + ((sin(beta_5) * 0.55) * re_3))) * P[5]);
  float gx_7 = abs((fract(((re_3 * 2.2) * P[2])) - 0.5));
  float gy_8 = abs((fract(((im_4 * 0.7) * P[2])) - 0.5));
  float line_9 = smoothstep(0.12, 0.02, min(gx_7, gy_8));
  vec3 wheel_10 = pal(fract((th_2 / TAU)), vec3(0.48, 0.48, 0.48), vec3(0.42, 0.42, 0.42), vec3(1.0, 1.0, 1.0), vec3(0.02, 0.36, 0.70));
  float dep_c_11 = ((rho_1 * cos(th_2)) * 0.95);
  float dep_c_12 = (y_6 * 0.95);
  float dep_c_13 = ((rho_1 * sin(th_2)) * 0.95);
  vec3 dep_col_14 = ((wheel_10 * 0.30) + (vec3(0.90, 0.92, 1.0) * (line_9 * 0.95)));
  col = dep_col_14;
  return vec3(dep_c_11, dep_c_12, dep_c_13);
}
