// 실제 쿠팡 검색 + 식품안전나라 원재료 조회 provider 선택.
// 키가 있으면 live, 없으면 모의(kind:'mock'). live 실패를 모의 데이터로 대체하지 않는다.
// 키 형식이 잘못되면 그 provider만 'misconfigured'가 되어 해당 경로만 오류를 낸다(다른 API는 계속 동작).
import {CoupangPartnersClient, createMockCoupang} from './coupang-partners.js';
import {MfdsMaterialsClient, createMockMaterials} from './mfds-materials.js';

function misconfigured(message) {
 const fail = async () => { throw new Error(message); };
 return {kind: 'misconfigured', search: fail, searchByName: fail};
}
function safely(create, message) {
 try { return create(); } catch { return misconfigured(message); }
}

export function createLookupProviders(env = process.env) {
 const coupang = env.COUPANG_ACCESS_KEY && env.COUPANG_SECRET_KEY
  ? safely(() => new CoupangPartnersClient({accessKey: env.COUPANG_ACCESS_KEY, secretKey: env.COUPANG_SECRET_KEY, subId: env.COUPANG_SUB_ID}),
    '쿠팡 파트너스 키 설정이 올바르지 않습니다. 서버 환경 변수를 확인하세요.')
  : createMockCoupang();
 const materials = env.MFDS_API_KEY
  ? safely(() => new MfdsMaterialsClient({apiKey: env.MFDS_API_KEY, baseUrl: env.MFDS_BASE_URL}),
    '식품안전나라 인증키 또는 주소 설정이 올바르지 않습니다(HTTPS만 허용). 서버 환경 변수를 확인하세요.')
  : createMockMaterials();
 return {
  coupang: {kind: coupang.kind, search: cached((k, n) => coupang.search(k, n))},
  materials: {kind: materials.kind, searchByName: cached((k, n) => materials.searchByName(k, n))}
 };
}

// 외부 API 호출 한도를 아끼려고 같은 요청을 5분간 재사용한다(서버 인스턴스 메모리, 최대 100개). 실패는 캐시하지 않는다.
function cached(fn, ttlMs = 5 * 60 * 1000, max = 100) {
 const cache = new Map();
 return async (keyword, limit) => {
  const key = `${keyword}|${limit}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.items;
  const items = await fn(keyword, limit);
  if (cache.size >= max) cache.delete(cache.keys().next().value);
  cache.set(key, {at: Date.now(), items});
  return items;
 };
}
