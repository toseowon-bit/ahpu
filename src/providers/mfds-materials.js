// 식품안전나라 C002(식품 품목제조보고 원재료) 클라이언트.
// 응답 필드는 공개 견본(sample 인증키) 응답으로 확인했다(2026-11-20, test/fixtures/mfds-c002-sample.json).
// 필드: PRDLST_REPORT_NO, PRDLST_NM, BSSH_NM(I0490의 BSSHNM과 다름), LCNS_NO, PRDLST_DCNM,
// RAWMTRL_NM, RAWMTRL_ORDNO, PRMS_DT, CHNG_DT, ETQTY_XPORT_PRDLST_YN.
// 제품명 검색 변수(PRDLST_NM=)는 견본 키로 동작을 확인했지만 실제 발급 인증키로는 아직 검증하지 않았다(validated:false).
// 인증키가 URL 경로에 들어가므로 오류·로그에 URL을 남기지 않는다.
import {createHash} from 'node:crypto';
import {
 MFDS_BASE, MFDS_MAX_PAGE_SIZE, assertApiKey, assertPageRange, cleanText, fetchServiceJson,
 normalizeBaseUrl, readServiceResult
} from './mfds-common.js';

export {MFDS_BASE};

export class MfdsMaterialsClient {
 constructor({apiKey, baseUrl, fetchImpl = fetch, timeoutMs = 8000} = {}) {
  assertApiKey(apiKey);
  Object.assign(this, {apiKey, base: normalizeBaseUrl(baseUrl), fetchImpl, timeoutMs, kind: 'live'});
 }
 async searchByName(name, limit = 10) {
  const term = String(name || '').trim();
  if (!term) return [];
  const end = Math.min(Math.max(limit, 1), 30);
  const {rows} = await this.#read(1, end, `PRDLST_NM=${encodeURIComponent(term)}`);
  return rows.map(mapMaterialsRecord);
 }
 // 전체 수집용 페이지 읽기. 원문 행을 그대로 돌려준다(매핑은 mapMaterialsRecord).
 async readPage(start = 1, end = MFDS_MAX_PAGE_SIZE) {
  assertPageRange(start, end);
  const {rows, totalCount} = await this.#read(start, end);
  return {rows, totalCount, fetchedAt: new Date().toISOString(), serviceId: 'C002', validated: false};
 }
 async #read(start, end, filter) {
  const suffix = filter ? `/${filter}` : '';
  const url = `${this.base}/api/${this.apiKey}/C002/json/${start}/${end}${suffix}`;
  const payload = await fetchServiceJson({
   fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs, url,
   failureMessage: '식품안전나라 원재료 조회 실패: 인증키·서비스 상태·통신(HTTPS/해외 접근)을 확인하세요.'
  });
  return readServiceResult(payload?.C002, {serviceId: 'C002', requiredRows: false});
 }
}

export function parseC002(payload) {
 const {rows} = readServiceResult(payload?.C002, {serviceId: 'C002', requiredRows: false});
 return rows.map(mapMaterialsRecord);
}

// 품목제조보고 한 건을 제품 카탈로그 행으로 옮긴다. 원문 날짜(YYYYMMDD)와 표시 문자열을 그대로 둔다.
// 웹 API(`/api/materials/search`) 응답 형태를 바꾸지 않기 위해 여기서는 기존 8개 항목만 돌려준다.
export function mapMaterialsRecord(r) {
 if (typeof r?.PRDLST_NM !== 'string' || typeof r?.RAWMTRL_NM !== 'string') throw new Error('식품안전나라 C002 항목 형식이 예상과 다릅니다.');
 return {
  reportNo: cleanText(r.PRDLST_REPORT_NO),
  name: r.PRDLST_NM,
  maker: cleanText(r.BSSH_NM),
  rawMaterials: r.RAWMTRL_NM,
  reportedAt: cleanText(r.PRMS_DT),
  changedAt: cleanText(r.CHNG_DT),
  licenseNo: cleanText(r.LCNS_NO),
  foodType: cleanText(r.PRDLST_DCNM)
 };
}

// 제품명이 같은 보고가 여러 건일 수 있으므로 식별번호를 기록 키로 쓴다. 없으면 원문으로 만든 키를 쓴다.
export function materialsRecordKey(r) {
 const reportNo = cleanText(r?.PRDLST_REPORT_NO);
 if (reportNo) return reportNo;
 const canonical = JSON.stringify(Object.keys(r || {}).sort().map(k => [k, r[k]]));
 return `sha256:${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}

// 인증키가 없을 때 쓰는 모의 원재료. 실제 제품·업체가 아니다.
const MOCK = [
 {reportNo: 'MOCK-0001', name: '[모의] 가상 유기농 쌀과자', maker: '가상 햇살식품', rawMaterials: '유기농쌀(국산), 탈지분유, 대두레시틴, 정제소금', reportedAt: '20250101'},
 {reportNo: 'MOCK-0002', name: '[모의] 가상 유기농 쌀과자 오리지널', maker: '가상 달빛식품', rawMaterials: '쌀(국산), 현미, 기타가공품, 혼합제제', reportedAt: '20240615'},
 {reportNo: 'MOCK-0003', name: '[모의] 가상 아기 치즈', maker: '가상 바다유업', rawMaterials: '자연치즈(우유), 정제수, 구연산삼나트륨', reportedAt: '20230910'},
 {reportNo: 'MOCK-0004', name: '[모의] 가상 단호박 이유식', maker: '가상 초록식품', rawMaterials: '단호박(국산), 쌀, 소고기(호주산), 밀가루(밀)', reportedAt: '20250320'},
 {reportNo: 'MOCK-0005', name: '[모의] 가상 사과 퓨레', maker: '가상 아침식품', rawMaterials: '사과(국산), 키위퓨레, 비타민C', reportedAt: '20240401'}
];
export function createMockMaterials() {
 return {kind: 'mock', async searchByName(name, limit = 10) {
  const k = String(name || '').replace(/\[모의\]|가상|\s/gu, '');
  return MOCK.filter(m => {
   const n = m.name.replace(/\[모의\]|가상|\s/gu, '');
   return k && (n.includes(k) || k.includes(n));
  }).slice(0, limit);
 }};
}
