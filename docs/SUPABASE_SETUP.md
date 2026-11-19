# Supabase 저장소 설정과 식품안전나라 적재

작성: 2026-11-20. 이 문서는 **설계와 절차**입니다. 마이그레이션 SQL은 PostgreSQL(PGlite 18)에서 직접 실행해 검증했고, 실제 Supabase 프로젝트에 적용하거나 실제 인증키로 전체 적재를 돌려 보지는 않았습니다(아래 [아직 검증하지 않은 것](#아직-검증하지-않은-것)).

## 무엇을 만드나

| 파일 | 내용 |
| --- | --- |
| `supabase/migrations/001_initial_schema.sql` | `products`, `safety_events`, `product_event_links`, `watchlists`, `alert_deliveries`, `ingestion_checkpoints` 6개 테이블, 유일 제약, 검색 인덱스, RLS 전면 차단 |
| `src/db/supabase.js` | PostgREST REST 클라이언트(Node 내장 `fetch`, 외부 패키지 0개). upsert·select·update, 1,000행 단위 분할 전송, 429/5xx 재시도 |
| `src/db/mfds-sync.js` | 페이지 수집·매핑·체크포인트 저장 엔진(네트워크 없이 테스트 가능) |
| `scripts/sync-mfds.js` | 위 엔진을 실행하는 CLI |
| `src/providers/mfds-client.js` | I0490 실제 필드명 매핑(`PRDTNM`, `BSSHNM`, `RCRET_DTM` 계열) |
| `src/providers/mfds-materials.js` | C002 페이지 읽기(`readPage`) 추가, 필드 확인 근거 갱신 |

적재 흐름: 식품안전나라 OpenAPI → (원문 행) → 매핑 → Supabase REST upsert → 체크포인트 갱신.

## 1. 프로젝트와 키

1. https://supabase.com 에서 프로젝트를 만듭니다. 리전은 사용자와 가까운 곳(예: `ap-northeast-2`)을 고릅니다.
2. **Project Settings → API** 에서 두 키를 확인합니다.
   - `anon` `public` 키: 브라우저에 넣어도 되는 키. 이 스키마에서는 정책이 없어 아무 테이블도 읽지 못합니다.
   - `service_role` 키: **RLS를 우회합니다.** 서버·적재 스크립트에서만 쓰고, 브라우저·앱 번들·공개 저장소에 넣지 않습니다.
3. `Project Settings → Database` 의 연결 문자열은 이 적재 경로에서 쓰지 않습니다(REST만 사용).

## 2. 스키마 적용

**SQL Editor**에 `supabase/migrations/001_initial_schema.sql` 내용을 붙여넣고 실행합니다. 또는 Supabase CLI를 쓴다면 저장소 루트에서:

```sh
supabase link --project-ref <project-ref>
supabase db push
```

스키마의 핵심:

- 식별번호(`report_number`, `license_number`, `food_qr`, `barcode`)는 모두 `text`입니다. 앞자리 0과 하이픈을 보존합니다.
- `(source, source_record_id)` 유일 제약으로 같은 원문을 다시 적재해도 행이 늘지 않습니다. I0490은 `RTRVLDSUSE_SEQ`, C002는 `PRDLST_REPORT_NO`가 `source_record_id`입니다.
- `products.label_status` 기본값은 `unknown`입니다. C002에는 포장지 알레르기 표시가 없으므로 "표시 없음"이 아니라 "확인하지 못함"입니다.
- 이름·업체명은 `pg_trgm` GIN 인덱스로 부분 일치 검색을 합니다.
- `ingestion_checkpoints.next_start`는 **아직 저장하지 못한 첫 행**입니다.

마이그레이션에서 확인한 것(2026-11-20, PostgreSQL 18 호환 PGlite에서 실행): 6개 테이블·31개 인덱스 생성, 같은 SQL 재실행 시 오류 없음, `on conflict (source, source_record_id)` upsert로 2회 적재해도 1행, `report_number`가 `text`로 보존(`00123`), `updated_at` 트리거 동작, `anon` 역할에서 `permission denied`.

## 3. 환경 변수

`.env.example`을 `.env`로 복사한 뒤 채웁니다.

```sh
MFDS_API_KEY=발급받은_인증키
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service_role_키
SUPABASE_ANON_KEY=anon_키            # 앱에서 직접 읽을 때만. 서버 적재에는 쓰지 않음
```

`SUPABASE_URL`은 `https://`만 허용합니다(스크립트가 거부). Vercel에 배포할 때는 `service_role` 키를 Vercel 환경 변수에 넣지 말고, 서버 함수에서도 REST를 직접 호출하지 않는 현재 구조를 유지합니다. 자녀 정보는 여전히 브라우저에만 둡니다.

## 4. 적재 실행

먼저 외부 API만 확인합니다(DB 쓰기·체크포인트 갱신 없음).

```sh
node --env-file-if-exists=.env scripts/sync-mfds.js --service=I0490 --dry-run
```

회수·판매중지(I0490, 387행 규모) 전체:

```sh
node --env-file-if-exists=.env scripts/sync-mfds.js --service=I0490
```

품목제조보고(C002)는 약 **109만 행**입니다. 한 번에 끝내지 말고 나눠서 실행합니다.

```sh
node --env-file-if-exists=.env scripts/sync-mfds.js --service=C002 --max-pages=10 --delay-ms=200
```

| 옵션 | 설명 |
| --- | --- |
| `--service=I0490\|C002` | 필수. I0490→`safety_events`, C002→`products` |
| `--page-size=1000` | 1~1,000행. API 한도가 1,000행이라 기본값을 그대로 쓰는 것이 안전합니다 |
| `--max-pages=N` | 이번 실행에서 처리할 페이지 수(기본: 끝까지) |
| `--start=N` | 시작 행 번호(1부터). 체크포인트보다 우선 |
| `--reset` | 체크포인트를 무시하고 1행부터 새 주기 시작 |
| `--dry-run` | 외부 API만 읽고 DB에는 쓰지 않음 |
| `--delay-ms=N` | 페이지 사이 대기. 호출 한도 보호용 |

진행 상황은 JSON 한 줄씩 출력하고, 끝나면 `{"done":true,...}` 요약을 출력합니다. 인증키와 서비스 롤 키는 출력하지 않습니다.

### 체크포인트와 재개

- 성공한 페이지마다 `ingestion_checkpoints`를 갱신합니다. 그래서 중간에 끊기면 다음 실행이 `next_start`부터 이어서 처리합니다.
- 실패하면 `status='failed'`, `last_error`(300자)를 남기고 `next_start`는 실패한 페이지 앞에 그대로 둡니다. 같은 페이지를 다시 읽으므로 빠진 행이 생기지 않습니다.
- `status='completed'`인 상태에서 다시 실행하면 `cycle`을 1 올리고 1행부터 새 주기를 시작합니다(변경·추가 반영용). 처음부터 다시 하려면 `--reset`.
- 식품안전나라 응답은 `INFO-200`(데이터 없음)이면 빈 페이지로 보고 그 주기를 완료 처리합니다. 인증 오류(`INFO-100`)와 스키마 변경은 실패로 기록합니다.
- 한 페이지에 형식이 다른 행이 하나라도 있으면 그 페이지는 저장하지 않고 실패로 남깁니다(회수 기록을 조용히 버리지 않기 위해서). 매핑을 고친 뒤 다시 실행하거나, 원인을 적어 두고 `--start=`로 해당 페이지를 건너뜁니다.

## 5. 확인 쿼리

SQL Editor에서:

```sql
select source, count(*) from public.safety_events group by source;
select source, count(*) from public.products group by source;
select service, next_start, total_count, rows_synced, cycle, status, updated_at
  from public.ingestion_checkpoints order by service;
-- 같은 원문이 두 번 들어가지 않았는지
select source_record_id, count(*) from public.safety_events group by 1 having count(*) > 1;
-- 식별번호가 문자열로 보존되었는지(앞자리 0 확인)
select report_number, license_number from public.products where report_number like '0%' limit 5;
```

`total_count`와 실제 감싼 행 수가 맞지 않으면 [DATA_VALIDATION.md](DATA_VALIDATION.md)의 전체 수집 검증 항목을 먼저 확인합니다.

## 6. 비용과 한도

- Supabase 무료 티어 데이터베이스는 500MB입니다. C002 전체(약 109만 행, 원재료 문자열 포함)는 인덱스를 합치면 500MB에 가깝거나 넘을 수 있습니다. **우선 `--max-pages`로 1만~5만 행만 넣어 실제 크기를 잰 뒤** 전체 적재 여부를 정하는 편이 안전합니다. 필요하면 원문 컬럼만 남기거나 오래된 보고를 걸러 넣습니다.
- 식품안전나라 OpenAPI 호출 한도는 계정 조건에 따라 다릅니다. 공지와 신청 계정의 조건을 확인하고, `--delay-ms`로 페이지 간격을 둡니다.
- 적재는 Supabase REST 요청 1회당 최대 1,000행이라 C002 전체는 약 1,100회의 upsert 요청이 됩니다.

## 7. 보안

- 6개 테이블 모두 RLS를 켜고 정책을 두지 않았습니다. `service_role`만 접근합니다. 앱에서 `anon` 키로 읽게 하려면 필요한 컬럼만 노출하는 정책을 따로 추가합니다.
- `watchlists`·`alert_deliveries`의 `user_id`는 인증 도입 전까지 외부 식별자를 문자열로 받습니다. 공개 전에는 Supabase Auth 연동과 사용자별 정책이 필요합니다.
- `service_role` 키가 브라우저 번들·공개 저장소·로그에 들어가지 않게 합니다. 이 저장소의 기본 앱(`/`, `/demo`)은 Supabase를 호출하지 않습니다.

## 아직 검증하지 않은 것

- 이 마이그레이션을 **실제 Supabase 프로젝트**에 적용해 보지는 않았습니다. Supabase에서만 있는 역할(`anon`, `authenticated`)과 확장 설치 상태를 확인하려면 적용 후 위 확인 쿼리를 먼저 돌립니다.
- 실제 발급 인증키로 적재를 돌려 본 적이 없습니다. 필드명은 공개 `sample` 키 응답(2026-11-20)으로 확인했고, `sample` 키는 매번 같은 5행만 돌려주므로 대량 적재 검증에는 쓸 수 없습니다.
- `sample` 키는 `start`/`end`를 바꿔도 같은 5행을 돌려주어 **페이지네이션 자체는 실측하지 못했습니다.** 실제 키로 `--dry-run --max-pages=2`를 돌려 두 번째 페이지가 다른 행인지 먼저 확인합니다.
- Supabase REST(PostgREST) upsert 동작은 모의 `fetch` 테스트로만 확인했습니다. 실제 프로젝트에서는 `--max-pages=1`로 한 페이지를 넣고 위 확인 쿼리로 중복 여부를 봅니다.
- I0490 응답에는 회수/판매중지를 나누는 필드가 없어 `event_type`을 `unspecified`로 둡니다. 회수 방법(`RTRVLPLANDOC_RTRVLMTHD`)은 자주 비어 있습니다.
- `CRET_DTM`의 시간대는 문서로 확인하지 않았습니다. `published_at_text`에 원문을 그대로 둡니다.
- 식약처 이미지 주소는 `http://`라서 저장하지 않습니다(https만 남김). 앱에서 보여 주려면 별도 판단이 필요합니다.
