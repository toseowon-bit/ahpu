#!/usr/bin/env bash
# 어푸 데모(/demo)를 비공개 S3 버킷 + CloudFront(HTTPS)로 배포한다. 여러 번 실행해도 안전하다.
#
# 사용법:
#   AWS_PROFILE=ahpu scripts/deploy-demo-s3.sh
#   DEMO_BUCKET=다른-버킷 AWS_REGION=ap-northeast-2 AWS_PROFILE=ahpu scripts/deploy-demo-s3.sh
#   DEMO_WAIT=0 ...   # CloudFront 배포 완료(수 분)를 기다리지 않으려면
#
# 구성:
#   - S3 버킷은 프로젝트 리전에 두고 완전히 비공개(퍼블릭 액세스 차단 4개 모두 켬, 웹사이트 호스팅 없음).
#   - CloudFront는 Origin Access Control(OAC)로만 버킷을 읽는다. 버킷 정책은 이 배포(SourceArn)만 허용한다.
#   - 시청자 요청은 HTTPS로 리디렉션, 관리형 CachingOptimized + SecurityHeadersPolicy 사용.
#   - Lambda@Edge 등 리전 리소스는 쓰지 않는다(CloudFront는 전역 서비스).
set -euo pipefail

DEMO_BUCKET="${DEMO_BUCKET:-ahpu-demo-6a0deb}"
DEMO_WAIT="${DEMO_WAIT:-1}"
[ -n "${AWS_PROFILE:-}" ] && export AWS_PROFILE
# 리전: AWS_REGION > 프로필에 설정된 리전 > 서울. 새 AWS 환경(프로젝트)은 프로젝트 리전에만 만들 수 있다.
if [ -z "${AWS_REGION:-}" ] && command -v aws >/dev/null; then AWS_REGION="$(aws configure get region 2>/dev/null || true)"; fi
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"

# AWS 관리형 정책 ID (CloudFront 문서의 고정값)
CACHE_POLICY_ID="658327ea-f89d-4fab-a63d-7e88639e58f6"      # Managed-CachingOptimized
HEADERS_POLICY_ID="67f7725c-6f97-4210-82d7-5512b31e9d03"    # Managed-SecurityHeadersPolicy
OAC_NAME="ahpu-demo-oac-${DEMO_BUCKET:0:50}"   # CloudFront OAC 이름은 최대 64자
DIST_COMMENT="ahpu-demo:$DEMO_BUCKET"
ORIGIN_ID="s3-$DEMO_BUCKET"

cd "$(dirname "$0")/.."
step() { printf '\n▶ %s\n' "$*"; }
fail() { printf '✖ %s\n' "$*" >&2; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

command -v aws >/dev/null || fail "AWS CLI가 없습니다. https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"

step "AWS 로그인 확인 (프로필: ${AWS_PROFILE:-기본}, 리전: $AWS_REGION)"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)" \
  || fail "로그인 정보가 없거나 만료됐습니다. 'aws login --profile ${AWS_PROFILE:-default}'를 먼저 실행하세요."
echo "계정: $ACCOUNT"

step "1/6 버킷 확인: $DEMO_BUCKET"
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
elif grep -q -E '301|Moved Permanently|PermanentRedirect' <<<"$head_err"; then
  actual="$(aws s3api get-bucket-location --bucket "$DEMO_BUCKET" --query LocationConstraint --output text 2>/dev/null || true)"
  fail "버킷 '$DEMO_BUCKET'은(는) $AWS_REGION이 아니라 ${actual:-다른 리전}에 있습니다. AWS_REGION=${actual:-<버킷 리전>}을 붙여 다시 실행하세요."
elif grep -q -E '403|Forbidden' <<<"$head_err"; then
  fail "'$DEMO_BUCKET'은(는) 다른 계정의 버킷이거나 접근 권한이 없습니다. DEMO_BUCKET에 다른 이름을 지정하세요."
else
  fail "버킷 확인 실패: $head_err"
fi

step "2/6 버킷 비공개로 잠그기 (퍼블릭 액세스 차단 전부 켬, 웹사이트 호스팅 제거)"
aws s3api put-public-access-block --bucket "$DEMO_BUCKET" --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
# 예전 S3 웹사이트 방식으로 배포한 적이 있으면 그 설정을 지운다(없으면 아무 일도 없음).
aws s3api delete-bucket-website --bucket "$DEMO_BUCKET" 2>/dev/null || true

step "3/6 Origin Access Control 확인: $OAC_NAME"
# 목록이 여러 페이지면 CLI가 페이지마다 쿼리를 적용하므로, 모든 일치 항목을 받은 뒤 첫 실제 값을 고른다.
# (첫 페이지에 없을 때 'None'을 '없음'으로 오해해 중복 생성하지 않도록. awk는 끝까지 읽어 pipefail 중단을 피한다.)
OAC_ID="$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='$OAC_NAME'].Id" --output text \
  | awk '{for (i = 1; i <= NF; i++) if (!f && $i != "None") {print $i; f = 1}}')"
if [ -z "$OAC_ID" ] || [ "$OAC_ID" = "None" ]; then
  OAC_ID="$(aws cloudfront create-origin-access-control --origin-access-control-config \
    "Name=$OAC_NAME,Description=ahpu demo bucket access,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query OriginAccessControl.Id --output text)"
  echo "새로 만들었습니다: $OAC_ID"
else
  echo "이미 있습니다: $OAC_ID"
fi

step "4/6 CloudFront 배포 확인"
# 목록 조회 실패를 '배포 없음'으로 오해해 중복 생성하지 않도록, 결과를 먼저 변수에 받는다(실패 시 set -e로 중단).
DIST_LINE="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='$DIST_COMMENT'].[Id,DomainName,ARN]" --output text \
  | awk '!f && NF == 3 && $1 != "None" {print; f = 1}')"
read -r DIST_ID DIST_DOMAIN DIST_ARN <<<"$DIST_LINE"
NEW_DIST=0
if [ -z "${DIST_ID:-}" ] || [ "$DIST_ID" = "None" ]; then
  NEW_DIST=1
  cat > "$TMP/dist.json" <<JSON
{
  "CallerReference": "$DIST_COMMENT-$(date +%s)",
  "Comment": "$DIST_COMMENT",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "PriceClass": "PriceClass_200",
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "Origins": {"Quantity": 1, "Items": [{
    "Id": "$ORIGIN_ID",
    "DomainName": "$DEMO_BUCKET.s3.$AWS_REGION.amazonaws.com",
    "OriginAccessControlId": "$OAC_ID",
    "S3OriginConfig": {"OriginAccessIdentity": ""}
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "$ORIGIN_ID",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}},
    "Compress": true,
    "CachePolicyId": "$CACHE_POLICY_ID",
    "ResponseHeadersPolicyId": "$HEADERS_POLICY_ID"
  },
  "ViewerCertificate": {"CloudFrontDefaultCertificate": true}
}
JSON
  DIST_LINE="$(aws cloudfront create-distribution \
    --distribution-config "file://$TMP/dist.json" \
    --query "Distribution.[Id,DomainName,ARN]" --output text)"
  read -r DIST_ID DIST_DOMAIN DIST_ARN <<<"$DIST_LINE"
  echo "새로 만들었습니다: $DIST_ID ($DIST_DOMAIN)"
else
  echo "이미 있습니다: $DIST_ID ($DIST_DOMAIN)"
fi

step "5/6 버킷 정책: 이 CloudFront 배포만 읽기 허용"
cat > "$TMP/policy.json" <<JSON
{"Version":"2012-10-17","Statement":[{"Sid":"AllowCloudFrontOACRead","Effect":"Allow",
"Principal":{"Service":"cloudfront.amazonaws.com"},"Action":"s3:GetObject",
"Resource":"arn:aws:s3:::$DEMO_BUCKET/*","Condition":{"StringEquals":{"AWS:SourceArn":"$DIST_ARN"}}}]}
JSON
aws s3api put-bucket-policy --bucket "$DEMO_BUCKET" --policy "file://$TMP/policy.json"

step "6/6 데모 빌드 및 업로드"
node scripts/build-demo-static.js
# 빌드 결과를 모두 올린다. index.html은 갱신이 바로 보이도록 캐시하지 않고, css/js는 짧게 캐시한다.
for path in dist/demo-static/*; do
  file="$(basename "$path")"
  case "$file" in
    *.html) type="text/html; charset=utf-8"; cache="no-cache" ;;
    *.css)  type="text/css; charset=utf-8"; cache="max-age=300" ;;
    *.js)   type="text/javascript; charset=utf-8"; cache="max-age=300" ;;
    *) fail "알 수 없는 빌드 파일 형식: $file" ;;
  esac
  aws s3 cp "$path" "s3://$DEMO_BUCKET/$file" --content-type "$type" --cache-control "$cache"
done
if [ "$NEW_DIST" = 0 ]; then
  # 재배포: 엣지 캐시를 비워 바뀐 파일이 바로 보이게 한다(와일드카드 1개 = 무효화 경로 1개, 월 1,000경로까지 무료).
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
    --paths "/*" --query Invalidation.Id --output text >/dev/null
  echo "캐시 무효화 요청 완료."
fi

URL="https://$DIST_DOMAIN/"
if [ "$DEMO_WAIT" = 1 ]; then
  step "CloudFront 배포 완료 대기 (보통 3~10분)"
  aws cloudfront wait distribution-deployed --id "$DIST_ID"
  if command -v curl >/dev/null && code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL")" && [ "$code" = "200" ]; then
    echo "열림 확인 (HTTPS 200)"
  else
    echo "아직 응답이 없습니다(HTTP ${code:-?}). 1~2분 뒤 브라우저로 열어 보세요."
  fi
fi
printf '\n✔ 배포 완료: %s\n' "$URL"
printf '  S3 버킷은 비공개이며, CloudFront를 통해서만 열립니다.\n'
