import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verified, retryProgress } from '../neis-helper/queue-order.js';
const panel = await readFile(new URL('../neis-helper/panel.js', import.meta.url), 'utf8');
const source = panel.slice(panel.indexOf('async function advanceAfterSave'), panel.indexOf("$('retry-pending').addEventListener"));
test('automatic retry preserves completed rows and stops after two extra rounds', async () => {
 const exercise = new Function('verified','retryProgress', `return (async()=>{
 let rows=[{queueId:'done'},{queueId:'flaky'},{queueId:'fail'}],progress={done:{saved:true,autoVerified:true},flaky:{skipError:'slow'},fail:{skipError:'bad'}},current=2,transferId='x',retryRound=0,busy=false;
 const attempts={done:0,flaky:0,fail:0},messages=[];
 const updateButtons=()=>{},updateProgress=()=>{},render=()=>{},persist=async()=>{},status=m=>messages.push(m),completed=item=>verified(progress,item),setTimeout=fn=>fn();
 async function fillCurrentGrid(){const item=rows[current];attempts[item.queueId]++;progress[item.queueId]=item.queueId==='flaky'?{saved:true,autoVerified:true}:{saved:false,skipError:'bad'};await advanceAfterSave('x');}
 ${source}
 await advanceAfterSave('x');return {attempts,retryRound,message:messages.at(-1)};
 })()`);
 const result=await exercise(verified,retryProgress);
 assert.deepEqual(result.attempts,{done:0,flaky:1,fail:2});
 assert.equal(result.retryRound,2);
 assert.match(result.message,/미입력 1건/);
});
