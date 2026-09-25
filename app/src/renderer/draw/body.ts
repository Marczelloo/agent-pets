import { PI, TAU, cl, lerpC } from "../math";
import { pen, rrP, elP, path, shp, hose, mitt } from "../pen";
import { drawProp, drawPillow, drawMug } from "./props";
import { drawItems } from "./items";
import { drawHeadFx, drawWorldFx } from "./overlay";
import { SKINS } from "../../skins";
import type { Pet } from "../pet";
import { ACCENT, STYLES } from "../../styles";
import { MOTIONS } from "../../motion";
import { drawSticker } from "../models/sticker";
import { drawPixel } from "../models/pixel";
import { DEFAULT_LOOK } from "../../look";
import type { Look } from "../../types";
export function drawPet(x: CanvasRenderingContext2D,c: Pet,X: number,Y: number,u: number,t: number,look?: Look){pen.sid=0;
const lk=look??DEFAULT_LOOK,st=STYLES[lk.style]??STYLES.clean;pen.st=st;pen.accent=ACCENT[c.type];if(st.sketch)pen.boil=Math.floor(t*st.sketch.boilHz);pen.ol=st.ink(pen.accent);const mo=MOTIONS[lk.motion]??MOTIONS.calm;pen.squash=mo.squash;pen.fx=mo.emotes;
if(st.model==='sticker')return drawSticker(x,c,X,Y,u,t,lk);if(st.model==='pixel')return drawPixel(x,c,X,Y,u,t,lk);
const P=c.p,tg=c.tg||{},sk=SKINS[c.type],pal=sk.pal;
const gr=cl(P.grey.x),cm=lerpC(pal.m,pal.g,gr),cs=lerpC(pal.s,pal.gs,gr),cb=lerpC(pal.b,pal.gs,gr);
const wob=cl(P.wobW.x),shk=cl(P.shake.x),th=P.th.x+.4*Math.cos(t*4)*wob+.35*Math.sin(t*28)*shk,co=Math.cos(th),si=Math.sin(th);
const sit=cl(P.sit.x),loaf=cl(P.loaf.x),down=Math.max(sit,loaf),walk=cl(P.walkW.x),lean=cl(P.lean.x);
const hph=c.hp%1;let h=0,sq=0;if(hph<.42){h=Math.sin(PI*hph/.42);sq=.07*Math.cos(PI*hph/.42);}else if(hph<.58){sq=-.13*Math.sin(PI*(hph-.42)/.16);}
const hw=cl(P.hopW.x);h*=hw;sq*=hw*pen.squash;
const wb=Math.abs(Math.sin(t*10))*walk,br=Math.sin(t*(2.3-loaf))*.02*(1+cl(P.sleep.x)*1.5),tb=Math.abs(Math.sin(t*20))*.008*cl(P.typeW.x);
const pil=c.prop==='pillow'?cl(P.propA.x)*loaf:0;
const hopY=(h*24+wb*2.5+pil*4)*u;
const W=(sk.width)*u,Dp=(sk.depth)*u,H=(sk.height)*u*(1-.1*loaf),legH=17*u,bot=-12*u*(1-down),top=bot-H,R=(st.shape?.radius?.[c.type]??sk.radius)*u,lw=Math.max(st.line.minPx,2.4*u*st.line.scale);
const hW=(W*Math.abs(co)+Dp*Math.abs(si))/2,XX=X+P.lx.x*u;
const sc=1+.1*lean,rot=Math.sin(t*4)*.1*wob+Math.sin(t*1.4)*.035*cl(P.think.x)+loaf*.06+pil*.08+P.tilt.x,scx=sc*(1-(sq+br)*.6),scy=sc*(1+sq+br+tb),oy=-hopY+lean*4*u,cr=Math.cos(rot),sr=Math.sin(rot);
const toW=(lx: any,ly: any)=>{const a=lx*scx,b=ly*scy;return [a*cr-b*sr,a*sr+b*cr+oy];};
const GA=(1-.22*cl(P.dim.x))*(c.alpha??1);
const bodyT=()=>{x.save();x.translate(XX,Y+oy);x.rotate(rot);x.scale(scx,scy);x.globalAlpha=GA;x.lineWidth=lw;x.lineJoin='round';x.lineCap='round';x.strokeStyle=pen.ol;};
const worldT=()=>{x.save();x.translate(XX,Y);x.globalAlpha=GA;x.lineWidth=lw;x.lineJoin='round';x.lineCap='round';x.strokeStyle=pen.ol;};
const pj=(lx: any,lz: any)=>[lx*co+lz*si,-lx*si+lz*co];
if(st.sketch){x.save();x.strokeStyle='rgba(59,58,56,0.35)';x.lineWidth=Math.max(.8,1.2*u);x.beginPath();for(let i=-2;i<=2;i++){const w=hW*1.1*(1-Math.abs(i)*.18)*(1-h*.3);x.moveTo(XX-w,Y+i*2*u);x.lineTo(XX+w,Y+i*2*u);}x.stroke();x.restore();}else{
x.save();if(st.softShadow)x.filter=`blur(${Math.max(1,3*u)}px)`;x.fillStyle='rgba(0,0,0,0.16)';x.beginPath();x.ellipse(XX,Y,hW*1.1*(1-h*.3),Math.max(2,7*u)*(1-h*.3),0,0,TAU);x.fill();x.restore();}
worldT();drawPillow(x,c,u,lw);x.restore();
const shY=top+H*.52,AL=(sk.armLen)*u,thk=9*u,mr=(sk.mitt)*u;
const arms=[-1,1].map((s: any)=>{const k=s<0?'L':'R',q=pj(s*.46*W,0),sw0=toW(q[0],shY);const a=P['arm'+k].x+P['osc'+k].x*Math.sin(t*c.f+(s<0?1.7:0)),fw=walk*Math.sin(t*10+(s<0?0:PI))*.6;const ox=s*Math.sin(a),oy=Math.cos(a),up=Math.max(0,-oy),oz=.22+.2*up+fw,n=Math.hypot(ox,oy,oz)||1,hq=pj(ox/n,oz/n),pl=Math.hypot(hq[0],oy/n),AE=AL*(1+.75*up);const ah=[sw0[0]+hq[0]*AE*.92,sw0[1]+oy/n*AE*.92];const ik=cl(P['ik'+k].x);const dE=(q[1]+hq[1]*AL*.5)*(1-ik)+ik*10*u,fr=cl((dE+3*u)/(6*u));let sw=sw0;if(q[1]<0){const m=cl(-q[1]/(8*u))*fr,e=toW(Math.sign(q[0]||s)*(hW-3*u),shY);sw=[sw0[0]+(e[0]-sw0[0])*m,sw0[1]+(e[1]-sw0[1])*m];}return {s,k,sw,ah,ik,fr,L:AL*ik+(1-ik)*AE*cl(pl*.97,.3,1),hx:ah[0]*(1-ik)+P['hx'+k].x*u*ik,hy:ah[1]*(1-ik)+P['hy'+k].x*u*ik};});

c.hand=arms.map((a: any)=>[a.hx/u,a.hy/u]);c.aHand=arms.map((a: any)=>[a.ah[0]/u,a.ah[1]/u]);
bodyT();
const LG=sk.legs,lwid=(sk.legW)*u;
const legs=LG.map(([a,b],i)=>{const q=pj(a*W,b*Dp);return {x:q[0],z:q[1],i};}).sort((a: any,b: any)=>a.z-b.z);
const lLen=legH*(1-down);
if(lLen>1)legs.forEach((g: any)=>{const lift=Math.max(0,Math.sin(t*10+g.i*PI))*5*u*walk;shp(x,rrP(g.x-lwid/2,bot-5*u-lift,lwid,lLen+5*u,3.5*u),g.z<-.5*u?cs:cm,u);});
x.restore();
worldT();arms.forEach((a: any)=>{if(a.fr<1){hose(x,a,a.L,thk,cm,u,lw);mitt(x,a,mr,cm,u);}});const netBack=c.hold==='net'&&P.pole.x<-.3;if(netBack)drawItems(x,c,arms,u,t,lw);x.restore();
bodyT();
if(sk.antenna){const by=top+2*u,len=15*u,tx=Math.sin(c.aa)*len,ty=by-Math.cos(c.aa)*len;x.beginPath();x.moveTo(0,by);x.lineTo(tx,ty);x.stroke();shp(x,elP(tx,ty,4.5*u,4.5*u),gr>.5?'#E24B4A':'#5DCAA5',u);}
if(st.extras?.ears&&c.type==='clawd')[-1,1].forEach((s: number)=>shp(x,rrP(s>0?hW-3*u:-hW-7*u,top+H*.36,10*u,H*.3,3*u),cm,u));
shp(x,rrP(-hW,top,hW*2,H,R),st.shape?.flatSide?cm:cs,u,{hatch:!st.shape?.flatSide});
const fwid=W*Math.abs(co),front=co>=0,fcx=(front?1:-1)*Dp/2*si;
if(fwid>1.5){shp(x,rrP(fcx-fwid/2,top,fwid,H,Math.min(R,fwid/2)),front?cm:cb,u,st.shape?.flatSide?{noStroke:1}:undefined);
x.save();x.globalAlpha=GA*.55;shp(x,rrP(fcx-fwid/2+R*.7+3*u*Math.abs(co),top+4*u,Math.max(.1,fwid-R*1.4-6*u*Math.abs(co)),4.5*u,2.2*u),pal.h,u,{noStroke:1});x.restore();
if(!front&&sk.backVents&&fwid>6*u){x.save();x.lineWidth=lw*.7;x.beginPath();for(let i=0;i<3;i++){const yy=top+H*(.35+.13*i);x.moveTo(fcx-fwid*.25,yy);x.lineTo(fcx+fwid*.25,yy);}x.stroke();x.restore();}}
if(st.extras?.phones&&c.type==='kodek'){const yy=top+H*.45;[-1,1].forEach((s: number)=>{shp(x,elP(s*hW,yy,6*u,11*u),'#E8E6E0',u);shp(x,elP(s*hW,yy,3*u,7*u),'#B9B6AE',u,{noStroke:1});});}
const ey=top+H*.42+P.look.x*4.5*u,exs=P.ex.x*4*u*co;
const bl=c.blink>0?Math.sin(PI*(c.blink/.16)):0,sl=cl(P.sleep.x),hp=cl(P.happy.x),dz=cl(P.dizzy.x),sqn=cl(P.squint.x);
const open=Math.max(0,1-Math.max(bl,sl,hp,dz,sqn)),ea=cl(co*3),saver=sk.screenFace&&loaf>.5;
let ecol=st.face?.eyes==='accent'?pen.ol:'#1E1410';
if(front&&fwid>4*u){
if(sk.screenFace){const m=8*u*co,sx0=fcx-fwid/2+m,sy0=top+8*u,sw=fwid-2*m,sh=H-20*u,tw=cl(P.typeW.x);shp(x,rrP(sx0,sy0,sw,sh,9*u*co),'#2C2C2A',u);ecol='#5DCAA5';
x.save();path(x,rrP(sx0,sy0,sw,sh,9*u*co),0,0);x.clip();
if(tw>.02){x.globalAlpha=GA*tw;x.fillStyle=ecol;const off=(t*18*u)%(6*u);for(let i=0;i<4;i++){const ly=sy0+sh*.66+i*6*u-off;const ww=sw*(.2+.5*(((i*7+Math.floor(t*3))%5)/5));x.fillRect(sx0+6*u*co,ly,ww,2.2*u);}}
if(saver){const tri=(v: any)=>Math.abs((((v%1)+1)%1)*2-1);x.globalAlpha=GA*loaf*.85;x.fillStyle=ecol;x.fillRect(sx0+3*u+(sw-9*u)*tri(t*.23),sy0+3*u+(sh-9*u)*tri(t*.31),3.5*u,3.5*u);}
x.restore();
if((Math.floor(t*2.2)%2)&&open>.3){x.save();x.globalAlpha=GA*(1-tw)*open*ea;x.fillStyle=ecol;x.fillRect(fcx-5*u*co,top+H*.66,10*u*co,3*u);x.restore();}}
[-1,1].forEach((s: any)=>{const ex=fcx+s*(sk.eyeX)*W*co+exs,ew=(sk.eyeW)*u*Math.sqrt(Math.max(0,co)),eh=(sk.eyeH)*u;
x.save();x.fillStyle=ecol;x.strokeStyle=ecol;x.lineWidth=Math.max(1,2.6*u);
if(open>.02&&!saver){x.globalAlpha=GA*ea;shp(x,rrP(ex-ew/2,ey-eh*open/2,ew,Math.max(.5,eh*open),ew/2),ecol,u,{noStroke:1,j:.5,raw:1});if(sk.eyeGlint){x.fillStyle='#FFFFFF';x.beginPath();x.arc(ex+ew*.18,ey-eh*open*.22,2.4*u*open,0,TAU);x.fill();}}
if(sl>.02&&!saver){x.globalAlpha=GA*ea*sl;x.beginPath();x.arc(ex,ey-2*u,5.5*u,.15*PI,.85*PI);x.stroke();}
if(sqn>.05){x.globalAlpha=GA*ea*sqn;x.beginPath();x.moveTo(ex-5*u,ey-3*u*s);x.lineTo(ex+5*u,ey+3*u*s);x.moveTo(ex-5*u,ey+1*u);x.lineTo(ex+5*u,ey+1*u);x.stroke();}
if(hp>.02){x.globalAlpha=GA*ea*hp;x.beginPath();x.arc(ex,ey+5*u,5.5*u,1.15*PI,1.85*PI);x.stroke();}
if(pen.fx&&hp>.3){x.globalAlpha=GA*ea*hp;x.fillStyle='#FFFFFF';x.font=`${Math.max(6,10*u)}px ${pen.font}`;x.textAlign='center';x.textBaseline='middle';x.fillText('✦',ex+ew*.5,ey-eh*.35);}
if(dz>.02){x.globalAlpha=GA*ea*dz;const k=5*u;x.beginPath();x.moveTo(ex-k,ey-k);x.lineTo(ex+k,ey+k);x.moveTo(ex+k,ey-k);x.lineTo(ex-k,ey+k);x.stroke();}
if(st.face?.smile&&!sk.screenFace&&s>0&&open>.3&&hp<.02){x.globalAlpha=GA*ea;x.strokeStyle=pen.ol;x.lineWidth=Math.max(1,2.2*u);x.beginPath();x.arc(fcx,ey+eh*.45,5*u*co,.15*PI,.85*PI);x.stroke();}
if((hp>.02||st.face?.blush)&&sk.blush){x.globalAlpha=GA*ea*Math.max(hp,st.face?.blush?.75:0)*.6;x.fillStyle='#F0997B';x.beginPath();x.ellipse(ex+s*6*u*co,ey+14*u,6*u*co,3.5*u,0,0,TAU);x.fill();}
x.restore();});}
x.globalAlpha=GA;x.strokeStyle=pen.ol;x.lineWidth=lw;
if(sit>.05&&loaf<.5){legs.filter((g: any)=>!sk.frontLegsOnlySitting||g.z>=-.5*u).forEach((g: any)=>{const sw=Math.sin(t*6+g.i*2)*2.5*u*cl(P.swing.x);x.save();x.globalAlpha=GA*sit;shp(x,elP(g.x+si*6*u,-3*u+sw,7*u,5*u),cm,u);x.restore();});}
x.restore();
worldT();drawProp(x,c,u,t,lw);
arms.forEach((a: any)=>{if(a.fr>0){x.globalAlpha=GA*a.fr;hose(x,a,a.L,thk,cm,u,lw);x.globalAlpha=GA;}});
if(!netBack)drawItems(x,c,arms,u,t,lw);if(tg._mug){const R_=arms[1];drawMug(x,R_.hx-11*u*Math.cos(tg._mugRot||0),R_.hy+6*u-11*u*Math.sin(tg._mugRot||0),u,tg._mugRot||0,t,0);}
arms.forEach((a: any)=>{if(a.fr>0){x.globalAlpha=GA*a.fr;mitt(x,a,mr*(a.s>0&&tg._big?1.3+.2*lean:1),cm,u);x.globalAlpha=GA;}});
x.restore();
bodyT();
drawHeadFx(x,c,u,t,top,hW,GA);
x.restore();
worldT();
drawWorldFx(x,c,arms,u,lw,GA);
x.restore();}
