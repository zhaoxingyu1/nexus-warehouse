import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,command,advance,map} from './engine.mjs';
test('duplicate historical deduction is corrected once without deleting original ledger',()=>{const s=initialState();command(s,'demo',{mode:'outbound'});for(let n=0;n<200&&s.running;n++)advance(s,1);const original=s.ledger[0];s.ledger.push({...original,id:'duplicate-test',time:original.time+1});s.inventory[0].onHand-=6;s.inventory[0].reserved-=6;command(s,'reconcile');assert.equal(s.inventory[0].onHand,74);assert.equal(s.inventory[0].reserved,0);assert.equal(s.ledger.length,3);assert.equal(s.ledger.reduce((n,l)=>n+l.delta,0),-6);command(s,'reconcile');assert.equal(s.ledger.length,3);assert.equal(s.inventory[0].onHand,74);});
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
function safety(s,before){
 for(let i=0;i<s.robots.length;i++){
  const r=s.robots[i];assert(![...map.blocked,...s.obstacles].some(p=>same(p,r.position)),'occupied obstacle');
  for(let j=i+1;j<s.robots.length;j++){
   assert(!same(r.position,s.robots[j].position),'vertex collision');
   assert(!(same(before[i],s.robots[j].position)&&same(before[j],r.position)),'reverse-edge collision');
   // Check continuous motion between cell centers; .9m maximum rotated footprint, 1.4m grid.
   for(let f=0;f<=1;f+=.05){const a=before[i].map((v,k)=>v+(r.position[k]-v)*f),b=before[j].map((v,k)=>v+(s.robots[j].position[k]-v)*f);assert(Math.hypot(a[0]-b[0],a[1]-b[1])*1.4>1.05,'swept footprint collision');}
  }
 }
}
for(const obstacleAt of [null,5,17,33])test(`three simultaneous AGVs, safe paths and settlement; obstacle ${obstacleAt}`,()=>{
 const s=initialState();command(s,'demo',{mode:'batch'});assert.equal(new Set(s.tasks.map(t=>t.robotId)).size,3);assert.equal(s.tasks.filter(t=>t.status==='running').length,3);
 for(let n=0;n<400&&s.running;n++){if(n===obstacleAt)command(s,'obstacle');const before=s.robots.map(r=>[...r.position]);advance(s,1);safety(s,before);}
 assert.equal(s.tasks.filter(t=>t.status==='completed').length,3);assert.equal(s.ledger.length,3);assert.equal(s.inventory.reduce((n,i)=>n+i.onHand,0),942);assert.equal(s.inventory.reduce((n,i)=>n+i.reserved,0),0);assert.equal(s.running,false);
});
test('six concurrent orders with waits at a shared dock complete without collisions',()=>{
 const s=initialState();for(const item of s.inventory.slice(0,6))command(s,'order',{location:item.id,quantity:4});assert.equal(new Set(s.tasks.map(t=>t.robotId)).size,6);
 for(let n=0;n<500&&s.running;n++){const before=s.robots.map(r=>[...r.position]);advance(s,1);safety(s,before);}assert.equal(s.ledger.length,6);assert(s.tasks.every(t=>t.status==='completed'));
});
test('pause preserves simulation, finish drains loaded orders without releasing their reservation',()=>{
 const s=initialState();command(s,'demo',{mode:'batch'});advance(s,20);command(s,'pause');const before=JSON.stringify(s.robots);advance(s,50);assert.equal(JSON.stringify(s.robots),before);command(s,'finish');for(let n=0;n<400&&s.running;n++)advance(s,1);assert.equal(s.demo.phase,'completed');assert.equal(s.ledger.length,3);
});
