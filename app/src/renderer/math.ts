export const PI=Math.PI,TAU=PI*2,cl=(v: number,a=0,b=1)=>Math.max(a,Math.min(b,v)),ease=(v: any)=>v<.5?2*v*v:1-Math.pow(-2*v+2,2)/2,eOut=(v: any)=>1-Math.pow(1-v,3);
export const kf=(a: any,F: any)=>{if(a<=F[0][0])return F[0].slice(1);for(let i=1;i<F.length;i++){if(a<=F[i][0]){const p=ease((a-F[i-1][0])/(F[i][0]-F[i-1][0]));return F[i].slice(1).map((v: any,j: any)=>F[i-1][j+1]+(v-F[i-1][j+1])*p);}}return F[F.length-1].slice(1);};
export function hr(n: any){n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n);}
export function lerpC(a: any,b: any,t: any){const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16);const m=(s: any)=>Math.round(((pa>>s)&255)*(1-t)+((pb>>s)&255)*t);return `rgb(${m(16)},${m(8)},${m(0)})`;}
