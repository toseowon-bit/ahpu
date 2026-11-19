// 식품안전나라 원문을 Supabase로 적재하는 CLI.
// 사용: node --env-file-if-exists=.env scripts/sync-mfds.js --service=I0490 --max-pages=2
// 인증키·서비스 롤 키는 출력하지 않는다.
import {MfdsClient} from '../src/providers/mfds-client.js';
import {MfdsMaterialsClient} from '../src/providers/mfds-materials.js';
import {createSupabaseFromEnv} from '../src/db/supabase.js';
import {parseSyncArgs, runSync, MAX_PAGE_SIZE} from '../src/db/mfds-sync.js';

const HELP = `식품안전나라 → Supabase 적재

옵션
  --service=I0490|C002   필수. I0490=회수·판매중지(safety_events), C002=품목제조보고(products)
  --page-size=1000       1~${MAX_PAGE_SIZE}행. 기본 1000
  --max-pages=N          이번 실행에서 처리할 페이지 수. 기본: 끝까지
  --start=N              시작 행 번호(1부터). 체크포인트보다 우선
  --reset                체크포인트를 무시하고 1행부터 새 주기로 시작
  --dry-run              외부 API만 읽고 DB에는 쓰지 않음(체크포인트도 갱신하지 않음)
  --delay-ms=0           페이지 사이 대기(호출 한도 보호)
  --help

환경 변수
  MFDS_API_KEY             필수(식품안전나라 인증키)
  MFDS_BASE_URL            선택. https:// 주소만 허용
  SUPABASE_URL             dry-run이 아니면 필수
  SUPABASE_SERVICE_ROLE_KEY  dry-run이 아니면 필수(서버 전용)

예
  node --env-file-if-exists=.env scripts/sync-mfds.js --service=I0490
  node --env-file-if-exists=.env scripts/sync-mfds.js --service=C002 --max-pages=10 --delay-ms=200
`;

async function main() {
 let args;
 try {
  args = parseSyncArgs(process.argv.slice(2));
 } catch (error) {
  console.error(error.message);
  console.error('도움말: node scripts/sync-mfds.js --help');
  process.exitCode = 2;
  return;
 }
 if (args.help) {
  console.log(HELP);
  return;
 }
 const apiKey = process.env.MFDS_API_KEY;
 if (!apiKey) {
  console.error('MFDS_API_KEY 환경 변수가 필요합니다. .env.example을 참고하세요.');
  process.exitCode = 2;
  return;
 }
 if (apiKey === 'sample') {
  console.error('경고: sample 키는 매번 같은 견본 5행만 돌려줍니다. 적재 결과를 실제 데이터로 보지 마세요.');
 }
 let client;
 try {
  client = args.service === 'I0490'
   ? new MfdsClient({apiKey, baseUrl: process.env.MFDS_BASE_URL})
   : new MfdsMaterialsClient({apiKey, baseUrl: process.env.MFDS_BASE_URL});
 } catch (error) {
  console.error(error.message);
  process.exitCode = 2;
  return;
 }
 let rest = null;
 if (!args.dryRun) {
  try {
   rest = createSupabaseFromEnv(process.env);
  } catch (error) {
   console.error(error.message);
   process.exitCode = 2;
   return;
  }
 }
 try {
  const summary = await runSync({
   service: args.service,
   client,
   rest,
   pageSize: args.pageSize,
   maxPages: args.maxPages,
   dryRun: args.dryRun,
   reset: args.reset,
   delayMs: args.delayMs,
   startAt: args.start ?? null,
   logger: line => console.log(JSON.stringify({progress: line}))
  });
  console.log(JSON.stringify({done: true, ...summary}));
 } catch (error) {
  console.error(`적재 실패: ${error.message}`);
  console.error('체크포인트의 next_start부터 다시 실행하면 이어서 처리합니다(실패한 페이지는 저장되지 않았습니다).');
  process.exitCode = 1;
 }
}

await main();
