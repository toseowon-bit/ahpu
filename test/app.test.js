import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp, assets} from '../src/server.js';
import {PRODUCTS, compareChild, overallStatus, alternativesFor, parseLookup, searchProducts, productById} from '../public/catalog.js';

let server,base;
before(async()=>{server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
after(()=>new Promise(r=>server.close(r)));

test('보호자 앱(/)은 모바일 뷰포트와 하단 탭바를 갖고, CSP에 막히는 인라인 코드를 쓰지 않는다', async () => {
 const r = await fetch(base + '/'); assert.equal(r.status, 200);
 const html = await r.text();
 assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
 assert.match(html, /class="tabbar"/);
 assert.match(html, /가상 제품/); // 실제 데이터가 아님을 알린다
 assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
 assert.doesNotMatch(html, /<style|\sstyle=/);
 assert.doesNotMatch(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), /\sstyle=/);
});

test('app.js가 import하는 모듈은 서버 허용 목록에 있다', () => {
 const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
 const imports = [...src.matchAll(/from '\.\/([\w.-]+\.js)'/g)].map(m => m[1]);
 assert.deepEqual(imports.sort(), ['catalog.js', 'route.js']);
 for (const f of ['app.js', 'styles.css', ...imports]) assert.ok(assets['/' + f], f);
});

test('모바일 입력창은 16px 이상이라 iOS에서 확대되지 않는다', () => {
 const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
 assert.match(css, /input\[type=text\],input\[type=search\],select\{[^}]*font-size:16px/);
});

const kid = (allergens, custom = []) => ({id:'k', alias:'첫째', age:2, allergens, custom});

test('자녀 대조: 함유 > 혼입 가능성 > 대조 불가 > 일치 없음, 표시 부족은 정보 부족', () => {
 const p02 = productById('p02'); // 난류·우유 함유, 밀 혼입 가능성
 assert.equal(compareChild(p02, kid(['우유'])).key, 'match');
 assert.equal(compareChild(p02, kid(['밀'])).key, 'may');
 assert.equal(compareChild(p02, kid([], ['키위'])).key, 'na');
 assert.equal(compareChild(p02, kid(['땅콩'])).key, 'none');
 assert.equal(compareChild(productById('p06'), kid(['우유'])).key, 'info');
});

test('종합 상태: 회수 우선, 자녀가 없으면 일치 없음으로 보이지 않는다', () => {
 assert.equal(overallStatus('p09', [kid([])]), 'recall');
 assert.equal(overallStatus('p02', []), 'nokid');
 assert.equal(overallStatus('p02', [kid(['땅콩']), kid(['우유'])]), 'match');
 assert.equal(overallStatus('nope', []), 'unreg');
});

test('대안 제품은 모든 자녀 기준 함유·혼입 표시가 없고 회수되지 않은 같은 종류다', () => {
 const kids = [kid(['우유']), kid(['대두'])];
 const alts = alternativesFor(productById('p03'), kids);
 assert.ok(alts.length > 0);
 for (const q of alts) {
  assert.equal(q.category, '간식');
  assert.ok(!q.contains.concat(q.may).some(a => ['우유','대두'].includes(a)));
  assert.notEqual(q.id, 'p03');
 }
});

test('검색창 입력 해석: 쿠팡 링크 매칭·묶음·실패, 다른 사이트, 일반 검색어', () => {
 assert.deepEqual(parseLookup('https://www.coupang.com/vp/products/1001?x=1'), {kind:'product', pid:'p02'});
 assert.deepEqual(parseLookup('https://m.coupang.com/vm/products/2002'), {kind:'bundle', id:'2002'});
 assert.deepEqual(parseLookup('https://www.coupang.com/vp/products/9999'), {kind:'nomatch'});
 assert.deepEqual(parseLookup('https://www.coupang.com.evil.example/vp/products/1001'), {kind:'not-coupang'});
 assert.deepEqual(parseLookup('https://www.coupang.com/vp/products/constructor'), {kind:'nomatch'});
 assert.deepEqual(parseLookup('  쌀과자 '), {kind:'query', q:'쌀과자'});
});

test('제품 검색은 공백·대소문자를 무시하고 종류로 좁힌다', () => {
 assert.equal(searchProducts('쌀 과자').length, 3);
 assert.ok(searchProducts('', '음료').every(p => p.category === '음료'));
 assert.equal(searchProducts('').length, PRODUCTS.length);
});
