// 실제 쿠팡 검색 + 식품안전나라 원재료 조회 provider 선택.
// 키가 있으면 live, 없으면 모의(kind:'mock'). live 실패를 모의 데이터로 대체하지 않는다.
import {CoupangPartnersClient, createMockCoupang} from './coupang-partners.js';
import {MfdsMaterialsClient, createMockMaterials} from './mfds-materials.js';

export function createLookupProviders(env = process.env) {
 const coupang = env.COUPANG_ACCESS_KEY && env.COUPANG_SECRET_KEY
  ? new CoupangPartnersClient({accessKey: env.COUPANG_ACCESS_KEY, secretKey: env.COUPANG_SECRET_KEY, subId: env.COUPANG_SUB_ID})
  : createMockCoupang();
 const materials = env.MFDS_API_KEY ? new MfdsMaterialsClient({apiKey: env.MFDS_API_KEY}) : createMockMaterials();
 return {coupang: withCache(coupang), materials};
}

// 쿠팡 검색은 호출 한도가 있어 같은 검색어를 5분간 재사용한다(서버 인스턴스 메모리, 최대 100개).
function withCache(client, ttlMs = 5 * 60 * 1000) {
 const cache = new Map();
 return {kind: client.kind, async search(keyword, limit) {
  const key = `${keyword}|${limit}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.items;
  const items = await client.search(keyword, limit);
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(key, {at: Date.now(), items});
  return items;
 }};
}
