// 식품안전나라 원문을 Supabase 테이블로 옮기는 수집 엔진.
// 1,000행 단위 페이지네이션, ingestion_checkpoints 기반 재개, source 기준 중복 방지 upsert.
// 외부 패키지 없이 동작하며, 네트워크·DB는 호출자가 넣어 준다(테스트에서 모의 구현 사용).
import {mapRecallRow} from '../providers/mfds-client.js';
import {cleanText} from '../providers/mfds-common.js';
import {mapMaterialsRecord, materialsRecordKey} from '../providers/mfds-materials.js';

export const MAX_PAGE_SIZE = 1000;
export const DEFAULT_PAGE_SIZE = 1000;

export const SYNC_SERVICES = {
 I0490: {service: 'I0490', table: 'safety_events', onConflict: 'source,source_record_id', label: '회수·판매중지', read: 'readRecallPage'},
 C002: {service: 'C002', table: 'products', onConflict: 'source,source_record_id', label: '품목제조보고 원재료', read: 'readPage'}
};

export const SYNC_SOURCE = {I0490: 'mfds:I0490', C002: 'mfds:C002'};

// 회수·판매중지 원문 → safety_events 행. 키 집합을 모든 행에서 같게 유지한다(PostgREST 일괄 insert 제약).
export function toSafetyEventRow(record, {fetchedAt = new Date().toISOString()} = {}) {
 return {
  source: SYNC_SOURCE.I0490,
  source_record_id: record.sourceRecordId,
  event_type: record.type,
  name: record.name,
  manufacturer: record.manufacturer,
  report_number: record.identifiers.reportNumber,
  license_number: record.identifiers.licenseNumber,
  product_code: record.identifiers.productCode,
  product_code_name: record.productCodeName,
  barcode: record.barcode,
  reason: record.reason,
  grade: record.grade,
  product_type: record.productType,
  lot: record.lot,
  expiry_text: record.expiry,
  manufactured_text: record.manufacturedAt,
  action: record.action,
  address: record.address,
  phone: record.phone,
  package_unit: record.packageUnit,
  image_urls: record.imageUrls,
  published_at_text: record.publishedAt,
  source_url: null,
  fetched_at: fetchedAt,
  updated_at: fetchedAt
 };
}

// 품목제조보고 원문 → products 행.
export function toProductRow(record, {fetchedAt = new Date().toISOString()} = {}) {
 return {
  source: SYNC_SOURCE.C002,
  source_record_id: record.sourceRecordId,
  name: record.name,
  manufacturer: record.maker,
  food_type: record.foodType,
  report_number: record.reportNo,
  license_number: record.licenseNo,
  raw_materials: record.rawMaterials,
  raw_material_order: record.rawMaterialOrder,
  reported_on: record.reportedAt,
  changed_on: record.changedAt,
  export_product: record.exportProduct,
  // C002에는 포장지 표시(알레르기) 정보가 없다. 없음을 '무함유'로 쓰지 않는다.
  label_status: 'unknown',
  fetched_at: fetchedAt,
  updated_at: fetchedAt
 };
}

export function mapPageRows(service, rawRows, {fetchedAt} = {}) {
 if (service === 'I0490') return rawRows.map(row => toSafetyEventRow(mapRecallRow(row, fetchedAt), {fetchedAt}));
 if (service === 'C002') {
  return rawRows.map(row => {
   const record = mapMaterialsRecord(row);
   return toProductRow({
    ...record,
    // 원재료 순서와 수출용 여부는 웹 API 응답에는 넣지 않고 DB에만 남긴다.
    rawMaterialOrder: cleanText(row.RAWMLTRL_ORDNO),
    exportProduct: cleanText(row.ETQTY_XPORT_PRDLST_YN),
    sourceRecordId: materialsRecordKey(row)
   }, {fetchedAt});
  });
 }
 throw new Error(`지원하지 않는 서비스입니다: ${service}`);
}

/**
 * 한 서비스의 한 주기를 페이지 단위로 수집한다.
 * 성공한 페이지마다 체크포인트를 갱신하므로, 중단되면 그 페이지부터 다시 시작한다.
 */
export async function runSync({
 service, client, rest, pageSize = DEFAULT_PAGE_SIZE, maxPages = Infinity,
 dryRun = false, reset = false, delayMs = 0, startAt = null, now = () => new Date().toISOString(), logger = () => {},
 sleep = defaultSleep
} = {}) {
 const cfg = SYNC_SERVICES[service];
 if (!cfg) throw new Error(`지원하지 않는 서비스입니다: ${service} (I0490 또는 C002)`);
 if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
  throw new Error(`페이지 크기는 1~${MAX_PAGE_SIZE} 사이의 정수여야 합니다.`);
 }
 if (!Number.isSafeInteger(maxPages) && maxPages !== Infinity) throw new Error('maxPages는 정수여야 합니다.');
 const queryKey = '';
 const startedAt = now();
 let checkpoint = null;
 if (!dryRun) {
  if (!rest) throw new Error('Supabase 클라이언트가 필요합니다(dry-run이 아니면 --dry-run 없이 DB 설정이 필요).');
  checkpoint = await rest.selectOne('ingestion_checkpoints', {
   filters: [['service', 'eq', service], ['query_key', 'eq', queryKey]]
  });
 }
 const resume = checkpoint && !reset && checkpoint.status !== 'completed';
 let start = Number.isSafeInteger(startAt) ? startAt : (resume ? Number(checkpoint.next_start) || 1 : 1);
 const cycle = checkpoint ? (resume ? Number(checkpoint.cycle) || 1 : (Number(checkpoint.cycle) || 1) + 1) : 1;
 let rowsSynced = resume ? Number(checkpoint.rows_synced) || 0 : 0;
 let lastRecordKey = resume ? checkpoint.last_record_key ?? null : null;

 const save = async patch => {
  if (dryRun) return;
  await rest.upsert('ingestion_checkpoints', [{
   service,
   query_key: queryKey,
   next_start: patch.next_start,
   page_size: pageSize,
   total_count: patch.total_count ?? null,
   rows_synced: patch.rows_synced,
   cycle: patch.cycle,
   status: patch.status,
   last_record_key: patch.last_record_key ?? null,
   last_error: patch.last_error ?? null,
   started_at: patch.started_at ?? startedAt,
   finished_at: patch.finished_at ?? null,
   updated_at: now()
  }], {onConflict: 'service,query_key'});
 };

 await save({next_start: start, total_count: checkpoint?.total_count ?? null, rows_synced: rowsSynced, cycle, status: 'running', last_record_key: lastRecordKey, started_at: startedAt});

 let pages = 0;
 let totalCount = checkpoint?.total_count ?? null;
 let status = 'running';
 try {
  while (pages < maxPages) {
   const end = start + pageSize - 1;
   const page = await client[cfg.read](start, end);
   const pageTotal = Number(page.totalCount);
   if (page.totalCount != null && Number.isFinite(pageTotal)) totalCount = pageTotal;
   const fetchedAt = now();
   const dbRows = mapPageRows(service, page.rows, {fetchedAt});
   if (dbRows.length && !dryRun) await rest.upsert(cfg.table, dbRows, {onConflict: cfg.onConflict, chunkSize: pageSize});
   rowsSynced += dbRows.length;
   lastRecordKey = dbRows.length ? String(dbRows.at(-1).source_record_id) : lastRecordKey;
   pages += 1;
   const done = page.rows.length === 0 || (totalCount != null && end >= totalCount);
   start = end + 1;
   status = done ? 'completed' : 'running';
   await save({
    next_start: start, total_count: totalCount, rows_synced: rowsSynced, cycle, status,
    last_record_key: lastRecordKey, started_at: startedAt, finished_at: done ? now() : null
   });
   logger({service, page: pages, rows: dbRows.length, totalCount, nextStart: start, status, dryRun});
   if (done) break;
   if (delayMs > 0) await sleep(delayMs);
  }
  return {service, pages, rows: rowsSynced, totalCount, nextStart: start, cycle, status, dryRun};
 } catch (error) {
  const message = String(error?.message || error).slice(0, 300);
  if (!dryRun) {
   await save({
    next_start: start, total_count: totalCount, rows_synced: rowsSynced, cycle, status: 'failed',
    last_record_key: lastRecordKey, started_at: startedAt, last_error: message
   }).catch(() => {});
  }
  throw error;
 }
}

export function parseSyncArgs(argv = []) {
 const out = {service: null, pageSize: DEFAULT_PAGE_SIZE, maxPages: Infinity, dryRun: false, reset: false, delayMs: 0, help: false};
 for (let i = 0; i < argv.length; i += 1) {
  const arg = String(argv[i]);
  if (arg === '--help' || arg === '-h') { out.help = true; continue; }
  if (arg === '--dry-run') { out.dryRun = true; continue; }
  if (arg === '--reset') { out.reset = true; continue; }
  const [name, inlineValue] = arg.startsWith('--') ? splitFlag(arg) : ['', ''];
  const hasNext = i + 1 < argv.length && !String(argv[i + 1]).startsWith('--');
  const value = inlineValue ?? (hasNext ? argv[++i] : undefined);
  if (name === '--service') out.service = String(value ?? '').trim();
  else if (name === '--max-pages') out.maxPages = parsePositiveInt(value, '--max-pages');
  else if (name === '--page-size') out.pageSize = parsePageSize(value);
  else if (name === '--delay-ms') out.delayMs = parseNonNegativeInt(value, '--delay-ms');
  else if (name === '--start') out.start = parsePositiveInt(value, '--start');
  else if (arg.startsWith('--')) throw new Error(`알 수 없는 옵션입니다: ${arg}`);
  else throw new Error(`알 수 없는 인자입니다: ${arg}`);
 }
 if (!out.help) {
  if (!out.service) throw new Error('--service=I0490 또는 --service=C002 를 지정하세요.');
  if (!SYNC_SERVICES[out.service]) throw new Error(`지원하지 않는 서비스입니다: ${out.service} (I0490 또는 C002)`);
  if (out.pageSize > MAX_PAGE_SIZE) throw new Error(`페이지 크기는 1~${MAX_PAGE_SIZE} 사이여야 합니다.`);
 }
 return out;
}

function splitFlag(arg) {
 const eq = arg.indexOf('=');
 if (eq === -1) return [arg, undefined];
 return [arg.slice(0, eq), arg.slice(eq + 1)];
}
function parsePositiveInt(value, flag) {
 const n = Number(value);
 if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${flag} 값은 1 이상의 정수여야 합니다.`);
 return n;
}
function parsePageSize(value) {
 const n = Number(value);
 if (!Number.isSafeInteger(n) || n < 1 || n > MAX_PAGE_SIZE) throw new Error(`페이지 크기는 1~${MAX_PAGE_SIZE} 사이의 정수여야 합니다.`);
 return n;
}
function parseNonNegativeInt(value, flag) {
 const n = Number(value);
 if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${flag} 값은 0 이상의 정수여야 합니다.`);
 return n;
}
function defaultSleep(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}
