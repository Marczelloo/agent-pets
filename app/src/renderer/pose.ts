export const K=['th','look','ex','lx','sit','loaf','lean','tilt','armL','armR','oscL','oscR','ikL','ikR','hxL','hyL','hxR','hyR','happy','sleep','dizzy','squint','grey','bubble','think','propA','holdA','typeW','walkW','wobW','dim','hopW','swing','shake','pole'];
export const DEF: Record<string, number>={};K.forEach((k: any)=>DEF[k]=0);DEF.armL=.35;DEF.armR=.35;DEF.pole=.45;
export const SPR: Record<string, number[]>={th:[70,11],lx:[40,10],bubble:[280,13],armL:[110,13],armR:[110,13],hxL:[170,19],hyL:[170,19],hxR:[170,19],hyR:[170,19],ikL:[120,16],ikR:[120,16],pole:[260,18],tilt:[90,14]};
