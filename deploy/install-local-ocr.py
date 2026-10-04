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

PAYLOAD = 'c-qx{+jiSVw&1T++{po8gAgfMjzgRFk|o;Fi7aU(Dv1xJW`hJs!6pF)0CkC^S@SEi<_FI6yv$nNKQ{YP1r#o%<ja}qc6TJQP_=8<u3h_H(9NU7k1zb#nO{F@i$}q19>u8`x{3en>1imxj*^S)^ZCpj<zL+7d>Rb1??IG({Fp>x_9aTPkI7;<kE4;F<V~qRn~#I3pEsPxzUu|yByS03@OT_YGjX1#bBB=@^648u_vc>k@W}sT;V0?OZs<+@*cLqn2Ol2O5D8@Nrii!#a0p-Jlf&IT)w(-#C%(<U4(5sM5c?xPn5U}K+>H}|ARA9%$<*C>zxDfI_x;wp?%;6u_wL@Y=!o^^pxLDVPQ%{8FWr4;ixS5VFM>D<or#~C#=-W{VDDgiYi~e33|kn6bsFw%?Y~>r8y;adK<0@bPOvx5{pMij1B_^G=5qqvU!W-?uJa~Zgr4sm`!jcb9>u=dvTy;X&^Q+HA~fB2lGwt7?$aRjt@dds;2-Wqv`7KeEC|i#c?Z#;XU;4NqcjSGk!e{xBp7F-UUo!N0>Xc>8zjEy@xyK$M=>o+_*Wy}^A{o_?uf+Pk7q#|c#$DN#(uJxA`&@6IXTWFcb+a{e*i$|i?q{=7qF2Mg^v6Uz0Up7CwiCxg;Ak|?IfuO-5k#!MV@aOi*($04y5)G%cNt({(S0=d_yBz3Rw8DJ4#Jtu$(fsm?yK&GiV4VL7H^ly3-`1Ct?ii=o{H+m?TMKf?>hdG9I|ejVb)Z9mmfNfT?;WGwUoPHBX`unPzx`Q#3{hh9>fYbTB%1<H6;5kowagNjuHf`o`1EXFopw$v7(#L=sj!K{S&K<4j|VeEFAA>?I~VS4)$_`>_~Dv4Ha$qAYQCf>C+|!~NI{BIh`bfg5)ZXduF!2C&tB+%Zm1Q^Ud)#mw(h|H7X_OQ$1@O+&yjS5H#^D&@lhyA}s?6Um{_VtNds5lqKN+6&;orcr!ti_o3<rHxY9Q)k#2B>)`%Y7TQU5C@nf_|rG#x68mw&&6Z0Ve>HO+z%$_DYjU!sEwvA);BjLo8iU++zbn`CdS4MVsh8G0R--xIh<q-2`6zceCCG|_e+wm<U9B;<2+*aBDWic^D%;xeA#C*p3!Dq;%4zQ8BKGNj)SW~vVcRGjNnPC=o&|tNrAd$*>U;^|A%`owBcgphpBrJB`~Mw&wcn2rqk;eBJ@$pd%;EE`LNx<$ipCwU7%PHrv3z;4X;J3*>o7Lq8JJ0*ypb}J)W<dJN{0b81eD|UG12B@~=@oF6L9;gh%~POo>m})ima?!a=yeBWDb!(dd)<0vbSl#JT9RB5{TQXsi?n=K?uRn8z0VGs|)3xK^A?c4u*g!r&}N7T^t0n~{hGRD5WF%}#xjAz!#t(0U+iwWZ)j0vJOq-&=Wh)rip|j{R_i6bPXw@HKS}Z0=p0ln<rvj2F}C%uPq<W^5dto_-HB$Y!#!!!9!aepHwVhGvrmi2z+eJ?J=R51xpYcqyiSXzJ{v{!QX&F$YZXSzjO1J}Y*N-Ag3Haw-rct2pQ{VhgZ}XYLgEcNE}nqOtHIpYe^s&;TYE6F-{ya5hHJGIxX6DFT9(a_<76PEWljecL&M-#6=bKr%qmqSfPa86i}Y8>K}PFZpAoc;N)#g0RInvsSN&SR$GiM?%Ac2F4`FV5oalp7e>34J7^^1Z^0lDOgbja1xUY8q3ZHfg8oNES8e^#WWE)8<%S{>b9KIvYb&Af<OU%v1io4ng>_@6h#HXai)>$nKivY$_5vx7W!^@ZSt7@l`XE%fMHu3O~Uz_#ETnFe3O9jiY#8xRp}uS&pNA4m4LcQG-*(Hmbx+S3Lc&6Q<?@;QTVBNcqQ_n#>oUZvub!uaxRWVrsRp>pyEtRy6XsC)pr4{&ZnUQR|$X>u&;><*Q-d&OV&tB@NIELvPx}}wohj(mV$Iw(m4ZU)8V;JK%yb<!UvQ%mUTZ#>h}oH+Q4&;r=Dh{Q~!Jk8DPqRv?=)PB>jyuu(*@{I*T(@o{aetj4sckDd=d_wMb6t+HW`3K~nSQ#(H}RQ9%3!9*i;F>9jEMtB!D<gOQ_Qm*GP5t)LE{Cg21F>TGNl!2l`riQudA<C2MJMGu{bfWBm`HU23>vzDF<qQwecrDYF>(G}8*zVw@C@PAu?4anact+Rd$8g%|$4v-L10O^YYi2PXGe@0$zayC!KE)QE|z6$gd$xzJ<XhNCfY_?9TVDXI&deFFGvjz2AZjC;_Z<#+Xn=K<kc{X}bKiiM@&G!6T&bDf85h$V{bf*KN4a^EAfo={+BVaiI;5)Mf1R1*61U%u8$Vo1P^xVw1kgbdSyAvd|Z1cWDBhL*=DBd3Oz1G=OqlO%m)`*>$z*c+p3=gzZ`)y_9k(n?y#L@TSCSTB<eZw=~8Tou{Oe-;tV3i+J@_$ZGLpePU(fk}3L~fPmrY@d0^cCG%v<TBd6i%;;j(ipe=~Ut%fb{wX_rkr&LS9Y}qZ{ba>?k%f=dlm&RmT`FLVpwu8^D?kaC+TDq_eq3&)j|NPyow>$J&M_(IOuCB{$QMfhwci&$*1j=N=5N!Ih-d77cc6(RpiV{BXGQ7SJl~ZxD_nWbZ|2_KmqW#_uvl!Sh(f$U$Lj(QnJFGO+9tJ~D~##&l->dWenf)6?XMiRZ^MY?_*Uj`vor70z(bpMozfR48a|QY#3_r4}~_sD4HJUxue(;jjd-qEhrteSqbHA_qWl5|grBnNb4l(K-2ujb!A4d`yup#`=1*NsZ|67wE)a3VVmR8Y>8hzCUSpAfxZ)W1Yz~8nOf1cub)MUGjrnR5ra7pg!YrR`e^&7Ac-oc8-Dm6xt}5oCK`QCv*rnQX0YW<j@APIDYf%)GO>FKg&Wb@~hO}uS9*|b%_9~ZYvF+$-txF7!+<Vn~rt<LQQ-q7!N>TgvmTge3KE>ypE%HZ_04SE^d)@%r+bh69G%WZfjvBTWmJ9wpxP$$Rk0$0xx(uuBF&jn3m#K48*cU{wRxN$!BG=VG_I7Iu+bS8o`o*4v7Mx`(35cS;(Up4P*Zskn|cilDYJ#m_9cL$1>4f*yZRlsR@#C-*T9&)j}$2(w&Zmcvi+(>a21I3{hDX0jmN@bls#q&w_h}+=8j;DH?56hV%{9d61mD>zmI&k9Jg&#^ELw?y#v>ptt>`U;`Aw->d{jQ#VP3%&3_4iI!adjm0#Y3}!%R7d<e4I=01Q3>@p{e~u8vU&KBI_h10{>Yw~Dv9r_)F3(0$&3Pz++yv^~L4?#q7=6E%Q($}^y?pOlp9jnZXh-`Mb5V}Bn9UOtJK69k!R&yWjDkSwaEH6=<Urt{b3zZO3MV>*BaK~Zdz^DP+t_AQ8@=nfkAfX`cp8k{G>F1AM8kN{=siE2q~}s0p!Fr!QaF1wJRhA@P`@M#gA{uPKqsLW4c>KoL_?i!G?vMWq6p3ewQ$fHY_&C*ZwlD)@p#&NYKt2q`ed}1^t&rhdU$YLowYE{cQ_pE9-}15B!g-g%IPU50~i?l5xR1V(4%QfCIDyMqzQnDOb|>nIAs1no&^Fd$;pX@twnkcR`#E?gPdW2A8)`A0p2yhtRtA#1MqAW@H`1!3E8hj6_a(2JEAb7N#W)ooD|K?<&$kTHwu$sLM<9C=B^jL5XfLY%yHq)@Ka&(G`=nYC#Z1#z!XIaU>IAb&&*b{B-5tEwSo<+Dk&?>Z8R&|K(4;Yv0sD+W|_)o)>&s&Lbr-*-->~T7g15K7Z%M?N$*+-3Jm-ujDJig2t5pw(JAAb%NT^f>m-#oV9})#xHW4Gk{|?&Iviz(la9OfARF`z3&tR%Xhc*qg@maa?FNeewox}jzK(1h$Sqim4J&9_U?3OAAS7Hgq2UalJ(Wq)Y$b#jn16b9wL}1d0f!Og8!06;U9uecgUFyZ_rm=%h`^L6?Xp$F%b8%aOU_-sf#~K9QYpY`H`hMS{Ry7@VH8cxyr*U?04o=)YCr@unW<;CZ9P}59$d}ggnL$dDXN<#38!br%enEp8VquJ+2Y_>ejrBw_v3^89ojc)U4g^X_4V3ArT7m?4<}_3V1Bj+i7x#D`LSx5&B7EQ>dsx@6M^dm`R5h^k1^~qElVqsnz29ifiG3M61Z(Jz})I!Kx%0)n7KhX7%1JM>xN2U!tr$iH11vn)!Gc<E)o);5-VAf(y6ODF-@cC(Eos?o;RO2ft8f;q>pwy*Plh<fNM0+bj9OS=s~{*;B%q%gll|ci$~IMDi-m?c|px04Cq_}qsuB5Jew%UmDjDltH(0$C7<r_S1tb=O+Ay6Vx?5SO0|v1EgYdMs7>x<X1!_bzuhrxPOO2*y~M>>YBTg9prVIC2;?+JmKK>Q+Qwu-OHBSEb|)~8FI*3u4wSQ#HL%pV{D}1!7@M41hCLK1csMbzsymxc!QXSQQ87wKAaROW<UW2-aU@!!O3QM938g0WHEA(=Zz)0(PQ;axtV@!+D$$xnK0q2p&SS8kgM<|M?a&4PR73&{&0822dI4e&-y<=a2Gk{5T)-KP0~hE`8%O>KW@c4>HS;B;9@Jb7dfaa#)@QO)?wg?-gaFC(R(!xVe1~PFjyoD#G1wh|lXKIwpEmEnx4wn{@Y_c74mu-Puu^WZ%n5&k<uRHr0DJ3}{OYlfQNX}0k8rb|F2;g#46}uy2_+SE2`!NCq33$HBh<xH_z(i^%-8L46bS1zd{C2Qb6B^sM!~=JXF^JJGN+>2$^RmbWWw0LLU$m@D;^xN6Unq#>c?|9MJVu$q);9K8azPfJHZHvs(b*f0>zz@S26bEXC56O0n9a{MU&x}mlP;&(>J$hi|YhBIz3Gub9SG-WlHRqL@$N2>4;z{5fT_gw1;&(8U*}h0!1<P-Lg0C=%a(*Htwt^w-n0DQ{$HT`aAe!73ZxtCgk)rR)bE4T$<{^s~M7FIRFm!V~EC~EHstL)r6<ORzg7BeM#6UgT)^lSwm(Tj;vnF8qn~9)|#of7NMhrvdN(8apJzOL~{u~O31mM66cCzyNXj!AAtoC#ix(N)E#1eeCA#YV5dk7eH5Qy?4fmuwS8G7MshtHMpLJtVC7WpV&HJbWkx!)n6HDG_16oWl=vfg0>9=U_c9Rx^5E8UML{B1)@$UhJ`8A_(MK4i^Bo*z<gWtDJ+>vMVF%>zatxtNBSrI^6&|pKie(uP%1m%EQj;_Qty#`sSyJ4y1jT#`5>AOO^*v{3m77uH(Y|T1Tb`$!F~C49mp84}IZD`91cF|~f|)0bmV%{_q(K<n0$syshBY!QG-1O)fXBD7Kl4dbS+{>IP+G!9E^a;0N(7;xlAM@Tr2$R~=aT|i2!t4wwgtqsM=plU4J?M380i1?^z`x{|D*Ab|8w?)_QRG!jv$?BrEH~>LOCu4(!#{{W=3&c7y`rGj^^XrQ8@p2OH2wX7`z^}kQ_#xpOtM!)~)1+f>i&+P5!!H%6goh4!gv!&Aa|q<3HTSpUuWkXE&|Z9XwIYD{FMGC}028Tb|90+lxb@+YpWqAGN>#=imQ#glElpZ8?wWG`hDiuR5CU$VCnA1(T@IRy0FCXP@=0T)LAbPR&WxIJ<dfKYNO4+kBU5Hc1k1$rhEiY3>Hzz%5pJfC<kD6fXex@=w6hG(Nf^SecO+quEKHW<Xl7(}r;{h0ox>eq4m-_;U(B;gkR^P@Vg;VT=w|y1?IIbioat|0jLGidS;gEn618w7_HE$b^n|LNq=ySp$RQ>#sG=vTwJ2pw!tDZd`9>YFJ5OH^C1qN#RMGf58L!$$AZ9xM%|9Rmp%zdsV23s3xOF*tx%cW~qVjS<5t&gkvK2<<n|>!k=^Tjq+^F4DQAmmhj+kJD&_>0||#Q^)-I@(D-52_`xeHVDgz5X#eRMhA)g}vrYduYGn!zAi=y@$7u-d3E11!;R<cUX-+t$lzldS___VV`}PmVMkV{F7;$XesP*6VZgALLqq$L>qAoh{i+^1k2*7}S!O0`GW~I~NUsS&^Ko_XP!Fv{T<ac-Yv#l`f$lrGT$?M<`4AFaoG#cP9Xaix`Z=O+H3&dik;q1DIASXc1VP`u_RH-en-eZ8yNZ?_id6pU)aHOFIE{&LhQ##eUH#Q9k3*7O*zr<pMBnmrJ&zdEZ3RSLzyFrRWMG&y0U>Hmm6h_gUB!P}d<^dVf*WbY<P+$^${kKO4??Dy}12=4gXY=V2PF^FK2D8)f=wu(f!n82~pJFj5Iq+})mbFmuaXJ-^Ytd+gQA2)j0Lh{mxH4WM=GS1>g&XR3V-A8UUplP1_^kmBcB#b=Ct@DW!L5!Pi!=b^aU5X*jpu)KFBXjvdg&v#F+w+ejA;^ZAOOdBCK~ZrtX;VA+B6uh0nTgaRU~VVPs861j(*wMJrdA5KMl7J4nK%I{2{X2Oo&N3(4JubwbStAxO*g?ZEkKnZPU-wu)F`OIQ-E2`CxzNV88d<(QdE%=0mT$eX!H*wB(bM{Wm9X-*%6>JJ59S{&3Ly`KY_KGuYdGzuW7y0FU=OqJR2GlIj#T>huxKm?3of=!`cIywy2aeNLL-2D-_0I1=MUNO1|Q7uZ7<JQ&3$n0SGE5>MM07Y@P+7ocEfDQ{s8JHTuu9DGg>h{HIV1&ROC4X<B`8{}o+q9nyLH3y$QCFdcG@G=p_F;5@mv8|J%z0*gQxV?o1;8m;k+L~5~(#GHwW@b(wy~yEG{%#de3YcYJ<yfp~`i_QLcqu8m6rq19II>$AEW&^MFFFikI4Ch#mH<t|fbz}JbjrRJfY};Gak`zgntJE_0u!iL8HY7Nt#n>#a2yvQpjKVS>^qMKrN#7Apj2WIV7ZqrcuQj+tqw(KTlEI*<^yMVZCF00zkos11DPXfiyL^Rrw>mbVefJR5m~E{lxmB=$#m5BH$=_5zlpmHI@*M7fstN^Stb}?n>RwwQM83(G-fageYZ1SD-=Anb%wjMvT2fF61u>s8vVFQ_PAsE$xT;ObD~ext^ZpV@I`eK#UThqjHJTyvT-1)(nWIjHwBe9LnbA7BeK3oG_x>0^#e}Cbw;wbNvSXK9jNNlM@%d5d7&FUFDMMzsiZZKzq9SGGV~E51c+nM{2%`lvm@v$Ws6n(474ihT9}<4+^Lv%#(`7VcE!Gurx^x7xWhPURkl1#tkjASiI1dijhM1EmSIWsVig`+86$ljMmLfL+bWoH3m>M_7nud3#>fZaPA;Hwc#HgU&x%saW4$PBO^(SZ^5c=uE24Cg!%r+*!>Y(<w+cJCxg&H}gy~y4juGbX-8cmH>Cb~Jl)z_VJ@gt>L&1jxIcV&HIp7I1jKYRW7F#GO_->tP`WQKcy|i9CvN{710PkzriV!y)c^y}|tEkILN><B0EW#kgrw_a}t13;7xTyyt6H~!(@awj#S6Yr)zq6w;V65va8C*Q1Y4?wXJ2guMHQSo4<@w?;xH<*1>3i|?xxLvmtiH_e;a#Su&z;Re9Rp2|VXp*?%jBC)-E!7zW^b+6&oAx9#mf126Er+OYwi4TvuQUAh*S{(2NX0;p$_UBVzT-7|6D!23(i3TOpp#_*5>nPf9sB1v6$hs09RW$@~A7eLib)2+%cGQS>;tg$tUmIG9!F^?@l6HU`Svg^8C+z2ruK@WOVL(3lJIuVBZ0!KBhHT(~SYrwiq_*8%QRZFrflg{H_uwSwkf$a#ol3{TlAX${R*&<>rLZ0JJUA2^fX*Cf}4l?>QZm93PAWe_A6UROx#y_>DCg@L5}Lu0KQJz20oEueaBq7wK?N3d0hg#DObNVj^?w?jX=C^d`Y~)kSZF-fA{C;P?90o9&(M+jl?j{`)UlpdhZ)A(pBYD|{XI4bA&U7Bn=RjC+R4-~bIn>>90Rqq)&j%a?(Sdw>*z2L$Tg6<2pp7B>vgbN)tLv(Z{>uG5y56iv432No@4nh~2-6~G)#h(QdeI;mCy<azU~Qz2`P2`sGK9bkpm)W>r>kcW8SU!jpZ4#tt8GToI*3B4@m$e+Z(vTt|a9*B=F$O50@90^|N4$l`eSGdy@EoWdza4k_z0Dol3F2;HwuTmIt5jTR+cneq@PTdgP62P`Q4JN@bm<H)J8pvpAoIY}#HLQOHA-o1g(^@vnnSD&q_XP1FqvU)9_4%Gqqsr8C1d%fPcr*RVG`P-9WwYLM(r`DthyuE6L3Zy8wGiOHCBuCbO2;f$(Um~983yRpzM!g4nAj@dh`%sO4-d`&NyErMjU_?aXx~w05scy7+u<Sriu|xin)@hh1>cZi+NN@PSV$sYaKR0<p+H$>C4-`O(QC|i-$9~-eHt(gfWX?>bl{lyBa8(Eo-HGV-omFNRqW{h0iB|F;)c?#g@cO*Y^kX-gqJ5f^B1S48|w-V%ede)q)~DDD8~BR(?>aSHX6gp2n#C0Nt?`naaT8lr>^V#LiMKGTZ)>><INhfZfYm73QuQsQ*8~}?EN$4keB>L-pwU^`Q3L4c)?@l+8QG6VKDlXP+7Y~;&t}Xk$b!AC8DkP3l5QC$m7z7g}2XE9~z!8z^Vy2tiSqk0D94*yR3lgvAnEAe)aquGbxW&pCX2LA>nK@mv^cYyp~*{F#nw6_4zoft%T!7ErW|}5OgEHP><vuIjU+FbGO=Xknn#jd|uaUCtv`h>}z2geN75>%5u@n&O1%3R?%LDpk3&`&F)|g#-)CQ*)D*sATB-Ktp6zMI$GXI>QRtFBg`C-d{g{b8&lF~Kw+h9)n!quN_Qw^pSY2XMp9Qij_;*^+|kMEa9}?_arMkUbK_4Gf;95n$u$^4UNl;uMs4%=9r@KZ^4B9FdymMAWgr$7!M9eb*=-jTSAtO_T4N-<fT|%dijIv5IAv~L9IUZ=R-?dk*$Q#ue9c6?3Ow3@*AC@G%bO&MSsK~3&{i`Bbn@U!#^u2X>RyhdXg&2<UArz&XB!69HJ5jd2D;Z+0gmxl$8nJTzHXNe8D8BseeNzT!B1!g+Ca)`AYqc9nAf@pmr8_bk-4pWtzD8<%c13RL8Dla6b9(jC6=Rf%Tbu$PpPBBZLAZ(ibnVIiS!^WfQHMv<y54et>QIdwhPhDE*O+(X8TuUp=JTjqV`snkzKUFqz0C6W7wxyrm1>7#<v>fSrUHg1j*YV#M?Z4eIIv{$Ky-Y@Eb_zbH^Pf+(9(BA;$YKats#PH=QQ_YguY(naL>gBW{ct!cKLx)``p?QigqCL$$^;2QQzRCf3taLPZ83T}N3~mP35!Z}ZI?Q+62U9cW$II56gxjR^2Q6rqH6a2loV6wqmENNQY<cUI{MMl{UAV-bzja;##6Se4qz-I4vB>MqHBQXSM<a3z(^<2pNh#NaEN$IXS!<1wo@Pe>9x=~PE5Br|$A^F?x=EeI&7EkjZg&pmO1m4}CO0C?+;Oal$3Gz^$2+Y+6-3glO1xE#M<Ta#A;lTX1M-}V(vG1sCt2?XaDJP;R?D$oozha;oWqC^UcPM6PQ#VRVAL$+q_*hQ1Z&McPfh9X-eV1Y2Z(B2oo;eO@-DPPngW>BE=4yxh1%)Z<8G>S)`+U!;0<Y<Gmh4I_Dn<iWHITZ-7d5YO{3}aH|ysG>bBiD12lq9Fz2Sima;&n|@t5OMpcxL?zdf_{%7w*AzX*~lLJ0uGb>_J+<?z?O{vN^yM&RYs5!aWn`bn)QC>-A^ZRh1WlZ9sUuplVmo_51=ZxXt&>!=)U&w3xGw__8{YL^BsPK?=IeO$2C~gziLnK9<l1n2t$<iJPeT3X_n+&E}BF7d#<{Xg|_R3$dysplmU)H{}JX$~MgW6)^z`<j`>_YAp^NvFeh+6^>+a0L2I+&u??f8m7`lsqsR4S!+`0hu^iw4~^0oPBAWnATpth!ukfR5hL;EMiww=b3Cy5Q)7MIkkN!TMz`;5>Kx&VGfSOY%_W_~=%U)WRq2c>16ODoSi3_tV?bziMTDap2?;8of^AxzS4=m@^Zhx8BP+&$lK`vvCKd{Vw8M)^HpS>Q8_n+1($7e}@%-s!RGyzg@`%@AaP`p1?Vo<EnaC#M6{b6negB(G*m}BIyEvZHrk&7dzKo-AB2^<CtO#hN=q+Enmk6%5Viay94*s$QKeuc=K-P<UI<|g#Dtq4L*n|<OqdDf2d7IH%0OORcQ^vDEi#qWA8@7?~txb}>o;B}mY-ydH@%Ho7`OKv`5=^szz?|^`n_hqIq^%|~9cgiU-6|{@O9unc)NDp_^_;rwrxfzTsE<nnW99xGsKK^*S0IhHE0|XTneB6R>mmW_B&j=`f>89>lnd~EDi7dLmNUbLOBweeUC-)Hv@6+Mi8+4l#Z56PLxNw6ytM3Mc*S7VZrGzriwc?C6x4dVTHL6sah{MIeM2fpzUi)|aN5Sf0-lLO02H~#olW7GTG4W+36LPhI)ymB=AeggM_6(Swh_Jjg~LQ}k|&tSL{CClH8qS~Hr|MMmJ@xl$pXn4V-bD|qsx$3mUTKZNM<j|`p-Jnt=Naej`*4oZ8w^CG^wm^`TX(gUp_wD?kGL?V?zgYr>{SY=hZLzbLPyLlBUsT)J~$xBd?(?2PRasNR+{te9_by8><#&b{6@TajHiuj5tDzLR+aYl$>8g3FLK@KlM{BLcFO<qDMPEnNd#n^lFsWSJQ${ETL7#E3@?|lHnwOOwrEUKI(4uy5itS9CZ)(wzj+C?aBUjZ}(td%ojsACr%|QLgC?0{<S&h&q5}CkGj2+qy1wJ!r;ruPqyB51<WIM-@iZUZN1s+isRnV?siWccYA`b9Sr0<uji8i97z}7`m%K_zW*LA-`{q7Khv9fp~XDz?sZ`#$OZ7=1}eBCQLu&4|0`a4kym?+iDBU=k1G+mAWDO>y>;9bzx~|Zmv56W!D-mt7iMeSZf(HG{T+IvuIYgS>=>JyhUj7EWHF?dZ`shNy9XdV(S@!!k)VQW^|HSErfJ$OaMXMJM9xDV6~0jkzCD-l_fPirXbOT(%YdEy{(H)^e8JXL0$M;o3O-_Fb+MoXnc7CIj~wRvIG@fZxR=M>?USS3-UqSMeY?BgJzBY!w!}p3=}vchZ|kUwB=RqoVMz!jKO7zW*86bSWuFUde=I<cIlqyyAn}^kG~%*)uIS(hP!Ph&9>`n|E|Cj%Dd0dimjJuAiVg){LVfyY*tT_awDqBX)^2kX^#JAr(;mbqkw-dceAm#=u}QD;&v-E*`@-*&$-lEFr#)A?iK&nyJUYiaJYHdK()<OR<C+W}XnfOsx4W-#;A7yo-T@MuIA|rskyDSlK!c9P6mNmOP7Zf~(P+xuw_^XG2dyW-l*GTxE=-QWa1l(sK{Wh`$z3B^jF8<77DBdshXeekrG?oWd8`-2<GXLw6#j**<n0(3769o-kqSVi`}^*3FF(hvmCFL>H{uFuwKlb^4$Odo0$c${p*~|7WcQ=CFx)8$`D=Bqd|V2GTe2GQ@)f^m5i|P6*G|rBQCdV^G^rxcXozEAa=LXTa^jH72DVsI$fV=Fr_pqQ*=j+yv?|ZUIt_fMe(rqmiQ<dqhutIKllOS=UGE}DqWF4nB@N3@CcbA3865wQe^<oJ-e5^`sDW~*O#vmKR4K3DZqv1)ri|z22Oo~-z4{5j(H9;oS%y;+k1bo6ZXCPU19vhpfzc0+c0icD`5-WQ42}>V98Ij)MOlI%b>@@wkc?JZMyI+mQZo0eSi--PH7M!Q=6a4`Y!1^nn3<!<o%#vBGU$TBV>V8hCxsfXUK!X7Y-3m!{>VhrDoBN}8iK5(=xXLE)>suMl;SU+vpT%|rn+owE@okPj^#RfDV92GIfLvTv-Sj`p>5*JS1oKQY6a-J17c+tlqYW~V3pU8aAFDuRdFq5%8e=@1Kki~6$r9N2mC(GIsi0<E-R$Q02+KzxR=Gl-Z9IiGVOH-v35BnmvPm~bgTS}NK==HTneb3LJtcvYc$E3OyeKPwbhpI{<|>#+IJgcx^MmL>D~8B@F>Ncqrz>z)lui-hRG{8o}aQ6qTy71`m)np^57NcfT~Z>4y|1QN3*l{ifLG_RLS7Ez*(D+aD(6A`AGpebnX|CwXdc?u?gaZbfr18kWnh;Oo)D$XLJlwn#PhPaXuLb!y&|T<M|1ExPZgLCDU#u#_@7`jb@j?)F$M!NLr9fj#VtAOUkz011vHEz#yewA&3vuE^7LhugKg{<itlNKU-;KeZG<9N-SL`Gqe;A`RiF|dX(ElH!voNcGwDSolLMx1;OKsItSmiSa@7jOV~xyYL#}<Um64JHbJwNkxH+Y;6!S6={%%uOW<oemi1kSWlIq+*uP5@_U?SH-lB?|T*j3rsOj0M2cYoFY##<N0=~w|co*DwyvHh9GF1yKUuI$*g`EF|^cn79Z*m<a3rfIvSpZ*v0%S?SigeQsg0{(ZP?&cLa{VJHyfonVL*WgBh+>j-xDA`{H`DF%FuF9Y+{d9KkyUu@?jLuLdeY{r#~Iw&#4H^%Tk*M_*$XyDdTfxWZZOUN{KT(YdnesvvwBo*!o=2X4lwTX!kvubhF#|%WUu;Hs9+qrut!#2aQa1#Mh;HBBwhj3q@f^B5&iVteI@>?wY>#Nl2rzm#r$WP&>7J>ItA&GVl6K0H7fIDY@eaGb-Ycid@T01j(ax3ftK6{7JCN=hZ)bj#r5Vj9hxr2c6rCYwpD6otwCz!yrrm#OR7st8lx#8SUZDFbAj(X;upQ;x*FwqFXMs2rm08>0HqI4as=`!Wi0RQ2<a{Ho2j7<6GmErh@e?G+C`vVb*kot#y3dGT&$EdDd`A;Lb|JL^#JKcZtNl3Q`Fx}tWL8?u8QgM6^ZydZqMRCFhkjNHI~%f87tSDL9AG~nYn`tUAD?G@H$?um@Pc8U1q@3F^NZ4Ou@*7FD0`xw>A?WuVK#pG>E0xtS)$|-BXqQpDp>zg|`n-0F1x`rTc%iZ2w}(t^)sc;+R*6IXV2DiSREH;MqG!C{)BP1?c51)&q;cTP72Ct0#K9@4MnZ4)(jk*rL#>yLRkGgF|;QjSQ>ZmQlzu6DUbv+;(>YTTK_7=!L-Aq?L`OY=GL^t^E&t63FEF)>?wle+PK(>~6i=KY(+%eXOFdouh-_2HOWG`#p6M<b#*5%JN7CN4Iv5yC4|1yN48)UvWz1$t#?+`x#fWzL)cFE`p>!9?;7pz}vfYlflFf>5X5Wp1D}c%(+e{Hmg<W)vbEya=zjme(@<p4y-?ey6CnGLfGbudHz*^w<{-xE&0G!mp*M$Uf2!G{AZvzhyH+4-vdg08+n5I3nZrIuGv}aIXf(s({sN(B@tdDJRc%%xCVR~Ju>d1`@~G^rfq<Wfq!RMQHx%q0-UdsTSwhr4}R&2Ewr2Vza*_ixh!VR!;?3AyW6%K0>j|D^)V8I)-0~@-O<*556)+I`vfy-UojQ%G``UX*(HvqekI>JpyIk>(v?%9`BND}Hf1hO93Jhy-#Ypre(8R&%R&u1*i`OE0dg%7`y$H>mf@F!F=idm!mLXoEA*~h-wjvHrDVaw7n4h6`YO$5nWD=*2>fBod<rjJX%K#tGe5o02YSxt>7SUb+&bCo2|5rf@UB07U%ZNZUkW&v4O+EIs%)hm#Y-=|&~lW6n>Evu52{@kDxj{KW51L(4<cYe>ge5yqNebqAaU+v)m3^<?S;Y!M9cuRs29x!*bdm$?o1)it?5La-IQX?Hl&~+72De<`@8?`q-)kF*w0}tQg+{DG3BGfwI;OXQbjUnSX4LAXo$f;3A*FKK&vIl#9xl}IJg3n1uHFzC(;tCP=N5S)Cm+b{%EIB$BxmI{~9$v<i8f!L9nKW4_Jo*{ss51Q1AtLuqt1lWypI+uvlDlMF88&MW$VqaQ1z|!+sE3+p8I+VnJ1~Ru&L^MV_&ZZJGVy*DKh@=H^eWpPsL;uRq`T>8W9@fLMvzOV9{5f8SC4SWWPkSywmUig6(+94$E!LN_0<@2#dmOT{H)VWnLtyi^uF*8n{TUaJ<KEEfL)c<c4>T19wzdYVnGa!xv<Q$Q6&KyYMfGH=X0*j9|PRkx%To(%C$NHrv>*|M{vzDC8W?RJ1MM6rqmmuk%wEWm|Zyzym)NQ$sdkLlX3X!d7>F7dgYS6tX?VYboxz1KbN;mbdu!~5fR`L{Y-x0L6VCT}5iYs*ZnT}q<b)iT>+W>f;JO?Ikh<&-!^Yh3&@Glu=_DL5m`;!QS&=?X7hv5iB1|29YkKs&(q1Y5eP?_U%xagg8#1wk&w><j#h84;Kv+4oqASP^DLN}{MTbm{x{05s0_&#K4nK37}GnkzaiKmEve1kSXmtAEk%RCQDFy$7-0<pBn~e_?5XIn2o@-{$2jnOw#k3_U5jIea#7sV`rdl`}(sjiEjafPZ>q>aWcf(=@=pEkf92*GKrRZEf)b?DUIb*s)Z^!sjqtdf?fmD@0uKrG}r0G+)3_*X{@fql6wnm9PIrh!kGI2w`nLaVfe=ICXSsUI^9DLY9SC<ZTT8)2?ucN+^B<?vQ~s;Erkm*b<~TSq2heHjh&JQwY4tMeMY=IG0G)G5b%?Wj)LnE~I7|<pAN*9Pq<f%v#An^2Fx_jSNVq#PY@CU7UZ>)$13Qq$7q&hz#q85r9sr9yO{#3PVNm7(Q#RI#mCnl$0~7dsph-(bv*%Mc|EedxtFx_0P})X8+}stfz#!){<3%sk=0vON`Z?h1|S*eN)@m$?n!{%iBjB0V(ae0<4!8{J*DO_Lj`Ar{Cu=lV-wp*xJND&ZM>4#!b=UyaT&Ul`{P^FkSU7(LW2_>dfeWF6w0$qw>G!^Q~xCaob4|)Q508{6@O}KQ!=ygyYCK+qYZ)gVK!rx2RHfl>eo4V+l=;N<7>yp1I+|ooWV$0H@R^8(Fv^RepV`DpmFWUqq|Sk8Ib3?mjo<pj1@`^xgo379OY#LKN!?tCfZY`LhMy4(!$Y<9CKFQ*ZQ>Qf}Fg@;={p9p?*WRYrrQJXx*mB2TyMWPXmxh6VOZ4t-`C<d;eieUJX+<ucZ5G{ly6>qHsQ__yZZGyaLr!f=6cZ)oF-;O@2axk^T@Cg%$J+cU<_F8!I0{a){Pqb@L|^`PC?m6i7S_O>p*v^2moyf46`L!$z%2ZlK<O%-N*@=dv{E`;)RjJ3X0n<(zUcTB6hyx-ISmQlv40sH`JgQs8{2P9q(G+DGHApg}Gr%d-H&Zvfo2$E>ZpQ=F#Efgqs&!E@$;=5t-g|GD9m!vHYei0_afdh>;&dhxw=r4YFV(5-OSq5f=Vn10-v9j>d-Twtg*lGX'
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
        probe = 'curl -sS --max-time 20 -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" --data "{}" "$KONG_INTERNAL_URL/functions/v1/pix-ocr-settlement"'
        code = command(['docker', 'exec', 'funecob-cron', 'sh', '-c', probe], capture=True, timeout=25).stdout.strip()
        if code != '400':
            raise RuntimeError('Validacao da Edge Function falhou (HTTP ' + code + ').')
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
