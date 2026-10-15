import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL을 설정한 뒤 실행하세요.');
const sql=neon(process.env.DATABASE_URL);
const statements=[
 'CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL,recovery TEXT NOT NULL UNIQUE,created BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS devices(hash TEXT PRIMARY KEY,room TEXT NOT NULL,label TEXT NOT NULL,created BIGINT NOT NULL,expires BIGINT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS devices_room_idx ON devices(room)',
 'CREATE TABLE IF NOT EXISTS pairs(hash TEXT PRIMARY KEY,room TEXT NOT NULL,expires BIGINT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires BIGINT NOT NULL)'
];
for(const statement of statements)await sql.query(statement,[]);
console.log('개인용 출결함 데이터베이스 준비 완료');
