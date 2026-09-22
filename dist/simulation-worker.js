import {summarizeScenario} from './scenario-summary.js';
self.onmessage=({data:{version,state}})=>{
 try{self.postMessage({version,...summarizeScenario(state)});}
 catch(error){self.postMessage({version,error:error.message});}
};
