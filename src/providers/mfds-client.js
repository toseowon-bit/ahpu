/** I0490(회수·판매중지) 전송 계층과 응답 매핑. 웹 provider와 연결하지 않음. */
// 필드명은 공개 견본(sample 인증키) 응답으로 확인했다(2026-11-20, test/fixtures/mfds-i0490-sample.json):
// PRDTNM, BSSHNM, BRCDNO, PRDLST_CD, PRDLST_CD_NM, PRDLST_REPORT_NO, LCNS_NO, PRDLST_TYPE,
// RTRVLPRVNS, RTRVL_GRDCD_NM, RTRVLDSUSE_SEQ, RTRVLPLANDOC_RTRVLMTHD, MNFDT, DISTBTMLMT,
// FRMLCUNIT, ADDR, TELNO, IMG_FILE_PATH, CRET_DTM.
// 같은 계열 API인 C002는 업체명이 BSSH_NM이지만 I0490은 BSSHNM이다(밑줄 없음).
// 실제 발급 인증키로는 아직 확인하지 않았다(validated:false).
import {createHash} from 'node:crypto';
import {
 assertApiKey, assertPageRange, cleanText, fetchServiceJson, normalizeBaseUrl, readServiceResult
} from './mfds-common.js';

export class MfdsClient {
 constructor({apiKey, baseUrl, fetchImpl = fetch, timeoutMs = 8000} = {}) {
  assertApiKey(apiKey);
  Object.assign(this, {apiKey, base: normalizeBaseUrl(baseUrl), fetchImpl, timeoutMs});
 }
 async readRecallPage(start = 1, end = 100) {
  assertPageRange(start, end);
  // HTTPS 지원 여부도 실제 인증키로 검증 필요. HTTP로 자동 강등하지 않는다.
  const url = `${this.base}/api/${this.apiKey}/I0490/json/${start}/${end}`;
  const payload = await fetchServiceJson({
   fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs, url,
   failureMessage: '식약처 API 검증 요청 실패: 인증·응답 스키마·통신 상태를 확인하세요.'
  });
  const {rows, totalCount} = readServiceResult(payload?.I0490, {serviceId: 'I0490'});
  return {rows, totalCount, fetchedAt: new Date().toISOString(), serviceId: 'I0490', validated: false};
 }
}

/**
 * I0490 응답을 앱 모델(SafetyEvent)에 맞춘 기록으로 바꾼다.
 * 원문 표기를 그대로 두고(날짜·기한 문자열), 해석이 필요한 값은 바꾸지 않는다.
 * @typedef {{id:string,type:'unspecified',name:string,manufacturer:string|null,
 * identifiers:{reportNumber:string|null,licenseNumber:string|null,productCode:string|null},
 * barcode:string|null,reason:string|null,grade:string|null,productType:string|null,
 * productCodeName:string|null,manufacturedAt:string|null,expiry:string|null,lot:null,
 * action:string|null,address:string|null,phone:string|null,packageUnit:string|null,
 * imageUrls:string[],publishedAt:string|null,sourceRecordId:string,
 * provenance:{kind:'mfds',sourceRecordId:string,sourceUrl:null,fetchedAt:string}}} MfdsRecallRecord
 */
export function parseI0490(payload, {fetchedAt = new Date().toISOString()} = {}) {
 const {rows} = readServiceResult(payload?.I0490, {serviceId: 'I0490'});
 return rows.map(row => mapRecallRow(row, fetchedAt));
}

export function mapRecallRow(row, fetchedAt = new Date().toISOString()) {
 if (typeof row?.PRDTNM !== 'string' || !row.PRDTNM.trim()) throw new Error('식품안전나라 I0490 항목 형식이 예상과 다릅니다.');
 const sourceRecordId = cleanText(row.RTRVLDSUSE_SEQ) || fallbackRecordId(row);
 return {
  id: `mfds:I0490:${sourceRecordId}`,
  // 견본 응답에는 회수/판매중지를 나누는 필드가 없어 단정하지 않는다.
  type: 'unspecified',
  name: row.PRDTNM.trim(),
  manufacturer: cleanText(row.BSSHNM),
  identifiers: {
   reportNumber: cleanText(row.PRDLST_REPORT_NO),
   licenseNumber: cleanText(row.LCNS_NO),
   productCode: cleanText(row.PRDLST_CD)
  },
  barcode: cleanText(row.BRCDNO),
  reason: cleanText(row.RTRVLPRVNS),
  grade: cleanText(row.RTRVL_GRDCD_NM),
  productType: cleanText(row.PRDLST_TYPE),
  productCodeName: cleanText(row.PRDLST_CD_NM),
  manufacturedAt: cleanText(row.MNFDT),
  expiry: cleanText(row.DISTBTMLMT),
  lot: null, // I0490에는 LOT 필드가 없다. 수입·제조 단위 확인은 별도 자료가 필요하다.
  action: cleanText(row.RTRVLPLANDOC_RTRVLMTHD),
  address: cleanText(row.ADDR),
  phone: cleanText(row.TELNO),
  packageUnit: cleanText(row.FRMLCUNIT),
  // 식약처 이미지 주소는 http://라서 앱·브라우저에 그대로 쓰지 않는다. https만 남긴다.
  imageUrls: splitImageUrls(row.IMG_FILE_PATH),
  publishedAt: cleanText(row.CRET_DTM),
  sourceRecordId,
  provenance: {kind: 'mfds', sourceRecordId, sourceUrl: null, fetchedAt}
 };
}

// 일련번호가 비어 있는 행도 버리지 않고 원문 내용으로 같은 기록임을 알아볼 수 있게 한다.
function fallbackRecordId(row) {
 const canonical = JSON.stringify(Object.keys(row).sort().map(k => [k, row[k]]));
 return `sha256:${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}

function splitImageUrls(value) {
 const text = cleanText(value);
 if (!text) return [];
 return text.split(',')
  .map(part => part.trim())
  .filter(part => /^https:\/\//i.test(part));
}
