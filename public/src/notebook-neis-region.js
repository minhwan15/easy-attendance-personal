/** 시도교육청별 나이스 주소. 출결 입력 보내기를 누를 때 이 지역 나이스를 함께 엽니다. */
export const NEIS_REGIONS = Object.freeze([['sen','서울'],['pen','부산'],['dge','대구'],['ice','인천'],['gen','광주'],['dje','대전'],['use','울산'],['sje','세종'],['goe','경기'],['gwe','강원'],['cbe','충북'],['cne','충남'],['jbe','전북'],['jne','전남'],['gbe','경북'],['gne','경남'],['jje','제주']]);
export const DEFAULT_NEIS_REGION = '';
export const validNeisRegion = code => NEIS_REGIONS.some(([value]) => value === code);
export const neisRegionOf = settings => validNeisRegion(settings?.neisRegion) ? settings.neisRegion : DEFAULT_NEIS_REGION;
export const neisRegionName = code => NEIS_REGIONS.find(([value]) => value === code)?.[1] || '';
export const neisUrl = code => `https://${code}.neis.go.kr/`;
