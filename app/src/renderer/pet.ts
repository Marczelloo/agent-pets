import { TAU } from "./math";
import { K, DEF, SPR } from "./pose";
import { SCENES } from "./scenes";
import { rng } from "./rng";
import { SKINS, type SkinId } from "../skins";
export interface Pet { type: SkinId; p: Record<string, { x: number; v: number }>; parts: any[]; [key: string]: any }
export function createPet(type: SkinId,st: string): Pet{const c: Pet={type,p:{},parts:[],spawn:0,blink:0,nb:1+rng()*2,aa:0,av:0,hp:rng(),f:20,hand:[[-30,-30],[30,-30]],aHand:[[-30,-30],[30,-30]],kph:0,prop:null,hold:null,boltAng:0,pageSeed:0};K.forEach((k: any)=>c.p[k]={x:0,v:0});setScene(c,st,true);return c;}
export function startAct(c: any,a: any){c.act=a;c.aT=0;c.pend=null;if(a[3])a[3](c);}
export function setScene(c: any,st: any,inst: any){c.st=st;c.seqI=0;const s=SCENES[st];startAct(c,s.seq?s.seq[0]:s.acts[0]);if(inst){const tg=targets(c,0);c.prop=tg._prop||null;c.hold=tg._hold||null;tg.propA=c.prop?1:0;tg.holdA=c.hold?1:0;K.forEach((k: any)=>{c.p[k].x=tg[k];c.p[k].v=0;});c.tg=tg;}}
export function nextAct(c: any){const s=SCENES[c.st];if(c.act[4])c.act[4](c);c.p.th.x-=TAU*Math.round(c.p.th.x/TAU);
if(s.seq&&c.seqI<s.seq.length-1){c.seqI++;startAct(c,s.seq[c.seqI]);return;}
if(s.seq&&c.seqI===s.seq.length-1){c.seqI++;startAct(c,s.acts[0]);return;}
const acts=s.acts;if(s.cycle){startAct(c,acts[(acts.indexOf(c.act)+1)%acts.length]);return;}
let a=acts[0];if(c.act===acts[0]&&acts.length>1&&rng()>.3)a=acts[1+Math.floor(rng()*(acts.length-1))];startAct(c,a);}
export function targets(c: any,t: any){const o=Object.assign({},DEF,SCENES[c.st].base,c.act[2](c.aT,c,t)||{});['L','R'].forEach((k: any,i: any)=>{if(!o['ik'+k]){o['hx'+k]=c.aHand[i][0];o['hy'+k]=c.aHand[i][1];}});return o;}
function slot(c: any,tg: any,key: any,ak: any){const nm=key.slice(1),want=tg[key]||null,P=c.p[ak];if(want&&want!==c[nm]){if(!c[nm]||P.x<.1)c[nm]=want;else{tg[ak]=0;return;}}tg[ak]=want?1:0;if(!want&&P.x<.03)c[nm]=null;}
export function stepPet(c: any,dt: any,t: any){c.aT+=dt;if(c.pend&&c.aT>=c.pend.t){const f=c.pend.fn;c.pend=null;f();}if(c.aT>c.act[1])nextAct(c);
const tg=targets(c,t);c.tg=tg;c.f=tg._f||20;c.hp+=(tg._hf||.85)*dt;slot(c,tg,'_prop','propA');slot(c,tg,'_hold','holdA');const P=c.p;
K.forEach((k: any)=>{const s=P[k],sp=SPR[k]||[90,16];s.v+=((tg[k]-s.x)*sp[0]-s.v*sp[1])*dt;s.x+=s.v*dt;});
if(tg._poleDirect){const nv=(tg.pole-P.pole.x)/dt;P.pole.v=P.pole.v*.6+nv*.4;P.pole.x=tg.pole;}
c.nb-=dt;if(c.nb<0){c.blink=.16;c.nb=2.5+rng()*3;}c.blink=Math.max(0,c.blink-dt);
if(SKINS[c.type as SkinId].antenna){const drive=-P.th.v*.8+Math.sin(t*1.7)*.4+(P.hopW.x>.1?Math.cos(TAU*(c.hp%1))*1.5*P.hopW.x:0)+P.typeW.x*Math.sin(t*20)*1.2+P.walkW.x*Math.sin(t*10)*1.2;c.av+=(drive*20-c.aa*120-c.av*7)*dt;c.aa+=c.av*dt;}
c.parts=c.parts.filter((q: any)=>(q.life+=dt)<q.max);c.parts.forEach((q: any)=>{if(q.k==='plane')q.vy=-25+Math.sin(q.life*5)*45;q.x+=(q.vx||0)*dt;q.y+=(q.vy||0)*dt;q.vy+=(q.g||0)*dt;});
if(tg._knock){const ph=Math.floor(t*16/TAU+.75);if(ph!==c.kph){c.kph=ph;const[hx,hy]=c.hand[1];c.parts.push({k:'imp',x:hx+6,y:hy,life:0,max:.35});if(rng()<.6)c.parts.push({t:'puk',x:hx+16,y:hy-10,vx:14,vy:-24,life:0,max:.7,s:11,col:'mute'});}}
c.spawn-=dt;if(c.spawn<0){c.spawn=.3;const R=rng;
if(P.loaf.x>.6&&R()<.35)c.parts.push({t:'z',x:20,y:-66,vx:14,vy:-22,life:0,max:2.2,s:13,grow:1,col:'mute'});
if(P.typeW.x>.6&&tg._parts==='code')c.parts.push({t:['{','}',';','</>','=>','*'][Math.floor(R()*6)],x:80,y:-88,vx:6+R()*10,vy:-26,life:0,max:1.1,s:11,col:'clay'});
if(P.typeW.x>.6&&tg._parts==='bash'&&R()<.7)c.parts.push({t:['$','>_','&&','|','~/','ls'][Math.floor(R()*6)],x:102,y:-108,vx:4+R()*10,vy:-26,life:0,max:1.1,s:11,col:'teal'});
if(P.squint.x>.4&&R()<.25)c.parts.push({k:'drop',x:-26+R()*8,y:-70,vx:-20,vy:-20,g:160,life:0,max:.7});
if(tg._notes&&R()<.6)c.parts.push({t:R()<.5?'♪':'♫',x:(R()-.5)*120,y:-60-R()*30,vx:(R()-.5)*20,vy:-35,life:0,max:1.3,s:14,col:'clay'});
if(P.happy.x>.6&&R()<.3)c.parts.push({t:'✦',x:(R()-.5)*110,y:-70-R()*40,vx:0,vy:-8,life:0,max:1.2,s:10+R()*6,col:'clay',tw:1});}}
