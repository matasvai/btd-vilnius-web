import {REGION} from './region.js';
// View changes only update SVG coordinates; they do not rerun the simulation.
export function createMapNavigation({svg,marker,zoomIn,zoomOut,reset,vilnius,zoomLabel,onStartMove,constrainStart,onView=()=>{},onInspect=()=>{}}){
 const b=REGION.bounds,region={x:b.west,y:-b.north,width:b.east-b.west,height:b.north-b.south};
 let view={...region},fitWidth=region.width,aspect=region.width/region.height,frame=null,origin=[0,0],gesture=null;
 const pointers=new Map();
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const rect=()=>svg.getBoundingClientRect();
 const position=(p,v=view)=>{const box=rect();return [v.x+(p.x-box.left)*v.width/box.width,v.y+(p.y-box.top)*v.height/box.height];};
 function drawMarker(){
  const unit=view.width/Math.max(1,rect().width);
  marker.setAttribute('transform',`translate(${origin[0]} ${-origin[1]}) scale(${unit})`);
 }
 function render(){
  frame=null;svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);drawMarker();
  const unit=view.width/Math.max(1,rect().width),font=rect().width<500&&view.width>300?10:13;svg.style.setProperty('--map-label-size',`${font*unit}px`);svg.style.setProperty('--map-label-outline',`${3*unit}px`);
  onView({...view});
  const zoom=fitWidth/view.width;zoomLabel.textContent=`${zoom.toFixed(1)}×`;
  zoomIn.disabled=zoom>=64-1e-6;zoomOut.disabled=zoom<=1+1e-6;
 }
 function setView(next){
  const width=clamp(next.width,fitWidth/64,fitWidth),height=width/aspect;
  const cx=clamp(next.x+next.width/2,region.x,region.x+region.width);
  const cy=clamp(next.y+next.height/2,region.y,region.y+region.height);
  view={x:cx-width/2,y:cy-height/2,width,height};
  if(frame===null)frame=requestAnimationFrame(render);
 }
 function fit(){setView({x:region.x+region.width/2-fitWidth/2,y:region.y+region.height/2-fitWidth/aspect/2,width:fitWidth,height:fitWidth/aspect});}
 function resize(){
  const box=rect();if(!box.width||!box.height)return;
  const zoom=fitWidth/view.width,cx=view.x+view.width/2,cy=view.y+view.height/2;
  aspect=box.width/box.height;fitWidth=Math.max(region.width,region.height*aspect);
  const width=fitWidth/zoom;setView({x:cx-width/2,y:cy-width/aspect/2,width,height:width/aspect});
 }
 function zoom(factor,point){
  const box=rect(),p=point??{x:box.left+box.width/2,y:box.top+box.height/2};
  const anchor=position(p),width=clamp(view.width/factor,fitWidth/64,fitWidth),ratio=width/view.width;
  setView({x:anchor[0]-(anchor[0]-view.x)*ratio,y:anchor[1]-(anchor[1]-view.y)*ratio,width,height:width/aspect});
 }
 const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function panGesture(p){gesture={kind:'pan',point:p,view:{...view}};}
 function pinchGesture(){
  const [a,b]=[...pointers.values()],point=midpoint(a,b);
  gesture={kind:'pinch',anchor:position(point),distance:Math.max(1,distance(a,b)),view:{...view}};
 }
 svg.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const p={x:e.clientX,y:e.clientY};pointers.set(e.pointerId,p);svg.setPointerCapture(e.pointerId);e.preventDefault();
  if(pointers.size===1){
   if(e.target.closest?.('#start-marker')){const q=position(p);gesture={kind:'start',offset:[origin[0]-q[0],-origin[1]-q[1]]};marker.focus({preventScroll:true});}
   else{panGesture(p);svg.focus({preventScroll:true});}
  }else pinchGesture();
  svg.classList.add('is-dragging');
 });
 svg.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)||!gesture)return;
  const p={x:e.clientX,y:e.clientY};pointers.set(e.pointerId,p);
  if(gesture.kind==='start'){
   const q=position(p);onStartMove(constrainStart([q[0]+gesture.offset[0],-(q[1]+gesture.offset[1])]));
  }else if(gesture.kind==='pan'){
   const box=rect(),base=gesture.view;
   setView({...base,x:base.x-(p.x-gesture.point.x)*base.width/box.width,y:base.y-(p.y-gesture.point.y)*base.height/box.height});
  }else{
   const [a,b]=[...pointers.values()],mid=midpoint(a,b),box=rect();
   const width=clamp(gesture.view.width*gesture.distance/Math.max(1,distance(a,b)),fitWidth/64,fitWidth),height=width/aspect;
   setView({x:gesture.anchor[0]-(mid.x-box.left)*width/box.width,y:gesture.anchor[1]-(mid.y-box.top)*height/box.height,width,height});
  }
 });
 function finish(e){
  if(e.type==='pointerup'&&gesture?.kind==='pan'&&pointers.size===1){const p=pointers.get(e.pointerId);if(p&&distance(p,gesture.point)<4){const q=position(p);onInspect([q[0],-q[1]]);}}
  if(!pointers.delete(e.pointerId))return;
  if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
  if(pointers.size>=2)pinchGesture();else if(pointers.size===1)panGesture([...pointers.values()][0]);
  else{gesture=null;svg.classList.remove('is-dragging');}
 }
 for(const event of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(event,finish);
 svg.addEventListener('wheel',e=>{
  e.preventDefault();if(pointers.size)return;
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?rect().height:1);
  zoom(Math.exp(-clamp(delta,-100,100)*.004),{x:e.clientX,y:e.clientY});
 },{passive:false});
 svg.addEventListener('keydown',e=>{
  const offset={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(offset){e.preventDefault();
   if(e.target.closest?.('#start-marker')){const step=e.shiftKey?5:1;onStartMove(constrainStart([origin[0]+offset[0]*step,origin[1]-offset[1]*step]));}
   else{const step=view.width*(e.shiftKey?.25:.1);setView({...view,x:view.x+offset[0]*step,y:view.y+offset[1]*step});}
  }else if(['+','=','-','Home'].includes(e.key)){e.preventDefault();e.key==='Home'?fit():zoom(e.key==='-'?1/1.5:1.5);}
 });
 zoomIn.addEventListener('click',()=>zoom(1.5));zoomOut.addEventListener('click',()=>zoom(1/1.5));reset.addEventListener('click',fit);
 vilnius?.addEventListener('click',()=>{const width=Math.max(105,103*aspect);setView({x:12.5-width/2,y:3.5-width/aspect/2,width,height:width/aspect});});
 new ResizeObserver(resize).observe(svg);resize();fit();
 return {setStart(point){origin=[...point];drawMarker();}};
}
