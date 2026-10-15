import {handleApi} from '../lib/server-api.js';
import {storageEnvironment} from '../lib/vercel-storage.js';
export default async function handler(req,res){try{
 const env=storageEnvironment();if(!env){res.statusCode=503;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({message:'배포 설정이 필요합니다. 관리자에게 저장소 연결을 요청해 주세요.'}));return;}
 const host=req.headers.host,parsed=new URL(req.url,'https://'+host),route=parsed.searchParams.get('route')||req.query?.route||parsed.pathname.replace(/^\/api\/?/,'');
 const path='/api/'+route.replace(/^\/+|\/+$/g,'');parsed.searchParams.delete('route');const url='https://'+host+path+(parsed.searchParams.size?'?'+parsed.searchParams:'');
 const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
 let body;if(!['GET','HEAD'].includes(req.method)){if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4600000){res.statusCode=413;res.end();return;}chunks.push(chunk);}body=Buffer.concat(chunks).toString();}}
 const response=await handleApi(new Request(url,{method:req.method,headers,...(body?{body}:{})}),env);
 res.statusCode=response.status;for(const [key,value] of response.headers)res.setHeader(key,value);res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({message:'저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'}));}}
