import {startPoint,zoneAt} from './model.js';
// Fixed draws keep the cloud reproducible and avoid flicker during playback.
function draws(count){let seed=17421;const uniform=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};const normal=()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());return Array.from({length:count},()=>[normal(),normal(),normal(),normal()]);}
const samples=draws(512);
export function cloudAt(s,minutes,errors={speed:20,direction:10,position:.5}){
 const [x0,y0]=startPoint(s),t=minutes*60;
 const z=s.altitude+Math.max(0,Math.min(s.ceiling-s.altitude,s.ascent*t));
 const reaches=s.altitude>=1000||(s.ascent>0&&s.ceiling>=1000);
 const cross=s.altitude>=1000?0:(1000-s.altitude)/s.ascent;
 const lower=s.shear&&reaches?Math.min(t,cross):t,upper=t-lower;
 const points=samples.map(([nx,ny,nv,na])=>{
  const factor=Math.max(0,1+nv*errors.speed/100),angle=na*errors.direction*Math.PI/180;
  const a=s.direction*Math.PI/180+angle,b=s.upperDirection*Math.PI/180+angle;
  return [x0+nx*errors.position+factor*(lower*s.speed*Math.sin(a)+upper*s.upperSpeed*Math.sin(b))/1000,y0+ny*errors.position+factor*(lower*s.speed*Math.cos(a)+upper*s.upperSpeed*Math.cos(b))/1000];
 });
 const mean=points.reduce((m,p)=>[m[0]+p[0]/points.length,m[1]+p[1]/points.length],[0,0]);
 let xx=0,yy=0,xy=0;for(const p of points){const dx=p[0]-mean[0],dy=p[1]-mean[1];xx+=dx*dx/points.length;yy+=dy*dy/points.length;xy+=dx*dy/points.length;}
 const root=Math.hypot(xx-yy,2*xy),a=Math.max((xx+yy+root)/2,1e-10),b=Math.max((xx+yy-root)/2,1e-10),angle=.5*Math.atan2(2*xy,xx-yy),co=Math.cos(angle),si=Math.sin(angle);
 const distances=points.map(p=>{const dx=p[0]-mean[0],dy=p[1]-mean[1];return (dx*co+dy*si)**2/a+(-dx*si+dy*co)**2/b;}).sort((x,y)=>x-y);
 const ellipse=q=>{const radius=Math.sqrt(distances[Math.ceil(q*points.length)-1]);return {rx:Math.sqrt(a)*radius,ry:Math.sqrt(b)*radius};};
 const p50=ellipse(.5),p90=ellipse(.9),p99=ellipse(.99);
 return {points,mean,angle,p50,p90,p99,altitude:z,area90:Math.PI*p90.rx*p90.ry,controlledFraction:points.filter(p=>zoneAt(p,z)).length/points.length};
}
