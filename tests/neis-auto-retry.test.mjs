import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verified } from '../neis-helper/queue-order.js';
const panel = await readFile(new URL('../neis-helper/panel.js', import.meta.url), 'utf8');
const source = panel.slice(panel.indexOf('async function advanceAfterSave'), panel.indexOf("$('retry-pending').addEventListener"));
const run = (stopRequested) => new Function('verified', `return (async()=>{
 let rows=[{queueId:'done'},{queueId:'next'},{queueId:'fail'}],progress={done:{saved:true,autoVerified:true},fail:{skipError:'bad'}},current=0,transferId='x',retryRound=0,busy=false,stopRequested=${stopRequested};
 const attempts={done:0,next:0,fail:0},messages=[];
 const updateButtons=()=>{},updateProgress=()=>{},render=()=>{},persist=async()=>{},status=m=>messages.push(m),completed=item=>verified(progress,item),retryProgress=()=>{throw new Error('auto retry');};
 async function fillCurrentGrid(){const item=rows[current];attempts[item.queueId]++;progress[item.queueId]={saved:false,skipError:'bad'};await advanceAfterSave('x');}
 ${source}
 await advanceAfterSave('x');return {attempts,message:messages.at(-1)};
 })()`)(verified);

test('failed rows are not retried automatically, so app sync cannot cause an endless retry cycle', async () => {
 const result = await run(false);
 assert.deepEqual(result.attempts, { done: 0, next: 1, fail: 0 });
 assert.match(result.message, /미입력 2건/);
});

test('a stop request keeps completed rows and does not move on to the next student', async () => {
 const result = await run(true);
 assert.deepEqual(result.attempts, { done: 0, next: 0, fail: 0 });
 assert.match(result.message, /중단/);
});

test('the stop button cancels the running grid fill in the NEIS tab', async () => {
 const grid = await readFile(new URL('../neis-helper/grid.js', import.meta.url), 'utf8');
 const html = await readFile(new URL('../neis-helper/panel.html', import.meta.url), 'utf8');
 assert.match(html, /id="stop-work"/);
 assert.match(panel, /command:'cancel'/);
 assert.match(grid, /message\.command==='cancel'\)\{cancelRequested=true/);
});
