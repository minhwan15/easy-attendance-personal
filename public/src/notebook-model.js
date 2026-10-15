import { isDate, isIsoTimestamp, todaySeoul } from './model.js';
import { schoolPeriodsForDate, formatSchoolPeriods } from './school-timetable.js';

export const NOTEBOOK_CATEGORIES = ['attendance', 'experience', 'counseling', 'activity'];
export const ATTENDANCE_TYPES = ['결석', '지각', '조퇴', '결과'];
export const REASON_TYPES = ['질병', '미인정', '기타', '출석인정'];
const enums = {
  category: NOTEBOOK_CATEGORIES,
  attendanceType: ['', ...ATTENDANCE_TYPES], reasonType: ['', ...REASON_TYPES],
  sourceType: ['memo', 'capture', 'application', 'report'],
  applicationStatus: ['missing', 'received'], approvalStatus: ['pending', 'approved', 'rejected', 'cancelled'],
  reportStatus: ['missing', 'received', 'reviewed'],
  reviewStatus: ['draft', 'reviewed'], entryStatus: ['pending', 'confirmed'],
  passKind: ['', 'outing', 'early'],
};
const limits = { id: 100, studentId: 5, studentName: 40, startDate: 10, endDate: 10,
  periods: 100, reason: 2000, note: 10000, sourceText: 30000, reportDueDate: 10, location: 300,
  departureTime: 5, returnTime: 5, actualReturnTime: 5, teacherName: 40, passIssuedAt: 30 };
const labels = { id:'기록 식별자', studentId:'학번', studentName:'학생 이름', startDate:'시작일', endDate:'종료일',
  periods:'교시', reason:'나이스 입력 내용', note:'교사 메모', sourceText:'원문', reportDueDate:'보고서 제출 기한', location:'장소',
  departureTime:'출발 시각', returnTime:'복귀 예정 시각', actualReturnTime:'실제 복귀 시각', teacherName:'담임교사', passIssuedAt:'발급 시각' };
const clean = value => typeof value === 'string' ? value.trim() : '';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const unique = values => [...new Set(values)];
const validStudentId = value => /^[1-3]\d{4}$/.test(value) && Number(value.slice(1,3)) > 0 && Number(value.slice(3)) > 0;

/** A draft is deliberately empty: reading a document never approves it. */
export function emptyRecord() {
  return { id:'', category:'attendance', studentId:'', studentName:'', classNumber:'', number:'',
    startDate:'', endDate:'', lessonCount:0, attendanceType:'', reasonType:'', periods:'', reason:'', note:'',
    sourceText:'', sourceType:'memo', attachments:[], applicationStatus:'missing', approvalStatus:'pending',
    reportStatus:'missing', reportDueDate:'', location:'', attendanceDates:[], neisConfirmedDates:[], experienceDayStatuses:{}, reviewStatus:'draft', entryStatus:'pending',
    passKind:'', departureTime:'', returnTime:'', actualReturnTime:'', teacherName:'', passIssuedAt:'' };
}

/** Shared client/server validation. Empty draft fields are allowed; malformed fields are not. */
export function normalizeRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('기록 형식을 확인해 주세요.');
  const record = emptyRecord();
  if(own(input,'lessonCount')&&![0,1,2,3,4,5,6,7,8,'0','1','2','3','4','5','6','7','8'].includes(input.lessonCount))throw new Error('수업 교시 수는 기본 시간표 또는 1~8교시를 선택해 주세요.');
  record.lessonCount=Number(input.lessonCount||0);
  for (const [key, max] of Object.entries(limits)) {
    if (own(input,key) && typeof input[key] !== 'string') throw new Error(`${labels[key]} 형식을 확인해 주세요.`);
    record[key] = clean(input[key]);
    if (record[key].length > max) throw new Error(`${labels[key]}은 ${max}자 이내로 입력해 주세요.`);
  }
  if (record.id && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(record.id)) throw new Error('기록 식별자를 확인해 주세요.');
  for (const [key, values] of Object.entries(enums)) {
    if (own(input,key)) {
      if (typeof input[key] !== 'string' || !values.includes(input[key])) throw new Error('기록의 구분·처리 상태를 확인해 주세요.');
      record[key] = input[key];
    }
  }
  for (const field of ['classNumber', 'number']) {
    const value = input[field];
    if (value === undefined || value === '') continue;
    if (!['number','string'].includes(typeof value) || !/^\d{1,2}$/.test(String(value)) || Number(value) < 1 || Number(value) > 99) throw new Error('반과 번호는 1~99 사이의 정수로 입력해 주세요.');
    record[field] = Number(value);
  }
  if (record.studentId) {
    if (!validStudentId(record.studentId)) throw new Error('학번은 학년·반·번호로 이루어진 다섯 자리로 입력해 주세요.');
    const classNumber = Number(record.studentId.slice(1,3)), number = Number(record.studentId.slice(3));
    if ((record.classNumber && record.classNumber !== classNumber) || (record.number && record.number !== number)) throw new Error('학번의 반·번호와 입력한 반·번호가 일치하지 않습니다.');
    record.classNumber = classNumber; record.number = number;
  }
  for (const field of ['startDate','endDate','reportDueDate']) {
    if (record[field] && !isDate(record[field])) throw new Error(`${labels[field]}의 실제 날짜를 확인해 주세요.`);
  }
  if (record.startDate && record.endDate && record.startDate > record.endDate) throw new Error('종료일은 시작일보다 빠를 수 없습니다.');
  for (const field of ['departureTime','returnTime','actualReturnTime']) {
    if (record[field] && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(record[field])) throw new Error(`${labels[field]}을 확인해 주세요.`);
  }
  if (/[\r\n\0]/.test(record.teacherName)) throw new Error('담임교사 이름을 한 줄로 입력해 주세요.');
  if (record.passIssuedAt && !isIsoTimestamp(record.passIssuedAt)) throw new Error('발급 시각을 확인해 주세요.');
  if (record.passKind && record.category!=='attendance') throw new Error('외출·조퇴증은 출결 기록으로 저장해 주세요.');
  if (record.passIssuedAt && !record.passKind) throw new Error('외출증 또는 조퇴증을 선택해 주세요.');
  if (own(input,'attendanceDates') && (!Array.isArray(input.attendanceDates) || input.attendanceDates.length > 366 || !input.attendanceDates.every(isDate))) throw new Error('확정한 출결 날짜를 확인해 주세요.');
  record.attendanceDates = unique(input.attendanceDates || []).sort();
  if (record.attendanceDates.some(date => (record.startDate && date < record.startDate) || (record.endDate && date > record.endDate))) throw new Error('확정한 출결 날짜는 입력한 기간 안에 있어야 합니다.');
  if (own(input,'neisConfirmedDates') && (!Array.isArray(input.neisConfirmedDates) || input.neisConfirmedDates.length>366 || !input.neisConfirmedDates.every(isDate))) throw new Error('나이스 저장 확인 날짜를 확인해 주세요.');
  record.neisConfirmedDates=unique(input.neisConfirmedDates||[]).sort();
  const inputDates=record.attendanceDates.length?record.attendanceDates:[record.startDate];
  if(record.neisConfirmedDates.some(date=>!inputDates.includes(date)))throw new Error('나이스 저장 확인 날짜는 출결 처리 날짜 안에 있어야 합니다.');
  if (own(input,'experienceDayStatuses')) {
    const statuses=input.experienceDayStatuses;
    if (!statuses || typeof statuses!=='object' || Array.isArray(statuses) || Object.keys(statuses).length>366
      || Object.entries(statuses).some(([date,status])=>!isDate(date) || !record.attendanceDates.includes(date) || !['application','report'].includes(status))) throw new Error('체험학습 날짜별 신청·보고서 상태를 확인해 주세요.');
    if (Object.keys(statuses).length && record.category!=='experience') throw new Error('날짜별 신청·보고서 상태는 체험학습에만 입력할 수 있습니다.');
    record.experienceDayStatuses=Object.fromEntries(Object.entries(statuses).sort(([a],[b])=>a.localeCompare(b)));
  }
  if (own(input,'attachments') && (!Array.isArray(input.attachments) || input.attachments.length > 10)) throw new Error('첨부파일은 기록당 10개까지 등록할 수 있습니다.');
  const attachmentIds = new Set();
  record.attachments = (input.attachments || []).map(file => {
    if (!file || typeof file !== 'object' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(file.id || '') || attachmentIds.has(file.id)
      || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 250
      || !['image/png','image/jpeg','image/webp','application/pdf'].includes(file.mime)
      || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > 3*1024*1024) throw new Error('첨부파일의 형식·크기·식별자를 확인해 주세요.');
    attachmentIds.add(file.id);
    return { id:file.id, name:file.name.trim(), mime:file.mime, size:file.size };
  });
  if (own(input,'updatedAt')) {
    if (!isIsoTimestamp(input.updatedAt)) throw new Error('기록 수정 시각을 확인해 주세요.');
    record.updatedAt = input.updatedAt;
  }
  if(record.category==='attendance'&&record.attendanceType==='조퇴'&&record.reasonType==='미인정'&&record.note.startsWith('[예체능 미인정 조퇴]')){
    if(record.reason!=='대입실기준비'){record.entryStatus='pending';record.neisConfirmedDates=[];}
    record.reason='대입실기준비';
  }
  return record;
}

function dateFrom(year, month, day) {
  const value = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return isDate(value) ? value : '';
}
const DATE_TOKEN = /(?:(\d{4})\s*(?:[.\/-]|년)\s*)?(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*(?:일|\.))?/g;

/** Read explicit calendar dates; preserve ambiguity instead of expanding a period into absences. */
function extractDates(text, referenceDate, {allowRelative=true}={}) {
  const matches = [], warnings = [], year = isDate(referenceDate) ? Number(referenceDate.slice(0,4)) : null;
  for (const match of text.matchAll(DATE_TOKEN)) {
    const before = text.slice(Math.max(0,match.index-1),match.index), after = text.slice(match.index+match[0].length,match.index+match[0].length+1);
    if (/\d/.test(before) || /\d/.test(after)) continue;
    const explicitYear = match[1] ? Number(match[1]) : null;
    if (!explicitYear && !year) { warnings.push('연도가 없는 날짜는 기준 날짜를 먼저 지정해 주세요.'); continue; }
    const date = dateFrom(explicitYear || year, Number(match[2]), Number(match[3]));
    if (!date) { warnings.push(`실제 달력에 없는 날짜입니다: ${match[0].trim()}`); continue; }
    matches.push({date, index:match.index, end:match.index+match[0].length, inferredYear:!explicitYear});
    if (!explicitYear) warnings.push(`연도가 생략된 날짜는 기준 연도 ${year}년으로 정리했습니다. 연도를 확인해 주세요.`);
  }
  // An explicitly written abbreviated end day shares the start month/year; it is not a duration count.
  if (matches.length === 1) {
    const first = matches[0], tail = text.slice(first.end);
    const shortEnd = /^\s*(?:~|～|〜|–|—|부터\s*)\s*(\d{1,2})(?:\s*일)?(?:\s*까지)?(?![\d.\/-])/.exec(tail);
    if (shortEnd) {
      const end = dateFrom(Number(first.date.slice(0,4)),Number(first.date.slice(5,7)),Number(shortEnd[1]));
      if (!end || end < first.date) warnings.push('생략된 종료 월·연도가 불분명합니다. 종료일을 직접 확인해 주세요.');
      else matches.push({date:end,index:first.end+shortEnd.index,end:first.end+shortEnd[0].length,inferredYear:first.inferredYear,shortEnd:true});
    }
  }
  if (!matches.length && isDate(referenceDate) && allowRelative) {
    const relative = [...text.matchAll(/오늘|내일|모레|어제/g)];
    if (unique(relative.map(x=>x[0])).length === 1) {
      const offset = {오늘:0,내일:1,모레:2,어제:-1}[relative[0][0]];
      const date = new Date(referenceDate+'T00:00:00Z'); date.setUTCDate(date.getUTCDate()+offset);
      matches.push({date:date.toISOString().slice(0,10),index:relative[0].index,end:relative[0].index+2,inferredYear:false});
      warnings.push(`‘${relative[0][0]}’은 기준 날짜 ${referenceDate}로 계산했습니다. 실제 날짜를 확인해 주세요.`);
    } else if (relative.length) warnings.push('서로 다른 상대 날짜가 있습니다. 해당 날짜를 직접 선택해 주세요.');
  }
  return {matches,warnings};
}

function rosterStudents(students) {
  if (!Array.isArray(students)) return [];
  const map = new Map();
  for (const student of students) {
    const studentId = clean(student?.studentId), studentName = clean(student?.studentName || student?.name);
    if (validStudentId(studentId) && studentName) map.set(`${studentId}|${studentName}`,{studentId,studentName,classNumber:Number(studentId.slice(1,3)),number:Number(studentId.slice(3))});
  }
  return [...map.values()];
}
const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const containsName = (text,name) => new RegExp(`(^|[^가-힣A-Za-z])${escapePattern(name)}(?=$|[^가-힣A-Za-z]|(?:이가|이는|이도|은|는|이|가|의|과|와|랑|학생))`).test(text);
const containsGivenName = (text,name) => name.length >= 3 && new RegExp(`(^|[^가-힣A-Za-z])${escapePattern(name.slice(1))}(?:이가|이는|이도|가|는|은|이)(?=$|[\\s,.!?]|[가-힣])`).test(text);
const parentNamePattern=/(?:^|[\s,.;!?])([가-힣]{2,10})\s*학생(?:의)?\s*(?:엄마|어머니|아빠|아버지|보호자)/g;
const parentMessage=text=>[...text.matchAll(parentNamePattern)].length>0||/선생님\s*안녕|안녕하세요\s*선생님|(?:엄마|어머니|아버지|보호자)\s*입니다/.test(text);

/** Editable suggestions from the reported symptoms and the parent's intended school attendance. */
function attendanceContext(text) {
  const compact=text.replace(/\s+/g,'');
  const illness=/병원|진료|아프|아파|아픈|아팠|통증|감기|발열|열증상|열이(?:나|있|높)|고열|미열|배탈|몸살|두통|복통|구토|설사|기침|다쳤|다쳐|다친|장염|독감|생리통|해열제/.test(compact);
  const intents=[];
  const patterns={
    '결석':[
      /(?:집|자택)(?:에서|에)[^.!?\n]{0,35}?(?:쉬겠|쉬[어여]야|쉬려고|쉴|쉬었|쉬고|쉬도록)/g,
      /(?:오늘|내일|금일|하루)(?:은|는|도|까지|만|하루)?\s*(?:좀\s*)?(?:쉬겠|쉬[어여]야|쉬려고|쉴|쉬었|쉬고)/g,
      /(?:^|[\s,.!?])(?:좀\s*)?쉬겠(?:습니다|어요)/g,
      /결석\s*(?:을\s*)?(?:하겠|합니다|할게|해야|했|입니다|신청하|쓰겠|쓰려고|하겠습니다)/g,
      /(?:등교(?:를)?|학교(?:에)?|학교를)\s*(?:못\s*(?:하|해|갈|가|갈것)|하지\s*못|하지\s*않|가지\s*못)/g,
    ],
    '지각':[
      /늦게\s*(?:등교|보내|보낼|가겠|갈게|갑니)/g,
      /(?:병원|진료)[^.!?\n]{0,40}?(?:들렀다|들렸다|갔다|다녀|받고|받은\s*후|마친\s*후|후)[^.!?\n]{0,30}?(?:보내|보낼|등교|학교에\s*가)/g,
      /지각\s*(?:을\s*)?(?:하겠|합니다|할게|해야|했|입니다)/g,
    ],
    '조퇴':[/조퇴\s*(?:를\s*)?(?:하겠|합니다|할게|해야|했|입니다|시키|하겠습니다)/g],
  };
  // OCR line breaks are layout, so use a space-normalized copy without changing token order.
  const message=text.replace(/\s+/g,' ');
  for(const [type,expressions]of Object.entries(patterns))for(const expression of expressions)for(const match of message.matchAll(expression)) {
    if(/(?:않|안\s*하|취소)/.test(message.slice(match.index+match[0].length,match.index+match[0].length+8)))continue;
    const before=message.slice(Math.max(0,match.index-120),match.index+match[0].length);
    if(type==='결석'&&(/(?:학교|보건실)에서\s*(?:좀\s*)?쉬/.test(match[0])||/(?:학교|보건실)에서\s*$/.test(message.slice(Math.max(0,match.index-12),match.index))))continue;
    const relative=[...before.matchAll(/오늘|내일|모레|어제|금일/g)].at(-1)?.[0]||'';
    intents.push({type,index:match.index+match[0].length,relative:relative==='금일'?'오늘':relative});
  }
  // Later wording reflects a changed plan: hospital then home is absence, hospital then school is late arrival.
  intents.sort((a,b)=>a.index-b.index);
  const last=intents.at(-1);
  const symptoms=[];
  if(/생리\s*(?:통|결석)/.test(text))symptoms.push('생리통');
  else {
    if(/허리[^.!?]{0,18}(?:아프|아파|아픈|통증)|허리통증/.test(compact))symptoms.push('허리 통증');
    if(/복통|배(?:가|를)?[^.!?]{0,18}(?:아프|아파|아픈|통증)|배탈/.test(compact))symptoms.push('복통');
    if(/감기/.test(compact))symptoms.push('감기');
    if(/발열|열증상|고열|미열|열이(?:나|있|높)/.test(compact))symptoms.push('발열');
    for(const symptom of ['두통','몸살','구토','설사','기침','장염','독감'])if(compact.includes(symptom))symptoms.push(symptom);
  }
  const reason=symptoms.join('·')||(illness?(/병원|진료/.test(compact)?'병원 진료':'건강 이상'):'');
  return {illness,reason,type:last?.type||'',relative:last?.relative||'',intent:!!last};
}
function menstrualContext(text) {
  const mentioned=/생리\s*(?:통|결석)/.test(text);
  const followup=/(?:신고서|신청서|서류|제출|올라오)/.test(text);
  const intent=/(?:결석\s*(?:을\s*)?(?:쓰|사용|하겠|합니다|할게|해야|했|입니다|신청하)|(?:오늘|내일|금일|하루)[\s\S]{0,50}집에서\s*(?:쉬|쉴)|등교(?:를)?\s*(?:못|하지\s*못|하지\s*않)|학교(?:에)?\s*(?:못|가지\s*못))/.test(text);
  const absence=mentioned&&(intent||(!followup&&/생리\s*결석/.test(text)));
  return {mentioned,absence,followup,intent};
}

/** “3교시까지 수업” is attended time; only the following lessons are missed. */
function attendancePeriods(text,date) {
  const tokens=[...text.matchAll(/조회\s*(?:~|[-–]|부터)\s*(?:[1-9]\d?\s*교시|종례)(?:\s*까지)?|[1-9]\d?\s*(?:교시\s*)?(?:~|[-–]|부터)\s*종례(?:\s*까지)?|[1-9]\d?\s*(?:교시\s*)?(?:~|[-–]|부터)\s*[1-9]\d?\s*교시(?:\s*까지)?|[1-9]\d?\s*교시(?:\s*까지)?/g)];
  const explicit=[], hints=[];
  for(const token of tokens) {
    const value=token[0].replace(/\s/g,''), single=/^([1-7])교시(까지)?$/.exec(value);
    if(!single) { explicit.push(value); continue; }
    const tail=text.slice(token.index+token[0].length).replace(/\s/g,'');
    const after=single[2]
      ? /^(?:(?:수업|공부)(?:을)?)?(?:다하고|하고|듣고|마치고|끝내고|한후|들은후|마친후|끝낸후)(?:[가-힣]{1,20}?(?:때문에|으로|로|해서|하여|가려고))?(?:바로)?조퇴/.exec(tail)
      : /^(?:를|수업(?:을)?)?(?:끝나고|끝난후|마치고|마친후|종료후|이후|후)(?:[가-힣]{1,20}?(?:때문에|으로|로|해서|하여|가려고))?(?:바로)?조퇴/.exec(tail);
    const during=!single[2]&&/^(?:수업)?(?:부터|도중|중)(?:에)?(?:[가-힣]{1,20}?(?:때문에|으로|로|해서|하여|가려고))?(?:바로)?조퇴/.exec(tail);
    const late=!single[2]&&/^(?:부터|시작부터|시작에)(?:정상)?(?:등교|출석|수업참여)/.exec(tail);
    const lateDuring=!single[2]&&/^(?:수업)?(?:도중|중)(?:에)?(?:등교|출석)/.exec(tail);
    const phrase=after||during||late||lateDuring;
    if(!phrase) { explicit.push(value); continue; }
    const clause=text.slice(0,token.index).split(/[.!?\n]/).at(-1).replace(/\s/g,'');
    const following=tail.slice(phrase[0].length,phrase[0].length+35);
    const blocked=/(?:만약|예를들어|예시|가정)/.test(clause)
      || /^(?:를|는)?(?:안(?:하|해|했|할)|하지않|하지못|하지마|취소|아니|가아니)/.test(following)
      || /^(?:를|는)?(?:하면|한다면|했다면|했으면|할경우|할때|할수있|하려다가|하려다|하려고했지만)/.test(following);
    hints.push({first:Number(single[1])+(after?1:0),last:Number(single[1])-(late?1:0),kind:late||lateDuring?'late':'early',blocked});
  }
  const allowed=hints.filter(hint=>!hint.blocked), starts=unique(allowed.map(hint=>`${hint.kind}:${hint.kind==='late'?hint.last:hint.first}`));
  const scheduled=schoolPeriodsForDate(date), hint=allowed[0];
  // An explicit missed-period range remains the teacher's more precise instruction.
  const periods=explicit.length?unique(explicit).join(', '):starts.length===1&&scheduled.length
    ? formatSchoolPeriods(hint.kind==='late'?['조회',...scheduled.filter(period=>period.period<=hint.last).map(period=>period.period)]:[...scheduled.filter(period=>period.period>=hint.first).map(period=>period.period),'종례']) : '';
  return {periods,early:allowed.some(hint=>hint.kind==='early'),late:allowed.some(hint=>hint.kind==='late'),blocked:hints.length>0&&!allowed.length,ambiguous:starts.length>1,unavailable:allowed.length>0&&!scheduled.length};
}

/** Conservative text assistance, not OCR or AI. Returns a draft for explicit teacher review. */
export function parseSourceText(value, {referenceDate = todaySeoul(), students = [], messageDate = '', sourceType = 'memo'} = {}) {
  const text = clean(value);
  if (text.length > limits.sourceText) throw new Error('원문은 30000자 이내로 입력해 주세요.');
  const fields = {sourceText:text, reviewStatus:'draft', entryStatus:'pending'}, warnings = [];
  if (!text) return {fields,warnings:['정리할 메모 또는 문서에서 읽은 글을 입력해 주세요.']};
  if (!isDate(referenceDate)) warnings.push('기준 날짜를 확인해 주세요. 연도가 생략된 날짜는 정리하지 않았습니다.');
  const roster = rosterStudents(students);
  const identityText=text.replace(/(?<!\d)(?:\+82[ .-]?)?0?(?:1[016789]|2|[3-6]\d)[ .-]?\d{3,5}[ .-]?\d{4}(?!\d)/g,' ');
  const ids = unique([...identityText.matchAll(/(?<![\d-])([1-3]\d{4})(?![\d-])/g)].map(m=>m[1]).filter(validStudentId));
  const parentNames=unique([...text.matchAll(parentNamePattern)].map(m=>m[1]).filter(name=>!['우리','저희','해당','담당'].includes(name)));
  const exactIdentified = roster.filter(s => ids.includes(s.studentId) || containsName(text,s.studentName) || parentNames.includes(s.studentName));
  const identified = exactIdentified.length ? exactIdentified : roster.filter(s=>containsGivenName(text,s.studentName));
  const identityIds = unique([...ids,...identified.map(s=>s.studentId)]);
  const classes = [...text.matchAll(/(?:(\d)\s*학년\s*)?(\d{1,2})\s*반\s*(\d{1,2})\s*번/g)].map(m=>({grade:m[1] || '',classNumber:Number(m[2]),number:Number(m[3]),end:m.index+m[0].length}));
  const labelNames = unique([...text.matchAll(/(?:학생명|성명|이름|학생\s*성명)\s*[:：]?\s*([가-힣]{2,10})(?=\s|$|[,;])/g)].map(m=>m[1]).concat(parentNames));
  const classKeys = unique(classes.map(x=>`${x.grade}|${x.classNumber}|${x.number}`));
  let identityAmbiguous = identityIds.length > 1 || labelNames.length > 1 || classKeys.length > 1;
  if (!identityAmbiguous && identityIds.length === 1) {
    const id = identityIds[0], known = roster.filter(s=>s.studentId===id);
    const names = unique(known.map(s=>s.studentName));
    const classMatch = classes[0];
    if (names.length > 1 || (classMatch && (classMatch.classNumber !== Number(id.slice(1,3)) || classMatch.number !== Number(id.slice(3)) || (classMatch.grade && classMatch.grade !== id[0]))) || (labelNames.length && names.length && labelNames[0] !== names[0])) identityAmbiguous = true;
    else {
      fields.studentId=id; fields.classNumber=Number(id.slice(1,3)); fields.number=Number(id.slice(3));
      const inline = new RegExp(`${id}\\s+([가-힣]{2,10})(?=\\s|$|[,;])`).exec(text);
      const candidate = labelNames[0] || names[0] || inline?.[1];
      if (candidate && !/^(결석|지각|조퇴|결과|학생|체험학습|신청서|보고서)$/.test(candidate)) fields.studentName=candidate;
    }
  } else if (!identityAmbiguous && classes.length) {
    const one = classes[0]; fields.classNumber=one.classNumber; fields.number=one.number;
    if (one.grade && validStudentId(`${one.grade}${String(one.classNumber).padStart(2,'0')}${String(one.number).padStart(2,'0')}`)) fields.studentId=`${one.grade}${String(one.classNumber).padStart(2,'0')}${String(one.number).padStart(2,'0')}`;
    const inline = /^\s*([가-힣]{2,10})(?=\s|$|[,;])/.exec(text.slice(one.end));
    const candidate = labelNames[0] || inline?.[1];
    if (candidate && !/^(결석|지각|조퇴|결과|학생|체험학습|신청서|보고서)$/.test(candidate)) fields.studentName=candidate;
    if (!fields.studentId) warnings.push('학년이 없어 학번을 만들지 않았습니다. 학생을 선택해 주세요.');
  } else if (!identityAmbiguous && labelNames.length===1) fields.studentName=labelNames[0];
  if (identityAmbiguous) {
    for (const key of ['studentId','studentName','classNumber','number']) delete fields[key];
    warnings.push('여러 학생 또는 서로 다른 학생 정보가 있습니다. 학생별로 나누어 확인해 주세요.');
  } else if (!fields.studentId) warnings.push('학번을 확인하지 못했습니다. 해당 학생을 직접 선택해 주세요.');

  const isExperience = /체험\s*학습|교외\s*체험|가정\s*학습/.test(text);
  if (isExperience) {
    fields.category='experience';
    if (/보고서/.test(text) && !/신청서/.test(text)) fields.sourceType='report';
    else if (/신청서/.test(text) && !/보고서/.test(text)) fields.sourceType='application';
    if (/신청서/.test(text) && /보고서/.test(text)) warnings.push('신청서와 보고서가 함께 언급되었습니다. 문서 종류와 제출 상태를 각각 확인해 주세요.');
  } else if (/상담/.test(text)) fields.category='counseling';
  else if (/자율\s*활동|진로\s*활동|창체|봉사\s*활동/.test(text)) fields.category='activity';
  else fields.category='attendance';
  const types = ATTENDANCE_TYPES.filter(type=>new RegExp(type==='결과'?'(?:출결\\s*[:：]?\\s*결과|[1-9]\\s*교시\\s*결과)':'(?<![가-힣])'+type+'(?![가-힣])').test(text));
  if (types.length===1) fields.attendanceType=types[0];
  else if (types.length>1) warnings.push('출결 구분이 여러 개입니다. 하나의 기록으로 확정하지 않았습니다.');
  const reasons = REASON_TYPES.filter(type=>text.includes(type) || (type==='질병' && /병결/.test(text)) || (type==='미인정' && /무단/.test(text)));
  if (reasons.length===1) fields.reasonType=reasons[0];
  else if (reasons.length>1) warnings.push('출결 사유 구분이 여러 개입니다. 증빙을 확인해 주세요.');
  if (/병결|무단결석/.test(text) && !fields.attendanceType && types.length===0) fields.attendanceType='결석';
  const periodSuggestion=attendancePeriods(text,referenceDate);
  const sourceLines=text.split(/\r?\n/);
  const reasonLabel=/^(?:(?:결석|지각|조퇴|결과|출결)\s*사유|사유|체험\s*학습\s*목적|목적|나이스\s*입력\s*내용)(?:[ \t]*[:：][ \t]*|[ \t]+|$)(.*)$/;
  const reasonValues=[];
  for(let index=0;index<sourceLines.length;index++) {
    const match=reasonLabel.exec(sourceLines[index].trim());
    if(!match)continue;
    let value=match[1].trim();
    if(!value) {
      const next=sourceLines.slice(index+1).map(line=>line.trim()).find(Boolean)||'';
      // A label on its own may have its value on the next line, but never borrow another field heading.
      if(next&&!reasonLabel.test(next)&&!/^(?:학번|성명|학생명|학년|반|번호|시작일|종료일|기간|체험\s*기간|신청일|장소|보호자|신청자|제출\s*기한)(?:[ \t]*[:：]|[ \t]+|$)/.test(next))value=next;
    }
    if(value)reasonValues.push(value);
    else warnings.push('사유·목적 항목의 내용이 비어 있거나 불분명합니다. 입력 내용을 확인해 주세요.');
  }
  const distinctReasons=unique(reasonValues);
  if(distinctReasons.length===1)fields.reason=distinctReasons[0].slice(0,limits.reason);
  else if(distinctReasons.length>1)warnings.push('서로 다른 사유·목적이 적혀 있습니다. 나이스에 입력할 내용을 직접 확인해 주세요.');
  const menstrual=menstrualContext(text);
  const attendance=attendanceContext(text);
  if(fields.category==='attendance') {
    if(attendance.type&&types.length<=1)fields.attendanceType=attendance.type;
    if(periodSuggestion.early&&types.length<=1&&(!fields.attendanceType||fields.attendanceType==='조퇴'))fields.attendanceType='조퇴';
    if(periodSuggestion.late&&types.length<=1&&(!fields.attendanceType||fields.attendanceType==='지각'))fields.attendanceType='지각';
    if(periodSuggestion.blocked&&['조퇴','지각'].includes(fields.attendanceType))delete fields.attendanceType;
    if(periodSuggestion.ambiguous)warnings.push('조퇴 시작 교시가 서로 다르게 적혀 있습니다. 실제 빠진 교시를 선택해 주세요.');
    if(attendance.illness&&!fields.reasonType)fields.reasonType='질병';
    if(!fields.reason&&distinctReasons.length===0&&attendance.reason)fields.reason=attendance.reason;
  }
  if(menstrual.mentioned) {
    // This is a reviewed-by-teacher candidate, never an automatic approval or a disease classification.
    fields.reasonType='출석인정';
    fields.approvalStatus='pending';
    if(!fields.reason&&distinctReasons.length===0)fields.reason='생리통';
    if(menstrual.absence&&types.length===0)fields.attendanceType='결석';
    if(!menstrual.absence&&!fields.attendanceType)warnings.push('생리통 언급만으로 결석을 확정하지 않았습니다. 실제 결석·지각·조퇴 여부를 확인해 주세요.');
  }
  const locations=unique(sourceLines.map(line=>/^(?:장소|방문지|목적지)(?:[ \t]*[:：][ \t]*|[ \t]+)(.+)$/.exec(line.trim())?.[1]?.trim()).filter(Boolean));
  if(locations.length===1)fields.location=locations[0].slice(0,limits.location);
  else if(locations.length>1)warnings.push('서로 다른 장소가 적혀 있습니다. 체험학습 장소를 직접 확인해 주세요.');

  const dueLines = text.split(/\n/).filter(line=>/(?:보고서\s*)?제출\s*(?:기한|마감)|보고서\s*기한/.test(line));
  const dueDates = dueLines.flatMap(line=>extractDates(line,referenceDate).matches.map(x=>x.date));
  if (unique(dueDates).length===1) fields.reportDueDate=dueDates[0];
  else if (dueDates.length) warnings.push('보고서 제출 기한이 여러 개입니다. 기한을 직접 확인해 주세요.');
  const mainLines = text.split(/\n/).filter(line=>!dueLines.includes(line));
  const periodLines = mainLines.filter(line=>/^(?:체험\s*(?:학습\s*)?기간|학습\s*기간|출결\s*(?:일자|기간)|결석\s*기간|기간|일시)(?:[ \t]*[:：]|[ \t]+|$)/.test(line.trim()));
  let target = periodLines.length===1 ? periodLines[0] : mainLines.join('\n');
  const allowRelative=(sourceType!=='capture'&&!parentMessage(text))||isDate(messageDate);
  // “Yesterday was fine, today staying home” refers to today; historical symptoms are not absence dates.
  if(allowRelative&&attendance.relative&&!extractDates(target,referenceDate,{allowRelative:false}).matches.length)target=attendance.relative;
  else if(isDate(messageDate)&&attendance.intent&&!/오늘|내일|모레|어제|금일/.test(target)&&!extractDates(target,referenceDate,{allowRelative:false}).matches.length)target=messageDate;
  const dates = extractDates(target,isDate(messageDate)?messageDate:referenceDate,{allowRelative}); warnings.push(...dates.warnings);
  if(!allowRelative&&/오늘|내일|모레|어제/.test(target))warnings.push('문자의 ‘오늘’은 문자 작성일을 확인한 뒤 정리해야 합니다. 현재 날짜로 바꾸지 않았습니다.');
  const dateValues = unique(dates.matches.map(m=>m.date));
  if (dates.matches.length===2 && dateValues.length===2) {
    const [start,end]=dates.matches, between=target.slice(start.end,end.index);
    const labelledRange=/시작일\s*(?:은|이|[:：])?\s*$/.test(target.slice(0,start.index))&&/종료일\s*(?:은|이|[:：])?\s*$/.test(between);
    if (end.shortEnd || labelledRange || /^\s*(?:\([^)]*\)\s*)?(?:~|～|〜|[-–—]|부터)\s*$/.test(between)) {
      if (start.date<=end.date) { fields.startDate=start.date; fields.endDate=end.date; warnings.push('기간은 출결일로 자동 확정하지 않습니다. 실제 입력할 날짜를 따로 선택해 주세요.'); }
      else warnings.push('기간의 시작·종료 순서 또는 연도가 불분명합니다. 날짜를 직접 확인해 주세요.');
    } else warnings.push('서로 다른 날짜가 있습니다. 신청일·실제 출결일·제출일을 구분해 주세요.');
  } else if (dateValues.length===1) { fields.startDate=dateValues[0]; fields.endDate=dateValues[0]; }
  else if (dateValues.length>1) warnings.push('여러 날짜가 있습니다. 실제 출결일 또는 체험 기간을 직접 지정해 주세요.');
  else warnings.push('실제 출결일 또는 체험 기간을 확인하지 못했습니다. 날짜를 입력해 주세요.');
  if (/기간\s*중|중\s*(?:1|하루|한)\s*일?|미정|추후\s*(?:안내|확정)/.test(text)) warnings.push('정확한 날짜가 확정되지 않은 내용입니다. 날짜를 확인하기 전에는 나이스 입력 대상으로 선택하지 마세요.');
  if (isExperience) warnings.push('문서가 있다는 것만으로 승인·제출 확인을 완료하지 않습니다. 신청서, 승인, 보고서 상태를 직접 확인해 주세요.');
  const periodDate=fields.startDate||referenceDate, datedPeriods=attendancePeriods(text,periodDate);
  if(datedPeriods.periods) fields.periods=withAttendanceMeetings(datedPeriods.periods,fields.attendanceType,{date:periodDate});
  else if(datedPeriods.unavailable) warnings.push('해당 날짜의 수업 시간표가 없습니다. 실제 빠진 교시를 직접 선택해 주세요.');
  return {fields,warnings:unique(warnings)};
}

function conversationDateHeader(line,referenceDate) {
  const value=line.trim().replace(/^[\[({·•—–\s]+/,'');
  const {matches,warnings}=extractDates(value,referenceDate,{allowRelative:false});
  if(matches.length!==1||matches[0].index!==0)return null;
  // Date separators shown by messaging apps may include weekday and time, but not message prose.
  const suffix=value.slice(matches[0].end).replace(/[\s\[\](){}.,·•—–]/g,'');
  // OCR can clip the final "일" in a weekday label (e.g. "목요"). The explicit date is still a separator.
  if(suffix&&!/^(?:[일월화수목금토](?:요(?:일)?)?)?(?:(?:오전|오후)?\d{1,2}:\d{2})?$/.test(suffix))return null;
  return {date:matches[0].date,warnings};
}

/** Separate historical messages before interpreting "today"; submission reminders are not absences. */
export function parseConversationCandidates(value,{referenceDate=todaySeoul(),students=[]}={}) {
  const text=clean(value);
  if(text.length>limits.sourceText)throw new Error('원문은 30000자 이내로 입력해 주세요.');
  const blocks=[],warnings=[],leading=[];let active=null;
  for(const line of text.split(/\r?\n/)) {
    const header=conversationDateHeader(line,referenceDate);
    if(header){active={...header,header:line.trim(),lines:[]};blocks.push(active);}
    else if(active)active.lines.push(line);
    else leading.push(line);
  }
  if(!blocks.length)return {candidates:[],warnings:parentMessage(text)||/오늘|내일|어제/.test(text)?['문자 작성일을 찾지 못했습니다. 문자 속 ‘오늘’을 현재 날짜로 처리하지 말고 실제 출결일을 직접 확인해 주세요.']:[]};
  // A screenshot can start halfway through an older message. Keep its explicitly written period separately.
  const leadingText=leading.join('\n').trim();
  if(leadingText&&extractDates(leadingText,referenceDate,{allowRelative:false}).matches.length)blocks.unshift({date:'',header:'',lines:leading,warnings:['화면 위쪽 연락은 문자 작성일이 잘렸습니다. 적힌 기간에서 실제 출결일을 확인해 주세요.']});
  const globalIdentity=parseSourceText(text,{referenceDate,students}).fields;
  const candidates=[];
  for(const [index,block]of blocks.entries()) {
    const body=block.lines.join('\n').trim();if(!body)continue;
    const menstrual=menstrualContext(body);
    const parsed=parseSourceText(body,{referenceDate:block.date||referenceDate,students,messageDate:block.date});
    const explicitIntent=attendanceContext(body).intent||menstrual.intent||/[1-9]\s*교시\s*결과/.test(body);
    if(!parsed.fields.attendanceType||(menstrual.followup&&!explicitIntent))continue;
    const fields={...parsed.fields,attendanceDates:[],reviewStatus:'draft',entryStatus:'pending'};
    if(!fields.studentName&&!fields.studentId)for(const key of ['studentId','studentName','classNumber','number'])if(globalIdentity[key])fields[key]=globalIdentity[key];
    const sourceText=[block.header,body].filter(Boolean).join('\n');
    fields.sourceText=sourceText;
    const candidateWarnings=unique([...block.warnings,...parsed.warnings,...(block.date?[`문자 작성일 ${block.date}를 기준으로 상대 날짜를 정리했습니다. 실제 출결일을 확인해 주세요.`]:[])]).filter(w=>!fields.studentId||!w.startsWith('학번을 확인하지 못했습니다.'));
    const date=fields.startDate||'';
    const dateLabel=fields.endDate&&fields.endDate!==date?`${date}~${fields.endDate} (날짜 확인 필요)`:date||'날짜 확인 필요';
    candidates.push({id:`message-${index}-${block.date||'undated'}`,date,messageDate:block.date,label:`${dateLabel} · ${fields.studentName||'학생 확인 필요'} · ${fields.reason||fields.attendanceType}`,sourceText,fields,warnings:candidateWarnings});
  }
  if(candidates.length>1)warnings.push('서로 다른 날짜의 출결 연락이 있습니다. 입력할 연락을 하나씩 선택해 확인해 주세요.');
  if(!candidates.length)warnings.push('출결 요청을 확정할 수 있는 문자 내용을 찾지 못했습니다. 신고서 제출·확인 연락은 새 결석으로 만들지 않습니다.');
  return {candidates,warnings};
}

/** Period numbers are input bounds, not a school-policy assumption. */
export function parsePeriods(value,{date,lessonCount=0}={}) {
  if (typeof value!=='string' || !value.trim()) return {valid:false,periods:[],error:'해당 교시를 입력해 주세요.'};
  const text=value.trim().replace(/교시|까지/g,'').replace(/부터|[~～〜–—]/g,'-').replace(/\s*(?:,|，|·|및|와|과)\s*/g,',').replace(/\s/g,'');
  const result=[],scheduled=schoolPeriodsForDate(date,lessonCount),last=scheduled.at(-1)?.period;
  const invalid=error=>({valid:false,periods:[],error});
  for (const part of text.split(',')) {
    if(['조회','종례'].includes(part)) {result.push(part);continue;}
    const meetingRange=/^(조회|\d{1,2})-(종례|\d{1,2})$/.exec(part);
    if(meetingRange&&(meetingRange[1]==='조회'||meetingRange[2]==='종례')) {
      const start=meetingRange[1]==='조회'?1:Number(meetingRange[1]),end=meetingRange[2]==='종례'?last:Number(meetingRange[2]);
      if(meetingRange[2]==='종례'&&!last)return invalid('종례까지의 교시는 해당 날짜의 시간표를 확인한 뒤 직접 입력해 주세요.');
      if(start<1||end>20||start>end||(last&&end>last))return invalid('해당 날짜의 수업 교시와 시작·종료 순서를 확인해 주세요.');
      if(meetingRange[1]==='조회')result.push('조회');
      for(let period=start;period<=end;period++)result.push(period);
      if(meetingRange[2]==='종례')result.push('종례');
      continue;
    }
    const match=/^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);
    if (!match) return invalid('‘조회 · 1~2교시’, ‘4~6교시 · 종례’, ‘1, 3교시’처럼 입력해 주세요.');
    const start=Number(match[1]),end=Number(match[2]||match[1]);
    if (start<1 || end>20 || start>end) return invalid('교시는 1~20 사이에서 시작·종료 순서에 맞게 입력해 주세요.');
    if(last&&end>last)return invalid(`해당 날짜는 ${last}교시까지 수업합니다. 빠진 교시를 수정해 주세요.`);
    for(let period=start;period<=end;period++) result.push(period);
  }
  const periods=unique(result).sort((a,b)=>(a==='조회'?0:a==='종례'?21:a)-(b==='조회'?0:b==='종례'?21:b));
  return {valid:true,periods,error:''};
}

/** Display/export derivation only; callers choose when to persist an edited record. */
export function withAttendanceMeetings(value,attendanceType,{date,lessonCount=0}={}) {
  const meeting=attendanceType==='조퇴'?'종례':attendanceType==='지각'?'조회':'';
  if(!String(value??'').trim())return value||'';
  const parsed=parsePeriods(value,{date,lessonCount});
  return parsed.valid?formatSchoolPeriods([...parsed.periods,...(meeting?[meeting]:[])]):value;
}

/** Legacy classification helper; this does not impose a separate save or export step. */
export function requiresMenstrualApproval(record) {
  return record?.category==='attendance'&&record?.reasonType==='출석인정'&&/생리\s*(?:통|결석)/.test(clean(record?.reason));
}

/** A range has no automatic weekday expansion: school days must be explicitly selected. */
function contentErrors(record) {
  const errors=[];
  if (!record.studentId) errors.push('학번을 확인해 주세요.');
  if (!record.studentName) errors.push('학생 이름을 확인해 주세요.');
  if (!record.startDate) errors.push('실제 날짜를 입력해 주세요.');
  if (!record.endDate) errors.push('종료일을 입력해 주세요.');
  if (!record.reason) errors.push('나이스에 입력할 내용을 작성해 주세요.');
  if (['attendance','experience'].includes(record.category)) {
    if (record.passKind==='outing' && record.attendanceType && record.attendanceType!=='결과') errors.push('외출 중 빠진 교시를 결과로 정리해 주세요.');
    if (record.passKind==='early' && record.attendanceType!=='조퇴') errors.push('조퇴증은 조퇴로 정리해 주세요.');
    if (!record.attendanceType) errors.push('출결 구분을 선택해 주세요.');
    if (!record.reasonType) errors.push('출결 사유 구분을 선택해 주세요.');
    if (record.attendanceType!=='결석') {
      const dates=record.attendanceDates.length?record.attendanceDates:[record.startDate];
      for(const date of dates) {
        const periods=parsePeriods(record.periods,{date,lessonCount:record.lessonCount});
        if (!periods.valid) errors.push(periods.error);
      }
    } else if (record.periods) {
      errors.push('결석은 하루 전체 출결입니다. 교시를 비우거나 해당하는 출결 구분을 선택해 주세요.');
    }
    if ((record.startDate!==record.endDate || record.category==='experience') && !record.attendanceDates.length) errors.push('기간 전체가 아닌, 실제 나이스에 입력할 출결 날짜를 선택해 주세요.');
  } else if (record.startDate!==record.endDate) errors.push('상담·활동 기록은 실제 기록일 하나를 선택해 주세요.');
  return errors;
}

/** Distinguish complete prepared content from a memo, independently of paperwork tracking. */
export function contentReadiness(input) {
  let record;
  try { record=normalizeRecord(input); } catch(error) { return {ready:false,errors:[error.message]}; }
  const errors=contentErrors(record);
  return {ready:errors.length===0,errors};
}

/** Explicit save confirms the prepared content; the app does not approve school requests. */
export function readiness(input) {
  let record;
  try { record=normalizeRecord(input); } catch(error) { return {ready:false,errors:[error.message]}; }
  const errors=contentErrors(record);
  if (record.reviewStatus!=='reviewed') errors.push('입력 내용을 확인한 뒤 저장해 주세요.');
  if (record.category==='experience') {
    if (record.applicationStatus!=='received') errors.push('체험학습 신청서 접수를 확인해 주세요.');
    if (record.approvalStatus!=='approved') errors.push('체험학습 승인 여부를 확인해 주세요.');
  }
  return {ready:errors.length===0,errors};
}

/** Report collection remains visible independently from an approved attendance entry. */
export function experienceStatus(input,today=todaySeoul()) {
  const record=normalizeRecord(input), validToday=isDate(today);
  const overdue=record.reportStatus==='missing' && !!record.reportDueDate && validToday && record.reportDueDate<today;
  const needsReport=record.category==='experience' && record.approvalStatus==='approved' && record.reportStatus==='missing' && !!record.endDate && validToday && record.endDate<today;
  if (record.category!=='experience') return {label:'해당 없음',tone:'neutral',overdue:false,needsReport:false};
  if (record.approvalStatus==='cancelled') return {label:'신청 취소',tone:'neutral',overdue:false,needsReport:false};
  if (record.approvalStatus==='rejected') return {label:'신청 반려',tone:'danger',overdue:false,needsReport:false};
  if (record.applicationStatus==='missing') return {label:'신청서 미제출',tone:'warning',overdue,needsReport};
  if (record.approvalStatus!=='approved') return {label:'승인 확인 대기',tone:'warning',overdue,needsReport};
  if (record.reportStatus==='reviewed') return {label:'보고서 확인 완료',tone:'success',overdue:false,needsReport:false};
  if (record.reportStatus==='received') return {label:'보고서 검토 대기',tone:'warning',overdue:false,needsReport:false};
  if (overdue) return {label:'보고서 제출 기한 경과',tone:'danger',overdue,needsReport};
  if (needsReport) return {label:'체험 종료 · 보고서 미제출',tone:'warning',overdue,needsReport};
  if (validToday && record.startDate && record.startDate<=today && record.endDate>=today) return {label:'체험 진행 중',tone:'info',overdue,needsReport};
  return {label:'승인 완료 · 체험 예정',tone:'info',overdue,needsReport};
}

/** Export only checked content, never the source text or image metadata. */
export function toNeisRows(records) {
  if (!Array.isArray(records)) throw new Error('내보낼 기록 목록을 확인해 주세요.');
  const rows=[], seen=new Set(), attendanceKeys=new Map();
  for (const input of records) {
    const record=normalizeRecord(input);
    if (record.entryStatus==='confirmed' || !readiness(record).ready) continue;
    const dates=['attendance','experience'].includes(record.category) && record.attendanceDates.length ? record.attendanceDates : [record.startDate];
    for (const date of dates) {
      if(record.neisConfirmedDates.includes(date))continue;
      const row={recordId:record.id,category:record.category,studentId:record.studentId,studentName:record.studentName,classNumber:record.classNumber,number:record.number,date,
        attendanceType:record.attendanceType,reasonType:record.reasonType,periods:withAttendanceMeetings(record.periods,record.attendanceType,{date,lessonCount:record.lessonCount}),reason:record.reason,lessonCount:record.lessonCount||schoolPeriodsForDate(date).length};
      const key=JSON.stringify([row.category,row.studentId,row.studentName,row.date,row.attendanceType,row.reasonType,row.periods,row.reason]);
      if (seen.has(key)) continue;
      if (['attendance','experience'].includes(row.category)) {
        const attendanceKey=`${row.studentId}|${row.date}`, previous=attendanceKeys.get(attendanceKey)||[];
        const periods=row.attendanceType==='결석'?null:parsePeriods(row.periods,{date,lessonCount:record.lessonCount}).periods;
        if (previous.some(item=>item.periods===null || periods===null || periods.some(period=>item.periods.includes(period)))) throw new Error(`${row.studentId} 학생의 ${row.date} 출결 입력 내용이 중복되거나 다릅니다. 겹치는 교시와 사유를 확인해 주세요.`);
        attendanceKeys.set(attendanceKey,[...previous,{key,periods}]);
      }
      seen.add(key); rows.push(row);
    }
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.studentId.localeCompare(b.studentId)||a.category.localeCompare(b.category));
}

export function exportCsv(records) {
  const categoryNames={attendance:'출결',experience:'체험학습',counseling:'상담',activity:'활동'};
  const quote=value=>{
    let text=String(value??'');
    // Spreadsheet applications may ignore leading whitespace before a formula.
    if (/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  const rows=[['학번','이름','반','번호','날짜','기록구분','출결구분','사유구분','교시','나이스 입력 내용'],
    ...toNeisRows(records).map(row=>[row.studentId,row.studentName,row.classNumber,row.number,row.date,categoryNames[row.category],row.attendanceType,row.reasonType,row.periods,row.reason])];
  return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}


