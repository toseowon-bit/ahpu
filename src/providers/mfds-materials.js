// 식품안전나라 C002(식품 품목제조보고 원재료) 제품명 검색 클라이언트.
// 응답 필드는 공개 견본(sample 키) 응답으로 확인했다(2026-11-15, test/fixtures/mfds-c002-sample.json).
// 제품명 검색 변수(PRDLST_NM=)와 HTTPS 동작은 실제 인증키로 아직 검증하지 않았다(validated:false).
// 확인 사항: 이 개발 환경에서 openapi.foodsafetykorea.go.kr:443은 TLS 연결이 끊겼다(2026-11-15).
// HTTPS 지원 여부와 해외(Vercel) 서버에서의 접근 가능 여부를 실제 키로 확인해야 한다.
// 인증키가 URL 경로에 들어가므로 오류·로그에 URL을 남기지 않는다.

export const MFDS_BASE = 'https://openapi.foodsafetykorea.go.kr';

export class MfdsMaterialsClient {
 constructor({apiKey, baseUrl, fetchImpl = fetch, timeoutMs = 8000} = {}) {
  if (!apiKey || !/^[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error('유효한 MFDS_API_KEY가 필요합니다.');
  // 인증키가 URL 경로에 들어가므로 HTTPS 주소만 허용한다(HTTP로 바꾸면 키가 암호화 없이 전송됨).
  const base = String(baseUrl || MFDS_BASE).replace(/\/+$/, '');
  if (new URL(base).protocol !== 'https:') throw new Error('MFDS_BASE_URL은 https:// 주소여야 합니다.');
  Object.assign(this, {apiKey, base, fetchImpl, timeoutMs, kind: 'live'});
 }
 async searchByName(name, limit = 10) {
  const term = String(name || '').trim();
  if (!term) return [];
  const end = Math.min(Math.max(limit, 1), 30);
  const url = `${this.base}/api/${this.apiKey}/C002/json/1/${end}/PRDLST_NM=${encodeURIComponent(term)}`;
  let payload;
  try {
   const res = await this.fetchImpl(url, {signal: AbortSignal.timeout(this.timeoutMs), redirect: 'error'});
   if (!res.ok) throw new Error('http');
   payload = await res.json();
  } catch {
   throw new Error('식품안전나라 원재료 조회 실패: 인증키·서비스 상태·통신(HTTPS/해외 접근)을 확인하세요.');
  }
  return parseC002(payload);
 }
}

export function parseC002(payload) {
 const data = payload?.C002;
 const code = data?.RESULT?.CODE;
 if (code === 'INFO-200') return []; // 해당하는 데이터 없음(식품안전나라 공통 코드)
 if (!data || code !== 'INFO-000' || !Array.isArray(data.row)) throw new Error('식품안전나라 C002 응답 형식이 예상과 다릅니다.');
 return data.row.map(r => {
  if (typeof r?.PRDLST_NM !== 'string' || typeof r?.RAWMTRL_NM !== 'string') throw new Error('식품안전나라 C002 항목 형식이 예상과 다릅니다.');
  return {
   reportNo: r.PRDLST_REPORT_NO ? String(r.PRDLST_REPORT_NO) : null,
   name: r.PRDLST_NM,
   maker: typeof r.BSSH_NM === 'string' ? r.BSSH_NM : null,
   rawMaterials: r.RAWMTRL_NM,
   reportedAt: typeof r.PRMS_DT === 'string' ? r.PRMS_DT : null,
   changedAt: typeof r.CHNG_DT === 'string' ? r.CHNG_DT : null,
   licenseNo: r.LCNS_NO ? String(r.LCNS_NO) : null,
   foodType: typeof r.PRDLST_DCNM === 'string' ? r.PRDLST_DCNM : null
  };
 });
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
