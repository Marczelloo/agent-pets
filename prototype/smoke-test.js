// headless smoke test: stub canvas/DOM and run many frames through every state
const noop=()=>{};const ctx=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==='measureText'?()=>({width:1}):noop),set:(t,k,v)=>(t[k]=v,true)});
const el=()=>({clientWidth:680,clientHeight:300,getContext:()=>ctx,style:{},dataset:{},appendChild:noop,querySelectorAll:()=>[],set onclick(v){this._c=v},get onclick(){return this._c},checked:false});
const els={};global.document={getElementById:id=>els[id]||(els[id]=el()),createElement:()=>el(),body:{}};
global.window={devicePixelRatio:1,addEventListener:noop};global.getComputedStyle=()=>({fontFamily:'x',color:'#000'});
let raf=null;global.requestAnimationFrame=f=>{raf=f};global.performance={now:()=>0};
eval(require('fs').readFileSync(process.argv[2]||__dirname+'/pets.js','utf8')+';global.__t={big,mini,setSt,stepC,drawC,frame:()=>raf,S};');
const G=global.__t;let now=0;
for(const st of Object.keys(G.S)){G.setSt(G.big[0],st);G.setSt(G.big[1],st);for(let i=0;i<260;i++){now+=16;raf(now);}
 for(const c of G.big.concat(G.mini)){for(const k in c.p){if(!isFinite(c.p[k].x)){console.log('NaN',st,k);process.exit(1);}}}
 console.log(st,'ok',G.big[0].act[0],"|",G.big[1].act[0],"th=",G.big[0].p.th.x.toFixed(2));}
