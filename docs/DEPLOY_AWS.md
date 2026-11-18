# 데모 자동 배포 설정 (GitHub Actions → S3 + CloudFront)

`main`에 병합되면 GitHub Actions가 테스트를 돌리고, 통과하면 `scripts/deploy-demo-s3.sh`로 데모를 배포합니다. Actions 탭의 **Run workflow**로 수동 실행도 됩니다. 워크플로: `.github/workflows/deploy-demo.yml`.

## 왜 키를 저장하지 않나요 (OIDC)

GitHub 저장소에 AWS 키를 넣지 않습니다. 배포할 때마다 GitHub이 "toseowon-bit/ahpu 저장소의 main 브랜치에서 실행 중"이라는 증명(OIDC 토큰)을 AWS에 보이고, AWS는 그 조건이 맞을 때만 몇 분짜리 임시 권한을 줍니다.

- 유출될 장기 키가 없습니다.
- 다른 저장소, 다른 브랜치, 포크(PR)에서는 이 권한을 받을 수 없습니다(`docs/aws-github-oidc-trust.json`의 조건).
- 권한은 데모 버킷 하나와 CloudFront 배포 관련 작업으로 한정됩니다(`docs/aws-demo-s3-policy.json`).

## 처음 한 번: AWS 설정

`aws login --profile ahpu`로 로그인한 컴퓨터에서, 이 저장소 폴더에서 실행합니다. IAM은 리전과 무관한 전역 서비스입니다.

1. GitHub OIDC 공급자 등록(프로젝트에 한 번만). 이미 있다는 오류(`EntityAlreadyExists`)가 나면 그대로 다음 단계로 가세요.

   ```bash
   aws iam create-open-id-connect-provider --profile ahpu --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com
   ```

2. 배포 역할 만들기. 신뢰 정책의 `<ACCOUNT_ID>`를 내 계정 번호로 바꿔 씁니다.

   ```bash
   ACCOUNT=$(aws sts get-caller-identity --profile ahpu --query Account --output text)
   sed "s/<ACCOUNT_ID>/$ACCOUNT/" docs/aws-github-oidc-trust.json > /tmp/ahpu-trust.json
   aws iam create-role --profile ahpu --role-name ahpu-demo-deploy --assume-role-policy-document file:///tmp/ahpu-trust.json
   aws iam put-role-policy --profile ahpu --role-name ahpu-demo-deploy --policy-name ahpu-demo-deploy --policy-document file://docs/aws-demo-s3-policy.json
   echo "arn:aws:iam::$ACCOUNT:role/ahpu-demo-deploy"
   ```

   마지막 줄에 나온 역할 ARN을 다음 단계에서 씁니다.

콘솔에서 하려면: IAM → 자격 증명 공급자 → 공급자 추가(OpenID Connect, 공급자 URL `https://token.actions.githubusercontent.com`, 대상 `sts.amazonaws.com`) → IAM → 역할 → 역할 생성 → 사용자 지정 신뢰 정책에 `docs/aws-github-oidc-trust.json` 내용(계정 번호 교체) → 인라인 정책에 `docs/aws-demo-s3-policy.json` 내용 → 이름 `ahpu-demo-deploy`.

새 AWS 환경(프로젝트)은 AWS가 관리하는 조직 정책(SCP)이 적용됩니다. OIDC 공급자나 역할 생성이 `AccessDenied`로 막히면 그 오류를 알려 주세요. 갑자기 이전에 되던 작업이 막히면 AWS Settings → Billing에서 지출 한도도 확인하세요.

## 처음 한 번: GitHub 설정

저장소 **Settings → Secrets and variables → Actions → Variables 탭 → New repository variable**:

| 이름 | 값 |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | 위에서 나온 역할 ARN (`arn:aws:iam::…:role/ahpu-demo-deploy`) |
| `AWS_REGION` | 버킷이 있는 프로젝트 리전 (현재 `ap-southeast-2`) |

역할 ARN은 비밀값이 아니라 **Variables**에 넣습니다(Secrets 아님). 변수가 없으면 워크플로는 배포를 건너뛰고 안내만 남깁니다.

## 배포 실행

- 자동: `public/`이나 배포 스크립트가 바뀐 커밋이 `main`에 병합되면 실행됩니다.
- 수동: **Actions → Deploy demo to CloudFront → Run workflow**(main).

실행 기록의 Deploy 단계 마지막 줄에 `✔ 배포 완료: https://….cloudfront.net/`이 나오면 끝입니다.
