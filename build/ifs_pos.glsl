vec3 shape_ifs_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 589545387u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_iters = int(P[3] + 0.5);
  float n_1 = max(P[0], 3.0);
  float ca_2 = cos(P[2]);
  float sa_3 = sin(P[2]);
  pt = hashu(pt);
  float x0_4 = ((u2f(pt) * 2.0) - 1.0);
  pt = hashu(pt);
  float y0_5 = ((u2f(pt) * 2.0) - 1.0);
  pt = hashu(pt);
  float z0_6 = ((u2f(pt) * 2.0) - 1.0);
  pt = hashu(pt);
  float k0_7 = floor((u2f(pt) * n_1));
  float ob_8_x = x0_4;
  float ob_8_y = y0_5;
  float ob_8_z = z0_6;
  float ob_8_kv = k0_7;
  float ob_8_last = 0.0;
  int ob_8_count = 0;
  bool ob_8_esc = false;
  for (int ok_9 = 0; ok_9 < 28; ok_9++) {
    if (ok_9 >= li_iters) break;
    float ob_8_t_10 = ((ca_2 * mix(ob_8_x, (sqrt(max(0.0, (1.0 - (((1.0 - ((2.0 * ((ob_8_kv + 0.5))) / n_1))) * ((1.0 - ((2.0 * ((ob_8_kv + 0.5))) / n_1))))))) * cos((ob_8_kv * 2.39996322973))), P[1])) - (sa_3 * mix(ob_8_z, (sqrt(max(0.0, (1.0 - (((1.0 - ((2.0 * ((ob_8_kv + 0.5))) / n_1))) * ((1.0 - ((2.0 * ((ob_8_kv + 0.5))) / n_1))))))) * sin((ob_8_kv * 2.39996322973))), P[1])));
    float ob_8_t_11 = mix(ob_8_y, (1.0 - ((2.0 * ((ob_8_kv + 0.5))) / n_1)), P[1]);
    float ob_8_t_12 = ((sa_3 * mix(ob_8_x, (sqrt(max(0.0, (1.0 - (((1.0 - ((2.0 * ((ob_8_kv + 0.5))) / n_1))) * ((1.0 - ((2.0 * ((ob_8_kv + 0.5))) / n_1))))))) * cos((ob_8_kv * 2.39996322973))), P[1])) + (ca_2 * mix(ob_8_z, (sqrt(max(0.0, (1.0 - (((1.0 - ((2.0 * ((ob_8_kv + 0.5))) / n_1))) * ((1.0 - ((2.0 * ((ob_8_kv + 0.5))) / n_1))))))) * sin((ob_8_kv * 2.39996322973))), P[1])));
    pt = hashu(pt);
    float ob_8_t_13 = floor((u2f(pt) * n_1));
    float ob_8_t_14 = ob_8_kv;
    ob_8_x = ob_8_t_10;
    ob_8_y = ob_8_t_11;
    ob_8_z = ob_8_t_12;
    ob_8_kv = ob_8_t_13;
    ob_8_last = ob_8_t_14;
    ob_8_count += 1;
  }
  vec3 byRad_15 = pal((length(vec3(ob_8_x, ob_8_y, ob_8_z)) * 0.8), vec3(0.40, 0.50, 0.35), vec3(0.35, 0.40, 0.30), vec3(1.0, 0.9, 0.8), vec3(0.30, 0.15, 0.45));
  vec3 byAdr_16 = pal((ob_8_last / n_1), vec3(0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
  float dep_c_17 = (ob_8_x * 1.15);
  float dep_c_18 = (ob_8_y * 1.15);
  float dep_c_19 = (ob_8_z * 1.15);
  vec3 dep_col_20 = mix(byRad_15, byAdr_16, P[4]);
  col = dep_col_20;
  return vec3(dep_c_17, dep_c_18, dep_c_19);
}
