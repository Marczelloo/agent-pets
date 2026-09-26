import { PI, TAU, cl, ease, kf, hr } from "./math";
import { foldHW } from "./fold";
import { rng } from "./rng";
import type { Pet } from "./pet";
export type Act = [name: string, dur: number, fn: (a: number, c: Pet, t: number) => Record<string, any> | undefined, onStart?: (c: Pet) => void, onEnd?: (c: Pet) => void,
  /** hak kroku (tylko Anime): cząsteczki, uderzenia, słowa; `a` = czas akcji po tym kroku */
  hook?: (a: number, c: Pet, t: number, dt: number) => void];
export type Scene = { base: Record<string, any>; acts: Act[]; seq?: Act[]; cycle?: number };
export const pend=(c: any,t: any,fn: any)=>{c.pend={t,fn};};
const dance=(a: any)=>{const b=Math.sin(a*TAU),w=Math.sin(a*PI);return {th:.4*w,lx:6*w,tilt:.06*b,armL:1.8+.85*b,armR:1.8-.85*b,hopW:.45,_hf:2,_notes:1};};
const HIP={ikL:1,hxL:-47,hyL:-25};
const kb=(t: any,ph: any,x0: any)=>[x0+2.5*Math.sin(t*5.3+ph),-30-3.5*Math.max(0,Math.sin(t*18+ph))];
const TYPE=(xl: any,xr: any)=>(_a: any,_c: any,t: any)=>{const L=kb(t,0,xl),R=kb(t,PI,xr);return {ikL:1,ikR:1,hxL:L[0],hyL:L[1],hxR:R[0],hyR:R[1],typeW:1};};
const REST=(xl: any,xr: any,o: any)=>Object.assign({ikL:1,ikR:1,hxL:xl,hyL:-29,hxR:xr,hyR:-29},o);
const SHEET=(a: any)=>({ikL:1,hxL:-22+.8*Math.sin(a*1.3),hyL:-19+.8*Math.sin(a*1.7),ikR:1,hxR:22+.8*Math.sin(a*1.3),hyR:-19+.8*Math.sin(a*1.7+.4)});
export const NETKF=[[0,.45,.25],[.85,.45,.25],[1.15,1.95,.5],[1.5,.05,.05],[2.1,.35,.2],[2.8,.45,.25]];
export const pagePos=(a: any)=>{const p=Math.pow(cl(a/1.33),1.3);return [165+(101-165)*p,-100+(-72+100)*p+5*Math.sin(a*5)*(1-p)];};
export const BOLT=[84,-36],WL=34;
const wrenchAng=(a: any)=>a<1?235-110*ease(a):a<1.3?125+110*ease((a-1)/.3):235;
export const SCENES: Record<string, Scene>={
thinking:{base:{th:-.3,look:-1,think:1},acts:[
['zamyśla się (ręka pod brodą)',3.5,(_a: any,_c: any,t: any)=>({ikR:1,hxR:14,hyR:-27+1.5*Math.sin(t*3)})],
['chodzi w tę i z powrotem',4,(a: any)=>a<1.6?{th:PI/2,lx:26*ease(a/1.6),walkW:1,look:-.3}:a<2.1?{th:-PI/2,lx:26,look:-.3}:a<3.7?{th:-PI/2,lx:26*(1-ease((a-2.1)/1.6)),walkW:1,look:-.3}:{}],
['rozgląda się',3,(a: any,_c: any,_t: any)=>({th:-.3+.6*Math.sin(a*2.2),look:-.6,ikR:1,hxR:14,hyR:-27})]]},
edit:{base:{th:.3,look:.2,ex:.75,_prop:'desk',_parts:'code'},acts:[
['pisze kod',6,TYPE(-2,18)],
['przeciąga się',2,()=>({armL:2.8,armR:2.8,look:-.7,th:.15})],
['zerka na Ciebie',1.6,()=>REST(-2,18,{th:0,look:0})],
['popija kawę',2.6,(a: any)=>{let hx=18,hy=-29,rot=0;const M=[57,-39],F=[36,-54];if(a<.4){const p=ease(a/.4);hx=18+(M[0]-18)*p;hy=-29+(M[1]+29)*p;}else if(a<.9){const p=ease((a-.4)/.5);hx=M[0]+(F[0]-M[0])*p;hy=M[1]+(F[1]-M[1])*p;rot=-.7*p;}else if(a<1.7){hx=F[0];hy=F[1]+.6*Math.sin(a*6);rot=-.7;}else if(a<2.2){const p=ease((a-1.7)/.5);hx=F[0]+(M[0]-F[0])*p;hy=F[1]+(M[1]-F[1])*p;rot=-.7*(1-p);}else{const p=ease(cl((a-2.2)/.4));hx=M[0]+(18-M[0])*p;hy=M[1]+(-29-M[1])*p;}return {ikL:1,hxL:-2,hyL:-29,ikR:1,hxR:hx,hyR:hy,th:.2,look:a>.9&&a<1.7?-.2:.3,ex:a>.9&&a<1.7?.4:.8,happy:a>1&&a<1.6?.9:0,_mug:a>.36&&a<2.22?1:0,_mugRot:rot};}],
['drapie się po głowie',1.8,(_a: any,_c: any,t: any)=>({ikL:1,hxL:-2,hyL:-29,ikR:1,hxR:10+4*Math.sin(t*16),hyR:-75,look:-.3,th:.3})]]},
bash:{cycle:1,base:{th:.55,look:-.1,ex:.8,_prop:'crt',_parts:'bash'},acts:[
['wpisuje komendy',3.2,(a: any,_c: any,t: any)=>{const k=Math.floor(t*5.5),p=(t*5.5)%1;return Object.assign({},HIP,{ikR:1,hxR:66+12*hr(k*1.37),hyR:-46-6*Math.sin(p*PI),typeW:.7,_scr:'type',_prog:a/3.2});}],
['wciska Enter',1.1,(a: any)=>{let hx=81,hy=-47;if(a<.45){const p=ease(a/.45);hx=74+6*p;hy=-46-40*p;}else if(a<.6){const p=(a-.45)/.15;hx=80+1*p;hy=-86+39*p*p;}return Object.assign({},HIP,{ikR:1,hxR:hx,hyR:hy,tilt:a>.55&&a<.8?.08:-.04,ex:.9,look:a<.5?-.5:.1,lean:a>.55&&a<.75?.5:0,_scr:a<.6?'type':'run',_prog:1,_run:a-.6,_enter:a>.58&&a<.8?1:0});},(c: any)=>pend(c,.6,()=>{c.parts.push({k:'imp',x:87,y:-48,life:0,max:.35});c.parts.push({t:'↵',x:92,y:-60,vx:10,vy:-30,life:0,max:.8,s:15,col:'teal'});})],
['czeka na wynik',2.6,(a: any,_c: any,t: any)=>Object.assign({},HIP,{ikR:1,hxR:68,hyR:-47,ex:.85,look:-.4+.5*((a*1.3)%1),tilt:.025*Math.sin(t*9),_scr:'run',_run:a+.5})],
['zerka na Ciebie',1.4,()=>Object.assign({},HIP,{ikR:1,hxR:68,hyR:-47,th:.15,look:0,ex:0,_scr:'run',_run:9})]]},
read:{base:{th:.12,look:.85,tilt:-.06,_hold:'sheet'},acts:[
['czyta plik',5.2,(a: any)=>{const li=Math.floor(a/1.3)%4,p=(a/1.3)%1;return Object.assign(SHEET(a),{ex:-.8+1.6*p,look:.72+li*.07,_line:li,_prog:p});}],
['odrzuca przeczytaną kartkę',1.2,(a: any)=>{const S0=SHEET(0);let hx=22,hy=-19;if(a<.3){const p=ease(a/.3);hx=22;hy=-19-15*p;}else if(a<.6){const p=ease((a-.3)/.3);hx=22+20*p;hy=-34-44*p;}else{const p=ease(cl((a-.6)/.4));hx=42-20*p;hy=-78+59*p;}return Object.assign(S0,{hxR:hx,hyR:hy,_carry:a>.3&&a<.56?1:0,ex:a<.6?.5:-.2,look:a<.6?.4:.8,th:.12+(a>.3&&a<.7?.12:0)});},(c: any)=>pend(c,.56,()=>{c.pageSeed=(c.pageSeed||0)+1;c.parts.push({k:'page',x:c.hand[1][0],y:c.hand[1][1],vx:70,vy:-50,g:90,life:0,max:1.6});})]]},
grep:{base:{th:.45,tilt:.04,_prop:'board',_hold:'lens'},acts:[
['przeczesuje kod lupą',4.4,(a: any)=>{const r=Math.floor(a/1.1)%4,p=(a/1.1)%1,lx=71+26*ease(p),ly=-62+r*11;return Object.assign({},HIP,{ikR:1,hxR:lx-11,hyR:ly+11,tilt:.03+.05*ease(p),ex:cl((lx-10)/60,-1,1),look:cl((ly+45)/18,-1,1)});}],
['znalazł!',1.6,(a: any)=>({ikR:1,hxR:74,hyR:-38,ex:.9,look:-.3,armL:2.7,hopW:a<.9?.8:0,_hit:1}),(c: any)=>c.parts.push({t:'!',x:-24,y:-100,vx:0,vy:-15,life:0,max:1,s:18,col:'clay'})]]},
web:{base:{_hold:'net'},acts:[
['łowi strony siatką',2.8,(a: any)=>{const[ph,th]=kf(a,NETKF),pp=pagePos(a),look=a<1.33?cl((pp[1]+45)/25,-1,1):-.2;const sw=a>.95&&a<1.6;return Object.assign({},sw?{armL:1.1}:HIP,{ikR:1,hxR:34+4*Math.sin(ph),hyR:-34,pole:ph,th,ex:a<1.33?cl((pp[0]-10)/80,-1,1):.7,_poleDirect:1,look,_page:a});},(c: any)=>pend(c,2.45,()=>{for(let i=0;i<5;i++)c.parts.push({t:'✦',x:(c.hoop?c.hoop[0]:60)+(rng()-.5)*14,y:(c.hoop?c.hoop[1]:-50)+(rng()-.5)*10,vx:(rng()-.5)*40,vy:-30-rng()*30,life:0,max:.7,s:9,col:'teal'});})],
['zagląda do siatki',1.4,(a: any)=>({ikR:1,hxR:34,hyR:-34,ikL:1,hxL:-47,hyL:-25,pole:1.0,th:.4,look:-.1,ex:.8,happy:a>.4&&a<1.1?.9:0})]]},
agent:{cycle:1,base:{},acts:[
['składa samolocik',2.4,(a: any)=>{const m=cl((a-.2)/2),hw=foldHW(m),j=(m*3%1)<.25&&m<1?1.5*Math.sin(a*30):0;const o={ikR:1,hxR:hw+3,hyR:-21-j,th:.08,look:.85,ex:(m*3%1)*.6-.3,_hold:'paper',_fold:m};if(m<.66)Object.assign(o,{ikL:1,hxL:-hw-3,hyL:-21+j});else Object.assign(o,HIP);return o;}],
['bierze zamach',.8,(_a: any)=>Object.assign({},HIP,{ikR:1,hxR:34,hyR:-88,th:-.05,tilt:-.07,look:-.3,ex:.6,_hold:'paper',_fold:1})],
['rzuca subagenta',.6,(a: any)=>Object.assign({},HIP,{ikR:1,hxR:72,hyR:-50,th:.5,tilt:.1,look:-.3,ex:.9,_hold:a<.1?'paper':null,_fold:1}),(c: any)=>pend(c,.1,()=>c.parts.push({k:'plane',x:c.hand[1][0],y:c.hand[1][1],vx:170,vy:-40,life:0,max:2.2}))],
['macha mu na pożegnanie',1.6,(_a: any,_c: any,t: any)=>Object.assign({},HIP,{ikR:1,hxR:50+7*Math.sin(t*11),hyR:-82,th:.4,look:-.8,ex:.9})]]},
mcp:{base:{th:.45,_prop:'machine',_hold:'wrench'},acts:[
['dokręca śrubę (MCP)',1.8,(a: any)=>{const r=wrenchAng(a)*PI/180,eff=a<1?Math.sin(PI*a):0;return Object.assign({},HIP,{ikR:1,hxR:BOLT[0]+WL*Math.cos(r),hyR:BOLT[1]+WL*Math.sin(r),tilt:.1*eff,squint:eff*.6,lean:eff*.2,ex:.8,look:.35,_push:a<1?1:0});},(c: any)=>pend(c,1.02,()=>c.parts.push({t:'klik',x:BOLT[0]-6,y:BOLT[1]-16,vx:6,vy:-20,life:0,max:.6,s:10,col:'mute'}))],
['ociera czoło',1.5,(a: any)=>{const r=235*PI/180;return {ikR:1,hxR:BOLT[0]+WL*Math.cos(r),hyR:BOLT[1]+WL*Math.sin(r),ikL:1,hxL:-26+34*ease(cl(a/1.1)),hyL:-64,look:.1,ex:.2};},(c: any)=>pend(c,.5,()=>c.parts.push({k:'drop',x:-30,y:-62,vx:-25,vy:-20,g:160,life:0,max:.8}))]]},
needs:{base:{th:0,look:0,bubble:1,hopW:1,armR:2.3,oscR:.55,_f:11},acts:[
['macha do Ciebie',3,()=>({})],
['puka w szybę',2.2,(_a: any,_c: any,t: any)=>({hopW:0,lean:1,ikR:1,hxR:47+5*Math.max(0,Math.sin(t*16)),hyR:-44,_f:16,_knock:1,_big:1})]]},
done:{base:{happy:1,look:-.3},seq:[
['wiwatuje',1.3,()=>({armL:2.7,armR:2.7,hopW:1}),(c: any)=>burst(c)],
['piruet',1.3,(a: any)=>({th:TAU*ease(cl(a/1.1)),armL:2.3,armR:2.3,hopW:.5})],
['tańczy',2.4,dance],
['drobi kroczki',2.4,(a: any)=>({lx:14*Math.sin(a*TAU*.8),th:.5*Math.cos(a*TAU*.8),armL:1.5+.5*Math.sin(a*TAU*1.6),armR:1.5-.5*Math.sin(a*TAU*1.6),walkW:.7,_notes:1})]],
acts:[['siedzi zadowolony',4,()=>({sit:1,swing:1,happy:.8})],['znów tańczy',2.4,dance]]},
error:{base:{sit:1,dizzy:1,grey:1,wobW:1},acts:[['kręci mu się w głowie',3.5,()=>({})],['otrząsa się',1.4,()=>({wobW:0,shake:1,dizzy:.6})]]},
idle:{base:{sit:1,th:.1},acts:[['siedzi i macha nogami',3,()=>({swing:1})],['rozgląda się',3.5,(a: any)=>({th:.7*Math.sin(a*1.8),look:-.3*Math.sin(a*1.3)})],['ziewa',2,(a: any)=>({armL:2.6,armR:2.6,sleep:a<1.6?.85:0})]]},
sleep:{base:{loaf:1,sleep:1,dim:1,th:.3,_prop:'pillow',armL:.15,armR:.15},acts:[['śpi na poduszce',5,()=>({})],['przewraca się na bok',3,()=>({th:-.9})]]},
// Nowe w fazie 2 (spec 7.5): kompaktowanie kontekstu i pożegnanie przy końcu sesji.
compact:{base:{th:.2,look:.3,squint:.5},acts:[
['ściska kontekst',2.4,(a: any,_c: any,t: any)=>{const p=.5+.5*Math.sin(a*TAU/1.2);return {ikL:1,ikR:1,hxL:-44+22*p,hyL:-40+2*Math.sin(t*14),hxR:44-22*p,hyR:-40+2*Math.sin(t*14+1),lean:.25*p,squint:.4+.5*p,tilt:.03*Math.sin(t*9)};}],
['ociera czoło',1.5,(a: any)=>({ikL:1,hxL:-26+34*ease(cl(a/1.1)),hyL:-64,ikR:1,hxR:30,hyR:-34,look:.1,ex:.2}),(c: any)=>pend(c,.5,()=>c.parts.push({k:'drop',x:-30,y:-62,vx:-25,vy:-20,g:160,life:0,max:.8}))]]},
bye:{base:{},seq:[
['macha na pożegnanie',.7,()=>({th:0,look:0,happy:.8,armR:2.3,oscR:.55,_f:11})],
['odchodzi',.9,(a: any)=>({th:PI/2,lx:40*ease(cl(a/.9)),walkW:1,look:-.2})]],
acts:[['odszedł',5,()=>({th:PI/2,lx:40})]]}};
export function burst(c: any){for(let i=0;i<9;i++){const a=-PI*(i/8);c.parts.push({t:'✦',x:0,y:-72,vx:Math.cos(a)*90,vy:Math.sin(a)*90,g:60,life:0,max:1,s:13,col:'clay',tw:1});}}
