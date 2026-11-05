# 架构与数据契约

- React + TypeScript + Vite：src/LiveApp.tsx 工作台，CommandCenter.tsx 大屏，Scene.tsx Three.js 三维场景。
- engine.mjs：模拟状态机、订单预占、装卸结算、暂停和结束、冲正。
- planner.mjs：静态 A* 路径和选车成本；fleet.mjs：一秒时隙的协同路线预约。
- store.mjs：HAP操作快照、版本冲突与请求幂等；projection.mjs：业务表投影与字段读回校验。
- server.mjs：/api/state、/api/commands/:action、/api/sync、/api/routes/plan，响应 no-store。生产身份依赖受保护网关 x-userid，写操作校验操作员名单。

## 持久化
运行快照是权威状态；业务事件后生成版本化业务表投影。HAP业务表手工编辑不会反向改运行状态。关联值为记录ID文本，不是HAP原生关联控件。投影不是跨表事务。

字段别名（字段类型按数值/文本/JSON文本建立，详细映射以projection.mjs为准）：
- warehouses: name,code,map_json,map_version
- locations: code,warehouse_id,x,y,capacity
- products: name,sku,spec,unit
- inventory: code,location_id,product_id,on_hand,reserved,version
- robots: code,warehouse_id,status,x,y,battery,speed
- orders: code,customer,status,priority,idempotency_key
- order_lines: code,order_id,product_id,quantity,completed
- tasks: code,line_id,robot_id,status,route_json,route_version,elapsed_seconds
- incidents: code,type,severity,robot_id,task_id,status,resolution
- ledger: code,inventory_id,task_id,delta,type,idempotency_key
- events: code,type,entity_id,event_time,payload_json,delivery_status
- operations: code,idempotency_key,request_hash,phase,result_json,compensation_json,session_id,scenario_id,revision,snapshot

除warehouses外，业务投影还包含session_id和scenario_id。operations需唯一索引(session_id,idempotency_key)及(scenario_id,revision)。事件时间可保存在payload_json；不是所有声明字段都已写入。仓库、设备是模拟场景，收货与输送线是布景。

