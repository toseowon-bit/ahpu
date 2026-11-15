#!/usr/bin/env bash
# 어푸 데모(/demo)를 S3 정적 웹사이트로 배포한다. 여러 번 실행해도 안전하다.
#
# 사용법:
#   AWS_PROFILE=ahpu scripts/deploy-demo-s3.sh
#   DEMO_BUCKET=다른-버킷-이름 AWS_REGION=ap-northeast-2 AWS_PROFILE=ahpu scripts/deploy-demo-s3.sh
#
# 하는 일:
#   1. 버킷이 없으면 만든다(있으면 건너뜀, 다른 계정의 버킷이면 중단).
#   2. 버킷 단위 퍼블릭 액세스 차단을 풀고, 객체 읽기(GetObject)만 공개하는 정책을 건다.
#   3. 정적 웹사이트 호스팅을 켠다(index.html).
#   4. dist/demo-static을 빌드해 업로드한다.
# 공개되는 것은 이 버킷의 데모 파일(가상 데이터)뿐이다. 목록 조회·쓰기는 공개하지 않는다.
set -euo pipefail

DEMO_BUCKET="${DEMO_BUCKET:-ahpu-demo-6a0deb}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
[ -n "${AWS_PROFILE:-}" ] && export AWS_PROFILE

cd "$(dirname "$0")/.."
step() { printf '\n▶ %s\n' "$*"; }
fail() { printf '✖ %s\n' "$*" >&2; exit 1; }

command -v aws >/dev/null || fail "AWS CLI가 없습니다. https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"

step "AWS 로그인 확인 (프로필: ${AWS_PROFILE:-기본}, 리전: $AWS_REGION)"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)" \
  || fail "로그인 정보가 없거나 만료됐습니다. 'aws login --profile ${AWS_PROFILE:-default}'를 먼저 실행하세요."
echo "계정: $ACCOUNT"

step "버킷 확인: $DEMO_BUCKET"
if head_err="$(aws s3api head-bucket --bucket "$DEMO_BUCKET" --expected-bucket-owner "$ACCOUNT" 2>&1)"; then
  echo "이미 있는 내 버킷입니다. 생성을 건너뜁니다."
elif grep -q -E '404|Not Found' <<<"$head_err"; then
  echo "버킷이 없어 새로 만듭니다."
  if [ "$AWS_REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$DEMO_BUCKET" >/dev/null
  else
    aws s3api create-bucket --bucket "$DEMO_BUCKET" \
      --create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null
  fi
  aws s3api wait bucket-exists --bucket "$DEMO_BUCKET"
  echo "생성 완료."
elif grep -q -E '403|Forbidden' <<<"$head_err"; then
  fail "'$DEMO_BUCKET'은(는) 다른 계정의 버킷이거나 접근 권한이 없습니다. DEMO_BUCKET에 다른 이름을 지정하세요."
else
  fail "버킷 확인 실패: $head_err"
fi

step "공개 읽기 설정 (버킷 단위 퍼블릭 액세스 차단 해제 + GetObject 공개 정책)"
aws s3api put-public-access-block --bucket "$DEMO_BUCKET" --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false"
POLICY=$(cat <<JSON
{"Version":"2012-10-17","Statement":[{"Sid":"PublicReadDemoObjects","Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::$DEMO_BUCKET/*"}]}
JSON
)
if ! policy_err="$(aws s3api put-bucket-policy --bucket "$DEMO_BUCKET" --policy "$POLICY" 2>&1)"; then
  printf '%s\n' "$policy_err" >&2
  fail "공개 정책을 걸지 못했습니다. 계정(프로젝트) 단위 '퍼블릭 액세스 차단'이 켜져 있거나 조직 정책이 막고 있을 수 있습니다. S3 콘솔 → '이 계정의 퍼블릭 액세스 차단 설정'을 확인하세요."
fi

step "정적 웹사이트 호스팅 켜기"
aws s3api put-bucket-website --bucket "$DEMO_BUCKET" \
  --website-configuration '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"index.html"}}'

step "데모 빌드 및 업로드"
node scripts/build-demo-static.js
# index.html은 갱신이 바로 보이도록 캐시하지 않고, css/js는 짧게 캐시한다.
aws s3 cp dist/demo-static/index.html "s3://$DEMO_BUCKET/index.html" \
  --content-type "text/html; charset=utf-8" --cache-control "no-cache"
aws s3 cp dist/demo-static/demo.css "s3://$DEMO_BUCKET/demo.css" \
  --content-type "text/css; charset=utf-8" --cache-control "max-age=300"
aws s3 cp dist/demo-static/demo.js "s3://$DEMO_BUCKET/demo.js" \
  --content-type "text/javascript; charset=utf-8" --cache-control "max-age=300"

URL="http://$DEMO_BUCKET.s3-website.$AWS_REGION.amazonaws.com/"
step "배포 확인"
if command -v curl >/dev/null && code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL")" && [ "$code" = "200" ]; then
  echo "열림 확인 (HTTP 200)"
else
  echo "아직 응답이 없습니다(HTTP ${code:-?}). 설정 반영에 1~2분 걸릴 수 있으니 잠시 후 브라우저로 열어 보세요."
fi
printf '\n✔ 배포 완료: %s\n' "$URL"
