const $=id=>document.getElementById(id);
const FF=getComputedStyle(document.body).fontFamily||'sans-serif';
function fit(c){const d=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=Math.round(w*d);c.height=Math.round(h*d);const x=c.getContext('2d');x.setTransform(d,0,0,d,0,0);return {x,w,h};}
let A=fit($('cv')),B=fit($('tb'));
const PI=Math.PI,TAU=PI*2,cl=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),ease=v=>v<.5?2*v*v:1-Math.pow(-2*v+2,2)/2,eOut=v=>1-Math.pow(1-v,3);
let SK=true,SID=0,BOIL=0;
const K=['th','look','ex','lx','sit','loaf','lean','tilt','armL','armR','oscL','oscR','ikL','ikR','hxL','hyL','hxR','hyR','happy','sleep','dizzy','squint','grey','bubble','think','propA','holdA','typeW','walkW','wobW','dim','hopW','swing','shake','pole'];
const DEF={};K.forEach(k=>DEF[k]=0);DEF.armL=.35;DEF.armR=.35;DEF.pole=.45;
const SPR={th:[70,11],lx:[40,10],bubble:[280,13],armL:[110,13],armR:[110,13],hxL:[170,19],hyL:[170,19],hxR:[170,19],hyR:[170,19],ikL:[120,16],ikR:[120,16],pole:[260,18],tilt:[90,14]};
const SPIN=['·','✢','✳','✶','✻','✽','✻','✶','✳','✢'];
const PAL={clawd:{m:'#D97757',s:'#B25D3D',b:'#C4684A',h:'#F2AE92',g:'#A8A49A',gs:'#86837A'},kodek:{m:'#F1EFE8',s:'#CBC6B8',b:'#DEDAD0',h:'#FFFFFF',g:'#C9C6BD',gs:'#A5A298'}};
const COL={clay:'#D97757',mute:'#8C887E',teal:'#1D9E75',amber:'#EF9F27'};
const OL='#2B1D16',PAPER='#FAF9F5',STEEL='#888780',DARK='#5F5E5A';
const pend=(c,t,fn)=>{c.pend={t,fn};};
const kf=(a,F)=>{if(a<=F[0][0])return F[0].slice(1);for(let i=1;i<F.length;i++){if(a<=F[i][0]){const p=ease((a-F[i-1][0])/(F[i][0]-F[i-1][0]));return F[i].slice(1).map((v,j)=>F[i-1][j+1]+(v-F[i-1][j+1])*p);}}return F[F.length-1].slice(1);};
const dance=a=>{const b=Math.sin(a*TAU),w=Math.sin(a*PI);return {th:.4*w,lx:6*w,tilt:.06*b,armL:1.8+.85*b,armR:1.8-.85*b,hopW:.45,_hf:2,_notes:1};};
const HIP={ikL:1,hxL:-47,hyL:-25};
const kb=(t,ph,x0)=>[x0+2.5*Math.sin(t*5.3+ph),-30-3.5*Math.max(0,Math.sin(t*18+ph))];
const TYPE=(xl,xr)=>(a,c,t)=>{const L=kb(t,0,xl),R=kb(t,PI,xr);return {ikL:1,ikR:1,hxL:L[0],hyL:L[1],hxR:R[0],hyR:R[1],typeW:1};};
const REST=(xl,xr,o)=>Object.assign({ikL:1,ikR:1,hxL:xl,hyL:-29,hxR:xr,hyR:-29},o);
const SHEET=a=>({ikL:1,hxL:-22+.8*Math.sin(a*1.3),hyL:-19+.8*Math.sin(a*1.7),ikR:1,hxR:22+.8*Math.sin(a*1.3),hyR:-19+.8*Math.sin(a*1.7+.4)});
const NETKF=[[0,.45,.25],[.85,.45,.25],[1.15,1.95,.5],[1.5,.05,.05],[2.1,.35,.2],[2.8,.45,.25]];
const pagePos=a=>{const p=Math.pow(cl(a/1.33),1.3);return [165+(101-165)*p,-100+(-72+100)*p+5*Math.sin(a*5)*(1-p)];};
const BOLT=[84,-36],WL=34;
const wrenchAng=a=>a<1?235-110*ease(a):a<1.3?125+110*ease((a-1)/.3):235;
const S={
thinking:{base:{th:-.3,look:-1,think:1},acts:[
['zamyśla się (ręka pod brodą)',3.5,(a,c,t)=>({ikR:1,hxR:14,hyR:-27+1.5*Math.sin(t*3)})],
['chodzi w tę i z powrotem',4,a=>a<1.6?{th:PI/2,lx:26*ease(a/1.6),walkW:1,look:-.3}:a<2.1?{th:-PI/2,lx:26,look:-.3}:a<3.7?{th:-PI/2,lx:26*(1-ease((a-2.1)/1.6)),walkW:1,look:-.3}:{}],
['rozgląda się',3,(a,c,t)=>({th:-.3+.6*Math.sin(a*2.2),look:-.6,ikR:1,hxR:14,hyR:-27})]]},
edit:{base:{th:.3,look:.2,ex:.75,_prop:'desk',_parts:'code'},acts:[
['pisze kod',6,TYPE(-2,18)],
['przeciąga się',2,()=>({armL:2.8,armR:2.8,look:-.7,th:.15})],
['zerka na Ciebie',1.6,()=>REST(-2,18,{th:0,look:0})],
['popija kawę',2.6,a=>{let hx=18,hy=-29,rot=0;const M=[57,-39],F=[36,-54];if(a<.4){const p=ease(a/.4);hx=18+(M[0]-18)*p;hy=-29+(M[1]+29)*p;}else if(a<.9){const p=ease((a-.4)/.5);hx=M[0]+(F[0]-M[0])*p;hy=M[1]+(F[1]-M[1])*p;rot=-.7*p;}else if(a<1.7){hx=F[0];hy=F[1]+.6*Math.sin(a*6);rot=-.7;}else if(a<2.2){const p=ease((a-1.7)/.5);hx=F[0]+(M[0]-F[0])*p;hy=F[1]+(M[1]-F[1])*p;rot=-.7*(1-p);}else{const p=ease(cl((a-2.2)/.4));hx=M[0]+(18-M[0])*p;hy=M[1]+(-29-M[1])*p;}return {ikL:1,hxL:-2,hyL:-29,ikR:1,hxR:hx,hyR:hy,th:.2,look:a>.9&&a<1.7?-.2:.3,ex:a>.9&&a<1.7?.4:.8,happy:a>1&&a<1.6?.9:0,_mug:a>.36&&a<2.22?1:0,_mugRot:rot};}],
['drapie się po głowie',1.8,(a,c,t)=>({ikL:1,hxL:-2,hyL:-29,ikR:1,hxR:10+4*Math.sin(t*16),hyR:-75,look:-.3,th:.3})]]},
bash:{cycle:1,base:{th:.55,look:-.1,ex:.8,_prop:'crt',_parts:'bash'},acts:[
['wpisuje komendy',3.2,(a,c,t)=>{const k=Math.floor(t*5.5),p=(t*5.5)%1;return Object.assign({},HIP,{ikR:1,hxR:66+12*hr(k*1.37),hyR:-46-6*Math.sin(p*PI),typeW:.7,_scr:'type',_prog:a/3.2});}],
['wciska Enter',1.1,a=>{let hx=81,hy=-47;if(a<.45){const p=ease(a/.45);hx=74+6*p;hy=-46-40*p;}else if(a<.6){const p=(a-.45)/.15;hx=80+1*p;hy=-86+39*p*p;}return Object.assign({},HIP,{ikR:1,hxR:hx,hyR:hy,tilt:a>.55&&a<.8?.08:-.04,ex:.9,look:a<.5?-.5:.1,lean:a>.55&&a<.75?.5:0,_scr:a<.6?'type':'run',_prog:1,_run:a-.6,_enter:a>.58&&a<.8?1:0});},c=>pend(c,.6,()=>{c.parts.push({k:'imp',x:87,y:-48,life:0,max:.35});c.parts.push({t:'↵',x:92,y:-60,vx:10,vy:-30,life:0,max:.8,s:15,col:'teal'});})],
['czeka na wynik',2.6,(a,c,t)=>Object.assign({},HIP,{ikR:1,hxR:68,hyR:-47,ex:.85,look:-.4+.5*((a*1.3)%1),tilt:.025*Math.sin(t*9),_scr:'run',_run:a+.5})],
['zerka na Ciebie',1.4,()=>Object.assign({},HIP,{ikR:1,hxR:68,hyR:-47,th:.15,look:0,ex:0,_scr:'run',_run:9})]]},
read:{base:{th:.12,look:.85,tilt:-.06,_hold:'sheet'},acts:[
['czyta plik',5.2,a=>{const li=Math.floor(a/1.3)%4,p=(a/1.3)%1;return Object.assign(SHEET(a),{ex:-.8+1.6*p,look:.72+li*.07,_line:li,_prog:p});}],
['odrzuca przeczytaną kartkę',1.2,a=>{const S0=SHEET(0);let hx=22,hy=-19;if(a<.3){const p=ease(a/.3);hx=22;hy=-19-15*p;}else if(a<.6){const p=ease((a-.3)/.3);hx=22+20*p;hy=-34-44*p;}else{const p=ease(cl((a-.6)/.4));hx=42-20*p;hy=-78+59*p;}return Object.assign(S0,{hxR:hx,hyR:hy,_carry:a>.3&&a<.56?1:0,ex:a<.6?.5:-.2,look:a<.6?.4:.8,th:.12+(a>.3&&a<.7?.12:0)});},c=>pend(c,.56,()=>{c.pageSeed=(c.pageSeed||0)+1;c.parts.push({k:'page',x:c.hand[1][0],y:c.hand[1][1],vx:70,vy:-50,g:90,life:0,max:1.6});})]]},
grep:{base:{th:.45,tilt:.04,_prop:'board',_hold:'lens'},acts:[
['przeczesuje kod lupą',4.4,a=>{const r=Math.floor(a/1.1)%4,p=(a/1.1)%1,lx=71+26*ease(p),ly=-62+r*11;return Object.assign({},HIP,{ikR:1,hxR:lx-11,hyR:ly+11,tilt:.03+.05*ease(p),ex:cl((lx-10)/60,-1,1),look:cl((ly+45)/18,-1,1)});}],
['znalazł!',1.6,a=>({ikR:1,hxR:74,hyR:-38,ex:.9,look:-.3,armL:2.7,hopW:a<.9?.8:0,_hit:1}),c=>c.parts.push({t:'!',x:-24,y:-100,vx:0,vy:-15,life:0,max:1,s:18,col:'clay'})]]},
web:{base:{_hold:'net'},acts:[
['łowi strony siatką',2.8,a=>{const[ph,th]=kf(a,NETKF),pp=pagePos(a),look=a<1.33?cl((pp[1]+45)/25,-1,1):-.2;const sw=a>.95&&a<1.6;return Object.assign(sw?{armL:1.1}:HIP,{ikR:1,hxR:34+4*Math.sin(ph),hyR:-34,pole:ph,th,ex:a<1.33?cl((pp[0]-10)/80,-1,1):.7,_poleDirect:1,look,_page:a});},c=>pend(c,2.45,()=>{for(let i=0;i<5;i++)c.parts.push({t:'✦',x:(c.hoop?c.hoop[0]:60)+(Math.random()-.5)*14,y:(c.hoop?c.hoop[1]:-50)+(Math.random()-.5)*10,vx:(Math.random()-.5)*40,vy:-30-Math.random()*30,life:0,max:.7,s:9,col:'teal'});})],
['zagląda do siatki',1.4,a=>({ikR:1,hxR:34,hyR:-34,ikL:1,hxL:-47,hyL:-25,pole:1.0,th:.4,look:-.1,ex:.8,happy:a>.4&&a<1.1?.9:0})]]},
agent:{cycle:1,base:{},acts:[
['składa samolocik',2.4,a=>{const m=cl((a-.2)/2),hw=foldHW(m),st=Math.floor(m*3),j=(m*3%1)<.25&&m<1?1.5*Math.sin(a*30):0;const o={ikR:1,hxR:hw+3,hyR:-21-j,th:.08,look:.85,ex:(m*3%1)*.6-.3,_hold:'paper',_fold:m};if(m<.66)Object.assign(o,{ikL:1,hxL:-hw-3,hyL:-21+j});else Object.assign(o,HIP);return o;}],
['bierze zamach',.8,a=>Object.assign({},HIP,{ikR:1,hxR:34,hyR:-88,th:-.05,tilt:-.07,look:-.3,ex:.6,_hold:'paper',_fold:1})],
['rzuca subagenta',.6,a=>Object.assign({},HIP,{ikR:1,hxR:72,hyR:-50,th:.5,tilt:.1,look:-.3,ex:.9,_hold:a<.1?'paper':null,_fold:1}),c=>pend(c,.1,()=>c.parts.push({k:'plane',x:c.hand[1][0],y:c.hand[1][1],vx:170,vy:-40,life:0,max:2.2}))],
['macha mu na pożegnanie',1.6,(a,c,t)=>Object.assign({},HIP,{ikR:1,hxR:50+7*Math.sin(t*11),hyR:-82,th:.4,look:-.8,ex:.9})]]},
mcp:{base:{th:.45,_prop:'machine',_hold:'wrench'},acts:[
['dokręca śrubę (MCP)',1.8,a=>{const r=wrenchAng(a)*PI/180,eff=a<1?Math.sin(PI*a):0;return Object.assign({},HIP,{ikR:1,hxR:BOLT[0]+WL*Math.cos(r),hyR:BOLT[1]+WL*Math.sin(r),tilt:.1*eff,squint:eff*.6,lean:eff*.2,ex:.8,look:.35,_push:a<1?1:0});},c=>pend(c,1.02,()=>c.parts.push({t:'klik',x:BOLT[0]-6,y:BOLT[1]-16,vx:6,vy:-20,life:0,max:.6,s:10,col:'mute'}))],
['ociera czoło',1.5,a=>{const r=235*PI/180;return {ikR:1,hxR:BOLT[0]+WL*Math.cos(r),hyR:BOLT[1]+WL*Math.sin(r),ikL:1,hxL:-26+34*ease(cl(a/1.1)),hyL:-64,look:.1,ex:.2};},c=>pend(c,.5,()=>c.parts.push({k:'drop',x:-30,y:-62,vx:-25,vy:-20,g:160,life:0,max:.8}))]]},
needs:{base:{th:0,look:0,bubble:1,hopW:1,armR:2.3,oscR:.55,_f:11},acts:[
['macha do Ciebie',3,()=>({})],
['puka w szybę',2.2,(a,c,t)=>({hopW:0,lean:1,ikR:1,hxR:47+5*Math.max(0,Math.sin(t*16)),hyR:-44,_f:16,_knock:1,_big:1})]]},
done:{base:{happy:1,look:-.3},seq:[
['wiwatuje',1.3,()=>({armL:2.7,armR:2.7,hopW:1}),c=>burst(c)],
['piruet',1.3,a=>({th:TAU*ease(cl(a/1.1)),armL:2.3,armR:2.3,hopW:.5})],
['tańczy',2.4,dance],
['drobi kroczki',2.4,a=>({lx:14*Math.sin(a*TAU*.8),th:.5*Math.cos(a*TAU*.8),armL:1.5+.5*Math.sin(a*TAU*1.6),armR:1.5-.5*Math.sin(a*TAU*1.6),walkW:.7,_notes:1})]],
acts:[['siedzi zadowolony',4,()=>({sit:1,swing:1,happy:.8})],['znów tańczy',2.4,dance]]},
error:{base:{sit:1,dizzy:1,grey:1,wobW:1},acts:[['kręci mu się w głowie',3.5,()=>({})],['otrząsa się',1.4,()=>({wobW:0,shake:1,dizzy:.6})]]},
idle:{base:{sit:1,th:.1},acts:[['siedzi i macha nogami',3,()=>({swing:1})],['rozgląda się',3.5,a=>({th:.7*Math.sin(a*1.8),look:-.3*Math.sin(a*1.3)})],['ziewa',2,a=>({armL:2.6,armR:2.6,sleep:a<1.6?.85:0})]]},
sleep:{base:{loaf:1,sleep:1,dim:1,th:.3,_prop:'pillow',armL:.15,armR:.15},acts:[['śpi na poduszce',5,()=>({})],['przewraca się na bok',3,()=>({th:-.9})]]}};
function burst(c){for(let i=0;i<9;i++){const a=-PI*(i/8);c.parts.push({t:'✦',x:0,y:-72,vx:Math.cos(a)*90,vy:Math.sin(a)*90,g:60,life:0,max:1,s:13,col:'clay',tw:1});}}
function mkC(type,st){const c={type,p:{},parts:[],spawn:0,blink:0,nb:1+Math.random()*2,aa:0,av:0,hp:Math.random(),f:20,hand:[[-30,-30],[30,-30]],aHand:[[-30,-30],[30,-30]],kph:0,prop:null,hold:null,boltAng:0,pageSeed:0};K.forEach(k=>c.p[k]={x:0,v:0});setSt(c,st,true);return c;}
function startAct(c,a){c.act=a;c.aT=0;c.pend=null;if(a[3])a[3](c);}
function setSt(c,st,inst){c.st=st;c.seqI=0;const s=S[st];startAct(c,s.seq?s.seq[0]:s.acts[0]);if(inst){const tg=targets(c,0);c.prop=tg._prop||null;c.hold=tg._hold||null;tg.propA=c.prop?1:0;tg.holdA=c.hold?1:0;K.forEach(k=>{c.p[k].x=tg[k];c.p[k].v=0;});c.tg=tg;}}
function nextAct(c){const s=S[c.st];if(c.act[4])c.act[4](c);c.p.th.x-=TAU*Math.round(c.p.th.x/TAU);
if(s.seq&&c.seqI<s.seq.length-1){c.seqI++;startAct(c,s.seq[c.seqI]);return;}
if(s.seq&&c.seqI===s.seq.length-1){c.seqI++;startAct(c,s.acts[0]);return;}
const acts=s.acts;if(s.cycle){startAct(c,acts[(acts.indexOf(c.act)+1)%acts.length]);return;}
let a=acts[0];if(c.act===acts[0]&&acts.length>1&&Math.random()>.3)a=acts[1+Math.floor(Math.random()*(acts.length-1))];startAct(c,a);}
function targets(c,t){const o=Object.assign({},DEF,S[c.st].base,c.act[2](c.aT,c,t)||{});['L','R'].forEach((k,i)=>{if(!o['ik'+k]){o['hx'+k]=c.aHand[i][0];o['hy'+k]=c.aHand[i][1];}});return o;}
function slot(c,tg,key,ak){const nm=key.slice(1),want=tg[key]||null,P=c.p[ak];if(want&&want!==c[nm]){if(!c[nm]||P.x<.1)c[nm]=want;else{tg[ak]=0;return;}}tg[ak]=want?1:0;if(!want&&P.x<.03)c[nm]=null;}
function stepC(c,dt,t){c.aT+=dt;if(c.pend&&c.aT>=c.pend.t){const f=c.pend.fn;c.pend=null;f();}if(c.aT>c.act[1])nextAct(c);
const tg=targets(c,t);c.tg=tg;c.f=tg._f||20;c.hp+=(tg._hf||.85)*dt;slot(c,tg,'_prop','propA');slot(c,tg,'_hold','holdA');const P=c.p;
K.forEach(k=>{const s=P[k],sp=SPR[k]||[90,16];s.v+=((tg[k]-s.x)*sp[0]-s.v*sp[1])*dt;s.x+=s.v*dt;});
if(tg._poleDirect){const nv=(tg.pole-P.pole.x)/dt;P.pole.v=P.pole.v*.6+nv*.4;P.pole.x=tg.pole;}
c.nb-=dt;if(c.nb<0){c.blink=.16;c.nb=2.5+Math.random()*3;}c.blink=Math.max(0,c.blink-dt);
if(c.type==='kodek'){const drive=-P.th.v*.8+Math.sin(t*1.7)*.4+(P.hopW.x>.1?Math.cos(TAU*(c.hp%1))*1.5*P.hopW.x:0)+P.typeW.x*Math.sin(t*20)*1.2+P.walkW.x*Math.sin(t*10)*1.2;c.av+=(drive*20-c.aa*120-c.av*7)*dt;c.aa+=c.av*dt;}
c.parts=c.parts.filter(q=>(q.life+=dt)<q.max);c.parts.forEach(q=>{if(q.k==='plane')q.vy=-25+Math.sin(q.life*5)*45;q.x+=(q.vx||0)*dt;q.y+=(q.vy||0)*dt;q.vy+=(q.g||0)*dt;});
if(tg._knock){const ph=Math.floor(t*16/TAU+.75);if(ph!==c.kph){c.kph=ph;const[hx,hy]=c.hand[1];c.parts.push({k:'imp',x:hx+6,y:hy,life:0,max:.35});if(Math.random()<.6)c.parts.push({t:'puk',x:hx+16,y:hy-10,vx:14,vy:-24,life:0,max:.7,s:11,col:'mute'});}}
c.spawn-=dt;if(c.spawn<0){c.spawn=.3;const R=Math.random;
if(P.loaf.x>.6&&R()<.35)c.parts.push({t:'z',x:20,y:-66,vx:14,vy:-22,life:0,max:2.2,s:13,grow:1,col:'mute'});
if(P.typeW.x>.6&&tg._parts==='code')c.parts.push({t:['{','}',';','</>','=>','*'][Math.floor(R()*6)],x:80,y:-88,vx:6+R()*10,vy:-26,life:0,max:1.1,s:11,col:'clay'});
if(P.typeW.x>.6&&tg._parts==='bash'&&R()<.7)c.parts.push({t:['$','>_','&&','|','~/','ls'][Math.floor(R()*6)],x:102,y:-108,vx:4+R()*10,vy:-26,life:0,max:1.1,s:11,col:'teal'});
if(P.squint.x>.4&&R()<.25)c.parts.push({k:'drop',x:-26+R()*8,y:-70,vx:-20,vy:-20,g:160,life:0,max:.7});
if(tg._notes&&R()<.6)c.parts.push({t:R()<.5?'♪':'♫',x:(R()-.5)*120,y:-60-R()*30,vx:(R()-.5)*20,vy:-35,life:0,max:1.3,s:14,col:'clay'});
if(P.happy.x>.6&&R()<.3)c.parts.push({t:'✦',x:(R()-.5)*110,y:-70-R()*40,vx:0,vy:-8,life:0,max:1.2,s:10+R()*6,col:'clay',tw:1});}}
function hr(n){n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n);}
function rrP(X,Y,W,H,R){if(W<0){X+=W;W=-W;}W=Math.max(W,.01);H=Math.max(H,.01);R=Math.max(0,Math.min(R,W/2,H/2));const p=[],n=5;[[X+W-R,Y+R,-PI/2],[X+W-R,Y+H-R,0],[X+R,Y+H-R,PI/2],[X+R,Y+R,PI]].forEach(([cx,cy,a0])=>{for(let i=0;i<=n;i++){const a=a0+PI/2*i/n;p.push([cx+Math.cos(a)*R,cy+Math.sin(a)*R]);}});return p;}
function elP(cx,cy,rx,ry,rot){const p=[],cr=Math.cos(rot||0),sr=Math.sin(rot||0);for(let i=0;i<18;i++){const a=TAU*i/18,ex=Math.cos(a)*rx,ey=Math.sin(a)*ry;p.push([cx+ex*cr-ey*sr,cy+ex*sr+ey*cr]);}return p;}
function path(x,p,j,seed){x.beginPath();p.forEach((q,i)=>{const dx=j?(hr(seed+i*1.7)-.5)*j:0,dy=j?(hr(seed+i*2.3+50)-.5)*j:0;i?x.lineTo(q[0]+dx,q[1]+dy):x.moveTo(q[0]+dx,q[1]+dy);});x.closePath();}
function bbox(p){let a=1e9,b=1e9,c=-1e9,d=-1e9;p.forEach(q=>{a=Math.min(a,q[0]);b=Math.min(b,q[1]);c=Math.max(c,q[0]);d=Math.max(d,q[1]);});return [a,b,c,d];}
function shp(x,p,fill,u,o){o=o||{};const id=++SID,j=SK?1.4*u*(o.j==null?1:o.j):0,s=BOIL*977+id*131;
if(fill){path(x,p,j,s);if(SK){x.save();x.translate(.9*u,.7*u);}x.fillStyle=fill;x.fill();if(SK)x.restore();}
if(o.hatch&&SK){x.save();path(x,p,0,0);x.clip();x.strokeStyle='rgba(43,29,22,0.3)';x.lineWidth=Math.max(.6,.9*u);x.beginPath();const bb=bbox(p),hh=bb[3]-bb[1];for(let k=bb[0]-hh,g=0;k<bb[2]&&g<400;k+=5*u,g++){x.moveTo(k,bb[3]);x.lineTo(k+hh,bb[1]);}x.stroke();x.restore();}
if(o.noStroke)return;path(x,p,j,s+17);x.stroke();
if(SK){x.save();x.globalAlpha*=.55;x.lineWidth*=.45;path(x,p,j*1.5,s+33);x.stroke();x.restore();}}
function seg(x,x1,y1,x2,y2,w,col,lw){x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.lineCap='round';x.strokeStyle=OL;x.lineWidth=w+2*lw;x.stroke();x.strokeStyle=col;x.lineWidth=w;x.stroke();x.strokeStyle=OL;x.lineWidth=lw;}
function lerpC(a,b,t){const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16);const m=s=>Math.round(((pa>>s)&255)*(1-t)+((pb>>s)&255)*t);return `rgb(${m(16)},${m(8)},${m(0)})`;}
function lines(x,X,Y,w,n,gap,col,u,seed){x.strokeStyle=col;x.lineWidth=Math.max(.6,1.3*u);x.beginPath();for(let i=0;i<n;i++){const ww=w*(.5+.5*hr(i*3.1+(seed||0)*9.7));x.moveTo(X,Y+i*gap);x.lineTo(X+ww,Y+i*gap);}x.stroke();x.strokeStyle=OL;}
function hose(x,a,L,thk,cm,u,lw){const sx=a.sw[0],sy=a.sw[1],dx=a.hx-sx,dy=a.hy-sy,d=Math.hypot(dx,dy)||1;let nx=-dy/d,ny=dx/d;if(nx*a.s+ny*.6<0){nx=-nx;ny=-ny;}const b=Math.sqrt(Math.max(0,(L*1.05)*(L*1.05)-d*d))*.5,j=SK?1.4*u:0;const cx=(sx+a.hx)/2+nx*b+(j?(hr(BOIL*31+a.s*7)-.5)*j:0),cy=(sy+a.hy)/2+ny*b+(j?(hr(BOIL*17+a.s*3)-.5)*j:0);
x.beginPath();x.moveTo(sx,sy);x.quadraticCurveTo(cx,cy,a.hx,a.hy);x.lineCap='round';x.strokeStyle=OL;x.lineWidth=thk+2*lw;x.stroke();x.strokeStyle=cm;x.lineWidth=thk;x.stroke();x.strokeStyle=OL;x.lineWidth=lw;}
function mitt(x,a,r,cm,u){shp(x,elP(a.hx,a.hy,r,r*.9),cm,u);}
const BOARD=(x,u,seed,hit)=>{const cols=['#D97757','#1D9E75','#888780','#378ADD','#888780','#D97757','#888780','#1D9E75'];for(let i=0;i<8;i++){const y=(-66+i*5.5)*u,x0=(68+(i%3===1?4:0))*u,w=(10+20*hr(i*5.3+seed))*u;if(hit&&i===3){x.fillStyle='rgba(217,119,87,0.35)';x.fillRect(66*u,y-2.4*u,36*u,4.8*u);}x.strokeStyle=cols[i];x.lineWidth=Math.max(.8,1.6*u);x.beginPath();x.moveTo(x0,y);x.lineTo(x0+w,y);x.stroke();}x.strokeStyle=OL;};
function drawProp(x,c,u,t,lw){const k=c.prop,a=cl(c.p.propA.x);if(!k||k==='pillow'||a<.02)return;const isK=c.type==='kodek';x.save();x.globalAlpha*=a;x.lineWidth=lw;x.strokeStyle=OL;x.lineJoin='round';
const cx=k==='machine'?94*u:k==='board'?84*u:k==='crt'?100*u:44*u;x.translate(cx,0);x.scale(.75+.25*a,.75+.25*a);x.translate(-cx,0);
if(k==='desk'){const bash=c.tg&&c.tg._parts==='bash';shp(x,rrP(96*u,-31*u,6*u,24*u,1.5*u),'#5F5E5A',u);shp(x,rrP(-15*u,-24*u,7*u,24*u,1.5*u),'#86837A',u,{hatch:1});shp(x,rrP(87*u,-24*u,7*u,24*u,1.5*u),'#86837A',u,{hatch:1});shp(x,rrP(-15*u,-3*u,9*u,3*u,1*u),'#5F5E5A',u);shp(x,rrP(86*u,-3*u,9*u,3*u,1*u),'#5F5E5A',u);shp(x,[[-20*u,-27*u],[98*u,-27*u],[106*u,-35*u],[-12*u,-35*u]],'#D3D1C7',u);shp(x,rrP(-20*u,-27*u,118*u,6*u,1.5*u),'#B4B2A9',u,{hatch:1});shp(x,[[-10*u,-29*u],[30*u,-29*u],[34*u,-33*u],[-6*u,-33*u]],DARK,u);shp(x,[[74*u,-30*u],[92*u,-30*u],[89*u,-34*u],[77*u,-34*u]],'#86837A',u);shp(x,rrP(81*u,-50*u,5*u,18*u,1*u),'#86837A',u);const sc=[[62*u,-82*u],[98*u,-86*u],[98*u,-48*u],[62*u,-46*u]];shp(x,[[98*u,-86*u],[103*u,-83*u],[103*u,-50*u],[98*u,-48*u]],'#5F5E5A',u);shp(x,sc,'#3D3D3A',u);const sn=[[65*u,-79*u],[95*u,-82*u],[95*u,-51*u],[65*u,-49*u]];shp(x,sn,bash?'#1E1E1C':'#FAF9F5',u,{noStroke:1});x.save();path(x,sn,0,0);x.clip();const nl=7,scr=(t*1.6)%1,cur=Math.floor(t*2.5);for(let i=0;i<nl;i++){const li=i+Math.floor(t*1.6),y=(-76+i*4.4-scr*4.4)*u,ind=bash?0:(li%4===1||li%4===2?4:0),w=(bash?6+16*hr(li*2.7):5+15*hr(li*3.1))*u,last=i===nl-2;const ww=last?w*((t*1.6)%1):w;x.fillStyle=bash?(i%3===0?'#EF9F27':'#5DCAA5'):['#D97757','#1D9E75','#378ADD','#888780'][li%4];x.fillRect((68+ind)*u,y,ww,1.8*u);if(last&&Math.floor(t*4)%2){x.fillStyle=bash?'#5DCAA5':'#2B1D16';x.fillRect((68+ind)*u+ww+1*u,y-1*u,1.5*u,3.8*u);}}x.restore();if(!(c.tg&&c.tg._mug))drawMug(x,46*u,-33*u,u,0,t,1);x.save();x.globalAlpha*=.25;x.fillStyle='#FFFFFF';x.beginPath();x.moveTo(65*u,-79*u);x.lineTo(76*u,-80*u);x.lineTo(65*u,-62*u);x.closePath();x.fill();x.restore();}
if(k==='crt'){const tg=c.tg||{};shp(x,rrP(78*u,-4*u,50*u,4*u,1*u),'#86837A',u);shp(x,[[122*u,-104*u],[131*u,-98*u],[131*u,-3*u],[122*u,-1*u]],'#B4B2A9',u,{hatch:1});shp(x,rrP(81*u,-104*u,42*u,103*u,4*u),'#D3D1C7',u);x.lineWidth=Math.max(.6,1.2*u);x.beginPath();for(let i=0;i<4;i++){x.moveTo(90*u,(-30+i*5)*u);x.lineTo(114*u,(-30+i*5)*u);}x.stroke();x.lineWidth=lw;x.fillStyle=Math.floor(t*3)%2?'#5DCAA5':'#1D9E75';x.beginPath();x.arc(90*u,-62*u,1.8*u,0,TAU);x.fill();x.fillStyle='#EF9F27';x.beginPath();x.arc(96*u,-62*u,1.8*u,0,TAU);x.fill();shp(x,[[82*u,-36*u],[70*u,-36*u],[82*u,-22*u]],'#86837A',u);shp(x,[[60*u,-40*u],[84*u,-40*u],[84*u,-51*u],[68*u,-51*u]],'#B4B2A9',u);shp(x,rrP(60*u,-40*u,24*u,4*u,1*u),'#86837A',u);x.fillStyle='#5F5E5A';for(let r=0;r<3;r++)for(let q=0;q<4;q++)x.fillRect((64+r*1.6+q*3.3)*u,(-49.5+r*3)*u,2.3*u,1.5*u);const ep=tg._enter?1.2:0;shp(x,rrP(78.5*u,(-50+ep)*u,5*u,5.5*u,1*u),'#EF9F27',u);shp(x,rrP(85*u,-99*u,34*u,30*u,4*u),'#3D3D3A',u);const gl=rrP(88*u,-96*u,28*u,24*u,6*u);shp(x,gl,'#1E1E1C',u,{noStroke:1});x.save();path(x,gl,0,0);x.clip();if(tg._scr==='run'){const rn=Math.max(0,tg._run||0),sp=Math.min(rn,1.6),off=(sp*14)%3.4;for(let i=0;i<8;i++){const li=i+Math.floor(sp*14/3.4);x.fillStyle=li%5===0?'#EF9F27':'#5DCAA5';x.fillRect(91*u,(-93+i*3.4-off)*u,(5+16*hr(li*2.3))*u,1.6*u);}if(rn>1.6&&Math.floor(t*3)%2){x.fillStyle='#5DCAA5';x.fillRect(91*u,-77*u,2.4*u,2.8*u);}if(rn<.18){x.fillStyle='rgba(93,202,165,'+(.5*(1-rn/.18))+')';x.fillRect(88*u,-96*u,28*u,24*u);}}else{x.fillStyle='rgba(93,202,165,0.45)';for(let i=0;i<3;i++)x.fillRect(91*u,(-92+i*3.4)*u,(6+13*hr(i*4.1))*u,1.6*u);x.fillStyle='#5DCAA5';x.fillRect(91*u,-79*u,2.4*u,1.6*u);const w=18*cl(tg._prog||0);x.fillRect(95*u,-79*u,w*u,1.6*u);if(Math.floor(t*4)%2)x.fillRect((96+w)*u,-80.2*u,1.8*u,3*u);}x.restore();x.save();x.globalAlpha*=.2;x.fillStyle='#FFFFFF';x.beginPath();x.ellipse(94*u,-90*u,5*u,2.4*u,-.4,0,TAU);x.fill();x.restore();}
if(k==='board'){x.beginPath();x.moveTo(72*u,0);x.lineTo(76*u,-24*u);x.moveTo(98*u,0);x.lineTo(94*u,-24*u);x.moveTo(85*u,-1*u);x.lineTo(85*u,-26*u);x.stroke();shp(x,rrP(64*u,-71*u,40*u,49*u,2*u),PAPER,u);BOARD(x,u,1,c.tg&&c.tg._hit);}
if(k==='machine'){shp(x,[[64*u,-54*u],[70*u,-59*u],[70*u,0],[64*u,-2*u]],'#86837A',u);shp(x,rrP(70*u,-59*u,48*u,59*u,5*u),'#B4B2A9',u,{hatch:1});shp(x,rrP(100*u,-52*u,14*u,9*u,2*u),'#2C2C2A',u);x.fillStyle=Math.floor(t*2)%2?'#5DCAA5':'#1D9E75';x.beginPath();x.arc(104*u,-47.5*u,1.8*u,0,TAU);x.fill();x.fillStyle='#D97757';x.beginPath();x.arc(110*u,-47.5*u,1.8*u,0,TAU);x.fill();
const gp=[];for(let i=0;i<16;i++){const an=i*TAU/16-c.boltAng*.6,r=(i%2?6:8)*u;gp.push([106*u+Math.cos(an)*r,-18*u+Math.sin(an)*r]);}shp(x,gp,STEEL,u);shp(x,elP(106*u,-18*u,2.4*u,2.4*u),DARK,u);
shp(x,elP(BOLT[0]*u,BOLT[1]*u,11*u,11*u),'#A8A49A',u);const hp=[];for(let i=0;i<6;i++){const an=i*PI/3+c.boltAng;hp.push([BOLT[0]*u+Math.cos(an)*7*u,BOLT[1]*u+Math.sin(an)*7*u]);}shp(x,hp,DARK,u);
if(c.tg&&c.tg._push){x.save();x.globalAlpha*=.8;x.strokeStyle='#D97757';x.lineWidth=Math.max(1,2*u);x.beginPath();x.arc(BOLT[0]*u,BOLT[1]*u,17*u,-.4,1.1);x.stroke();const ea=1.1,ex_=BOLT[0]*u+Math.cos(ea)*17*u,ey_=BOLT[1]*u+Math.sin(ea)*17*u;x.beginPath();x.moveTo(ex_-4*u,ey_-1*u);x.lineTo(ex_,ey_);x.lineTo(ex_+1*u,ey_-4.5*u);x.stroke();x.restore();}}
x.restore();}
function drawPillow(x,c,u,lw){const a=cl(c.p.propA.x);if(c.prop!=='pillow'||a<.02)return;x.save();x.globalAlpha*=a;x.lineWidth=lw;x.strokeStyle=OL;x.scale(.8+.2*a,.8+.2*a);const L=-72*u;shp(x,rrP(L,-15*u,56*u,15*u,7*u),PAPER,u,{hatch:1});x.beginPath();x.moveTo(L+10*u,-8*u);x.quadraticCurveTo(L+16*u,-5*u,L+22*u,-8*u);x.stroke();x.restore();}
function drawMug(x,px,py,u,rot,t,steam){x.save();x.translate(px,py);x.rotate(rot);x.lineWidth=Math.max(1,1.8*u);x.beginPath();x.lineWidth=Math.max(1.2,2.6*u);x.arc(6.5*u,-7*u,4.6*u,-PI/2,PI/2);x.stroke();x.lineWidth=Math.max(1,2.4*u);shp(x,rrP(-6.5*u,-14*u,13*u,14*u,2.6*u),PAPER,u);x.fillStyle='#D97757';x.fillRect(-5.8*u,-9.5*u,11.6*u,3*u);if(steam){x.strokeStyle='rgba(140,136,126,0.55)';x.lineWidth=Math.max(.8,1.3*u);for(let i=0;i<2;i++){const o=(t*.8+i*.5)%1;x.globalAlpha=1-o;x.beginPath();for(let k=0;k<=6;k++){const yy=(-16-k*2.4-o*6)*u,xx=((i?2:-1.5)+1.6*Math.sin(k*1.1+t*3+i))*u;k?x.lineTo(xx,yy):x.moveTo(xx,yy);}x.stroke();}}x.restore();}
const FOLD=[[[-20,-15],[0,-15],[20,-15],[20,15],[0,15],[-20,15]],[[-20,3],[0,-15],[20,3],[20,15],[0,15],[-20,15]],[[-10,3],[0,-15],[10,3],[10,15],[0,15],[-10,15]],[[-3,5],[22,0],[-10,-3],[-18,-9],[-15,1],[-18,5]]];
const foldHW=m=>m<.33?20:m<.66?20-10*ease((m-.33)/.33):10;
function morph(m,u){const k=Math.min(2,Math.floor(m*3)),p=ease(cl(m*3-k)),A=FOLD[k],B=FOLD[k+1];return A.map((q,i)=>[(q[0]+(B[i][0]-q[0])*p)*u,(q[1]+(B[i][1]-q[1])*p)*u]);}
function drawItems(x,c,arms,u,t,lw){const k=c.hold,a=cl(c.p.holdA.x);if(!k||a<.02)return;const L=arms[0],R=arms[1],tg=c.tg||{};x.save();x.globalAlpha*=a;x.lineWidth=lw;x.strokeStyle=OL;x.lineJoin='round';
if(k==='sheet'){const lx=L.hx+1*u,ty=L.hy-17*u,w=43*u,h=34*u;shp(x,rrP(lx,ty,w,h,1.5*u),PAPER,u);x.beginPath();x.moveTo(lx+w-6*u,ty);x.lineTo(lx+w-6*u,ty+6*u);x.lineTo(lx+w,ty+6*u);x.stroke();
for(let i=0;i<4;i++){const y=ty+9*u+i*6*u,ww=(24+10*hr(i*3.3+c.pageSeed*7.1))*u;if(tg._line===i&&tg._prog!=null){x.fillStyle='rgba(217,119,87,0.35)';x.fillRect(lx+4*u,y-2*u,ww*tg._prog,4*u);}x.strokeStyle='#B4B2A9';x.lineWidth=Math.max(.8,1.4*u);x.beginPath();x.moveTo(lx+4*u,y);x.lineTo(lx+4*u+ww,y);x.stroke();}x.strokeStyle=OL;x.lineWidth=lw;
if(tg._carry){x.save();x.translate(R.hx,R.hy);x.rotate(-.5);shp(x,rrP(-4*u,-2*u,30*u,24*u,1.5*u),PAPER,u);lines(x,0,5*u,20*u,3,5*u,'#B4B2A9',u,c.pageSeed+1);x.restore();}}
if(k==='paper'){const m=tg._fold||0,fr=cl((m-.6)/.3),cxp=(1-fr)*(R.hx-foldHW(m)*u-3*u)+fr*(R.hx+2*u),cyp=R.hy+(1-fr)*1*u-fr*2*u;x.translate(cxp,cyp);if(m>=1)x.rotate(-.15);shp(x,morph(m,u),PAPER,u);if(m>.33&&m<.9){x.strokeStyle='#B4B2A9';x.lineWidth=Math.max(.6,1.2*u);x.beginPath();x.moveTo(0,-15*u);x.lineTo(0,15*u);x.stroke();x.strokeStyle=OL;}}
if(k==='lens'){const lx=R.hx+11*u,ly=R.hy-11*u;seg(x,R.hx,R.hy,lx-3*u,ly+7*u,3.6*u,DARK,lw);x.save();x.beginPath();x.arc(lx,ly,10*u,0,TAU);x.clip();x.fillStyle='rgba(214,230,246,0.9)';x.fill();if(c.prop==='board'){x.translate(lx,ly);x.scale(1.8,1.8);x.translate(-lx,-ly);x.fillStyle=PAPER;x.fillRect(64*u,-71*u,40*u,49*u);BOARD(x,u,1,tg._hit);}x.restore();shp(x,elP(lx,ly,10*u,10*u),null,u);x.lineWidth=Math.max(1,3*u);x.strokeStyle=DARK;x.beginPath();x.arc(lx,ly,10*u,0,TAU);x.stroke();x.strokeStyle='#FFFFFF';x.lineWidth=Math.max(.8,1.6*u);x.beginPath();x.arc(lx-1*u,ly-1*u,6*u,PI*1.1,PI*1.45);x.stroke();}
if(k==='net'){const ph=c.p.pole.x,d=[Math.sin(ph),-Math.cos(ph)],b0=[R.hx-d[0]*9*u,R.hy-d[1]*9*u],b1=[R.hx+d[0]*58*u,R.hy+d[1]*58*u],hc=[R.hx+d[0]*73*u,R.hy+d[1]*73*u];c.hoop=[hc[0]/u,hc[1]/u];
const pn=[Math.cos(ph),Math.sin(ph)],RA=15*u,RB=8*u,rim=th_=>[hc[0]+d[0]*RA*Math.cos(th_)+pn[0]*RB*Math.sin(th_),hc[1]+d[1]*RA*Math.cos(th_)+pn[1]*RB*Math.sin(th_)],A_=rim(PI),B_=rim(0),tip=[hc[0]+pn[0]*30*u-d[0]*3*u,hc[1]+pn[1]*30*u-d[1]*3*u];const bag=()=>{x.beginPath();x.moveTo(A_[0],A_[1]);for(let i=1;i<=12;i++){const q=rim(PI+PI*i/12);x.lineTo(q[0],q[1]);}x.quadraticCurveTo(B_[0]+pn[0]*22*u,B_[1]+pn[1]*22*u,tip[0],tip[1]);x.quadraticCurveTo(A_[0]+pn[0]*24*u,A_[1]+pn[1]*24*u,A_[0],A_[1]);x.closePath();};bag();x.fillStyle='rgba(250,249,245,0.62)';x.fill();x.save();bag();x.clip();x.strokeStyle='rgba(95,94,90,0.45)';x.lineWidth=Math.max(.5,.9*u);x.beginPath();for(let i=-8;i<=8;i++){const o=i*4.5*u;x.moveTo(hc[0]+pn[0]*o-d[0]*40*u,hc[1]+pn[1]*o-d[1]*40*u);x.lineTo(hc[0]+pn[0]*(o+50*u)+d[0]*40*u,hc[1]+pn[1]*(o+50*u)+d[1]*40*u);x.moveTo(hc[0]+pn[0]*o+d[0]*40*u,hc[1]+pn[1]*o+d[1]*40*u);x.lineTo(hc[0]+pn[0]*(o+50*u)-d[0]*40*u,hc[1]+pn[1]*(o+50*u)-d[1]*40*u);}x.stroke();x.restore();x.lineWidth=Math.max(.6,1.2*u);bag();x.stroke();x.lineWidth=lw;if(tg._page!=null&&tg._page>=1.33&&tg._page<2.45){const s=1-.45*cl((tg._page-1.33)/.4);drawWebPage(x,hc[0]+pn[0]*15*u,hc[1]+pn[1]*15*u,s,u,lw,ph);}
seg(x,b0[0],b0[1],b1[0],b1[1],3.2*u,'#C9A27A',lw);x.lineWidth=Math.max(1,2.6*u);x.strokeStyle=DARK;x.beginPath();x.ellipse(hc[0],hc[1],15*u,8*u,ph-PI/2,0,TAU);x.stroke();}
if(k==='wrench'){const bx=BOLT[0]*u,by=BOLT[1]*u,ang=Math.atan2(R.hy-by,R.hx-bx),len=Math.hypot(R.hx-bx,R.hy-by);if(c.pAng!=null){let dA=ang-c.pAng;dA=Math.atan2(Math.sin(dA),Math.cos(dA));if(dA<0)c.boltAng+=dA;}c.pAng=ang;x.translate(bx,by);x.rotate(ang);shp(x,rrP(9*u,-3.6*u,len-6*u,7.2*u,3.4*u),STEEL,u);shp(x,[[-12*u,-10*u],[12*u,-10*u],[12*u,10*u],[-12*u,10*u],[-12*u,4.5*u],[-4*u,4.5*u],[-4*u,-4.5*u],[-12*u,-4.5*u]].map(p=>[p[0]+3*u,p[1]]),STEEL,u);}
x.restore();}
function drawWebPage(x,px,py,s,u,lw,rot){x.save();x.translate(px,py);x.rotate(rot||0);x.scale(s,s);x.lineWidth=lw;x.strokeStyle=OL;shp(x,rrP(-10*u,-8*u,20*u,16*u,2*u),PAPER,u);x.fillStyle='#E3E0D5';x.fillRect(-9*u,-7*u,18*u,3.5*u);x.fillStyle='#D97757';x.beginPath();x.arc(-6.5*u,-5.2*u,1*u,0,TAU);x.fill();x.strokeStyle='#378ADD';x.lineWidth=Math.max(.8,1.4*u);x.beginPath();x.moveTo(-7*u,0);x.lineTo(3*u,0);x.stroke();lines(x,-7*u,3.5*u,12*u,2,3*u,'#B4B2A9',u,2);x.restore();}
function drawC(x,c,X,Y,u,t){SID=0;
const P=c.p,tg=c.tg||{},isK=c.type==='kodek',pal=PAL[c.type];
const gr=cl(P.grey.x),cm=lerpC(pal.m,pal.g,gr),cs=lerpC(pal.s,pal.gs,gr),cb=lerpC(pal.b,pal.gs,gr);
const wob=cl(P.wobW.x),shk=cl(P.shake.x),th=P.th.x+.4*Math.cos(t*4)*wob+.35*Math.sin(t*28)*shk,co=Math.cos(th),si=Math.sin(th);
const sit=cl(P.sit.x),loaf=cl(P.loaf.x),down=Math.max(sit,loaf),walk=cl(P.walkW.x),lean=cl(P.lean.x);
const hph=c.hp%1;let h=0,sq=0;if(hph<.42){h=Math.sin(PI*hph/.42);sq=.07*Math.cos(PI*hph/.42);}else if(hph<.58){sq=-.13*Math.sin(PI*(hph-.42)/.16);}
const hw=cl(P.hopW.x);h*=hw;sq*=hw;
const wb=Math.abs(Math.sin(t*10))*walk,br=Math.sin(t*(2.3-loaf))*.02*(1+cl(P.sleep.x)*1.5),tb=Math.abs(Math.sin(t*20))*.008*cl(P.typeW.x);
const pil=c.prop==='pillow'?cl(P.propA.x)*loaf:0;
const hopY=(h*24+wb*2.5+pil*4)*u;
const W=(isK?88:98)*u,Dp=(isK?50:52)*u,H=(isK?64:58)*u*(1-.1*loaf),legH=17*u,bot=-12*u*(1-down),top=bot-H,R=(isK?18:3.5)*u,lw=Math.max(1,2.4*u);
const hW=(W*Math.abs(co)+Dp*Math.abs(si))/2,XX=X+P.lx.x*u;
const sc=1+.1*lean,rot=Math.sin(t*4)*.1*wob+Math.sin(t*1.4)*.035*cl(P.think.x)+loaf*.06+pil*.08+P.tilt.x,scx=sc*(1-(sq+br)*.6),scy=sc*(1+sq+br+tb),oy=-hopY+lean*4*u,cr=Math.cos(rot),sr=Math.sin(rot);
const toW=(lx,ly)=>{const a=lx*scx,b=ly*scy;return [a*cr-b*sr,a*sr+b*cr+oy];};
const GA=1-.22*cl(P.dim.x);
const bodyT=()=>{x.save();x.translate(XX,Y+oy);x.rotate(rot);x.scale(scx,scy);x.globalAlpha=GA;x.lineWidth=lw;x.lineJoin='round';x.lineCap='round';x.strokeStyle=OL;};
const worldT=()=>{x.save();x.translate(XX,Y);x.globalAlpha=GA;x.lineWidth=lw;x.lineJoin='round';x.lineCap='round';x.strokeStyle=OL;};
const pj=(lx,lz)=>[lx*co+lz*si,-lx*si+lz*co];
x.save();x.fillStyle='rgba(0,0,0,0.16)';x.beginPath();x.ellipse(XX,Y,hW*1.1*(1-h*.3),Math.max(2,7*u)*(1-h*.3),0,0,TAU);x.fill();x.restore();
worldT();drawPillow(x,c,u,lw);x.restore();
const shY=top+H*.52,AL=(isK?26:30)*u,thk=9*u,mr=(isK?5.5:6.2)*u;
const arms=[-1,1].map(s=>{const k=s<0?'L':'R',q=pj(s*.46*W,0),sw0=toW(q[0],shY);const a=P['arm'+k].x+P['osc'+k].x*Math.sin(t*c.f+(s<0?1.7:0)),fw=walk*Math.sin(t*10+(s<0?0:PI))*.6;const ox=s*Math.sin(a),oy=Math.cos(a),up=Math.max(0,-oy),oz=.22+.2*up+fw,n=Math.hypot(ox,oy,oz)||1,hq=pj(ox/n,oz/n),pl=Math.hypot(hq[0],oy/n),AE=AL*(1+.75*up);const ah=[sw0[0]+hq[0]*AE*.92,sw0[1]+oy/n*AE*.92];const ik=cl(P['ik'+k].x);const dE=(q[1]+hq[1]*AL*.5)*(1-ik)+ik*10*u,fr=cl((dE+3*u)/(6*u));let sw=sw0;if(q[1]<0){const m=cl(-q[1]/(8*u))*fr,e=toW(Math.sign(q[0]||s)*(hW-3*u),shY);sw=[sw0[0]+(e[0]-sw0[0])*m,sw0[1]+(e[1]-sw0[1])*m];}return {s,k,sw,ah,ik,fr,L:AL*ik+(1-ik)*AE*cl(pl*.97,.3,1),hx:ah[0]*(1-ik)+P['hx'+k].x*u*ik,hy:ah[1]*(1-ik)+P['hy'+k].x*u*ik};});

c.hand=arms.map(a=>[a.hx/u,a.hy/u]);c.aHand=arms.map(a=>[a.ah[0]/u,a.ah[1]/u]);
bodyT();
const LG=isK?[[-.25,0],[.25,0]]:[[-.33,.22],[-.12,-.22],[.12,-.22],[.33,.22]],lwid=(isK?16:10)*u;
const legs=LG.map(([a,b],i)=>{const q=pj(a*W,b*Dp);return {x:q[0],z:q[1],i};}).sort((a,b)=>a.z-b.z);
const lLen=legH*(1-down);
if(lLen>1)legs.forEach(g=>{const lift=Math.max(0,Math.sin(t*10+g.i*PI))*5*u*walk;shp(x,rrP(g.x-lwid/2,bot-5*u-lift,lwid,lLen+5*u,3.5*u),g.z<-.5*u?cs:cm,u);});
x.restore();
worldT();arms.forEach(a=>{if(a.fr<1){hose(x,a,a.L,thk,cm,u,lw);mitt(x,a,mr,cm,u);}});const netBack=c.hold==='net'&&P.pole.x<-.3;if(netBack)drawItems(x,c,arms,u,t,lw);x.restore();
bodyT();
if(isK){const by=top+2*u,len=15*u,tx=Math.sin(c.aa)*len,ty=by-Math.cos(c.aa)*len;x.beginPath();x.moveTo(0,by);x.lineTo(tx,ty);x.stroke();shp(x,elP(tx,ty,4.5*u,4.5*u),gr>.5?'#E24B4A':'#5DCAA5',u);}
shp(x,rrP(-hW,top,hW*2,H,R),cs,u,{hatch:1});
const fwid=W*Math.abs(co),front=co>=0,fcx=(front?1:-1)*Dp/2*si;
if(fwid>1.5){shp(x,rrP(fcx-fwid/2,top,fwid,H,Math.min(R,fwid/2)),front?cm:cb,u);
x.save();x.globalAlpha=GA*.55;shp(x,rrP(fcx-fwid/2+R*.7+3*u*Math.abs(co),top+4*u,Math.max(.1,fwid-R*1.4-6*u*Math.abs(co)),4.5*u,2.2*u),pal.h,u,{noStroke:1});x.restore();
if(!front&&isK&&fwid>6*u){x.save();x.lineWidth=lw*.7;x.beginPath();for(let i=0;i<3;i++){const yy=top+H*(.35+.13*i);x.moveTo(fcx-fwid*.25,yy);x.lineTo(fcx+fwid*.25,yy);}x.stroke();x.restore();}}
const ey=top+H*.42+P.look.x*4.5*u,exs=P.ex.x*4*u*co;
const bl=c.blink>0?Math.sin(PI*(c.blink/.16)):0,sl=cl(P.sleep.x),hp=cl(P.happy.x),dz=cl(P.dizzy.x),sqn=cl(P.squint.x);
const open=Math.max(0,1-Math.max(bl,sl,hp,dz,sqn)),ea=cl(co*3),saver=isK&&loaf>.5;
let ecol='#1E1410';
if(front&&fwid>4*u){
if(isK){const m=8*u*co,sx0=fcx-fwid/2+m,sy0=top+8*u,sw=fwid-2*m,sh=H-20*u,tw=cl(P.typeW.x);shp(x,rrP(sx0,sy0,sw,sh,9*u*co),'#2C2C2A',u);ecol='#5DCAA5';
x.save();path(x,rrP(sx0,sy0,sw,sh,9*u*co),0,0);x.clip();
if(tw>.02){x.globalAlpha=GA*tw;x.fillStyle=ecol;const off=(t*18*u)%(6*u);for(let i=0;i<4;i++){const ly=sy0+sh*.66+i*6*u-off;const ww=sw*(.2+.5*(((i*7+Math.floor(t*3))%5)/5));x.fillRect(sx0+6*u*co,ly,ww,2.2*u);}}
if(saver){const tri=v=>Math.abs((((v%1)+1)%1)*2-1);x.globalAlpha=GA*loaf*.85;x.fillStyle=ecol;x.fillRect(sx0+3*u+(sw-9*u)*tri(t*.23),sy0+3*u+(sh-9*u)*tri(t*.31),3.5*u,3.5*u);}
x.restore();
if((Math.floor(t*2.2)%2)&&open>.3){x.save();x.globalAlpha=GA*(1-tw)*open*ea;x.fillStyle=ecol;x.fillRect(fcx-5*u*co,top+H*.66,10*u*co,3*u);x.restore();}}
[-1,1].forEach(s=>{const ex=fcx+s*(isK?.17:.2)*W*co+exs,ew=(isK?8.5:11)*u*Math.sqrt(Math.max(0,co)),eh=(isK?15:22)*u;
x.save();x.fillStyle=ecol;x.strokeStyle=ecol;x.lineWidth=Math.max(1,2.6*u);
if(open>.02&&!saver){x.globalAlpha=GA*ea;shp(x,rrP(ex-ew/2,ey-eh*open/2,ew,Math.max(.5,eh*open),ew/2),ecol,u,{noStroke:1,j:.5});if(!isK){x.fillStyle='#FFFFFF';x.beginPath();x.arc(ex+ew*.18,ey-eh*open*.22,2.4*u*open,0,TAU);x.fill();}}
if(sl>.02&&!saver){x.globalAlpha=GA*ea*sl;x.beginPath();x.arc(ex,ey-2*u,5.5*u,.15*PI,.85*PI);x.stroke();}
if(sqn>.05){x.globalAlpha=GA*ea*sqn;x.beginPath();x.moveTo(ex-5*u,ey-3*u*s);x.lineTo(ex+5*u,ey+3*u*s);x.moveTo(ex-5*u,ey+1*u);x.lineTo(ex+5*u,ey+1*u);x.stroke();}
if(hp>.02){x.globalAlpha=GA*ea*hp;x.beginPath();x.arc(ex,ey+5*u,5.5*u,1.15*PI,1.85*PI);x.stroke();}
if(dz>.02){x.globalAlpha=GA*ea*dz;const k=5*u;x.beginPath();x.moveTo(ex-k,ey-k);x.lineTo(ex+k,ey+k);x.moveTo(ex+k,ey-k);x.lineTo(ex-k,ey+k);x.stroke();}
if(hp>.02&&!isK){x.globalAlpha=GA*ea*hp*.6;x.fillStyle='#F0997B';x.beginPath();x.ellipse(ex+s*6*u*co,ey+14*u,6*u*co,3.5*u,0,0,TAU);x.fill();}
x.restore();});}
x.globalAlpha=GA;x.strokeStyle=OL;x.lineWidth=lw;
if(sit>.05&&loaf<.5){legs.filter(g=>isK||g.z>=-.5*u).forEach(g=>{const sw=Math.sin(t*6+g.i*2)*2.5*u*cl(P.swing.x);x.save();x.globalAlpha=GA*sit;shp(x,elP(g.x+si*6*u,-3*u+sw,7*u,5*u),cm,u);x.restore();});}
x.restore();
worldT();drawProp(x,c,u,t,lw);
arms.forEach(a=>{if(a.fr>0){x.globalAlpha=GA*a.fr;hose(x,a,a.L,thk,cm,u,lw);x.globalAlpha=GA;}});
if(!netBack)drawItems(x,c,arms,u,t,lw);if(tg._mug){const R_=arms[1];drawMug(x,R_.hx-11*u*Math.cos(tg._mugRot||0),R_.hy+6*u-11*u*Math.sin(tg._mugRot||0),u,tg._mugRot||0,t,0);}
arms.forEach(a=>{if(a.fr>0){x.globalAlpha=GA*a.fr;mitt(x,a,mr*(a.s>0&&tg._big?1.3+.2*lean:1),cm,u);x.globalAlpha=GA;}});
x.restore();
bodyT();
const bs=Math.max(0,P.bubble.x);if(bs>.02){x.save();x.translate(-hW*.62,top-20*u);x.scale(bs,bs);shp(x,[[5*u,8*u],[10*u,18*u],[-2*u,9*u]],'#D97757',u);shp(x,rrP(-12*u,-13*u,24*u,24*u,7*u),'#D97757',u);x.fillStyle='#FFFFFF';x.font=`500 ${Math.max(8,17*u)}px ${FF}`;x.textAlign='center';x.textBaseline='middle';x.fillText('!',0,0);x.restore();}
const tk=cl(P.think.x);if(tk>.02){x.save();x.globalAlpha=GA*tk;const an=t*2.2;x.translate(Math.cos(an)*30*u,top-22*u+Math.sin(an)*6*u);x.rotate(t*1.5);x.fillStyle='#D97757';x.font=`${Math.max(9,22*u)}px ${FF}`;x.textAlign='center';x.textBaseline='middle';x.fillText(SPIN[Math.floor(t*8)%SPIN.length],0,0);x.restore();}
if(dz>.02){x.save();x.globalAlpha=GA*dz;x.fillStyle='#EF9F27';x.font=`${Math.max(8,14*u)}px ${FF}`;x.textAlign='center';x.textBaseline='middle';for(let i=0;i<3;i++){const an=t*3+i*2.09;x.fillText('✶',Math.cos(an)*34*u,top-8*u+Math.sin(an)*6*u);}x.restore();}
x.restore();
worldT();
if(c.hold==='net'&&tg._page!=null){const a=tg._page;if(a<1.33){const pp=pagePos(a);drawWebPage(x,pp[0]*u,pp[1]*u,1,u,lw,.15*Math.sin(a*3));}
if(a>1.2&&a<1.6){const k=(a-1.2)/.4,Rr=arms[1],ph=P.pole.x;x.globalAlpha=GA*(1-k)*.8;x.strokeStyle='#B4B2A9';x.lineWidth=Math.max(1,2*u);for(let i=0;i<2;i++){x.beginPath();x.arc(Rr.hx,Rr.hy,(64+i*10)*u,ph-PI/2+.25,ph-PI/2+1.1);x.stroke();}}}
c.parts.forEach(q=>{const k=q.life/q.max,px=q.x*u,py=q.y*u;x.save();x.globalAlpha=(1-k)*(q.tw?(.6+.4*Math.sin(q.life*14)):1);x.lineWidth=Math.max(1,2*u);x.strokeStyle=OL;x.lineJoin='round';
if(q.k==='imp'){x.strokeStyle='#D97757';x.beginPath();[-.8,0,.8].forEach(a=>{const r1=(4+k*8)*u,r2=r1+5*u;x.moveTo(px+Math.cos(a)*r1,py+Math.sin(a)*r1);x.lineTo(px+Math.cos(a)*r2,py+Math.sin(a)*r2);});x.stroke();}
else if(q.k==='plane'){x.globalAlpha=k>.8?(1-k)*5:1;x.translate(px,py);x.rotate(Math.atan2(q.vy,q.vx)*.6);shp(x,morph(1,u),PAPER,u);}
else if(q.k==='page'){x.translate(px,py);x.rotate(-.5+Math.sin(q.life*5)*.6);x.scale(Math.cos(q.life*7),1);shp(x,rrP(-13*u,-11*u,26*u,22*u,1.5*u),PAPER,u);lines(x,-9*u,-5*u,16*u,3,5*u,'#B4B2A9',u,3);}
else if(q.k==='drop'){x.fillStyle='#85B7EB';x.beginPath();x.moveTo(px,py-4*u);x.quadraticCurveTo(px+3.5*u,py+1*u,px,py+2.5*u);x.quadraticCurveTo(px-3.5*u,py+1*u,px,py-4*u);x.fill();x.lineWidth=Math.max(.6,1*u);x.stroke();}
else{x.fillStyle=COL[q.col]||COL.clay;x.font=`${Math.max(8,q.s*u*(q.grow?1+k:1))}px ${FF}`;x.textAlign='center';x.fillText(q.t,px,py);}
x.restore();});
x.restore();}
const big=[mkC('clawd','web'),mkC('kodek','web')];
const mini=[mkC('clawd','needs'),mkC('kodek','bash'),mkC('clawd','web'),mkC('kodek','mcp'),mkC('clawd','sleep')];
function mkBtns(el,list,cur){list.forEach(([k,n])=>{const b=document.createElement('button');b.textContent=n;b.dataset.k=k;if(k===cur)b.className='on';b.onclick=()=>{document.querySelectorAll('#btns button,#tools button').forEach(e=>e.className=e===b?'on':'');setSt(big[0],k);setTimeout(()=>setSt(big[1],k),160);};el.appendChild(b);});}
mkBtns($('btns'),[['thinking','Myśli'],['needs','Czeka na Ciebie'],['done','Skończył'],['error','Błąd'],['idle','Bezczynny'],['sleep','Śpi']],'');
mkBtns($('tools'),[['edit','Edytuje'],['bash','Bash'],['read','Czyta plik'],['grep','Szuka w kodzie'],['web','Szuka w sieci'],['agent','Subagent'],['mcp','Narzędzie MCP']],'web');
const sw=$('sty');[['Styl rysowany',true],['Styl czysty',false]].forEach(([n,v])=>{const b=document.createElement('button');b.textContent=n;if(v)b.className='on';b.onclick=()=>{SK=v;sw.querySelectorAll('button').forEach(e=>e.className=e===b?'on':'');};sw.appendChild(b);});
function rr(x,X,Y,W,H,R){x.beginPath();x.roundRect?x.roundRect(X,Y,W,H,R):x.rect(X,Y,W,H);}
let last=performance.now(),T0=0;{const q=typeof location!=='undefined'?new URLSearchParams(location.search):null;if(q&&q.get('st')){setSt(big[0],q.get('st'),true);setSt(big[1],q.get('st'),true);}}
function frame(now){if(window.__strip)return;let dt=Math.min(.05,(now-last)/1000);last=now;if($('slow').checked)dt*=.25;T0+=dt;BOIL=Math.floor(T0*8);
big.forEach((c,i)=>stepC(c,dt,T0+i*.37));mini.forEach((c,i)=>stepC(c,dt,T0+i*.5));
const x=A.x;x.clearRect(0,0,A.w,A.h);const DB=typeof location!=='undefined'?new URLSearchParams(location.search):new Map();const u=DB.get('u')?+DB.get('u'):Math.min(1.2,A.w/560);const tcol=getComputedStyle($('lbl')).color;
big.forEach((c,i)=>{if(DB.get('one')&&i!==+DB.get('one')-1)return;const X=DB.get('one')?A.w*.3:A.w*(i?0.66:0.2);drawC(x,c,X,A.h-52,u,T0+i*.37);x.fillStyle=tcol;x.font=`13px ${FF}`;x.textAlign='center';x.fillText((i?'Kodek':'Clawd')+' · '+c.act[0],X+30,A.h-16);});
const b=B.x;b.clearRect(0,0,B.w,B.h);b.fillStyle='rgba(128,128,128,0.35)';for(let i=0;i<4;i++){rr(b,70+i*34,13,22,22,5);b.fill();}
const sx=B.w-40-mini.length*74;b.fillStyle='rgba(128,128,128,0.35)';b.fillRect(sx-18,10,1,28);
mini.forEach((c,i)=>{const X=sx+i*74+20;drawC(b,c,X,40,.3,T0+i*.5);b.fillStyle='rgba(128,128,128,0.3)';b.fillRect(X-14,44,28,2);b.fillStyle=c.type==='clawd'?'#D97757':'#5DCAA5';b.fillRect(X-14,44,28*[.43,.55,.3,1,.7][i],2);});
requestAnimationFrame(frame);}
window.addEventListener('resize',()=>{A=fit($('cv'));B=fit($('tb'));});
requestAnimationFrame(frame);
;(function(){if(typeof location==='undefined')return;const q=new URLSearchParams(location.search);if(!q.get('strip'))return;window.__strip=1;
const times=q.get('strip').split(',').map(Number),st=q.get('st'),u=+(q.get('u')||1.4),ty=q.get('ty')||'clawd',rows=+(q.get('rows')||1),RH=+(q.get('rh')||190);
const cv=$('cv');cv.style.height=(rows*(+(q.get('rh')||190)))+'px';A=fit(cv);const x=A.x;const per=Math.ceil(times.length/rows),cw=A.w/per;
window.requestAnimationFrame=()=>{};
x.clearRect(0,0,A.w,A.h);times.forEach((tt,i)=>{SK=q.get('clean')?false:true;let sd=+(q.get('seed')||7);Math.random=()=>{sd=(sd*16807)%2147483647;return (sd-1)/2147483646;};const c=mkC(ty,st);if(q.get('act')){const s_=S[st];const A_=(s_.seq||[]).concat(s_.acts).find(a=>a[0].startsWith(q.get('act')));startAct(c,A_);}let T=0;const dt=1/60;while(T<tt){T+=dt;BOIL=Math.floor(T*8);if(q.get('act')&&c.aT+dt>c.act[1])c.aT=0;stepC(c,dt,T);if(Math.round(T*60)%2===0){drawC(x,c,-9999,0,u,T);}}
const col=i%per,row=Math.floor(i/per);x.save();x.beginPath();x.rect(col*cw,row*RH,cw,RH);x.clip();drawC(x,c,col*cw+cw*.3,row*RH+RH-24,u,T);x.fillStyle='#6B6A63';x.font='11px sans-serif';x.fillText(tt.toFixed(2)+'s '+c.act[0],col*cw+4,row*RH+14);x.restore();});})();
