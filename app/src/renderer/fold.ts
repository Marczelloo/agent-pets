import { cl, ease } from "./math";
export const FOLD=[[[-20,-15],[0,-15],[20,-15],[20,15],[0,15],[-20,15]],[[-20,3],[0,-15],[20,3],[20,15],[0,15],[-20,15]],[[-10,3],[0,-15],[10,3],[10,15],[0,15],[-10,15]],[[-3,5],[22,0],[-10,-3],[-18,-9],[-15,1],[-18,5]]];
export const foldHW=(m: any)=>m<.33?20:m<.66?20-10*ease((m-.33)/.33):10;
export function morph(m: any,u: any){const k=Math.min(2,Math.floor(m*3)),p=ease(cl(m*3-k)),A=FOLD[k],B=FOLD[k+1];return A.map((q: any,i: any)=>[(q[0]+(B[i][0]-q[0])*p)*u,(q[1]+(B[i][1]-q[1])*p)*u]);}
