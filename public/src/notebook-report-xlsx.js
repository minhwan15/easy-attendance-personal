const decoder=new TextDecoder();
const decode=value=>String(value||'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,key)=>{
  if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
  return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key.toLowerCase()];
});
const texts=xml=>[...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>decode(m[1])).join('');
export function worksheetRows(xml,shared=[]){
  const result=[];
  for(const row of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)){
    const values=[];
    for(const cell of row[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)){
      const ref=cell[1].match(/\br="([A-Z]+)\d+"/)?.[1];if(!ref)continue;
      let column=0;for(const char of ref)column=column*26+char.charCodeAt(0)-64;
      if(column>100)throw Error('지원 범위를 넘는 엑셀 열입니다.');
      const type=cell[1].match(/\bt="([^"]+)"/)?.[1],body=cell[2]||'';
      const value=body.match(/<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1]||'';
      values[column-1]=type==='s'?(shared[Number(value)]??''):type==='inlineStr'?texts(body):decode(value);
    }
    result.push(values);if(result.length>5000)throw Error('엑셀을 조회기간별로 나누어 올려 주세요.');
  }
  return result;
}
export async function readReportWorkbook(buffer){
  if(buffer.byteLength>10*1024*1024)throw Error('10MB 이하 엑셀을 올려 주세요.');
  const view=new DataView(buffer),bytes=new Uint8Array(buffer),files=new Map();
  let eocd=-1;for(let n=bytes.length-22;n>=Math.max(0,bytes.length-65557);n--)if(view.getUint32(n,true)===0x06054b50){eocd=n;break;}
  if(eocd<0)throw Error('.xlsx 형식의 나이스 엑셀을 올려 주세요.');
  const count=view.getUint16(eocd+10,true);let offset=view.getUint32(eocd+16,true),total=0;
  if(count>1000)throw Error('엑셀 내부 파일이 너무 많습니다.');
  for(let n=0;n<count;n++){
    if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw Error('엑셀 압축 구조가 올바르지 않습니다.');
    const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),rawSize=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
    const name=decoder.decode(bytes.subarray(offset+46,offset+46+nameLength));offset+=46+nameLength+extra+comment;
    if(!/^xl\/(?:sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name))continue;
    total+=rawSize;if(total>25*1024*1024||(flags&1))throw Error('엑셀 크기 또는 암호 설정을 확인해 주세요.');
    if(local+30>bytes.length||view.getUint32(local,true)!==0x04034b50)throw Error('엑셀 파일 위치가 올바르지 않습니다.');
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
    if(start+size>bytes.length)throw Error('엑셀 파일이 잘렸습니다.');
    let data=bytes.subarray(start,start+size);
    if(method===8){
      if(typeof DecompressionStream==='undefined')throw Error('최신 Chrome에서 엑셀을 올려 주세요.');
      const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let length=0;
      while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>rawSize||length>25*1024*1024){await reader.cancel();throw Error('압축 해제 크기를 초과했습니다.');}chunks.push(next.value);}
      data=new Uint8Array(length);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
    }else if(method!==0)throw Error('지원하지 않는 엑셀 압축 방식입니다.');
    if(data.length!==rawSize)throw Error('엑셀 압축 해제 결과가 올바르지 않습니다.');
    files.set(name,decoder.decode(data));
  }
  const shared=[...(files.get('xl/sharedStrings.xml')||'').matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>texts(m[1]));
  const sheets=[...files].filter(([name])=>name.startsWith('xl/worksheets/')).map(([,xml])=>worksheetRows(xml,shared));
  if(!sheets.length)throw Error('엑셀 시트를 찾지 못했습니다.');
  return sheets;
}
