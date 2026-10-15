import { normalizeRecord, toNeisRows } from './notebook-model.js';
const keys=['recordId','category','studentId','studentName','classNumber','number','date','attendanceType','reasonType','periods','reason'];
/** Never apply an old helper receipt to an edited record, different student or date. */
export function applyNeisCompletion(input,receipts) {
  const record=normalizeRecord(input);
  const rows=toNeisRows([{...record,entryStatus:'pending',neisConfirmedDates:[]}]);
  const dates=new Set(record.neisConfirmedDates);
  if(record.entryStatus==='confirmed')for(const row of rows)dates.add(row.date);
  const acknowledged=[];
  for(const receipt of receipts) {
    if(receipt?.autoVerified!==true&&receipt?.manualConfirmed!==true)continue;
    if(typeof receipt?.completionId!=='string'||receipt.completionId.length>400||!receipt.row)continue;
    const expected=rows.find(row=>keys.every(key=>String(row[key]??'')===String(receipt.row[key]??'')));
    if(!expected||String(expected.lessonCount||0)!==String(receipt.row.lessonCount||0))continue;
    if(receipt.revoked===true&&receipt.manualConfirmed===true)dates.delete(expected.date);else dates.add(expected.date);acknowledged.push(receipt.completionId);
  }
  if(!acknowledged.length)return {record,acknowledged,changed:false};
  const next=normalizeRecord({...record,neisConfirmedDates:[...dates],entryStatus:rows.length&&rows.every(row=>dates.has(row.date))?'confirmed':'pending'});
  const changed=record.entryStatus!==next.entryStatus||JSON.stringify(record.neisConfirmedDates)!==JSON.stringify(next.neisConfirmedDates);
  return {record:next,acknowledged,changed};
}

