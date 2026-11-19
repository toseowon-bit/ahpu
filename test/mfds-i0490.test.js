import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MfdsClient, parseI0490, mapRecallRow} from '../src/providers/mfds-client.js';

const SAMPLE = JSON.parse(readFileSync(new URL('./fixtures/mfds-i0490-sample.json', import.meta.url), 'utf8'));

test('I0490 견본 응답: 실제 필드명으로 매핑한다', () => {
 const rows = parseI0490(SAMPLE, {fetchedAt: '2026-11-20T00:00:00.000Z'});
 assert.equal(rows.length, 5);
 const [first] = rows;
 assert.equal(rows.length, SAMPLE.I0490.row.length);
 assert.equal(first.name, '신선 무');
 assert.equal(first.manufacturer, '엠에스무역(주)');
 assert.equal(first.identifiers.licenseNumber, '20090208707');
 assert.equal(first.identifiers.productCode, 'A0600400100000');
 assert.equal(first.identifiers.reportNumber, null, '빈 PRDLST_REPORT_NO는 null');
 assert.equal(first.barcode, null);
 assert.equal(first.reason, '잔류농약 기준 초과');
 assert.equal(first.grade, '2등급');
 assert.equal(first.productType, '농산물');
 assert.equal(first.productCodeName, '무(뿌리)');
 assert.equal(first.sourceRecordId, '3000237501');
 assert.equal(first.id, 'mfds:I0490:3000237501');
 assert.equal(first.type, 'unspecified', '회수/판매중지 구분 필드가 없으므로 단정하지 않는다');
 assert.equal(first.lot, null);
 assert.deepEqual(first.imageUrls, [], 'http 이미지 주소는 담지 않는다');
 assert.equal(first.provenance.kind, 'mfds');
 assert.equal(first.provenance.fetchedAt, '2026-11-20T00:00:00.000Z');
 assert.equal(first.provenance.sourceUrl, null, '인증키가 들어간 주소를 남기지 않는다');
 // 원문 표기는 그대로 둔다
 assert.equal(first.publishedAt, '2026-11-18 17:07:36.021174');
 assert.equal(first.expiry, '생산년도 : 2026년');
 assert.equal(first.manufacturedAt, '(생산년도) 2026년');
});

test('I0490: 데이터없음 표시는 값 없음으로 본다', () => {
 const rows = parseI0490(SAMPLE);
 const makgeolli = rows.find(r => r.name === '밀양아리랑막걸리');
 assert.equal(makgeolli.manufacturedAt, null);
 assert.equal(makgeolli.barcode, '8809936850114');
 assert.equal(makgeolli.expiry, "(소비기한) '26.12.24, '26.12.25, '26.12.26");
});

test('I0490: 모든 행의 키 집합이 같다(PostgREST 일괄 insert 제약)', () => {
 const rows = parseI0490(SAMPLE);
 const keys = rows.map(r => Object.keys(r).sort().join(','));
 assert.equal(new Set(keys).size, 1);
 const identifierKeys = rows.map(r => Object.keys(r.identifiers).sort().join(','));
 assert.equal(new Set(identifierKeys).size, 1);
});

test('I0490: 식별번호는 숫자로 바꾸지 않는다', () => {
 const row = mapRecallRow({PRDTNM: '가상 제품', PRDLST_REPORT_NO: '0012345', LCNS_NO: '0012-3456', BRCDNO: '0001234567890', RTRVLDSUSE_SEQ: '9000000001'});
 assert.equal(row.identifiers.reportNumber, '0012345');
 assert.equal(row.identifiers.licenseNumber, '0012-3456');
 assert.equal(row.barcode, '0001234567890');
});

test('I0490: 일련번호가 없으면 원문으로 만든 키를 쓴다', () => {
 const raw = {PRDTNM: '가상 제품', BSSHNM: '가상 업체', RTRVLPRVNS: '사유'};
 const a = mapRecallRow(raw);
 const b = mapRecallRow({...raw});
 assert.match(a.sourceRecordId, /^sha256:[0-9a-f]{32}$/);
 assert.equal(a.sourceRecordId, b.sourceRecordId);
 assert.notEqual(a.sourceRecordId, mapRecallRow({...raw, RTRVLPRVNS: '다른 사유'}).sourceRecordId);
});

test('I0490: 데이터 없음은 빈 결과, 인증·형식 오류는 실패', () => {
 assert.deepEqual(parseI0490({I0490: {total_count: '0', RESULT: {CODE: 'INFO-200', MSG: '해당하는 데이터가 없습니다.'}}}), []);
 assert.throws(() => parseI0490({I0490: {total_count: '', RESULT: {CODE: 'INFO-100'}}}), /인증키가 유효하지 않습니다/);
 assert.throws(() => parseI0490({I0490: {RESULT: {CODE: 'INFO-000'}, row: [{BSSHNM: '업체만'}]}}), /항목 형식/);
 assert.throws(() => parseI0490({}));
 assert.throws(() => parseI0490({I0490: {RESULT: {CODE: 'INFO-000'}, row: [{PRDTNM: '제품'}], total_count: 'x'}}));
});

test('I0490 전송: 빈 결과(INFO-200)는 행 0개로 돌려주고 실패로 만들지 않는다', async () => {
 const client = new MfdsClient({apiKey: 'TEST_ONLY', fetchImpl: async () => ({ok: true, json: async () => ({I0490: {total_count: '0', RESULT: {CODE: 'INFO-200'}}})})});
 const result = await client.readRecallPage(1, 1000);
 assert.deepEqual(result.rows, []);
 assert.equal(result.totalCount, 0);
 assert.equal(result.validated, false);
});

test('I0490 전송: 원문 행을 그대로 돌려주고 페이지 한도를 지킨다', async () => {
 let requested;
 const client = new MfdsClient({
  apiKey: 'TEST_ONLY',
  fetchImpl: async url => {
   requested = url;
   return {ok: true, json: async () => ({I0490: {total_count: '1', RESULT: {CODE: 'INFO-000'}, row: [{unverified: true}]}})};
  }
 });
 const result = await client.readRecallPage(1, 1000);
 assert.match(requested, /\/I0490\/json\/1\/1000$/);
 assert.deepEqual(result.rows, [{unverified: true}]);
 await assert.rejects(() => client.readRecallPage(1, 1001), /페이지 범위/);
});
