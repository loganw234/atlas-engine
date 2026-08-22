vec3 shape_stoch_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 132547501u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_rows = int(P[1] + 0.5);
  float px_1 = 0.0;
  float py_2 = 0.0;
  float pz_3 = 0.0;
  vec3 cv_4 = vec3(0.0, 0.0, 0.0);
  if ((P[0] == 0.0)) {
    float rr_5 = (floor((q.y * P[1])) + 1.0);
    float xr_6 = 0.0;
    if ((P[3] == 0.0)) {
      float ob_7_x = 0.0;
      float ob_7_j = 0.0;
      int ob_7_count = 0;
      bool ob_7_esc = false;
      for (int ok_8 = 0; ok_8 < 200; ok_8++) {
        if (ok_8 >= li_rows) break;
        if ((ob_7_j >= rr_5)) { ob_7_esc = true; break; }
        pt = hashu(pt);
        float draw_9 = u2f(pt);
        float ob_7_t_10 = (ob_7_x + (((((draw_9 < P[2]))) ? 1.0 : (-1.0))));
        float ob_7_t_11 = (ob_7_j + 1.0);
        ob_7_x = ob_7_t_10;
        ob_7_j = ob_7_t_11;
        ob_7_count += 1;
      }
      xr_6 = ob_7_x;
    } else {
      if ((P[3] == 1.0)) {
        float ob_12_x = 0.0;
        float ob_12_j = 0.0;
        int ob_12_count = 0;
        bool ob_12_esc = false;
        for (int ok_13 = 0; ok_13 < 200; ok_13++) {
          if (ok_13 >= li_rows) break;
          if ((ob_12_j >= rr_5)) { ob_12_esc = true; break; }
          pt = hashu(pt);
          float draw_14 = u2f(pt);
          float ob_12_t_15 = (ob_12_x + (((draw_14 - 0.5)) * 3.4));
          float ob_12_t_16 = (ob_12_j + 1.0);
          ob_12_x = ob_12_t_15;
          ob_12_j = ob_12_t_16;
          ob_12_count += 1;
        }
        xr_6 = ob_12_x;
      } else {
        float ob_17_x = 0.0;
        float ob_17_j = 0.0;
        int ob_17_count = 0;
        bool ob_17_esc = false;
        for (int ok_18 = 0; ok_18 < 200; ok_18++) {
          if (ok_18 >= li_rows) break;
          if ((ob_17_j >= rr_5)) { ob_17_esc = true; break; }
          pt = hashu(pt);
          float draw_19 = u2f(pt);
          float ob_17_t_20 = (ob_17_x + (tan((PI * ((draw_19 - 0.5)))) * 0.5));
          float ob_17_t_21 = (ob_17_j + 1.0);
          ob_17_x = ob_17_t_20;
          ob_17_j = ob_17_t_21;
          ob_17_count += 1;
        }
        xr_6 = ob_17_x;
      }
    }
    px_1 = ((xr_6 * P[4]) * 0.12);
    py_2 = (((0.5 - q.y)) * 2.2);
    pz_3 = 0.0;
    cv_4 = pal(((q.y * 0.6) + 0.1), vec3(0.5, 0.45, 0.5), vec3(0.5, 0.45, 0.45), vec3(1.0, 0.95, 0.9), vec3(0.1, 0.25, 0.5));
  } else {
    pt = hashu(pt);
    float draw_22 = u2f(pt);
    float target_23 = floor((draw_22 * P[1]));
    float ex_24 = 0.0;
    float ey_25 = 0.0;
    float ez_26 = 0.0;
    if ((P[3] == 0.0)) {
      pt = hashu(pt);
      float draw_28 = u2f(pt);
      float ob_27_u1 = draw_28;
      pt = hashu(pt);
      float draw_29 = u2f(pt);
      float ob_27_u2 = draw_29;
      pt = hashu(pt);
      float draw_30 = u2f(pt);
      float ob_27_u3 = draw_30;
      float ob_27_x = 0.0;
      float ob_27_y = 0.0;
      float ob_27_z = 0.0;
      float ob_27_j = 0.0;
      int ob_27_count = 0;
      bool ob_27_esc = false;
      for (int ok_31 = 0; ok_31 < 200; ok_31++) {
        if (ok_31 >= li_rows) break;
        if ((ob_27_j > target_23)) { ob_27_esc = true; break; }
        float ob_27_t_32 = (ob_27_x + ((sqrt(((-2.0) * log(max(1.0e-6, ob_27_u1)))) * cos((TAU * ob_27_u2))) * 0.1));
        float ob_27_t_33 = (ob_27_y + ((sqrt(((-2.0) * log(max(1.0e-6, ob_27_u1)))) * sin((TAU * ob_27_u2))) * 0.1));
        float ob_27_t_34 = (ob_27_z + ((sqrt(((-2.0) * log(max(1.0e-6, ob_27_u3)))) * cos((TAU * ob_27_u1))) * 0.1));
        pt = hashu(pt);
        float draw_35 = u2f(pt);
        float ob_27_t_36 = draw_35;
        pt = hashu(pt);
        float draw_37 = u2f(pt);
        float ob_27_t_38 = draw_37;
        pt = hashu(pt);
        float draw_39 = u2f(pt);
        float ob_27_t_40 = draw_39;
        float ob_27_t_41 = (ob_27_j + 1.0);
        ob_27_x = ob_27_t_32;
        ob_27_y = ob_27_t_33;
        ob_27_z = ob_27_t_34;
        ob_27_u1 = ob_27_t_36;
        ob_27_u2 = ob_27_t_38;
        ob_27_u3 = ob_27_t_40;
        ob_27_j = ob_27_t_41;
        ob_27_count += 1;
      }
      ex_24 = ob_27_x;
      ey_25 = ob_27_y;
      ez_26 = ob_27_z;
    } else {
      pt = hashu(pt);
      float draw_43 = u2f(pt);
      float ob_42_u1 = draw_43;
      pt = hashu(pt);
      float draw_44 = u2f(pt);
      float ob_42_u2 = draw_44;
      pt = hashu(pt);
      float draw_45 = u2f(pt);
      float ob_42_u3 = draw_45;
      float ob_42_x = 0.0;
      float ob_42_y = 0.0;
      float ob_42_z = 0.0;
      float ob_42_j = 0.0;
      int ob_42_count = 0;
      bool ob_42_esc = false;
      for (int ok_46 = 0; ok_46 < 200; ok_46++) {
        if (ok_46 >= li_rows) break;
        if ((ob_42_j > target_23)) { ob_42_esc = true; break; }
        float ob_42_t_47 = (ob_42_x + ((pow(max(1.0e-6, ob_42_u1), ((-1.0) / max(0.5, (P[2] + 0.5)))) * 0.02) * ((sqrt(max(0.0, (1.0 - (((1.0 - (2.0 * ob_42_u2))) * ((1.0 - (2.0 * ob_42_u2))))))) * cos((TAU * ob_42_u3))))));
        float ob_42_t_48 = (ob_42_y + ((pow(max(1.0e-6, ob_42_u1), ((-1.0) / max(0.5, (P[2] + 0.5)))) * 0.02) * ((1.0 - (2.0 * ob_42_u2)))));
        float ob_42_t_49 = (ob_42_z + ((pow(max(1.0e-6, ob_42_u1), ((-1.0) / max(0.5, (P[2] + 0.5)))) * 0.02) * ((sqrt(max(0.0, (1.0 - (((1.0 - (2.0 * ob_42_u2))) * ((1.0 - (2.0 * ob_42_u2))))))) * sin((TAU * ob_42_u3))))));
        pt = hashu(pt);
        float draw_50 = u2f(pt);
        float ob_42_t_51 = draw_50;
        pt = hashu(pt);
        float draw_52 = u2f(pt);
        float ob_42_t_53 = draw_52;
        pt = hashu(pt);
        float draw_54 = u2f(pt);
        float ob_42_t_55 = draw_54;
        float ob_42_t_56 = (ob_42_j + 1.0);
        ob_42_x = ob_42_t_47;
        ob_42_y = ob_42_t_48;
        ob_42_z = ob_42_t_49;
        ob_42_u1 = ob_42_t_51;
        ob_42_u2 = ob_42_t_53;
        ob_42_u3 = ob_42_t_55;
        ob_42_j = ob_42_t_56;
        ob_42_count += 1;
      }
      ex_24 = ob_42_x;
      ey_25 = ob_42_y;
      ez_26 = ob_42_z;
    }
    px_1 = (ex_24 * P[4]);
    py_2 = (ey_25 * P[4]);
    pz_3 = (ez_26 * P[4]);
    cv_4 = pal((((target_23 / P[1]) * 0.7) + 0.05), vec3(0.45, 0.4, 0.55), vec3(0.4, 0.4, 0.45), vec3(1.0, 0.9, 0.85), vec3(0.5, 0.35, 0.15));
  }
  float dep_c_57 = px_1;
  float dep_c_58 = py_2;
  float dep_c_59 = pz_3;
  vec3 dep_col_60 = cv_4;
  float dep_glow_61 = (0.5 + (0.7 * P[5]));
  col = dep_col_60 * dep_glow_61;
  return vec3(dep_c_57, dep_c_58, dep_c_59);
}
