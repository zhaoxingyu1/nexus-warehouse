import {randomUUID} from 'node:crypto';
import {selectRobot} from './planner.mjs';
import {cooperativeRoute,same} from './fleet.mjs';
export const shelves=[3,7,11,15].flatMap((x,z)=>[3,7,11].map((y,i)=>({id:`${'ABCD'[z]}-${i+1}`,x,y,sku:`SKU-${z+1}`,name:['精密传感器','工业控制器','伺服驱动器','连接器组件'][z]})));
export const map={width:21,height:17,blocked:shelves.flatMap(s=>[[s.x,s.y],[s.x+1,s.y],[s.x,s.y+1],[s.x+1,s.y+1]])};
export function initialState(){return {sessionId:randomUUID(),revision:0,running:false,time:0,motionVersion:2,map,shelves,obstacles:[],robots:Array.from({length:6},(_,i)=>({id:`AGV-0${i+1}`,position:[1+i*3,16],battery:96-i*7,speed:1,state:'idle'})),inventory:shelves.map(s=>({...s,onHand:80,reserved:0})),orders:[],tasks:[],events:[],incidents:[],ledger:[],receipts:{},frames:[]};}
const event=(s,type,message,entityId)=>{s.events.unshift({id:randomUUID(),time:s.time,at:new Date().toISOString(),type,message,entityId});s.events=s.events.slice(0,200);};
const ongoing=t=>['running','waiting','blocked'].includes(t.status);
const routeMap=s=>({...map,blocked:[...map.blocked,...s.obstacles]});
function recordFrame(s){s.frames??=[];s.frames.push({time:s.time,robots:s.robots.map(r=>{const t=s.tasks.find(t=>t.robotId===r.id&&ongoing(t));return {id:r.id,position:[...r.position],cargo:Boolean(t?.pickedUp&&!t?.delivered),phase:t?.phase||'idle'};})});s.frames=s.frames.slice(-24);}
function setRoute(s,t,r){const plan=cooperativeRoute(s,r,t,map);if(!plan)return false;Object.assign(t,{route:plan.nodes,stops:plan.stops,index:0,progress:0,status:'running',routeVersion:(t.routeVersion||0)+1,phase:t.delivered?'returning':t.pickedUp?'carrying':'picking'});r.state='busy';return true;}
function assign(s,t){
 const item=s.inventory.find(i=>i.id===t.location),result=selectRobot({map:routeMap(s),robots:s.robots,pickup:[item.x,item.y-1],destination:[19,14]});t.decision=result;
 for(const candidate of result.candidates.filter(c=>c.eligible).sort((a,b)=>a.score-b.score)){
  const r=s.robots.find(r=>r.id===candidate.id);t.home=[...r.position];const plan=cooperativeRoute(s,r,t,map);if(!plan){candidate.eligible=false;candidate.reason='没有可预约的安全通道时段';continue;}
  const distance=plan.nodes.slice(1).filter((p,i)=>!same(p,plan.nodes[i])).length;if(r.battery-distance*.25<15){candidate.eligible=false;candidate.reason='含返程电量不足，需充电';continue;}
  t.robotId=r.id;t.decision.selected=candidate;setRoute(s,t,r);event(s,'dispatch',`${r.id} 接受 ${t.id}，已预约通道与月台时段`,t.id);return;
 }t.decision.selected=null;t.status='waiting';t.waitReason='等待空闲设备、电量或安全通道时段';
}
function replan(s){
 const active=s.tasks.filter(t=>t.robotId&&['running','blocked'].includes(t.status)).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
 for(const t of active){t.oldRoute=t.route?.slice(t.index);t.status='blocked';}
 for(const t of active){const r=s.robots.find(r=>r.id===t.robotId),started=performance.now();if(setRoute(s,t,r)){t.comparison={oldLength:Math.max(0,(t.oldRoute?.length||1)-1),newLength:t.route.length-1,calculationMs:performance.now()-started};event(s,'replan',`${r.id} 安全重规划：${t.comparison.oldLength} → ${t.comparison.newLength} 个时隙`,t.id);}else{t.phase='traffic';event(s,'warning',`${r.id} 安全停车，等待可达通道`,t.id);}}
}
function migrate(s){if(s.motionVersion===2)return;s.motionVersion=2;s.frames=[];s.fraction=0;replan(s);recordFrame(s);}
function settle(s,t){if(t.settled||s.ledger.some(l=>l.taskId===t.id&&l.delta<0)){t.settled=true;return;}const item=s.inventory.find(i=>i.id===t.location);if(item.reserved<t.quantity||item.onHand<t.quantity)throw Error('库存预占校验失败，已停止结算');item.onHand-=t.quantity;item.reserved-=t.quantity;s.ledger.unshift({id:randomUUID(),taskId:t.id,location:item.id,delta:-t.quantity,time:s.time});t.settled=true;event(s,'complete',`${t.id} 卸货完成，库存扣减 ${t.quantity}`,t.id);}
function step(s){
 const active=s.tasks.filter(t=>t.status==='running');
 const proposals=active.map(t=>({t,r:s.robots.find(r=>r.id===t.robotId),to:t.route[Math.min(t.index+1,t.route.length-1)]}));
 const invalid=proposals.some(({r,to})=>map.blocked.concat(s.obstacles).some(p=>same(p,to))||s.robots.some(other=>{if(other.id===r.id)return false;const next=proposals.find(p=>p.r.id===other.id);return same(to,other.position)||next&&(same(to,next.to)||same(r.position,next.to));}));
 if(invalid){replan(s);recordFrame(s);return;}
 for(const {t,r,to} of proposals){const moved=!same(r.position,to);t.index=Math.min(t.index+1,t.route.length-1);r.position=[...to];if(moved)r.battery=Math.max(0,r.battery-.25);t.phase=t.delivered?'returning':t.pickedUp?'carrying':'picking';
  const load=t.stops?.find(x=>x.phase==='loading'),unload=t.stops?.find(x=>x.phase==='unloading');
  if(load&&t.index>=load.arrival&&!t.pickedUp){t.pickedUp=true;event(s,'pickup',`${r.id} 到达 ${t.location}，装载 ${t.quantity} 件`,t.id);}
  if(load&&t.index>=load.arrival&&t.index<load.departure)t.phase='loading';
  if(unload&&t.index>=unload.arrival&&t.index<unload.departure)t.phase='unloading';
  if(unload&&t.index>=unload.departure&&!t.delivered){t.delivered=true;settle(s,t);event(s,'unload',`${r.id} 月台卸货完成，空载返程`,t.id);}
  if(!moved&&!['loading','unloading'].includes(t.phase))t.phase='traffic';
  if(t.index===t.route.length-1){settle(s,t);t.status='completed';t.completedAt=s.time;r.state='idle';s.orders.find(o=>o.id===t.orderId).status='completed';event(s,'system',`${r.id} 返回停车位，${t.id} 已完成`,t.id);}
 }
 for(const t of s.tasks.filter(t=>t.status==='waiting').reverse())assign(s,t);recordFrame(s);
}
export function advance(s,seconds){
 migrate(s);if(!s.running)return;s.fraction=(s.fraction||0)+Math.max(0,seconds);
 while(s.fraction>=1){s.fraction-=1;s.time+=1;step(s);
  if(s.demo?.phase==='transport'&&s.demo.mode==='obstacle'&&!s.demo.obstacleInjected&&s.time-s.demo.startedAt>=8){try{command(s,'obstacle');s.demo.obstacleInjected=true;}catch{/* Wait for a safe obstacle cell. */}}
  if(s.demo&&s.demo.phase!=='completed'&&(s.demo.taskIds||[]).length&&s.demo.taskIds.every(id=>['completed','cancelled'].includes(s.tasks.find(t=>t.id===id)?.status))){s.demo.phase='completed';if(s.obstacles.length)command(s,'recover');event(s,'demo','本轮完成：运输、卸货、返程与库存结算均已保存');}
  if(!s.tasks.some(ongoing)){s.running=false;s.fraction=0;break;}
 }
}
export function command(s,action,p={}){
 migrate(s);
 if(action==='reconcile'){
  let corrected=0;for(const t of s.tasks){const entries=s.ledger.filter(l=>l.taskId===t.id&&l.delta<0).sort((a,b)=>a.time-b.time);for(const duplicate of entries.slice(1)){if(s.ledger.some(l=>l.correctionOf===duplicate.id))continue;const item=s.inventory.find(i=>i.id===duplicate.location);if(!item||duplicate.delta!==-t.quantity)throw Error('流水不匹配，需要人工核对');item.onHand-=duplicate.delta;s.ledger.unshift({id:randomUUID(),taskId:t.id,location:item.id,delta:-duplicate.delta,time:duplicate.time,correctionOf:duplicate.id,type:'correction'});corrected++;}if(entries.length)t.settled=true;}
  for(const item of s.inventory)item.reserved=s.tasks.filter(t=>t.location===item.id&&ongoing(t)&&!t.settled).reduce((n,t)=>n+t.quantity,0);
  event(s,'audit',`库存核对完成：${corrected} 条重复流水已冲正，原始记录保留`);
 }else if(action==='demo'){
  if(s.tasks.some(ongoing)){s.running=true;event(s,'system','继续当前任务，保留原场景与进度');return s;}
  const mode=['outbound','obstacle','batch'].includes(p.mode)?p.mode:'obstacle';s.running=true;
  const items=s.inventory.filter(i=>i.onHand-i.reserved>=6).slice(0,mode==='batch'?3:1);if(!items.length)throw Error('演示库存不足');
  s.demo={mode,startedAt:s.time,phase:'transport',obstacleInjected:false,taskIds:[]};for(const item of items){command(s,'order',{location:item.id,quantity:6});s.demo.taskIds.push(s.tasks[0].id);}s.demo.taskId=s.demo.taskIds[0];event(s,'demo',mode==='batch'?'多车并行演示启动：通道与月台按时隙预约':'演示启动');
 }else if(action==='order'){
  const quantity=Number(p.quantity),item=s.inventory.find(i=>i.id===p.location);if(!item||!Number.isInteger(quantity)||quantity<=0)throw Error('请选择货位并输入正整数');if(item.onHand-item.reserved<quantity)throw Error('库存不足，未创建订单或预占');const id=`NX-${String(s.orders.length+1).padStart(4,'0')}`;item.reserved+=quantity;s.orders.unshift({id,location:item.id,sku:item.sku,quantity,status:'running',createdAt:s.time});const t={id:`T-${id}`,orderId:id,location:item.id,quantity,status:'waiting',createdAt:s.time};s.tasks.unshift(t);event(s,'reserve',`${id} 预占 ${item.id} 库存 ${quantity}`,id);assign(s,t);s.running=true;
 }else if(action==='pause'){if(!s.tasks.some(ongoing))throw Error('当前没有进行中的任务');s.running=!s.running;event(s,'system',s.running?'演示继续':'演示暂停');
 }else if(action==='finish'){if(!s.tasks.some(ongoing))throw Error('当前没有进行中的任务');s.running=true;s.demo??={};s.demo.phase='finishing';s.demo.taskIds=s.tasks.filter(ongoing).map(t=>t.id);event(s,'system','结束演示：完成当前订单和返程后停止，不再自动注入障碍');
 }else if(action==='cancel'){
  const t=s.tasks.find(t=>t.id===p.id);if(!t||!ongoing(t))throw Error('任务已结束或不存在');if(t.pickedUp)throw Error('货物已装载，请完成卸货与返程，不能直接释放预占');s.inventory.find(i=>i.id===t.location).reserved-=t.quantity;t.status='cancelled';s.orders.find(o=>o.id===t.orderId).status='cancelled';const r=s.robots.find(r=>r.id===t.robotId);if(r)r.state='idle';replan(s);event(s,'system',`${t.id} 取消并释放预占`);
 }else if(action==='obstacle'){
  const active=s.tasks.find(t=>t.status==='running'&&t.route.length-t.index>5);if(!active)throw Error('请先启动运输任务');const protectedCells=[...s.robots.map(r=>r.position),...s.inventory.map(i=>[i.x,i.y-1]),[19,14],...s.robots.map((_,i)=>[1+i*3,16])];const point=active.route.slice(active.index+3).find(p=>!protectedCells.concat(s.obstacles).some(q=>same(p,q)));if(!point)throw Error('暂无可安全设置障碍的通道');s.obstacles.push(point);s.incidents.unshift({id:randomUUID(),type:'通道堵塞',status:'处理中',time:s.time,position:point});event(s,'warning',`通道 (${point.join(',')}) 堵塞，设备先停车再重规划`);replan(s);
 }else if(action==='recover'){s.obstacles=[];s.incidents.forEach(i=>i.status='已恢复');replan(s);event(s,'system','通道障碍已恢复');
 }else if(action==='dispatch'){for(const t of s.tasks.filter(t=>t.status==='waiting').reverse())assign(s,t);
 }else throw Error('未知操作');recordFrame(s);s.revision++;return s;
}
