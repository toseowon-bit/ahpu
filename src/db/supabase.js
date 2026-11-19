// Supabase(PostgREST) REST 클라이언트. 외부 npm 패키지 없이 Node 내장 fetch만 쓴다.
// service_role 키는 서버·스크립트에서만 쓰고 브라우저로 보내지 않는다.
// 키는 헤더에만 넣고 오류 메시지·로그에 남기지 않는다.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const TABLE_RE = /^[a-z][a-z0-9_]*$/;
const COLUMN_RE = /^[a-z][a-z0-9_]*$/;
const OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in']);

export class SupabaseError extends Error {
 constructor(message, {status = null, code = null, table = null, action = null} = {}) {
  super(message);
  this.name = 'SupabaseError';
  Object.assign(this, {status, code, table, action});
 }
}

export class SupabaseRest {
 constructor({url, serviceRoleKey, fetchImpl = fetch, timeoutMs = 20000, retryDelayMs = 400, maxAttempts = 3} = {}) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  let parsed;
  try {
   parsed = new URL(base);
  } catch {
   throw new Error('SUPABASE_URL이 올바른 주소가 아닙니다(예: https://xxxx.supabase.co).');
  }
  if (parsed.protocol !== 'https:') throw new Error('SUPABASE_URL은 https:// 주소여야 합니다.');
  if (!serviceRoleKey || String(serviceRoleKey).length < 20) throw new Error('SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  Object.assign(this, {base, serviceRoleKey, fetchImpl, timeoutMs, retryDelayMs, maxAttempts});
 }

 // 한 번에 넣는 행 수를 제한해 요청 본문 크기와 응답 시간을 예측 가능하게 유지한다.
 async upsert(table, rows, {onConflict, chunkSize = 1000} = {}) {
  assertTable(table);
  if (!rows?.length) return {rows: 0, chunks: 0};
  const query = onConflict ? `?on_conflict=${encodeQueryValue(assertColumnList(onConflict))}` : '';
  let sent = 0;
  let chunks = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
   const chunk = rows.slice(i, i + chunkSize);
   await this.#request(`${table}${query}`, {
    method: 'POST',
    body: JSON.stringify(chunk),
    prefer: 'resolution=merge-duplicates,return=minimal',
    table,
    action: 'upsert'
   });
   sent += chunk.length;
   chunks += 1;
  }
  return {rows: sent, chunks};
 }

 async insert(table, rows, {chunkSize = 1000, returning = false} = {}) {
  assertTable(table);
  if (!rows?.length) return [];
  const out = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
   const chunk = rows.slice(i, i + chunkSize);
   const data = await this.#request(table, {
    method: 'POST',
    body: JSON.stringify(chunk),
    prefer: returning ? 'return=representation' : 'return=minimal',
    table,
    action: 'insert'
   });
   if (returning && Array.isArray(data)) out.push(...data);
  }
  return out;
 }

 async select(table, {select = '*', filters = [], order = null, limit = null} = {}) {
  assertTable(table);
  const params = [`select=${encodeQueryValue(select === '*' ? '*' : select)}`];
  for (const [column, operator, value] of filters) params.push(`${assertColumn(column)}=${encodeFilter(operator, value)}`);
  if (order) params.push(`order=${encodeQueryValue(order)}`);
  if (limit != null) params.push(`limit=${Number(limit)}`);
  const data = await this.#request(`${table}?${params.join('&')}`, {method: 'GET', table, action: 'select'});
  return Array.isArray(data) ? data : [];
 }

 async selectOne(table, options = {}) {
  const rows = await this.select(table, {...options, limit: options.limit ?? 1});
  return rows[0] ?? null;
 }

 // 필터에 맞는 기존 행을 고친다. 고친 행을 돌려주므로 "있었는지"를 호출자가 알 수 있다.
 async update(table, filters, patch, {returning = true} = {}) {
  assertTable(table);
  if (!filters?.length) throw new Error('update에는 필터가 필요합니다.');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('update에는 객체 patch가 필요합니다.');
  const params = filters.map(([column, operator, value]) => `${assertColumn(column)}=${encodeFilter(operator, value)}`);
  const data = await this.#request(`${table}?${params.join('&')}`, {
   method: 'PATCH',
   body: JSON.stringify(patch),
   prefer: returning ? 'return=representation' : 'return=minimal',
   table,
   action: 'update'
  });
  return Array.isArray(data) ? data : [];
 }

 async #request(path, {method, body, prefer, table, action}) {
  const url = `${this.base}/rest/v1/${path}`;
  const headers = {
   apikey: this.serviceRoleKey,
   Authorization: `Bearer ${this.serviceRoleKey}`,
   Accept: 'application/json'
  };
  if (body != null) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  let lastError;
  for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
   let response;
   try {
    response = await this.fetchImpl(url, {method, headers, body, signal: AbortSignal.timeout(this.timeoutMs)});
   } catch {
    lastError = new SupabaseError(`Supabase ${table} ${action} 요청이 네트워크 오류로 실패했습니다. 연결과 주소를 확인하세요.`, {table, action});
    if (attempt < this.maxAttempts) { await delay(this.retryDelayMs * attempt); continue; }
    throw lastError;
   }
   if (response.ok) return await readBody(response);
   const detail = await readErrorDetail(response);
   lastError = new SupabaseError(
    `Supabase ${table} ${action} 실패 (HTTP ${response.status}${detail.code ? ` ${detail.code}` : ''}): ${this.#redact(detail.message)}`,
    {status: response.status, code: detail.code, table, action}
   );
   if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxAttempts) { await delay(this.retryDelayMs * attempt); continue; }
   throw lastError;
  }
  throw lastError;
 }

 // 업스트림 응답이 키를 되돌려 주는 경우가 있어 마지막으로 가린다.
 #redact(text) {
  return String(text).split(this.serviceRoleKey).join('[키 숨김]');
 }
}

export function createSupabaseFromEnv(env = process.env) {
 const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !env[k]);
 if (missing.length) throw new Error(`${missing.join(', ')} 환경 변수가 필요합니다. docs/SUPABASE_SETUP.md를 보세요.`);
 return new SupabaseRest({url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY});
}

function assertTable(table) {
 if (!TABLE_RE.test(String(table || ''))) throw new Error(`허용되지 않은 테이블 이름입니다: ${table}`);
}
function assertColumn(column) {
 if (!COLUMN_RE.test(String(column || ''))) throw new Error(`허용되지 않은 컬럼 이름입니다: ${column}`);
 return column;
}
function assertColumnList(list) {
 return String(list).split(',').map(part => assertColumn(part.trim())).join(',');
}
function encodeQueryValue(value) {
 return encodeURIComponent(String(value));
}
function encodeFilter(operator, value) {
 if (!OPERATORS.has(operator)) throw new Error(`허용되지 않은 필터 연산자입니다: ${operator}`);
 if (value === null) return 'is.null';
 return `${operator}.${encodeQueryValue(value)}`;
}
async function readBody(response) {
 const text = await response.text();
 if (!text) return null;
 try {
  return JSON.parse(text);
 } catch {
  return text;
 }
}
async function readErrorDetail(response) {
 let text = '';
 try {
  text = await response.text();
 } catch {
  return {code: null, message: '응답 본문을 읽지 못했습니다.'};
 }
 let parsed = null;
 try {
  parsed = JSON.parse(text);
 } catch {
  parsed = null;
 }
 const code = typeof parsed?.code === 'string' ? parsed.code : null;
 const raw = typeof parsed?.message === 'string' ? parsed.message : text;
 return {code, message: String(raw || '응답 본문 없음').slice(0, 300)};
}
function delay(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}
