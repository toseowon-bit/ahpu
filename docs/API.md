# HTTP API v0.1

모든 응답은 UTF-8 JSON. GET만 허용합니다. 인증 없는 로컬 MVP이며 상품/회수 목록은 고정 예시이므로 페이지네이션은 후속 단계입니다. 실제 카탈로그 적용 시 기본 limit, 최대 limit, cursor를 추가해야 합니다.

| 경로 | 응답 |
| --- | --- |
| `/api/status` | provider, liveVerified=false, snapshotAt=null, notifications=not-implemented |
| `/api/products?q=우리쌀&manufacturer=햇살` | meta, items: Product[]; 검색 조건 각각 100자 이하 |
| `/api/products/demo-001` | meta, product, safety |
| `/api/lookup/status` | coupang·materials 각각 `live`/`mock`, validated=false, 쿠팡 파트너스 고지 문구 |
| `/api/coupang/search?q=쌀과자` | meta{source,validated,disclosure}, items[{productId,name,price,image,url,category,isRocket}]; q 1~50자 |
| `/api/materials/search?q=상품명` | meta{source,validated,searchTerm}, items[{reportNo,name,maker,rawMaterials,reportedAt}]; 식품안전나라 C002 |
| `/api/recalls` | meta, items: SafetyEvent[]; 제품 매칭 여부와 독립적인 원문 사건 목록 |

Product 계약은 `src/model.js`, safety는 `{status:'records-found'|'not-confirmed',events:[],candidates:[],coverage:string}`. 제품 연결된 사건도 LOT/기한 확인이 추가로 필요합니다. provenance.kind=demo, sourceUrl=null, fetchedAt=null은 실제 외부 데이터를 수집하지 않았다는 의미입니다. 예시 등록일은 수집·최종확인 시간이 아닙니다.

오류: 400 검색어 길이, 404 제품/경로 없음, 405 메서드 불허, 500 내부 오류. `{error:string}`을 반환하며 upstream 비밀정보를 포함하지 않습니다. 장애를 빈 배열로 표현하지 않습니다. 현재 관심 제품 API는 없으며 브라우저 저장만 합니다.

## 실제 데이터 조회(베타)

키가 있으면 live, 없으면 `[모의]` 데이터로 동작합니다(`COUPANG_ACCESS_KEY`·`COUPANG_SECRET_KEY`, `MFDS_API_KEY`). live 실패는 모의 데이터로 바꾸지 않고 502와 원인 안내를 반환합니다. 두 API의 경로·서명·응답 필드는 실제 키로 아직 검증하지 않았습니다(validated=false). 응답 형식이 예상과 다르면 빈 결과가 아니라 오류가 납니다. 자녀 알레르기 정보는 서버로 보내지 않고 브라우저에서 원재료명과 비교합니다(`public/allergen-keywords.js`).
