import { neon } from '@neondatabase/serverless';
import {get,put} from '@vercel/blob';

// Preserve the tested repository contract while using PostgreSQL on Vercel.
export function createDatabase(connectionString,client){
 const sql=client||neon(connectionString,{fullResults:true});
 const row=r=>r&&Object.fromEntries(Object.entries(r).map(([k,v])=>[k,['created','expires','revision','count'].includes(k)?Number(v):v]));
 function prepare(query){let params=[];let i=0;const statement=query.replace(/\?/g,()=>'$'+(++i));return {
  bind(...args){params=args;return this;},
  query(){return sql.query(statement,params,{fullResults:true});},
  async first(){return row((await this.query()).rows[0])||null;},
  async all(){return {results:(await this.query()).rows.map(row)};},
  async run(){return {meta:{changes:(await this.query()).rowCount}};}
 };}
 return {prepare,async batch(statements){const result=await sql.transaction(statements.map(s=>s.query()),{fullResults:true});return result.map(r=>({meta:{changes:r.rowCount}}));}};
}
export function createBucket(sdk={get,put}){
 return {
  async put(key,value,{customMetadata}={}){await sdk.put('easy-personal/files/'+key,JSON.stringify({customMetadata,payload:value}),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});},
  async get(key){const result=await sdk.get('easy-personal/files/'+key,{access:'private',useCache:false});if(!result)return null;if(result.statusCode!==200)throw new Error('첨부파일을 읽지 못했습니다.');const data=JSON.parse(await new Response(result.stream).text());return {customMetadata:data.customMetadata,text:async()=>data.payload};}
 };
}
let runtime;
export function storageEnvironment(){if(runtime)return runtime;
 if(!process.env.DATABASE_URL||!process.env.DATA_KEY)return null;
 runtime={DB:createDatabase(process.env.DATABASE_URL),DATA_KEY:process.env.DATA_KEY,...(process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID?{BUCKET:createBucket()}:{})};return runtime;
}
