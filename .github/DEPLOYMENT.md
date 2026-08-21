# 배포 설정 가이드

## GitHub Secrets 설정

GitHub 리포지토리 설정에서 다음 Secrets를 추가해야 합니다:

### Settings → Secrets and variables → Actions → New repository secret

#### AWS Credentials
```
AWS_ACCESS_KEY_ID
  - IAM 사용자의 Access Key ID
  - IAM 계정: gbsa16

AWS_SECRET_ACCESS_KEY
  - IAM 사용자의 Secret Access Key
```

#### S3 Buckets
```
S3_BUCKET
  - 값: ssabi-web-416573465045
  - 프론트엔드 정적 파일 버킷

S3_ASSETS_BUCKET
  - 값: ssabi-assets-416573465045
  - 백엔드 배포 패키지 버킷
```

#### CloudFront
```
CLOUDFRONT_DISTRIBUTION_ID
  - 값: E28V25IR9PZ14L
  - 프론트엔드 배포 CloudFront ID
```

#### EC2 Instances
```
EC2_INSTANCE_1
  - 값: i-0d10677e02f2c9297
  - 첫 번째 EC2 인스턴스 ID (AZ-a)

EC2_INSTANCE_2
  - 값: i-0e5e5fbcd08130783
  - 두 번째 EC2 인스턴스 ID (AZ-c)
```

---

## 자동 배포 흐름

### 프론트엔드 배포
**트리거:** `frontend/` 디렉토리 변경 시
**브랜치:** `main`, `feature/query-endpoint`

1. Node.js 20 설정
2. 의존성 설치 (`npm ci`)
3. 빌드 실행 (`npm run build`)
4. S3에 동기화
   - 정적 파일: 1년 캐시
   - index.html: 캐시 없음
5. CloudFront 캐시 무효화

**배포 확인:** https://d2mqlo8j8xaid.cloudfront.net

### 백엔드 배포
**트리거:** `backend/` 디렉토리 변경 시
**브랜치:** `main`, `feature/query-endpoint`

1. Node.js 20 설정
2. 의존성 설치 및 빌드
3. 배포 패키지 생성 (tar.gz)
4. S3에 업로드
5. SSM을 통해 두 EC2 인스턴스에 배포
6. PM2 재시작

**배포 확인:** https://d2mqlo8j8xaid.cloudfront.net/api/health

---

## 수동 배포 트리거

GitHub Actions 페이지에서 "Run workflow" 버튼을 클릭하여 수동으로 배포할 수 있습니다.

---

## IAM 권한 요구사항

GitHub Actions에서 사용할 IAM 사용자는 다음 권한이 필요합니다:

### S3
- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`
- `s3:ListBucket`

### CloudFront
- `cloudfront:CreateInvalidation`

### SSM (Systems Manager)
- `ssm:SendCommand`
- `ssm:GetCommandInvocation`

### EC2 (선택적)
- `ec2:DescribeInstances`

---

## 배포 확인 방법

### 프론트엔드
```bash
curl -I https://d2mqlo8j8xaid.cloudfront.net/
```

### 백엔드
```bash
curl https://d2mqlo8j8xaid.cloudfront.net/api/health
```

### 책 목록 확인
```bash
curl https://d2mqlo8j8xaid.cloudfront.net/api/books \
  -H "X-Device-Id: 11111111-1111-4111-8111-111111111111"
```

---

## 트러블슈팅

### 배포가 실패하면?

1. **GitHub Actions 로그 확인**
   - Actions 탭에서 실패한 워크플로우 클릭
   - 각 스텝의 로그 확인

2. **AWS Credentials 확인**
   - Secrets이 올바르게 설정되어 있는지 확인
   - IAM 사용자 권한 확인

3. **EC2 배포 실패 시**
   - AWS Console → Systems Manager → Run Command
   - Command ID로 실행 결과 확인

4. **CloudFront 캐시 문제**
   - 캐시 무효화가 완료되기까지 1-2분 소요
   - AWS Console에서 무효화 상태 확인

---

## 로컬 배포 스크립트

자동화가 설정되기 전이나 긴급 배포가 필요한 경우:

### 프론트엔드
```bash
cd frontend
npm run build
aws s3 sync dist/ s3://ssabi-web-416573465045/ --delete --profile gbsa16
aws cloudfront create-invalidation --distribution-id E28V25IR9PZ14L --paths "/*" --profile gbsa16
```

### 백엔드
```bash
cd backend
npm run build
tar --exclude='node_modules' -czf backend-deploy.tar.gz dist/ scripts/ migrations/ package.json package-lock.json ecosystem.config.js
aws s3 cp backend-deploy.tar.gz s3://ssabi-assets-416573465045/deploy/ --profile gbsa16

# SSM을 통해 배포
aws ssm send-command \
  --instance-ids i-0d10677e02f2c9297 i-0e5e5fbcd08130783 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[...]' \
  --region ap-northeast-2 \
  --profile gbsa16
```
