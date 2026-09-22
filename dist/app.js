import {DATA} from './data.js';
import {REGION} from './region.js';
import {layerOf,airspacesAt,inHeight} from './airspace.js';
import {defaults,cases,timeText,startPoint,toCoordinates,fromCoordinates,onMap,mapBounds,compassBearing,validStart,constrainStart,nominalAt,altitudeBands} from './model.js';
import {cloudAt} from './cloud.js';
import {POPULATION} from './population.js';
import {createMapNavigation} from './map-navigation.js';
let mapNavigation;
let errors={speed:20,direction:10,position:.5};
let state={...defaults},result,playing=false,timer,frame=null,revision=0,busy=false,pending=null,lastAltitude;
const worker=new Worker(new URL('./simulation-worker.js',import.meta.url),{type:'module'});
function dispatch(){if(busy||!pending)return;busy=true;worker.postMessage(pending);pending=null;}
worker.onmessage=({data})=>{
 busy=false;
 if(data.version===revision){if(data.error){$('entry-note').textContent='Calculation unavailable';}else showResults(data);}
 dispatch();
};
worker.onerror=()=>{busy=false;$('entry-note').textContent='Calculation unavailable; reload to retry.';};
function requestUpdate(){revision++;if(frame===null)frame=requestAnimationFrame(()=>{frame=null;update(false);});}

const $=id=>document.getElementById(id),path=p=>'M'+p.map(q=>`${q[0]},${-q[1]}`).join('L')+'Z';
$('start').innerHTML=DATA.starts.map((s,i)=>`<option value="${i}">${s.name}</option>`).join('')+'<option value="custom">Custom map position</option>';
const control=(id,label,min,max,step)=>`<label>${label}<output id="${id}-out"></output><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${state[id]}"></label>`;
$('more-controls').innerHTML=control('altitude','Start altitude · m MSL',350,2500,50)+control('ascent','Climb rate · m/s',0,5,.5)+control('ceiling','Level-off altitude · m MSL',500,3000,100)+`<p class="hint">MSL = above mean sea level. Initial height and level-off are assumptions; terrain, descent and balloon lifetime are not modeled.</p><details><summary>Wind aloft & detection delay</summary><label class="check"><input type="checkbox" id="shear">Change wind above 1,000 m</label><div id="upper-controls">${control('upperSpeed','Upper wind speed · m/s',0,30,1)}${control('upperDirection','Upper drift toward',0,359,1)}</div>${control('delay','Delay before detection · min',0,30,1)}</details>`;
$('details').innerHTML=`<div class="two"><section class="info"><h2>Where could the balloon be?</h2><p id="cloud-summary" class="small-stat"></p><p id="cloud-status"></p><div class="cloud-controls"><label>Wind speed uncertainty · 1σ<output id="speed-error-out"></output><input id="speed-error" type="range" min="0" max="50" step="5" value="20"></label><label>Direction uncertainty · 1σ<output id="direction-error-out"></output><input id="direction-error" type="range" min="0" max="45" step="1" value="10"></label><label>Start position uncertainty · 1σ<output id="position-error-out"></output><input id="position-error" type="range" min="0" max="3" step=".1" value=".5"></label></div><p class="tooltip-text">1σ means one standard deviation. 512 reproducible samples use independent Gaussian errors in initial east/north position, wind speed and direction. Wind errors are shared across both layers and persist throughout a trajectory; negative sampled speeds are clipped to zero. Height follows the selected climb exactly. Entry timers follow the nominal path. The 50% and 90% ellipses enclose those fractions of samples at the selected time. Shading is illustrative; contour percentages come from sample counts. These are assumed model probabilities, not calibrated forecast confidence or collision risk.</p><p id="sensitivity"></p><p class="tooltip-text">Nine fixed variations: speed ±20% and direction ±10°, applied to both wind layers. This is a sensitivity range, not a probability or confidence interval. These nine wind variations are separate from the 512-sample probability cloud.</p></section><section class="info"><h2>Time remaining after detection</h2><div class="small-stat" id="remaining"></div><p id="delay-note"></p><p class="tooltip-text">This subtracts the assumed detection delay only. Confirmation, communication and any response take additional time. It is not an interception feasibility estimate.</p></section></div><h2 class="section-label">Compare different cases</h2><p class="hint case-hint">Each case uses your selected starting position. Report examples use the original nearest-border start.</p><div class="case-grid">${cases.map((c,i)=>`<button class="case" data-case="${i}"><b>${c.name}</b><small>${c.note}</small><small id="case-result-${i}"></small></button>`).join('')}</div><section class="info"><h2>Reading the map</h2><div class="two"><div><p><b>National airspace:</b> begins when the selected trajectory crosses the border. All timers begin at the selected starting position. The yellow dashed box is a study extent, not an airspace boundary. Border presets start at crossing; custom starts are restricted to the Belarus side or the border itself.</p><p><b>Controlled airspace:</b> depends on both position and height. The entry timer and cloud colors use the controlled zones loaded for Lithuania, Latvia, Poland and the Swedish offshore section. CTRs begin at the surface; TMA and upper control areas have different floors. Published ATS operation is assumed. Switching map layers off does not remove zones from the calculation. Outlines show horizontal footprints, not active-at-every-height zones. Restricted, danger and military activity areas are a separate context layer; their activation is not modeled in the controlled-entry timer.</p></div><div><p class="warning"><b>No single “airport disruption” boundary.</b> The dashed 10 km circle is only a distance reference. It is not a legal boundary, separation standard, protected approach area or airport-closure trigger. Aircraft can encounter a balloon outside it.</p><p>Uniform wind within each layer, passive drift, no terrain or descent, and a three-hour horizon. Start areas are illustrative map locations, not known launch sites. A miss in this model does not establish safety.</p></div></div><p id="geometry-note"></p><div class="source-links"><a href="https://www.ans.lt/a1/aip/03_11Jun2026/2026-06-11-000000/html/eAIP/EY-AD-2-EYVI-en-US.html" target="_blank" rel="noreferrer">Oro navigacija · airport / CTR</a><a href="https://www.ans.lt/a1/aip/03_11Jun2026/2026-06-11-000000/html/eAIP/EY-ENR-2.1-en-US.html" target="_blank" rel="noreferrer">Oro navigacija · TMA</a><a href="https://www.geoboundaries.org/api/current/gbOpen/LTU/ADM0/" target="_blank" rel="noreferrer">Boundary metadata</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a><a href="region-data.json" download>Regional boundaries, sources + licenses</a><a href="https://ais.lgs.lv/" target="_blank" rel="noreferrer">Latvian AIS</a><a href="https://ais.pansa.pl/publikacje/aip-polska/" target="_blank" rel="noreferrer">Polish AIS</a><a href="https://www.aro.lfv.se/content/eaip/default_offline.html" target="_blank" rel="noreferrer">Swedish AIS</a><a href="report.pdf">Vilnius case study [PDF]</a><a href="report-source.zip" download>LaTeX + PDF figures</a></div></section>`;
document.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>{stop();state={...defaults,...cases[+b.dataset.case].params,start:state.start,origin:state.origin};syncControls();update();document.querySelectorAll('[data-case]').forEach(x=>x.classList.toggle('active',x===b));});
for(const id of ['altitude','ascent','ceiling','upperSpeed','upperDirection','delay','shear'])$(id).addEventListener('input',e=>{state[id]=id==='shear'?e.target.checked:+e.target.value;clearCases();requestUpdate();});
function syncControls(){for(const key of Object.keys(defaults)){if($(key))key==='shear'?$(key).checked=state[key]:$(key).value=state[key];}}
function clearCases(){document.querySelectorAll('[data-case]').forEach(x=>x.classList.remove('active'));}
function stop(){playing=false;clearInterval(timer);$('play').textContent='▶';}
function initMap(){
 const b=REGION.bounds;let svg='';
 const polygons=ps=>ps.map(poly=>poly.map(path).join(' ')).join(' ');
 const vector='vector-effect="non-scaling-stroke"';
 for(let x=Math.ceil(b.west/50)*50;x<b.east;x+=50)svg+=`<path d="M${x},${-b.north}V${-b.south}" stroke="#234d3c" stroke-width=".6" ${vector}/>`;
 for(let y=Math.ceil(b.south/50)*50;y<b.north;y+=50)svg+=`<path d="M${b.west},${-y}H${b.east}" stroke="#234d3c" stroke-width=".6" ${vector}/>`;
 for(const c of REGION.countries)svg+=`<path d="${polygons(c.polygons)}" fill="${c.code==='LTU'?'#123b28':['LVA','POL'].includes(c.code)?'#0d3126':'#172c26'}"/>`;
 svg+=`<g id="population-layer" opacity=".65" pointer-events="none"><image href="${POPULATION.image.href}" x="${POPULATION.image.x}" y="${POPULATION.image.y}" width="${POPULATION.image.width}" height="${POPULATION.image.height}" preserveAspectRatio="none" style="image-rendering:pixelated"/></g>`;
 for(const group of ['upper','special','local','controlled']){
  svg+=`<g id="airspace-${group}" ${['upper','special'].includes(group)?'display="none"':''}>`;
  for(const f of REGION.airspaces.filter(f=>layerOf(f)===group)){
   const color={controlled:'#9ddcb1',local:'#f2d27b',special:'#df8780',upper:'#c6bea0'}[group],ctr=['CTR','MCTR'].includes(f.kind);
   svg+=`<path d="${polygons(f.polygons)}" fill="${color}" fill-opacity="${ctr?.13:group==='special'?.025:.018}" stroke="${color}" stroke-opacity="${group==='special'?.55:.8}" stroke-width="${ctr?1.6:.85}" ${group==='upper'?'stroke-dasharray="6 4"':group==='special'?'stroke-dasharray="3 3"':''} ${vector}/>`;
  }
  svg+='</g>';
 }
 for(const c of REGION.countries)svg+=`<path d="${polygons(c.polygons)}" fill="none" stroke="${c.code==='LTU'?'#eee5bb':'#99ada0'}" stroke-width="${c.code==='LTU'?1.5:.8}" ${vector}/>`;
 svg+=`<rect x="${b.west}" y="${-b.north}" width="${b.east-b.west}" height="${b.north-b.south}" fill="none" stroke="#fdb913" stroke-dasharray="7 5" stroke-width="1.2" ${vector}/><path id="selected-airspace" fill="#fff4b5" fill-opacity=".05" stroke="#fff4b5" stroke-width="2.5" ${vector}/><circle cx="0" cy="0" r="10" stroke="#e9cc74" stroke-dasharray="4 4" stroke-width="1" fill="none" ${vector}/><polyline id="nominal-path" stroke="#fdb913" stroke-opacity=".8" stroke-width="1.5" fill="none" ${vector}/>`;

 svg+='<defs><clipPath id="red-height" clipPathUnits="userSpaceOnUse"><path id="red-zones" clip-rule="nonzero"/></clipPath><clipPath id="yellow-height" clipPathUnits="userSpaceOnUse"><path id="yellow-zones" clip-rule="nonzero"/></clipPath>';
 for(const [name,color] of [['green','#64df94'],['yellow','#fdb913'],['red','#ff555d']])svg+=`<radialGradient id="density-${name}"><stop offset="0" stop-color="${color}" stop-opacity=".78"/><stop offset=".5" stop-color="${color}" stop-opacity=".5"/><stop offset="1" stop-color="${color}" stop-opacity=".05"/></radialGradient>`;
 svg+='<mask id="outside-bands" maskUnits="userSpaceOnUse" x="-40" y="-48" width="105" height="103"><rect id="outside-bands-background" x="-40" y="-48" width="105" height="103" fill="white"/><use href="#red-zones" fill="black"/><use href="#yellow-zones" fill="black"/></mask><mask id="below-red" maskUnits="userSpaceOnUse" x="-40" y="-48" width="105" height="103"><rect id="below-red-background" x="-40" y="-48" width="105" height="103" fill="white"/><use href="#red-zones" fill="black"/></mask></defs>';
 for(const name of ['green','yellow','red'])svg+=`<g ${name==='green'?'mask="url(#outside-bands)"':`clip-path="url(#${name}-height)" ${name==='yellow'?'mask="url(#below-red)"':''}`}><ellipse id="cloud-${name}" fill="url(#density-${name})"/></g>`;
 svg+='<g id="cloud-contours"><ellipse id="cloud-90" fill="none" stroke="#fff6db" stroke-width="1.2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/><ellipse id="cloud-50" fill="none" stroke="#fff6db" stroke-width="1.2" vector-effect="non-scaling-stroke"/></g>';
 const labels=[['LITHUANIA',55.35,23.75,'country'],['LATVIA',56.65,25.0,'country'],['POLAND',53.35,22.0,'country'],['BELARUS',54.1,27.25,'country'],['KALININGRAD',54.75,21.5,'country'],['BALTIC SEA',56.0,19.85,'country'],['Vilnius',54.69,25.28],['Kaunas',54.90,23.90],['Klaipėda',55.71,21.14],['Šiauliai',55.93,23.32],['Panevėžys',55.73,24.36],['Palanga',55.92,21.06],['Riga',56.95,24.10],['Liepāja',56.51,21.01],['Daugavpils',55.87,26.52],['Suwałki',54.11,22.93],['Białystok',53.13,23.16],['Olsztyn',53.78,20.48]];
 svg+='<g id="place-labels" pointer-events="none">';
 for(const [name,lat,lon,type] of labels){const [x,y]=fromCoordinates(lat,lon);svg+=`${type?'':`<path d="M${x},${-y}h.001" stroke="#dbe7d7" stroke-width="4" stroke-linecap="round" ${vector}/>`}<text class="${type??'city-label'}" x="${x}" y="${-y}" dx="${type?'0':'.5em'}" text-anchor="${type?'middle':'start'}" dy="${type?'0':'-.4em'}">${name}</text>`;}
 svg+='</g><g id="local-place-labels" pointer-events="none">';
 DATA.places.filter(q=>q.name!=='Vilnius').forEach(q=>svg+=`<text x="${q.xy[0]}" y="${-q.xy[1]}" dy="-.4em">${q.name}</text>`);
 svg+='<path d="M-1,0H1M0,-1V1" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/><text x="1.8" y="1.2">VNO airport</text></g>';
 svg+='<g id="start-marker" tabindex="0" role="button" aria-label="Launch point. Drag to move within Belarus, or use arrow keys for 1 km; Shift for 5 km."><title>Drag this marker to move the start</title><rect class="start-hit" x="-22" y="-22" width="44" height="44" fill="transparent"/><rect id="start-pin" x="-7" y="-7" width="14" height="14" fill="#c1272d" stroke="#fff3bd" stroke-width="2"/><text id="start-label" x="12" y="20">Start</text></g>';
 $('map').innerHTML=svg;
}
function attrs(id,values){const element=$(id);for(const [key,value] of Object.entries(values))element.setAttribute(key,value);}
function draw(){
 const elapsed=+$('time').value,p=nominalAt(state,elapsed),cloud=cloudAt(state,elapsed,errors),[cx,cy]=cloud.mean;
 const transform=`translate(${cx},${-cy}) rotate(${-cloud.angle*180/Math.PI})`;
 for(const name of ['green','yellow','red'])attrs('cloud-'+name,{transform,rx:cloud.p99.rx,ry:cloud.p99.ry});
 attrs('cloud-contours',{transform});attrs('cloud-90',cloud.p90);attrs('cloud-50',cloud.p50);
 if(lastAltitude!==p.z){const bands=altitudeBands(p.z);for(const color of ['red','yellow'])attrs(color+'-zones',{d:bands[color].map(poly=>poly.map(path).join(' ')).join(' ')});lastAltitude=p.z;}
 mapNavigation.setStart(startPoint(state));
 $('cloud-summary').textContent=`90% cloud: ${(2*cloud.p90.rx).toFixed(1)} × ${(2*cloud.p90.ry).toFixed(1)} km`;
 $('cloud-status').textContent=`At +${elapsed} min: about ${Math.round(cloud.controlledFraction*100)}% of samples are currently inside modeled controlled airspace. The 90% ellipse covers ${cloud.area90.toFixed(1)} km².`;
 $('cloud-altitude').textContent=`${Math.round(p.z).toLocaleString()} m MSL`;
 $('map-time').textContent=`FORECAST +${elapsed} MIN · ${Math.round(p.z)} M MSL${!onMap([p.x,p.y])?' · OUTSIDE STUDY AREA':''}`;$('elapsed').textContent=elapsed+' min';
}
function update(newRevision=true){
 if(frame!==null){cancelAnimationFrame(frame);frame=null;}if(newRevision)revision++;
 $('speed-out').textContent=`${state.speed} m/s · ${Math.round(state.speed*3.6)} km/h`;
 $('direction-out').textContent=state.direction+'°';$('direction').value=state.direction;
 if(document.activeElement!==$('direction-number'))$('direction-number').value=state.direction;
 $('wind-from').textContent='Wind from '+((state.direction+180)%360)+'°';
 attrs('compass-arrow',{transform:`rotate(${state.direction} 60 60)`});attrs('wind-compass',{'aria-valuenow':state.direction,'aria-valuetext':state.direction+' degrees toward'});
 const origin=startPoint(state),coord=toCoordinates(origin);$('start-coordinates').textContent=`${coord.latitude.toFixed(5)}° N / ${coord.longitude.toFixed(5)}° E`;
 if(document.activeElement!==$('latitude'))$('latitude').value=coord.latitude.toFixed(5);if(document.activeElement!==$('longitude'))$('longitude').value=coord.longitude.toFixed(5);
 $('start').value=state.origin?'custom':state.start;
 for(const key of ['altitude','ascent','ceiling','upperSpeed','upperDirection','delay'])$(key+'-out').textContent=state[key]+(key==='upperDirection'?'°':'');
 $('upper-controls').style.opacity=state.shear?'1':'.45';for(const key of ['upperSpeed','upperDirection'])$(key).disabled=!state.shear;
 const cross=state.shear&&state.ascent>0&&state.altitude<1000&&state.ceiling>=1000?Math.ceil((1000-state.altitude)/state.ascent/5)*5/60:0;
 attrs('nominal-path',{points:[0,Math.min(180,cross),180].map(t=>{const p=nominalAt(state,t);return `${p.x},${-p.y}`;}).join(' ')});
 draw();
 $('entry-note').textContent='Updating entry times…';document.querySelector('.results').setAttribute('aria-busy','true');
 pending={version:revision,state:{...state,origin:state.origin?[...state.origin]:null}};dispatch();
}
function showResults({result:r,ensemble,caseResults}){
 result=r;document.querySelector('.results').setAttribute('aria-busy','false');
 $('entry').textContent=timeText(result.entry?.time);$('entry-note').textContent=result.entry?result.entry.zone+' · first modeled 3D entry':'No modeled entry in three hours';$('ctr').textContent=timeText(result.ctr);$('near').textContent=timeText(result.near);
 const hits=ensemble.filter(Boolean),n=hits.length,times=hits.map(r=>r.time);
 $('sensitivity').textContent=n?`${Math.min(...times).toFixed(1)===Math.max(...times).toFixed(1)?Math.min(...times).toFixed(1):Math.min(...times).toFixed(1)+'–'+Math.max(...times).toFixed(1)} min to first controlled-airspace entry across the ${n} intersecting variations. ${9-n} of the nine do not enter within 180 minutes.`:'None of the nine variations enters the modeled controlled airspace within 180 minutes.';
 $('remaining').textContent=result.entry?(result.entry.time<=state.delay?'Already entered by detection':Math.round(result.entry.time-state.delay)+' min remaining'):'No entry within model horizon';$('delay-note').textContent=`Assumed detection delay: ${state.delay} min after the selected start.`;
 $('geometry-note').textContent=`Start: about ${result.startDistance.toFixed(1)} km from VNO. Coverage: Lithuania and the parts of Latvia and Poland inside the study box, plus the Swedish offshore section. Country boundaries are generalized; the 100 km margin uses the study projection. LT airspace: 11 June 2026 plus SUP 14/26; LV / PL: 3 September 2026; SE: 7 August 2026. Live NOTAMs and activation are not loaded. Flight levels use a standard-pressure height approximation; terrain and AGL conversions are not modeled.`;

 caseResults.forEach((r,i)=>{$('case-result-'+i).textContent=`Airspace: ${timeText(r.entry?.time)} · 10 km: ${timeText(r.near)}`;});
}
$('start').addEventListener('change',e=>{if(e.target.value==='custom'){state.origin=[...startPoint(state)];state.start='custom';}else{state.start=+e.target.value;state.origin=null;}stop();clearCases();$('coordinate-error').textContent='';update();});
for(const id of ['speed','direction'])$(id).addEventListener('input',e=>{state[id]=+e.target.value;clearCases();requestUpdate();});
function setDirection(value){if(!Number.isFinite(value))return;state.direction=(Math.round(value)%360+360)%360;clearCases();requestUpdate();}
$('direction-number').addEventListener('input',e=>{if(e.target.value!==''&&e.target.validity.valid)setDirection(+e.target.value);});
$('direction-number').addEventListener('change',()=>{$('direction-number').value=state.direction;});
function setOrigin(point){if(!validStart(point))return false;stop();state.origin=point;state.start='custom';$('coordinate-error').textContent='';clearCases();requestUpdate();return true;}
function svgPosition(svg,event){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());return [p.x,p.y];}
function dragSurface(svg,action){let pointer=null;svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;if(action(e)===false)return;pointer=e.pointerId;svg.setPointerCapture(pointer);e.preventDefault();});svg.addEventListener('pointermove',e=>{if(e.pointerId===pointer)action(e);});const finish=e=>{if(pointer===e.pointerId){pointer=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);}};svg.addEventListener('pointerup',finish);svg.addEventListener('pointercancel',finish);}
dragSurface($('wind-compass'),e=>{const [x,y]=svgPosition($('wind-compass'),e);if(Math.hypot(x-60,y-60)<5)return false;setDirection(compassBearing(x-60,y-60));});
$('wind-compass').addEventListener('keydown',e=>{const step=e.shiftKey?10:1;if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)){e.preventDefault();setDirection(state.direction+(['ArrowLeft','ArrowDown'].includes(e.key)?-step:step));}});
$('coordinates-form').addEventListener('submit',e=>{e.preventDefault();const latitude=+$('latitude').value,longitude=+$('longitude').value;if(!setOrigin(fromCoordinates(latitude,longitude)))$('coordinate-error').textContent='Choose a position on the Belarus side of the displayed border.';});
for(const [id,key,unit] of [['speed-error','speed','%'],['direction-error','direction','°'],['position-error','position',' km']]){$(id+'-out').textContent=errors[key]+unit;$(id).addEventListener('input',e=>{errors[key]=+e.target.value;$(id+'-out').textContent=errors[key]+unit;draw();});}

$('time').addEventListener('input',draw);$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Ⅱ':'▶';clearInterval(timer);if(playing)timer=setInterval(()=>{let t=+$('time').value;if(t>=180){playing=false;clearInterval(timer);$('play').textContent='▶';return;}$('time').value=t+1;draw();},160);};
$('reset').onclick=()=>{stop();state={...defaults};errors={speed:20,direction:10,position:.5};for(const [id,key,unit] of [['speed-error','speed','%'],['direction-error','direction','°'],['position-error','position',' km']]){$(id).value=errors[key];$(id+'-out').textContent=errors[key]+unit;}$('coordinate-error').textContent='';syncControls();$('time').value=30;document.querySelectorAll('[data-case]').forEach(x=>x.classList.remove('active'));update();};
const context=document.modelContext;
if(context?.registerTool){
 const schema={speed:{type:'number',minimum:0,maximum:25,multipleOf:1},direction:{type:'number',minimum:0,maximum:359,multipleOf:1},altitude:{type:'number',minimum:350,maximum:2500,multipleOf:50},ascent:{type:'number',minimum:0,maximum:5,multipleOf:.5},latitude:{type:'number'},longitude:{type:'number'},elapsedMinutes:{type:'number',minimum:0,maximum:180,multipleOf:1}};
 try{Promise.resolve(context.registerTool({name:'configure_drift_scenario',description:'Change the visible wind, starting coordinates or forecast time. Supply latitude and longitude together; coordinates must be on the Belarus side of the regional map, or on the border.',inputSchema:{type:'object',properties:schema,additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected an object');
  for(const [key,value]of Object.entries(input)){const rule=schema[key];if(!rule||typeof value!=='number'||!Number.isFinite(value)||(rule.minimum!==undefined&&value<rule.minimum)||(rule.maximum!==undefined&&value>rule.maximum)||(rule.multipleOf&&value%rule.multipleOf!==0))throw Error('Invalid scenario value: '+key);}
  if(('latitude'in input)!==('longitude'in input))throw Error('Supply latitude and longitude together');
  const point='latitude'in input?fromCoordinates(input.latitude,input.longitude):null;if(point&&!validStart(point))throw Error('Choose coordinates on the Belarus side of the displayed map');
  const {latitude,longitude,elapsedMinutes,...settings}=input;state={...state,...settings,...(point?{origin:point,start:'custom'}:{})};if(elapsedMinutes!==undefined)$('time').value=elapsedMinutes;stop();clearCases();syncControls();update();
  const requestedRevision=revision;await new Promise((resolve,reject)=>{const wait=()=>{if(revision!==requestedRevision)return reject(Error('Scenario changed during calculation'));if(!busy&&!pending)return resolve();setTimeout(wait,10);};wait();});
  const cloud=cloudAt(state,+$('time').value,errors);return {start:toCoordinates(startPoint(state)),direction:state.direction,controlledEntry:result.entry,ctrMinutes:result.ctr,within10kmMinutes:result.near,forecastMinutes:+$('time').value,cloud90AreaKm2:cloud.area90};
 }})).catch(()=>{});}catch{}
}
function inspectAirspace(point){
 const hits=airspacesAt(point).sort((a,b)=>Number(b.controlled)-Number(a.controlled)||a.lower.metres-b.lower.metres),c=toCoordinates(point);
 $('airspace-location').textContent=`${c.latitude.toFixed(3)}° N, ${c.longitude.toFixed(3)}° E · ${hits.length} published areas`;
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const z=nominalAt(state,+$('time').value).z;
 $('airspace-list').innerHTML=hits.length?hits.map(f=>`<li><a href="${escape(f.source)}" target="_blank" rel="noreferrer">${escape(f.name)}</a><span>${f.country} · ${f.kind}${f.airspaceClass?' · Class '+escape(f.airspaceClass):''} · ${escape(f.lower.label)} → ${escape(f.upper.label)}</span><small>${f.controlled?`At inspection height ${Math.round(z).toLocaleString()} m MSL: ${inHeight(f,z)?'within':'outside'} this height band. `:''}${escape(f.activation)}${f.geometryNote?' '+escape(f.geometryNote):''}</small></li>`).join(''):'<li>No published area in the loaded snapshot at this point. This does not establish that the airspace is unrestricted.</li>';
 attrs('selected-airspace',{d:hits[0]?hits[0].polygons.map(poly=>poly.map(path).join(' ')).join(' '):''});
 $('airspace-inspector').open=true;
}
initMap();
for(const group of ['controlled','local','special','upper']){
 $('count-'+group).textContent=REGION.airspaces.filter(f=>layerOf(f)===group).length;
 $('layer-'+group).addEventListener('change',e=>attrs('airspace-'+group,{display:e.target.checked?'inline':'none'}));
}
$('region-count').textContent=`${REGION.airspaces.length} published areas · LT / LV / PL / SE`;
mapNavigation=createMapNavigation({svg:$('map'),marker:$('start-marker'),zoomIn:$('map-zoom-in'),zoomOut:$('map-zoom-out'),reset:$('map-reset-view'),vilnius:$('map-vilnius-view'),zoomLabel:$('map-zoom'),onStartMove:setOrigin,constrainStart,onInspect:inspectAirspace,onView:view=>{attrs('local-place-labels',{display:view.width<180?'inline':'none'});$('map-scale').textContent=`${Math.round(view.width)} km across · N ↑` ;for(const id of ['outside-bands','below-red']){attrs(id,view);attrs(id+'-background',view);}}});
$('population-toggle').addEventListener('change',e=>{attrs('population-layer',{display:e.target.checked?'inline':'none'});$('population-opacity').disabled=!e.target.checked;});
$('population-opacity').addEventListener('input',e=>{attrs('population-layer',{opacity:+e.target.value/100});$('population-opacity-out').textContent=e.target.value+'%';});
update();
