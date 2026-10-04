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

PAYLOAD = 'c-qx{i(lJFlJLLM!_J(fi7adgnZ${c9|0%BO#&Q{nayEVD_b%su_ccr^BCa%_OBk@QtM&kJodi5><+eD{iv?4S65ZHZr9QvxeO9#cC*$MYvFVjCz%*}Y4GInAd){v>1F=?V(N{GA6|Mf35WUbFwVbzO5-U15vTdrbUvIV@hC`(qAZxs#^EF=3NDhs^TX)8C<&+Vc$~yjagk*+hk+LI>1zP@*OQaOqu|eZkY>Mnkv|C%Tb!tV@Zm8vk)6!E3;|ai9Kuie<Z$nuD&3oU=Yh>12eVXGNP<xi&N5YL<|S$1%EAFmnW{VQxBu?$z2AP@cMtde-hX#2dSavPw%hdIAUZktt-lXtaq0xoWthZ~a~@=-aj<jbzB}02e&<pR!xn~N4Wf73`)?Q3hDTTpfO!-|=U5xZetod}5n6P%iZP+z-=HW*uJbycM}FWR2UBl$5hsD!v2X$dC>)Dq9+_Tpp4!5P>XR@EtnMHZ@DJA_o@db2G>purMFr8KXU;T^;w+BBk!e}nBpm0hUi3s;c7*>DFH8e*!VmjN5+^h*5nPV~KbVV{s3R7$Aen|)=*NcaG6~Z81c4|B$|+zTd9!Su1TJ(sn`ga~WDW}{LFma(sC5yHKGVazQ)m^*zMVAlp_=0dqu38jW1fv$PXW~dLYelAB$!RSQDA6D%K(ZX@kW`61Xf_i7PEBPdjbXFd6=cWH{K-8@re+_JWh?gH4Ktw3H4#Y(lQ*l$gK(d#TCczE$CC#OsCdaj%pr6Lo$u<2#08mup1i44>Nak;U(_XMVJMXFwJ`H&c^2BttY=ceP*1M5h4*Q9wC_NrE#W_MKS%WIPp^xo~x<J=BJ4m$B6)bjZl_2yWuE1g62VDhOu*;B|wdP2h<SzorJK|LDDk@gUqmSMhVmVB)AMFP}1uOW6Kc0=ITinTxZNIuxd#-GZ7sMEXIc$k6<`vX+H#p&En+77Lhj%Dhs8cr^>K0N&q;)^$f=3P8=YT@UOs>zpg?*yAVH%O`DrJ7eRP_kzt7iliF<CVq<Gdk{K>6^qWH=*2UPkMM&;jw*bJsGXqZ6fN)apGGKbBP`^a^Qo4ixa>^rOFH^f=IG<wR<f~Ig;~6d16)qMJljF2N={UT0(>X9@I)W#e!fO&=r6ufEWyfF*|A%WYwB}+IM45LPr!b};%mVlmWs{rdA_`E-`{8Bi2e8~g$ipy8Jiu5OWx+W-8{UXcyX|nl3S%UglYoEX@W@}c_xzhEG3Mz3xEh;$4sK9B&S#Urgh!{J855tes%gw%hHf-RmNSNvc=TEQ01cqN;#l-up*RNsG*$+P^8lSDjAM(_Gt2R2I9D7?R%daA!r-g`7Wx~aHX{)Wpaf6=i=71~_k8J1K<k05)uw_A3EdcC@!Cq>RV_yIBnhGsVjzN=K-W|?w7GV9P-e=&8P6w^sh5o|%)~ev41NS0<RjTwVGoIaKQ4^~P4mIRRDiCa8pO`|gGZtxUWiE$nL7EXf9FX&p8=%!>{M^lJu6pCyemY*Vk}TkR=LsN#5O>cOuY%v?<mAi!m;q<fZ<KR&;TMA=RrITfHy`^GV{X3DR%@j<=Q1g4F>+BQ`<R%&)bcAKp6mO(d==$3=pcx&B~;SmV&WTyublCAuKV@tmQKzl89&JmQb)#!-NDGH1)2lgFX_nfW+TQy$$0m11qZ3orEOsjb-Ob-Hj5O7E4L|VVVe>jnlOmbX$&TS<WbqK%juWcxN>9H4CqU35p8r$C<>QZ#L8dDH~p*S~&Hh8<X3dUfbg43<$Qf*(R88NW6H_d0<j!JR^%IbX|E!$g|GsL#3c@QcW6^o@HKwtAeake@erEDvCarnO6c2YMe}vGpm8dB;{gTBuX9#7!^laP+bS;y15Eyb>@azze)fs>HCJTaI*}xJY@~F)W0pRNmi+4($?v0$y5;UN;>Bq*~C0IDM&P=UHF0$$Fd$qN%I;3SewY_$n`WLasAT;Xn-MIX;U!oq^Fx_U~#9X8!XOHc{1b+AiBDUC!nKI*CINp>S?#N0g{@(w>G*9kOJZ_^r4OEO(vy*U-pFa6pS1Vx*Qf7ZwYpon}8CqQ)hFl+zp^Y9|(RrzbqJtX0+-+)aeU`TBDz8Z`MM-AY3e=RhqUtjIR-2^y9RB2LHDO*ns@I)j2!uK!Hxbi#sHMREP9Kb%^v>UVjE&E^<CjPA;oWvX}+#6v<G{4QK+H<ZM1qt7P$w4SLYJWwQnKTVahpeQ27$EE+9GLUlBH&^+2N4~_QpdyckjZZRmLF!ClY;RZ$plR!5Iq!F;V1E4#z(g_lDxd>>&A(4|_h1rE!EFoJL#cwA}Y1-yPOe6UQB@{0Y?Y%bGRHK5TE3FVKF@mk`@)1_FQ%}3f$RjghY>1;D#ceU6d;6A0zBh{T*qByg9J^Kfn9BZVFo@*v+(g^wKqJ~#`CjHBzu{ido5u4fbK_`oQ{Kquevn?x4+21MY;rAJo80B)oS=6DcQm_-%*<I5!1k(VjOS4>iia&A%@%BWy;Nk=nTF3|``9A~mI;rw1x@35G72i&OhY=VjA}jSDuF$>JG_CdB+a&Luw#i%TSMcg!`(LkR%Ly|XdEMX&m;5HnE7M;EqxR`j#c&?l-ic}ZMjtjmR-s$lLlTwJoAr3EbI;j=_3>Q$1-dhn)V#;twt-H`@#Jb{OF)UL2HvrK}asNxY<GVJKF!!Jp~hoDS#D~;odZWzC2Lm&=GKATD2>4On^N)qdj6P9eE%hGsKIrvC(c*A#V6fc;X+WwL@5qB?!d5KWTPAW8fEUo%2aN<PB`=XL2p*k{|4%s_CUVI%QbS%KOTyMT(rtn`6K~xi(5BCv{e(6Ji4Pl*YiG?AkyQ$6rB{dWBWwXSu6I{*?OrrD%4%E)YQVWu@j*>39_EgTm!y)3Is4(BK~m$1VtrD4oS=U^0N(uH)$K>uNt^50^-8%r+f#69GxUYHMyKTWqzpvPOde&?CEg3A^CMuvUCmQC9I^aVM57ibuI8OFpZb4d;n>qhrCFXE96}@Q|u5^nF*Qb?)*gd&7AD4M6&>TS;8HS4<z9onyJ^F0FEWl{PrZxNg-=*6AP?HR(>QA)ZtrmO88I0z*)idBEzOq`Gd>p6AZJQf$H0^c1zWYE4cJRoP81yp63VphtTuNaJu33wK!5YtY+4TCxF3?r&CtqluTMLPk`~=0HoK|HfhxpSx2)w1+#eU^2GF&*(VT`G1Bzioc0{a_&I`*sFgIqSVeqD>ywHMK#Bv1X2^IcLxDd1EKf*Mh=1gdEDjuH~KhWE<icjuNaGR{P}d2npnw(M=3@JymS<XQinTST}KCY4mv0D0jt2#5wJ8?X{>R<?rdX+L2aGf%mNhbu)>pY<Yi$Tts@x5O0C}o(Rp?u6#`mcaxNv_qvl2Hv<CVWSs0|)^A2<r`my`Ae?mCa@kVVKy(o%+C#Zy-)?llx!*~;bj@jdJ`>`!<jrg<CT~P17I_TlSaedU%Fh5{(uzQS(B$EWHK`4i(m<&K*?8ms3n@2tkTQLDR>LyJ93}k{}ngWvruH*&kSfY~y3)}PT0<7%6XazaK0DoSCAp*2(fLTX<S}VZWDZ%+6@?_6JBd8dxbG#9`8BKCGhtYZ2+*~}^R(rEF7zWhh(R}9l@pFL$7Qh&n-W0!;2G5e4O6Sxo@E@3>hyiqC%kY`mX;)<0gs4`qVO2+Ejkt|=O&iGBx7qiLy@6S#;+aj>Ssl@x^4zx*z~N<F*6XE7vsco;QGx;;e<{PC5C`E7!(?!(@D?%#d*FGJ%5zzCsQ_-n9K$q>z@m;uIdc-bTPxY1uURmL5qTrxh9P91y3uZ+=<ga$BNX$<+kxDI$=EQ1js*sCxefM&lO`~n;giQQNSe=t-~#hckFHh_Kz#r+qI@Hzgr-X#BVP#(YH=^Uzrq+yiOMQl4YZsKHoLO9D;5y9d2S{JIIZUTr&(~0oIi}?iCNUtj0GU&l2r|WfF?8b$hNJ=s?~$*8F097br*uVRgrLdbi5iHzi)t`z?Ur!j^!63^#43Q*x#jfqtYcXJl@!7WGY2}h<f0Z^AO{+4M6ni1LViDX|_v4fT+9hfKCL?7v!H;?s$xDk4aTpk<?6rNdR=I!j(X6u8Xl%*Cn;&x>GNVTvzE9T{qMc6OM0Ez;XXNtmkG3Z=R9>l~Bo)lwMQTiD?>bhyDj7^|bx84Wy)uC%v`fd%-l0T+Y!z(-qmLRD(WT*mI%vgmYZ8#hNsn%1Jy)kx(;_LgGsxbeYA1yorKb?Yh-(^;pKe<kMaLsl|WeiEmO+tP<*1p|%li3rDyW)CPBQv)(lJ-|QMT2i8F3Ug2acwHSI6P|?FM0(6=qOY_W>ZDX>aB_w|nd*?7tAUq#89Vlnd*TGWf^dr_|U~F=18P-r_u)|4!RK4kJ0{cDh1{I^+2&7IqihPP+lpl%asKT=BU_z-$bxoR#UR#RLlml^<AnStQt_rl~o)3^lvGX%n&|yl7{BG#M{#3*Q49z=e7WpAU55HqEnuJs(o?ilwCZPxTriG*Z2u5aAd^O)oNIj@+HR$na7ok3rm5RL?ZiBExGQAZYunpg1S*gR0##RD$2f*aqw(ZC5d)Qmw!GHK`vwaVhv0JcG?l8>>Kf&@CP38c-bw~T^ae!XH(5tra@|qs{f(i)piJ=K46?FwHknfT2`FA7K#S{1v0q)FK-EkZW>lJ)agXCjacQQvIxC^F2N^~-(;>N-MCXQslIJm~`Kv-lvIAS-JVX-VoX23-#@Qk#S9swFW#Lah#9uk%L08oXBIwh^5?<dH2bN~bp*OVqrhGUUZpr}n>+_EjMBj{)_NPp(&KJS((uwN0q<jy7*!BiqdFo<X$^LVr#@WTX*V(7bLZ{E{a2Y+qeTaWI@l~;tuE%Vh6@XacZ+iXn8;Tx<59Swyv)ty&UM8)C`*x8RR8i%6LlqT2Uo&sA5JL2jK+)jC4{Kb(uWTxTB?4`T_4KFBd7>aWddP*pp+*LD7T=%7DFMvl0InP((Tv2RaQR-j~EQmN6tci&?#Q6BsyAeQ6u^0v@KEc>S>k@PO@=T2MW;%=~PD#Pap}J+q;gr*ibYd}Ig;VPvmpCZVNBRgpW+3-+5diYw&i6z~B3RZdq^?tF&^n{9&`PH}VCB^*4;vu8SA7aA(ZdR~@U3*9uUmx<EL|j^fQJ1{W|F!g1k0wDC3OpnYYg7tDk(Xseiz)M0zs-h8dDwi0Tl6V^k&e!ilXHTPHC2!^wBeBFwBLnSujh|ER5niSiLBoVnPl}XrK<z7Rg-_OaoGj*4>|T6wN?2^E)3@AoWnve@?=B*?=7p2d_ezb%YRA)(mumPx~1eh?oyC3UT_6!Qg5zZ?{M77JiJ!XOC$8Y$;i($1^Q|u0kdhSW{hF7){^GF|SKtpvt?^Y<xG0W}oheGeGadR!dE&=%Z<KmoG|Qt+M$ARq~mOf{maOY8ecMePW9C{poh=zrEI9?bfri+fL^mo+u7cLgNoiB~52QxUkfzOxjaAZ*s#DWCFw#qV^2OA?9#{R)YsOC_t2=b5w`yBjn^Nf!V6?5Y!@W8yQ0M4UW+6f&cuH15seq1NR6{J~dZ~PWXP>KBH|iOt?bB*)`=ld@}{-C`4+-Ch=VaGKa+!lFP77f4vyxmGjDSekO_L-NE=uym=!Jtsp-<k4t4`Q|?R1SEtNo!X&5IDAP$DrLd&zg4Sx}Tw&V<bc22H2#uZyZJA`XhFmsYqJ_^jie3y}0aokm_KE%E@qKA_-NnN;vr%PWAX(q_%IQC_x8ul~AC5BfFF?I%eDWgLe#Byoq)y+aKsR8(50h{L-@{mZnnxG-cLIMwqQL^Aofk}p3GTeJIetd*B^UU?U-Si2p~;71*)k)lV~fsa?xoPAna1lTD@ag*r|Ye={MX$nVCw7<7jCq3`%I~4FU2n)i}^{HKj4A<X1xOaT(*sibaeovyUYhkSd(r=tbDq0W~qkoT}weAPG%&Z%BOY56$lf`%2HciGw*lv40F4%xm^qf@|y(snCcooeQf<SZT;j|H8O3cxzp3fXDFbIcDqaeHyY(WHXtRs)kJC7+auVB)tf7@5vCczlu=rO@zbx}pWb(WIyP!yVMT~z<5tc8{^S;$-M8AC<sq8fM!y9&jUFP5<dk;*MAmE|^!S4kTU?aKJ&x+IG9rgekH6ar!k+xJn>nwCe=v6AyIJhw2bAUF!ftX7b1duv*0Q(2(6I%k{<yd=1)Y@iibEJKJDnQ(r54lJ4<=gm)|MgrN`lKUxWc@YG>&?d+MLG~O9{_Jtp=%c<xIltl3{p0Cy$!8UlzD0%{Rk_bo=b$6v#)7Zl5<t2k(LVhoKjBVUzp$3V5xRPQvLRI{L6Lyjj*dhwbHjMx6g2|B;uFA9^wotsBv5MR801ZUM^TDeP+fRLpL`!jCr9XKMzcshB#<y8Np(i>oC;bS`G`Y&Hp!);tSgA2E(Gm&y-5d6)Cn2pu*fuQfuC%@`wQu$KfFlc{JWW3hheCF_%LxDGI{;|4Qb|9KGoad7n8?%t7r(%B%|IXL_%3Qw5G54IsBnX5g)`s;(}!*TyeJlWdXeB7nKgQ&m%yEy!K^6SC=?!o@aA4hv9{nsB)`a1`^{a!~t`LO@`!<#q#qy8=w9lSquPkue>Z|}PA_TKNE^f~~?`(1H5Sd*w4z(NhyXv7?#!P*%wpy$JUpeRdm0loAl8j0~dA{P~=j=Vz>JQyV=7~rAzA(?bBL=Z;joQs4(#-fBN>;MDT!0H?+5{F4V4b$L-7u~!Rw@AxCMQMgyG>b#pAnXQFjOWV8r9D_H+?*ed-VN3)ad!t3z*BeK^>r;Lsf&J04AKqOo)`U6D0f+><U7r~m2EM-?FVXV;rX=qN<_hxU?+dAv53%Y3O0!$#=tBI*#6L?1_h-b#9(RC77M!C9>z(wlb4!$<>EXWC{^i}H$j>7UTXa~9`=B`bOVzyxIL&U#;NK`#fhOW@5+PC^Eg0TLm}H%wLzx^KplP;P=L`;AQJUJhRnL+7M|(R<iQ%&uEvv*yh<_3uK1^nPX2gH7`^|exX*h>YrQMb@$WF%gyS3YR_GzCu296rL`IR2ZccBd{I{-7boW+1Od6g?9uTXBKQ59r?iqh_;T6`L_;Y>v|C#&$QOU$f1cDJA>oC2%9f+%Jp5Fgc^~#GOV^q8ld0j-BSsI?|0X5=0W0~rvl$Q7b6!c(?aWz=OYV^FMG-RcU=0F<Hm%C2XM+guAjxiLX=MDzUa7UX@SkW}#tE^=K0(x+-!XP;nPGIR32}`=>KA?wtbe-2_%xdDLQItq{B!(Nrm93EtOQh$^;MmTI>B}Ixm1Njeew91;GMPNjZ4cE(J`neE0yPFM)64@i$}qI~ytFh0B%?S;Mgh-=B8(0{v1|>hGOgVy=;Y##aHAs3z|vuiF{Q&xA|RpDS$K_-_)Kg>ev8s-m{E{|#$JdUZ8M6amdYQnP+IVDOVbR{nG9=by>ev24gvt1$wf0l*mU4^SmmmsPOB(eEg&_I!VI6Tc#v8pA02Vg3A9X2)rW&WcRW4$cFcMnJzef}J^>p8Pvgl*mP-P-mUWWUv#fSBtIH3>VR$_lM7yA3Qe;l_G?Akp3dt`D8=UCzQ)dhIMA4qMZzrDqMQSRn)PK_c<?)kekDqR|H=f|3#mAkF=ycw1KK-Thi{F0yUnz}~d04sqc)inJ$C|Z-ArGZY*8g+vP0Zv}hM@7d9YXOy<&y1;ZHy9B3{(jwqm;Zu2qq_vi>9IHdf4GbJWt_ETEp&`tU$E-mGv8mQ`6A!W^Z9clpwc-d_rEkuIM-$>Un2_YMeDikM$X@vXaIliWTaJlZ?4wqS7Frr_G5{JpNva7X3;9@a%=68ToUo?Z7rn18WgDGW<iBPe&JlKL<8nh<U=ekq=4OG%64PSVG3YVq*!8zhI6vB-dwCcmUlfc5~OB%f7z!t2wnYxd&MC-~pCgz<m-Gb&h(dI&NW`u)%&2m(jJ1&{ik(qaOwHkJTU~D#I^k;jbM!=ibujl96lUe{UXBbLX#HZTlhK8YXBem-2bPBP3hw?OhIn2NaY7A!M%1K=^V9-gqNV%%?as^s7xCImZ**k@p}7-k6z?JtrY0QuyDOAmQtKknpxZFXmhnxeN~hyoh>pF-Ss@!}yDYB5xH~ES3Zx$VL3Ek^u68T7duiNJtGCm_^E9EnOUtlCV`kJo!oqd{-KMfIKPD%LREoX^;}?7*}KWo9og?P4*00og3}$#zuGJX&Da(l_($4NfLSjO+6%zy<O}y4}r+;`|8pXX~As5=f?Kyo!$PMx4-WF=WoU`9a71>Z?c&*hb37|8cYw_X40QY%@Dd)r`>9Ao~Y?d-|Ls#Y!A)2LECboo{O%(??g45o%QwxEonvB<g;Ee0WUY{u~=oa&2aDICcxEcJ*%zA0n00uGQcnZkEc*v%vPQR$hWR!VmG+P9r`#N$A-$<s%8D@DW*rkc>*N+X79~`_~d~s2*^>J;^idK#eC`sZ<67*9|$rENKOEK<N<qz+Lgxw4LONhL14TAC=MrH1STjz+n<Ez;ShE$*$wXOaf>uqbDVWN%K<`o9d>)`c{6AFDMjZQhz}XHWERxNdqjmQ>x_dQl%<BZtX!K0=WMIYjQ5-Xvlm^)A)Onf4f}I75um>X%>xul$1GRT4}xSf4ACX`oK7&nz*Y%H{J^LwJU9a&4I}SrED_ShjVWbEz%IUU)o?-^xvtq{FB~kqeZQq0b(fBY!9-GdSrZq~f&ymM_8yeIhc2&T^&LbyY^+1Z0U%i8O$XQ{7@;#W^lcg3@aF-sRJmgCCsc})b1#xUIbdAec~^>RO?Y~;GXHQIs<EzMzcOqIk}NI{A18R0WUy8MXX7qD9bs}{blxSug}85O!b3Mzey(cMNo0jh<*v&M@@i@&G1#t?x~Y~1oeihO=Bw=J;?-P0mp}ZVIxo5VI8T(2dl-&Br*uS10`V&U>d3X-^Hb4P^aV_07?NF1VdCAh<xIl^@(w1u`8`N*ALG-#3;^q~Ja|h^!Px}{f7h0C5%+f~``KYC@6`u*C8<I|{w3`7<uI$I1a_km_cCt;)rc<CBe_P7Ist;IL0WT=@PEz&p4TfU<PJvp&(bmmniT9+<)WGMI}NL5(Om?fU8=sreyj$FEA<GnJ?ORuxOCCw^+$Qt(c(%{kAf5$VX%|ro1(`?hq#6V@`>lOu8LZfhDtHV)Qe>}g{mSuzL$=@o{m<BBa;QkH532TOFmQl#3;hOH(&_)@o0`3wadSE<xkrvuKGjr9??#gJF)OUS7)i3-SI$ik%x`u7z;n7%svbQVqpp!Gp{)4qLF%@D#v5l3UH!)%|wNrH?6=chtfEzizLc{Wm&aU*3brYvimjd3NI>EueyM>ntGt2+Z1K64TH|;R9B4}dN+8Q34=+F;~@Ec+bSJ$e@)BurK_|6KA{<Cu9Ve)!nEL+SGow7N`!HdZ(I3_7KvId380V*8pg_~FhHj+upH&K9EJJAm^wP#LB|tj=X+m{q?Mom94@X_V3BHe%2!^nU5Ive$)H3tJGdqbHIK}cwYRd2?6L(WHL$!{XrF>GrmFEXde(|CFF$p{^i3Gy$yC0I23L~X;{~Dk3ncV~;|)`;AX;3I;Mq>u1`mv(+Z6tFEH$;<WR$^OFToUtUcI$eiOe5ThNnP=YK~_PUZh}}cs7ip!7_5<Im)uK9HP5mhfk53vcj;aK=aDmfibtJMTlp62_&?GvpDl608U#2Qlomje}SH$N5d>V7V%h3$0~=mR8pN>9a-P0uaaCRRYA=KXHr`{&Kbu?+<k5FxVW@<+-CXW35kM7y?RRpWR4GKHcv0|2>~XxX-G^W-xDQRMO>@s0230)G|>8#h5-|0SAuh2>-lB1Uk*I3uglcc^m91FB-nU@fnv2tAUMac1Mx5-48>q`I5LbTDyX2aT9qejR#Dj;vNdzZE}JxVZn5O2?b#v$3xvsq*1psou4mC91-m;$463W5f-3kSx9|3R4de0WF7GOFaI`_X!uaFD%hK)Hj53^5P=MW-bP7zJViF_I_tK0cr(6dFRZiknLqxuo%7t*|^-Fr;2dNhxfOTO)7G`Uua}exdR)X$_d^oZ>z!WY@N+!Ys0~dJlf#dZ&;QZL-bHO$sJf2g&weR^s2^L)D2gc!CG@e?*DHE8(Ez)@Ep(e;cmwBlGO_S33UO&L&Aeg}o;GKJ^8m}}6DcpPv88t=@IYj%BF5tzqxR6p^fV?T8fliD>`F=&5g9LJj9m-mZ9Y?IXq;rKmS?oYDqSz0*T(XWi0He%!u3bEymg?be?eVH!8pA33Ww47}D5J2x1#84egPD;#47%(OY(HylY#7p;&_(a|y-k&4yac*Zxzk=yIf^gql{>Y{s4{Sdrh&<al;#SER>vLLyOENh0xa03)qBZ!bNnEfu{*M63^*x}T43UN6_9p#=+-75y=J4?r!@65Qg1wdb`@90Czm|Jbr@c+I=KDpmxh6CLSAXOizEoX%YdE7TaA<BF>P82edMboj?SfO1jdR1M+)Ea3fWX}x+sHiD`5y0P57y0BLi8_AE?-Q_E^@uFQAEHQb#jPgyCgIYXOW?woVz&5-ys$KfPre32z{j<n^R|Z(~X4?2MP6hb~60jFDoP1q9}l8EkU%t%G*jM0BLZ?G39mWz2RCK~u9C$?3o9;JQ-Ct6`sF%AFNfpaI(UeF-(%s$g6RWOl#_`STR8lV;v<0z%PeQ!d22!B(J9mNUcErHr>q)w3p!_9U4rF~?Up-Il#FB=|MYOUEv|R}5C|hCQm4D3{4?Nv(J5+1a`p=K*P>Z%75nx3*{@oUU;&hiBptI*L8x-X?cUqiDI;1W1@*f>n~;u+u|$Bg~Qq+lVeQV>c0S@;OE_aVMdyng+tI8gGO=%ZWeRWPucfF^@h+@l`}5%Q_tiB)6Aj0(%qb*6c$fN4)Y%TaETT4Jy;}zP$a$*SF7?JI*eG#Lzps*XN)6^O`69C1d79NyF$PYMiLz$m?j!fe97QQ)MuwUo~`2#;Qb_on^XZn3{o#V)oFY&{ir8CFfUR0%;xPPxDao2ydMr(W9}CepathX?-&;h+_$?DqOj(N1hBP{d0nL-p)~f`=l=pj>J*_@ZI)KU%dISzjLy8urFrwA@GS)^NNsr_;YY$&iK2Kf#0M4$%mu;V|K#ei#0xMzwHYcN9?_S|KVi&^}D_}J~`UkIT6SG6M5#)mG5tuox8x29^PQKeJp<b5iQ?8_D+7KTj!y~Jnp~iLrahgu!D1zb4P+;3*+=3cqUGst253G3tRb|M$MU=S}!}>$9?g~ul;>_Gm;6LhP{1Zb~fzJCbZn&rQ6|69~5BE*xEA0306+$L%K-PhC2Os(1kDhP!$IfbYetZJp0fvZMy>-^%H&~$Dth+-VO-Ap346BKfHTKLs0KD4Oqz^f226eS1eu4p#=ye=OcPn=W_~>sb$3E?qRWxv&rln*Ydc(^WkXk<fGW_zuDXGA1z%=TSB7Nbhp3rZu_W@C<-nYK}i6mKOG(Xaq{u7&wDPg{qY1%!tsrq1c}zPqLIvuq>K*s0EH27wku;jI7L2fKn@2wNea+)m3JugQ>t@%hGpAFN82Ay&$?YMq8dPaVA_KiCG^M*8lRgF3TU$H;ya#-&42LSXvJ^d$!X7(ZelDH0FN&4*r8vVn>2sH=C~n)2MS;J-|p>e6!<gH+sOeUn<!{0#*tEw`hbI;Mig&=ygnT60-@26dvC=4!3mUp0HP%NWpZJ3xWjok@!fd%34^;vIv*jq87zcsc^?sc($u2-b~)=g(fHmQHAHYJk0JC7bPIs=BTof@(*OJ3@kznQou$))&2P-dJJj6Nw0bZCItp+G?1lP*X^`EI+QRTADCBPxUj;Z7>~6tq#EX}FX)s3gjc*;C=c2TTJSkTPpw$w`K;(2#R20aeEgRTkX(^J9M>R*2IYz4m+0rVn9P>2r{V>JmgE@*XO*!lz0iC=@#`pZoFpZNN_gWg3pG~|o6A2vukMGDb^V^t74z*AYb;+Rwn5x9}yIsn8ZcBe|!T7+Q59%lAj(%`kNirOo_!(2Ay(IB&T<`qc1VTSJ+67_u`lCSaF>HjGaWt`Fmt_fdsS}^Xha|MhG<x-!k&<~>#S;9zyg*5pF6VQEV{@1#;nW<(-Xuuz`nyYVkJ&h25fo~@e97suwqaNn{>eqtvYtwAHSDq$qH7qZoMTlUP>R1|%zE?ct*d$4Ld<sYw7P<F19vHw;<bW6_KsP5g3!<w@x{vymXx&uRNV!!vIokOmlU8X@<%u@1&!*kmLugxy(0s+A;z*U$R2h1Zs?{CXb4?aNR0tF_$qfVi-&i|ESIXd*Efib)2VD3m(5JK%D)OVO@YXT9W`TUH7B!%lY+=J`jJ#yFZtnrgz=A4uQjIY7@j=7|8W5v6`yllI*z>D>s($id0x;DGPXiAnCeeo^x6v^yyO^A{R!HkjWb|xc78{u2GvrP3_BO#wQ~|~@CiFVDIkZ=!y>Zrnk5vQAYMpUnnMc-rDo1VxbO0fo<T~}STH4yCu3t^LgX7iNa4#RFbk(ld$}0LOF|knyX;IYLNSWO1#QVOi-mMa)wWx~BBKttOQ~0=#}&1U8veygGIta@@sY{TmRea~Ze)29O3%p+Ed@hy)ff$ra+~l5#w6hmOQEcn3wEg>xP4jY;Jv}6$91)YRV1#KX(#;xG?=#unzag4cD(>5QnL%kA#GdfzOiCe-}P9wl;MK)yFy{_&1ULGa9rdntUN$N&0cc{3clR-;SNSX*O(da!8RTb;){+9)dI;^iC71rpnoCv3=fbuZ5<^E%8v1{0G&Eaf()!kFY95~Hf<dg<h_zy{{#vT&nMzthj_vuCZ8lRw_)=I4Rj$!6knNEvBx2n$TPh5_K*8VC(`C?h8ecAsaat&ThY0l+Y2^(dTfxWUN|XUrS$vuyAS<iv(BnEL1ODR2N?H7;!cin!*1Fj<gcw!pr9YRv_@8uaQamnjiNjC!V}e@CJhDc6mg%vx39!sJ-4?cN%G9#s+j*G6FNs)PsboVQl!O+y+&=Eoa}S(wvTs+l#j)`?c)<0`+<^T4=mmt9318}^9JWz<aB7d7|Z1`&BjuxnY99`k&BYDCa$P1Eoh9UgkbFqHq9m8-^Z7h7P=bc`AJR#rA1So5a^V?JSqSvvXn8sw<qLoiQlpSWf(Bh5<~=z!rm_G>SeEPUTAcKm@LFfMU#?_pk7FKRjnRC-N;LPBzyAu`>EAym(f)-UA`d@-$d=X9|%UMny$uzygOs*eDfY_7H)3t;6xYAatySNhbyLYA8eN?&~!rL(GwFea^XkC>@2L!G{E!Yvmgr-DK_g9UTF8!W&amT{%Ydw3JQP$SW&wFt7ZFFOLpb>ZxY8mLyXDcXD-6ON`U8=D3Pm(OG>?0msoc!0&SU$-0c%_viH6({`+9RFN|$+oqFrXUhE!v^GR%2-LCXPR*67K`tq`S=djdtz=<xm*9NUEEJXv<+HUWEWKJNH=X+}j0{<<*xx2UhcK-nQaOYTgUwcOff4DmbANEfaC&&jcURLFibdGNC9rr;n?(`4IFTaFKCFhkm?P0>ztnbD2TZka3k6pU?26lT_Uh19)5#7M(>ye9v#9ZifBC|$?USFzJr}GVb_|;s96xhszy6Cn`LfGbmdBJsvrz_75Thf884t?6Bys#Rk`A<P{4g;4$-!6r|jUqt(6%te1uGzWoIcJs{_dG05NrX2D&sD??=YTK5M^0UIo|tjnwhh=~_+jQMY|$N1K=~@Tb=3d;;J3cmM!RYMYr<L-%VOd@{P6nS-j3}>Krr~881%%THH$NRd$hfO0{q$E`GAqMZx{+_8m}Zna!KMzP>Z*^lw4O1x^hUgcq(1Uri{gj!=t_T+eaV8Z~c#URj6SFo6`NrL9PX2pXZUmYX4PdjM>y_Y19Rt6}tC5@S-JSDOs@kWD2QFKc)FBLv+Os0{_@Dp2AaC8iXGe#7~!zLCxtb`wOF$+aKPY2x5pOa5r<`SI?qYmlDiXgI3LwGFz!e`OphbwCd&HV$JkqMzxz<1yohr*e}G*N(d}T9lcsv)Rdl-B+f&mx=hchwNMa&h;c!S`tj7oa)7RJWlC{wO(*K)rW9koASDH<$lm_2zxQ7s`euWI{Swk5W%pesQ)L~_HK8S!Dv~L~qP&4tOSrBQbjPl%<r3uLuYh_SUW3VknHFV^w1i3&Aoy!}0_BK5+G$j=XSC(NR>L3puLE`v%xU!o8_*!Q<oY!XKBpb5ir426@{=Q&EKa&6fbGR1)2>T6`yt_BuSC}Nazd$DP&KHP1q45lW^7|eMt}Hv1>4x#de(XNbYo-V>E^S?hP9-}n%7=-jolU(wKccZ1b>xubpx*K7m~u!k^^Dy<_hcHX&W?EoH8a>+NH!xWzlmE&`SMv8vB#U;$P9<Mst6ia({YwnoX^0OghI?NEt+ca3pCmZ_L8kR`#;hm!z>j>Eb;n)sSXp$Ie-Oosw0%-4K0<Vi^f8)S633fD^ZP;j0Rf6k(Gd)3sgM?9UNhp>w;)xUkj4Y~$qbC;j6Sy!-<yygz<h{A#jwD{)?F@|Hrkwv5!;l_08JPqQsYMrCJ>!A|w88WKlujfbyHGwdgiVKcJG-(;hku5{^&Z5;CJ9Y87o*dbnRZt13ea9Os*L4qHY1i2Km&++X~F_<Cw??j4N5#>orqO3A>>HFpYG|tYis>a?vXIsgfD`J*szwjA>GtKK7Ty}eP-BiB!AknL=V892Lmgbnln2g%nym%>t%NT>9C*^Gp^9D}!#Y?lsGxTPmW;X!7Mr#tR)6I(bo-BeUKR&|OO?Jgku+q=VZpTUz3-e*Lkl}etSMs<NQ;oh5Xg+|Uj@=OmMg=_RRo+;RJ(7C`J%o+%#D(B0;ndTmdC65n6ItY9k*6{EHRZrW6%fAzbx6k=P)9uhYynUlECY!!oy8fw)`u6l44vi|=M>2%Vt@8j=EHpDL>i`1br3F$0k1}4)=~nJ9A6|faz{EQ7Ed0};`|?-y?$UxZp1JMkwd*20*F&}uTcX~=qi$I_@upzss4{*QjVz3U8!?N--^E_jyKZnJ+>^=KSOtz{mU`gj0ttDCC>y?XKB6^8OwJTa`7JAo7%>1ezs;uo<3p^NM+Sk$9j6f|33Een=-#0e_ujOnhD!uYZG5IsFm8rZQ0_y2fIzBGW|OcUHvT4zYE@)%;<kF?Bxfeir2+`FWl9(?W72rUAR5Ik?#Kw4*W1>KQfN?{pP<?n33PBnDIvW|CDa5fXQBo)$QV`7tOtiW^jlE-z|rj5ne=@Utg<ARsR21;VR!pb{kxGU+QvDsw(gFK?j899%ytzl=BMfnT93#vkki)SgZHPZw*_9-smrd-10xwb$;kL&R5E+90v<&vYy#RJKgFg^Gi%NOt4?T^towJ94bNZeR_TKBGPNM#I|<oL>bWd-c<OGubVD47wGqfGCm0I@%swDM9HYx6jVX4%QANN=siXICntY5njBMF4O)F&S!v(z?wb5d3mrVeha5b5Z<L_5qMOswRAEjh-<8UmTqxg0SQ`tqiJ}g?V_Kc%{jLVE^fJ~B;1#e9I|bV~An|&j$)W`g`ES-ZRlG0QjB1dGFpVett?rc2T!C`+47$D-?}o(-U+LbLv?~sN6DIcq42?F<)O#-Ibw$1ydZW*lff1o3NavGG2FKBLg743)TuMxDVp7+}r1PPibaBy4IMuE##@lDzah$k;e;$}ncNo}WIENouud~s{w<KQm=oNp{7?fNbg(I69abY?Mf?4s}6VI2I3v<TPBiWO>`pc(#huir({=6&;rZc*yt<5D@7l1(7`bFNMcDr5P<dJr*XVZ%swbx(Ktjq;(zQwmt*$TG&%}fcuu9Dt8U))%yzmu@Qth3|cG9B_S`I<uQv3v(o|9Xaoi>+PFSAB<J2^Kns-7dWkF&xW>@bob}sWh)6A-{YR`a`;KP==-^y(gF6hNjMx;(MOUO`G1mxSat8hx4o%dVMgX{+>yrVoA`I*IXZOl`!=8eihHUO|MeqH$6#8s4P3(es}}|60n|Mn=M~&MephY#0g{@y7|x(ktb-ELl;=V?>-Q$cq4B&E4}MlVIMuC03K-y#N1YUgFiO;14L2xVW56rI4ItPbrH{nN#Npjs5I;&VOS-2kPFRe7?~S*&*-%Y%&His#c3Mqd_vRs<smV<cN~IZ0b2oC0MAq5VE}#~Kw>f<BS#xxcAU>6d<D@W0JS$SHA<-3yO(4w_4cKbOe(*9N!DE9{Y%L_a+&e*N_ks~&a@D2ZGDwSsP*uAthV-!R(U^APw>m&xdUwhl>C%BJgqJ}b&BtHe$<l&b*g8h6BU=`@5Gx9eXmO<8Q(CNS~<l0!4g?jR6|IajDPAE?&E!BSKf_F*D%lV@`n*RQ&)Jw3KbNXJT+c>zIe;sfoLSkH$Ft(CFnieky06k1aAjx#J+>IZtePU5tQEX2exJ`;$ad3m~j%u>0s?1-^T>Zb!OR{_33cPU>qj+mJk*KUon&K24SZT;XG2w=q^+OfIrcX8kBTlj|S=y@@Z=7jA}K#;bY-E<VxpPO5tu98BK$?{-Tw6cHyGo0tOwu@&&Vx!v76ufpFy8A_HH6*l7Y0UxdT&WpRPzFhOvVx@Z;sOJJ<i_!-?uYD+$R((uZj81TjkT8P1m(D#GrUyr~)V!B`%M;Eg6o<Qb>Uc3K)qJG3t'
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
