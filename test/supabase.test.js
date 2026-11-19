import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseRest, createSupabaseFromEnv} from '../src/db/supabase.js';

const KEY = 'service-role-key-0123456789abcdef';

function recorder(responder) {
 const calls = [];
 const fetchImpl = async (url, options) => {
  calls.push({url, options});
  return responder(url, options, calls.length);
 };
 return {calls, fetchImpl};
}

function ok(body = '') {
 return {ok: true, status: 201, text: async () => (body === '' ? '' : JSON.stringify(body))};
}

test('Supabase upsert: merge-duplicates 헤더와 on_conflict, 1,000행 분할', async () => {
 const {calls, fetchImpl} = recorder(() => ok());
 const db = new SupabaseRest({url: 'https://demo.supabase.co/', serviceRoleKey: KEY, fetchImpl});
 const rows = Array.from({length: 2500}, (_, i) => ({source_record_id: String(i)}));
 const result = await db.upsert('safety_events', rows, {onConflict: 'source,source_record_id'});
 assert.equal(result.rows, 2500);
 assert.equal(result.chunks, 3);
 assert.equal(calls.length, 3);
 assert.equal(calls[0].url, 'https://demo.supabase.co/rest/v1/safety_events?on_conflict=source%2Csource_record_id');
 assert.equal(calls[0].options.method, 'POST');
 assert.equal(calls[0].options.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
 assert.equal(calls[0].options.headers.apikey, KEY);
 assert.equal(calls[0].options.headers.Authorization, `Bearer ${KEY}`);
 assert.equal(JSON.parse(calls[0].options.body).length, 1000);
 assert.equal(JSON.parse(calls[2].options.body).length, 500);
 assert.ok(calls[0].options.signal);
});

test('Supabase upsert: 빈 배열은 요청하지 않는다', async () => {
 const {calls, fetchImpl} = recorder(() => ok());
 const db = new SupabaseRest({url: 'https://demo.supabase.co', serviceRoleKey: KEY, fetchImpl});
 assert.deepEqual(await db.upsert('products', []), {rows: 0, chunks: 0});
 assert.equal(calls.length, 0);
});

test('Supabase select: 필터·정렬·limit을 안전하게 인코딩한다', async () => {
 const {calls, fetchImpl} = recorder(() => ok([]));
 const db = new SupabaseRest({url: 'https://demo.supabase.co', serviceRoleKey: KEY, fetchImpl});
 const rows = await db.select('ingestion_checkpoints', {
  select: 'service,next_start',
  filters: [['service', 'eq', 'I0490'], ['query_key', 'eq', '']]
 });
 assert.deepEqual(rows, []);
 const url = new URL(calls[0].url);
 assert.equal(url.pathname, '/rest/v1/ingestion_checkpoints');
 assert.equal(url.searchParams.get('select'), 'service,next_start');
 assert.equal(url.searchParams.get('service'), 'eq.I0490');
 assert.equal(url.searchParams.get('query_key'), 'eq.');
 assert.equal(calls[0].options.method, 'GET');
});

test('Supabase update: PATCH로 해당 행만 고치고 결과를 돌려준다', async () => {
 const {calls, fetchImpl} = recorder(() => ok([{id: 1}]));
 const db = new SupabaseRest({url: 'https://demo.supabase.co', serviceRoleKey: KEY, fetchImpl});
 const updated = await db.update('ingestion_checkpoints', [['id', 'eq', 'a-1']], {status: 'running'});
 assert.deepEqual(updated, [{id: 1}]);
 assert.equal(calls[0].options.method, 'PATCH');
 assert.equal(calls[0].options.headers.Prefer, 'return=representation');
 assert.equal(calls[0].url, 'https://demo.supabase.co/rest/v1/ingestion_checkpoints?id=eq.a-1');
 await assert.rejects(db.update('products', [], {}), /필터/);
});

test('Supabase 오류: 상태·코드를 알려 주되 서비스 롤 키는 노출하지 않는다', async () => {
 const {fetchImpl} = recorder(() => ({
  ok: false,
  status: 409,
  text: async () => JSON.stringify({code: '23505', message: `duplicate key (via ${KEY})`})
 }));
 const db = new SupabaseRest({url: 'https://demo.supabase.co', serviceRoleKey: KEY, fetchImpl});
 await assert.rejects(db.upsert('products', [{source_record_id: 'a'}]), error => {
  assert.equal(error.name, 'SupabaseError');
  assert.equal(error.status, 409);
  assert.equal(error.code, '23505');
  assert.match(error.message, /HTTP 409 23505/);
  assert.ok(!error.message.includes(KEY), '오류 메시지에 키가 들어가면 안 된다');
  return true;
 });
});

test('Supabase 재시도: 503은 다시 시도하고 400은 즉시 실패한다', async () => {
 const responses = [
  {ok: false, status: 503, text: async () => '{"message":"upstream"}'},
  {ok: false, status: 503, text: async () => '{"message":"upstream"}'},
  ok()
 ];
 let attempt = 0;
 const {calls, fetchImpl} = recorder(() => responses[attempt++]);
 const db = new SupabaseRest({url: 'https://demo.supabase.co', serviceRoleKey: KEY, fetchImpl, retryDelayMs: 0});
 await db.insert('products', [{name: 'a'}]);
 assert.equal(calls.length, 3);

 const bad = recorder(() => ({ok: false, status: 400, text: async () => '{"code":"PGRST102","message":"All object keys must match"}'}));
 const db2 = new SupabaseRest({url: 'https://demo.supabase.co', serviceRoleKey: KEY, fetchImpl: bad.fetchImpl, retryDelayMs: 0});
 await assert.rejects(db2.insert('products', [{name: 'a'}, {x: 1}]), /PGRST102/);
 assert.equal(bad.calls.length, 1);
});

test('Supabase 네트워크 오류는 재시도 후 안내 메시지로 실패한다', async () => {
 const {calls, fetchImpl} = recorder(() => {
  throw new Error(`connect ECONNREFUSED (${KEY})`);
 });
 const db = new SupabaseRest({url: 'https://demo.supabase.co', serviceRoleKey: KEY, fetchImpl, retryDelayMs: 0, maxAttempts: 2});
 await assert.rejects(db.select('products'), error => {
  assert.match(error.message, /네트워크 오류/);
  assert.ok(!error.message.includes(KEY));
  return true;
 });
 assert.equal(calls.length, 2);
});

test('Supabase 설정과 이름 검증', async () => {
 assert.throws(() => new SupabaseRest({url: 'http://demo.supabase.co', serviceRoleKey: KEY}), /https/);
 assert.throws(() => new SupabaseRest({url: 'not a url', serviceRoleKey: KEY}), /주소/);
 assert.throws(() => new SupabaseRest({url: 'https://demo.supabase.co', serviceRoleKey: 'short'}), /SERVICE_ROLE_KEY/);
 const db = new SupabaseRest({url: 'https://demo.supabase.co', serviceRoleKey: KEY, fetchImpl: async () => ok()});
 await assert.rejects(db.upsert('products; drop table x', [{}]), /테이블 이름/);
 await assert.rejects(db.select('products', {filters: [['name', 'eq;drop', 'x']]}), /연산자/);
 await assert.rejects(db.select('products', {filters: [['name)', 'eq', 'x']]}), /컬럼 이름/);
});

test('환경 변수로 클라이언트 만들기: 빠진 항목을 알려 준다', () => {
 assert.throws(() => createSupabaseFromEnv({}), /SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/);
 assert.throws(() => createSupabaseFromEnv({SUPABASE_URL: 'https://demo.supabase.co'}), /SERVICE_ROLE_KEY/);
 const db = createSupabaseFromEnv({SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_SERVICE_ROLE_KEY: KEY});
 assert.ok(db instanceof SupabaseRest);
});
