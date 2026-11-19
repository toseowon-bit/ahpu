// 식품안전나라 OpenAPI 공통 규칙.
// 인증키가 URL 경로에 들어가므로 주소·키를 오류 메시지나 로그에 남기지 않는다.
// 필드명은 공개 견본(sample 인증키) 응답으로 확인했다(2026-11-20). 실제 발급 인증키로는 아직 확인하지 않았다.

export const MFDS_BASE = 'https://openapi.foodsafetykorea.go.kr';
// 한 번에 받을 수 있는 최대 행 수(start~end 포함). 실제 한도를 넘기면 응답이 잘리므로 보수적으로 둔다.
export const MFDS_MAX_PAGE_SIZE = 1000;

export const MFDS_RESULT = {OK: 'INFO-000', NO_DATA: 'INFO-200', INVALID_KEY: 'INFO-100'};

export function assertApiKey(apiKey) {
 if (!apiKey || !/^[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error('유효한 MFDS_API_KEY가 필요합니다.');
}

// 인증키가 URL에 들어가므로 HTTPS 주소만 허용한다(HTTP로 바꾸면 키가 암호화 없이 전송됨).
export function normalizeBaseUrl(baseUrl) {
 const base = String(baseUrl || MFDS_BASE).replace(/\/+$/, '');
 if (new URL(base).protocol !== 'https:') throw new Error('MFDS_BASE_URL은 https:// 주소여야 합니다.');
 return base;
}

// start/end는 1부터 시작하는 포함 범위이며 최대 MFDS_MAX_PAGE_SIZE행이다.
export function assertPageRange(start, end) {
 if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start >= MFDS_MAX_PAGE_SIZE) {
  throw new Error(`잘못된 페이지 범위 (start=${start}, end=${end}, 최대 ${MFDS_MAX_PAGE_SIZE}행)`);
 }
}

export function resultCode(data) {
 return typeof data?.RESULT?.CODE === 'string' ? data.RESULT.CODE : null;
}

// 응답 코드를 계약으로 옮긴다. 모르는 코드는 빈 결과가 아니라 오류다.
export function readServiceResult(data, {serviceId, requiredRows = true} = {}) {
 const code = resultCode(data);
 if (code === MFDS_RESULT.NO_DATA) return {code, rows: [], totalCount: 0};
 if (code !== MFDS_RESULT.OK) {
  if (code === MFDS_RESULT.INVALID_KEY) throw new Error(`식품안전나라 ${serviceId} 인증키가 유효하지 않습니다. 인증키를 확인하세요.`);
  throw new Error(`식품안전나라 ${serviceId} 응답 코드가 예상과 다릅니다${code ? ` (${code})` : ''}.`);
 }
 const rows = requiredRows ? data?.row : (data?.row ?? []);
 if (!Array.isArray(rows)) throw new Error(`식품안전나라 ${serviceId} 응답 형식이 예상과 다릅니다.`);
 const totalRaw = data?.total_count;
 if (totalRaw == null) return {code, rows, totalCount: null};
 if (!/^\d+$/.test(String(totalRaw))) throw new Error(`식품안전나라 ${serviceId} 응답의 total_count가 예상과 다릅니다.`);
 return {code, rows, totalCount: Number(totalRaw)};
}

// 인증키가 포함된 주소를 오류에 싣지 않기 위해 upstream 오류는 고정 메시지로 바꾼다.
export async function fetchServiceJson({fetchImpl = fetch, timeoutMs = 8000, url, failureMessage}) {
 let response;
 try {
  response = await fetchImpl(url, {signal: AbortSignal.timeout(timeoutMs), redirect: 'error'});
 } catch {
  throw new Error(failureMessage);
 }
 if (!response.ok) throw new Error(failureMessage);
 try {
  return await response.json();
 } catch {
  throw new Error(failureMessage);
 }
}

// 빈 문자열과 식품안전나라가 쓰는 '데이터없음' 표시는 값 없음으로 본다(값을 지어내지 않는다).
export function cleanText(value) {
 if (typeof value !== 'string') return null;
 const trimmed = value.trim();
 if (!trimmed || trimmed === '데이터없음') return null;
 return trimmed;
}
