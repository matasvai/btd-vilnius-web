import {REGION} from './region.js';

export function inside(point,ring){
 let hit=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}
export const inPolygons=(point,polygons)=>polygons.some(([outer,...holes])=>inside(point,outer)&&!holes.some(r=>inside(point,r)));
export const contains=(f,p)=>p[0]>=f.bounds[0]&&p[0]<=f.bounds[2]&&p[1]>=f.bounds[1]&&p[1]<=f.bounds[3]&&inPolygons(p,f.polygons);
export const controlled=REGION.airspaces.filter(f=>f.controlled).sort((a,b)=>a.lower.metres-b.lower.metres);
export const inHeight=(f,z)=>z>=f.lower.metres&&z<(f.upper.metres??Infinity);
// A small spatial index avoids testing distant polygons for every cloud sample.
const cells=new Map(),size=20,key=(x,y)=>`${Math.floor(x/size)},${Math.floor(y/size)}`;
for(const f of controlled)for(let x=Math.floor(f.bounds[0]/size);x<=Math.floor(f.bounds[2]/size);x++)for(let y=Math.floor(f.bounds[1]/size);y<=Math.floor(f.bounds[3]/size);y++){
 const k=`${x},${y}`;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(f);
}
export function zoneAt(p,z){return (cells.get(key(...p))??[]).find(f=>inHeight(f,z)&&contains(f,p))?.name??null;}
export function altitudeBands(z){return {
 red:controlled.filter(f=>inHeight(f,z)).flatMap(f=>f.polygons),
 yellow:controlled.filter(f=>z<f.lower.metres&&f.lower.metres-z<=150).flatMap(f=>f.polygons)
};}
export const layerOf=f=>f.controlled?(['CTA','UTA'].includes(f.kind)?'upper':'controlled'):['ATZ','FIZ','TIZ'].includes(f.kind)?'local':f.kind==='FIR'?'upper':'special';
export function airspacesAt(point){return REGION.airspaces.filter(f=>contains(f,point));}
