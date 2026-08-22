vec3 shape_invjulia_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 1364646393u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_iters = int(P[2] + 0.5);
  pt = hashu(pt);
  float jx_1 = u2f(pt) - 0.5;
  pt = hashu(pt);
  vec2 jit_2 = vec2(jx_1, u2f(pt) - 0.5);
  vec2 j_3 = (jit_2 * 2.0);
  float ob_4_x = j_3.x;
  float ob_4_y = j_3.y;
  pt = hashu(pt);
  float draw_5 = u2f(pt);
  float ob_4_u = draw_5;
  int ob_4_count = 0;
  bool ob_4_esc = false;
  for (int ok_6 = 0; ok_6 < 60; ok_6++) {
    if (ok_6 >= li_iters) break;
    float ob_4_t_7 = ((((((ob_4_u < 0.5))) ? (-1.0) : 1.0)) * csqrt(vec2((ob_4_x - P[0]), (ob_4_y - P[1]))).x);
    float ob_4_t_8 = ((((((ob_4_u < 0.5))) ? (-1.0) : 1.0)) * csqrt(vec2((ob_4_x - P[0]), (ob_4_y - P[1]))).y);
    pt = hashu(pt);
    float draw_9 = u2f(pt);
    float ob_4_t_10 = draw_9;
    ob_4_x = ob_4_t_7;
    ob_4_y = ob_4_t_8;
    ob_4_u = ob_4_t_10;
    ob_4_count += 1;
  }
  float dd_11 = ((ob_4_x * ob_4_x) + (ob_4_y * ob_4_y));
  float bl_12 = clamp(P[4], 0.0, 1.0);
  float px_13 = mix((ob_4_x * P[3]), (((2.0 * ob_4_x) / ((dd_11 + 1.0))) * ((P[3] * 1.1))), bl_12);
  float py_14 = mix((ob_4_y * P[3]), (((2.0 * ob_4_y) / ((dd_11 + 1.0))) * ((P[3] * 1.1))), bl_12);
  float pz_15 = mix(0.0, ((((dd_11 - 1.0)) / ((dd_11 + 1.0))) * ((P[3] * 1.1))), bl_12);
  float dep_c_16 = px_13;
  float dep_c_17 = py_14;
  float dep_c_18 = pz_15;
  vec3 dep_col_19 = pal(((atan(ob_4_y, ob_4_x) / TAU) + 0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
  float dep_glow_20 = (0.5 + (0.65 * P[5]));
  col = dep_col_19 * dep_glow_20;
  return vec3(dep_c_16, dep_c_17, dep_c_18);
}
