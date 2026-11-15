#!/usr/bin/env bash
# 사용법: DEMO_BUCKET=버킷이름 AWS_REGION=ap-northeast-2 scripts/deploy-demo-s3.sh
# 버킷의 정적 웹사이트 호스팅과 공개 읽기 정책은 미리 설정되어 있어야 한다(이 스크립트는 파일 업로드만 한다).
set -euo pipefail
: "${DEMO_BUCKET:?DEMO_BUCKET 환경변수가 필요합니다}"
: "${AWS_REGION:=ap-northeast-2}"
cd "$(dirname "$0")/.."
node scripts/build-demo-static.js
# index.html은 갱신이 바로 보이도록 캐시하지 않고, css/js는 짧게 캐시한다.
aws s3 cp dist/demo-static/index.html "s3://$DEMO_BUCKET/index.html" --region "$AWS_REGION" \
  --content-type "text/html; charset=utf-8" --cache-control "no-cache"
aws s3 cp dist/demo-static/demo.css "s3://$DEMO_BUCKET/demo.css" --region "$AWS_REGION" \
  --content-type "text/css; charset=utf-8" --cache-control "max-age=300"
aws s3 cp dist/demo-static/demo.js "s3://$DEMO_BUCKET/demo.js" --region "$AWS_REGION" \
  --content-type "text/javascript; charset=utf-8" --cache-control "max-age=300"
echo "업로드 완료: http://$DEMO_BUCKET.s3-website.$AWS_REGION.amazonaws.com/"
