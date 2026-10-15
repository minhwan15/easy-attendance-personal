import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,createBucket} from '../lib/vercel-storage.js';
test('PostgreSQL adapter uses bind parameters, numeric timestamps, and atomic transaction',async()=>{
 const calls=[];const client={query(text,params){calls.push({text,params});const p=Promise.resolve({rows:[{created:'1792000000000',expires:'1792000000001',count:1,id:'room'}],rowCount:1});p.statement=text;return p;},async transaction(queries){assert.equal(queries.length,2);assert.ok(queries[0].statement.includes('$1'));return Promise.all(queries);}};
 const db=createDatabase('',client);const r=await db.prepare('SELECT * FROM rooms WHERE id = ? AND revision = ?').bind("x' OR 1=1",2).first();assert.equal(typeof r.created,'number');assert.equal(calls[0].text,'SELECT * FROM rooms WHERE id = $1 AND revision = $2');assert.equal(calls[0].params[0],"x' OR 1=1");
 assert.equal((await db.prepare('UPDATE rooms SET revision = ?').bind(2).run()).meta.changes,1);
 await db.batch([db.prepare('DELETE FROM pairs WHERE room = ?').bind('r'),db.prepare('INSERT INTO pairs(hash,room,expires) VALUES (?,?,?)').bind('a','r',123)]);
});
test('attachments remain private and opaque, scoped by room',async()=>{
 const store=new Map();const sdk={async put(path,data,options){assert.equal(options.access,'private');assert.equal(options.addRandomSuffix,false);store.set(path,data);},async get(path,options){assert.equal(options.access,'private');const data=store.get(path);return data?{statusCode:200,stream:new Blob([data]).stream()}:null;}};
 const bucket=createBucket(sdk);await bucket.put('room-a/file','encrypted-only',{customMetadata:{name:'test',mime:'application/pdf'}});const f=await bucket.get('room-a/file');assert.equal(await f.text(),'encrypted-only');assert.equal(f.customMetadata.mime,'application/pdf');assert.equal(await bucket.get('room-b/file'),null);
});
