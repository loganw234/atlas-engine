vec3 shape_ifs_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 589545387u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_iters = int(P[3] + 0.5);
  float n_1 = max(P[0], 3.0);
  float ca_2 = cos(P[2]);
  float sa_3 = sin(P[2]);
  pt = hashu(pt);
  float draw_4 = u2f(pt);
  float x0_5 = ((draw_4 * 2.0) - 1.0);
  pt = hashu(pt);
  float draw_6 = u2f(pt);
  float y0_7 = ((draw_6 * 2.0) - 1.0);
  pt = hashu(pt);
  float draw_8 = u2f(pt);
  float z0_9 = ((draw_8 * 2.0) - 1.0);
  pt = hashu(pt);
  float draw_10 = u2f(pt);
  float k0_11 = floor((draw_10 * n_1));
  float ob_12_x = x0_5;
  float ob_12_y = y0_7;
  float ob_12_z = z0_9;
  float ob_12_kv = k0_11;
  float ob_12_last = 0.0;
  int ob_12_count = 0;
  bool ob_12_esc = false;
  for (int ok_13 = 0; ok_13 < 28; ok_13++) {
    if (ok_13 >= li_iters) break;
    float ob_12_t_14 = ((ca_2 * mix(ob_12_x, (sqrt(max(0.0, (1.0 - (((1.0 - ((2.0 * ((ob_12_kv + 0.5))) / n_1))) * ((1.0 - ((2.0 * ((ob_12_kv + 0.5))) / n_1))))))) * cos((ob_12_kv * 2.39996322973))), P[1])) - (sa_3 * mix(ob_12_z, (sqrt(max(0.0, (1.0 - (((1.0 - ((2.0 * ((ob_12_kv + 0.5))) / n_1))) * ((1.0 - ((2.0 * ((ob_12_kv + 0.5))) / n_1))))))) * sin((ob_12_kv * 2.39996322973))), P[1])));
    float ob_12_t_15 = mix(ob_12_y, (1.0 - ((2.0 * ((ob_12_kv + 0.5))) / n_1)), P[1]);
    float ob_12_t_16 = ((sa_3 * mix(ob_12_x, (sqrt(max(0.0, (1.0 - (((1.0 - ((2.0 * ((ob_12_kv + 0.5))) / n_1))) * ((1.0 - ((2.0 * ((ob_12_kv + 0.5))) / n_1))))))) * cos((ob_12_kv * 2.39996322973))), P[1])) + (ca_2 * mix(ob_12_z, (sqrt(max(0.0, (1.0 - (((1.0 - ((2.0 * ((ob_12_kv + 0.5))) / n_1))) * ((1.0 - ((2.0 * ((ob_12_kv + 0.5))) / n_1))))))) * sin((ob_12_kv * 2.39996322973))), P[1])));
    pt = hashu(pt);
    float draw_17 = u2f(pt);
    float ob_12_t_18 = floor((draw_17 * n_1));
    float ob_12_t_19 = ob_12_kv;
    ob_12_x = ob_12_t_14;
    ob_12_y = ob_12_t_15;
    ob_12_z = ob_12_t_16;
    ob_12_kv = ob_12_t_18;
    ob_12_last = ob_12_t_19;
    ob_12_count += 1;
  }
  vec3 byRad_20 = pal((length(vec3(ob_12_x, ob_12_y, ob_12_z)) * 0.8), vec3(0.40, 0.50, 0.35), vec3(0.35, 0.40, 0.30), vec3(1.0, 0.9, 0.8), vec3(0.30, 0.15, 0.45));
  vec3 byAdr_21 = pal((ob_12_last / n_1), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
  float dep_c_22 = (ob_12_x * 1.15);
  float dep_c_23 = (ob_12_y * 1.15);
  float dep_c_24 = (ob_12_z * 1.15);
  vec3 dep_col_25 = mix(byRad_20, byAdr_21, P[4]);
  col = dep_col_25;
  return vec3(dep_c_22, dep_c_23, dep_c_24);
}
