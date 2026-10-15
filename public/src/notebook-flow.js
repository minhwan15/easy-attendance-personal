import { readiness, toNeisRows } from './notebook-model.js';
import { recordsForDateDisplay } from './notebook-queue-date.js';
export function todayAttendance(records,date){
 const rows=recordsForDateDisplay(records.filter(r=>['attendance','experience'].includes(r.category)),date);
 return {rows,counts:Object.fromEntries(['결석','지각','조퇴'].map(type=>[type,rows.filter(r=>r.attendanceType===type).length])),pending:rows.filter(r=>r.entryStatus!=='confirmed').length};
}
export function attendanceStep(record,sent=false){
 if(record.entryStatus==='confirmed')return '나이스 입력 완료';
 if(!readiness(record).ready)return '작성 중';
 return sent?'도우미로 보냄 · 나이스 미입력':'나이스 미입력';
}
export function nextAttendanceAction(record){
 if(/^exam-/.test(record.id||''))return {label:'고사일·증빙 확인',field:'exam'};
 if(record.attendanceType==='지각'&&!record.periods&&record.note?.startsWith('[아침 출결 메모]'))return {label:'등교 시각 입력',field:'arrival'};
 if(!record.studentId||!record.studentName)return {label:'학생 확인',field:'studentName'};
 if(!record.startDate)return {label:'출결일 입력',field:'startDate'};
 if(record.category==='experience'){
  if(record.applicationStatus!=='received')return {label:'신청서 접수 확인',field:'applicationStatus'};
 }
 if(record.attendanceType!=='결석'&&!record.periods)return {label:'빠진 교시 입력',field:'periods'};
 if(!record.reason)return {label:'출결 사유 입력',field:'reason'};
 return {label:'내용 확인·저장',field:'reason'};
}
