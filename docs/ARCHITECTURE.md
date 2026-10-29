# 설계 및 확장

## 경계

브라우저 → 로컬 HTTP API → provider 계약(search/getProduct/listEvents) → 가상 fixture. MfdsClient는 별도의 검증용 전송 계층이며 provider에 아직 연결하지 않았습니다. 외부 의존성 없이 Node.js 내장 HTTP 서버와 ES modules, JSDoc 데이터 계약을 사용합니다. 검증된 실데이터로 전환하려면 별도의 live provider와 제품 카탈로그가 필요합니다.

## 데이터 모델

| 모델 | 핵심 항목 및 원칙 |
| --- | --- |
| Product | 내부 id, name, manufacturer, category, identifiers(reportNumber/licenseNumber/foodQr), label, provenance |
| SafetyEvent | 내부 id, type, name, manufacturer, identifiers, reason, publishedAt, lot, expiry, action, provenance |
| Label | status=provided/unknown, contains[], mayContain[], text; 원문과 가공값을 함께 유지 |
| Provenance | kind, sourceRecordId, sourceUrl, fetchedAt. 실제 수집 시 원문·검증 기록을 별도 보관 |
| ProductEventLink | 현재 함수 계산; 후속 DB에는 productId/eventId/match/evidence/reviewedAt 저장 |
| Watchlist | 현재 로컬 id 배열; 후속에는 userId/productId/createdAt, 사용자별 접근 제어 |
| AlertDelivery | 미구현; userId/eventId/channel/status/sentAt/idempotencyKey |

식별번호는 숫자 변환하지 않는 문자열입니다. 제조업체명은 안정적인 업체 식별자를 대체하지 않습니다. 같은 이름이라도 업체가 다른 제품은 분리합니다. 품목번호와 업체 인허가번호가 모두 일치할 때만 제품에 사건을 연결합니다. 둘 중 하나라도 충돌하면 연결하지 않습니다. 식별번호가 부족하고 정규화한 제품명·업체명이 같은 경우는 후보입니다. 식별번호의 일치는 제품 연결이며 특정 LOT의 실제 회수대상 여부는 별도로 확인합니다. 유사도 점수만으로 회수 경보를 발송하지 않습니다.

## 단계별 개발

1. **데이터 검증**: 인증·전체 페이지 수집·변경/삭제·필드 누락·시간대·제품 연결 표본 검증. 검증 완료 전 demo 유지.
2. **실제 조회**: 검증된 카탈로그/회수 인덱스에 영속 저장. 원본 스냅샷과 sourceRecordId 기준 중복 방지, 체크포인트, 재시도/백오프, 호출량 제어, 수집시각/장애/누락 가시화. 매 화면마다 전체 API 호출 금지.
3. **알레르기**: 표시정보의 별도 공식 출처 확보, 원문·동의어·함유와 교차접촉 표시 분리. 데이터 누락을 무함유로 처리하지 않음. 자녀 프로필은 동의·보관기간·삭제 정책 및 계정 보안 구현 후 추가.
4. **관심 제품·알림**: 계정 및 서버 DB, 안전정보 변경 이벤트와 제품 연결 검토, 발송 큐, 사건/수신자 단위 멱등키, 중복 방지, 재발송·구독해지. 저장만으로 알림이 활성화되었다고 표시하지 않음.
5. **푸드QR**: 공식 제공 방식/사용 권한과 식별자 추출 규칙 검증 후 별도 resolver 추가. 임의 URL 서버 요청 금지(SSRF). 일반 바코드는 상품 데이터 확보 이후 확대.

운영 공개 전에는 접근 제어, HTTPS, 요청 제한, 영속 저장 백업, 비밀정보 관리, 동의·삭제, 모니터링이 필요합니다. 현 버전은 배포나 실사용 API 연결 없이 로컬에서 검토하는 출발점입니다.
