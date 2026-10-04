#!/usr/bin/env python3
"""Install only FuneCob's local receipt OCR, preserving live settlement rules."""
import base64
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
import zlib
import argparse
import uuid
from datetime import datetime
from pathlib import Path

PAYLOAD = 'c-qx{iC^1Dvhcss!_GWO6Is|C8REprkARcmO#(bHJDUfrSGHtOVoM%L<{04p?Oz?;QtPmBNOr&7><+eDeN<Q1)m7E4yOqR`ul(4V-mbL8N-&v5aViFG;y>Rw3+2yYa+Q6*oVdgMhnrlEgF*H?h_bJrlPJu7L`n8FnGL3KH1w0aDD@}PQ84!Ng3H)<y&$~EOM(eJ9>vi_T&C&NVW5S4`WC?bwbwg5^8c9mN&2fBdSgGfMNjpE509yd>}2Yu2)OFt5Pr%hhkGAX>E6V>@NND$m?pA9><|55nyN}uH%|P%EIflLQ+4O#_TTz@AGhCk`-gjf>wY*E9kJHzH=Fd|S=c-Ht-B9pQR4XFRS-v^bK$3^aj<jL|8TIg{h?1a3|kn6brycu-hV%@Hax;=0L(K#yujKx_S=KqPtc;ZnU4wm{su)Ea-Fx)EcATu*q^x5%P98EmW2~IgTj%BXQAoF7l|!As6Gxt-)f(Q0{-DzM6(pSngpS_l~)iAdge@`FiN8^7@C&FO@dL@>QzTHWk>igc7wzhJ$~4Y<0z(S3IAs3d;UyBL>-Zs`tc-411~aUm$9GB#t1}CP)-i>(4D5U*zZH9(^=Z-#WPq)2|`DHLaj@G_=O&3okFWn_U$C82h|+UA4Z;U8nblN*aB4h2xZbSVt+bzhrXd9Ed?n2*d3-O5?GEITTGKl=Q$Jv7eShI-nru>!zV%v^EfrK)-Xtt#?*%eOUrQJA~(kH7grp=H=s{dGnrWD8LD{@4aqdZGaRBZ#BOLHFG%~tOE>OcUk0f^4wAIfY^|+tY(D>G>xFS%M2JMJc!ppmSH`(U7WwqAqu5JKc&?@<o1eyF6vYDgHAGqB>;}X12%7t`8AQ%;8Ur=%9Z*B;cO1Y{`*FuOJ4+1<XB0ENkNqou3?-e8Fg6VVY_6W9{!Plv0;?7WQxnmlz+!y#qah5(EbRrruxS+E+9Gr(ercf;^i&yEMhO7NznQ|A+=&B368!0#^4E3XrI+Gov2JrS=h6=@E>kSAU{dQ%TdZwvN;1QRg?=+A#Htt>cL>Qt;|>6LaHhb?8W2w6UinN9CF++bUr2ZGUq*RE>_uuf4CiwMoP2%CXgsIIy2i!gVKSWNC>;ei{bUAAnGE4cs_+^|*GU1pW!Z7Ig8##{7g}>M^uyG>iV_&p^QS)i3DfcIOA-1g<-Oo4@O)TqAml-i#x7ti2vh$8o(*nAtJ!q8UxhIe%(2fuad_mfy9fSFlo;{!09=htzWBE&A7|6CZ^EO~FN}#VSk*M9FvEU0LzXiJ<7oIr{QwQ1zT#N)U7<Jw05nz#h;sp*CX8c?({sylr#M#}OIBxbg~H%G2NwDppf)2B3!wN=0E?aaCii^hjzQ~ztktH13klsAV*c7n-c>DzvpDv{Az~nenn2f7HL$sMaZqMT-x<xu<B6LNFU{CEIy?IjaFC5;V}(5={{5&h5;V;Q3lagkf@%;uXAho<mUtz`erW3CqyAmQ(QFEk;<Hn|P5Zo9F?O#J4fC-;Jz2#@e-YaNRXlOWK)=HPKMBXei+qMR215ggTwM6k#0TCOLdnz(VyD;<%#>>v5OsFuJv+6XbNIYldjOOHkQU7zr^^7Lnp`hUnrO)%Da8vMfD^(J<J?+2BO-}tT5JggOErv1kU>-Trab5~Aqz<SE!Eo~N>i|+3f)OavffyBF4f&IrfIR1#2==Kz}Yxmn?bkbn3m-XqYwlN=!*|VO<&XC#vh}oz<!)@<a%aJEs(Oo6{>|(H@r2u&FPITZqI>WTkB1N`If|s8(#P(b;dKYctSU&hlD)qygF0@>L$^oLE%~I#<(iTI@PB%45*^;OObgc@Sw)Y1Ua{AXiQQrwnd`kfq+qQq&d}ffNtumfL3R2sPwA@z=FPS2@AK2P|H)+P)q&W;)Z0ES|)9s&KFDt@vfwE){#xjbDMxfL)wKeC~++7ag@}r5rDOhe2!dCBNEqd%|QbU*_Sp2^G<TQehwCQa=OOi43#HCJ_n-f%V-Qb8g(tAld7J!8*3n``FmrnJqIZu{sIr$nC^I782EKZI9p)kXwYS_(0B{5!`uXvfSo$)o5gMb75YH%)A?o2Ks2Le2ck}2G1MCUlzX%0@&(~y0j<)s`-A8P@kKvQo9FO<TYwG7zZ<Rd(-suy^gF*p0!Vd8KU9ZEkHz(8;N>D`<7DKr+$8f^;7*YY)y#k<kV(#F^Rx;U-^ic`jXO45P`~BY=+<M?{AJ!~84}8)(S!QYetB%Pt?xP7qPaz&h=R}^_X#&JDwqViIUtRI`5ge=nWavUpo>L76Ap=-<T^+%&3p;jy2yV!K|<3uA7dKHHz=Wad1&vo#-<t-<XvfnScwsAwHJ@Dq@8-&Rz@C~2_r)s{V4A82|d_%Jo1B)kH^Ne664sd+Q*dkKWAs59G;tK`y6OQ+bYjZUF0|1E4q_t7N-3u9N!i<@|ho`Q}KfU&}-{l3)d!dc{x4wZs3k)SCN@HjeXc&b&Sz0^oP-)0i@Z0O|P4XbTZZOnQtFE<iIlFv9_Q|G>eCRX`5+CN0m{o=Um6I=k5<~VJk_qEgI}tqSMyE_~~%>9e`C@-yj@CNZzy1JT<1?2!Bf-1&?DDJqLxh#eG|5m4RiKFv}#q8xzm`{SXV=XJ^SX6Zyw7Y#N&O93QP(E1dhm{S^FYp+Z4xlS)BI&b7GNLG@R(|D}5hCJs{oD=NjksSka*pva*k;KZbCS7w+1dvr>B#6~i7K|ZF47h`R$*`z|;@E7pJKMHGyuo?>xh<kt1?0`n!%iB5^<7mJe*v8M~TF@mw*hOX2OLcV0u$&k7m1T<*Ih8lZfPZpr6iiO)tV}1w1nen|fIZo@fh3N<{5tgttH{qXSBv~9_4jL0?|7XffU3(%%_q|FDA)&u%gd%?-F~6QKNO7mATYvY8YRBT0BXCAqxWyi{ft~(BDpbJchF4)Bmt|fxs`0O+0@Ev4F*7u?CLe_g6G3p@?C{#$$!P2ShmO?Wu7egtZX)1#O|$*1$UN4FlE3)qPo!cU8UBU%cJNG<NY@P={4>oap_($eQb7)Wum*V%F%UF<0Rv{Wj9%?g;><2JF$j%UWQoetg;IXL0RMht9Fv;x=DMUIrj>&1yj>g)Y_^vIW<(}esbxqZ9WG*+EGCohl^Oa!=m1R-u9D%4N!1@vl1MR-6Rn*qGHwuT5|n2665HiKLJF$xC8UYBU}88j$@twr`V(Ti`XaU9yEZx`WHV;>@2i`)3Z@ja~w(_HGz6}5Fj-Wdf#v55a^%BUA}j#j|1icl%xHMu_(uzO{R&7m27yFV06GuhCv{8xWm<TbYSP8b3zZW3LG5*OJkMV8kg+OHg*`)M(=j&qhN;>9tT4=4We)r!7!F;{lO0}(o3lj(E5^dDexXO&s!%I(67nDAjO__prg=>`tQ3v!l8~gYRl+FQ3O0eCG4~YTWuA_8v}IA9vjUKTihAZ7o$C=-a~oN!-M1MsD)vEz~*507$r$22~>kn4o@)|fWX*~a4R<pJsP%T0&vt#ngAHc1i>@`CiDA}7pP;2P7W+=&(ce<vj3zN<Ol=&c?*UJ(5?Yy9rbA~0cWcK=Sk?wp8Z--F<9rgLvk~k<Zceai=w$Xf3VHwdSNgOs71rs)b*m50tw8AF|OPRek%-~#<!);saN1XFhvmq=*E`eGqcq!$+R(1tzg5dipmOc8_kL~kh5>H?-zRmvrNS^>#VaXqFcqeZ^wYctEi~g3zKHAq<5<X1v>r`hCe0_!X1Xm;FRIbWeoPf^CXqmXVIksxHWSOk{|?&Ivi%qN$hSdWrMzD!5D<(jfiT7kbUY#yMdy=ZPbmB&m(IGatkJ7!wgy$7|6vo*b`2gz;Fi7H)N1Bn+d@M=ARy2Eg^vV0A@t_MoI}ymn=rU6dKgxUb%k;5ttICRkmtqITLJlX>*q^Aa3*esTAO}nya6u{snUWAd1FjUQ;s`fRqbXH2?yd%+w>>wjQfi4{oNw;hxo=3+iS`!s*fRa%}ve27(-4wm3MJUx?8E`}kmgm)4C+7r?NwwpPnjivAGwz$q62#%F7Q=+Xzsk44jL7KQ*(cj*G12%Im-KeyQN2;Cmzva}+p8T(@&=u(9%f!g|gjIH+jq?Y>qi5rCdzS1qaZm1+C9N#8@<L*sR&CL+*EFl3Zp^_;now}?O(=?h6{SQcLtGU$#Qc}i~-rDh8e-ed#&e1^A71^gygFgDO=R)fV=eS~v6=^sXlX&7hp=K5a#Fs$mGK&Ry69u{2b*ta%v5b4kr@Q=9i~mMr&!nJODb%k*ZA01?4sk1}4en%Sy=m;f+cj(stbxeA#>rS}G4v*&q6a|;=ro6x=9wwl#$-WDNd6-BE?^vAxE^jgP|jYgf~C&sN36%d*yPwUtf5F@hZ6&-x|8V`_IvIvDn_{xNStC6`4qn>KN8JRg=N{ngi@30nlu@`wiKZW2jWUW);Yml6==;oA0Uk)=V!2>gM<|M{lJC&sfYv^n)lEw^a6w)en(<B4yZ~ry8<4K0~hd33rG7AjLfR|YPOe<dQjVH(BsoKLVYeP<$E*S24RO}dMi3$8@|J`QimOltr+YMfXTUQ+8fOW*jwMjfB0*?`2dx%Td-2@G0h1-!SWc6X8^r*Py6bTk6ysQEw^y9nlAc+atN&oSn3;YFBU+Ez9o<T76v|rlC!hpa~Qw1)qHq!b~b<sz~9<Y$#9eAL1`$^Dxv3k_d~P*#_%PC6*J$oM^PZGH}FMGEt{EjFEb<jdw(LN9w8$xsvZ0<;z)+6{Ttkb1bLo?BX%Phj7$A^3cQPA)<_CT8DKXAxaCjKFQf7;0IERogyazPIQiK=5`X}bp3tPpT+I_16pia7RonsS2s#2x|I9fByho>Wf|9@|Cps}ECNLp_K{0rkJ*4%3A0}WF1MV$*{eiwZ_-p;adUj6^#5^ExnQwl8Z&q>KdJ{$tUt_E2Xvk%_?lPMoD&}{<AqI2|ITZV*<h&ZE7+7f75m%q%?8^G$FOJMyGYv=POl1XV?m=nIP@DnLQL4b?uIgdpy01lZ4m?V<x}H)ZiekHpQqNYvZi(Wv6)|=P7?q#6w*ts15(6KFHkg=b(_%(pmj995P6pA~DX4WhRJ-V|oN#iJPAuk|U}F9K3I`?nNS?vR6r^n?ct8r>d#)&m1Iv1Y)O89C8t3#CTIqBLth_wsVFRT1vL|CHdRT%MzLgI2bt}<<rHceq3$TkyO;U1%VA<5Nq();Ij3FajB_$`-@0@#7_(`=#6RyRchdio|J`|c)UbI-PDt%UwK6;)G2G`Ib48~BB24Qp$s~1KSOao#G4b%ZTD!z~XiBHPdy8mN_q8X@WcJG1Wr5*}e*NNF0Fkm0XA+tc{Iw3@*H3Qw?(Jo4cKV}1reVqRN?Ckn%)@%-&4g465&Y#ix*;2AnkLOy}UWrU7oTs|BFowUGVP2QOK$Z8y>F9nKPCwrhXMnW<8$30kypOsqWwt0;wbGUwRLK`E^4I)QfCm(6mzbjYaJt?2U$^mRv+?5muGM;ARjU~se-Xc90&6k_!iA+yWU8RjdE;A_AY&k=0JUc@3NUjVv>H6PMFFA|oufKr&m^aG3Cxj&hoBbGWMBx<BRNEC3;y#8ZcBl&7TlRQ+0^<<bi()3<~eQ7VZtREPH!l~A}_d((L3z*1FxiEpF-L-X=pGU&@fm|9?$>@HFxMnP=pZ=7HjP{MT@aao)KU()ODLqu!d0%5n;MdsMBbhveDq%hE3#eowt`spvx%&fF#<-zUydEqp>Q8&orh&c`td0`dWf#*4OHzR3%{Nkg;Lskjx8`YZO2tH*c_TrV?7MHA_w1HLg)*E~E7patO-Ws`U1HZfD;tfHMhz!WNrE_aUfE*0Lz=22J|wMyPI`H<t4=)9yXcv(nB;$Y3^m!9`RkD^l~<NMBvB*2`7$Bo9+jPgL`k?yKm9N2qn*X-goh)g*wjgqi!ihFPlM<zO|=@1EPwH;R;;>5;6c;DGGbIv*8a^?G6n>Mqh_MUu`ZQV{T7-z}!-O+czq^xF%Dsre_Yv}t^HLqCWkF+#;a-zGq&u*n|8!5F>=k@!3dFY)gf{(}AodP14)PX;l1$I=;ohS3!lc>bUC1&=F`pVhKu)?&*Rt@X^4sOf%9Gn#Bpg28yY+BnaC-Jin3oIm5jwPv=PQO2yB;1{r5_(_{T;DP*Ry#Z^sxRcC}lmH;@MR5YcnsohR<<qruOErY=TAC2)Jx21Wd|Gub`%})GRBkCV>v#Pe^DnWvoeu`q4w*Y6s%!l8sqxdK@sn4!U&-Ocot|!-qdGU5%{KktsFnEGfQ08}9ob@UphS#na|JfSG$oi)N*ywO`nCPj$M#RhMkRGa5#q?WQ}ci5-C?tbMsvM5M4fB*H~+TQi;L0Lf`^XCn$77Be^BySAFY=TM_$=<Bd2MHzuOAJj{LOi*|>v$Fuv;b)2NRhP?qtYT^GRNc=aW$WoOQ|z!sRE*GJC`Sa5MCKPc5_$8b%*)M65O{#dKt*feBcv40i#*O)t&L}7=HA7rur!l4ABR)dUR<?zJ}ut9J!Bd@pSF%sy($sAUObj|MK6ex~_uGx1-2Ooj^2Z0;52T}Cp8hEXdjDyKpcyzKa+-cgl@KZ6H66gQde`O^UD;keQ<5n~pVbqYn8-TKCG66&<VtNbv;c#7jHl`q&@~OkDi@zGvs9fTQ7h)Psr(-{E%+dgM-J=Ne9X<cEdo^ne(WyFg8$<M}jxeh2CkSIa5si2xR<GQ6bsP*<0p?Y7$0VyipM}349R0StcO;;6dKT^+9DWkHw_0R}PZ5%|uRX!~t7qZKara0(-`rf^Xw%=bu)F_ParmkC>%so+!G7=eqrG1D?WbOM=U}(nX~`!i`)^O)z3U!zccJLu<6*z|>rr=mxBp@9<6f`R0ysYIiqo?diK;VLsIwIsF$3sq<(wDL^<X|wlqR@<ZgLwA#b_3i8yVBPJ|GDm3}X|vtATqGkJ}i=3&IP|7sNz>yo4$20Fz6A)j66g4&!JNB>pQmynQY1kd}dpk`%dU8U?hS-u1%>&wf(a>1-trMVuUcI9svA{XI+oPsX-aSGBysHpUt-kbbuEGVhntEf#f3@r|ro*%nh!f1suoo*|8{!E(G79Ehtl79m<`{yH(l2$&^?oig;OK|v`(5$wyzApu=&5285T$x2PVa(?C%l&TD!nV?KMueE+07kfZmx`qi;+#XaF<5YE}ayg(c_u36oQ0i#fC}i8JHs~}TsKaXm3NT{<h(tY*VePiKgJ*ii$Jq+jF6Vq8c@^>q+TtHFgW$(I!sx?4#6#9Q?rqxwgL4j(O)$DO?}Q#!ZVN?hOk@<TY-jXV$Wd+UME782!z95)=mN27_~Rm3<AL!f7hYk_iM~{q{~uY54wXz4haea+_yyC;+JU%AXUW4qRIj`kGLFm(k<~?{nT6r09#A9BGm`13N@<B7KtZ3aFs{y4uo^utC=FSuq&bkrv*oT5^$`LDfMcAK=(&YKZS?<S6IL`0_$q2yfPfx6s8D4_g=1KHMZ%J<xew^!0mEBW8MB;tsTCy>9*N-^ab;^{!xHJ`A~?1)V){CW?j#wul^60JzKq8&GuuP8kq^X!oIr(vi!}4dj8aTLcv)DQ9Fk$=$3vfIL|Fh1Ke22Lsv@o3E9m6n4sl;3OyAOBj4<uWjYA-z(`j&nlK5P#g<gYF-<VO5f<|tDZYeX2!iLK6u~1s@k!aKOG4uj!X}xh|QXK*Sd)Ik0LfCZRby(%9qE0I*TP<ij3xgD&E_vC3N)SBaq8_wNOx1^jKX+U`L4L$~KAa8Q@JnB9;x0K}-gn7ftfYp;)l|qG&FsP`U8ubB#HKE~=Ap2;Ar4M@Vy(IMTr@=Um-fb5dvgmOP;3Fu5NvGOP1q@gy<m#FGEv*jAqM!uz1`fGK#zZsDh{4?TU%@E&s#7M4Ar6@H(JdNP(xdrYa3fHhJgn~yX;4<qyV}olTwTlnenNiTg1kBeckRKGk1)YdEN1_?Z(z4RSPybwlK<2mq9iPiF>qgYQ<2igN{pa)nE(Wmj_~{U0qp0b<AVAWm{q~Dhv3O)k*4B=Ue+~dB!5jEv5Qu3$>TvhNEVs9;=R9E~+(Wt#B(DxMS$658Il)JH*YS{{%J@jQgi!eK7+pKO-eClHsNA%|L|qq2KYiFZYY}8Lfpuo+M6S`a*{7BMlFRmGfa0W^}LiC$ljCh?fJ%#F{?YnonMWU4S4#I|M^elmVc4qKyQ(<!sXGcym?<D|MeYf7y8cVq=S>BXNIAv|1n6w|;5;;x#w^C!ujtw@rd{wbfk3n#NZMBxm#MMUoB`166>jMkG;mr;oc}mlOyFg%kLaRIodu4KF%4)J8uPr>3Fd&ECWWErQ$@@(G3W+M?yGspqXVs&QVI%%;z9nUyr2kwnlDCvA{96P3P)S@Nw^E;LEn7K&!%&&{Uu7-2IwGB1QMpRway%oE0qY)HbUQG!6{GGhUbzhaIRBv)sXhXz4N_OqB@pM!wOlR33Cxkp&?;1QNI{za;TUBG=t*CIk&p3qrZZWf3t6B4E2=d<urht9aSFuG*q%J|=#$JE^U>t^#&r7?)nD^NII^c^AD<T%=55L}?3gbW6m5c%~GymN=Hm`!kK)~agq$T_aq4&6sVa7WC9Y!U~Q*Xey<f`qRhLBiVt12!{}r&c}&@I30xtr8T9oZmN3D6&_C#bQD5fn3DjDmySMsAT?q9|@@;0}r(@Sc~nN2xR{i;>lA=;Jec3BjibW=Y5dZ;~FVZzul1Cudm8*9N9Ct!Cq^&*Vfu=TSYt^l+u5QPU657xU2Q0@$2WoW!ZgK-JvEen05GE+kU&V+kN-`*S-J#?TNdC%x2PJGh{JoFg<3Q$<PfoL+Bc<W}~^@Q`47WrYCG8ADMBDw&imJeT;H^C#qR*tv1(aNlVHmoAr|C0W$9e7OMpNDY|+3F>rNKO|s8Z(z8m1gmlcz!$YxsJUlh_k#GBwiTnNyIwMEHC^A$MdF2p-e&XfGzleck-|f9S5T9L;1wO^361*!dyqry3;f_=EZ~{SwKFJB7k1Ugqq3+9D3Jf`kJ3(N)11Jv1ZU`nQK-(P$7r_8_E$J;fG0_`zw&FOec(fFR@ai<US<RX`lg|mp2|#?vbS7p&eY|H>sFL70zDr5-c<I}XY48y;m9qJfGh_F{t0<sr49GY6QcVQtZ%%U`h0-z0Rdo3x*$e`VKD?v@m3exPgb_b59|azq1CWN1bv2R*X`>I0(k91a%`46M^%SLJlRft(v#0WooQG{XsSXoK<lT{6Knn_(Rh~>x_AYw&^VN3{>E_u=z&HQ|YrN?IoA^VF+XS91<G9|;CzdK!^#6cLQGDTsGW-CHi%!N;QKbn_Pgdq1PE9q|6&yl?EkT?{#o?nEkG7tz<iOeJuuO({Rw2A-lZ#e7)HUIu>ngugwdrCMg-sQi$O^J*Y9%oXPbYO#Ee-lrPxH-J(WlR=IfpKP_(64Eh-~n&6+-S|F#M9xiE#<Uo9wG2*LKfKL|f4pFp*(Mb~%NKx6c<d4G+jWnDq9qevJDVkFJRVSdZmBAQb<YUSgih%3?0!{;p&{J51%B>Hu#fRVc{6hP}QXX0?>SZdB60${Im6q6_s%u92e-q+<4))*K}KA2Xll^~MRfgJJfwu#CPY1v_QAXlDFQ!>U=d=K*LJs_(GNz6Rn_J%Vfxx~%{%qY+vCVODiGzmn9WAccmQ*Fo}4(PM4wPs0I)|FT(^MXfrYLT=#1jb!AQsv<jnlrfBsj#h`0FmjHoC;o{Wf1yyZk!QBtf+6HZ!x?JSHvit0KW!twc^JuiNIO~X#KQCCt%YiK#|6bj9yXd|B)ou9{xRbL3lrFwx%s(UjnuOodLGMGfD`2xlhkMh-Z+%6R$e4g%%PE03uQHJKqvQ~(k>4eQT1}PORK5JRNHj{RogJ=$Z&bpsG)m{hpRDe?l=yT-?y#OA@^6eOkcZ7bKn!2f!3F@8Ur3V$Gp)+xKtvHi)`D<H^xcSYSEosE@&7lqQU^3I>&O9+j11<k7MfSa0eYvcv#T=dL%6c1>kUgwH%97vsJu-i|s<RvkL|#n%VvhS*TeMx~RRCWn>pEFsXs%MTh$oZ#GqppV70HXSDEBCrI7}AzqZhH{;<-a(le59Djj?zI5C{!WBe=3u3%#Lbky?RCJrdzm}z@mYIw)kHw8Ko2yf8tyLoPhm_$dkfEC6xr6sQnI;}pr^FW-Bz7HTSy>Lzoxj7ET9~rJAg@64%G!Z3H?Kv2SB(%zXa}cJ>W%@NrUs-&^>`f=JwcC#S$Hg>k(!QGjN)g>xV$>DzEfQ#xlXErnhVaPvUq%$3?Fg#mBr)Y!s2n8#fv8-3Z8YUEftU%KAh<+xy&X6nAD~rF^POnlwjo{{JaB9^(NCm>r)yAOq6X2&O@c=*X4dW$6|F=o@q(G1XDa66OAz^MlBKu&JpZDTugp}Vz4<JnK2+rsGtmjGEY{lqM|uuYvzt!G->S2V#zN5VT%MT5GEH|`$BiPo_U9q*V7_mP+jE}RKX9KeYfXn7>~ZRc~^;pqYcs)#_yMInru&}l+3Au0_?`5L+R>JwHUgdo1`Q;<vJj!auRQ9l8-7`s|aUSzn~X>kb2<}Sm)-RVq$7C1Hm4o1?Yarh9jE;OyRtwU?My+aE=!bI9@+tk=+9EQm_pOk7slc%X2-y01GbjBja$|El(}x>@YmsC6Z|3q9#Z|m$``mO_R`dBc6}vMDb`BfOp|0YP`ZAq;Rt_WP%KG$RXN~^gaO001hat56GKxx9BKonC(}@1)gjmb|`8sb{w(llFk+OWU&Lq2qVvLbIB^EI}KCgrS=|_q)-okYmb-p(il$BFN0lVLK%hi9atkq;!lmtVbErOVDm*|ZOxG0gf@D&A8e`|;X5fxm0Qg@mBZ+&TDeuJj4A_XXd0MjO&R@wXm$Gndp8miRDcEBv^uXDZ;t2tQ+7vIi~%PBQu9qb$O_U9?*OsMN3Ypv_9;#MoYWhSpI%4h@yR8Ra2*CW%MNb8_@!nbn~+x+?lSiM?=oO(W3zU0Jf=-6p^tnWN8yE3jlftD;7H+HCh#PJGk6$;I|+k7Z^B!ajSOVHe57LQ#fGf;kV6wjq>iST^T*4K)&dx(Y@ITk1zgm1e|pC@5?+Wb$?JLZ!N!u-`8h8?51o%(8Y96l3kb{!GuZg{TL*15iReg++iO-~$}$^AT9<s%LEWRH6!LP|r<ihUi4~}Uw)s#%jkYQnR|1*s^Vy?W0@z7XcQ6K_=&>mm;8mqdP$<ip!SYhZU8d@J9Y?#8%$1nq8zt|GUKtYnn&+iu7u_oct9HX4R!Wr1<gTFB+tq_8x*F#JX`^pQ1<9AlX(61paWI2t;t)EDT;stecTBBldC&w%5MwTBoZhn2L#UiCzE_pqM8L@x7|Fz)gtBUC2)k^&5%Mf2`eKs>k`u-({1QgjA(1TWbR>|>UXr<2b);Ld4~ZP{22O1?nh!Ln%s~G7_G?dXpDlNkUiz`2cl4moKlA6+Px@=d%!rbP(MQxcQN@v0(Ut=fDw-wAU`(DgbVkOiM46pMx@DN^feIt`(4x>*Dhws(lQ4m_j`F8|s9A`YV3Fw2*hfFaU#qmf85hK{1XdZY%+@1MhLij;MmulksJq?kii0C@)II#Lz0(!%PWE?tdk6bsIvW6=I2Er5xre{_x8{_;3mN!5>h?~K_K(>KgYWq|*?!*@Fpk*!`0=E-{q{pw9QTg)c6#Et+mn|O^yTZMrWbu+Nf$3v-98pS{)m?E?|Z#p=_NQ&Vjg!tbfG241=zv$m2*deU<>2)?|9l+o>(?63=3O%d}4%?*0o-CwvW5w_g}mF@}fo)HVu3G!fdVCt#xR*ze_KxF+EU#9b<FT5IwA%%m#F?wGDN;AD|0QbfGE^B<OIQx(ENUVVZUeHtIcoBFCW}6<$^hzqVxm`zIeh&=Ax+O#@c)#~&%q@`R<UIJ5wP<a|WW>TE^<GPR6&j%ARq<8(Z|z_mQ??wlO$^*)K+?z_GH?$N@vv?U~JO?SIHAGVLWh$8=L9+U)7^3&15@4ZilUEXtn?T?2AV~%fRBuKQT6%A!(BxQ842Pg=?V9GbgdT@$-u!<ZGbVeVbYb);%URQy2PS3Gy`{-!<)9HD;%|%oLh!0GA5Tk@1xk2L#b^IKf^d|p~*JWfs_^Q_YH}B-M=Snv*7IJ`xmw3Y3E6h!rzhHCRlEDLoZ@cgJ_B9Ip8R)HdfXF5aT8MF^)T1uopraARJ0P!<!(AXW8glQQ*gxn&=?M@e(Jzw=qoY5V1!J!t4L)OV*GOhVBsYVFkS(uAgio4Um|b>jy(Ajnd#8r*ujGlVj)86gkbdN;08qMr+dJ;%eB4?%E!g}<e3DJgO--u<BcP)IXTV;lub2ke{irPrcZ@>*R`HdOQ^D@$%tpL=&F?V4h`#ZygY#UJ7LkV+ssJ<^;uwgW&curxIkaU1TP!I=((zRKa6H3kwIEws9ihQI4SZc)zWHE|;@i{?yGKALACd80?<z>5__lu|4a+YkUg3=dj{nD3cADACAxI82P!6@pp#+#J#r4~5%6V=|e{RnBz@CrlC+LoTa9c?-9GdtUQ>5KEc5nOc#f1rkesHu4!tCuQf!<@-2r=VmV#O}X66{hZK8X)WXr*a%sxu=c^SFv7_&ZsFk}hq|=LkmTAdQ2GIgH$~pWto0SL7bEalkw%)Oh`x(`9YLuq^zOiKaz872ImrWhF#cGfpwbsyLt&fBBfz=H*M^v$naIZR0&43d%LyrC5sBast^qX6*?=LtDgGuUlAB)Cy2_7sSdQC{JEefGW=);lLC$s=``~lpEEK4BUnoi@G3tw9l`qsOx}+&}D_x7=VK(xqDeWd^l#gRK~r&L9CrlY0J21W`(0*PeDyxAaZU;^%z>t$*kcdCo+wGB-K_+e)vCO{QcBzjOe19=Nk_{&Vi%kbB+o(FD&*t7Z*$(jrRPMtq={S>eE-9=9~wwIR;dHf_7-_4A`5UUD>TcwNNF)&Sgx8o$%)M@B(&zQa}!z$3<lA#Zo9XLA;QzGzS(EO2wQBao^<`9fOpnF=t8~PsYZ;gvd9ZpTL(ZU=~i9b~7=K*Duv*cG;O)gnSf<3)+%n77OW;vTe77MMfQPmr}1#k4tJ7HT<jBWbP<*;v<uvEwr+}-pFz#l&+H*S_+2z4pJH(<u>6Bj7h>BmO@!46YNq!aQmXp!PgiR9#_>8R*|?`q@DDeQDNRDXx1`N>CGINNX^b2hqP^}``U_Seb-^xQiKcE?;3@@JDsW*l;9$lVdVj8YIf>7Q1E584|gyGy2i|S7q;<u=ZI*@P%V&rnTT}|a{3o?&+rI&)7DXvpzIhA3(%><*iXTVbkh!YZPV64LEb6I_0OR2@O&a(y^JReBJxQRa~n3_MMHQ0gweHW<$D}ri7dlwZ~wS^)RQ(}J<PD3P0SLT*^18X%wDkB(_@1~b%SyKX2-v7e>mwLn^jh|2@+ekIl#Ej6L&I<8+P3WA$yCS0tNlhg*CGBgwrQ&H1h7$``1*5nlu!&Q^bAx-o6rl)!g2KB*`*^%VPekOy~@09UX)8NRbvN_8OIOGP2LW+dkeQQa%<RwvT%@_5&sP9$0)hI5^B`<{i#A&*{)~F_z0?nzf};GiwD>Bj+VWO<Yo4TF@9x3BlSKY?>>)*q856&viA*^Ik>+g+)`I5a^V?Jj(&dvy?Htw<F|kiC_8zWf(Bh5<~=z!rm_G>UF1TUTAcKn9RjWNt2R}pk7FKm8~8?-O!CaBzyAudx_O)7SUBPUA`d@Uq|hk9|%S$o36&3ygOsze6t=a7H($l(0ze(W;p^{$HNtqnFqGZ1ZX-Y@#u;%7`gDHWOnA(X5!;j8B;$EVktJO6P|1LRAv8HOa5}=?Gg%r0a#MH|FdQLlO?-y{MU(No*~BM@G}$PPZHqSeR1R};*vt|<t5e~i$Gf@BX_$edV3$c;(rhJyTaHe*QvXD>_+`VcQ%d;tKF7f$TATqNnc!c_X3uh4mi=fcC<k&3ro=ewYJ;)pO_QK<oVuOg1~<daPIDHzu!LqKHNE0-q+62!SDT@gOmN9;sp8N)$6i6lFrfXz2hzj#+~jV`Q;aIspPx@r#()%n)N-Oesd8d^>Lpr`GVcvwVU)W{E+Up_4LTaTw>03I+0neLa#2>veWqnK72A4A_dm-pf0-Yf)KX(V4i;y;OWW>!<KYlt3#hQDKD&sY5o&XoCCj4p>Mj;<krXo)K8F@+IG#(e9sxPRJiAHc}gO@MtCkGZa4>g9zHVaqVvRz>!xkM7Q+kDzQPt=cL$WOf?G%3zaIS7729Yx?LQ@~MX@X<&cl<pANF=^Hw1#g*VdsY2CZ3~;rpZQ{T}dVcjp8nY2Ppu&@|q@h~yGSW4{t_?Nf4HG3d%6(fp}&A)7K5Ck~JHK5id<62Emn*=3=I6>LiPBL}$_h<%ww2Fv}IoiS!zr-f1Hcvk3zFuofu7)!~5<tLL%W%?=2XBnc)cM$l;mhlvxy3!#0C?|fpcM)n%rs<y;t=vBO&=bTE3*fHjz9-KjUzY;RWrJ4Dk}_MVM)A-KPqggi;9|}6WJa~?Tm@8B+t|;=%~A*~NFBXeQPdQk6eP}Lq`FAYskKlLfr#mY7WJY@AIkx{+LbB9xiy`rlbceE*@6@lq#}F!WPk5}PP%4|g8drOB4zhoCR1h|&NZPWmnxDe!=k)_Mnm-bO3)qm`&uqRCjN4$N5Ku4ESPCg<VZ`XL;-@ok|$7%_@kXh6+1>#{%h3yk^fp?2f>_{Z?Fap{41_s!Qe~U!K!$D79sB)!DMmL6#;C|7nycd!r6}r4|^%Hwigph#e%9ptt=q;i8NyyJ2Lvi*DKh@=H`pmi><Y_wXO9R8-}%@$BNfpc8%TUcT(23)dYW;baex+=oga0(UJpU@8%Ng-f9{&Rh%*=R@#NcOJ&h>4$xBlwQBp5$>LAwZ>_$+R<S=lJk6$7IVPRqDWD7@Ksb^#nKx$cY%6-%s!LMapLFqFkZMR$vt?(jzDmie?RJ1ZM6rkj=W5LbB*2MVyzpg(NQ$sdkLlX3X!d7_F44K2XI$87Vz$xyTd#ZE!^=OQ!pGzH`L8-#w-o1<CT}5hYs*NjT?(Sw)im2;WK?!m8|+li${}&|*0}fvSHph30h^I|{w5pUbcIV-Y~zsM`vg(}zz*;&4wi1}`&UIv93=QbL6A!^`x0M98G#v+{f?!G6=9a7B#J6Sm%i@~K;!KEs%q@*bGDVtxgutH@e7|3IM=+c{#CnE)lJ2F4`RK_5(d0~WoeE%jLE3I&8yckxQsCvdQ#lxFmK>gU%fUfJVUP>tak(8TRq4AD&4Gzuk9pgvg0Fsvu<1b1S|cr=yoh6u`nNoa~YnubOnz~KGpCmf#w4k>ewBDV3fdvUggUfut##Qpog$Fo;Vj=C7e3CG%vVnXd?4mEb=r4rkBxnvjpOIpbqI+1L~+IfXxAlgJmEQCetXT_x<rA7opSq;+!H`N9-@QWIoIjCsH$wvV(AL40t&bvlbGN<oG<Hkvq~cF@N%S7Uw^7_WFS(xe>!4L<aS82p~??y+$=ap{q!;;q&Gqruq-Xq#RM5yHe+lz7>B99B-uCJ8W5~e}?Wb`=?{F9uw+VOO^?y&eD7>G8XSF<l;TLH?@u3>}<`BJblC-kkYEFj`j3{e?9iHn=-#0e_umPnhD!sYZKp(sFm8rUD4uv0J}}4GW|OcUG*%{zYE^#%;<kF>}3a|^7qJoFWgnO?W73mUAP^-k?#Kw4!j^?KQfN?{pP<^n2}$&obpEbKT0>2z+|t)@^<mW4QK9HGdM(yFP%lq2sfn6ucxX~mH+=FTxI*nc8%-qYh4aXRb`z%>VVMP1GP?wVqRf2)36|awqdseYxVK?y<yAH8~vq_TlS~C&W|0(d7`Y!a4?r9tC?N2(=Bf@zs6+41p7HmpP2^vp%Mh&qnEhOBfUmLY-^`ZlmU$|REO^ZsJ75tpx+zH_#n8;FEaibC8K7OQw6;l(AeFhSF-K*dVe$O98+2iT76wvY2WYf>-<Y|9Xx}_96Wk&l%Tbwo72)%VMZt4mCEW|DBng{Yjd@Uq7J-cTAk(nt_HC5GFA=XC9n-U1=~0v@p_=iqB#!vZ`L?vywBN;YLJK^iN^e`>Xgu2fpYZ>y1p0hhQ$kC>E4&5Ee?JYCiepjjW*82eJSY8Y@Qgn!!MSB5uw;mX5&-_$76aC3IJQYl$c&Rr>>1jW&=6t{Gyp)qFq~zx6k%RQQY^v3*Usg1K$>d8T?2)t+gh;5cax5Z!?`lpyZ-37~0f`3zM<$PxCiCxt_dSm@}T9$)42JUmo2%+{|8Q>ZYkbnbJLNP5IvQOF*D({VMBFyWK8p@=Uwdv+kX=+ME7pR;E?|>Slc5o~>ZZUP2f1n|Teq(>TAePJjJsj#+2N#br9=U-FHt+GF{;x9-gp4HsLxny>u2)&eYa4!c=+^=mMa58>$sJSjD=A|bnc6Z%8Ca8QOOCXQp#iyzgQQW&j-m%7)?Zl{33!7QzZULVY;zEamHSrT;RHP^>mB@F!)hxxO1-CJY%rFN1MO3O~SA0B~#1gvM*X3IDE(Q63-aRS+fZa#EH=nC59&;?fTy9)#>-pSj|933kP`{)@3@JLf2<~Eya{ISj-8<qE5*8%m{xr5?OSeMaEm;^3fhf2df6NXiQ2f5Ik1fjWx_l(|{z^sa48l0w~&L`B3UmOy%dq)8%7O)kN1@Jr-9tPm|0mLTrF><s4X2-=W#8(i_15kU(T&;wvyk<_;QZJe-$fV+n=48z!UNslb!ag%TUMX)&(V67Jt*Nil5Vam&kJZ#(M=kFM>WCoqV^emZEr61rQimtyWv5P|N0e2vik^*5R9uw5V|Oy}+%}nHe8XU3Wf1cROJr414IyPR{;6KLkN1^bySIJ1hIxjUKMc{Cy2J}ss36DWsqxnJ#Cz@zL?cnYaT2;$p!aY`N@W-lygOSV_B~r^SFRrye&KbdU~5Jq8pHvB8O1@AoUJ_I`<Q^a&MkYrIvoxfjDi^762d~@2{ZX_5Vooi&O()p-iJy6@Mro_fs!ul(Lg;yK21!WQLVZ+e9WDPT<PpeDcmh1qiOI~U$inyFZ*b?fI&yEe8KFa;9mhP5RQB?uJ0)jTXi7fi*We8EPWt3Ob{F=eYA@HDKJ)P{G4tiwIv@uuX$xp1bE{FEyUnu;CX)d&qv_z5nZs1qYGL3Kp^u%uRQ!e!IN|H'
ROOT = Path('/root/funecob')
COMPOSE = ROOT / 'docker-compose.yml'
ENV = ROOT / '.env'
FUNCTION = ROOT / 'supabase/functions/pix-ocr-settlement/index.ts'
FIFO_MODULE = ROOT / 'supabase/functions/_shared/pix/exactFifo.mjs'
ASSETS = ROOT / 'deploy/local-ocr'


def command(args, capture=False, timeout=None):
    return subprocess.run(args, cwd=ROOT, check=True, text=True,
                          capture_output=capture, timeout=timeout)


def dc(*args, capture=False):
    return command(['docker', 'compose', '-p', 'funecob', '-f', str(COMPOSE), *args], capture=capture)


def write_private(path, text):
    temp = path.with_name(path.name + '.local-ocr-tmp')
    temp.write_text(text)
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--protect-event', type=uuid.UUID, required=True, help='Evento ja baixado manualmente; deve estar fora do retry')
    options = parser.parse_args()
    if os.geteuid() != 0 or not all(p.exists() for p in (COMPOSE, ENV, FUNCTION)):
        raise RuntimeError('Execute como root na VPS que possui /root/funecob.')
    files = json.loads(zlib.decompress(base64.b85decode(PAYLOAD)).decode())
    old_function = FUNCTION.read_text()
    original_function_mode = FUNCTION.stat().st_mode & 0o777
    rules_installed = 'auto_settlement_process_exact_fifo' in old_function
    is_local = 'async function runLocalOcr(' in old_function
    start = old_function.find('async function runLocalOcr(' if is_local else 'async function runGeminiDirectOcr(')
    end = old_function.find('async function processEvent(', start)
    if start < 0 or end < start:
        raise RuntimeError('Codigo diferente do esperado; nenhuma alteracao realizada.')
    updated_function = old_function[:start] + files['adapter.ts'] + '\n' + old_function[end:]
    updated_function = re.sub(r'^const GEMINI_API_KEY = .*;\n', '', updated_function, flags=re.M)
    # The whole financial pipeline must remain byte-for-byte identical.
    if updated_function[updated_function.index('async function processEvent('):] != old_function[end:]:
        raise RuntimeError('Validacao das regras financeiras falhou.')
    rule_namespace = {}
    exec(files['patch_rules.py'], rule_namespace)
    if not rules_installed:
        updated_function = rule_namespace['patch_rules'](updated_function)
    old_compose = COMPOSE.read_text()
    existing_ocr = '\n  funecob-ocr:' in old_compose
    match = re.search(r'(?ms)^  funecob-edge-functions:\n.*?(?=^  [A-Za-z0-9_-]+:\n|\Z)', old_compose)
    if not match or '    environment:\n' not in match[0]:
        raise RuntimeError('Servico Edge Functions nao localizado no Compose.')
    edge = match[0]
    if '      OCR_LOCAL_TOKEN:' not in edge:
        edge = edge.replace('    environment:\n', '    environment:\n      OCR_LOCAL_URL: http://funecob-ocr:8080/ocr\n      OCR_LOCAL_TOKEN: ${OCR_LOCAL_TOKEN:?OCR_LOCAL_TOKEN ausente}\n', 1)
    edge = re.sub(r'^      GEMINI_API_KEY:.*\n', '', edge, flags=re.M)
    service = '''
  funecob-ocr:
    <<: *common
    build:
      context: ./deploy/local-ocr
    image: funecob/ocr-local:1
    container_name: funecob-ocr
    environment:
      OCR_LOCAL_TOKEN: ${OCR_LOCAL_TOKEN:?OCR_LOCAL_TOKEN ausente}
      OCR_LANG: por+eng
    read_only: true
    tmpfs:
      - /tmp:size=192m,mode=1777
    mem_limit: 512m
    cpus: 1.0
    pids_limit: 64
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: [CMD, python3, -c, "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)"]
      interval: 15s
      timeout: 5s
      retries: 4
      start_period: 15s
'''
    updated_compose = old_compose[:match.start()] + edge + old_compose[match.end():] + ('' if existing_ocr else service)
    old_env = ENV.read_text()
    token = secrets.token_urlsafe(32)
    updated_env = re.sub(r'(?m)^[ \t]*(?:export[ \t]+)?OCR_LOCAL_TOKEN[ \t]*=.*\n?', '', old_env).rstrip('\n') + '\nOCR_LOCAL_TOKEN=' + token + '\n'
    backup = ROOT / '.local-ocr-backups' / datetime.now().strftime('%Y%m%d-%H%M%S')
    backup.parent.mkdir(mode=0o700, exist_ok=True)
    backup.mkdir(mode=0o700)
    exclude = ROOT / '.git/info/exclude'
    if exclude.parent.is_dir():
        current = exclude.read_text() if exclude.exists() else ''
        if '.local-ocr-backups/' not in current:
            exclude.write_text(current.rstrip('\n') + '\n.local-ocr-backups/\n')
    for path in (COMPOSE, ENV, FUNCTION):
        target = backup / path.name
        shutil.copy2(path, target)
        os.chmod(target, 0o600)
    print('Backup criado:', backup, flush=True)
    original_ocr_image = None
    if existing_ocr:
        original_ocr_image = command(['docker','inspect','funecob-ocr','--format','{{.Image}}'],capture=True).stdout.strip()
    prior_assets = {}
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name in ('server.py', 'receipt.py', 'Dockerfile', 'test_receipt.py', 'exact_fifo.sql', 'exact_fifo_test.sql'):
        path = ASSETS / name
        if path.exists():
            prior_assets[name] = path.read_text()
        (ASSETS / name).write_text(files[name])
    # Save any existing helper before updating it.
    previous_module = FIFO_MODULE.read_text() if FIFO_MODULE.exists() else None
    edge_changed = False
    try:
        # Isolated OCR starts first. The live financial function is still untouched.
        write_private(ENV, updated_env)
        write_private(COMPOSE, updated_compose)
        dc('config', '--quiet', capture=True)
        dc('build', 'funecob-ocr')
        dc('up', '-d', '--no-deps', '--force-recreate', 'funecob-ocr')
        health = False
        for _ in range(12):
            try:
                command(['docker', 'exec', 'funecob-ocr', 'python3', '-c', "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3)"], capture=True)
                health = True
                break
            except subprocess.CalledProcessError:
                time.sleep(1)
        if not health:
            raise RuntimeError('OCR local nao ficou disponivel.')
        command(['docker', 'exec', 'funecob-ocr', 'python3', '-m', 'unittest', '-v', 'test_receipt'], timeout=20)
        # Smoke test through authenticated HTTP; no financial endpoint is called.
        smoke = '''import base64, io, json, os, urllib.request
from PIL import Image, ImageDraw, ImageFont
im=Image.new('RGB',(1100,900),'white')
d=ImageDraw.Draw(im)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',36)
d.multiline_text((40,40),'Comprovante de Pix\\n03/10/2026 as 20:22:28\\nR$ 48,50\\nOrigem e destino\\nCliente Teste\\nID de transacao Pix\\nE12345678202610032022ABCDEFGHIJK',font=font,fill='black',spacing=22)
for fmt,mime in [('PNG','image/png'),('PDF','application/pdf')]:
    out=io.BytesIO(); im.save(out,format=fmt)
    body=json.dumps({'image_base64':base64.b64encode(out.getvalue()).decode(),'mime_type':mime}).encode()
    req=urllib.request.Request('http://127.0.0.1:8080/ocr',data=body,headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['OCR_LOCAL_TOKEN']})
    result=json.load(urllib.request.urlopen(req,timeout=28))
    assert result['amount']==48.5, 'Leitura do valor falhou em '+fmt
    assert result['_ocr_provider']=='tesseract_local'
    print('Teste OCR '+fmt+': OK')
'''
        command(['docker', 'exec', 'funecob-ocr', 'python3', '-c', smoke], timeout=65)
        # Stop if a manually paid receipt is still eligible for retry.
        query = "SELECT count(*) FROM public.auto_settlement_events WHERE id='" + str(options.protect_event) + "' AND status='erro' AND retry_attempts<5;"
        check = command(['docker', 'exec', 'funecob-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', query], capture=True)
        if check.stdout.strip() != '0':
            raise RuntimeError('Evento ja baixado manualmente ainda esta em retry. Instalacao interrompida.')
        # Exercise actual PL/pgSQL in an isolated, transactionally rolled-back schema.
        schema = 'fifo_test_' + uuid.uuid4().hex[:12]
        test_functions = files['exact_fifo.sql'].replace('public.', schema + '.').replace('pg_catalog, public', 'pg_catalog, ' + schema)
        test_body = files['exact_fifo_test.sql'].replace('-- __FUNCTIONS__', test_functions).replace('fifo_test.', schema + '.')
        test_sql = 'BEGIN; SET LOCAL statement_timeout=\'30s\'; CREATE SCHEMA ' + schema + ';\n' + test_body + '\nROLLBACK;'
        test_result = subprocess.run(['docker','exec','-i','funecob-db','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-P','pager=off'],cwd=ROOT,input=test_sql,text=True,capture_output=True)
        if test_result.returncode:
            raise RuntimeError('Testes SQL falharam: ' + test_result.stderr[-1500:])
        print('Testes SQL de baixa FIFO, terceiro, duplicidade e isolamento: OK', flush=True)
        production_sql = 'BEGIN;\n' + files['exact_fifo.sql'] + "\nNOTIFY pgrst, 'reload schema';\nCOMMIT;"
        apply_result = subprocess.run(['docker','exec','-i','funecob-db','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],cwd=ROOT,input=production_sql,text=True,capture_output=True)
        if apply_result.returncode:
            raise RuntimeError('Criacao da funcao FIFO falhou: ' + apply_result.stderr[-1500:])
        FIFO_MODULE.parent.mkdir(parents=True,exist_ok=True)
        FIFO_MODULE.write_text(files['exactFifo.mjs'])
        os.chmod(FIFO_MODULE,0o644)
        write_private(FUNCTION, updated_function)
        os.chmod(FUNCTION, original_function_mode)
        edge_changed = True
        dc('up', '-d', '--no-deps', '--force-recreate', 'funecob-edge-functions')
        # Empty body must return 400 before any invoice/event write, proving worker loaded.
        probe = 'curl -sS --max-time 12 -w "\\n%{http_code}" -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" --data "{}" "$KONG_INTERNAL_URL/functions/v1/pix-ocr-settlement"'
        readiness_namespace = {}
        exec(files['readiness.py'], readiness_namespace)
        print('Aguardando Edge Function e atualizacao de DNS do gateway (ate 120s)...',flush=True)
        attempts = readiness_namespace['wait_for_edge'](lambda: command(['docker', 'exec', 'funecob-cron', 'sh', '-c', probe], capture=True, timeout=15).stdout)
        print('Edge Function validada apos',attempts,'tentativa(s).')
        print('OCR local instalado. Testes PNG/PDF e SQL aprovados. Baixa exata das mensalidades mais antigas ativada.')
        print('Nenhum comprovante antigo foi reprocessado por este instalador.')
    except Exception:
        print('Falha: restaurando arquivos do backup.', flush=True)
        for path in (COMPOSE, ENV, FUNCTION):
            shutil.copy2(backup / path.name, path)
        os.chmod(FUNCTION, original_function_mode)
        for name, content in prior_assets.items():
            (ASSETS / name).write_text(content)
        if previous_module is not None:
            FIFO_MODULE.write_text(previous_module)
        if existing_ocr and original_ocr_image:
            command(['docker','tag',original_ocr_image,'funecob/ocr-local:1'],capture=True)
            dc('up','-d','--no-deps','--force-recreate','funecob-ocr')
        if edge_changed:
            dc('up', '-d', '--no-deps', '--force-recreate', 'funecob-edge-functions')
        if not existing_ocr:
            subprocess.run(['docker', 'stop', 'funecob-ocr'], capture_output=True)
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Avoid printing subprocess stdout/stderr: Compose can contain secrets.
        print('INSTALACAO NAO CONCLUIDA:', str(error) if not isinstance(error, subprocess.CalledProcessError) else 'Um comando falhou; arquivos restaurados.', file=sys.stderr)
        sys.exit(1)
