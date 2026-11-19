import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 runSync, mapPageRows, toSafetyEventRow, toProductRow, parseSyncArgs, SYNC_SERVICES
} from '../src/db/mfds-sync.js';

const C002 = JSON.parse(readFileSync(new URL('./fixtures/mfds-c002-sample.json', import.meta.url), 'utf8')).C002;

function rawRecall(i) {
 return {
  RTRVLDSUSE_SEQ: String(3000000000 + i),
  PRDTNM: `가상 제품 ${i}`,
  BSSHNM: '가상 업체',
  PRDLST_REPORT_NO: '',
  LCNS_NO: `2012${String(i).padStart(7, '0')}`,
  BRCDNO: '',
  RTRVLPRVNS: '가상 사유',
  MNFDT: '데이터없음',
  DISTBTMLMT: '(소비기한) 2027-01-01',
  RTRVL_GRDCD_NM: '2등급',
  CRET_DTM: '2026-11-18 17:07:36.021174'
 };
}

// 페이지마다 정해진 행을 돌려주는 식약처 클라이언트 대역.
function fakeClient({totalCount, pageRows}) {
 const calls = [];
 let index = 0;
 return {
  calls,
  async readRecallPage(start, end) {
   calls.push([start, end]);
   const rows = pageRows[index++] ?? [];
   return {rows, totalCount, fetchedAt: '2026-11-20T00:00:00.000Z', serviceId: 'I0490', validated: false};
  },
  async readPage(start, end) {
   calls.push([start, end]);
   const rows = pageRows[index++] ?? [];
   return {rows, totalCount, fetchedAt: '2026-11-20T00:00:00.000Z', serviceId: 'C002', validated: false};
  }
 };
}

// Supabase 대역. 체크포인트를 한 줄만 기억한다.
function memoryRest(initial = null) {
 const state = {checkpoint: initial, upserts: [], saves: []};
 return {
  state,
  async selectOne(table) {
   return table === 'ingestion_checkpoints' ? state.checkpoint : null;
  },
  async upsert(table, rows, options) {
   if (table === 'ingestion_checkpoints') {
    state.checkpoint = {...rows[0]};
    state.saves.push({...rows[0], options});
   } else {
    state.upserts.push({table, rows, options});
   }
   return {rows: rows.length, chunks: 1};
  }
 };
}

test('I0490 전체 수집: 페이지를 끝까지 읽고 체크포인트를 완료로 남긴다', async () => {
 const pages = [
  Array.from({length: 1000}, (_, i) => rawRecall(i)),
  Array.from({length: 1000}, (_, i) => rawRecall(1000 + i)),
  Array.from({length: 500}, (_, i) => rawRecall(2000 + i))
 ];
 const client = fakeClient({totalCount: 2500, pageRows: pages});
 const rest = memoryRest();
 const summary = await runSync({service: 'I0490', client, rest, now: () => '2026-11-20T00:00:00.000Z', sleep: async () => {}});
 assert.deepEqual(client.calls, [[1, 1000], [1001, 2000], [2001, 3000]]);
 assert.equal(summary.pages, 3);
 assert.equal(summary.rows, 2500);
 assert.equal(summary.status, 'completed');
 assert.equal(summary.nextStart, 3001);
 assert.equal(summary.totalCount, 2500);
 const last = rest.state.checkpoint;
 assert.equal(last.status, 'completed');
 assert.equal(last.next_start, 3001);
 assert.equal(last.rows_synced, 2500);
 assert.equal(last.cycle, 1);
 assert.equal(last.page_size, 1000);
 assert.equal(rest.state.upserts.length, 3);
 assert.equal(rest.state.upserts[0].table, 'safety_events');
 assert.equal(rest.state.upserts[0].options.onConflict, 'source,source_record_id');
 assert.equal(rest.state.upserts[0].rows.length, 1000);
 assert.equal(rest.state.upserts[0].rows[0].source, 'mfds:I0490');
 assert.equal(rest.state.upserts[0].rows[0].source_record_id, '3000000000');
});

test('중단된 주기는 next_start부터 이어서 읽는다', async () => {
 const client = fakeClient({totalCount: 2500, pageRows: [Array.from({length: 1000}, (_, i) => rawRecall(1000 + i))]});
 const rest = memoryRest({service: 'I0490', query_key: '', next_start: 1001, rows_synced: 1000, cycle: 1, status: 'running', total_count: 2500});
 const summary = await runSync({service: 'I0490', client, rest, maxPages: 1});
 assert.deepEqual(client.calls, [[1001, 2000]]);
 assert.equal(summary.rows, 2000, '이전 주기에 저장한 1,000행에 이번 1,000행을 더한다');
 assert.equal(summary.nextStart, 2001);
 assert.equal(rest.state.checkpoint.status, 'running');
 assert.equal(rest.state.checkpoint.rows_synced, 2000);
});

test('완료된 서비스를 다시 돌리면 cycle을 올려 1행부터 새 주기를 시작한다', async () => {
 const client = fakeClient({totalCount: 2500, pageRows: [Array.from({length: 1000}, (_, i) => rawRecall(i))]});
 const rest = memoryRest({service: 'I0490', query_key: '', next_start: 3001, rows_synced: 2500, cycle: 1, status: 'completed', total_count: 2500});
 const summary = await runSync({service: 'I0490', client, rest, maxPages: 1});
 assert.deepEqual(client.calls, [[1, 1000]]);
 assert.equal(summary.cycle, 2);
 assert.equal(summary.rows, 1000, '새 주기는 행 수를 0부터 센다');
 assert.equal(rest.state.checkpoint.cycle, 2);
});

test('실패한 페이지는 저장하지 않고 체크포인트를 failed로 남긴다(재개 지점 유지)', async () => {
 let fail = true;
 const rows = i => Array.from({length: 1000}, (_, k) => rawRecall(i * 1000 + k));
 const calls = [];
 let page = 0;
 const client = {
  async readRecallPage(start, end) {
   calls.push([start, end]);
   if (page === 1 && fail) { page += 1; throw new Error('식약처 API 검증 요청 실패: 인증·응답 스키마·통신 상태를 확인하세요.'); }
   const out = {rows: rows(page), totalCount: 2500, fetchedAt: '2026-11-20T00:00:00.000Z', serviceId: 'I0490'};
   page += 1;
   return out;
  }
 };
 const rest = memoryRest();
 await assert.rejects(runSync({service: 'I0490', client, rest}), /식약처 API 검증 요청 실패/);
 assert.equal(rest.state.checkpoint.status, 'failed');
 assert.equal(rest.state.checkpoint.next_start, 1001, '실패한 페이지 앞을 가리킨다');
 assert.equal(rest.state.checkpoint.rows_synced, 1000);
 assert.match(rest.state.checkpoint.last_error, /식약처 API/);
 assert.equal(rest.state.upserts.length, 1);

 fail = false;
 const summary = await runSync({service: 'I0490', client, rest});
 assert.deepEqual(calls[2], [1001, 2000], '재개는 실패한 페이지부터 읽는다');
 assert.equal(summary.status, 'completed');
});

test('max-pages에서 멈추고 다음 실행을 위해 running으로 남긴다', async () => {
 const client = fakeClient({totalCount: 5000, pageRows: [Array.from({length: 1000}, (_, i) => rawRecall(i))]});
 const rest = memoryRest();
 const summary = await runSync({service: 'I0490', client, rest, maxPages: 1});
 assert.equal(summary.pages, 1);
 assert.equal(summary.status, 'running');
 assert.equal(rest.state.checkpoint.status, 'running');
 assert.equal(rest.state.checkpoint.next_start, 1001);
});

test('데이터 없음(빈 페이지)은 완료로 처리한다', async () => {
 const client = fakeClient({totalCount: 0, pageRows: [[]]});
 const rest = memoryRest();
 const summary = await runSync({service: 'I0490', client, rest});
 assert.equal(summary.status, 'completed');
 assert.equal(summary.rows, 0);
 assert.equal(rest.state.checkpoint.status, 'completed');
});

test('dry-run은 외부 API만 읽고 DB에는 쓰지 않는다', async () => {
 const client = fakeClient({totalCount: 1500, pageRows: [Array.from({length: 1000}, (_, i) => rawRecall(i)), Array.from({length: 500}, (_, i) => rawRecall(1000 + i))]});
 const summary = await runSync({service: 'I0490', client, rest: null, dryRun: true});
 assert.equal(summary.dryRun, true);
 assert.equal(summary.pages, 2);
 assert.equal(summary.rows, 1500);
 assert.deepEqual(client.calls, [[1, 1000], [1001, 2000]]);
});

test('C002: 품목제조보고를 products 행으로 옮긴다(표시정보는 unknown)', () => {
 const rows = mapPageRows('C002', C002.row, {fetchedAt: '2026-11-20T00:00:00.000Z'});
 assert.equal(rows.length, 3);
 const first = rows[0];
 assert.equal(first.source, 'mfds:C002');
 assert.equal(first.source_record_id, '1997040105528');
 assert.equal(first.name, '가시오가피 냉면');
 assert.equal(first.manufacturer, '주식회사 금성에프앤비');
 assert.equal(first.report_number, '1997040105528');
 assert.equal(first.license_number, '19970401055');
 assert.equal(first.food_type, '숙면');
 assert.equal(first.raw_materials, '밀가루, 정제수, 타피오카전분, 가시오갈피분말, 알카리제, 정제염');
 assert.equal(first.reported_on, '20020409');
 assert.equal(first.changed_on, '20230610');
 assert.equal(first.label_status, 'unknown');
 assert.equal(first.fetched_at, '2026-11-20T00:00:00.000Z');
 const keys = rows.map(r => Object.keys(r).sort().join(','));
 assert.equal(new Set(keys).size, 1);
});

test('매핑: 없는 값은 null로 두고 원문 표기는 유지한다', () => {
 const [row] = mapPageRows('I0490', [rawRecall(1)]);
 assert.equal(row.expiry_text, '(소비기한) 2027-01-01');
 assert.equal(row.manufactured_text, null);
 assert.equal(row.report_number, null);
 assert.equal(row.barcode, null);
 assert.equal(row.event_type, 'unspecified');
 assert.deepEqual(row.image_urls, []);
 const product = toProductRow({name: '제품', maker: null, foodType: null, reportNo: null, licenseNo: null, rawMaterials: '쌀', rawMaterialOrder: null, reportedAt: null, changedAt: null, exportProduct: null, sourceRecordId: 'k1'});
 assert.equal(product.label_status, 'unknown');
 assert.equal(product.source_record_id, 'k1');
 assert.equal(toSafetyEventRow({type: 'unspecified', name: '제품', manufacturer: null, identifiers: {reportNumber: null, licenseNumber: null, productCode: null}, sourceRecordId: 's1'}).source_record_id, 's1');
});

test('지원하지 않는 서비스는 거부한다', async () => {
 await assert.rejects(runSync({service: 'X999', client: {}, rest: memoryRest(), dryRun: true}), /지원하지 않는 서비스/);
 assert.equal(SYNC_SERVICES.I0490.table, 'safety_events');
 assert.equal(SYNC_SERVICES.C002.table, 'products');
});

test('CLI 인자: 두 표기 모두 받고 잘못된 값은 거부한다', () => {
 assert.deepEqual(parseSyncArgs(['--service=I0490', '--max-pages=2']), {
  service: 'I0490', pageSize: 1000, maxPages: 2, dryRun: false, reset: false, delayMs: 0, help: false
 });
 const c002 = parseSyncArgs(['--service', 'C002', '--page-size', '500', '--dry-run', '--reset', '--delay-ms=100', '--start=5001']);
 assert.equal(c002.service, 'C002');
 assert.equal(c002.pageSize, 500);
 assert.equal(c002.dryRun, true);
 assert.equal(c002.reset, true);
 assert.equal(c002.delayMs, 100);
 assert.equal(c002.start, 5001);
 assert.throws(() => parseSyncArgs([]), /--service/);
 assert.throws(() => parseSyncArgs(['--service=X999']), /지원하지 않는 서비스/);
 assert.throws(() => parseSyncArgs(['--service=I0490', '--page-size=1001']), /페이지 크기/);
 assert.throws(() => parseSyncArgs(['--service=I0490', '--page-size=0']), /페이지 크기/);
 assert.throws(() => parseSyncArgs(['--service=I0490', '--max-pages=abc']), /--max-pages/);
 assert.throws(() => parseSyncArgs(['--service=I0490', '--unknown']), /알 수 없는 옵션/);
 assert.throws(() => parseSyncArgs(['--service=I0490', 'extra']), /알 수 없는 인자/);
 assert.equal(parseSyncArgs(['--help']).help, true);
});
