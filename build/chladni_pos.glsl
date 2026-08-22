vec3 shape_chladni_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 1587279471u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float xx_1 = (q.x - 0.5);
  float yy_2 = (q.y - 0.5);
  float f_3 = ((cos(((P[0] * PI) * xx_1)) * cos(((P[1] * PI) * yy_2))) + ((P[2] * cos(((P[1] * PI) * xx_1))) * cos(((P[0] * PI) * yy_2))));
  float node_4 = exp((((-((f_3 * f_3))) * P[3]) * P[3]));
  float y_5 = ((P[4] * f_3) * cos((2.2 * uT)));
  vec3 wavec_6 = mix(vec3(0.10, 0.35, 0.55), vec3(0.90, 0.55, 0.25), (0.5 + (0.5 * f_3)));
  float dep_c_7 = (xx_1 * P[5]);
  float dep_c_8 = y_5;
  float dep_c_9 = (yy_2 * P[5]);
  vec3 dep_col_10 = ((wavec_6 * 0.10) + (vec3(0.95, 0.90, 0.75) * (node_4 * 1.3)));
  col = dep_col_10;
  return vec3(dep_c_7, dep_c_8, dep_c_9);
}
