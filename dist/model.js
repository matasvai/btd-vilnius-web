import {DATA} from './data.js';
import {REGION} from './region.js';
import {inside,inPolygons,zoneAt,altitudeBands} from './airspace.js';
export {inside,zoneAt,altitudeBands};
export const defaults={start:0,origin:null,speed:10,direction:300,altitude:350,ascent:2,ceiling:1500,shear:false,upperSpeed:15,upperDirection:315,delay:5};
export const mapBounds=REGION.bounds;
export function startPoint(s){return s.origin??presetOrigins[s.start];}
export function toCoordinates([x,y]){const {kmPerDegree:k,cosLatitude:c}=DATA.projection;return {latitude:DATA.airport[1]+y/k,longitude:DATA.airport[0]+x/(k*c)};}
export function fromCoordinates(latitude,longitude){const {kmPerDegree:k,cosLatitude:c}=DATA.projection;return [(longitude-DATA.airport[0])*k*c,(latitude-DATA.airport[1])*k];}
export function onMap([x,y]){return Number.isFinite(x)&&Number.isFinite(y)&&x>=mapBounds.west&&x<=mapBounds.east&&y>=mapBounds.south&&y<=mapBounds.north;}
export function compassBearing(x,y){return (Math.round(Math.atan2(x,-y)*180/Math.PI)+360)%360;}
export const cases=[
 {name:'Low, direct drift',note:'500 m MSL, constant altitude',params:{speed:10,direction:298,altitude:500,ascent:0}},
 {name:'Climbing balloon',note:'350 → 1,500 m MSL at 2 m/s',params:{}},
 {name:'Fast drift',note:'20 m/s, same climb',params:{speed:20}},
 {name:'Slow drift',note:'5 m/s, same climb',params:{speed:5}},
 {name:'Northwest, low',note:'315° drift, 500 m MSL',params:{direction:315,altitude:500,ascent:0}},
 {name:'Crosswind miss',note:'Northward drift, 500 m MSL',params:{direction:0,altitude:500,ascent:0}},
 {name:'Wind changes aloft',note:'Above 1,000 m, wind drifts east',params:{shear:true,upperDirection:90,upperSpeed:15}},
 {name:'Already aloft',note:'1,500 m MSL at border crossing',params:{altitude:1500,ascent:0}}
];
export const lithuania=REGION.countries.find(c=>c.code==='LTU').polygons;
const launch=REGION.launchPolygons;
const boundarySegments=launch.flatMap(poly=>poly.flatMap(ring=>ring.slice(1).map((q,i)=>[ring[i],q])));
function nearestLaunchBoundary(point){
 let nearest=null,distance=Infinity;
 for(const [a,b] of boundarySegments){
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  const q=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(point[0]-q[0],point[1]-q[1]);
  if(d<distance){distance=d;nearest=q;}
 }
 return {point:nearest,distance};
}
export function validStart(point){return onMap(point)&&(inPolygons(point,launch)||nearestLaunchBoundary(point).distance<.001);}
export function constrainStart([x,y]){
 if(!Number.isFinite(x)||!Number.isFinite(y))return [...DATA.starts[0].xy];
 const p=[Math.max(mapBounds.west,Math.min(mapBounds.east,x)),Math.max(mapBounds.south,Math.min(mapBounds.north,y))];
 return inPolygons(p,launch)?p:nearestLaunchBoundary(p).point;
}
const presetOrigins=DATA.starts.map(s=>constrainStart(s.xy));
// Match the nominal integrator's five-second layer transition without running
// any airspace intersections on the rendering thread.
export function nominalAt(s,minutes){
 const t=minutes*60,reaches=s.altitude>=1000||(s.ascent>0&&s.ceiling>=1000);
 const cross=s.altitude>=1000?0:Math.ceil((1000-s.altitude)/s.ascent/5)*5;
 const lower=s.shear&&reaches?Math.min(t,cross):t,upper=t-lower,[x,y]=startPoint(s);
 const a=s.direction*Math.PI/180,b=s.upperDirection*Math.PI/180;
 return {x:x+(lower*s.speed*Math.sin(a)+upper*s.upperSpeed*Math.sin(b))/1000,y:y+(lower*s.speed*Math.cos(a)+upper*s.upperSpeed*Math.cos(b))/1000,z:s.altitude+Math.max(0,Math.min(s.ceiling-s.altitude,s.ascent*t))};
}
export function simulate(input={},horizon=180,dt=5){
 const s={...defaults,...input},origin=startPoint(s);let [x,y]=origin;let entry=null,ctr=null,near=null,border=null;const points=[];
 for(let sec=0;sec<=horizon*60;sec+=dt){
  const z=s.altitude+Math.max(0,Math.min(s.ceiling-s.altitude,s.ascent*sec));const p=[x,y];
  const at=zoneAt(p,z);if(entry===null&&at)entry={time:sec/60,zone:at};
  if(ctr===null&&z<914.4&&inside(p,DATA.zones.ctr))ctr=sec/60;
  if(near===null&&Math.hypot(x,y)<=10)near=sec/60;
  if(border===null&&inPolygons(p,lithuania))border=sec/60;
  points.push({x,y,z,t:sec/60,zone:at});
  const high=s.shear&&z>=1000;const v=(high?s.upperSpeed:s.speed)/1000;const a=(high?s.upperDirection:s.direction)*Math.PI/180;
  x+=dt*v*Math.sin(a);y+=dt*v*Math.cos(a);
 }
 const closest=points.reduce((a,b)=>Math.hypot(a.x,a.y)<Math.hypot(b.x,b.y)?a:b);
 return {entry,ctr,near,border,points,closest,startDistance:Math.hypot(...origin)};
}
export function sensitivity(s){return [-10,0,10].flatMap(d=>[.8,1,1.2].map(f=>simulate({...s,direction:(s.direction+d+360)%360,speed:s.speed*f,upperDirection:(s.upperDirection+d+360)%360,upperSpeed:s.upperSpeed*f})));}
export function timeText(t){return t==null?'No entry ≤180 min':t<.2?'At start':`${Math.round(t)} min`;}
