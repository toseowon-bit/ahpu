import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {authorizationHeader, signedDate, parseSearchResponse, CoupangPartnersClient, COUPANG_SEARCH_PATH} from '../src/providers/coupang-partners.js';
import {parseC002, MfdsMaterialsClient} from '../src/providers/mfds-materials.js';
import {findAllergenMentions, findCompositeIngredients, productSearchTerm} from '../public/allergen-keywords.js';
import {readFileSync} from 'node:fs';
import {createApp} from '../src/server.js';

const NOW = new Date(Date.UTC(2026, 10, 15, 3, 4, 5));

test('쿠팡 서명: 날짜 형식과 HMAC 메시지 구성', () => {
 assert.equal(signedDate(NOW), '261115T030405Z');
 const h = authorizationHeader({method: 'GET', path: '/p', query: 'keyword=a', accessKey: 'AK', secretKey: 'SK', now: NOW});
 const sig = createHmac('sha256', 'SK').update('261115T030405Z' + 'GET' + '/p' + 'keyword=a').digest('hex');
 assert.equal(h, `CEA algorithm=HmacSHA256, access-key=AK, signed-date=261115T030405Z, signature=${sig}`);
});

test('쿠팡 응답 파싱: 정상 매핑, https 아닌 이미지·링크 제거', () => {
 const items = parseSearchResponse({rCode: '0', data: {productData: [{productId: 7, productName: '상품', productPrice: 1000, productImage: 'http://x/a.jpg', productUrl: 'https://link.coupang.com/a', categoryName: '간식', isRocket: true}]}});
 assert.deepEqual(items, [{productId: '7', name: '상품', price: 1000, image: null, url: 'https://link.coupang.com/a', category: '간식', isRocket: true}]);
});

test('쿠팡 응답 형식이 다르면 빈 결과로 위장하지 않는다', () => {
 assert.throws(() => parseSearchResponse({rCode: '400', data: {productData: []}}));
 assert.throws(() => parseSearchResponse({rCode: '0', data: {}}));
 assert.throws(() => parseSearchResponse({rCode: '0', data: {productData: [{productName: '이름만'}]}}));
});

test('쿠팡 클라이언트: 경로·서명 헤더 전송, 실패 시 키를 노출하지 않음', async () => {
 let seen;
 const ok = new CoupangPartnersClient({accessKey: 'AK', secretKey: 'SECRET-123', fetchImpl: async (url, opt) => { seen = {url, opt}; return new Response(JSON.stringify({rCode: '0', data: {productData: []}}), {status: 200}); }});
 assert.deepEqual(await ok.search('쌀과자', 50), []);
 const u = new URL(seen.url);
 assert.equal(u.origin + u.pathname, 'https://api-gateway.coupang.com' + COUPANG_SEARCH_PATH);
 assert.equal(u.searchParams.get('keyword'), '쌀과자');
 assert.equal(u.searchParams.get('limit'), '20');
 assert.match(seen.opt.headers.Authorization, /^CEA algorithm=HmacSHA256, access-key=AK, signed-date=\d{6}T\d{6}Z, signature=[0-9a-f]{64}$/);
 const bad = new CoupangPartnersClient({accessKey: 'AK', secretKey: 'SECRET-123', fetchImpl: async () => new Response('{}', {status: 401})});
 await assert.rejects(bad.search('a'), e => !/SECRET-123|AK/.test(e.message));
});

test('식품안전나라 C002: 정상·데이터 없음·형식 오류', () => {
 const ok = parseC002({C002: {RESULT: {CODE: 'INFO-000'}, row: [{PRDLST_NM: '쌀과자', RAWMTRL_NM: '쌀, 탈지분유', BSSH_NM: '업체', PRDLST_REPORT_NO: '123', PRMS_DT: '20250101'}]}});
 assert.deepEqual(ok, [{reportNo: '123', name: '쌀과자', maker: '업체', rawMaterials: '쌀, 탈지분유', reportedAt: '20250101', changedAt: null, licenseNo: null, foodType: null}]);
 assert.deepEqual(parseC002({C002: {RESULT: {CODE: 'INFO-200'}}}), []);
 assert.throws(() => parseC002({C002: {RESULT: {CODE: 'ERROR-300'}}}));
 assert.throws(() => parseC002({C002: {RESULT: {CODE: 'INFO-000'}, row: [{PRDLST_NM: '원재료 없음'}]}}));
});

test('식품안전나라 클라이언트: 제품명 인코딩, 실패 시 인증키를 노출하지 않음', async () => {
 let url;
 const c = new MfdsMaterialsClient({apiKey: 'KEY123', fetchImpl: async u => { url = u; return new Response(JSON.stringify({C002: {RESULT: {CODE: 'INFO-200'}}})); }});
 assert.deepEqual(await c.searchByName('아기 치즈'), []);
 assert.match(url, /\/api\/KEY123\/C002\/json\/1\/10\/PRDLST_NM=%EC%95%84%EA%B8%B0%20%EC%B9%98%EC%A6%88$/);
 const bad = new MfdsMaterialsClient({apiKey: 'KEY123', fetchImpl: async () => { throw new Error('https://x/api/KEY123/C002'); }});
 await assert.rejects(bad.searchByName('a'), e => !e.message.includes('KEY123'));
});

test('원재료 단어 찾기: 표현 매핑, 오탐 예외, 19개 밖 항목', () => {
 const raw = '쌀(국산), 탈지분유, 대두레시틴, 강낭콩, 밀가루(밀:미국산), 키위퓨레, 게르마늄수';
 const hits = findAllergenMentions(raw, ['우유', '대두', '밀', '게'], ['키위']);
 assert.deepEqual([...new Set(hits.map(h => h.allergen))], ['우유', '대두', '밀', '키위']);
 assert.deepEqual(findAllergenMentions('강낭콩, 완두콩, 녹두', ['대두']), []);
 assert.deepEqual(findAllergenMentions('', ['우유']), []);
});

test('쿠팡 상품명 → 식품안전나라 검색어 정리', () => {
 assert.equal(productSearchTerm('[아기밥상] 유기농 쌀과자 오리지널 60g x 3개, 1세트'), '유기농 쌀과자 오리지널');
 assert.equal(productSearchTerm('아기 치즈 1단계 18g*10매'), '아기 치즈 1단계');
 assert.equal(productSearchTerm('베이비 퓨레 (사과) 100ml 10팩'), '베이비 퓨레');
});

test('실제 검색 API: 모의 모드 표시, 입력 검증, live 실패는 502로 알림', async () => {
 const server = createApp();
 await new Promise(r => server.listen(0, '127.0.0.1', r));
 const base = `http://127.0.0.1:${server.address().port}`;
 const failing = createApp({lookup: {coupang: {kind: 'live', search: async () => { throw new Error('쿠팡 파트너스 검색 요청 실패: 확인하세요.'); }}, materials: {kind: 'live', searchByName: async () => []}}});
 await new Promise(r => failing.listen(0, '127.0.0.1', r));
 try {
  const status = await (await fetch(base + '/api/lookup/status')).json();
  assert.equal(status.coupang, 'mock'); assert.equal(status.validated, false); assert.match(status.disclosure, /쿠팡 파트너스/);
  const s = await (await fetch(base + '/api/coupang/search?q=' + encodeURIComponent('쌀과자'))).json();
  assert.equal(s.meta.source, 'mock'); assert.ok(s.items.every(i => i.name.startsWith('[모의]')));
  assert.equal((await fetch(base + '/api/coupang/search?q=')).status, 400);
  assert.equal((await fetch(base + '/api/coupang/search?q=' + 'a'.repeat(51))).status, 400);
  const m = await (await fetch(base + '/api/materials/search?q=' + encodeURIComponent('[모의] 가상 아기 치즈 1단계 18g*10매'))).json();
  assert.equal(m.meta.searchTerm, '가상 아기 치즈 1단계'); assert.ok(m.items.length >= 1);
  const f = await fetch(`http://127.0.0.1:${failing.address().port}/api/coupang/search?q=a`);
  assert.equal(f.status, 502); assert.match((await f.json()).error, /쿠팡 파트너스/);
  const js = await fetch(base + '/allergen-keywords.js');
  assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(js.headers.get('content-security-policy'), /img-src 'self' data: https:\/\/\*\.coupangcdn\.com/);
 } finally {
  await new Promise(r => server.close(r)); await new Promise(r => failing.close(r));
 }
});

test('식품안전나라 실제 견본 응답(C002)을 파싱하고 복합원재료를 감지한다', () => {
 const sample = JSON.parse(readFileSync(new URL('./fixtures/mfds-c002-sample.json', import.meta.url), 'utf8'));
 const rows = parseC002(sample);
 assert.equal(rows.length, 3);
 assert.deepEqual(rows[0], {reportNo: '1997040105528', name: '가시오가피 냉면', maker: '주식회사 금성에프앤비', rawMaterials: '밀가루, 정제수, 타피오카전분, 가시오갈피분말, 알카리제, 정제염', reportedAt: '20020409', changedAt: '20230610', licenseNo: '19970401055', foodType: '숙면'});
 assert.deepEqual(findAllergenMentions(rows[0].rawMaterials, ['밀']).map(h => h.part), ['밀가루']);
 assert.deepEqual(findCompositeIngredients(rows[0].rawMaterials), []);
 assert.deepEqual(findAllergenMentions(rows[1].rawMaterials, ['대두']).map(h => h.part), ['분리대두단백']);
 assert.deepEqual(findCompositeIngredients(rows[2].rawMaterials), ['효소식품', '곡류가공품']);
 assert.deepEqual(findAllergenMentions(rows[2].rawMaterials, ['밀', '우유', '대두']), []);
});

test('리뷰에서 놓친 원재료 표현을 찾는다(난류·우유·게·돼지고기·조개류·쇠고기·영문)', () => {
 const parts = (raw, a) => findAllergenMentions(raw, a).map(h => h.part);
 assert.deepEqual(parts('노른자, 흰자, 마요네즈', ['난류']), ['노른자', '흰자', '마요네즈']);
 assert.deepEqual(parts('탈지유, 유지방, 유고형분, 조제유', ['우유']), ['탈지유', '유지방', '유고형분', '조제유']);
 assert.deepEqual(parts('크랩', ['게']), ['크랩']);
 assert.deepEqual(parts('햄, 베이컨', ['돼지고기']), ['햄', '베이컨']);
 assert.deepEqual(parts('꼬막, 재첩, 대합', ['조개류']), ['꼬막', '재첩', '대합']);
 assert.deepEqual(parts('사골육수', ['쇠고기']), ['사골육수']);
 assert.deepEqual(parts('Wheat flour, Milk, Soybean oil', ['밀', '우유', '대두']), ['Wheat flour', 'Milk', 'Soybean oil']);
});

test('영문·한글 오탐 예외: graham, eggplant, champignon, 햄프, 밀감', () => {
 assert.deepEqual(findAllergenMentions('graham crackers, eggplant, champignon, 햄프씨드, 밀감', ['돼지고기', '난류', '밀']), []);
});

test('기타 알레르기 단어가 객체 내장 이름이어도 오류 없이 동작한다', () => {
 assert.deepEqual(findAllergenMentions('constructor 추출물, toString', [], ['constructor', 'toString', '__proto__']).map(h => h.allergen), ['constructor', 'toString']);
 assert.deepEqual(findAllergenMentions('키위퓨레', ['constructor', '__proto__'], ['키위']).map(h => h.allergen), ['키위']);
});

test('복합원재료를 이름 뒤에 다른 글자가 붙어도 감지한다', () => {
 assert.deepEqual(findCompositeIngredients('기타가공품 10%, 시즈닝분말, 소스류, 효소식품, 혼합분말, 정제수, 쌀'), ['기타가공품 10%', '시즈닝분말', '소스류', '효소식품', '혼합분말']);
});

test('식품안전나라 주소는 HTTPS만 허용하고, 잘못된 키는 해당 경로만 막는다', async () => {
 assert.throws(() => new MfdsMaterialsClient({apiKey: 'KEY', baseUrl: 'http://openapi.foodsafetykorea.go.kr'}), /https/);
 const {createLookupProviders} = await import('../src/providers/lookup.js');
 const p = createLookupProviders({MFDS_API_KEY: 'bad key!'});
 assert.equal(p.materials.kind, 'misconfigured'); assert.equal(p.coupang.kind, 'mock');
 await assert.rejects(p.materials.searchByName('쌀과자', 5), e => /설정이 올바르지 않습니다/.test(e.message) && !e.message.includes('bad key'));
 assert.equal(createLookupProviders({MFDS_API_KEY: 'KEY', MFDS_BASE_URL: 'http://x.example'}).materials.kind, 'misconfigured');
});

test('검색 API: 호출 제한(429), 검색어를 만들 수 없는 상품명(422)', async () => {
 const {createRateLimiter} = await import('../src/rate-limit.js');
 const app = createApp({limiter: createRateLimiter({perClient: 2, total: 100})});
 await new Promise(r => app.listen(0, '127.0.0.1', r));
 const base = `http://127.0.0.1:${app.address().port}`;
 try {
  const empty = await fetch(base + '/api/materials/search?q=' + encodeURIComponent('(특가) [무료배송]'));
  assert.equal(empty.status, 422); assert.match((await empty.json()).error, /검색어를 만들지 못해/);
  assert.equal((await fetch(base + '/api/coupang/search?q=a')).status, 200);
  const limited = await fetch(base + '/api/coupang/search?q=b');
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assert.equal((await fetch(base + '/api/lookup/status')).status, 200);
 } finally { await new Promise(r => app.close(r)); }
});

test('호출 제한: 구간이 지나면 다시 허용, 전체 한도도 적용', async () => {
 const {createRateLimiter} = await import('../src/rate-limit.js');
 let t = 0; const check = createRateLimiter({perClient: 1, total: 2, windowMs: 1000, now: () => t});
 assert.equal(check('a').ok, true); assert.equal(check('a').ok, false);
 assert.equal(check('b').ok, true); assert.equal(check('c').ok, false);
 t = 1000; assert.equal(check('a').ok, true);
});
