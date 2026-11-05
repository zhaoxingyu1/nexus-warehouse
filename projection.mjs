// Immutable, revision-scoped business projections. Retrying fills missing rows.
const ids={warehouses:'6aeabc30d93ff9c29650abe5',locations:'6aeabc4bd93ff9c29650abef',products:'6aeabc4b4440cdd13013c6e0',inventory:'6aeabc4c962027dca5f57b46',robots:'6aeabc4d962027dca5f57b51',orders:'6aeabc4ed93ff9c29650ac4d',order_lines:'6aeabc4e4440cdd13013c704',tasks:'6aeabc4fd93ff9c29650ac58',incidents:'6aeabc50962027dca5f57b98',ledger:'6aeabc51962027dca5f57ba2',events:'6aeabc51d93ff9c29650ac9f'};
const eq=(controlId,value)=>({controlId,dataType:2,spliceType:1,filterType:2,value});
export async function project(state,hap){
 if(!state)return {status:'empty'};
 const scope=`nexus-r${state.revision}`,base={session_id:state.sessionId,scenario_id:scope},refs={},counts={};
 async function table(name,rows,key='code'){
  const ws=ids[name],filters=name==='warehouses'?[eq('code',`WH-SH-001-r${state.revision}`)]:[eq('session_id',state.sessionId),eq('scenario_id',scope)];
  const get=async()=>{const d=await hap('getFilterRows',{pageSize:1000,pageIndex:1,filters},ws);return d.rows||[];};
  let existing=await get();const found=new Set(existing.map(r=>r[key]));
  const missing=rows.filter(r=>!found.has(r[key]));
  for(let i=0;i<missing.length;i+=100){await hap('addRows',{rows:missing.slice(i,i+100).map(r=>Object.entries(name==='warehouses'?r:{...base,...r}).map(([controlId,value])=>({controlId,value:String(value??'')})))},ws);}
  existing=await get();if(existing.length!==rows.length)throw Error(`${name} 数量核对失败，请重试同步`);
  refs[name]=Object.fromEntries(existing.map(r=>[r[key],r.rowid||r.rowId||r._id]));
  for(const row of rows){const actual=existing.find(r=>r[key]===row[key]);for(const [field,value] of Object.entries(row)){if(String(actual?.[field]??'')!==String(value??''))throw Error(`${name} 字段回读不一致`);}}
  counts[name]=existing.length;return refs[name];
 }
 const wh=await table('warehouses',[{code:`WH-SH-001-r${state.revision}`,name:'上海演示仓',map_json:JSON.stringify(state.map),map_version:state.revision}]);const warehouse_id=Object.values(wh)[0];
 await table('locations',state.inventory.map(i=>({code:i.id,warehouse_id,x:i.x,y:i.y,capacity:80})));
 await table('products',[...new Map(state.inventory.map(i=>[i.sku,{sku:i.sku,name:i.name,spec:'演示商品',unit:'件'}])).values()],'sku');
 await table('inventory',state.inventory.map(i=>({code:i.id,location_id:refs.locations[i.id],product_id:refs.products[i.sku],on_hand:i.onHand,reserved:i.reserved,version:state.revision})));
 await table('robots',state.robots.map(r=>({code:r.id,warehouse_id,status:r.state,x:r.position[0],y:r.position[1],battery:Math.round(r.battery),speed:Math.round(r.speed)})));
 await table('orders',state.orders.map(o=>({code:o.id,customer:'隔离演示客户',status:o.status,priority:1,idempotency_key:`${state.sessionId}:${o.id}`})));
 await table('order_lines',state.orders.map(o=>({code:`L-${o.id}`,order_id:refs.orders[o.id],product_id:refs.products[o.sku],quantity:o.quantity,completed:o.status==='completed'?o.quantity:0})));
 await table('tasks',state.tasks.map(t=>({code:t.id,line_id:refs.order_lines[`L-${t.orderId}`],robot_id:refs.robots[t.robotId]||'',status:t.status,route_json:JSON.stringify({nodes:t.route||[],index:t.index||0,phase:t.phase||'',pickedUp:!!t.pickedUp,delivered:!!t.delivered}),route_version:t.routeVersion||0,elapsed_seconds:Math.round((t.completedAt??state.time)-t.createdAt)})));
 await table('incidents',state.incidents.map(i=>({code:i.id,type:i.type,severity:'提示',status:i.status,resolution:JSON.stringify({position:i.position})})));
 await table('ledger',state.ledger.map(l=>({code:l.id,inventory_id:refs.inventory[l.location],task_id:refs.tasks[l.taskId],delta:l.delta,type:l.correctionOf?'重复扣减冲正':'出库扣减',idempotency_key:l.id})));
 await table('events',state.events.map(e=>({code:e.id,type:e.type,entity_id:refs.tasks[e.entityId]||refs.orders[e.entityId]||'',payload_json:JSON.stringify(e),delivery_status:'已保存'})));
 return {status:'verified',revision:state.revision,sessionId:state.sessionId,scope,counts,verifiedAt:new Date().toISOString()};
}
