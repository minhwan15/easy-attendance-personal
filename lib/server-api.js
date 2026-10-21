import { normalizeRecord } from '../public/src/notebook-model.js';
import { normalizeRoster } from '../public/src/notebook-roster.js';
import { normalizeExperienceSettings } from '../public/src/notebook-experience-settings.js';
import { normalizeParentReplies } from '../public/src/notebook-parent-replies.js';
import { parseDataset, todaySeoul } from '../public/src/model.js';
const enc=new TextEncoder(),dec=new TextDecoder();
const token=(n=32)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const b64=a=>{let s='';for(const b of a)s+=String.fromCharCode(b);return btoa(s);};
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const same=(a,b)=>canonical(a)===canonical(b);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...headers}});
const cookie=(s,age=31536000)=>`__Host-easy-device=${s}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
async function aes(env){if(!/^[a-f0-9]{64}$/.test(env.DATA_KEY||''))fail(503,'저장 공간을 준비하고 있습니다.');return crypto.subtle.importKey('raw',Uint8Array.from(env.DATA_KEY.match(/../g),x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(env,room,value){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(room)},await aes(env),typeof value==='string'?enc.encode(value):value);return JSON.stringify({iv:b64(iv),data:b64(new Uint8Array(data))});}
async function unseal(env,room,text){const a=JSON.parse(text);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(a.iv),additionalData:enc.encode(room)},await aes(env),bytes(a.data)));}
const deviceLabel=r=>/iPhone|iPad/.test(r.headers.get('user-agent')||'')?'iPhone · iPad':/Android/.test(r.headers.get('user-agent')||'')?'Android 휴대폰':'PC 브라우저';
async function auth(r,env){const value=(r.headers.get('cookie')||'').match(/(?:^|;\s*)__Host-easy-device=([a-f0-9]{64})(?:;|$)/)?.[1];return value?await env.DB.prepare('SELECT * FROM devices WHERE hash = ? AND expires > ?').bind(await hash(value),Date.now()).first():null;}
async function rate(r,env,action,max=20){const key=await hash(action+(r.headers.get('x-real-ip')||r.headers.get('cf-connecting-ip')||'unknown')+Math.floor(Date.now()/600000));const a=await env.DB.prepare('INSERT INTO limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=limits.count+1 RETURNING count').bind(key,Date.now()+1200000).first();if(a.count>max)fail(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');}
function profile(input){const p={schoolName:String(input.schoolName||'').trim(),displayName:String(input.displayName||'').trim(),grade:Number(input.grade),classNumber:Number(input.classNumber),...(input.timetable?{timetable:input.timetable}:{})};if(!p.schoolName||p.schoolName.length>60||!p.displayName||p.displayName.length>40||![1,2,3].includes(p.grade)||!Number.isInteger(p.classNumber)||p.classNumber<1||p.classNumber>99)fail(400,'학교·담임 이름과 학년(1~3)·반(1~99)을 확인해 주세요.');if(p.timetable){const t=p.timetable;if(!Array.isArray(t.counts)||t.counts.length!==7||!t.counts.every(x=>Number.isInteger(x)&&x>=0&&x<=8)||!Array.isArray(t.periods)||t.periods.length!==8)fail(400,'요일별 수업 수와 교시 시간을 확인해 주세요.');let end='00:00';for(const x of t.periods){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.start)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.end)||x.start>=x.end||x.start<end)fail(400,'교시 시간은 겹치지 않게 순서대로 입력해 주세요.');end=x.end;}}return p;}
const classId=p=>`${p.grade}${String(p.classNumber).padStart(2,'0')}`;
function inClass(id,p){if(id&&String(id).slice(0,3)!==classId(p))fail(400,`내 반(${p.grade}학년 ${p.classNumber}반) 학생만 등록할 수 있습니다.`);}
async function read(env,id){const row=await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first();if(!row)fail(401,'출결함 연결을 다시 확인해 주세요.');return {row,data:JSON.parse(dec.decode(await unseal(env,id,row.payload)))};}
function snapshot(s){const p=s.data.profile;return {authenticated:true,user:{username:classId(p),displayName:p.displayName,schoolName:p.schoolName},profile:p,records:s.data.records,students:s.data.students,experienceSettings:s.data.experienceSettings,parentReplies:s.data.parentReplies,revision:s.row.revision,dailyExamEvents:s.data.calendar.events};}
async function mutate(env,id,edit){for(let n=0;n<4;n++){const s=await read(env,id);edit(s.data);const plain=JSON.stringify(s.data);if(enc.encode(plain).length>1100000)fail(413,'출결함 용량을 초과했습니다. 백업 후 오래된 기록을 정리해 주세요.');const result=await env.DB.prepare('UPDATE rooms SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(await seal(env,id,plain),id,s.row.revision).run();if(result.meta.changes){s.row.revision++;return s;}}fail(409,'다른 기기에서 저장 중입니다. 새로 불러온 뒤 다시 저장해 주세요.');}
function conflict(before,current){if(!same(before??null,current??null))fail(409,'다른 기기에서 내용이 변경되었습니다. 작성 내용을 보관하고 최신 기록을 불러온 뒤 다시 저장해 주세요.');}
async function newDevice(env,id,r){const secret=token();await env.DB.prepare('INSERT INTO devices (hash,room,label,created,expires) VALUES (?,?,?,?,?)').bind(await hash(secret),id,deviceLabel(r),Date.now(),Date.now()+31536000000).run();return secret;}

export async function handleApi(r,env){try{
 const url=new URL(r.url),path=url.pathname,method=r.method;
 if(!['GET','POST','PATCH','DELETE'].includes(method))fail(405,'지원하지 않는 요청입니다.');
 if(method!=='GET'){if(r.headers.get('origin')!==url.origin||r.headers.get('sec-fetch-site')==='cross-site')fail(403,'앱 화면에서 다시 시도해 주세요.');if(!r.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON 요청이 필요합니다.');}
 if(!env.DB)fail(503,'저장 공간을 준비하고 있습니다.');
 let body={};if(method!=='GET'){const text=await r.text();if(enc.encode(text).length>4600000)fail(413,'파일은 3MB 이하로 올려 주세요.');try{body=JSON.parse(text||'{}');}catch{fail(400,'요청 내용을 확인해 주세요.');}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'요청 내용을 확인해 주세요.');}
 const device=await auth(r,env);
 if(path==='/api/health')return json({ok:true});
 if(path==='/api/personal/create'&&method==='POST'){
  if(device)fail(409,'이미 출결함이 연결되어 있습니다.');await rate(r,env,'create',10);const p=profile(body),id=token(16),recovery=token(24),now=todaySeoul();const data={profile:p,students:[],records:[],experienceSettings:normalizeExperienceSettings(),parentReplies:normalizeParentReplies(),calendar:{schemaVersion:1,title:'우리 반 고사 일정',sourceLabel:'담임 직접 등록',sourceDate:now,defaultMonth:now.slice(0,7),events:[]}};
  await env.DB.prepare('INSERT INTO rooms (id,payload,revision,recovery,created) VALUES (?,?,1,?,?)').bind(id,await seal(env,id,JSON.stringify(data)),await hash(recovery),Date.now()).run();const secret=await newDevice(env,id,r);return json({...snapshot({data,row:{revision:1}}),recoveryCode:recovery},201,{'Set-Cookie':cookie(secret)});
 }
 if((path==='/api/personal/connect'||path==='/api/personal/recover')&&method==='POST'){
  if(device)fail(409,'이미 연결된 출결함이 있습니다. 먼저 이 기기의 연결을 해제해 주세요.');await rate(r,env,'connect');const code=String(body.code||'').replace(/[\s-]/g,'').toLowerCase();if(!/^[a-f0-9]{32,48}$/.test(code))fail(400,'연결 코드 또는 복구 코드를 확인해 주세요.');const key=await hash(code);let room;
  if(path.endsWith('/connect')){const pair=await env.DB.prepare('DELETE FROM pairs WHERE hash = ? AND expires > ? RETURNING room').bind(key,Date.now()).first();room=pair?.room;}else{room=(await env.DB.prepare('SELECT id FROM rooms WHERE recovery = ?').bind(key).first())?.id;}
  if(!room)fail(400,'코드가 올바르지 않거나 만료되었습니다. 원래 기기에서 다시 발급해 주세요.');const secret=await newDevice(env,room,r);return json(snapshot(await read(env,room)),200,{'Set-Cookie':cookie(secret)});
 }
 if(path==='/api/notebook'&&method==='GET')return device?json(snapshot(await read(env,device.room))):json({authenticated:false});
 if(path==='/api/session'&&method==='GET')return json({configured:true,authenticated:!!device,notebookAuthenticated:!!device});
 if(!device)fail(401,'출결함을 만들거나 내 기기를 연결해 주세요.');
 if((path==='/api/notebook'&&body.action==='logout')||(path==='/api/session'&&method==='DELETE')){await env.DB.prepare('DELETE FROM devices WHERE hash = ?').bind(device.hash).run();return json({authenticated:false},200,{'Set-Cookie':cookie('',0)});}
 if(path==='/api/personal/pair'&&method==='POST'){await rate(r,env,'pair');const code=token(16);await env.DB.batch([env.DB.prepare('DELETE FROM pairs WHERE room = ? OR expires < ?').bind(device.room,Date.now()),env.DB.prepare('INSERT INTO pairs (hash,room,expires) VALUES (?,?,?)').bind(await hash(code),device.room,Date.now()+600000)]);return json({code,expiresAt:Date.now()+600000});}
 if(path==='/api/personal/devices'&&method==='GET'){const result=await env.DB.prepare('SELECT hash,label,created,expires FROM devices WHERE room = ? AND expires > ? ORDER BY created').bind(device.room,Date.now()).all();return json({devices:result.results.map(d=>({...d,current:d.hash===device.hash}))});}
 if(path==='/api/personal/devices'&&method==='DELETE'){if(body.id===device.hash)fail(400,'현재 기기는 아래 연결 해제를 이용해 주세요.');await env.DB.prepare('DELETE FROM devices WHERE hash = ? AND room = ?').bind(String(body.id),device.room).run();return json({ok:true});}
 if(path==='/api/personal/recovery'&&method==='POST'){const recovery=token(24);await env.DB.prepare('UPDATE rooms SET recovery = ? WHERE id = ?').bind(await hash(recovery),device.room).run();return json({recoveryCode:recovery});}
 if(path==='/api/personal/profile'&&method==='PATCH'){const p=profile(body.profile);return json(snapshot(await mutate(env,device.room,d=>{conflict(body.before,d.profile);if((d.records.length||d.students.length||d.calendar.events.length)&&(p.grade!==d.profile.grade||p.classNumber!==d.profile.classNumber))fail(400,'기록이 있는 동안에는 학년·반을 변경할 수 없습니다. 새 학년에는 별도 출결함을 만들어 주세요.');d.profile=p;})));}
 if(path==='/api/personal/backup'&&method==='GET'){const s=await read(env,device.room);return json({schema:'easy-attendance-personal-v1',exportedAt:new Date().toISOString(),data:s.data});}
 if(path==='/api/notebook'&&['POST','PATCH','DELETE'].includes(method)){
  const s=await mutate(env,device.room,d=>{
   if(method==='PATCH'){const rec=normalizeRecord(body.record);if(!/^[A-Za-z0-9_-]{1,100}$/.test(rec.id||''))fail(400,'기록 번호를 확인해 주세요.');inClass(rec.studentId,d.profile);const old=d.records.find(x=>x.id===rec.id);conflict(body.before,old);if(d.records.length>=2000&&!old)fail(413,'기록은 2,000건까지 저장할 수 있습니다.');rec.updatedAt=new Date().toISOString();d.records=old?d.records.map(x=>x.id===rec.id?rec:x):[rec,...d.records];}
   else if(method==='DELETE'){const old=d.records.find(x=>x.id===body.id);conflict(body.before,old);d.records=d.records.filter(x=>x.id!==body.id);}
   else if(body.action==='save-roster'){conflict(body.beforeStudents,d.students);const list=normalizeRoster(body.students);for(const x of list)inClass(x.studentId,d.profile);d.students=list;}
   else if(body.action==='save-experience-settings'){conflict(body.beforeSettings,d.experienceSettings);d.experienceSettings=normalizeExperienceSettings(body.settings);}
   else if(body.action==='save-parent-replies'){conflict(body.beforeReplies,d.parentReplies);d.parentReplies=normalizeParentReplies(body.replies);}
   else fail(400,'지원하지 않는 저장 요청입니다.');
  });return json(snapshot(s));
 }
 if(path==='/api/calendar'){
  const s=method==='GET'?await read(env,device.room):await mutate(env,device.room,d=>{if(method==='DELETE'){const target=d.calendar.events.find(x=>x.id===body.id);if(!target)return;conflict(body.before,target);const deletedAt=new Date().toISOString();d.calendar=parseDataset({...d.calendar,events:d.calendar.events.filter(x=>x.id!==body.id),deletedEvents:[...(Array.isArray(d.calendar.deletedEvents)?d.calendar.deletedEvents:[]),{event:target,deletedAt,deletedBy:d.profile.displayName}].slice(-200)});return;}if(method!=='PATCH')fail(405,'지원하지 않는 요청입니다.');const old=d.calendar.events.find(x=>x.id===body.event?.id);conflict(body.before,old);inClass(body.event?.studentId,d.profile);const next={...body.event,updatedAt:new Date().toISOString(),updatedBy:d.profile.displayName};d.calendar=parseDataset({...d.calendar,events:old?d.calendar.events.map(x=>x.id===next.id?next:x):[...d.calendar.events,next]});});return json({data:s.data.calendar,revision:s.row.revision,writable:true,profile:s.data.profile});
 }
 if(path==='/api/notebook-file'){
  if(!env.BUCKET)fail(503,'첨부파일 저장을 준비하고 있습니다.');
  if(method==='POST'){if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(body.mime)||typeof body.base64!=='string')fail(400,'사진 또는 PDF를 선택해 주세요.');let raw;try{raw=bytes(body.base64);}catch{fail(400,'파일 내용을 확인해 주세요.');}if(raw.length>3145728)fail(413,'첨부파일은 3MB 이하로 올려 주세요.');const id=crypto.randomUUID(),name=String(body.name||'첨부파일').slice(0,150);await env.BUCKET.put(`${device.room}/${id}`,await seal(env,device.room,raw),{customMetadata:{mime:body.mime,name:encodeURIComponent(name),size:String(raw.length)}});return json({attachment:{id,name,mime:body.mime,size:raw.length}});}
  if(method==='GET'){const id=url.searchParams.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))fail(400,'파일 번호를 확인해 주세요.');const f=await env.BUCKET.get(`${device.room}/${id}`);if(!f)fail(404,'파일이 없습니다.');return new Response(await unseal(env,device.room,await f.text()),{headers:{'Content-Type':f.customMetadata.mime,'Content-Disposition':`inline; filename*=UTF-8''${f.customMetadata.name}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}
 }
 fail(404,'요청한 기능이 없습니다.');
 }catch(e){if(!e.status)console.error('personal-storage-error',{name:e.name,code:e.code||'unknown'});return json({message:e.status?e.message:'저장 요청을 처리하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.'},e.status||400);}}