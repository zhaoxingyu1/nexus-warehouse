export function boardMetrics(s){
 const tasks=s?.tasks||[],inventory=s?.inventory||[],robots=s?.robots||[],ledger=s?.ledger||[],orders=s?.orders||[];
 const active=tasks.filter(t=>['running','blocked','waiting'].includes(t.status));
 const completed=tasks.filter(t=>t.status==='completed');
 const durations=completed.filter(t=>Number.isFinite(t.completedAt)&&Number.isFinite(t.createdAt)).map(t=>t.completedAt-t.createdAt);
 const span=Math.max(8,Number(s?.time)||0),buckets=Array.from({length:8},(_,i)=>({start:i*span/8,end:(i+1)*span/8,quantity:0}));
 for(const row of ledger){const index=Math.min(7,Math.max(0,Math.floor(Number(row.time||0)/span*8)));buckets[index].quantity-=Number(row.delta||0);}
 return {active,completed,orders:orders.length,onHand:inventory.reduce((n,i)=>n+i.onHand,0),reserved:inventory.reduce((n,i)=>n+i.reserved,0),shipped:ledger.reduce((n,l)=>n+-l.delta,0),busy:robots.filter(r=>r.state==='busy').length,total:robots.length,load:robots.length?Math.round(robots.filter(r=>r.state==='busy').length/robots.length*100):0,average:durations.length?Math.round(durations.reduce((n,x)=>n+x,0)/durations.length):null,buckets,zones:['A','B','C','D'].map(zone=>({zone,quantity:inventory.filter(i=>i.id.startsWith(zone)).reduce((n,i)=>n+i.onHand,0)}))};
}
