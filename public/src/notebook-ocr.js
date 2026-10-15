/** Local-only OCR. Files and recognized text are never sent to the OCR CDN. */
import { darkTextProfile, normalizeDarkText, textStrips, mergeDarkOcr, rosterOcrText } from './ocr-preprocess.js';
export const OCR_LIMITS = Object.freeze({ files: 5, pdfPages: 5, inputBytes: 12 * 1024 * 1024, attachmentBytes: 3 * 1024 * 1024, pixels: 12 * 1024 * 1024, edge: 2400 });
const CDN = 'https://cdn.jsdelivr.net';
const PDF_BASE = `${CDN}/npm/pdfjs-dist@5.4.296`;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let tesseractPromise;
let pdfPromise;

function abortError() { return new DOMException('문자 읽기를 취소했습니다.', 'AbortError'); }
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
function bounded(promise, { signal, timeout = 90000, cancel } = {}) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (callback, value) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); callback(value); };
    const stop = error => { try { Promise.resolve(cancel?.()).catch(() => {}); } catch {} finish(reject, error); };
    const onAbort = () => stop(abortError());
    const timer = setTimeout(() => stop(new Error('문자를 읽는 시간이 초과되었습니다. 연결을 확인하거나 사진을 나눠 다시 시도해 주세요.')), timeout);
    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    if (signal?.aborted) onAbort();
  });
}
function fileKind(file) {
  if (IMAGE_MIMES.has(file?.type)) return 'image';
  if (file?.type === 'application/pdf') return 'pdf';
  if (!file?.type && /\.(jpe?g|png|webp)$/i.test(file?.name || '')) return 'image';
  if (!file?.type && /\.pdf$/i.test(file?.name || '')) return 'pdf';
  throw new Error('JPG·PNG·WEBP 사진 또는 PDF 파일을 선택해 주세요.');
}
function validateFile(file) {
  const kind = fileKind(file);
  if (!file.size) throw new Error('빈 파일은 읽을 수 없습니다.');
  if (file.size > OCR_LIMITS.inputBytes) throw new Error('파일 한 개는 12MB 이하여야 합니다. 파일을 나눠 주세요.');
  return kind;
}
function safeName(file, jpeg = false) {
  const name = String(file.name || '첨부자료').replace(/[\u0000-\u001f/\\]/g, '_').slice(0, 140);
  return jpeg ? `${name.replace(/\.[^.]+$/, '')}.jpg` : name;
}
function loadTesseract() {
  if (globalThis.Tesseract?.createWorker) return Promise.resolve(globalThis.Tesseract);
  if (!tesseractPromise) tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/tesseract-6.0.1.min.js', import.meta.url).href;
    script.async = true;
    script.onload = () => globalThis.Tesseract?.createWorker ? resolve(globalThis.Tesseract) : reject(new Error('문자 인식 도구를 열지 못했습니다.'));
    script.onerror = () => { script.remove(); reject(new Error('문자 인식 도구를 불러오지 못했습니다. 연결을 확인해 주세요.')); };
    document.head.append(script);
  }).catch(error => { tesseractPromise = undefined; throw error; });
  return tesseractPromise;
}
async function loadPdf() {
  if (!pdfPromise) pdfPromise = import(`${PDF_BASE}/legacy/build/pdf.min.mjs`).then(pdf => {
    pdf.GlobalWorkerOptions.workerSrc = `${PDF_BASE}/legacy/build/pdf.worker.min.mjs`;
    return pdf;
  }).catch(error => { pdfPromise = undefined; throw error; });
  return pdfPromise;
}
async function imageCanvas(file, signal, { forOcr = false } = {}) {
  checkAbort(signal);
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    await bounded(new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('사진을 열 수 없습니다. JPG 또는 PNG로 다시 저장해 주세요.'));
      img.src = url;
    }), { signal, timeout: 15000 });
    const width = img.naturalWidth, height = img.naturalHeight;
    if (!width || !height) throw new Error('사진 크기를 읽을 수 없습니다.');
    if (width * height > OCR_LIMITS.pixels) throw new Error('사진이 너무 큽니다. 1200만 화소 이하로 줄이거나 화면을 나눠 캡처해 주세요.');
    // Keep the text width of long phone captures. Scaling an entire scrolling
    // screenshot to 2400px height can turn its Korean letters into a few pixels.
    // OCR reads tall captures in bounded strips; attachment copies stay compact.
    const scale = forOcr
      ? Math.min(1, OCR_LIMITS.edge / width, Math.sqrt(8 * 1024 * 1024 / (width * height)))
      : Math.min(1, OCR_LIMITS.edge / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('이 브라우저에서 사진을 처리할 수 없습니다.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { img.onload = null; img.onerror = null; img.src = ''; URL.revokeObjectURL(url); }
}
function releaseCanvas(canvas) { if (canvas) { canvas.width = 1; canvas.height = 1; } }
function prepareDarkStrip(source, strip, dates, purpose) {
  const canvas = document.createElement('canvas');
  canvas.width = strip.width; canvas.height = strip.height;
  const context = canvas.getContext('2d', { alpha: false });
  const pixels = source.getContext('2d').getImageData(strip.left, strip.top, strip.width, strip.height);
  // SMS bubbles and timestamps should not become fragments inside a sentence.
  // The dedicated date pass retains their muted date headers. Keep the gentler
  // table contrast for rosters, which may contain dim text in separate columns.
  normalizeDarkText(pixels.data, strip.width, { dates, bodyFloor: purpose === 'roster' ? 80 : 120 });
  context.putImageData(pixels, 0, 0);
  // Korean phone text is often only 18–22px tall. Doubling it helps the OCR
  // engine preserve individual strokes, with a 6MP working-canvas ceiling.
  const scale = Math.min(2, Math.max(1, 1400 / strip.width), Math.sqrt(6 * 1024 * 1024 / (strip.width * strip.height)));
  if (scale <= 1) return canvas;
  const enlarged = document.createElement('canvas');
  enlarged.width = Math.round(strip.width * scale); enlarged.height = Math.round(strip.height * scale);
  const enlargedContext = enlarged.getContext('2d', { alpha: false });
  enlargedContext.imageSmoothingEnabled = true;
  enlargedContext.imageSmoothingQuality = 'high';
  enlargedContext.drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
  releaseCanvas(canvas);
  return enlarged;
}
function friendlyError(error) {
  if (error?.name === 'PasswordException') return '암호가 걸린 PDF입니다. 암호를 해제한 파일 또는 필요한 쪽의 캡처를 넣어 주세요.';
  if (error?.name === 'InvalidPDFException') return 'PDF를 열 수 없습니다. 다시 저장하거나 필요한 쪽을 캡처해 주세요.';
  if (/failed to fetch|networkerror|network request|load failed|importing a module/i.test(error?.message || '')) return '문자 인식 도구를 내려받지 못했습니다. 연결을 확인해 주세요. 원문을 직접 붙여넣어 정리할 수도 있습니다.';
  return error?.message || '문자를 읽지 못했습니다. 원문을 직접 입력해 주세요.';
}

/** onProgress({message, progress: 0..1, fileIndex: 1-based, total}). */
export async function recognizeFiles(inputFiles, { onProgress = () => {}, signal, purpose } = {}) {
  const files = Array.from(inputFiles || []);
  if (!files.length) return { text: '', warnings: ['읽을 사진이나 PDF를 선택해 주세요.'] };
  if (files.length > OCR_LIMITS.files) throw new Error('한 번에 파일 5개까지 읽을 수 있습니다.');
  checkAbort(signal);
  const texts = [], warnings = [];
  let worker, workerPending, workerFailure, finished = false, pdfPages = 0, fileIndex = 0;
  let ocrPart = 0, ocrParts = 1, ocrStage = '자료의 문자를 읽고 있습니다.';
  const notify = (message, progress = 0) => {
    if (finished) return;
    try { onProgress({ message, progress: Math.min(1, Math.max(0, progress)), fileIndex: Math.min(fileIndex + 1, files.length), total: files.length }); } catch {}
  };
  const killWorker = () => { const current = worker; worker = undefined; return current?.terminate(); };
  const getWorker = async () => {
    if (worker) return worker;
    notify('한글 문자 인식 도구를 준비하고 있습니다. 처음에는 시간이 걸릴 수 있습니다.');
    const library = await bounded(loadTesseract(), { signal, timeout: 30000 });
    let cancelled = false;
    let rejectWorker;
    workerFailure = new Promise((_, reject) => { rejectWorker = reject; });
    workerPending = library.createWorker(['kor', 'eng'], 1, {
      workerPath: `${CDN}/npm/tesseract.js@6.0.1/dist/worker.min.js`,
      corePath: `${CDN}/npm/tesseract.js-core@6.0.0`,
      langPath: `${CDN}/gh/tesseract-ocr/tessdata_fast@4.1.0`,
      gzip: false,
      workerBlobURL: true,
      cacheMethod: 'write',
      logger: entry => {
        if (entry.status === 'recognizing text') notify(`${fileIndex + 1}/${files.length} ${ocrStage}`, (fileIndex + (ocrPart + (entry.progress || 0)) / ocrParts) / files.length);
      },
      errorHandler: error => rejectWorker(new Error(typeof error === 'string' ? error : '문자 인식 중 오류가 발생했습니다. 다시 시도해 주세요.')),
    });
    workerPending.then(value => { if (cancelled || finished || signal?.aborted) value.terminate().catch(() => {}); }, () => {});
    worker = await bounded(Promise.race([workerPending, workerFailure]), { signal, timeout: 90000, cancel: () => { cancelled = true; return killWorker(); } });
    checkAbort(signal);
    await bounded(Promise.race([worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }), workerFailure]), { signal, timeout: 15000, cancel: killWorker });
    return worker;
  };
  const runOcr = async (canvas, { mode = '6', blocks = false } = {}) => {
    const engine = await getWorker();
    checkAbort(signal);
    await bounded(Promise.race([engine.setParameters({ tessedit_pageseg_mode: mode }), workerFailure]), { signal, timeout: 15000, cancel: killWorker });
    const result = await bounded(Promise.race([engine.recognize(canvas, {}, { text: true, blocks }), workerFailure]), { signal, timeout: 90000, cancel: killWorker });
    return result.data;
  };
  const readCanvas = async (canvas, label) => {
    checkAbort(signal);
    let pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const profile = darkTextProfile(pixels.data);
    let text, confidence;
    if (profile.dark) {
      notify('어두운 화면의 본문과 날짜를 나누어 읽고 있습니다.', fileIndex / files.length);
      const rows = normalizeDarkText(pixels.data, canvas.width);
      const strips = textStrips(canvas.width, canvas.height, rows);
      pixels = null;
      const parts = [], scores = [];
      ocrParts = strips.length * (purpose === 'roster' ? 1 : 2);
      for (let index = 0; index < strips.length; index++) {
        checkAbort(signal);
        ocrPart = index * (purpose === 'roster' ? 1 : 2); ocrStage = `본문을 읽고 있습니다. (${index + 1}/${strips.length})`;
        let prepared = prepareDarkStrip(canvas, strips[index], false, purpose);
        let body;
        // Sparse mode is useful for roster cells, but splits Korean message
        // sentences into unrelated word fragments. Read message lines together.
        try { body = await runOcr(prepared, { mode: purpose === 'roster' ? '11' : '6', blocks: true }); }
        finally { releaseCanvas(prepared); }
        if (purpose === 'roster') {
          parts.push(rosterOcrText(body)); scores.push(Number(body.confidence) || 0);
          continue;
        }
        checkAbort(signal);
        ocrPart++; ocrStage = `흐린 날짜를 확인하고 있습니다. (${index + 1}/${strips.length})`;
        prepared = prepareDarkStrip(canvas, strips[index], true);
        let dates;
        try { dates = await runOcr(prepared, { mode: '11', blocks: true }); }
        catch (error) {
          if (signal?.aborted || error?.name === 'AbortError') throw abortError();
          warnings.push(`${label}: 본문은 읽었지만 흐린 날짜를 추가로 확인하지 못했습니다. 날짜를 원본과 대조해 주세요.`);
          dates = {};
          await killWorker()?.catch(() => {});
        }
        finally { releaseCanvas(prepared); }
        parts.push(mergeDarkOcr(body, dates));
        scores.push(Number(body.confidence) || 0);
      }
      text = parts.filter(Boolean).join('\n\n').trim();
      confidence = scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length);
    } else {
      pixels = null;
      ocrPart = 0; ocrParts = 1; ocrStage = '자료의 문자를 읽고 있습니다.';
      const result = await runOcr(canvas, purpose === 'roster' ? { mode: '11', blocks: true } : {});
      text = purpose === 'roster' ? rosterOcrText(result) : String(result?.text || '').trim(); confidence = Number(result?.confidence);
    }
    if (!text) warnings.push(`${label}: 읽힌 글자가 없습니다. 사진을 다시 찍거나 원문을 직접 입력해 주세요.`);
    else if (confidence < 60) warnings.push(`${label}: 인식이 불확실합니다. 이름·날짜·출결 구분을 원본과 대조해 주세요.`);
    return text;
  };
  try {
    for (fileIndex = 0; fileIndex < files.length; fileIndex++) {
      checkAbort(signal);
      const file = files[fileIndex], name = safeName(file);
      notify(`${fileIndex + 1}/${files.length} 자료를 준비하고 있습니다.`, fileIndex / files.length);
      try {
        if (validateFile(file) === 'image') {
          const canvas = await imageCanvas(file, signal, { forOcr: true });
          try { const text = await readCanvas(canvas, name); if (text) texts.push(`[${name}]\n${text}`); }
          finally { releaseCanvas(canvas); }
          continue;
        }
        if (pdfPages >= OCR_LIMITS.pdfPages) { warnings.push(`${name}: 한 번에 PDF 5쪽까지 읽을 수 있어 읽지 않았습니다. 파일을 나눠 주세요.`); continue; }
        const pdfLibrary = await bounded(loadPdf(), { signal, timeout: 30000 });
        const task = pdfLibrary.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, enableXfa: false, cMapUrl: `${PDF_BASE}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDF_BASE}/standard_fonts/`, wasmUrl: `${PDF_BASE}/wasm/`, stopAtErrors: true });
        const abortPdf = () => { task.destroy().catch(() => {}); };
        signal?.addEventListener('abort', abortPdf, { once: true });
        try {
          const pdf = await bounded(task.promise, { signal, timeout: 45000, cancel: () => task.destroy() });
          const count = Math.min(pdf.numPages, OCR_LIMITS.pdfPages - pdfPages);
          if (count < pdf.numPages) warnings.push(`${name}: 전체 ${pdf.numPages}쪽 중 앞 ${count}쪽만 읽었습니다. 나머지 쪽은 파일을 나눠 넣어 주세요.`);
          for (let pageNumber = 1; pageNumber <= count; pageNumber++) {
            checkAbort(signal); pdfPages++;
            const page = await bounded(pdf.getPage(pageNumber), { signal, timeout: 15000, cancel: () => task.destroy() });
            const label = `${name} · ${pageNumber}쪽`;
            notify(`${label} 문자를 읽고 있습니다.`, fileIndex / files.length);
            const content = await bounded(page.getTextContent(), { signal, timeout: 20000, cancel: () => task.destroy() });
            let text = content.items.map(item => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('').trim();
            // A scan can contain a selectable footer. Check for image content so
            // a short text layer does not make us silently skip the scanned form.
            const operators = await bounded(page.getOperatorList(), { signal, timeout: 20000, cancel: () => task.destroy() });
            const imageOperators = new Set(['paintImageXObject', 'paintInlineImageXObject', 'paintImageXObjectRepeat', 'paintImageMaskXObject'].map(key => pdfLibrary.OPS[key]));
            const hasImages = operators.fnArray.some(operation => imageOperators.has(operation));
            if (hasImages || text.replace(/\s/g, '').length < 30) {
              const size = page.getViewport({ scale: 1 });
              const viewport = page.getViewport({ scale: Math.min(3, OCR_LIMITS.edge / Math.max(size.width, size.height)) });
              const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
              try {
                const render = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport });
                await bounded(render.promise, { signal, timeout: 30000, cancel: () => render.cancel() });
                text = await readCanvas(canvas, label) || text;
              } finally { releaseCanvas(canvas); }
            }
            if (text) texts.push(`[${label}]\n${text}`);
            page.cleanup();
          }
        } finally { signal?.removeEventListener('abort', abortPdf); await task.destroy().catch(() => {}); }
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw abortError();
        warnings.push(`${name}: ${friendlyError(error)}`);
        await killWorker()?.catch(() => {});
      }
    }
    notify('문자 읽기를 마쳤습니다. 이름과 날짜를 원본과 대조해 주세요.', 1);
    return { text: texts.join('\n\n'), warnings: [...new Set(warnings)] };
  } finally { finished = true; await killWorker()?.catch(() => {}); }
}

function blobBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('첨부 파일을 준비하지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}
/** Compresses a copy for private attachment upload; does not upload anything. */
export async function prepareAttachment(file) {
  const kind = validateFile(file);
  if (kind === 'pdf') {
    if (file.size > OCR_LIMITS.attachmentBytes) throw new Error('PDF 첨부는 3MB까지 가능합니다. 용량을 줄이거나 필요한 쪽을 캡처해 주세요.');
    return { name: safeName(file), mime: 'application/pdf', base64: await blobBase64(file), size: file.size };
  }
  const canvas = await imageCanvas(file);
  try {
    for (const quality of [0.9, 0.78, 0.62]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= OCR_LIMITS.attachmentBytes) return { name: safeName(file, true), mime: 'image/jpeg', base64: await blobBase64(blob), size: blob.size };
    }
    throw new Error('첨부할 사진을 3MB 이하로 줄이지 못했습니다. 사진을 나눠 주세요.');
  } finally { releaseCanvas(canvas); }
}

