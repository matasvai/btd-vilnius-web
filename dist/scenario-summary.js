import {defaults,simulate,sensitivity,cases,startPoint} from './model.js';
let caseKey,caseResults;
export function summarizeScenario(state){
 const {points,closest,...result}=simulate(state);
 const ensemble=sensitivity(state).map(({entry})=>entry);
 const key=JSON.stringify(startPoint(state));
 if(key!==caseKey){
  caseResults=cases.map(c=>{const {entry,near}=simulate({...defaults,...c.params,start:state.start,origin:state.origin});return {entry,near};});
  caseKey=key;
 }
 return {result,ensemble,caseResults};
}
