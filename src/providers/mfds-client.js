/** I0490 검증용 전송 계층. 웹 provider와 연결하지 않음. 응답 필드 매핑은 검증 후 추가. */
export class MfdsClient {
 constructor({apiKey, fetchImpl = fetch, timeoutMs = 8000} = {}) {
   if (!apiKey || !/^[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error('유효한 MFDS_API_KEY가 필요합니다.');
   this.apiKey = apiKey; this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs;
 }
 async readRecallPage(start = 1, end = 100) {
   if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end-start >= 1000) throw new Error('잘못된 페이지 범위');
   // HTTPS 지원 여부도 실제 인증키로 검증 필요. HTTP로 자동 강등하지 않는다.
   const url = `https://openapi.foodsafetykorea.go.kr/api/${this.apiKey}/I0490/json/${start}/${end}`;
   try {
     const response = await this.fetchImpl(url, {signal:AbortSignal.timeout(this.timeoutMs),redirect:'error'});
     if (!response.ok) throw new Error('HTTP');
     const payload = await response.json();
     const data = payload?.I0490;
     if (!data || data.RESULT?.CODE !== 'INFO-000' || !Array.isArray(data.row) || !/^\d+$/.test(String(data.total_count))) throw new Error('schema');
     return {rows:data.row,totalCount:Number(data.total_count),fetchedAt:new Date().toISOString(),serviceId:'I0490',validated:false};
   } catch {
     // 인증키가 URL에 있으므로 upstream 오류 객체/URL을 로그에 남기지 않는다.
     throw new Error('식약처 API 검증 요청 실패: 인증·응답 스키마·통신 상태를 확인하세요.');
   }
 }
}
