// 외부 API(쿠팡 파트너스·식품안전나라) 호출 한도를 지키기 위한 단순 고정 구간 제한.
// 서버 인스턴스 메모리 기준이다. Vercel처럼 인스턴스가 여러 개면 인스턴스마다 따로 센다(완전한 방어가 아닌 남용 완화).
export function createRateLimiter({perClient = 20, total = 200, windowMs = 60 * 1000, now = () => Date.now()} = {}) {
 let windowStart = now(), totalCount = 0;
 const clients = new Map();
 return function check(clientKey) {
  const t = now();
  if (t - windowStart >= windowMs) { windowStart = t; totalCount = 0; clients.clear(); }
  const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - t) / 1000));
  const used = clients.get(clientKey) || 0;
  if (used >= perClient || totalCount >= total) return {ok: false, retryAfter};
  clients.set(clientKey, used + 1); totalCount += 1;
  return {ok: true, retryAfter: 0};
 };
}

// Vercel은 x-forwarded-for 첫 값에 실제 클라이언트 IP를 넣는다. 로컬에서는 소켓 주소를 쓴다.
export function clientKey(req) {
 const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
 return fwd || req.socket?.remoteAddress || 'unknown';
}
