const MAX_STUDENTS = 1000;
const headerFields = new Map([
  ['학년', 'grade'], ['반', 'classNumber'], ['번호', 'number'], ['학번', 'studentId'],
  ['이름', 'studentName'], ['성명', 'studentName'], ['학생명', 'studentName'], ['학생성명', 'studentName']
]);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const present = value => value !== undefined && value !== null && String(value).trim() !== '';

/** Previously used applications that have no record in this app, per school year. */
export function normalizeExperienceBaseline(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('기존 체험학습 사용횟수를 학년도별로 입력해 주세요.');
  const result = {};
  for (const [year, count] of Object.entries(input).sort(([a],[b])=>a.localeCompare(b))) {
    if (!/^\d{4}$/.test(year) || Number(year)<1900 || Number(year)>2199) throw new Error('체험학습 학년도를 확인해 주세요.');
    if (!Number.isSafeInteger(count) || count<0 || count>999) throw new Error('기존 체험학습 사용횟수는 0~999 사이 정수로 입력해 주세요.');
    result[year] = count;
  }
  return result;
}

function integer(value, label, maximum) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d{1,2}$/.test(String(value).trim())) throw new Error(`${label}은 1~${maximum} 사이 숫자로 입력해 주세요.`);
  const result = Number(String(value).trim());
  if (!Number.isInteger(result) || result < 1 || result > maximum) throw new Error(`${label}은 1~${maximum} 사이 숫자로 입력해 주세요.`);
  return result;
}

function studentId(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^[1-3]\d{4}$/.test(String(value).trim())) throw new Error('학번은 학년 1자리·반 2자리·번호 2자리의 다섯 자리 숫자여야 합니다.');
  const id = String(value).trim();
  if (Number(id.slice(1, 3)) < 1 || Number(id.slice(3)) < 1) throw new Error('학번의 반과 번호는 각각 01~99여야 합니다.');
  return id;
}

function normalizeStudent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('학생 정보 형식을 확인해 주세요.');
  if (typeof input.studentName !== 'string') throw new Error('학생 이름을 입력해 주세요.');
  const name = input.studentName.trim();
  if (!name || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('학생 이름은 줄바꿈 없이 1~40자로 입력해 주세요.');
  const id = studentId(input.studentId);
  const grade = Number(id[0]), classNumber = Number(id.slice(1, 3)), number = Number(id.slice(3));
  for (const [key, label, maximum, expected] of [['grade', '학년', 3, grade], ['classNumber', '반', 99, classNumber], ['number', '번호', 99, number]]) {
    if (own(input, key) && present(input[key]) && integer(input[key], label, maximum) !== expected) throw new Error(`학번과 ${label} 정보가 일치하지 않습니다.`);
  }
  return { studentId: id, studentName: name, grade, classNumber, number,
    ...(own(input,'experienceBaseline') ? { experienceBaseline:normalizeExperienceBaseline(input.experienceBaseline) } : {}) };
}

/** Normalize stored/imported rosters, rejecting conflicting IDs rather than choosing a student. */
export function normalizeRoster(input) {
  if (!Array.isArray(input)) throw new Error('명단은 학생 목록 형식이어야 합니다.');
  if (input.length > MAX_STUDENTS) throw new Error('명단은 1,000명까지 등록할 수 있습니다.');
  const ids = new Set();
  return input.map((value, index) => {
    let student;
    try { student = normalizeStudent(value); } catch (error) { throw new Error(`${index + 1}번째 학생: ${error.message}`); }
    if (ids.has(student.studentId)) throw new Error(`학번 ${student.studentId}이 중복되었습니다.`);
    ids.add(student.studentId);
    return student;
  });
}

function delimiterFor(text) {
  let quoted = false, commas = 0, tabs = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted && char === ',') commas++;
    else if (!quoted && char === '\t') tabs++;
  }
  return tabs ? '\t' : commas ? ',' : null;
}

/** CSV/TSV scanner retains quoted newlines and escaped quotes; malformed rows are reported. */
function delimitedRows(text, delimiter) {
  const rows = [];
  let cells = [], field = '', quoted = false, closed = false, error = '', line = 1, startLine = 1, rawStart = 0;
  const addField = () => { cells.push(field.trim()); field = ''; closed = false; };
  const addRow = end => {
    addField(); rows.push({ cells, line: startLine, raw: text.slice(rawStart, end), error });
    cells = []; error = ''; startLine = line; rawStart = end;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; closed = true; }
      } else {
        field += char;
        if (char === '\n' || (char === '\r' && text[index + 1] !== '\n')) line++;
      }
      continue;
    }
    if (char === '"') {
      if (!field.trim() && !closed) { field = ''; quoted = true; }
      else { error = '따옴표 형식이 올바르지 않습니다.'; field += char; }
    } else if (char === delimiter) addField();
    else if (char === '\n' || char === '\r') {
      addRow(index);
      if (char === '\r' && text[index + 1] === '\n') index++;
      line++; startLine = line; rawStart = index + 1;
    } else {
      if (closed && char.trim()) error = '닫는 따옴표 뒤에 구분되지 않은 값이 있습니다.';
      field += char;
    }
  }
  if (quoted) error = '닫히지 않은 따옴표가 있습니다.';
  if (rawStart < text.length || cells.length || field) addRow(text.length);
  return rows;
}

function textRows(text) {
  return text.split(/\r\n|\n|\r/).map((raw, index) => ({ raw, cells: raw.trim().split(/\s+/), line: index + 1, error: '' }));
}

function headerFor(cells) {
  const fields = cells.map(cell => headerFields.get(cell.replace(/\s+/g, '')) || '');
  if (!fields.includes('studentName') || !fields.some(field => ['studentId', 'number'].includes(field))) return null;
  const seen = new Set();
  for (const field of fields.filter(Boolean)) {
    if (seen.has(field)) throw new Error('명단 머리글에 같은 항목이 두 번 있습니다.');
    seen.add(field);
  }
  return fields;
}

function withId(input, defaults) {
  // An explicit but invalid ID always fails; never replace it with guessed class/number values.
  if (present(input.studentId)) return normalizeStudent(input);
  const grade = integer(present(input.grade) ? input.grade : defaults.grade, '학년', 3);
  const classNumber = integer(present(input.classNumber) ? input.classNumber : defaults.classNumber, '반', 99);
  const number = integer(input.number, '번호', 99);
  return normalizeStudent({ ...input, grade, classNumber, number, studentId: `${grade}${String(classNumber).padStart(2, '0')}${String(number).padStart(2, '0')}` });
}

function plausibleName(name) {
  return typeof name === 'string' && name.trim().length <= 40 &&
    /^[\p{L}\p{M}][\p{L}\p{M}\s.'’·-]*$/u.test(name.trim()) &&
    !/^(?:담임(?:교사|성명)?|교사)\s/.test(name.trim()) &&
    !/^(담임(?:교사)?|교사|학년|반|번호|학번|이름|성명|학생|학생명|학생성명|전화번호|연락처|계|합계|총계)$/.test(name.trim());
}

function parseWithoutHeader(row, defaults, delimiter) {
  const text = row.raw.trim();
  if (/^(?:담임(?:교사|성명)?|교사|연락처|전화번호|합계|총계)(?:\s|[:：]|$)/.test(text)) throw new Error('학생 행이 아닌 제목·교사 정보로 보입니다.');
  const labelled = text.match(/^(?:(\d)\s*학년\s*)?(\d{1,2})\s*반\s*(\d{1,2})\s*번\s+(.+)$/);
  if (labelled) return withId({ grade: labelled[1], classNumber: labelled[2], number: labelled[3], studentName: labelled[4] }, defaults);
  const labelledId = text.match(/^학번\s*[:：]\s*(\S+)\s+(?:이름|성명)\s*[:：]\s*(.+)$/);
  if (labelledId) return withId({ studentId: labelledId[1], studentName: labelledId[2] }, defaults);
  const cells = row.cells;
  if (cells.length >= 2 && /^\d{5}$/.test(cells[0])) {
    if (delimiter && cells.length !== 2) throw new Error('머리글 없는 학번·이름 행은 두 열이어야 합니다. 추가 열의 머리글을 적어 주세요.');
    return withId({ studentId: cells[0], studentName: cells.slice(1).join(' ') }, defaults);
  }
  if (cells.length >= 5 && /^\d{1,2}$/.test(cells[0]) && /^\d{1,2}$/.test(cells[1]) && /^\d{1,2}$/.test(cells[2]) && (cells[3] === '' || /^\d{5}$/.test(cells[3]))) {
    if (delimiter && cells.length !== 5) throw new Error('학년·반·번호·학번·이름의 다섯 열을 확인해 주세요.');
    return withId({ grade: cells[0], classNumber: cells[1], number: cells[2], studentId: cells[3], studentName: cells.slice(4).join(' ') }, defaults);
  }
  if (cells.length >= 4 && cells.slice(0, 3).every(value => /^\d{1,2}$/.test(value))) {
    if (delimiter && cells.length !== 4) throw new Error('학년·반·번호·이름의 네 열을 확인해 주세요.');
    return withId({ grade: cells[0], classNumber: cells[1], number: cells[2], studentName: cells.slice(3).join(' ') }, defaults);
  }
  if (cells.length >= 3 && /^\d{1,2}$/.test(cells[0]) && /^\d{5}$/.test(cells[1])) {
    if (delimiter && cells.length !== 3) throw new Error('번호·학번·이름의 세 열을 확인해 주세요.');
    return withId({ number: cells[0], studentId: cells[1], studentName: cells.slice(2).join(' ') }, defaults);
  }
  if (cells.length >= 2 && /^\d{1,2}$/.test(cells[0])) {
    if (delimiter && cells.length !== 2) throw new Error('번호·이름만 있는 행은 두 열이어야 합니다.');
    if (!defaults.grade || !defaults.classNumber) throw new Error('번호·이름만 있는 명단은 기본 학년과 반을 먼저 선택해 주세요.');
    return withId({ number: cells[0], studentName: cells.slice(1).join(' ') }, defaults);
  }
  throw new Error('학번·이름 또는 학년·반·번호·이름 형식으로 읽을 수 없습니다.');
}

/** Conservative text/CSV/OCR import. Uncertain rows are reported, never silently filled. */
export function parseRosterText(text, { defaultGrade, defaultClass } = {}) {
  if (typeof text !== 'string') throw new Error('명단 내용을 글자로 넣어 주세요.');
  if (text.length > 250000) throw new Error('명단 내용이 너무 깁니다. 1,000명 이하로 나눠 주세요.');
  text = text.replace(/^\uFEFF/, '');
  const defaults = {
    grade: present(defaultGrade) ? integer(defaultGrade, '기본 학년', 3) : undefined,
    classNumber: present(defaultClass) ? integer(defaultClass, '기본 반', 99) : undefined
  };
  const warnings = [], unparsed = new Map(), accepted = new Map(), first = new Map(), duplicates = new Set();
  if (!text.trim()) return { students: [], warnings: ['정리할 명단 내용을 입력해 주세요.'], unparsedLines: [] };
  const delimiter = delimiterFor(text);
  const rows = delimiter ? delimitedRows(text, delimiter) : textRows(text);
  let header = null;
  const reject = (row, message) => { warnings.push(`${row.line}행: ${message}`); unparsed.set(row.line, row.raw); };
  for (const row of rows) {
    if (!row.raw.trim()) continue;
    try {
      if (row.error) throw new Error(row.error);
      const detected = headerFor(row.cells);
      if (detected) { header = detected; continue; }
      let student;
      if (header) {
        let cells = row.cells;
        if (!delimiter && cells.length > header.length && header.at(-1) === 'studentName') cells = [...cells.slice(0, header.length - 1), cells.slice(header.length - 1).join(' ')];
        if (cells.length > header.length) throw new Error('열 수가 머리글과 다릅니다. 쉼표·탭 및 따옴표를 확인해 주세요.');
        const input = {};
        header.forEach((field, index) => { if (field) input[field] = cells[index] ?? ''; });
        student = withId(input, defaults);
      } else student = parseWithoutHeader(row, defaults, delimiter);
      if (!plausibleName(student.studentName)) throw new Error('학생 이름을 확실히 읽을 수 없습니다. 숫자·교사 제목·다른 열이 섞였는지 확인해 주세요.');
      const previous = first.get(student.studentId);
      if (previous) {
        accepted.delete(student.studentId);
        duplicates.add(student.studentId);
        unparsed.set(previous.line, previous.raw);
        reject(row, `학번 ${student.studentId}이 ${previous.line}행과 중복되어 해당 학번의 모든 행을 제외했습니다.`);
        continue;
      }
      first.set(student.studentId, row);
      if (duplicates.has(student.studentId)) continue;
      if (accepted.size >= MAX_STUDENTS) throw new Error('1,000명을 초과한 행입니다. 명단을 나눠 주세요.');
      accepted.set(student.studentId, student);
    } catch (error) { reject(row, error.message); }
  }
  const students = normalizeRoster([...accepted.values()]);
  if (!students.length && !warnings.length) warnings.push('머리글만 있습니다. 학생 정보를 추가해 주세요.');
  return { students, warnings, unparsedLines: [...unparsed.entries()].sort((a, b) => a[0] - b[0]).map(([, raw]) => raw) };
}

/** UTF-8 BOM makes the header readable when the CSV is opened directly in Excel. */
export function exportRosterTemplate() {
  return '\uFEFF학번,이름\r\n';
}

