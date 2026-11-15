// 쿠팡 파트너스 Open API 상품 검색 클라이언트.
// 서명 방식(CEA HmacSHA256)과 경로·응답 필드는 공식 문서와 실제 키로 아직 검증하지 않았다(validated:false).
// 키는 서버에서만 쓴다. 오류 메시지에 키·서명·원문 응답을 넣지 않는다.
import {createHmac} from 'node:crypto';

export const COUPANG_HOST = 'https://api-gateway.coupang.com';
export const COUPANG_SEARCH_PATH = process.env.COUPANG_SEARCH_PATH || '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';
export const PARTNERS_DISCLOSURE = '이 화면의 구매 링크는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

/** yyMMdd'T'HHmmss'Z' (UTC) */
export function signedDate(now = new Date()) {
 const p = n => String(n).padStart(2, '0');
 return `${p(now.getUTCFullYear() % 100)}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
}

/** Authorization 헤더 값. message = signedDate + METHOD + path + query(물음표 제외) */
export function authorizationHeader({method, path, query, accessKey, secretKey, now}) {
 const date = signedDate(now);
 const signature = createHmac('sha256', secretKey).update(date + method + path + query).digest('hex');
 return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${date}, signature=${signature}`;
}

export class CoupangPartnersClient {
 constructor({accessKey, secretKey, fetchImpl = fetch, timeoutMs = 8000, subId} = {}) {
  if (!accessKey || !secretKey) throw new Error('COUPANG_ACCESS_KEY와 COUPANG_SECRET_KEY가 필요합니다.');
  Object.assign(this, {accessKey, secretKey, fetchImpl, timeoutMs, subId, kind: 'live'});
 }
 async search(keyword, limit = 10) {
  const params = new URLSearchParams({keyword, limit: String(Math.min(Math.max(limit, 1), 20))});
  if (this.subId) params.set('subId', this.subId);
  const query = params.toString();
  const headers = {Authorization: authorizationHeader({method: 'GET', path: COUPANG_SEARCH_PATH, query, accessKey: this.accessKey, secretKey: this.secretKey}), 'Content-Type': 'application/json;charset=UTF-8'};
  let payload;
  try {
   const res = await this.fetchImpl(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {headers, signal: AbortSignal.timeout(this.timeoutMs), redirect: 'error'});
   if (!res.ok) throw new Error('http');
   payload = await res.json();
  } catch {
   throw new Error('쿠팡 파트너스 검색 요청 실패: 키·승인 상태·호출 한도·통신 상태를 확인하세요.');
  }
  return parseSearchResponse(payload);
 }
}

/** 응답 형태가 예상과 다르면 빈 결과로 위장하지 않고 오류를 낸다. */
export function parseSearchResponse(payload) {
 const rows = payload?.data?.productData;
 if (String(payload?.rCode) !== '0' || !Array.isArray(rows)) throw new Error('쿠팡 파트너스 응답 형식이 예상과 다릅니다.');
 return rows.map(r => {
  if (r == null || r.productId == null || typeof r.productName !== 'string') throw new Error('쿠팡 파트너스 상품 항목 형식이 예상과 다릅니다.');
  return {
   productId: String(r.productId),
   name: r.productName,
   price: Number.isFinite(Number(r.productPrice)) ? Number(r.productPrice) : null,
   image: typeof r.productImage === 'string' && r.productImage.startsWith('https://') ? r.productImage : null,
   url: typeof r.productUrl === 'string' && r.productUrl.startsWith('https://') ? r.productUrl : null,
   category: typeof r.categoryName === 'string' ? r.categoryName : null,
   isRocket: r.isRocket === true
  };
 });
}

// 키가 없을 때 쓰는 모의 검색. 실제 상품이 아님을 이름과 kind로 분명히 한다.
const MOCK = [
 {productId: 'mock-1001', name: '[모의] 가상 유기농 쌀과자 오리지널 60g x 3개', price: 8900, category: '유아간식'},
 {productId: 'mock-1002', name: '[모의] 가상 아기 치즈 1단계 18g*10매', price: 7400, category: '유아간식'},
 {productId: 'mock-1003', name: '[모의] 가상 단호박 이유식 100g', price: 3500, category: '이유식'},
 {productId: 'mock-1004', name: '[모의] 가상 사과 퓨레 100ml 10팩', price: 12900, category: '유아음료'}
];
export function createMockCoupang() {
 return {kind: 'mock', async search(keyword, limit = 10) {
  const k = String(keyword).replace(/\s/gu, '');
  const hit = MOCK.filter(p => p.name.replace(/\s/gu, '').includes(k));
  return (hit.length ? hit : MOCK).slice(0, limit).map(p => ({...p, image: null, url: null, isRocket: false}));
 }};
}
