vec3 shape_billiards_pos(vec2 q, vec4 rnd, uint seed, float P[8], out vec3 col){
  uint pt = hashu(seed ^ hashu(floatBitsToUint(q.x))
                       ^ hashu(floatBitsToUint(q.y) * 4293378565u));
  pt = hashu(pt ^ floatBitsToUint(rnd.x));
  int li_bounce = int(P[1] + 0.5);
  float tb_1 = floor((P[0] + 0.5));
  float nb_2 = floor((P[1] + 0.5));
  float ecc_3 = P[2];
  float o0x_4 = 0.0;
  float o0y_5 = 0.0;
  float nmx_6 = 0.0;
  float nmy_7 = 0.0;
  if ((tb_1 == 0.0)) {
    float a_8 = (q.x * TAU);
    float cx_9 = cos(a_8);
    float cy_10 = sin(a_8);
    nmx_6 = (-cx_9);
    nmy_7 = (-cy_10);
    o0x_4 = (1.15 * cx_9);
    o0y_5 = (1.15 * cy_10);
  } else {
    if ((tb_1 == 1.0)) {
      float ea_11 = 1.25;
      float eb_12 = mix(1.18, 0.45, ecc_3);
      float ph_13 = (q.x * TAU);
      float hx_14 = (ea_11 * cos(ph_13));
      float hy_15 = (eb_12 * sin(ph_13));
      float gx_16 = ((hx_14 / ((ea_11 * ea_11))) + 1.0e-9);
      float gy_17 = ((hy_15 / ((eb_12 * eb_12))) + 1.0e-9);
      float glen_18 = length(vec2(gx_16, gy_17));
      nmx_6 = ((-gx_16) / glen_18);
      nmy_7 = ((-gy_17) / glen_18);
      o0x_4 = hx_14;
      o0y_5 = hy_15;
    } else {
      if ((tb_1 == 2.0)) {
        float sr_19 = 0.62;
        float sL_20 = mix(0.06, 0.88, ecc_3);
        float per_21 = ((4.0 * sL_20) + (TAU * sr_19));
        float arc_22 = (q.x * per_21);
        if ((arc_22 < (2.0 * sL_20))) {
          nmx_6 = 0.0;
          nmy_7 = (-1.0);
          o0x_4 = (arc_22 - sL_20);
          o0y_5 = sr_19;
        } else {
          arc_22 -= (2.0 * sL_20);
          if ((arc_22 < (2.0 * sL_20))) {
            nmx_6 = 0.0;
            nmy_7 = 1.0;
            o0x_4 = (sL_20 - arc_22);
            o0y_5 = (-sr_19);
          } else {
            arc_22 -= (2.0 * sL_20);
            if ((arc_22 < (PI * sr_19))) {
              float a_23 = ((0.5 * PI) - (arc_22 / sr_19));
              float rx_24 = cos(a_23);
              float ry_25 = sin(a_23);
              nmx_6 = (-rx_24);
              nmy_7 = (-ry_25);
              o0x_4 = (sL_20 + (sr_19 * rx_24));
              o0y_5 = (0.0 + (sr_19 * ry_25));
            } else {
              arc_22 -= (PI * sr_19);
              float a_26 = ((0.5 * PI) + (arc_22 / sr_19));
              float rx_27 = cos(a_26);
              float ry_28 = sin(a_26);
              nmx_6 = (-rx_27);
              nmy_7 = (-ry_28);
              o0x_4 = ((-sL_20) + (sr_19 * rx_27));
              o0y_5 = (0.0 + (sr_19 * ry_28));
            }
          }
        }
      } else {
        float sd_29 = 1.12;
        float arc_30 = ((q.x * 8.0) * sd_29);
        if ((arc_30 < (2.0 * sd_29))) {
          nmx_6 = 0.0;
          nmy_7 = (-1.0);
          o0x_4 = (arc_30 - sd_29);
          o0y_5 = sd_29;
        } else {
          arc_30 -= (2.0 * sd_29);
          if ((arc_30 < (2.0 * sd_29))) {
            nmx_6 = (-1.0);
            nmy_7 = 0.0;
            o0x_4 = sd_29;
            o0y_5 = (sd_29 - arc_30);
          } else {
            arc_30 -= (2.0 * sd_29);
            if ((arc_30 < (2.0 * sd_29))) {
              nmx_6 = 0.0;
              nmy_7 = 1.0;
              o0x_4 = (sd_29 - arc_30);
              o0y_5 = (-sd_29);
            } else {
              arc_30 -= (2.0 * sd_29);
              nmx_6 = 1.0;
              nmy_7 = 0.0;
              o0x_4 = (-sd_29);
              o0y_5 = (arc_30 - sd_29);
            }
          }
        }
      }
    }
  }
  float psi0_31 = (mix(0.045, 0.5, P[3]) * PI);
  pt = hashu(pt);
  float draw_32 = u2f(pt) - 0.5;
  float scat_33 = draw_32;
  float psi_34 = clamp((psi0_31 + ((scat_33 * P[4]) * PI)), 0.035, (PI - 0.035));
  pt = hashu(pt);
  float draw_35 = u2f(pt);
  float coin_36 = draw_35;
  float sgn_37 = ((((coin_36 < 0.5))) ? (-1.0) : 1.0);
  float tvx_38 = (-nmy_7);
  float tvy_39 = nmx_6;
  float cps_40 = cos(psi_34);
  float sps_41 = sin(psi_34);
  float d0x_42 = (((sgn_37 * cps_40) * tvx_38) + (sps_41 * nmx_6));
  float d0y_43 = (((sgn_37 * cps_40) * tvy_39) + (sps_41 * nmy_7));
  float hval_44 = 0.0;
  if ((tb_1 == 0.0)) {
    hval_44 = abs(cps_40);
  } else {
    if ((tb_1 == 1.0)) {
      float ea_45 = 1.25;
      float eb_46 = mix(1.18, 0.45, ecc_3);
      float cf_47 = sqrt(max(((ea_45 * ea_45) - (eb_46 * eb_46)), 0.0));
      float r1x_48 = (o0x_4 - cf_47);
      float r1y_49 = o0y_5;
      float r2x_50 = (o0x_4 + cf_47);
      float r2y_51 = o0y_5;
      float L1_52 = ((r1x_48 * d0y_43) - (r1y_49 * d0x_42));
      float L2_53 = ((r2x_50 * d0y_43) - (r2y_51 * d0x_42));
      hval_44 = (0.5 + (0.5 * tanh(((2.0 * L1_52) * L2_53))));
    } else {
      hval_44 = (psi_34 / PI);
    }
  }
  pt = hashu(pt);
  int pick_54 = min(int(u2f(pt) * float(li_bounce)), li_bounce - 1);
  int kk_55 = pick_54;
  float ob_56_rox = (o0x_4 + (nmx_6 * 1.0e-5));
  float ob_56_roy = (o0y_5 + (nmy_7 * 1.0e-5));
  float ob_56_dx = d0x_42;
  float ob_56_dy = d0y_43;
  float ob_56_acc = 0.0;
  float ob_56_ptx = o0x_4;
  float ob_56_pty = o0y_5;
  float ob_56_tlen = 0.0;
  float ob_56_stop = 0.0;
  int ob_56_count = 0;
  bool ob_56_esc = false;
  for (int ok_57 = 0; ok_57 < 40; ok_57++) {
    if (ok_57 >= li_bounce) break;
    if ((ob_56_stop > 0.5)) { ob_56_esc = true; break; }
    float hitT_58 = (-1.0);
    float nx_59 = 0.0;
    float ny_60 = 1.0;
    if ((tb_1 == 0.0)) {
      float R_61 = 1.15;
      float b_62 = ((ob_56_rox * ob_56_dx) + (ob_56_roy * ob_56_dy));
      float disc_63 = max(0.0, (((b_62 * b_62) - (((ob_56_rox * ob_56_rox) + (ob_56_roy * ob_56_roy)))) + (R_61 * R_61)));
      hitT_58 = ((-b_62) + sqrt(disc_63));
      float hx_64 = (ob_56_rox + (ob_56_dx * hitT_58));
      float hy_65 = (ob_56_roy + (ob_56_dy * hitT_58));
      nx_59 = ((-hx_64) / R_61);
      ny_60 = ((-hy_65) / R_61);
    } else {
      if ((tb_1 == 1.0)) {
        float ea_66 = 1.25;
        float eb_67 = mix(1.18, 0.45, ecc_3);
        float osx_68 = (ob_56_rox / ea_66);
        float osy_69 = (ob_56_roy / eb_67);
        float dsx_70 = (ob_56_dx / ea_66);
        float dsy_71 = (ob_56_dy / eb_67);
        float A_72 = (((dsx_70 * dsx_70) + (dsy_71 * dsy_71)) + 1.0e-12);
        float B_73 = ((osx_68 * dsx_70) + (osy_69 * dsy_71));
        float C_74 = (((osx_68 * osx_68) + (osy_69 * osy_69)) - 1.0);
        float disc_75 = max(0.0, ((B_73 * B_73) - (A_72 * C_74)));
        hitT_58 = ((((-B_73) + sqrt(disc_75))) / A_72);
        float hx_76 = (ob_56_rox + (ob_56_dx * hitT_58));
        float hy_77 = (ob_56_roy + (ob_56_dy * hitT_58));
        float gx_78 = ((hx_76 / ((ea_66 * ea_66))) + 1.0e-9);
        float gy_79 = ((hy_77 / ((eb_67 * eb_67))) + 1.0e-9);
        float glen_80 = length(vec2(gx_78, gy_79));
        nx_59 = ((-gx_78) / glen_80);
        ny_60 = ((-gy_79) / glen_80);
      } else {
        if ((tb_1 == 2.0)) {
          float sr_81 = 0.62;
          float sL_82 = mix(0.06, 0.88, ecc_3);
          float best_83 = 1.0e9;
          if ((ob_56_dy > 1.0e-7)) {
            float tTop_84 = (((sr_81 - ob_56_roy)) / ob_56_dy);
            if ((((tTop_84 > 0.0) && (tTop_84 < best_83)) && (abs((ob_56_rox + (ob_56_dx * tTop_84))) <= (sL_82 + 1.0e-6)))) {
              best_83 = tTop_84;
              nx_59 = 0.0;
              ny_60 = (-1.0);
            }
          }
          if ((ob_56_dy < (-1.0e-7))) {
            float tBot_85 = ((((-sr_81) - ob_56_roy)) / ob_56_dy);
            if ((((tBot_85 > 0.0) && (tBot_85 < best_83)) && (abs((ob_56_rox + (ob_56_dx * tBot_85))) <= (sL_82 + 1.0e-6)))) {
              best_83 = tBot_85;
              nx_59 = 0.0;
              ny_60 = 1.0;
            }
          }
          float ocRx_86 = (ob_56_rox - sL_82);
          float ocRy_87 = ob_56_roy;
          float BR_88 = ((ocRx_86 * ob_56_dx) + (ocRy_87 * ob_56_dy));
          float CR_89 = (((ocRx_86 * ocRx_86) + (ocRy_87 * ocRy_87)) - (sr_81 * sr_81));
          float discR_90 = ((BR_88 * BR_88) - CR_89);
          if ((discR_90 > 0.0)) {
            float sqR_91 = sqrt(discR_90);
            float tR1_92 = ((-BR_88) - sqR_91);
            float tR2_93 = ((-BR_88) + sqR_91);
            float hR1_94 = (ob_56_rox + (ob_56_dx * tR1_92));
            float hR2_95 = (ob_56_rox + (ob_56_dx * tR2_93));
            bool vR1_96 = ((tR1_92 > 0.0) && (hR1_94 >= (sL_82 - 1.0e-6)));
            bool vR2_97 = ((tR2_93 > 0.0) && (hR2_95 >= (sL_82 - 1.0e-6)));
            float tR_98 = ((vR1_96) ? tR1_92 : (((vR2_97) ? tR2_93 : (-1.0))));
            if (((tR_98 > 0.0) && (tR_98 < best_83))) {
              best_83 = tR_98;
              float hx_99 = (ob_56_rox + (ob_56_dx * tR_98));
              float hy_100 = (ob_56_roy + (ob_56_dy * tR_98));
              nx_59 = (((sL_82 - hx_99)) / sr_81);
              ny_60 = (((0.0 - hy_100)) / sr_81);
            }
          }
          float ocLx_101 = (ob_56_rox + sL_82);
          float ocLy_102 = ob_56_roy;
          float BL_103 = ((ocLx_101 * ob_56_dx) + (ocLy_102 * ob_56_dy));
          float CL_104 = (((ocLx_101 * ocLx_101) + (ocLy_102 * ocLy_102)) - (sr_81 * sr_81));
          float discL_105 = ((BL_103 * BL_103) - CL_104);
          if ((discL_105 > 0.0)) {
            float sqL_106 = sqrt(discL_105);
            float tL1_107 = ((-BL_103) - sqL_106);
            float tL2_108 = ((-BL_103) + sqL_106);
            float hL1_109 = (ob_56_rox + (ob_56_dx * tL1_107));
            float hL2_110 = (ob_56_rox + (ob_56_dx * tL2_108));
            bool vL1_111 = ((tL1_107 > 0.0) && (hL1_109 <= ((-sL_82) + 1.0e-6)));
            bool vL2_112 = ((tL2_108 > 0.0) && (hL2_110 <= ((-sL_82) + 1.0e-6)));
            float tL_113 = ((vL1_111) ? tL1_107 : (((vL2_112) ? tL2_108 : (-1.0))));
            if (((tL_113 > 0.0) && (tL_113 < best_83))) {
              best_83 = tL_113;
              float hx_114 = (ob_56_rox + (ob_56_dx * tL_113));
              float hy_115 = (ob_56_roy + (ob_56_dy * tL_113));
              nx_59 = ((((-sL_82) - hx_114)) / sr_81);
              ny_60 = (((0.0 - hy_115)) / sr_81);
            }
          }
          hitT_58 = (((best_83 < 1.0e8)) ? best_83 : (-1.0));
        } else {
          float sd_116 = 1.12;
          float rho_117 = mix(0.15, 0.95, ecc_3);
          float best_118 = 1.0e9;
          if ((ob_56_dx > 1.0e-7)) {
            float tW_119 = (((sd_116 - ob_56_rox)) / ob_56_dx);
            if (((tW_119 > 0.0) && (tW_119 < best_118))) {
              best_118 = tW_119;
              nx_59 = (-1.0);
              ny_60 = 0.0;
            }
          }
          if ((ob_56_dx < (-1.0e-7))) {
            float tW_120 = ((((-sd_116) - ob_56_rox)) / ob_56_dx);
            if (((tW_120 > 0.0) && (tW_120 < best_118))) {
              best_118 = tW_120;
              nx_59 = 1.0;
              ny_60 = 0.0;
            }
          }
          if ((ob_56_dy > 1.0e-7)) {
            float tW_121 = (((sd_116 - ob_56_roy)) / ob_56_dy);
            if (((tW_121 > 0.0) && (tW_121 < best_118))) {
              best_118 = tW_121;
              nx_59 = 0.0;
              ny_60 = (-1.0);
            }
          }
          if ((ob_56_dy < (-1.0e-7))) {
            float tW_122 = ((((-sd_116) - ob_56_roy)) / ob_56_dy);
            if (((tW_122 > 0.0) && (tW_122 < best_118))) {
              best_118 = tW_122;
              nx_59 = 0.0;
              ny_60 = 1.0;
            }
          }
          float BD_123 = ((ob_56_rox * ob_56_dx) + (ob_56_roy * ob_56_dy));
          float CD_124 = (((ob_56_rox * ob_56_rox) + (ob_56_roy * ob_56_roy)) - (rho_117 * rho_117));
          float discD_125 = ((BD_123 * BD_123) - CD_124);
          if ((discD_125 > 0.0)) {
            float tD_126 = ((-BD_123) - sqrt(discD_125));
            if (((tD_126 > 1.0e-4) && (tD_126 < best_118))) {
              best_118 = tD_126;
              nx_59 = (((ob_56_rox + (ob_56_dx * tD_126))) / rho_117);
              ny_60 = (((ob_56_roy + (ob_56_dy * tD_126))) / rho_117);
            }
          }
          hitT_58 = (((best_118 < 1.0e8)) ? best_118 : (-1.0));
        }
      }
    }
    float nstop_127 = ob_56_stop;
    float nrox_128 = ob_56_rox;
    float nroy_129 = ob_56_roy;
    float ndx_130 = ob_56_dx;
    float ndy_131 = ob_56_dy;
    float nacc_132 = ob_56_acc;
    float nptx_133 = ob_56_ptx;
    float npty_134 = ob_56_pty;
    float ntlen_135 = ob_56_tlen;
    if (((hitT_58 <= 0.0) || (hitT_58 > 4.0))) {
      nstop_127 = 2.0;
    } else {
      if ((ok_57 == kk_55)) {
        ntlen_135 = hitT_58;
        nacc_132 = (ob_56_acc + (hitT_58 * q.y));
        nptx_133 = (ob_56_rox + (ob_56_dx * ((hitT_58 * q.y))));
        npty_134 = (ob_56_roy + (ob_56_dy * ((hitT_58 * q.y))));
        nstop_127 = 1.0;
      } else {
        float ax_136 = (ob_56_rox + (ob_56_dx * hitT_58));
        float ay_137 = (ob_56_roy + (ob_56_dy * hitT_58));
        nacc_132 = (ob_56_acc + hitT_58);
        float dn_138 = ((ob_56_dx * nx_59) + (ob_56_dy * ny_60));
        float rx_139 = ((ob_56_dx - ((2.0 * dn_138) * nx_59)) + 1.0e-9);
        float ry_140 = (ob_56_dy - ((2.0 * dn_138) * ny_60));
        float rl_141 = length(vec2(rx_139, ry_140));
        ndx_130 = (rx_139 / rl_141);
        ndy_131 = (ry_140 / rl_141);
        nrox_128 = (ax_136 + (nx_59 * 1.0e-5));
        nroy_129 = (ay_137 + (ny_60 * 1.0e-5));
      }
    }
    float ob_56_t_142 = nrox_128;
    float ob_56_t_143 = nroy_129;
    float ob_56_t_144 = ndx_130;
    float ob_56_t_145 = ndy_131;
    float ob_56_t_146 = nacc_132;
    float ob_56_t_147 = nptx_133;
    float ob_56_t_148 = npty_134;
    float ob_56_t_149 = ntlen_135;
    float ob_56_t_150 = nstop_127;
    ob_56_rox = ob_56_t_142;
    ob_56_roy = ob_56_t_143;
    ob_56_dx = ob_56_t_144;
    ob_56_dy = ob_56_t_145;
    ob_56_acc = ob_56_t_146;
    ob_56_ptx = ob_56_t_147;
    ob_56_pty = ob_56_t_148;
    ob_56_tlen = ob_56_t_149;
    ob_56_stop = ob_56_t_150;
    ob_56_count += 1;
  }
  if ((((ob_56_stop != 1.0) || (abs(ob_56_ptx) > 1.6)) || (abs(ob_56_pty) > 1.6))) {
    col = vec3(0.0);
    return vec3(0.0, -20000.0, 0.0);
  }
  float yy_151 = (((float(kk_55) - (0.5 * ((nb_2 - 1.0))))) * P[5]);
  vec3 base_152 = pal(((hval_44 * 0.75) + 0.06), vec3(0.46, 0.52, 0.50), vec3(0.38, 0.38, 0.36), vec3(0.90, 0.85, 0.70), vec3(0.12, 0.36, 0.55));
  float wgt_153 = clamp((ob_56_tlen * 0.75), 0.05, 2.0);
  float pulse_154 = (1.0 + (0.22 * cos(((2.6 * ob_56_acc) - (1.3 * uT)))));
  float dep_c_155 = ob_56_ptx;
  float dep_c_156 = yy_151;
  float dep_c_157 = ob_56_pty;
  vec3 dep_col_158 = (((base_152 * wgt_153) * pulse_154) * (0.35 + (0.85 * P[6])));
  col = dep_col_158;
  return vec3(dep_c_155, dep_c_156, dep_c_157);
}
