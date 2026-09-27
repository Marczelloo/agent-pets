// Nakładki wspólne dla modeli (wektorowego i naklejki): dymek „!”, myślenie, zawroty, strona z siatki, cząsteczki.
import { PI, cl } from "../math";
import { PAPER, SPIN, COL } from "../palette";
import { pen, rrP, shp, lines } from "../pen";
import { drawWebPage } from "./items";
import { pagePos } from "../scenes";
import { morph } from "../fold";
import type { Pet } from "../pet";

/** W przestrzeni bryły (nad głową): `top` i `hW` jak w body.ts. */
export function drawHeadFx(x: any,c: Pet,u: number,t: number,top: number,hW: number,GA: number){const P=c.p,dz=cl(P.dizzy.x);
drawPhones(x,c,u,top,hW,GA);
const bs=Math.max(0,P.bubble.x);if(bs>.02){x.save();x.translate(-hW*.62,top-20*u);x.scale(bs,bs);shp(x,[[5*u,8*u],[10*u,18*u],[-2*u,9*u]],'#D97757',u);shp(x,rrP(-12*u,-13*u,24*u,24*u,7*u),'#D97757',u);x.fillStyle='#FFFFFF';x.font=`500 ${Math.max(8,17*u)}px ${pen.font}`;x.textAlign='center';x.textBaseline='middle';x.fillText('!',0,0);x.restore();}
const tk=cl(P.think.x);if(tk>.02){x.save();x.globalAlpha=GA*tk;const an=t*2.2;x.translate(Math.cos(an)*30*u,top-22*u+Math.sin(an)*6*u);x.rotate(t*1.5);x.fillStyle='#D97757';x.font=`${Math.max(9,22*u)}px ${pen.font}`;x.textAlign='center';x.textBaseline='middle';x.fillText(SPIN[Math.floor(t*8)%SPIN.length],0,0);x.restore();}
if(dz>.02){x.save();x.globalAlpha=GA*dz;x.fillStyle='#EF9F27';x.font=`${Math.max(8,14*u)}px ${pen.font}`;x.textAlign='center';x.textBaseline='middle';for(let i=0;i<3;i++){const an=t*3+i*2.09;x.fillText('✶',Math.cos(an)*34*u,top-8*u+Math.sin(an)*6*u);}x.restore();}}

const PHONES='#3B3A38';
/** Słuchawki (scena `vibe`): pałąk nad głową, muszle po bokach; zjeżdżają z góry przy `phA` 0→1. */
function drawPhones(x: any,c: Pet,u: number,top: number,hW: number,GA: number){const ph=cl(c.phA||0);if(ph<.02)return;
const cy=top+16*u-(1-ph)*14*u;x.save();x.globalAlpha=GA*ph;phones(x,cy,hW+2*u,cy-top+9*u,u);x.restore();}
/** Kształt słuchawek: pałąk (pół elipsy nad `cy`) i muszle na końcach. */
function phones(x: any,cy: number,rx: number,ry: number,u: number){const bw=Math.max(1.5,4.5*u),ow=Math.max(1,x.lineWidth||2*u);
x.lineCap='round';x.beginPath();x.ellipse(0,cy,rx,ry,0,PI,2*PI);x.strokeStyle=pen.ol;x.lineWidth=bw+2*ow;x.stroke();x.strokeStyle=PHONES;x.lineWidth=bw;x.stroke();
x.lineWidth=ow;x.strokeStyle=pen.ol;[-1,1].forEach((s: number)=>{shp(x,rrP(s*rx-5.5*u,cy-10*u,11*u,20*u,4.5*u),PHONES,u);shp(x,rrP(s*rx-3*u,cy-6*u,6*u,12*u,2.5*u),pen.accent||'#D97757',u,{noStroke:1});});}

/** W przestrzeni świata (względem podstawy zwierzaka): strona z siatki i cząsteczki. */
export function drawWorldFx(x: any,c: Pet,arms: any[],u: number,lw: number,GA: number){const P=c.p,tg=c.tg||{};
if(c.hold==='net'&&tg._page!=null){const a=tg._page;if(a<1.33){const pp=pagePos(a);drawWebPage(x,pp[0]*u,pp[1]*u,1,u,lw,.15*Math.sin(a*3));}
if(a>1.2&&a<1.6){const k=(a-1.2)/.4,Rr=arms[1],ph=P.pole.x;x.globalAlpha=GA*(1-k)*.8;x.strokeStyle='#B4B2A9';x.lineWidth=Math.max(1,2*u);for(let i=0;i<2;i++){x.beginPath();x.arc(Rr.hx,Rr.hy,(64+i*10)*u,ph-PI/2+.25,ph-PI/2+1.1);x.stroke();}}}
c.parts.forEach((q: any)=>{const k=q.life/q.max,px=q.x*u,py=q.y*u;x.save();x.globalAlpha=(1-k)*(q.tw?(.6+.4*Math.sin(q.life*14)):1);x.lineWidth=Math.max(1,2*u);x.strokeStyle=pen.ol;x.lineJoin='round';
if(q.k==='imp'){x.strokeStyle='#D97757';x.beginPath();[-.8,0,.8].forEach((a: any)=>{const r1=(4+k*8)*u,r2=r1+5*u;x.moveTo(px+Math.cos(a)*r1,py+Math.sin(a)*r1);x.lineTo(px+Math.cos(a)*r2,py+Math.sin(a)*r2);});x.stroke();}
else if(q.k==='plane'){x.globalAlpha=k>.8?(1-k)*5:1;x.translate(px,py);x.rotate(Math.atan2(q.vy,q.vx)*.6);shp(x,morph(1,u),PAPER,u);}
else if(q.k==='page'){x.translate(px,py);x.rotate(-.5+Math.sin(q.life*5)*.6);x.scale(Math.cos(q.life*7),1);shp(x,rrP(-13*u,-11*u,26*u,22*u,1.5*u),PAPER,u);lines(x,-9*u,-5*u,16*u,3,5*u,'#B4B2A9',u,3);}
else if(q.k==='phones'){x.translate(px,py);x.rotate(q.life*(q.spin||8));phones(x,8*u,30*u,22*u,u);}
else if(q.k==='drop'){x.fillStyle='#85B7EB';x.beginPath();x.moveTo(px,py-4*u);x.quadraticCurveTo(px+3.5*u,py+1*u,px,py+2.5*u);x.quadraticCurveTo(px-3.5*u,py+1*u,px,py-4*u);x.fill();x.lineWidth=Math.max(.6,1*u);x.stroke();}
else{x.fillStyle=COL[q.col]||COL.clay;x.font=`${Math.max(8,q.s*u*(q.grow?1+k:1))}px ${pen.font}`;x.textAlign='center';x.fillText(q.t,px,py);}
x.restore();});}
