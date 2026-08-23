vec3 stain_rulespace_pos(vec3 c, float a){
  float cs = cos(a), sn = sin(a);
  vec3 k = vec3(0.57735027);
  return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec3 shape_rulespace_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 3803615803u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_depth = int(P[0] + 0.5);
  int li_seeding = int(P[2] + 0.5);
  float ob_1_n = 1.0;
  int ob_1_count = 0;
  bool ob_1_esc = false;
  for (int ok_2 = 0; ok_2 < 9; ok_2++) {
    if (ok_2 >= li_depth) break;
    float ob_1_t_3 = (ob_1_n * 2.0);
    ob_1_n = ob_1_t_3;
    ob_1_count += 1;
  }
  float rowsT_4 = ob_1_n;
  float rowPitch_5 = (65536.0 / rowsT_4);
  float mag_6 = pow(2.0, P[1]);
  float shrink_7 = (1.0 - (1.0 / mag_6));
  float wcx_8 = (585728.0 + floor((479232.0 * shrink_7)));
  float wcy_9 = (585728.0 - floor((462848.0 * shrink_7)));
  float hw_10 = floor((585728.0 / mag_6));
  float winx_11 = (wcx_8 - hw_10);
  float winy_12 = (wcy_9 - hw_10);
  float winz_13 = (wcx_8 + hw_10);
  float winw_14 = (wcy_9 + hw_10);
  float km_15 = ((2.85 / 1171456.0) * mag_6);
  float acc_16 = 0.0;
  for (int sk_17 = 0; sk_17 < 16; sk_17++) {
    acc_16 += floor((max(0.0, (min(winz_13, ((float(sk_17) * 73728.0) + 65536.0)) - max(winx_11, (float(sk_17) * 73728.0)))) / 512.0));
  }
  float accx_18 = acc_16;
  float acc_19 = 0.0;
  for (int sk_20 = 0; sk_20 < 16; sk_20++) {
    acc_19 += floor((max(0.0, (min(winw_14, ((float(sk_20) * 73728.0) + 65536.0)) - max(winy_12, (float(sk_20) * 73728.0)))) / 512.0));
  }
  float accy_21 = acc_19;
  if (((accx_18 <= 0.0) || (accy_21 <= 0.0))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  pt = hashu(pt);
  float draw_22 = u2f(pt);
  float px2_23 = floor((draw_22 * accx_18));
  float ob_24_run = 0.0;
  float ob_24_g = 0.0;
  int ob_24_count = 0;
  bool ob_24_esc = false;
  for (int ok_25 = 0; ok_25 < 16; ok_25++) {
    float a0_26 = max(winx_11, (float(ok_25) * 73728.0));
    float a1_27 = min(winz_13, ((float(ok_25) * 73728.0) + 65536.0));
    float wk_28 = floor((max(0.0, (a1_27 - a0_26)) / 512.0));
    float nr_29 = (ob_24_run + wk_28);
    float ob_24_t_30 = nr_29;
    float ob_24_t_31 = ((((((px2_23 >= ob_24_run) && (px2_23 < nr_29)) && (wk_28 > 0.0)))) ? ((float(ok_25) + 0.0)) : ob_24_g);
    ob_24_run = ob_24_t_30;
    ob_24_g = ob_24_t_31;
    ob_24_count += 1;
  }
  pt = hashu(pt);
  float draw_32 = u2f(pt);
  float py2_33 = floor((draw_32 * accy_21));
  float ob_34_run = 0.0;
  float ob_34_g = 0.0;
  int ob_34_count = 0;
  bool ob_34_esc = false;
  for (int ok_35 = 0; ok_35 < 16; ok_35++) {
    float b0_36 = max(winy_12, (float(ok_35) * 73728.0));
    float b1_37 = min(winw_14, ((float(ok_35) * 73728.0) + 65536.0));
    float wk_38 = floor((max(0.0, (b1_37 - b0_36)) / 512.0));
    float nr_39 = (ob_34_run + wk_38);
    float ob_34_t_40 = nr_39;
    float ob_34_t_41 = ((((((py2_33 >= ob_34_run) && (py2_33 < nr_39)) && (wk_38 > 0.0)))) ? ((float(ok_35) + 0.0)) : ob_34_g);
    ob_34_run = ob_34_t_40;
    ob_34_g = ob_34_t_41;
    ob_34_count += 1;
  }
  float rule_42 = ((ob_34_g * 16.0) + ob_24_g);
  float tlox_43 = (ob_24_g * 73728.0);
  float tloy_44 = (ob_34_g * 73728.0);
  float rlo_45 = max(0.0, floor((((winy_12 - tloy_44)) / rowPitch_5)));
  float rhi_46 = min((rowsT_4 - 1.0), floor((((winw_14 - tloy_44)) / rowPitch_5)));
  float k0_47 = max(0.0, floor((((winx_11 - tlox_43)) / 512.0)));
  float k1_48 = min(127.0, floor((((winz_13 - tlox_43)) / 512.0)));
  if (((rhi_46 < rlo_45) || (k1_48 < k0_47))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  pt = hashu(pt);
  float draw_49 = u2f(pt);
  float trow0_50 = (rlo_45 + floor((draw_49 * (((rhi_46 - rlo_45) + 1.0)))));
  float trow_51 = min(trow0_50, rhi_46);
  pt = hashu(pt);
  float draw_52 = u2f(pt);
  float xc0_53 = (k0_47 + floor((draw_52 * (((k1_48 - k0_47) + 1.0)))));
  float xcell_54 = min(xc0_53, k1_48);
  float wbase_55 = (floor((P[3] + 0.5)) * 16.0);
  float ob_56_w0 = 0.0;
  float ob_56_w1 = 0.0;
  float ob_56_w2 = 0.0;
  float ob_56_w3 = 0.0;
  float ob_56_w4 = 0.0;
  float ob_56_w5 = 0.0;
  float ob_56_w6 = 0.0;
  float ob_56_w7 = 0.0;
  int ob_56_count = 0;
  bool ob_56_esc = false;
  for (int ok_57 = 0; ok_57 < 16; ok_57++) {
    if (ok_57 >= li_seeding) break;
    float vn_58_x = rule_42;
    float vn_58_y = (wbase_55 + float(ok_57));
    float vn_58_ix = floor(vn_58_x);
    float vn_58_iy = floor(vn_58_y);
    float vn_58_fx = vn_58_x - vn_58_ix;
    float vn_58_fy = vn_58_y - vn_58_iy;
    float vn_58_wx = (vn_58_fx * vn_58_fx) * (3.0 - (2.0 * vn_58_fx));
    float vn_58_wy = (vn_58_fy * vn_58_fy) * (3.0 - (2.0 * vn_58_fy));
    uint vn_58_bx = uint(int(vn_58_ix) & 1023);
    uint vn_58_by = uint(int(vn_58_iy) & 1023);
    uint vn_58_oc = uint(0);
    float vn_58_00 = u2f(hashu(vn_58_oc ^ hashu((vn_58_bx + 0u) * 374761393u + (vn_58_by + 0u) * 668265263u)));
    float vn_58_10 = u2f(hashu(vn_58_oc ^ hashu((vn_58_bx + 1u) * 374761393u + (vn_58_by + 0u) * 668265263u)));
    float vn_58_01 = u2f(hashu(vn_58_oc ^ hashu((vn_58_bx + 0u) * 374761393u + (vn_58_by + 1u) * 668265263u)));
    float vn_58_11 = u2f(hashu(vn_58_oc ^ hashu((vn_58_bx + 1u) * 374761393u + (vn_58_by + 1u) * 668265263u)));
    float vn_58_a = vn_58_00 + ((vn_58_10 - vn_58_00) * vn_58_wx);
    float vn_58_b = vn_58_01 + ((vn_58_11 - vn_58_01) * vn_58_wx);
    float vn_58_v = (vn_58_a + ((vn_58_b - vn_58_a) * vn_58_wy)) - 0.5;
    float hk_59 = (vn_58_v + 0.5);
    float sx_60 = ((((ok_57 == 0))) ? 64.0 : min(floor((hk_59 * 128.0)), 127.0));
    float swi_61 = floor((sx_60 / 16.0));
    float sbi_62 = (sx_60 - (swi_61 * 16.0));
    float ob_63_p = 1.0;
    float ob_63_j = 0.0;
    int ob_63_count = 0;
    bool ob_63_esc = false;
    for (int ok_64 = 0; ok_64 < 16; ok_64++) {
      if ((ob_63_j >= sbi_62)) { ob_63_esc = true; break; }
      float ob_63_t_65 = (ob_63_p * 2.0);
      float ob_63_t_66 = (ob_63_j + 1.0);
      ob_63_p = ob_63_t_65;
      ob_63_j = ob_63_t_66;
      ob_63_count += 1;
    }
    float cur_67 = ((((swi_61 == 0.0))) ? ob_56_w0 : ((((swi_61 == 1.0))) ? ob_56_w1 : ((((swi_61 == 2.0))) ? ob_56_w2 : ((((swi_61 == 3.0))) ? ob_56_w3 : ((((swi_61 == 4.0))) ? ob_56_w4 : ((((swi_61 == 5.0))) ? ob_56_w5 : ((((swi_61 == 6.0))) ? ob_56_w6 : ob_56_w7)))))));
    float add_68 = (((1.0 - mod(floor((cur_67 / ob_63_p)), 2.0))) * ob_63_p);
    float ob_56_t_69 = ((((swi_61 == 0.0))) ? (ob_56_w0 + add_68) : ob_56_w0);
    float ob_56_t_70 = ((((swi_61 == 1.0))) ? (ob_56_w1 + add_68) : ob_56_w1);
    float ob_56_t_71 = ((((swi_61 == 2.0))) ? (ob_56_w2 + add_68) : ob_56_w2);
    float ob_56_t_72 = ((((swi_61 == 3.0))) ? (ob_56_w3 + add_68) : ob_56_w3);
    float ob_56_t_73 = ((((swi_61 == 4.0))) ? (ob_56_w4 + add_68) : ob_56_w4);
    float ob_56_t_74 = ((((swi_61 == 5.0))) ? (ob_56_w5 + add_68) : ob_56_w5);
    float ob_56_t_75 = ((((swi_61 == 6.0))) ? (ob_56_w6 + add_68) : ob_56_w6);
    float ob_56_t_76 = ((((swi_61 == 7.0))) ? (ob_56_w7 + add_68) : ob_56_w7);
    ob_56_w0 = ob_56_t_69;
    ob_56_w1 = ob_56_t_70;
    ob_56_w2 = ob_56_t_71;
    ob_56_w3 = ob_56_t_72;
    ob_56_w4 = ob_56_t_73;
    ob_56_w5 = ob_56_t_74;
    ob_56_w6 = ob_56_t_75;
    ob_56_w7 = ob_56_t_76;
    ob_56_count += 1;
  }
  float ob_77_w0 = ob_56_w0;
  float ob_77_w1 = ob_56_w1;
  float ob_77_w2 = ob_56_w2;
  float ob_77_w3 = ob_56_w3;
  float ob_77_w4 = ob_56_w4;
  float ob_77_w5 = ob_56_w5;
  float ob_77_w6 = ob_56_w6;
  float ob_77_w7 = ob_56_w7;
  float ob_77_act = 0.0;
  float ob_77_actN = 0.0;
  float ob_77_it = 0.0;
  int ob_77_count = 0;
  bool ob_77_esc = false;
  for (int ok_78 = 0; ok_78 < 512; ok_78++) {
    if ((ob_77_it >= trow_51)) { ob_77_esc = true; break; }
    float ob_79_n0 = 0.0;
    float ob_79_n1 = 0.0;
    float ob_79_n2 = 0.0;
    float ob_79_n3 = 0.0;
    float ob_79_n4 = 0.0;
    float ob_79_n5 = 0.0;
    float ob_79_n6 = 0.0;
    float ob_79_n7 = 0.0;
    float ob_79_chg = 0.0;
    int ob_79_count = 0;
    bool ob_79_esc = false;
    for (int ok_80 = 0; ok_80 < 8; ok_80++) {
      float cw_81 = ((((ok_80 == 0))) ? ob_77_w0 : ((((ok_80 == 1))) ? ob_77_w1 : ((((ok_80 == 2))) ? ob_77_w2 : ((((ok_80 == 3))) ? ob_77_w3 : ((((ok_80 == 4))) ? ob_77_w4 : ((((ok_80 == 5))) ? ob_77_w5 : ((((ok_80 == 6))) ? ob_77_w6 : ob_77_w7)))))));
      float lw_82 = ((((ok_80 == 0))) ? ob_77_w7 : ((((ok_80 == 1))) ? ob_77_w0 : ((((ok_80 == 2))) ? ob_77_w1 : ((((ok_80 == 3))) ? ob_77_w2 : ((((ok_80 == 4))) ? ob_77_w3 : ((((ok_80 == 5))) ? ob_77_w4 : ((((ok_80 == 6))) ? ob_77_w5 : ob_77_w6)))))));
      float rw_83 = ((((ok_80 == 0))) ? ob_77_w1 : ((((ok_80 == 1))) ? ob_77_w2 : ((((ok_80 == 2))) ? ob_77_w3 : ((((ok_80 == 3))) ? ob_77_w4 : ((((ok_80 == 4))) ? ob_77_w5 : ((((ok_80 == 5))) ? ob_77_w6 : ((((ok_80 == 6))) ? ob_77_w7 : ob_77_w0)))))));
      float L_84 = mod(((cw_81 * 2.0) + floor((lw_82 / 32768.0))), 65536.0);
      float R_85 = (floor((cw_81 / 2.0)) + (mod(rw_83, 2.0) * 32768.0));
      float ob_86_l = L_84;
      float ob_86_c = cw_81;
      float ob_86_r = R_85;
      float ob_86_acc = 0.0;
      float ob_86_p2 = 1.0;
      float ob_86_chg = 0.0;
      int ob_86_count = 0;
      bool ob_86_esc = false;
      for (int ok_87 = 0; ok_87 < 16; ok_87++) {
        float lb_88 = mod(ob_86_l, 2.0);
        float cb_89 = mod(ob_86_c, 2.0);
        float rb_90 = mod(ob_86_r, 2.0);
        float pw_91 = ((((1.0 + (15.0 * lb_88))) * ((1.0 + (3.0 * cb_89)))) * ((1.0 + rb_90)));
        float nb_92 = mod(floor((rule_42 / pw_91)), 2.0);
        float ob_86_t_93 = floor((ob_86_l / 2.0));
        float ob_86_t_94 = floor((ob_86_c / 2.0));
        float ob_86_t_95 = floor((ob_86_r / 2.0));
        float ob_86_t_96 = (ob_86_acc + (nb_92 * ob_86_p2));
        float ob_86_t_97 = (ob_86_p2 * 2.0);
        float ob_86_t_98 = (ob_86_chg + (((((nb_92 == cb_89))) ? 0.0 : 1.0)));
        ob_86_l = ob_86_t_93;
        ob_86_c = ob_86_t_94;
        ob_86_r = ob_86_t_95;
        ob_86_acc = ob_86_t_96;
        ob_86_p2 = ob_86_t_97;
        ob_86_chg = ob_86_t_98;
        ob_86_count += 1;
      }
      float ob_79_t_99 = ((((ok_80 == 0))) ? ob_86_acc : ob_79_n0);
      float ob_79_t_100 = ((((ok_80 == 1))) ? ob_86_acc : ob_79_n1);
      float ob_79_t_101 = ((((ok_80 == 2))) ? ob_86_acc : ob_79_n2);
      float ob_79_t_102 = ((((ok_80 == 3))) ? ob_86_acc : ob_79_n3);
      float ob_79_t_103 = ((((ok_80 == 4))) ? ob_86_acc : ob_79_n4);
      float ob_79_t_104 = ((((ok_80 == 5))) ? ob_86_acc : ob_79_n5);
      float ob_79_t_105 = ((((ok_80 == 6))) ? ob_86_acc : ob_79_n6);
      float ob_79_t_106 = ((((ok_80 == 7))) ? ob_86_acc : ob_79_n7);
      float ob_79_t_107 = (ob_79_chg + ob_86_chg);
      ob_79_n0 = ob_79_t_99;
      ob_79_n1 = ob_79_t_100;
      ob_79_n2 = ob_79_t_101;
      ob_79_n3 = ob_79_t_102;
      ob_79_n4 = ob_79_t_103;
      ob_79_n5 = ob_79_t_104;
      ob_79_n6 = ob_79_t_105;
      ob_79_n7 = ob_79_t_106;
      ob_79_chg = ob_79_t_107;
      ob_79_count += 1;
    }
    float ob_77_t_108 = ob_79_n0;
    float ob_77_t_109 = ob_79_n1;
    float ob_77_t_110 = ob_79_n2;
    float ob_77_t_111 = ob_79_n3;
    float ob_77_t_112 = ob_79_n4;
    float ob_77_t_113 = ob_79_n5;
    float ob_77_t_114 = ob_79_n6;
    float ob_77_t_115 = ob_79_n7;
    float ob_77_t_116 = (ob_77_act + (((((ok_78 < 32))) ? ob_79_chg : 0.0)));
    float ob_77_t_117 = (ob_77_actN + (((((ok_78 < 32))) ? 1.0 : 0.0)));
    float ob_77_t_118 = (ob_77_it + 1.0);
    ob_77_w0 = ob_77_t_108;
    ob_77_w1 = ob_77_t_109;
    ob_77_w2 = ob_77_t_110;
    ob_77_w3 = ob_77_t_111;
    ob_77_w4 = ob_77_t_112;
    ob_77_w5 = ob_77_t_113;
    ob_77_w6 = ob_77_t_114;
    ob_77_w7 = ob_77_t_115;
    ob_77_act = ob_77_t_116;
    ob_77_actN = ob_77_t_117;
    ob_77_it = ob_77_t_118;
    ob_77_count += 1;
  }
  float xwi_119 = floor((xcell_54 / 16.0));
  float xbi_120 = (xcell_54 - (xwi_119 * 16.0));
  float wsel_121 = ((((xwi_119 == 0.0))) ? ob_77_w0 : ((((xwi_119 == 1.0))) ? ob_77_w1 : ((((xwi_119 == 2.0))) ? ob_77_w2 : ((((xwi_119 == 3.0))) ? ob_77_w3 : ((((xwi_119 == 4.0))) ? ob_77_w4 : ((((xwi_119 == 5.0))) ? ob_77_w5 : ((((xwi_119 == 6.0))) ? ob_77_w6 : ob_77_w7)))))));
  float ob_122_v = wsel_121;
  float ob_122_j = 0.0;
  int ob_122_count = 0;
  bool ob_122_esc = false;
  for (int ok_123 = 0; ok_123 < 16; ok_123++) {
    if ((ob_122_j >= xbi_120)) { ob_122_esc = true; break; }
    float ob_122_t_124 = floor((ob_122_v / 2.0));
    float ob_122_t_125 = (ob_122_j + 1.0);
    ob_122_v = ob_122_t_124;
    ob_122_j = ob_122_t_125;
    ob_122_count += 1;
  }
  if ((mod(ob_122_v, 2.0) < 0.5)) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  pt = hashu(pt);
  float draw_126 = u2f(pt);
  float fox_127 = draw_126;
  pt = hashu(pt);
  float draw_128 = u2f(pt);
  float foy_129 = draw_128;
  float cellx_130 = (tlox_43 + (xcell_54 * 512.0));
  float celly_131 = (tloy_44 + (trow_51 * rowPitch_5));
  float seatx_132 = ((((cellx_130 - wcx_8) + ((fox_127 * 0.94) * 512.0))) * km_15);
  float seaty_133 = ((((celly_131 - wcy_9) + ((foy_129 * 0.94) * rowPitch_5))) * km_15);
  float a_134 = ((((ob_77_actN > 0.0))) ? (ob_77_act / ((ob_77_actN * 128.0))) : 0.0);
  float heat_135 = clamp((a_134 * 2.6), 0.0, 1.0);
  vec3 base_136 = pal((0.62 - ((0.50 * heat_135) * P[4])), vec3(0.46, 0.44, 0.50), vec3(0.44, 0.42, 0.48), vec3(0.9, 0.85, 1.0), vec3(0.10, 0.30, 0.55));
  vec3 col_137 = stain_rulespace_pos(((base_136 * (0.45 + (1.3 * P[6]))) * (0.45 + (P[5] * ((0.25 + (1.5 * heat_135)))))), (((P[7] - 0.5)) * 2.2));
  pt = hashu(pt);
  float draw_138 = u2f(pt) - 0.5;
  float z_139 = (draw_138 * 0.02);
  float dep_c_140 = seatx_132;
  float dep_c_141 = (-seaty_133);
  float dep_c_142 = z_139;
  vec3 dep_col_143 = col_137;
  col = dep_col_143;
  return vec3(dep_c_140, dep_c_141, dep_c_142);
}
