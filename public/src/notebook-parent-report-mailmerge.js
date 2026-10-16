export const smsBytes=text=>[...String(text)].reduce((size,c)=>size+(c.charCodeAt(0)<=127?1:2),0);
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function mailmergeRows(items,today){
 const groups=new Map();
 for(const item of items){
  if(item.status!=='missing'||item.reasonType==='미인정')continue;
  if(!groups.has(item.studentId))groups.set(item.studentId,{name:item.studentName,events:new Map()});
  groups.get(item.studentId).events.set(item.date+'|'+item.kind,item);
 }
 return [['학번',''],...[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([id,group])=>{
  const events=[...group.events.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind));
  const details=events.map(e=>e.date.slice(5).replace('-','/')+' '+e.kind+'. '+(e.deadline?e.deadline.dueDate.slice(5).replace('-','/')+'까지 ':'')).join('/ ');
  return [id,'[출결신고서 누락] '+group.name+' '+details+'나이스 학부모서비스에 제출 바랍니다.'];
 })];
}
function zip(files){
 const enc=new TextEncoder(),chunks=[],central=[];let offset=0;
 const header=(size)=>new Uint8Array(size);
 const put=(a,o,n,bytes)=>{for(let i=0;i<bytes;i++)a[o+i]=(n>>>(i*8))&255;};
 for(const [name,text]of Object.entries(files)){
  const filename=enc.encode(name),data=enc.encode(text);let crc=0xffffffff;
  for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  crc=(crc^0xffffffff)>>>0;
  const h=header(30);put(h,0,0x04034b50,4);put(h,4,20,2);put(h,14,crc,4);put(h,18,data.length,4);put(h,22,data.length,4);put(h,26,filename.length,2);
  const c=header(46);put(c,0,0x02014b50,4);put(c,4,20,2);put(c,6,20,2);put(c,16,crc,4);put(c,20,data.length,4);put(c,24,data.length,4);put(c,28,filename.length,2);put(c,42,offset,4);
  chunks.push(h,filename,data);central.push(c,filename);offset+=h.length+filename.length+data.length;
 }
 const size=central.reduce((sum,a)=>sum+a.length,0),end=header(22);put(end,0,0x06054b50,4);put(end,8,Object.keys(files).length,2);put(end,10,Object.keys(files).length,2);put(end,12,size,4);put(end,16,offset,4);
 const all=[...chunks,...central,end],out=new Uint8Array(offset+size+end.length);let pos=0;for(const a of all){out.set(a,pos);pos+=a.length;}return out;
}
export function mailmergeWorkbook(rows){
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const sheet='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="'+ns+'"><cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="100" customWidth="1"/></cols><sheetData>'+rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>'<c r="'+String.fromCharCode(65+j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
 return zip({
 '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="메일머지" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':sheet
 });
}
export function downloadMailmerge(rows,today){
 const blob=new Blob([mailmergeWorkbook(rows)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='신고서_미제출_메일머지_'+today+'.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
