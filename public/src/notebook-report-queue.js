import { queueDateRecords } from './notebook-queue-date.js';
/** Export copies for a separate task. Never reset saved attendance completion. */
export function reportQueueRecords(records,date=''){
  return queueDateRecords(records.filter(record=>record.category==='attendance').map(record=>({...record,entryStatus:'pending',neisConfirmedDates:[]})),date);
}
