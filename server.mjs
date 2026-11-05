import {createServer} from 'node:http';
import {latest,execute,StoreError,projectionStatus,syncBusiness} from './store.mjs';
import {planRoute} from './planner.mjs';
const local=process.env.NEXUS_LOCAL==='1';
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
async function read(req){let text='';for await(const part of req){text+=part;if(text.length>24000)throw new StoreError('请求过大',413);}try{return text?JSON.parse(text):{};}catch{throw new StoreError('JSON 格式无效',400);}}
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://nexus');if(url.pathname==='/api/health')return json(res,200,{ok:true,service:'NEXUS',storage:'HAP',configured:Boolean(process.env.HAP_APPKEY&&process.env.HAP_SIGN)});
 if(!local&&!req.headers['x-userid'])throw new StoreError('请先登录',401);
 if(req.method==='GET'&&url.pathname==='/api/state'){const state=await latest();return json(res,200,{state,sync:await projectionStatus(),storage:'HAP',canWrite:local||Boolean((process.env.NEXUS_OPERATORS||'').split(',').includes(String(req.headers['x-userid'])))});}
 if(req.method==='POST'){if(!local&&!(process.env.NEXUS_OPERATORS||'').split(',').includes(String(req.headers['x-userid'])))throw new StoreError('当前账号没有演示操作权限',403);const body=await read(req);
 if(url.pathname==='/api/sync')return json(res,200,{sync:await syncBusiness()});
 if(url.pathname==='/api/routes/plan')return json(res,200,planRoute(body));
 if(url.pathname.startsWith('/api/commands/')){const action=url.pathname.split('/').at(-1);if(!['reconcile','demo','order','pause','finish','cancel','obstacle','recover','dispatch','reset','tick'].includes(action))throw new StoreError('未知操作',400);const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[\w-]{8,100}$/.test(key))throw new StoreError('缺少有效操作编号',400);return json(res,200,await execute(action,body.payload||{},key,body.expectedRevision));}}
 return json(res,404,{error:'接口不存在'});
 }catch(e){json(res,e.status||400,{error:e.message||'请求失败'});}}).listen(Number(process.env.PORT||8787),local?'127.0.0.1':'0.0.0.0');
