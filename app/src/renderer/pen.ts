import { PI, TAU, hr } from "./math";
import { OL } from "./palette";
import { clean } from "../styles/clean";
import type { StyleDef } from "../styles/types";
import { darken, lighten } from "./color";
/** Stan rysowania jednej klatki; `drawPet` ustawia styl, kolor konturu i akcent przy każdym wywołaniu. */
export const pen = { boil: 0, sid: 0, font: "sans-serif", st: clean as StyleDef, ol: OL as string, accent: '#D97757', fx: false, squash: 1 };
export function rrP(X: any,Y: any,W: any,H: any,R: any){if(W<0){X+=W;W=-W;}W=Math.max(W,.01);H=Math.max(H,.01);R=Math.max(0,Math.min(R,W/2,H/2));const p: number[][]=[],n=5;[[X+W-R,Y+R,-PI/2],[X+W-R,Y+H-R,0],[X+R,Y+H-R,PI/2],[X+R,Y+R,PI]].forEach(([cx,cy,a0])=>{for(let i=0;i<=n;i++){const a=a0+PI/2*i/n;p.push([cx+Math.cos(a)*R,cy+Math.sin(a)*R]);}});return p;}
export function elP(cx: any,cy: any,rx: any,ry: any,rot?: any){const p=[],cr=Math.cos(rot||0),sr=Math.sin(rot||0);for(let i=0;i<18;i++){const a=TAU*i/18,ex=Math.cos(a)*rx,ey=Math.sin(a)*ry;p.push([cx+ex*cr-ey*sr,cy+ex*sr+ey*cr]);}return p;}
export function path(x: any,p: any,j: any,seed: any){x.beginPath();p.forEach((q: any,i: any)=>{const dx=j?(hr(seed+i*1.7)-.5)*j:0,dy=j?(hr(seed+i*2.3+50)-.5)*j:0;i?x.lineTo(q[0]+dx,q[1]+dy):x.moveTo(q[0]+dx,q[1]+dy);});x.closePath();}
export function bbox(p: any){let a=1e9,b=1e9,c=-1e9,d=-1e9;p.forEach((q: any)=>{a=Math.min(a,q[0]);b=Math.min(b,q[1]);c=Math.max(c,q[0]);d=Math.max(d,q[1]);});return [a,b,c,d];}
export function shp(x: any,p: any,fill: any,u: any,o?: any){o=o||{};const st=pen.st,sk=st.sketch,id=++pen.sid,
j=sk?Math.max(1.4*u,sk.jitterPx)*(o.j==null?1:o.j):0,s=pen.boil*977+id*131,f=fill&&st.fillFor?st.fillFor(fill):fill;
if(f){path(x,p,j,s);if(sk){const ox=Math.max(.9*u,sk.offsetPx);x.save();x.translate(ox,ox*7/9);}x.fillStyle=st.fill==='gradient'?grad(x,p,f):f;x.fill();if(sk)x.restore();}
if(o.hatch&&sk){x.save();path(x,p,0,0);x.clip();x.strokeStyle='rgba(43,29,22,0.3)';x.lineWidth=Math.max(.6,.9*u);x.beginPath();const bb=bbox(p),hh=bb[3]-bb[1],gap=Math.max(5*u,sk.hatchGapPx);for(let k=bb[0]-hh,g=0;k<bb[2]&&g<400;k+=gap,g++){x.moveTo(k,bb[3]);x.lineTo(k+hh,bb[1]);}x.stroke();x.restore();}
if(o.noStroke)return;
const deco=!!(st.strokeFor&&f)||!!st.glow;if(deco){x.save();if(st.strokeFor&&f)x.strokeStyle=st.strokeFor(f);if(st.glow){x.shadowColor=pen.ol;x.shadowBlur=Math.max(3,8*u);}}
path(x,p,j,s+17);x.stroke();
if(st.brush){const b=Math.max(1,u*2);x.save();x.lineWidth*=.5;x.translate(.5*b,.4*b);path(x,p,j,s+51);x.stroke();x.restore();}
if(deco)x.restore();
if(sk){x.save();x.globalAlpha*=.55;x.lineWidth*=.45;path(x,p,j*1.5,s+33);x.stroke();x.restore();}}
/** Naklejka: jaśniej u góry, ciemniej u dołu (gradient w obrysie kształtu). */
function grad(x: any,p: any,f: string){const b=bbox(p),g=x.createLinearGradient(0,b[1],0,b[3]);g.addColorStop(0,lighten(f,.22));g.addColorStop(.55,f);g.addColorStop(1,darken(f,.1));return g;}
export function seg(x: any,x1: any,y1: any,x2: any,y2: any,w: any,col: any,lw: any){x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.lineCap='round';x.strokeStyle=pen.ol;x.lineWidth=w+2*lw;x.stroke();x.strokeStyle=col;x.lineWidth=w;x.stroke();x.strokeStyle=pen.ol;x.lineWidth=lw;}
export function lines(x: any,X: any,Y: any,w: any,n: any,gap: any,col: any,u: any,seed: any){x.strokeStyle=col;x.lineWidth=Math.max(.6,1.3*u);x.beginPath();for(let i=0;i<n;i++){const ww=w*(.5+.5*hr(i*3.1+(seed||0)*9.7));x.moveTo(X,Y+i*gap);x.lineTo(X+ww,Y+i*gap);}x.stroke();x.strokeStyle=pen.ol;}
export function hose(x: any,a: any,L: any,thk: any,cm: any,u: any,lw: any){const sx=a.sw[0],sy=a.sw[1],dx=a.hx-sx,dy=a.hy-sy,d=Math.hypot(dx,dy)||1;let nx=-dy/d,ny=dx/d;if(nx*a.s+ny*.6<0){nx=-nx;ny=-ny;}const b=Math.sqrt(Math.max(0,(L*1.05)*(L*1.05)-d*d))*.5,j=pen.st.sketch?Math.max(1.4*u,pen.st.sketch.jitterPx):0;const cx=(sx+a.hx)/2+nx*b+(j?(hr(pen.boil*31+a.s*7)-.5)*j:0),cy=(sy+a.hy)/2+ny*b+(j?(hr(pen.boil*17+a.s*3)-.5)*j:0);
x.beginPath();x.moveTo(sx,sy);x.quadraticCurveTo(cx,cy,a.hx,a.hy);x.lineCap='round';x.strokeStyle=pen.ol;x.lineWidth=thk+2*lw;x.stroke();x.strokeStyle=cm;x.lineWidth=thk;x.stroke();x.strokeStyle=pen.ol;x.lineWidth=lw;}
export function mitt(x: any,a: any,r: any,cm: any,u: any){shp(x,elP(a.hx,a.hy,r,r*.9),cm,u);}
