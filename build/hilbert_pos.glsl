vec3 shape_hilbert_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 346116873u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  float D_1 = ((((P[0] > 2.5))) ? 3.0 : 2.0);
  float ord_2 = floor((P[1] + 0.5));
  if ((ord_2 < 1.0)) {
    ord_2 = 1.0;
  }
  if (((D_1 == 3.0) && (ord_2 > 6.0))) {
    ord_2 = 6.0;
  }
  bool morton_3 = (P[2] > 0.5);
  float nb_4 = (D_1 * ord_2);
  float cells_5 = pow(2.0, nb_4);
  float top_6 = pow(2.0, ord_2);
  float na_7 = min(floor((q.x * ((cells_5 - 1.0)))), (cells_5 - 2.0));
  float nz_8 = (na_7 + 1.0);
  float ob_9_x0 = 0.0;
  float ob_9_x1 = 0.0;
  float ob_9_x2 = 0.0;
  float ob_9_pw = pow(2.0, (nb_4 - 1.0));
  float ob_9_j = 0.0;
  int ob_9_count = 0;
  bool ob_9_esc = false;
  for (int ok_10 = 0; ok_10 < 18; ok_10++) {
    if ((ob_9_j >= nb_4)) { ob_9_esc = true; break; }
    float ob_9_t_11 = ((((mod(float(ok_10), D_1) == 0.0))) ? ((ob_9_x0 * 2.0) + mod(floor((na_7 / ob_9_pw)), 2.0)) : ob_9_x0);
    float ob_9_t_12 = ((((mod(float(ok_10), D_1) == 1.0))) ? ((ob_9_x1 * 2.0) + mod(floor((na_7 / ob_9_pw)), 2.0)) : ob_9_x1);
    float ob_9_t_13 = ((((mod(float(ok_10), D_1) == 2.0))) ? ((ob_9_x2 * 2.0) + mod(floor((na_7 / ob_9_pw)), 2.0)) : ob_9_x2);
    float ob_9_t_14 = (ob_9_pw / 2.0);
    float ob_9_t_15 = (ob_9_j + 1.0);
    ob_9_x0 = ob_9_t_11;
    ob_9_x1 = ob_9_t_12;
    ob_9_x2 = ob_9_t_13;
    ob_9_pw = ob_9_t_14;
    ob_9_j = ob_9_t_15;
    ob_9_count += 1;
  }
  float ob_16_x0 = 0.0;
  float ob_16_x1 = 0.0;
  float ob_16_x2 = 0.0;
  float ob_16_pw = pow(2.0, (nb_4 - 1.0));
  float ob_16_j = 0.0;
  int ob_16_count = 0;
  bool ob_16_esc = false;
  for (int ok_17 = 0; ok_17 < 18; ok_17++) {
    if ((ob_16_j >= nb_4)) { ob_16_esc = true; break; }
    float ob_16_t_18 = ((((mod(float(ok_17), D_1) == 0.0))) ? ((ob_16_x0 * 2.0) + mod(floor((nz_8 / ob_16_pw)), 2.0)) : ob_16_x0);
    float ob_16_t_19 = ((((mod(float(ok_17), D_1) == 1.0))) ? ((ob_16_x1 * 2.0) + mod(floor((nz_8 / ob_16_pw)), 2.0)) : ob_16_x1);
    float ob_16_t_20 = ((((mod(float(ok_17), D_1) == 2.0))) ? ((ob_16_x2 * 2.0) + mod(floor((nz_8 / ob_16_pw)), 2.0)) : ob_16_x2);
    float ob_16_t_21 = (ob_16_pw / 2.0);
    float ob_16_t_22 = (ob_16_j + 1.0);
    ob_16_x0 = ob_16_t_18;
    ob_16_x1 = ob_16_t_19;
    ob_16_x2 = ob_16_t_20;
    ob_16_pw = ob_16_t_21;
    ob_16_j = ob_16_t_22;
    ob_16_count += 1;
  }
  float ca0_23 = ob_9_x0;
  float ca1_24 = ob_9_x1;
  float ca2_25 = ob_9_x2;
  float cb0_26 = ob_16_x0;
  float cb1_27 = ob_16_x1;
  float cb2_28 = ob_16_x2;
  if ((!morton_3)) {
    float ta_29 = ((((D_1 == 3.0))) ? floor((ob_9_x2 / 2.0)) : floor((ob_9_x1 / 2.0)));
    float acc_30 = 0.0;
    for (int sk_31 = 0; sk_31 < 8; sk_31++) {
      acc_30 += (mod((floor((ob_9_x0 / pow(2.0, float(sk_31)))) + floor((ta_29 / pow(2.0, float(sk_31))))), 2.0) * pow(2.0, float(sk_31)));
    }
    float a0_32 = acc_30;
    float acc_33 = 0.0;
    for (int sk_34 = 0; sk_34 < 8; sk_34++) {
      acc_33 += (mod((floor((ob_9_x1 / pow(2.0, float(sk_34)))) + floor((ob_9_x0 / pow(2.0, float(sk_34))))), 2.0) * pow(2.0, float(sk_34)));
    }
    float a1_35 = acc_33;
    float acc_36 = 0.0;
    for (int sk_37 = 0; sk_37 < 8; sk_37++) {
      acc_36 += (mod((floor((ob_9_x2 / pow(2.0, float(sk_37)))) + floor((ob_9_x1 / pow(2.0, float(sk_37))))), 2.0) * pow(2.0, float(sk_37)));
    }
    float a2x_38 = acc_36;
    float a2_39 = ((((D_1 == 3.0))) ? a2x_38 : ob_9_x2);
    float tb_40 = ((((D_1 == 3.0))) ? floor((ob_16_x2 / 2.0)) : floor((ob_16_x1 / 2.0)));
    float acc_41 = 0.0;
    for (int sk_42 = 0; sk_42 < 8; sk_42++) {
      acc_41 += (mod((floor((ob_16_x0 / pow(2.0, float(sk_42)))) + floor((tb_40 / pow(2.0, float(sk_42))))), 2.0) * pow(2.0, float(sk_42)));
    }
    float b0_43 = acc_41;
    float acc_44 = 0.0;
    for (int sk_45 = 0; sk_45 < 8; sk_45++) {
      acc_44 += (mod((floor((ob_16_x1 / pow(2.0, float(sk_45)))) + floor((ob_16_x0 / pow(2.0, float(sk_45))))), 2.0) * pow(2.0, float(sk_45)));
    }
    float b1_46 = acc_44;
    float acc_47 = 0.0;
    for (int sk_48 = 0; sk_48 < 8; sk_48++) {
      acc_47 += (mod((floor((ob_16_x2 / pow(2.0, float(sk_48)))) + floor((ob_16_x1 / pow(2.0, float(sk_48))))), 2.0) * pow(2.0, float(sk_48)));
    }
    float b2x_49 = acc_47;
    float b2_50 = ((((D_1 == 3.0))) ? b2x_49 : ob_16_x2);
    float ob_51_x0 = a0_32;
    float ob_51_x1 = a1_35;
    float ob_51_x2 = a2_39;
    float ob_51_Q = 2.0;
    int ob_51_count = 0;
    bool ob_51_esc = false;
    for (int ok_52 = 0; ok_52 < 21; ok_52++) {
      if ((ob_51_Q == top_6)) { ob_51_esc = true; break; }
      float ob_51_t_53 = (((((ok_52 % 3) == 0))) ? (((((D_1 == 3.0))) ? (((((mod(floor((ob_51_x2 / ob_51_Q)), 2.0) > 0.5))) ? (((ob_51_x0 - (2.0 * mod(ob_51_x0, ob_51_Q))) + ob_51_Q) - 1.0) : ((ob_51_x0 - mod(ob_51_x0, ob_51_Q)) + mod(ob_51_x2, ob_51_Q)))) : ob_51_x0)) : ((((((ok_52 % 3) == 1))) ? (((((mod(floor((ob_51_x1 / ob_51_Q)), 2.0) > 0.5))) ? (((ob_51_x0 - (2.0 * mod(ob_51_x0, ob_51_Q))) + ob_51_Q) - 1.0) : ((ob_51_x0 - mod(ob_51_x0, ob_51_Q)) + mod(ob_51_x1, ob_51_Q)))) : (((((mod(floor((ob_51_x0 / ob_51_Q)), 2.0) > 0.5))) ? (((ob_51_x0 - (2.0 * mod(ob_51_x0, ob_51_Q))) + ob_51_Q) - 1.0) : ob_51_x0)))));
      float ob_51_t_54 = ((((((ok_52 % 3) == 1) && (mod(floor((ob_51_x1 / ob_51_Q)), 2.0) < 0.5)))) ? ((ob_51_x1 - mod(ob_51_x1, ob_51_Q)) + mod(ob_51_x0, ob_51_Q)) : ob_51_x1);
      float ob_51_t_55 = (((((((ok_52 % 3) == 0) && (D_1 == 3.0)) && (mod(floor((ob_51_x2 / ob_51_Q)), 2.0) < 0.5)))) ? ((ob_51_x2 - mod(ob_51_x2, ob_51_Q)) + mod(ob_51_x0, ob_51_Q)) : ob_51_x2);
      float ob_51_t_56 = (((((ok_52 % 3) == 2))) ? (ob_51_Q * 2.0) : ob_51_Q);
      ob_51_x0 = ob_51_t_53;
      ob_51_x1 = ob_51_t_54;
      ob_51_x2 = ob_51_t_55;
      ob_51_Q = ob_51_t_56;
      ob_51_count += 1;
    }
    float ob_57_x0 = b0_43;
    float ob_57_x1 = b1_46;
    float ob_57_x2 = b2_50;
    float ob_57_Q = 2.0;
    int ob_57_count = 0;
    bool ob_57_esc = false;
    for (int ok_58 = 0; ok_58 < 21; ok_58++) {
      if ((ob_57_Q == top_6)) { ob_57_esc = true; break; }
      float ob_57_t_59 = (((((ok_58 % 3) == 0))) ? (((((D_1 == 3.0))) ? (((((mod(floor((ob_57_x2 / ob_57_Q)), 2.0) > 0.5))) ? (((ob_57_x0 - (2.0 * mod(ob_57_x0, ob_57_Q))) + ob_57_Q) - 1.0) : ((ob_57_x0 - mod(ob_57_x0, ob_57_Q)) + mod(ob_57_x2, ob_57_Q)))) : ob_57_x0)) : ((((((ok_58 % 3) == 1))) ? (((((mod(floor((ob_57_x1 / ob_57_Q)), 2.0) > 0.5))) ? (((ob_57_x0 - (2.0 * mod(ob_57_x0, ob_57_Q))) + ob_57_Q) - 1.0) : ((ob_57_x0 - mod(ob_57_x0, ob_57_Q)) + mod(ob_57_x1, ob_57_Q)))) : (((((mod(floor((ob_57_x0 / ob_57_Q)), 2.0) > 0.5))) ? (((ob_57_x0 - (2.0 * mod(ob_57_x0, ob_57_Q))) + ob_57_Q) - 1.0) : ob_57_x0)))));
      float ob_57_t_60 = ((((((ok_58 % 3) == 1) && (mod(floor((ob_57_x1 / ob_57_Q)), 2.0) < 0.5)))) ? ((ob_57_x1 - mod(ob_57_x1, ob_57_Q)) + mod(ob_57_x0, ob_57_Q)) : ob_57_x1);
      float ob_57_t_61 = (((((((ok_58 % 3) == 0) && (D_1 == 3.0)) && (mod(floor((ob_57_x2 / ob_57_Q)), 2.0) < 0.5)))) ? ((ob_57_x2 - mod(ob_57_x2, ob_57_Q)) + mod(ob_57_x0, ob_57_Q)) : ob_57_x2);
      float ob_57_t_62 = (((((ok_58 % 3) == 2))) ? (ob_57_Q * 2.0) : ob_57_Q);
      ob_57_x0 = ob_57_t_59;
      ob_57_x1 = ob_57_t_60;
      ob_57_x2 = ob_57_t_61;
      ob_57_Q = ob_57_t_62;
      ob_57_count += 1;
    }
    ca0_23 = ob_51_x0;
    ca1_24 = ob_51_x1;
    ca2_25 = ob_51_x2;
    cb0_26 = ob_57_x0;
    cb1_27 = ob_57_x1;
    cb2_28 = ob_57_x2;
  }
  float sc_63 = (2.4 / top_6);
  float ax_64 = ((((ca0_23 + 0.5)) * sc_63) - 1.2);
  float ay_65 = ((((D_1 == 3.0))) ? ((((ca1_24 + 0.5)) * sc_63) - 1.2) : 0.0);
  float az_66 = ((((D_1 == 3.0))) ? ((((ca2_25 + 0.5)) * sc_63) - 1.2) : ((((ca1_24 + 0.5)) * sc_63) - 1.2));
  float bx_67 = ((((cb0_26 + 0.5)) * sc_63) - 1.2);
  float by_68 = ((((D_1 == 3.0))) ? ((((cb1_27 + 0.5)) * sc_63) - 1.2) : 0.0);
  float bz_69 = ((((D_1 == 3.0))) ? ((((cb2_28 + 0.5)) * sc_63) - 1.2) : ((((cb1_27 + 0.5)) * sc_63) - 1.2));
  pt = hashu(pt);
  float draw_70 = u2f(pt) - 0.5;
  float jx_71 = draw_70;
  pt = hashu(pt);
  float draw_72 = u2f(pt) - 0.5;
  float jy_73 = draw_72;
  pt = hashu(pt);
  float draw_74 = u2f(pt) - 0.5;
  float jz_75 = draw_74;
  float fog_76 = ((2.0 * sc_63) * P[3]);
  float along_77 = (((na_7 + q.y)) / ((cells_5 - 1.0)));
  float dep_c_78 = (mix(ax_64, bx_67, q.y) + (jx_71 * fog_76));
  float dep_c_79 = (mix(ay_65, by_68, q.y) + (jy_73 * fog_76));
  float dep_c_80 = (mix(az_66, bz_69, q.y) + (jz_75 * fog_76));
  vec3 dep_col_81 = pal(((along_77 * P[4]) - (uT * 0.02)), vec3(0.52, 0.46, 0.42), vec3(0.48, 0.42, 0.38), vec3(1.0, 1.0, 1.0), vec3(0.00, 0.25, 0.50));
  float dep_glow_82 = (0.5 + (0.7 * P[5]));
  col = dep_col_81 * dep_glow_82;
  return vec3(dep_c_78, dep_c_79, dep_c_80);
}
