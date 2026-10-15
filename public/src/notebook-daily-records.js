import { emptyRecord, normalizeRecord, toNeisRows } from './notebook-model.js';
import { prepareExamNeis, examNeisEligibility } from './calendar-neis-model.js';
export const isExamRecord = r => /^exam-(?:3\d{4}-\d{4}-\d{2}-\d{2}|candidate-)/.test(r.id||'');
const signature=r=>JSON.stringify(toNeisRows([{...r,entryStatus:'pending',neisConfirmedDates:[]}]));
export function dailyExamRecords(events,username,students=[]) {
 const classId=/^[123]\d{2}$/.test(username||'')?username:'',ids=new Set(students.map(s=>s.studentId));
 const scoped=events.filter(e=>classId?e.studentId?.slice(0,3)===classId:ids.has(e.studentId));
 const clean=scoped.filter(e=>examNeisEligibility(e).ready&&!e.issues?.length);
 const records=clean.length?prepareExamNeis(clean).records:[];
 for(const e of scoped.filter(e=>!clean.includes(e)))records.push(normalizeRecord({...emptyRecord(),id:'exam-candidate-'+e.id,category:'attendance',studentId:e.studentId,studentName:e.name,classNumber:e.classNumber,number:Number(e.studentId.slice(3)),startDate:e.startDate,endDate:e.endDate,attendanceDates:[],attendanceType:'결석',reasonType:'출석인정',reason:e.university+' '+e.kind+' 응시',reviewStatus:'draft',note:'[대학별고사] '+(e.dateMode!=='single'?'개별 고사일 미확정':e.issues?.length?'증빙 확인 필요':'수업일 확인 필요')}));
 return records;
}
export function mergeDailyRecords(saved,exams) {
 if(!exams)return saved;
 const byId=new Map(saved.map(r=>[r.id,r]));
 return [...saved.filter(r=>!isExamRecord(r)),...exams.map(exam=>{const previous=byId.get(exam.id);return previous&&exam.reviewStatus==='reviewed'&&signature(previous)===signature(exam)?{...exam,entryStatus:previous.entryStatus,neisConfirmedDates:previous.neisConfirmedDates||[]}:exam;})];
}
