// Excel supplies text AND a rendered image: prefer its lossless text representation.
export function clipboardText(data) {
  if(!data)return '';
  const plain=data.getData?.('text/plain')||'';
  if(plain.trim())return plain;
  const html=data.getData?.('text/html')||'';
  if(!/<table[\s>]/i.test(html)||typeof DOMParser==='undefined')return '';
  const document=new DOMParser().parseFromString(html,'text/html');
  return [...document.querySelectorAll('table tr')].map(row=>[...row.children].filter(cell=>/^(TD|TH)$/.test(cell.tagName)).map(cell=>cell.textContent.replace(/\s+/g,' ').trim()).join('\t')).filter(Boolean).join('\n');
}
export function clipboardImages(data) {
  if(!data)return [];
  if(clipboardText(data).trim())return [];
  const supported=file=>file&&/^image\/(png|jpeg|webp)$/i.test(file.type);
  const items=Array.from(data.items||[]).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(supported);
  return items.length?items:Array.from(data.files||[]).filter(supported);
}
