// 출력 공통: PC는 숨은 iframe, 폰·태블릿은 현재 페이지에 출력물만 남기고 인쇄합니다.
// (안드로이드 크롬은 iframe만 인쇄하지 못하고 화면 전체를 인쇄합니다.)
export function prefersInPagePrint(nav = globalThis.navigator) {
  const ua = nav?.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints || 0) > 1);
}

function ensurePrintCss() {
  const existing = document.querySelector('link[data-print-css]');
  if (existing) return Promise.resolve();
  return new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/src/notebook-print.css'; link.dataset.printCss = '';
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
    setTimeout(resolve, 2500);
  });
}

function printInPage(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.querySelector('.print-host')?.remove();
  const host = document.createElement('div');
  host.className = `print-host ${doc.body.className}`.trim();
  host.innerHTML = doc.body.innerHTML;
  const oldTitle = document.title;
  ensurePrintCss().then(() => {
    document.body.append(host);
    document.documentElement.classList.add('is-printing');
    if (doc.title) document.title = doc.title;
    let done = false;
    const cleanup = () => { if (done) return; done = true; document.documentElement.classList.remove('is-printing'); host.remove(); document.title = oldTitle; };
    window.addEventListener('afterprint', cleanup, { once: true });
    requestAnimationFrame(() => requestAnimationFrame(() => { window.print(); setTimeout(cleanup, 120000); }));
  });
}

export function printHtml(html, title = '출력') {
  if (prefersInPagePrint()) return printInPage(html);
  const frame = document.createElement('iframe'); frame.title = title;
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.onload = () => { frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true }); frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); };
  frame.srcdoc = html; document.body.append(frame);
}
