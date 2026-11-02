import { isDate } from './model.js';
/** Attendance IDs include stable calendar references; attachment IDs remain UUID-only. */
export function validNotebookRecordId(value) {
 if(typeof value!=='string')return false;
 if(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))return true;
 // 확인 전 대학별고사 후보(교사가 ‘입력 완료’로 표시한 경우만 저장됨)
 if(/^exam-candidate-[A-Za-z0-9_.:-]{1,100}$/.test(value))return true;
 const exam=/^exam-(3\d{4})-(\d{4}-\d{2}-\d{2})$/.exec(value);
 return !!exam&&Number(exam[1].slice(1,3))>=1&&Number(exam[1].slice(1,3))<=10&&Number(exam[1].slice(3))>=1&&isDate(exam[2]);
}
