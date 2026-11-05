import {project} from './projection.mjs';
import {createHash} from 'node:crypto';
import {initialState,command,advance} from './engine.mjs';
const WS='6aeabc53d93ff9c29650ace7',SCENARIO='nexus-live-v1';
export class StoreError extends Error{constructor(message,status=503){super(message);this.status=status;}}
export async function hap(path,body={},worksheetId=WS){
 const appKey=process.env.HAP_APPKEY,sign=process.env.HAP_SIGN;
 if(!appKey||!sign)throw new StoreError('HAP 服务端凭据尚未配置');
 let response;try{response=await fetch('https://api.mingdao.com/v2/open/worksheet/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({appKey,sign,worksheetId,...body}),signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw new StoreError('HAP 请求超时或网络中断，请使用原操作编号重试');}
 if(!response.ok)throw new StoreError(`HAP 服务返回 HTTP ${response.status}`);
 const data=await response.json();if(data.error_code!==1){const e=new StoreError(data.error_code===100005?'版本或幂等键冲突，请刷新重试':`HAP 操作失败（代码 ${data.error_code}）`,data.error_code===100005?409:503);e.hapCode=data.error_code;throw e;}return data.data;
}
const equal=(controlId,value)=>({controlId,dataType:2,spliceType:1,filterType:2,value});
export async function latest(){const data=await hap('getFilterRows',{pageSize:1,pageIndex:1,sortId:'revision',isAsc:false,filters:[equal('scenario_id',SCENARIO)]});const row=data.rows?.[0];if(!row)return null;const state=JSON.parse(row.snapshot);if(state.revision!==Number(row.revision))throw new StoreError('状态快照版本不一致');return {...state,recordId:row.rowid||row._id};}
export async function receipt(key){const data=await hap('getFilterRows',{pageSize:1,pageIndex:1,filters:[equal('scenario_id',SCENARIO),equal('idempotency_key',key)]});return data.rows?.[0];}
async function commit(state,key,hash,action){delete state.recordId;const payload={code:`NEXUS-${state.revision}`,scenario_id:SCENARIO,session_id:SCENARIO,revision:state.revision,idempotency_key:key,request_hash:hash,phase:'committed',result_json:JSON.stringify({action,sessionId:state.sessionId}),snapshot:JSON.stringify(state)};if(payload.snapshot.length>180000)throw new StoreError('演示会话记录达到上限，请归档并重置',409);return hap('addRow',{controls:Object.entries(payload).map(([controlId,value])=>({controlId,value:String(value)}))});}
export async function execute(action,payload,key,expectedRevision){
 const hash=createHash('sha256').update(JSON.stringify({action,payload})).digest('hex');const prior=await receipt(key);if(prior){if(prior.request_hash!==hash)throw new StoreError('幂等键已用于不同请求',409);return {replayed:true,state:await latest()};}
 let state=await latest();if(state&&expectedRevision!==undefined&&expectedRevision!==state.revision)throw new StoreError('状态已变化，请刷新后重试',409);
 const previousEventId=state?.events?.[0]?.id;const previousRevision=state?.revision??-1;if(action==='reset'){state=initialState();state.revision=previousRevision;}else{state??=initialState();if(action==='tick'){const elapsed=Math.min(5,Math.max(0,(Date.now()-(state.updatedAt||Date.now()))/1000));advance(state,elapsed);}else command(state,action,payload);}
 state.revision=previousRevision+1;state.updatedAt=Date.now();state.actor='authenticated-operator';
 try{state.recordId=await commit(state,key,hash,action);}catch(e){const persisted=await receipt(key).catch(()=>null);if(persisted?.request_hash===hash)return {replayed:true,state:await latest()};throw e;}
 const sync=action!=='tick'||state.events[0]?.id!==previousEventId?await syncBusiness(state):await projectionStatus();return {state,replayed:false,sync};
}

export async function projectionStatus(){const d=await hap('getFilterRows',{pageSize:1,pageIndex:1,sortId:'revision',isAsc:false,filters:[equal('scenario_id','nexus-projection-v1')]});const row=d.rows?.[0];return row?JSON.parse(row.result_json):{status:'pending'};}
export async function syncBusiness(state){state??=await latest();if(!state)return {status:'empty'};const previous=await projectionStatus();if(previous.revision===state.revision)return previous;try{const result=await project(state,hap);try{await hap('addRow',{controls:Object.entries({code:'SYNC-'+state.revision,scenario_id:'nexus-projection-v1',session_id:'nexus-projection-v1',revision:state.revision,idempotency_key:'projection-'+state.revision,phase:'verified',result_json:JSON.stringify(result)}).map(([controlId,value])=>({controlId,value:String(value)}))});}catch(e){if(e.hapCode!==100005)throw e;}return result;}catch(e){return {status:'failed',revision:state.revision,message:e.message};}}
