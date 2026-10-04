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

PAYLOAD = 'c-qx{30vDpw&-7}X1cGWL>4xLblQoNkARcrHUS=(?#acBN48|6#FpHW%+kR7?e8pAQfaXv%iK4UnZ|ahmQ$xroxMu8Yl$CU`mr;=S!;{6U^b89R1Dq3fBvi=%Acd;GW&ipb4U3PH@TPw!|ZnuWnVufQJDRRlI&};7|!Ep<R^Ji>d)rmVCv@u7qRbpK{&}vf*Cv>$I(n&r0LvYpoM(;7Qp?r*E>4)|6KS<`l}myQ$MyvPxXTjPpFCPWbUR2xa!~te#$3Dd;6+%Z{|*Xn?DZciL4O&BR`m@s?ywz6MrBJ`!Hpy?tIw(`(W?G_WSPOXz%ac{S(m<8_hwpN&of3-r;ZE11O6U#}6-qI0~JKpPI(u&hcRXaA$jeKs5|o7>3mk_qPw;FRKlYuo?jK)DI_E8^?Zoxcd=Ww6^jwq2J%2C_}FEHd=(9@16KFcYYDYzS**H0(~ePi+B;5ZahhB;X(Cj5c*cT9}4(~YY{C{=xP>(=8L?7XwWlf7KKq7g~7<QEN&8vvsSM<qA5GVf3X`RzUcA8ZX8E3O-uOKBj58EA|mRD#N3Z(K^l0GA-jzIWHCh`a)NSlm`CnBUBvzXI-M`lPA^`-LP`)i@)K%Z_@mGCFzXarg|craNj<3Mc>XBzeA8H@<Hid>wU1CH9V7PVQ+MPW8q!jL!jIiiY9fK<n6bq?nRT8+K`;r@r1Q?5CK)~vVwlI7k+p_Fk~F41ELd8G0~fh5g}=Ds_`Lyrs+!5nI?qtegJ?*m5uV}@jS+T319?F@7+tvW;OZhs{b`V-on~ue^V!z(pI`i9oEH%y5i6b|n8~Gau8~DP{i`VU5)+=QsmbPNu^30Ofc+XGFL8E*QF;u`{n!j5=Om4R8ut#VA@(~BV5$AMWAyu}Vd0EoruV6T=})1g(-Fp&Az+)UC#ip(@@9cmi-Wm|=uluWJ_gYUhT|>m1+Zb$D88{p=+6AoLMiB}GOUbZ0FHk>hcUSm2Z$v2%Qxk(tH4Vy#1pY;b2I0{4<;8WmRK;U&896jwzedh;le_{85Ck&jE!4_<i2qW0Ngus*vT3YPU2qrOb;dMmndIJcko|Ec|`0*YBvn$Qv^Ht>WtBNPK$Mgi^aoaIL%Qy4z35u0ybqbf+wlMYaCrA1?-l2M}H0fhifmi=3?ZBse2hEFsA3vefSfm)0>wf^pVSZ!DZn2u-rh%!yt`az*rEb{sf*4Z$zuvbhuxIF=EWI&p&Z^++Vl%{F^8-;^_gn+BW&@-ynZn%%{EykIp_bCO%_T)0o2y2jK#@oH3k6qtEIGNC5Q}$D;2F#Tft~u~I;s3+Oaq99x{7TaG)&x#C!|I<qTe2Io1j(BBZH8L?OZ#fJh|?9?~8=Sz1AQV)2oHWge*=*AGs*H-Rb)nc@WV?P`r212L_bWK$Qn`;*b<xS~3<HdA3bJNj<85_s_{*QozY$O{i>>=?VM1_%{X*O7p2#^(2gSK<_;HhYdS7PdircOTU-z1I}bAS||o#}1b=f#S#dxdCNjs@z;DmMC?*aoQLnL7pg9R>JFI2K;yGrTb<8bIV?;zu(d_QnWG=57!>#g1U6T)Tj%e&2g~W;^HbdAo5BC<7oZnmtaJ0YWjkS(-G_l0R007j^(n2uqA}YxRtXB%*n-B@{fWVN8q+n!4BJL7xg)K<w{Py$z!@1ud%3orEOojd|yzx*NqbE#{K=!!!{%8>eeC=(ZfwvYb&A0z(0Lv2WD$H4m=+DY6Re$C*a1XV%mLE*o5;SU7XT8<X3dUEAX390<0x*(8{6h`qSs#5buko{_~9x-LB=<XPv{p%M@`iN*~I&r&zWRl%)OeM-ZCC<;FpH?IU9#5k!S=T;4kNy^2xNR&JfY*ZX+Np&5d>-s7n)p<8m`c({IMc+4sg_~8V<tb~ZrT%SkO}t7ileSLhE2e^YSKK-4$fnJ6lK@9U+J!I3aV+a$l+>>gfVGMH9Ctm9NW1>U5;VY&1F2K+-bv0j&q3o(&Ni5xq3~qLmq2uN5lulxqpU@AQq{9|V*@xfe{XEGmmme$U*JI-)16KW1HbMF=LIM^8gv;fG~NpA@NNQ1z)qdbtztKT3Vk5>>HNH8Aezx*2ck}2G1MCUlzX$5?hC@j3R<OU4~Ee-;){NqHP7Mywg4TFe>Ym^XDuku>34aD1d!^Gey9$S9*gVGz{^F>#>vR#ag)qvftDgEs+j^!AQPX>=4ll)zOg|M8n>*rpnS`<(H9R*^XFxwWk@KGMi1&o`}v{KUVP8dR?RH}K@^1UbU?U)Q9&ip)d8slEbjp5&Mb9;1YIlwnsA8aBv(OtVdhK7+C~1`2@;yN`Ov13`vy4_FAv#X8?35PLEe>Ch?N+@R(tgbkJMAo+DgeIHDPRs;~&LsKB0U2mPfuf^6^-iR%{%*Rd!6t{^|EaIXpMf>>OxBW|ilrF77w972R312-86nPH&2aeC7w~RQw<S^u{LF!nMg<UQQ3a8)(t&Dl#+Yu@B}|#~3d{e-sTHK$;COdfh~%v$=-P+<fei1IvWR+JYw0A|ClAGt-ccDx+M_xr)K&9t>~5l%&}f6?QDqX=`ZwbhP^pz$&e85RM}x??q^y8FO!pzon0Y$FYi@gF@S)-Ii%(pxGt7WfI?wY0v!Q2n*Z&e)81B{bLz64NW%32dh>K=YG(hf*&muD5z~xDKN>U8aF$ren<UZx~E{`Fa^+}QnXEd=*tB`4jsWxOv-v?h6&I|=VT)`l93DiF-5!>8yn3g6{5jkz!U!{tR2E?tUw^z{v_D}jlP$+btcnj$OdfV3Aq+@&JTJ~S@lvKoiQxuMZ2=Bk>XBe;~4Nyu8o4qNu8DHgf;<tN+Z~w?AkyQ$6tP(c!gEuXPK)-{*?0jwWxQzE@42`Wu@jb>39_EgTm!y)v?ZAsPPX4;{h;?Fqub*Z!&<I)p7j(ZMmPZi%TR8vrPxxL_iX-+L~L*7F$iNtX5$F^vJGWgB83S){^fkOiTVN?!>Z1{wVWg$!BG?VG_GHIu_hT8o`tS4~gnRx4TNMGnYrv8^-oG0O>VuC2{FqF@0=yj%BR7u*%U@QsX4!x@9+6tA$w9xI1kP@w^PNlv!mL7=p6O16J)M(PfkNJag_9Vhg4wr>M16X>w+$%7f&>-Pn2#a<rp@G!7RrbB9H}2D$Ag1s$N^{$?RKnz~6MWJJZR547a+Z!D(KWH19nyJ&&=)3Gg{pyOEI|8wk7{7oE?a}OGTt^U~$6FUp7;Ph-{)f|TsNKGK#9Rx@Xgx>cXIRyIW(aQI3^l?C4fO6DdF&5=`i`hIev62ms5{wSG$tVb<40pJ?jt=Y`WKQS-R$)hnu%)p|ZH)_dXB#^VYNK~E_mQ!~3QvQPn+8$1j$jy%YQ67=lk`Fg1k}FdTnc-Sn&+*P3g}m)VUS?YI?z$*MT7U<9^p{O8?|NhA}fMDK_%?823>6(#+w3kygi;ZpV{Kph&~(bCH3yhgB~58R7Wig^8+>qy~ikVGD)BsgmQR_$p8e#L4>B<BJ^n3k_y04H>m<(AQKqV3^tiRkb8kTmgwZb!uBG)04@73T0xF5z@N9Ehyd*xpw>~J)+69-72rG#UD>l=3n~Wd9Ct)+Mw8slK{zR@o685=YHk(=!+=^eTFhN9dMS{=d>G@>o#D5_;AwnQ>YRFo{RgTjVgTLPGJIyXnkAk#C8`yySXEJ3A#S5tkp^=1P4@j_Z=jZ`cxIh;Rz-BHIQQ)saCjLN<$7V#?3MIx6r(`LU&8Rmw1d#XFd3XOyg84-9(bN4@&?ShQ~<YTjzJQHpizgTY;)3fw;rW~zGcQ3gyfBgYKD+~>PowTtiNs4jgZeHYX^J_CS$`4S{5kC#WvUzPMW}QhR>hLAZa!ef(z6?J-S*#0QCWz5&0VlB~)Fq82O{npcePi{VRw-l_;&URYS`eW3x-fUA};5<_%KGz-cwtKh6CK?)+gCP0hTfrYry{7qn^s1SFZMN49M}R;?af&tZpqR(mO^TO|&sN5{*t@%tJGa(vn1@I-zgLjUiR!-HK~H!58L!?TTz+D)bC4^a<0WfEX~wg!kUeE|PhHO*#W2w-&=F3^d<`2zoQiye>A?J+HLE8?25KlOnwRk#wUZ7{&t>R>=(X)u_%K{yyF*`mvaN@BvvO#(RXUI*3O4B;*kVxST#nUd0}%Q`Vlqv_E9fTUhDUo?S~l=7svc0AXgMd5&RG*ETL?Ng{h9|N$tP<z5TuGwNuDo({Do;XjaS%d-YOCWTa#e#bi8M(5$)o=A!#=YdzUH+-Xf1{~qQc$cE>Q|w*5t)S}GzGQ6olLDaje~c)hRuOBV7XT~8A~mO-ULMSFbDyi=E%}KGezB)G-wIQ-^AVo#_@&gq0xbScCrqdI;S7890O&OW6Q9HA_WU422yor^C{SS?hOh?X$T}vF^YVKUz8t-=BUE5>|jE!Np(${j9y!^(1ZhVr6B8);I0a^W}Xk=Mv?ObH0U59L4G%M!9Ep{07df-nuT6~(8KRYjHUrqi58czN8`W+eAB{_J%W*06<^J42`L9PQ-dC#wGrxbSt+;8&<w&3N%dBAz&d<~d8H0JDqAt=9RQPa+q9oG@4>ddga7c?X7e5@W4EBC++ms%euCyPnl1o(>yGT|v5#KBz%93MvzjjYf^rD6iJ=N51$7B5;P0X5dUqp~#Z&ka0`AN=?Qs+c>kWKSgJfe^cQQx8zw>88a&%IsqT0d#CXQvm*uO?|AjmTw9I+e8uvqHHbJ#`5@QkF89sv?OK;t_>4~fcr0H^{*osw43_v2?49RLBuHKR$B;+UrtC~DIex2TKj2s-ZflP4VAXKR@P`z6*(?rhp3m`a2Q1{UpM9*@=oewct!41Krk&3pRl;IGYl>**c2^77EQWxn|VzFEa_>y-&Pe2vziqao*}y7Ov=s94?sJNwZ^<4_cu(&TE~Q=lthM_hf0+bQddzc@07%rqRCy_6N8;svEOLvb!bM=@oSyQ+tY>%JDvCGaRF=X#2rD~jzZO6{+K1`);mH8FLE7$2XxHv-5h5<?%^Cn$TUU1DxumWh$v%!bj_DF|3ORJ-UnoN=0wPAuk|U}pW}5(g#vNS?yS9Qa<w0)QXfd9EmM1j~AZ)O7|88t3#CTIqBLTN&xAKypuPNoiOC>AUPhDC0=sJST-mETJM<?g)7%m>8)^5`g9`N3bl(?wNyPJOvS_SeN>p6SRuWsP?GewAd`qL(b@6Ad<_AR?8g4>?;gGPh!Ey6M9QQQ%KSvjP3xhVKl=W8D^TWV8FoRyV#%kB&n>sKNrX?VIdcH9!MqXp&*i+m_?-lMheH10+|Se5S5k%*tJI{hKvm?h8P$)`$xZj)n7E5qh<p?#^dv+v@W(}cGTm!meN+*F%;`kU0WF7-pVkqGesbryU~1nHwx#U?ub}H6od7nCY1M4XK!VTl2t3&qrlxibCJK{m!cp2{;*4Q+q^&9Zv2ni_^a9Y<@~nQx`!u<h-I$sHO1|}dFivUahb76bQi)l;w^`G9yaN(8{yt_-dN5P+MVtljIXw;J91H?d%+|sloi#IFIjheNtdo@iE?w4HO_CJ+s~h27&l+7n#GbxT(VT9<(j*JH*kwtAE456K*bBd-24lmG>uPg2wG<(#;AtUw;7-q^tNFfOyN7&v!52>1^%7FU)VK(3l#7EY#5`#l`ilzj4rvr^Z%kRm;p<syJgEnm=;*@n;8?*c8o?(CQD@CglFrG^X%8%8DQ%CDHm=uGqJ3=vYX%+=B)6f%^&bUezV>HTP~_Zd6qH&(q83yBCJVo5>`IjIJZ<o_^w5siQ_Sn&*ampzrvq$GLEuz%&gzdb4=;M=5{_9@CafOW2$TX^s({Ntnrgq7RY2nai?d`&e5G=G@EVuzfsFuumLgZtvX7>-kyT~U2U$wMwsRVQ%ccj<ELNSKYeKbbYfJZfr=2v#;uzFeeV{V-8Y(>#Ubjv1;6<>wT=OF;1`TOB5M{x9sZzvh5?#H9d_n3!y`Mq!{2QMVMl)2^*gVFf6!&`4bo_UA5aEN@vM1HelB2-nZ&c}JcJw&xqy}JED^1?!2FK^8Yh8=iRW3UXuzI_ntrLp42;yNR=u%h$iBcl5Bw`kPDrA#L;0;)aH){>O0XLwK$J%TQw)Z|WI=8f&1e#6m}C}_A#ML%oB}y2(e{6LeE0!)!7y;cHds2JuVCjjl4&sOhsUP}U?rxF3D_8mIq`x2`md~noRQP1XxxZKBa9mIcLPus&A_zr5;4C4H80#$pN%;%s(k7&>*B8l7~G{2Kb(kpGzT*~ZY<IOl*w^~2{oSo$-P`OMrgH<+{Osa_A!P{z@Pva<C$p0W3hhe#_Q8yxDGI{qm_}YKk0{m93KC+yLT+0blwkl4v#*H+#Mpa(@h9TI?$eA{q=r$deS`>&$qTVpS9_4KkOd-E{;C-emy+cJv`|BalF^-zWvzi?i}uRJ1zO-^x*C3yLa8=?k*G^emENRem(AP?+*6&KJ4{6Er8?0t~l$jNmTV=q55kyVg^uu?VJ}7tk*ecfliv>0=mgfI1=MUNPY^;AJ|6{JRHR)sC<EY8c*BkCl101C!}DcDKB9PJH+TEY<vzEh@&`~1&RO44R2nHTcl;6q9nyVH3u6%C1WCt@Ng0NHT!G1uj}-9zrSXQyE~Ww9=&R>uWN}ZZFFW~q^7_2GVhn-d8;}l2U^yxY>PQgKTuN(4=F`gBJ{5WdwMI4MTq)_zeyWn44WkeZ4-Lbpr9CZG@Y`&1zl|qqd48kN=?0Tey9mVtn|&AAX+-FwSF8IdqBy$ff0Fb4}yzvs=89aLg>rAa>0Tc`>1&+WZSAXNH`y;!)pTyFeC;<q8`Y&Nn6~)Gd-l(U&Gqvpdyl2AyCy8|CAxBA8!ex_x}|4S?{PHwgq~B9VVM#d}H1UJ#Nt!irARQ$Q|C!=&g_h)z*pb-pYnaf=TECv1<6^B3a{}@h2BvVa<s?SC{{vnG+aAP85g07}2{5)63ccyGj?y{XbQ&ycjZ2!3&YqMWmU9;i(=_BhE9D`A$lNi61~*_tzL#U<X4rdR`D3vQkNMAdP3sT_x&c1PA~}M>^4S3!^4zLuC_IG!6JF%3Oee9^5Nmct(X&Sb9amlCHTA=;0pyr&S*FIQCM@N+diI!!_*6*2soA(#utFY-hyuWf0v;GHfd+%N=}~PG4r4h-xDrh<iDK$_6gd%mXt@F~0S(urxU&qsWg(KF^54Ob$P>Yz?X+t=%c;<l>IdY!Rk!=`cnZ*LUL(Na$=HTq7qw7aO71pxg@HC`dtL7t{hzm|+w)R1n!hZoy~nOw&h?BCMtL#*tYY2mn}N%VvbI>A>r-%2h>~RuZ;aRALbZDL#GVX<C(ma?C|NXqlL*4+nqlxOxWWnB_bh90P{BKEuJqjhc4<T)0!SlxVY~>0F*Kj)Lnxs82tNXD{rnreU4QxF4QzdiKKED&#lN@aPUpK*>zL+t4j%qh|EhM*a9we_X5_e=k7=^o!=sU$>fevj9jH05C*B>J;*$z9S@C>~UBPf(wR10)&tbWJKr7A$aGGT(Owp(9o|od8AWUY=`cHAh=^t?Xs+_fC5wA_a#X9`oWz<wm|p5LgcZbhX7tiy~*gp_ZGl720+3C4vS1{pr+FVBz4i1bY>u$WH5!2Tk*FFs$>O~fXR7XO!!+U6ti*|td)xsMgx$#h$kQvj;VZC8hwB~DR4d*2mZ8%OQ^K?+U_^krSoTfqq*@M8TdxCy|K~Wcu~Z|VaY{HbP@-yK(2|zvA2tzW^OpyeODa<$KG4b<|ce@Y`@*v?Y?{e>)wC=ra2AbN{(VFld(eA@tL7{0+0j^4JPA(rqWSB%@DdqtJ!F7_SE#HQ{#b73XTNo>cJUTS5GEB4A6@HPE@nmT5oR9l9q%`HtR<wG-T2di&cie9My<H47)n1W(njm^{i4MqK?5W%<3Ir_Se+MeLIkwc;H{7vO5mOk)fjCl`IN9W#`zR#6Ys|_TC+ePcHBRpL`w(9`+6|7Bg44(-bvmAV@GXkxu}9WPvb-dLWNk7;+M~g1~qOP#jI&5X=*RwmS_b!7!Kx=?yB$sBQGu9A_PKV}S{;gW|NFHFIX460}2seMrwaZ$W*$r&Oq-`0P!js6U=szcvldfm4yL4;)b33ooO9&S8-5`%+B==x<4LADPk#^Hnq{kZgtlTDLDLBNPU<3NYdadhX%DIRI%GSyy9;kT&Xg6m<lJIJbH@L4dqKtd{1s3Twi*q@1=X)gC62$jdLdfEE-mt2AX0_AXkF`RY4}bkI=)#sMH$+nWw-6Muw$fxxq+*U($|w55s_{Xd~n6i?hxnzyiVQHd=TRhsbhWM%&0)Kp_x!7dsX42Lu-4j;vso7-Q@fwNH|PDYq)5l-4<0*L#%COmXq<(H~9o$ONBRF-d6kX2JFi5Yr2shetPP;WmwSB81XX5`geLYF`MpgJ#D&YX8c$UO>1pA$-Xmq5J9zB+Pk_q;^36@9@bG7Pz0&S2v0^VOS%2MjQy0ygXKejI>Y^yr)`z<MGNGLd~fzrd)<+Ui}z{awm_c9_aL)dAi}s!))B$@cnknAK9kcB7KPW!4C)5nZT9a*Z67QHyb1tvPV`KNmjF>x~m|2czs~VHtgm3wFwU(aiQc4Xb9+UIw6DsJ_D{VGYEkdIZ@XbXx&jTDw{OQC4-dypoioz=cK_MIipB=&{zfq~U<vOWCZ;tX8G<ko!JyBk7r>s<<6LNE^AMqt#(2f4<}DiGSwCpUD+z<Z+Z6P=vf_v_Og4=HI*Wr)}g{Cn0%{$dctwEKHDZtrW96E(op!JxMgjNO%EdN}xv_3llKR+&pnuBlRqQfyc5H;6(YFih3P*v;uD&ijS5TNfaYCvTC8MrVYsC!Pm6Q9THT%>`l>X>OQ-6ox{#H49a;fuNpOUZ!kL?{j!eZAo+dUDjjiub<6antF#0@p($ts$*Tc{Nxoy==qy|c5ynMkw(^m8iCQh5mh%M-V?|ULAXArUj?yegX8tgyj*oUQX8^Mu-7iPdqo4pBF0Ynjk!rSzM~GQ3L_NEpP@<acUz3KKIXR2cTWLmiQ3I0_Sl-ldK>kcq)p&w89_0}ee(D6tyCB4qK76zvSCZS~g=_c=IP`_%4il~*8e9<LSsB>|6Y!f(6aTd=HMLA-lyMR_#%N)u+FGkb>JJISGay4X$8!e{rkW<^+EZXfIw4(0X;zj)bm#BzsT@;Q80HmdURgU(=9aYx@T?SpgnDoqrS25KX=*@fRFCIb=?Qu?%)(<4jn#ClqL)~u;mOsJ^_}V}$#qf{)Ld{TmBr&6Jbc96R~C<p3ya5XRxh5AD0tebwp2i7_;BWn<RY68U{afg#3b%}q68~<5$7G?i9Avbv_7R`z(m=W;M`YweqHXDefaC^^0;8~Ihf;3V9^v~E^3j0agM<PaWS|8#h`OI(jzTOs2~q@c~4ffqM|xvYwC_&RB7x?W64f0vPJ?L2$Kt~eW5#C&%8s58?}fSR9ATgRq#Wm-|cxC#-q<|wkmOO)Ir+9_~XJ&lkNGOk_A{j#Yj53F)6EFWrd58>$yovoKvm?f+{ERrY5*m$%;TYv-$<O@Pm{K55T%Kw*eC$k_9mKAT2=mLpB`g9H0v4B?T4Xfq`?pc(CL3T(s;M%S*vJAUs}BCamXregPI-<_E^%v<{wH%+W`@$WA2D%tc9%f-G|r0g@)6^HQFV>9qldWYS>bCThIGAS7_JF=PM+cgPXyk946SW|#yNH3ssg*dS%#hMB!0CcuFl+73mj#f~EuUDCP2o-B5t7-8i3Z7x~IaM~y}UTPP)CWU(VTYLOiFOA_8{W91^#*~p+--0$`B>vpU90qOn2R46cY-||Po6tt@_PtG&BfM0zRJqk$QaOw+tCd@o$|y2$hNgjeJd{5Mh*rl(*t?MsqXI10rqy}Pcym18pR+r%q6|0*keY8|5;1T)Jj7&^k6zQ!>@%ABIf*wOKfQ{|<C9As;W`SgA3M1H%g;3f*@V2pa2K)ff0qGU&$enO$79;G68gwjaTHFZXoQUw0ge>D<&}Ji;LIxq;a0-nFPrcS%f=04y?mfz>z8M;=6w!L7?C)dV@#Qs8MOsaPFXu;I19L_>;CMPbtJseNs`y|=Dm$2t@CqUejYj>xim(CVHRMRGu~j+n{OSo)g+=LDQ<6Ag(+hiVE~ev)kw~yQwIT+Kz<zdacZEfJiG!m&^GT2sL@sh<4VA@ea>`UB!HbHb%#@6iXN+S0p7Lp2nuCBGkiRkaUWClylzLklFSvG<0~<4i(VOG{F>*bWf$Em28(vX9#u+|%jC8o*4x!YM_r8bfMn<!Qb6)4crAp}HVzl?OdLT+k!#%B<c_IjE%zD&31ZAuh|?Q(dI)!f>8GF@(Zw+ACW4(j!AK@r5=yJ7A?&j9M#!_A=(9~4NKP1w@N*blg+#I}(~&?jeM#nm){$;SKO}O*D@3%_Xx`JHGQ;J|+i!e*`)s+R^umt~y`y`5{+U0oe$rnuW=51Wj6R~a6IC2}9d$WSp`t~i6vpJMhR(=Xl_<5dNVg1AJy2o99$IADN`xWj{3=W!tt0=bA8HZeDPCed+V;tmayr9TBecF57qnvutTJ4gu1B5>C;4-Vdfv`)ce~dWhsWZ$d$hm3(-rSd4|aNchX-Q57{WerDqazC4}bP=%sGD-GVpuc?VTPUoUjuHFDgIXe%}=^j@bL~;k38?cE2l5ddGV^J#o_Q2|j`_koRHFCj;1$F5U>UeIkDR5jEdG_Ikh4Exu4<o^<!S&=U9pSa1X7+>s#I!Z`Z}9)yv{eT<1=VJnX_5;-YK>t$#Aq$~dTwR<3MnlQm=*gFtrYr}4BLd%0)x^36=Kmc}(tt~_JuyV2((#2dh)amX+7oO-sRUAlA^0m6i@1bFub_)#k9zT)ekVS>JEy1rBvj2nA{e2pOdZ%f?O8)pG#aX^$=_(E_Kp;6E(X+Z(P=HJ=Bj!mC^L3n0=M!AZlkU#x@m}wv*zLaCJLn#-TuWO*qSkb`yR*N2+(i`mm&>3efRdk%5C7<WJnFK|1-d^bqsJWI$ViZAO)DC4ialp^um>mzVP_9ytOuvaiM!-*pwmnMU0ZpF0xzLDXXjY9eSEzA@$9_a<|3*A#0RQ9uu(#fG|>1QqMt*PUgzKOkV5u@@0!Vfvn8iJSF(w*kOMrr!1Fv_VQy0W1)bxD6dovi+kL-xpi$rxpts&3BAX~^CB~6bkGp__jz$#kfV@tRc7f1n$h~*s;IId!r$CfMzf3NSj=^vdOua!g{Di?>BUy})+ze(yw!Gf~K51%Uc3Y42l4yMIof^Wwlo`Dp1Kk3^{m4@RpmhJfchbxEackwY!1#?gQ(DbUO{)VVprZh1z+R{?m<H+nC@l<kicJ1S?JFOrg552djd=B%FJZ)pzVWSt^IVh^k%vyI05lrn1c;nYV2K<#WU_%SmJ}lCcm`@TU0}3YkS?uKG%-&D@7vFf58hFH2>qyg40Q4VH@@p#21yj(46dbO`Psxf$dJJC|M<=kGrQfA_)r7+P@5b|fT>bkzul%IL`~_>%{M-5&j;lbbVon9tt1%^O+2w|VY+eb-VEHy!~{Y=Jl+Ln_V%Md?=cucym2(PVi$P{cBvDe#D^rb(lk2NnURorSi}<iovc7{mp12f1Y>iU#=*=SMefv3@H(MOa*x?KU>+1|ynbz9F_4X6S@<VoO{;n;xYe-BN{FszoMMhuaX`ub@-eH;%eUBNZF4pY&2uO>&`Pn?Udst&?}Vi%Fb!=HU%hT&Nl_|5)m>mKdmub{Ndc-ne}n^5(5MP)F;Z?+J2KD=F;;a!`sje~+N|q<hR}J1lo)`6uX6V?d)Pl=zEsA&ZXni9r(`m&nwhSZe-&!#0+CBQs>jgdoXi?daw5~{M^bII<cI$&jDMWDjWM0Ue*WzK$0cx-e9lqfWZ!D9b8*4s(HqZCSqsr%sy=<yX)by2nqxrKC#Z+k&Vaqy*_~q=R4YX?ST3;FCdAy}6D&W;AcxMwEVB063S^tWUPxA&LkkI|qRxb9cX>v~Afah2nG(m7u`z5y+&7+|z?VzdESxg!W^5b}s@F(%*_m2|d=!ZbGRZNEg=9%tw|j&}MjddMQm#;skCZNI_*bt<-BIYoM<zd8sbzh+lI2P$T_;nt6b$**Ei^pxZNeKUlY~1gg|be@*rkBr_C=Y4_b?V7SH%)mk+@nVo%9Q3VBRK3)-q7(^%9s!%q|^=q;0AD+KOd)*J0jLgbUX13Yon-pQ{^Iagocg@&Gk8JM|qX_%hvxI~W07V`jVyW;~v06)hR61(Gilu?|8`|3caf50E#Rj*<jr$9Px(FGm5iq@YE*X$QNu$#hVVcM5#{69~LC;Jc&ngh50;N!r|o&1aqIq<I)!nO1J&(3Z$Dy!H-Gy2m}K^VP!)=4@h?wwbNy+|Kj`n>{@?a8x&#=C7vseS813dtz3%s!fpCy3PU0eV(|JVcf9m420}8016cJLl@S_$`ek%%FxKWQy0jq4mEBl$WlZ*eeXcAziMu8fs<sJ!DTl8MJjZLw2qEJdZb8;6MK!yI2qYz;BBAm5GkLC{q2*Ujr~ALZUc+`!^5MDX5Qg^^PCP%7Gt?Q?_XOgC9_r_C30R;l*A>`r3H;ql@KhQL8rOI`;hn&xLj5vKksEUP*^nO34u=O%hMcyJWCnVdpkl}OMGiJlwrU~OArw>3VXY#tJj^XdZEz`VlrndB}qy$f_fp@Rn~d{bt5<SknG9p?<H2JSwvSwb@_%sd>yrCejpg3thyRY^6re4^UZp!Xt<fWgA-jg%Q4V89<G=zJkVWcK+`d?M^{Wi$%P*!wKLZ?6CaOa&iyoqCEKh{c&Xk~<^5mG`OAs7j}QP1z$3Z)znZsyHD_0j|2lTeGsKu2er7EEs~C889|^gNxTMf~d5Lw$BG8t}$ldOV-rk3<_@Bdrt}wRAb?UC4xY6LqT}&gxYPY2qvP=Yu(-)WBoxoDl0VldFSR1smuoMkYYrB2$k#_>AJl|VN5cux_&fUH3_Xmft4|h(K_qB6;_{U)9@bsXkc7lBH>UEhPN$2SH-boi2<4*U8{PHVysoZ&mo%S%{YTEa5`psF8l*a?QL;|e6D>oTT{E%(|^YqBYQew_!I+0neK(8*<W2f^C`|zuGAyQ!d9@JU4U0}jCAI$Tw13X<hF>FZ(wmS4_lkmc7nC3qN!8!B?6#5=e=-bEx)L+3dHFM3*e9zftsqCJI`6;pR8s_;JcEdT~%kYs=7o8_&TsLh4ObmPnvBDNzrvj9(f?LPk-w%K5ifz=J4!$O=MX@X<&ZE<}`+GaK8v?=Lz5D2iL2VXi`2KkNpa=W2yK{<>v~L&+Xc}+#L2`+ssb7h=4k)><7<A>3X#P~XkWCqj6Gz8;AGVJ_ir=~)?J`rt3O1$tk%L?d#J<cTgXR9q&KR?<)554rJS%jMuJ48`#!|fC@sr89GX0e5vkcMY76ksWWjuwat|SOQ%88%u^?{nRdHNSdE4NSgdxAE^3b^Zc-&fBfUzY;RWrbGFk}_MVM)A-KPqggi;9^bn<c(_AxeBPNX4o&q&7%-l;5vG>BC9DpDR7*JNOhH*Q){6h0v0m>De6VD0hR-FwJTGIb89kDCpRS+vjr&#NJaMc>A~LrIqjM?0`^Nti-g^GnM`@>aIOh0xfGF185ZRYG#X+sP>k+mFwk-dGWM54Jr1rxWx-5~;*PY0N)#aYD|rINh(GFSRIy_;<-bPFANj8ZdJxR%@eMYhfq%*MD;Ru97OaZbXA$z=F-#UGU17lXa+YaVIh_3v^ROR9*7j;bsc29YsFel;Kapl^V@F1R_<9A~*xLG~^~;Nmjg1$ZzdSRn6+KqG_Ofg2Hox<zzOBai%cQF-a7Dk6WR8{`2zxglvF@#=K~u#kV`8OUNW4@UJ?8*Ds=roke==G8EBf20@2^$tPY+MCs#T6jXLt%Ig9s3gBu(m#nLFExUbgCz)b=M`yb}@)Nouz2Y^$$RvTC~>pbt^3BEh9na|H=-;ubG_Ss;=itdnE9v@5Fp8KO&cZs!>nwwjo2^#0!Kp7ikY52*0r<bD3DPS-8Pd8Nu*2;JH;QfrrjsCG5Ywip?eoz(_A)w6O)9KAIzzJkWEpFaa*WSPIoMmJsI(iPh{;=8$lD*)I5-WhD^s=j|&)Wm^<9~Kz7WV0{vZ5k1%A=&R(vRDyjNlKz9GIZ|y?hqu-&abM*-T`M@$($?NEWiBBX9UhQud9FA?o?${@!o@2ukr{5-oLao#~j9Flx_3swG1v}42GT*%^cnvIMr9L&B~skH#O9|0r0gXQ-6K7n5F@~cZ8tHj*sxoZEf)rtn|yG+p(0y!uv2>y5ZTRD|lS;sfJ$&G#|iF$L<IOqXZuGDz5^@9?89e9>Usq;!<!GbL!~ayx^*#i7a!m$kQ17+E>^_B@n*@bx6k=P)9WZYza^tECY@(n@1_VCV>~Z2%Y8^=M>30V*llZ%!m2PiPTJ^>>ykk1AZKdSt|)h?)W^Rkvq~cv3&A)7Uw^7_WFS(X^3GEB7^#I2%w#+dyQ&<LRXR8hR>U;Hr0P9Cgq6g+?6_a^sV??;dmq2-eJu`{WElj*}oi<^_Wn{TCz+qb(ZE!k+Isckc;=AZE734+1Z*MdHRSwAf;7T9qZ`@|NGd>Zp!?2{Cx>AX)0`owM~3+lU8aQw?&Qf9`rVq%JlC*bk(y&|1Nl|Q=|XAu$LW-%HQ?#y>M4C+er}AyKp;vBi;WW9C$&(eq<c&`_2DRVMcyWRmz6)f0S%2fyrKp$Lqy2H(a<=P2mt=l=`G23pb?9udfxQD*ykhaFyAS?HbqJm%1F3sLDEh&;g;j2Wp)V#k|65reT5qY=gA}YxUvey<yAH8~vq_TlS~C&JP{O`AS}u;b19ERx`WE(k&aAU!t;Mg8h<BpQ#4<p%Mh&qt{_BBfUmLY-^`Zlmd<Kp@Z-E`p!agfqri&<AdPtjq{~KM$IOt3VIKXvAajF{5a_K{%+JcrnDNg`ns^vzTe%|`InYDc!m!-c=X;VLF<ujPD>Mo8J&DrDyws$d>dhHER`mTI`EEZb(Z(LD!|gqSXF=@fo-r9Y~zsF>!HSrmN?|US>lxOzQh>SAQ3?lP5E2ZDWSOn<?0!9eJ|b(ix<Aqy)Q{y9R4Ou?gutB>Nqp^rJy%|cw*>|K3fJxgknEgOw*U@#l`rhWPBfX;ZkCHsfoHaCVy#me$foQsaRcGjJMC?8<7XTH}OrVJM?WaT)>aC)7og_>&LD-^zN)#1VSzfgON>*xG<Ue{ycw!fa}T2g*oHtsq9Hz{pHcU!_DmFS#F9i;ih}qnp|>q0SJ_>Uu7L?x7%e+o@&>6*1Z8udy@>!%3Si=LVTf%tzgSuauUl|xZ|D1`Hgk@%f7VNk?**;Oh^3dp|_RW+SPpJmxC2xp>x>H!i&a&v3v+mpTUz-^C}Xu%QvAvdTlxK(1c$(%x__rXG-zqo5iMeFE!gv0fWOuS`WQGm{EO!n^Dpv=*nxZkGDz~`YUwuXLYZ#moH6`lu%lBy8ZAN7$jglyEa?CDTZEq1Bes2ZRqAhSA?!0D~B$yg5O;rSn*EYZdQ1QtinFOahL;Gh`Fui27hew2e6{{!$AGMbWpqr>mphRlfcF6P-)nw!mtYP;4U<0L1=E^J)_qqY*w{l8l0w~&L`B3UmOy%d&dC?7SI)N3*dPwJPg3^1BgxD$GD>nP&+0I;Ni(q0JWEx)N-iGYfNM<^&*o3Pb$91MAm%7t4!iWIN*(sSIXOxbtXA;YwD{sLaB$>V>PvxAIkfII)Y!W%N=M7p!lbh;YoSfsZ)H_-qVg$s1rRKov66Tf2Zzj=(%lv!8s3aWf1cRb7WOf4Iz0l{;6KLkN1^bxi<s4hIxUPKa9|s`iK{-P(hB#Gvlr6iTB(cutuVM<1}<HLGGbNN@W-lyzQ^i_U*5=E7y+;zwo*&&^03w4dVd7jN%|l`fK;l5AwHj%igR`heHPAAjY?ZFcbKSnS3`0TU7`bp-M&{KqUb96aA<_Nf-8LpdRBsO-y~GT6J&uSUL~6(%F?#Xf5ML)8MVXXl0RJ3{Y_ag^phNg4svG{|2-`IP%47zNbKJ)q#jF!r}L_41nY?L2#N3P%HYEz*wd6bGnh#mizE|%`1B%z#AuMAqFo3&-257Jp%uT=z?V&UC7dV0+|<j?f(A(K`pHb'
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
    if 'auto_settlement_process_exact_fifo' in old_function:
        print('OCR local e regras FIFO ja instalados. Nenhuma alteracao realizada.')
        return
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
