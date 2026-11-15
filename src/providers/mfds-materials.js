// 식품안전나라 C002(식품 품목제조보고 원재료) 제품명 검색 클라이언트.
// 서비스 ID·요청 변수·응답 필드는 실제 인증키로 아직 검증하지 않았다(validated:false).
// 확인 사항: 이 개발 환경에서 openapi.foodsafetykorea.go.kr:443은 TLS 연결이 끊겼다(2026-11-15).
// HTTPS 지원 여부와 해외(Vercel) 서버에서의 접근 가능 여부를 실제 키로 확인해야 한다.
// 인증키가 URL 경로에 들어가므로 오류·로그에 URL을 남기지 않는다.

export const MFDS_BASE = process.env.MFDS_BASE_URL || 'https://openapi.foodsafetykorea.go.kr';

export class MfdsMaterialsClient {
 constructor({apiKey, fetchImpl = fetch, timeoutMs = 8000} = {}) {
  if (!apiKey || !/^[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error('유효한 MFDS_API_KEY가 필요합니다.');
  Object.assign(this, {apiKey, fetchImpl, timeoutMs, kind: 'live'});
 }
 async searchByName(name, limit = 10) {
  const term = String(name || '').trim();
  if (!term) return [];
  const end = Math.min(Math.max(limit, 1), 30);
  const url = `${MFDS_BASE}/api/${this.apiKey}/C002/json/1/${end}/PRDLST_NM=${encodeURIComponent(term)}`;
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
   reportedAt: typeof r.PRMS_DT === 'string' ? r.PRMS_DT : null
  };
 });
}

// 인증키가 없을 때 쓰는 모의 원재료. 실제 제품·업체가 아니다.
const MOCK = [
 {reportNo: 'MOCK-0001', name: '[모의] 가상 유기농 쌀과자', maker: '가상 햇살식품', rawMaterials: '유기농쌀(국산), 탈지분유, 대두레시틴, 정제소금', reportedAt: '20250101'},
 {reportNo: 'MOCK-0002', name: '[모의] 가상 유기농 쌀과자 오리지널', maker: '가상 달빛식품', rawMaterials: '쌀(국산), 현미, 비타민C', reportedAt: '20240615'},
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
