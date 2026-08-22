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
  float ob_4_u = u2f(pt);
  int ob_4_count = 0;
  bool ob_4_esc = false;
  for (int ok_5 = 0; ok_5 < 60; ok_5++) {
    if (ok_5 >= li_iters) break;
    float ob_4_t_6 = ((((((ob_4_u < 0.5))) ? (-1.0) : 1.0)) * csqrt(vec2((ob_4_x - P[0]), (ob_4_y - P[1]))).x);
    float ob_4_t_7 = ((((((ob_4_u < 0.5))) ? (-1.0) : 1.0)) * csqrt(vec2((ob_4_x - P[0]), (ob_4_y - P[1]))).y);
    pt = hashu(pt);
    float ob_4_t_8 = u2f(pt);
    ob_4_x = ob_4_t_6;
    ob_4_y = ob_4_t_7;
    ob_4_u = ob_4_t_8;
    ob_4_count += 1;
  }
  float dd_9 = ((ob_4_x * ob_4_x) + (ob_4_y * ob_4_y));
  float bl_10 = clamp(P[4], 0.0, 1.0);
  float px_11 = mix((ob_4_x * P[3]), (((2.0 * ob_4_x) / ((dd_9 + 1.0))) * ((P[3] * 1.1))), bl_10);
  float py_12 = mix((ob_4_y * P[3]), (((2.0 * ob_4_y) / ((dd_9 + 1.0))) * ((P[3] * 1.1))), bl_10);
  float pz_13 = mix(0.0, ((((dd_9 - 1.0)) / ((dd_9 + 1.0))) * ((P[3] * 1.1))), bl_10);
  float dep_c_14 = px_11;
  float dep_c_15 = py_12;
  float dep_c_16 = pz_13;
  vec3 dep_col_17 = pal(((atan(ob_4_y, ob_4_x) / TAU) + 0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
  float dep_glow_18 = (0.5 + (0.65 * P[5]));
  col = dep_col_17 * dep_glow_18;
  return vec3(dep_c_14, dep_c_15, dep_c_16);
}
