import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,command,advance,map} from './engine.mjs';
for(const mode of ['outbound','batch'])test(`${mode}: cargo stages and every order complete`,()=>{const s=initialState();command(s,'demo',{mode});const stages=new Set();for(let n=0;n<600&&s.demo.phase!=='completed';n++){advance(s,1);s.tasks.forEach(t=>stages.add(t.phase));}assert.equal(s.demo.phase,'completed');assert.equal(s.ledger.length,mode==='batch'?3:1);assert.equal(s.incidents.length,0);for(const stage of ['loading','carrying','unloading','returning'])assert(stages.has(stage),stage);assert.equal(s.inventory.reduce((n,i)=>n+i.reserved,0),0);});
test('guided demo reroutes, completes once and conserves inventory',()=>{
 const s=initialState();command(s,'demo');const id=s.demo.taskId;assert.equal(s.orders.length,1);assert.equal(s.inventory[0].reserved,6);
 for(let i=0;i<180&&s.demo.phase!=='completed';i++){advance(s,1);for(const r of s.robots)assert(![...map.blocked,...s.obstacles].some(p=>p[0]===r.position[0]&&p[1]===r.position[1]));}
 assert.equal(s.demo.phase,'completed');assert.equal(s.demo.obstacleInjected,true);assert.equal(s.ledger.filter(l=>l.taskId===id).length,1);assert.equal(s.inventory[0].onHand,74);assert.equal(s.inventory[0].reserved,0);assert.equal(s.obstacles.length,0);assert(s.events.some(e=>e.type==='replan'));
 advance(s,100);assert.equal(s.ledger.length,1);
 command(s,'demo');assert.equal(s.orders.length,2);for(let i=0;i<180&&s.demo.phase!=='completed';i++)advance(s,1);assert.equal(s.demo.phase,'completed');assert.equal(s.ledger.length,2);
});
test('resuming existing task does not create an extra order; pause stops transport',()=>{const s=initialState();command(s,'demo');advance(s,3);command(s,'pause');const position=structuredClone(s.robots);advance(s,20);assert.deepEqual(s.robots,position);command(s,'demo');assert.equal(s.orders.length,1);assert.equal(s.running,true);});
