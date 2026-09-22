import {DATA} from './data.js';
export const defaults={start:0,origin:null,speed:10,direction:300,altitude:350,ascent:2,ceiling:1500,shear:false,upperSpeed:15,upperDirection:315,delay:5};
export const mapBounds={west:-40,east:65,south:-55,north:48};
export function startPoint(s){return s.origin??DATA.starts[s.start].xy;}
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
export function inside(p,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
export const lithuania=[...DATA.border,[-500,-200],[-500,200]];
const lt=lithuania;
function nearestBorder(point){
 let nearest=null,distance=Infinity;
 for(let i=1;i<DATA.border.length;i++){
  const a=DATA.border[i-1],b=DATA.border[i],dx=b[0]-a[0],dy=b[1]-a[1];
  // Clip each segment to the visible map before projecting onto it.
  let lo=0,hi=1;
  for(const [v,d,min,max] of [[a[0],dx,mapBounds.west,mapBounds.east],[a[1],dy,mapBounds.south,mapBounds.north]]){
   if(d===0){if(v<min||v>max)hi=-1;continue;}
   const t1=(min-v)/d,t2=(max-v)/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
  }
  if(lo>hi)continue;
  const t=Math.max(lo,Math.min(hi,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  const q=[a[0]+t*dx,a[1]+t*dy],dist=Math.hypot(point[0]-q[0],point[1]-q[1]);
  if(dist<distance){distance=dist;nearest=q;}
 }
 return {point:nearest,distance};
}
export function validStart(point){return onMap(point)&&(!inside(point,lt)||nearestBorder(point).distance<1e-7);}
export function constrainStart([x,y]){
 const point=[Math.max(mapBounds.west,Math.min(mapBounds.east,x)),Math.max(mapBounds.south,Math.min(mapBounds.north,y))];
 return inside(point,lt)?nearestBorder(point).point:point;
}
export function altitudeBands(z){
 const Z=DATA.zones,bands=[[Z.ctr,0,914.4],[Z.tma1,426.72,609.6],[Z.tma2,426.72,609.6],[Z.tma3,609.6,914.4],[Z.tma4,914.4,1981.2],[Z.tma5,1981.2,2895.6],[lt,2895.6,Infinity]];
 return {red:bands.filter(([,floor,top])=>z>=floor&&z<top).map(([p])=>p),yellow:bands.filter(([,floor])=>z<floor&&floor-z<=150).map(([p])=>p)};
}
// Match the nominal integrator's five-second layer transition without running
// any airspace intersections on the rendering thread.
export function nominalAt(s,minutes){
 const t=minutes*60,reaches=s.altitude>=1000||(s.ascent>0&&s.ceiling>=1000);
 const cross=s.altitude>=1000?0:Math.ceil((1000-s.altitude)/s.ascent/5)*5;
 const lower=s.shear&&reaches?Math.min(t,cross):t,upper=t-lower,[x,y]=startPoint(s);
 const a=s.direction*Math.PI/180,b=s.upperDirection*Math.PI/180;
 return {x:x+(lower*s.speed*Math.sin(a)+upper*s.upperSpeed*Math.sin(b))/1000,y:y+(lower*s.speed*Math.cos(a)+upper*s.upperSpeed*Math.cos(b))/1000,z:s.altitude+Math.max(0,Math.min(s.ceiling-s.altitude,s.ascent*t))};
}
export function zoneAt(p,z){
 const Z=DATA.zones;if(z<914.4&&inside(p,Z.ctr))return 'CTR';
 if(z>=426.72&&z<609.6&&(inside(p,Z.tma1)||inside(p,Z.tma2)))return 'TMA 1/2';
 if(z>=609.6&&z<914.4&&inside(p,Z.tma3)&&!inside(p,Z.ctr))return 'TMA 3';
 if(z>=914.4&&z<1981.2&&inside(p,Z.tma4))return 'TMA 4';
 if(z>=1981.2&&z<2895.6&&inside(p,Z.tma5))return 'TMA 5';
 if(z>=2895.6&&inside(p,lt))return 'CTA / TMA 6';return null;
}
export function simulate(input={},horizon=180,dt=5){
 const s={...defaults,...input},origin=startPoint(s);let [x,y]=origin;let entry=null,ctr=null,near=null,border=null;const points=[];
 for(let sec=0;sec<=horizon*60;sec+=dt){
  const z=s.altitude+Math.max(0,Math.min(s.ceiling-s.altitude,s.ascent*sec));const p=[x,y];
  const at=zoneAt(p,z);if(entry===null&&at)entry={time:sec/60,zone:at};
  if(ctr===null&&z<914.4&&inside(p,DATA.zones.ctr))ctr=sec/60;
  if(near===null&&Math.hypot(x,y)<=10)near=sec/60;
  if(border===null&&inside(p,lt))border=sec/60;
  points.push({x,y,z,t:sec/60,zone:at});
  const high=s.shear&&z>=1000;const v=(high?s.upperSpeed:s.speed)/1000;const a=(high?s.upperDirection:s.direction)*Math.PI/180;
  x+=dt*v*Math.sin(a);y+=dt*v*Math.cos(a);
 }
 const closest=points.reduce((a,b)=>Math.hypot(a.x,a.y)<Math.hypot(b.x,b.y)?a:b);
 return {entry,ctr,near,border,points,closest,startDistance:Math.hypot(...origin)};
}
export function sensitivity(s){return [-10,0,10].flatMap(d=>[.8,1,1.2].map(f=>simulate({...s,direction:(s.direction+d+360)%360,speed:s.speed*f,upperDirection:(s.upperDirection+d+360)%360,upperSpeed:s.upperSpeed*f})));}
export function timeText(t){return t==null?'No entry ≤180 min':t<.2?'At start':`${Math.round(t)} min`;}
