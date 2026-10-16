import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
let origin=process.env.APP_ORIGIN;
if(!origin&&process.env.VERCEL_PROJECT_PRODUCTION_URL)origin='https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL;
if(origin){const u=new URL(origin);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash)throw new Error('APP_ORIGIN은 https://앱주소 형식이어야 합니다.');origin=u.origin;
 for(const file of ['public/src/notebook-neis-bridge.js','neis-helper/notebook-bridge.js','neis-helper/bridge-core.js']){let t=await readFile(file,'utf8');t=t.replace(/((?:const NOTEBOOK_ORIGIN|const origin)\s*=\s*)'[^']+'/g,(_,prefix)=>prefix+JSON.stringify(origin));await writeFile(file,t);}
 const m=JSON.parse(await readFile('neis-helper/manifest.json','utf8'));m.content_scripts[0].matches=[origin+'/*'];await writeFile('neis-helper/manifest.json',JSON.stringify(m,null,2));
}else console.warn('배포 후 APP_ORIGIN에 최종 앱 주소를 설정하고 다시 배포하세요.');
// Align the visible download version with this personal helper package.
const helperManifest=JSON.parse(await readFile('neis-helper/manifest.json','utf8'));
const guidePath='public/src/notebook-neis-guide.js';
const guide=await readFile(guidePath,'utf8');
await writeFile(guidePath,guide.replace(/1\.0\.\d+/g,helperManifest.version));
// Create a portable ZIP using only Node built-ins, avoiding OS-specific zip tools.
const files=(await readdir('neis-helper')).filter(x=>!x.endsWith('test.mjs'));
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc=data=>{let n=0xffffffff;for(const b of data)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
const locals=[],central=[];let offset=0;
for(const file of files){const data=await readFile('neis-helper/'+file),name=Buffer.from('easy-attendance-personal-helper/'+file),sum=crc(data);const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(sum,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);locals.push(h,name,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(sum,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+data.length;}
const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);await mkdir('public/downloads',{recursive:true});await writeFile('public/downloads/easy-attendance-helper.zip',Buffer.concat([...locals,cd,end]));
if(process.env.DATABASE_URL)execFileSync(process.execPath,['scripts/setup-database.mjs'],{stdio:'inherit'});
console.log('Vercel 배포용 정적 화면·개인용 도우미 준비 완료');
