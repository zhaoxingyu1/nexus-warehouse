const key=p=>p.join(',');
export const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const distance=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
// All AGVs share one-second slots. Reserve vertices, edges and departure clearance.
export function cooperativeRoute(s,robot,task,grid){
 const horizon=360,walls=new Set([...grid.blocked,...s.obstacles].map(key));
 const others=s.robots.filter(r=>r.id!==robot.id).map(r=>{const t=s.tasks.find(t=>t.robotId===r.id&&t.status==='running');return t?.route?.slice(t.index)||[r.position];});
 const at=(route,time)=>route[Math.min(time,route.length-1)];
 const safe=(a,b,time)=>!walls.has(key(b))&&others.every(route=>{const prev=at(route,time-1),next=at(route,time);return !same(b,next)&&!same(b,prev)&&!same(a,next);});
 const item=s.inventory.find(i=>i.id===task.location);
 const goals=[...(!task.pickedUp?[{point:[item.x,item.y-1],phase:'loading',dwell:3}]:[]),...(!task.delivered?[{point:[19,14],phase:'unloading',dwell:3}]:[]),{point:task.home,phase:'completed',dwell:0}];
 let nodes=[robot.position],stops=[],offset=0;
 for(const goal of goals){
  const start=nodes.at(-1),open=[{p:start,t:offset,f:distance(start,goal.point)}],seen=new Set(),parents=new Map();let end=null;
  const id=n=>`${key(n.p)}@${n.t}`;
  while(open.length){
   open.sort((a,b)=>a.f-b.f||b.t-a.t);const n=open.shift(),nk=id(n);if(seen.has(nk))continue;seen.add(nk);
   if(same(n.p,goal.point)){const hold=goal.phase==='completed'?horizon:Math.min(horizon,n.t+goal.dwell);let free=true;for(let time=n.t+1;time<=hold;time++)if(!safe(n.p,n.p,time)){free=false;break;}if(free){end=n;break;}}
   if(n.t>=horizon)continue;const [x,y]=n.p;
   for(const p of [[x+1,y],[x,y+1],[x-1,y],[x,y-1],[x,y]]){if(p[0]<0||p[0]>=grid.width||p[1]<0||p[1]>=grid.height||!safe(n.p,p,n.t+1))continue;const child={p,t:n.t+1,f:n.t+1+distance(p,goal.point)},ck=id(child);if(seen.has(ck)||parents.has(ck))continue;parents.set(ck,n);open.push(child);}
  }
  if(!end)return null;const part=[];let n=end;while(n.t>offset){part.unshift(n.p);n=parents.get(id(n));}nodes.push(...part);const arrival=nodes.length-1;for(let d=0;d<goal.dwell;d++)nodes.push(goal.point);stops.push({phase:goal.phase,arrival,departure:nodes.length-1});offset=nodes.length-1;
 }
 return {nodes,stops};
}
