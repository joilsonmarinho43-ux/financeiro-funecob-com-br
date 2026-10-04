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

PAYLOAD = 'c-pNy+j84RvcED>;ss!X5J_2%mk#ZcEjiZ4wp_BjyE!C-41pm98w3ylltfFc+Fv<!eqf)^%c)9!>~#0c;6_kZYV8XN%%!`hr>C#O>zz!b7b10%)y{zJ1dAk2b2jCfc=T`_saG$%D4x$3+$&y!xOn`S#ZmDRXT@W-oF-}PiL7kO#Uhynp(q>9Q^EZpnwKrX0=j2uykO^fo;Z?7rh1<Pd9TjS-kplymLkhv@yHKFYO^y92Rq->6a^&V`FR*jHGp^Us(RiXzt*kC3qBXN{5nZ8H6Rt92$Eb6N_d(HS2d1d$u!(~bMR01_|3tONAA1he;&Pl&xWkub-P{qKaS2$emZ&!ZE@y^=psnt$eD}WG)`Wey01@O9K3dEgkdwou*T8rgSS6!8x37J42XFkqB)L6+|N%Ae});o{Sqg@{Rx^1<~q;gW#kM0y;$(%JWhq#vv2`pXq>Th8JRqtXEyU;co;;&8jK?be{e72We%VgL1aEI2e1zHIg2=o^Ee7T)3W50U{=ifVaU1)5dKMdkO_7sJCD*dPH9<8TzSG5OBR!K#4Hi%BFF<jHWbKIWXlkVC<V$XY4&)MFH_+H&}5kp&(bAqq#|LczG2k4@IFyz0TgCM3bvEwJ`8hw;l;i%jb%RTJO)+^q%s>CsYpWZ38TWa9H<Z}_i_^jtmKT%l58=21P#GF$g|-~9%cnUkz!cK$S7t5k}OXNh6P(I>A+3ygz$+wj?W!{sYhlDYf`XUBB?N$Fg!pM9S^|}B0tDo@0_RZ<#~{cFv#*@x7Xi$xc}(;$A2{@b%rR$vIj_Jc415^Vo@&tGEV)>gnqp=HGPz_S)4LBuMz4F=P>Z{Q<yGNGl-q{c?!~ad_ofuZWzE;i*#s=$GKtQic%@>p|}tsv<!#L*f$s)bKR4Rt6Uxy*tIlBOk{^9OY*~wJwPXqv>(8M&Es@svxqN5W1}?nG#GY9D*#7aC4f@`aX?6d&%#u1mw}(3v-@n%meZVb5zNnXY_VWbdtICL_xF{U;l={of(o|FX2vyAvhG|10c$6LlUyOf$@qnk^3afe#qwL_4*nOCN5Wp0cEfN!#&D7^N0N;b+N?|5EQzMzY01)AaOGx8IFy+OJ-Oy<8ee8L?lyJDcnAOD-m}Vd=7}ih7jXtSeUS+Gi1Kjtghc|iydPWyzJTopL7oPA%7J4+l#4m^O;@bf?K%>!<`^mFRLECEkLT-pE#FBJW4Syaw{lEAi52R{WfBS#x<;QQCqCg&(@0>2ZnVTBXH3J``=npM0_aD?MbDbW1p#2Oa$p<>cA9|4W}}Ja@C4V2xYTf|u230FN@4-t6s;MlSRh3}18jCKObPjdhhX(U*H)H-8wp?xwta8a+0`?=Wtxh}Lk>hR66BhO2DThsM=B4caAwOeT=3jGH&f$uJpK-NP++ogz%dH{+qi}arWVM8jDfA75p<l3jt8vAeqf=9%&Pe4Kl3zRCO|3njjD47lls7vUm_c}bAcdP^-15d1E4Bh@DSwJ3-FtG%=}nLdQ)&TK*-r##0vpu!-JND2dPsB1S^%JYm6F?{Rbo4nZWmTe+?`HA}v}yE>{wSW^%8wXp$u{(}ovL04@kyjEQyoiby2lq&^cG?ldtaMFvy(RTJq0rW#27-3i(>&U5ghYTy(l1vIHU?*z_EX<1TB;)`h_aW*d3mZaMXr)4=_9Dzasd-2+6ft3VTB1BbzaGWsazS%Mgv}|yJW?{sml_}?pu57lNfWY?lx<vDe)C-U1!X#jFMV4I9Ril%bXH7OyWngZyiZ-bA<vhh*!K1U;OK89pMW5=2R}l|poLrEJ)gog`a&aySr9=b=6)|lYUM1+NeF#`}c^Wq0Y6Wl$>=kigbsKBtk}Iqw_%^#DU8T3FvQLv+mV$iO+PMH^)8ScVpwUov;Q=*{Wqp|??Rx}d?cq7cQ%@M_)IZ+B20-a5pF*CUY_vB4k2@Rnr8-07DJkDV(dBs@f{jL7i|nMKqd}(+np!@0`hzV@0reO7FvsL!SVR1D$ehRE<W#6DXd!&Ja7UgdkOTzk?CsaV04u79;MMtl3nE(4T@ew`A0*Wk`DsG4ww?>(#VxW*%XX*n74nN-M%@Ygvl;k+^1aiWjC#;emEY|Ei69M-UNk_I$NK(D;?*V>cnWd3+ak+VV5CTnYT-Z=$)snCby_u#Z)Q+O=UTcgXx~b2^zoOL`TaI*1rwUssG}X*_g}*H_-kUjZEZ0aq9Ed-OS}QB;1X2b0p$d22LN(sHh`c&*PB2l98x*iWsskn<rYfsqI`FPjFxSF>CmWigBnV155-=6>8epf398bFgCv8k!R;9C=%<bb+Q}m~VP>$?@7Q&@ptXH1F|UmhpLC|R8b`1?j%ma{<8h?W%PEyO2PRQi<@225dBa$dFXCmCyKxk*>VbTb2N`bUL4fG~o*adHQ>46{Gt6#aM02Rc%uG@N;nmQXEhFK@(+-Gc2ZCOnv3!wK_*sUJLrP$o&|TTkEMBIbXoQ)DN>mxman5B5F}FKiK`2S9tvl@4QkAW#aqr#XOCYPUzd<yMQM{LtIWiJ|hVLpzA@NxC%t38#J#H(!GVts&d1NxdQ#v!hyu-%9c$_^j@%&hZO{gj6cw@DC;SvtUQ}EJ5gM!{BwStn|>T$~i)!)(oSLrEOI4l9Ys2pQc0kAk2asUJ;F>Csj1t-8CO(;g}WF80om?K||e!ttLMhy6Ce3CD<y+c}!TNsG3KUsEQqwveQ&OD5#GJx&er_@4K^Mha1biFj7k)&l(k1LxVDV|gr90UI;wNZ0930PB3=n%+EX$;3xrZ!N-@lCXuSJ*|_SEO3htFqruS$pDjivrr*R+_$0iAN@LP`JI)b!>|lTJl4|%msxJWl5X~QxaH-I!=Fl-h?ybxJ4>3+jB5Y1R?>uT}dn1Y`<G+YjqfaJqpxQh=RA%+Q?l+c_V)%fmk*xyNXPf>T9|U^OUcuT;R(*h9v_ZG7X{{cQs}gDUW(KOvc|pq~Ez#!d1<RRdLJYSfRRWyBuF;ElDytwwWgD^^l7d?M_F7J!(>{Y*sS`hNRq<0ow$URc%wHU)iNvWx=diDVl33E9Hee%a|&8nC+F2(m>5v7|-1WaDroqB*K}^?qg=RdO#C|$i8K7Df<Q!AejCnqRcL8A4q|Xx>Od17;ZP%Uk3@&h%i0AQYbKij$ydJs^S5A4(;e*VzJ2amy0AbagYsN8K&=f<^_Q=vW^^H^;r-&7=_3OF2RwD;LPEW))D72-)y{)q;}3$i9pQ@TMz~w&x1JHMKX*#&3-MSd48@mHo8Y@Ew#fz)63b}2I-gN0+8h`090A%$L^0uXT-xQ-)OF6FX{>qT56G5WpJi;0bdBzN%?))eQ2|5BmQIzwv1ahk-j^5zlpVm<{O+2j)~DwHA-|V6e{#oGyw{Xw=u?A%g86R4I3@XV#-EiWf3&T0?vVO!N~-9CZZh0PMP^XSmx*827jg<lqCT8cn+Qd$gTl?7s0gdKxeN;=ZA<Z$fA{0tfo2KqdcHV`QRX$*Zslm$o9K?HDp-vioIpR{rCw(0TY1Zf-mr?hCEMK4d4V7&L8-S$N|hVtNNDN>o$~5NK(tB=d;Pm4dFJr8|qrEzAKZn2o3xuU2tr3pEeoYtFQea1s-0+b;Da*v`icNE3GInGnYyFQ#wHy0+^DVCcUMOK?ri4WRqN}x^#uLWsN}=MBws9UU4|-xLbE}5}!-O7(|pVh+9x7m{qUZKsS3}v|%XMQOpCq1&gs^1w9Kq*!moVgo`FJoav*7s)|{xgy;hQtXlqTFo0mdVMP5#Ap!apMG^Z>Y|xu~!9NEv*!spUTP?C&C^owheU%%CahRJc1x~xU`!Nx7Jo(c&4$X38#hQaC*W6wp1T2|ZEj`=SVzTbIO5lY1)?h2C`wb0OEnhc_*XtGvN`Bew<h^<zLI2zPledSoZ`67V4G;VM)<dP`4_OZ<WgcJwwS|Zy`U3rN+cLW~6rk$PImija^@9H6b-**sON32rMOrfzp#Ztm^+b?1*Tv$e>ylY=-31RK*VVSAY8y6g4!mDwz~iH<VDs_><I9W`sG>^U85y=+3o%Wj>(E~ismI;NT@WShJXL2qJ{J(yyYdnR`j&WnY9r{&g`fz%CtTx>&32UIRKHb|mN#COQ9$Ps1YKP-!Lx~qT!+Q_U3aU(l<GZ{uayFA9Qr0zts1p>T?_LlZu2l!s~~p@zuPq4zC1K+S@{B$dx?v&^k!72fQg<45wO$rtV-&n?!J<Xt0?)F9nS%eVBE*30QKyA7hGw1KS<g!a5iP}7xs|l5Q3y2s(g`z5RmZ|8b;-*XHLD$JHiK@=%F?0x~a?nq1L3aCM~8qTB*=XR>~Sx&@I(hT?s8x6QGS^=RSDQK}LrBX38OeWHAFr^9H6xet^`&d(6Brpds<{0?ud}aNsv>90d$mI@JZxB3G;IU?m!$?$H3Lo~S`(@Pu&+0wmX4%YpRahf-HoX-8)(1-}Dma<04f!|ob_-y8UkZ+qP}3`VfvrQF~>B>V=?!wZ){y>&x@?@VBtF5t}>yco$bSyNJ2EDT*JWvClufqsvC?%#N5i$i#bfOqDz!7L7#^$Z>~k^+Zyqb?DM8wlx@MkjYFZbkkrJ5?23afRVPP+m!J*kP>dR=G$MI7O)NjI4Hl0W5fc(Q$?;41F~Ls0y@nDp|$kj40BsKm-Waf)-7VV_Eap(pKHvx-VX3(CK)b-IwKe8O~DWy`g$3-%LjY@A@EvK}Gv`(WU|czf9mL)~0**-kKgAeA`=F4{j*eR@Sa9^Vv7>WYzJuI}-|hi`P(PL#a)x*`)=tVmkntjmI2{LuF#R$JUZR0$&LM$>Ce_LIo`O;HXPprs1gTMMVQTUeMZtN?sNiYNc#SQ0+9yu}@id3q4xNabK%*EwM*hQpY>sLB#2JhlPBK1?&Z1F%YMiO$Dk?aQ4u<#LIWZRf%l1n8u+~Gq4KPpq|-V$a_FlVKJWt3+tB)L`w3JJ%FzS^j@I?Kp))roYgdfWj#ab8o`9lgdSm5Rqo&@qkPpw?!K)g4F{lnH**M09%-JJqHu>T)FLYZq0WR5BR9zc(3%wn%TnrIYEUeAAmg;^((k1}>*9%?kN!<hhUH~V7!wR6a%I!)Hb*P_4TVs>WrC$4OlN|pkmW%X-vD2uc!8H#q|$^90|lPmq+%h+Qdu{@Em2#-MlNrBuu24>W|Ev#no0wL6j|^I)J+|vsIe`eu6+tIRPuf~#mxQam+|=WkAHRk_`k^m+7DYPIf68)+%;>Q6e>b#kQP>+_Y00!l_3bsjhD=ByeRp2LqZBB7@{7%kP=2)oK<W_F{}}Xf>!?|n?zqU$`a%8^oZoOyB-~M{)=}$cRPQbT=#lw=+VNfF4105LH$48@&Y$*FHVVXA~-(ssQv!$-~Ttpv*tXrocnYd`3>OJN0WOTEw~@d<62wY4f!+sT;0m8JK2!bl2x6_^&|VyL#(ToyVSBtig{bMsIg564}6!`uVH`-FDo2=0O93lpwcux@(8@ln9b1bq^AY27W}kn8ieo+@$1KBbdH}Pe8MRKUZ6P_i)o4hR=&jVD87&lzW7WJcqNrWb<0*aQ+g1w?-fd?azZL{WJ(JRns2n*nG|m~BjD8Jfo$w|3p1>>FwgKoYEtMK$S>$nPu4R~!*v&^yfzGk3~oy`5!Y1q2nUb)6H8Bo=SnG<G@NAeNcC>!CqyD|$LPq$Ea2`<@Qw{mw@YN88%R0KXsmJX=gz%F=bqm*z!Wn{preNqOkWt??tuOotvUrKkYe6%lQe|(0Q~LE>6&b$DIuD2Di0g?UJdTO8QgnsY?SA;AkK_yz5eytHBMW1x_fmLZP|gJ#HuwBfC>9rkVj%Ijm}Vh(FFq+L!hBd-b+PCaraO@+nU0m`nKCo-Vi@9Men<L?BW-+fifI*CzRI$wOCj<yDcL~*3&(QogHp5r8dJ087>ARfsZ%Ai`tDVGYu_pX~qJA(y%hTvu`L^5RM1p5^oD+aWte0r$x1=b`6ziH^^}43<B2tr@?$lX_QKk#4r#kA|OM>`iHm#N=#y`|MK+Y4d{Ytz@q^~HlHrx<aM$zSd6374{sqV%sX?4DV7Q8fxrBvXrbg|7_!cabvjYpQSTjKS-gNy#?M%?0=F*O)8Cy06jix&Satoa0|9oUMMQI!#0iAeX=j-S;5^P^yy4=DkNjfU@i0pFc*nyqeTHQc2q1vQbiq35jO||VbT<s9yFl|UMitra{c-e<lhdCLk53u2CgbSE$-AFfnf_qK&x??f+^zKB_}y{z;r-Dmd$hm5_i#X;<LKz^-`TsL&t9FpJv@1P_K(x!v!mxfpB=q8IXoKnRL_UE&p*6;d31Vo2u&w%-nnP5PLB=_-Pgx&j?acYpySOU8;y4qtH!WV;~m0S5H#MI$PI*OH36^B$urzQo~<H}&6W}6C9t6X8b$ELOHFX`0{$Tl2bdQQqPe^wf|aGRMM~HSmJ{LN%kltwm&S`A6F=~1^^{$sEQ1tfIi9HmV)~qdhbYEh`%oTpyi?}3KAgTD?^x{S1{Q$7g&OScR&I(6FnNWQneon(5-!#6ZUagQvjVJ|i<geRp{W-BYAC*Bk+@_sv%4{wMSuJc9flbkloUKmfL5V^3c_(1%Ge6P98BXhe^IoW)xqU2jKI9AJgf<3W%#rL$KeP8t!f|3<8nS2Ey+&}N*4wJ7Qf^WEzJaa9h%X$9u3w_fMoasSU#4&KtObds*w!XHS|@>hvOX_-7FxYXw`~R1NN&bM}2oq++6?4)&+F*2?q=_y^a)_V74-^S+zznU|P_mfKlpuP{>;CM$(`vaBHhTlLhmLgP>OUC!5rWwd9}Lbj>v<{<OLEzZMB!G&gY?fl|awDlD&<2dXMxX6s)yRJj?dC?PkZ7>i6ZYv^elNFuH?R+o>o`C{LIsUGi0UO~(Y!>GSzFw~%i)j;_!wtG{cPmv%X9FyjM{5MudFjguStK}JZRkyW(ojTS!=Uqr(2-~j3SIM-50T9-hC*9O7cT+2^Dn!wvxZ9$p?25=pP4wh8It~g!`g0UrD-j&%WXcUZgyECI1JQF-2V1KJY#iRYynJCrIo7eB)V8Li#EV7h3ArLFCpogmvMW^8<?KdNr#9EaaD|z|s?r!^{hp^0h|eequ22I{SU>VRbcaG75|p4B2Y0|{W)w#qT`aaxQ^+5`nWn(ZA?&5~%u%;9kN}9jwyg+hs}f(ORqZO;vWAhZR3Da6kYn#1f7YsRnw-j}Gnko~8is?fFL?DT<V@Ok8ECkY>h_xq91m%J^xKk$X5-Gwi;A!13-&I!8iU*P9eeoL-tQXLNY(f7$3_nyJNvbJ41^xjUKu!-*;hl|bNVgVd;NC&%5PlWivKu6$Ma9ET|Vx2?QV^bO#&bQ1&dR=sPq*n+5i3Dx1;9}9AqE_xvQ!+e;)fw?s2wUAX<Q1SvbllX9p4gA_;s3?wp3`22_0VzpgOC;~PGYZH6g<B`fPcUm|#$<YwNv@Ry)8To7MZmOjE3s_9BUSzAmSjSOUyDwxm>Q+(HjlcHgxC^BiQ`~D}=i8pT~S+{OZ6uV$;kxw8fvTpKK<?{=tgNozsED&LfhR}D@Tfy(`s)WyOzuSL=%Ddkk^!tPU<2oNs8fjRPlQiHAH6{wj@gV{&Qf~_Uk^Ut%Lhp6Ed+^;qc>dz>=;e>Ej{o*kB~gG5bxW=F7P(GGMkV@35i}|^8DE&Hk^?jisq6H*o$lV5UcO3Xd;v%;c|f4PxZ=&-Q<ocDjGVuc)a><kyM5ZyhM_4|eaA}+g=NHMx&^TQf6PHVUH'
ROOT = Path('/root/funecob')
COMPOSE = ROOT / 'docker-compose.yml'
ENV = ROOT / '.env'
FUNCTION = ROOT / 'supabase/functions/pix-ocr-settlement/index.ts'
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
    if 'async function runLocalOcr(' in old_function:
        raise RuntimeError('OCR local ja instalado; nenhuma alteracao realizada.')
    start = old_function.find('async function runGeminiDirectOcr(')
    end = old_function.find('async function processEvent(', start)
    if start < 0 or end < start or old_function.count('async function runGeminiDirectOcr(') != 1:
        raise RuntimeError('Codigo diferente do esperado; nenhuma alteracao realizada.')
    updated_function = old_function[:start] + files['adapter.ts'] + '\n' + old_function[end:]
    updated_function = re.sub(r'^const GEMINI_API_KEY = .*;\n', '', updated_function, flags=re.M)
    # The whole financial pipeline must remain byte-for-byte identical.
    if updated_function[updated_function.index('async function processEvent('):] != old_function[end:]:
        raise RuntimeError('Validacao das regras financeiras falhou.')
    old_compose = COMPOSE.read_text()
    if '\n  funecob-ocr:' in old_compose:
        raise RuntimeError('Servico OCR ja existe; nenhuma alteracao realizada.')
    match = re.search(r'(?ms)^  funecob-edge-functions:\n.*?(?=^  [A-Za-z0-9_-]+:\n|\Z)', old_compose)
    if not match or '    environment:\n' not in match[0]:
        raise RuntimeError('Servico Edge Functions nao localizado no Compose.')
    edge = match[0].replace('    environment:\n', '    environment:\n      OCR_LOCAL_URL: http://funecob-ocr:8080/ocr\n      OCR_LOCAL_TOKEN: ${OCR_LOCAL_TOKEN:?OCR_LOCAL_TOKEN ausente}\n', 1)
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
    updated_compose = old_compose[:match.start()] + edge + old_compose[match.end():] + service
    old_env = ENV.read_text()
    token = secrets.token_urlsafe(32)
    updated_env = re.sub(r'(?m)^[ \t]*(?:export[ \t]+)?OCR_LOCAL_TOKEN[ \t]*=.*\n?', '', old_env).rstrip('\n') + '\nOCR_LOCAL_TOKEN=' + token + '\n'
    backup = ROOT / '.local-ocr-backups' / datetime.now().strftime('%Y%m%d-%H%M%S')
    backup.parent.mkdir(mode=0o700, exist_ok=True)
    backup.mkdir(mode=0o700)
    for path in (COMPOSE, ENV, FUNCTION):
        target = backup / path.name
        shutil.copy2(path, target)
        os.chmod(target, 0o600)
    print('Backup criado:', backup, flush=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name in ('server.py', 'receipt.py', 'Dockerfile', 'test_receipt.py'):
        (ASSETS / name).write_text(files[name])
    edge_changed = False
    try:
        # Isolated OCR starts first. The live financial function is still untouched.
        write_private(ENV, updated_env)
        write_private(COMPOSE, updated_compose)
        dc('config', '--quiet', capture=True)
        dc('build', 'funecob-ocr')
        dc('up', '-d', '--no-deps', 'funecob-ocr')
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
        write_private(FUNCTION, updated_function)
        os.chmod(FUNCTION, original_function_mode)
        edge_changed = True
        dc('up', '-d', '--no-deps', '--force-recreate', 'funecob-edge-functions')
        # Empty body must return 400 before any invoice/event write, proving worker loaded.
        probe = 'curl -sS --max-time 20 -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" --data "{}" "$KONG_INTERNAL_URL/functions/v1/pix-ocr-settlement"'
        code = command(['docker', 'exec', 'funecob-cron', 'sh', '-c', probe], capture=True, timeout=25).stdout.strip()
        if code != '400':
            raise RuntimeError('Validacao da Edge Function falhou (HTTP ' + code + ').')
        print('OCR local instalado e testes PNG/PDF aprovados. Regras de baixa preservadas.')
        print('Nenhum comprovante antigo foi reprocessado por este instalador.')
    except Exception:
        print('Falha: restaurando arquivos do backup.', flush=True)
        for path in (COMPOSE, ENV, FUNCTION):
            shutil.copy2(backup / path.name, path)
        if edge_changed:
            dc('up', '-d', '--no-deps', '--force-recreate', 'funecob-edge-functions')
        subprocess.run(['docker', 'stop', 'funecob-ocr'], capture_output=True)
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Avoid printing subprocess stdout/stderr: Compose can contain secrets.
        print('INSTALACAO NAO CONCLUIDA:', str(error) if not isinstance(error, subprocess.CalledProcessError) else 'Um comando falhou; arquivos restaurados.', file=sys.stderr)
        sys.exit(1)
