-- 001_initial_schema.sql
-- 어푸(AHPU) 초기 스키마: 식품안전나라 원문 적재 + 제품/사건 연결 + 관심 제품/알림 큐.
-- 원칙
--  * 식별번호(report_number, license_number, food_qr, barcode)는 문자열이다. 앞자리 0과 하이픈을 보존한다.
--  * 같은 원문을 다시 적재해도 늘어나지 않도록 (source, source_record_id)에 유일 제약을 둔다.
--  * 원문 표기(날짜·기한 문자열)는 _text 컬럼에 그대로 남기고, 해석한 값을 단정하지 않는다.
--  * 데이터 없음과 '무함유'를 구분한다(label_status 기본값 unknown).
-- 적용: Supabase SQL Editor에 붙여넣거나 `supabase db push`. 자세한 절차는 docs/SUPABASE_SETUP.md.

create extension if not exists pg_trgm;

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 제품 카탈로그(현재 원천: 식품안전나라 C002 품목제조보고 원재료)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manufacturer text,
  category text,
  food_type text,                                   -- PRDLST_DCNM (예: 과자, 음료)
  report_number text,                               -- PRDLST_REPORT_NO (품목제조보고번호)
  license_number text,                              -- LCNS_NO (업체 인허가번호)
  food_qr text,                                     -- 푸드QR 식별자(도입 시)
  barcode text,                                     -- BRCDNO
  raw_materials text,                               -- RAWMTRL_NM 원문
  raw_material_order text,                          -- RAWMTRL_ORDNO 원문
  reported_on text,                                 -- PRMS_DT 원문(YYYYMMDD)
  changed_on text,                                  -- CHNG_DT 원문(YYYYMMDD)
  export_product text,                              -- ETQTY_XPORT_PRDLST_YN
  label_status text not null default 'unknown'
    constraint products_label_status_check check (label_status in ('provided', 'unknown')),
  label_contains text[] not null default '{}',      -- 포장지에 함유 표시된 알레르기 유발 물질
  label_may_contain text[] not null default '{}',   -- 교차접촉(같은 시설) 표시
  label_text text,                                  -- 표시 원문
  source text not null,                             -- 예: mfds:C002
  source_record_id text not null,
  source_url text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_source_record_key unique (source, source_record_id)
);

comment on table public.products is '제품 카탈로그. 품목번호·업체번호가 모두 일치할 때만 사건을 연결한다.';
comment on column public.products.label_status is 'unknown은 알레르기 표시를 확인하지 못했다는 뜻이며 무함유가 아니다.';

create index if not exists products_report_number_idx on public.products (report_number);
create index if not exists products_license_number_idx on public.products (license_number);
create index if not exists products_barcode_idx on public.products (barcode) where barcode is not null;
create unique index if not exists products_food_qr_key on public.products (food_qr) where food_qr is not null;
create index if not exists products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
create index if not exists products_manufacturer_trgm_idx on public.products using gin (manufacturer gin_trgm_ops);

-- 회수·판매중지 사건(현재 원천: 식품안전나라 I0490)
create table if not exists public.safety_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'unspecified'
    constraint safety_events_type_check check (event_type in ('recall', 'sales-suspension', 'unspecified')),
  name text not null,                               -- PRDTNM
  manufacturer text,                                -- BSSHNM (I0490은 밑줄 없음)
  report_number text,                               -- PRDLST_REPORT_NO (빈 값이 흔하다)
  license_number text,                              -- LCNS_NO
  product_code text,                                -- PRDLST_CD
  product_code_name text,                           -- PRDLST_CD_NM
  barcode text,                                     -- BRCDNO
  reason text,                                      -- RTRVLPRVNS 회수 사유
  grade text,                                       -- RTRVL_GRDCD_NM 회수 등급
  product_type text,                                -- PRDLST_TYPE (농산물/가공식품/주류 등)
  lot text,                                         -- I0490에는 LOT 필드가 없어 대부분 null
  expiry_text text,                                 -- DISTBTMLMT 원문
  manufactured_text text,                           -- MNFDT 원문
  action text,                                      -- RTRVLPLANDOC_RTRVLMTHD 회수 방법
  address text,                                     -- ADDR 업체 주소
  phone text,                                       -- TELNO
  package_unit text,                                -- FRMLCUNIT
  image_urls text[] not null default '{}',          -- https 주소만 보관
  published_at_text text,                           -- CRET_DTM 원문(시간대 미확인)
  source text not null,                             -- 예: mfds:I0490
  source_record_id text not null,                   -- RTRVLDSUSE_SEQ (없으면 원문 해시)
  source_url text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safety_events_source_record_key unique (source, source_record_id)
);

comment on table public.safety_events is '회수·판매중지 원문 사건. 이 목록에 없다는 것이 안전을 뜻하지 않는다.';
comment on column public.safety_events.event_type is '견본 응답에 회수/판매중지 구분 필드가 없어 unspecified로 둔다.';

create index if not exists safety_events_report_number_idx on public.safety_events (report_number);
create index if not exists safety_events_license_number_idx on public.safety_events (license_number);
create index if not exists safety_events_barcode_idx on public.safety_events (barcode) where barcode is not null;
create index if not exists safety_events_fetched_at_idx on public.safety_events (source, fetched_at desc);
create index if not exists safety_events_name_trgm_idx on public.safety_events using gin (name gin_trgm_ops);
create index if not exists safety_events_manufacturer_trgm_idx on public.safety_events using gin (manufacturer gin_trgm_ops);

-- 제품 ↔ 사건 연결. 확정은 품목번호·업체번호가 모두 일치할 때만.
create table if not exists public.product_event_links (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  event_id uuid not null references public.safety_events (id) on delete cascade,
  match_status text not null default 'candidate'
    constraint product_event_links_match_check check (match_status in ('confirmed', 'candidate', 'rejected')),
  evidence jsonb not null default '{}'::jsonb,      -- 일치/충돌한 식별번호, 근거 메모
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_event_links_key unique (product_id, event_id)
);

comment on table public.product_event_links is 'candidate는 자동 연결이 아니며 알림 발송 근거가 될 수 없다.';

create index if not exists product_event_links_event_idx on public.product_event_links (event_id);
create index if not exists product_event_links_review_idx on public.product_event_links (match_status) where match_status = 'candidate';

-- 관심 제품(사용자별). user_id는 인증 도입 전까지 외부 식별자를 문자열로 받는다.
create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint watchlists_key unique (user_id, product_id)
);

comment on table public.watchlists is '사용자별 접근 제어는 RLS로 구현한다(현재는 모든 anon/authenticated 접근 차단).';

create index if not exists watchlists_product_idx on public.watchlists (product_id);

-- 알림 발송 큐. (사건, 수신자, 채널) 단위 멱등키로 중복 발송을 막는다.
create table if not exists public.alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_id uuid not null references public.safety_events (id) on delete cascade,
  channel text not null constraint alert_deliveries_channel_check check (channel in ('push', 'email')),
  status text not null default 'queued'
    constraint alert_deliveries_status_check check (status in ('queued', 'sent', 'failed', 'suppressed')),
  idempotency_key text not null,
  attempts integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_deliveries_idempotency_key_key unique (idempotency_key)
);

create index if not exists alert_deliveries_event_idx on public.alert_deliveries (event_id);
create index if not exists alert_deliveries_user_idx on public.alert_deliveries (user_id);
create index if not exists alert_deliveries_queue_idx on public.alert_deliveries (status) where status = 'queued';

-- 수집 체크포인트. (service, query_key) 한 줄이 한 주기의 진행 위치를 나타낸다.
create table if not exists public.ingestion_checkpoints (
  id uuid primary key default gen_random_uuid(),
  service text not null,                            -- I0490 | C002
  query_key text not null default '',               -- 검색 조건 서명(전체 수집은 빈 문자열)
  next_start integer not null default 1
    constraint ingestion_checkpoints_next_start_check check (next_start >= 1),
  page_size integer not null default 1000
    constraint ingestion_checkpoints_page_size_check check (page_size between 1 and 1000),
  total_count integer,
  rows_synced bigint not null default 0,
  cycle integer not null default 1,
  status text not null default 'idle'
    constraint ingestion_checkpoints_status_check check (status in ('idle', 'running', 'completed', 'failed')),
  last_record_key text,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingestion_checkpoints_key unique (service, query_key)
);

comment on table public.ingestion_checkpoints is 'next_start는 아직 저장하지 못한 첫 행이다. 실패 시 이 값부터 다시 읽는다.';

create index if not exists ingestion_checkpoints_status_idx on public.ingestion_checkpoints (status);

-- updated_at 트리거
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();

drop trigger if exists safety_events_set_updated_at on public.safety_events;
create trigger safety_events_set_updated_at before update on public.safety_events for each row execute function public.set_updated_at();

drop trigger if exists product_event_links_set_updated_at on public.product_event_links;
create trigger product_event_links_set_updated_at before update on public.product_event_links for each row execute function public.set_updated_at();

drop trigger if exists alert_deliveries_set_updated_at on public.alert_deliveries;
create trigger alert_deliveries_set_updated_at before update on public.alert_deliveries for each row execute function public.set_updated_at();

drop trigger if exists ingestion_checkpoints_set_updated_at on public.ingestion_checkpoints;
create trigger ingestion_checkpoints_set_updated_at before update on public.ingestion_checkpoints for each row execute function public.set_updated_at();

-- 접근 제어: 기본은 전면 차단. 서버(service_role)만 RLS를 우회해 읽고 쓴다.
-- 앱에서 anon 키로 읽게 하려면 아래 정책을 따로 추가하고 필요한 컬럼만 노출한다.
alter table public.products enable row level security;
alter table public.safety_events enable row level security;
alter table public.product_event_links enable row level security;
alter table public.watchlists enable row level security;
alter table public.alert_deliveries enable row level security;
alter table public.ingestion_checkpoints enable row level security;

revoke all on table public.products from anon, authenticated;
revoke all on table public.safety_events from anon, authenticated;
revoke all on table public.product_event_links from anon, authenticated;
revoke all on table public.watchlists from anon, authenticated;
revoke all on table public.alert_deliveries from anon, authenticated;
revoke all on table public.ingestion_checkpoints from anon, authenticated;
