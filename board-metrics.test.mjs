import test from 'node:test';
import assert from 'node:assert/strict';
import {boardMetrics} from './src/board-metrics.mjs';
test('empty board does not fabricate load, throughput or duration',()=>{const m=boardMetrics(null);assert.equal(m.shipped,0);assert.equal(m.load,0);assert.equal(m.average,null);assert(m.buckets.every(b=>b.quantity===0));});
test('board totals use posted inventory ledger and current session only',()=>{const m=boardMetrics({time:80,robots:[{state:'busy'},{state:'idle'}],orders:[{},{}],tasks:[{status:'completed',createdAt:5,completedAt:25},{status:'running'}],inventory:[{id:'A-1',onHand:74,reserved:6},{id:'B-1',onHand:80,reserved:0}],ledger:[{time:0,delta:-3},{time:80,delta:-6},{time:40,delta:2}]});assert.equal(m.shipped,7);assert.equal(m.buckets.reduce((n,b)=>n+b.quantity,0),7);assert.equal(m.load,50);assert.equal(m.average,20);assert.equal(m.active.length,1);assert.equal(m.onHand-m.reserved,148);assert.equal(m.zones.reduce((n,z)=>n+z.quantity,0),154);});
