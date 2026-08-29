# architecture-aws.md — 이전 전 인프라 구성 (AWS)

> 이 문서는 **인프라 계층**만 다룬다. 논리·애플리케이션·데이터 아키텍처는
> [`architecture-r1.md`](architecture-r1.md)에 있으며 인프라와 독립적이다.
> 이전 후 구성은 [`architecture-current.md`](architecture-current.md), 이전 과정과 판단
> 근거는 [`migration.md`](migration.md)를 본다.
>
> **작성 시점** 2026-08-29. AWS 리소스가 살아 있는 상태에서 CLI로 실제 설정을 조회해
> 작성했다. 기억이나 추측으로 쓴 항목은 없으며, 조회하지 못한 항목은 그렇다고 명시했다.
>
> **식별자 표기** 계정 ID·인스턴스 ID·VPC/서브넷 ID·ARN·RDS 엔드포인트·CloudFront 도메인은
> 저장소 공개를 전제로 마스킹했다. 구성 이해에 필요한 것은 이름과 관계이지 식별자가 아니다.

---

## 1. 전체 구성

```
                    [사용자 브라우저]
                           │
                           ▼
              ┌────────────────────────┐
              │  CloudFront (전역)     │  PriceClass_200
              │  redirect-to-https     │
              └───────┬────────────────┘
                      │
        ┌─────────────┴──────────────┐
        │ 기본 동작(/*)               │ /api/*
        ▼                            ▼
┌──────────────────┐      ┌─────────────────────┐
│ S3 (정적 웹)     │      │  ALB (internet-     │  ap-northeast-2a + 2c
│ ssabi-web        │      │  facing, HTTP:80)   │
│ Vite 빌드 산출물 │      └──────────┬──────────┘
└──────────────────┘                 │  대상 그룹 :80
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
          ┌───────────────────┐            ┌───────────────────┐
          │ EC2 ssabi-app-a   │            │ EC2 ssabi-app-c   │
          │ t3.medium         │            │ t3.medium         │
          │ AZ 2a / 퍼블릭    │            │ AZ 2c / 퍼블릭    │
          │ nginx :80         │            │ nginx :80         │
          │  └ PM2 cluster×2  │            │  └ PM2 cluster×2  │
          │     node :3000    │            │     node :3000    │
          └─────────┬─────────┘            └─────────┬─────────┘
                    └────────────────┬────────────────┘
                                     ▼
                       ┌──────────────────────────┐
                       │ RDS PostgreSQL 16.15     │  프라이빗 서브넷
                       │ db.t4g.micro, Multi-AZ   │  a/c
                       │ pgvector                 │
                       └──────────────────────────┘

                       [Amazon Bedrock] ← EC2에서 직접 호출
                       Claude Haiku 4.5 / Titan Embed v2
```

**리전** ap-northeast-2 (서울) 단일. Bedrock 모델 ID만 `global.` 접두사 추론 프로파일을 쓴다
(ap-northeast-2에서 `us.` 접두사가 `ValidationException`으로 거절돼 전환한 이력이 있다).

---

## 2. 네트워크

### 2.1 VPC·서브넷

| 항목 | 값 |
| --- | --- |
| VPC | `ssabi-vpc`, `10.0.0.0/16` (기본 VPC 아님) |
| 인터넷 게이트웨이 | 1개, attached |
| **NAT Gateway** | **없음** |

| 서브넷 | AZ | CIDR | 퍼블릭 IP 자동할당 | 용도 |
| --- | --- | --- | --- | --- |
| `ssabi-public-a` | 2a | `10.0.1.0/24` | 예 | ALB, EC2 |
| `ssabi-public-c` | 2c | `10.0.2.0/24` | 예 | ALB, EC2 |
| `ssabi-private-a` | 2a | `10.0.11.0/24` | 아니오 | RDS |
| `ssabi-private-c` | 2c | `10.0.12.0/24` | 아니오 | RDS |

**EC2는 퍼블릭 서브넷에 있고 Elastic IP를 직접 붙였다.** 프라이빗 서브넷에 두고 NAT
Gateway로 아웃바운드를 빼는 구성이 아니다. 이 선택으로 NAT Gateway 요금(이 구성에서
단일 최대 과금 항목이 됐을 것)이 발생하지 않았다. 대신 EC2가 퍼블릭 IP를 갖게 되므로
보안은 아래 보안 그룹 사슬로 확보했다.

Elastic IP 2개가 각 인스턴스의 ENI에 연결돼 있다(`10.0.1.x`, `10.0.2.x`).

### 2.2 보안 그룹 — 3단 사슬

인바운드를 CIDR이 아니라 **앞단 리소스 참조**로 잠갔다. 각 계층은 바로 앞 계층에서
오는 트래픽만 받는다.

| 보안 그룹 | 인바운드 | 출처 |
| --- | --- | --- |
| `ssabi-alb-sg` | TCP 80 | **CloudFront 관리형 접두사 목록** (`com.amazonaws.global.cloudfront.origin-facing`) |
| `ssabi-ec2-sg` | TCP 80 | `ssabi-alb-sg` (SG 참조) |
| `ssabi-rds-sg` | TCP 5432 | `ssabi-ec2-sg` (SG 참조) |

ALB가 인터넷 대면(`internet-facing`)이지만 **실제로는 CloudFront에서 오는 요청만 받는다.**
접두사 목록을 쓰면 CloudFront 엣지 IP 대역이 바뀌어도 규칙을 고칠 필요가 없다.

EC2에 퍼블릭 IP가 있어도 80 포트는 ALB SG에서만 열리므로 직접 접근되지 않는다.
관리 접근은 포트 개방 없이 **SSM Session Manager**로 한다(EC2에 IAM 인스턴스 프로파일 부착).

---

## 3. 컴퓨트

### 3.1 EC2

| 항목 | 값 |
| --- | --- |
| 인스턴스 | `ssabi-app-a` (AZ 2a), `ssabi-app-c` (AZ 2c) |
| 타입 | t3.medium (2 vCPU / 4 GiB) |
| OS | Amazon Linux 2023 |
| 루트 볼륨 | `/dev/xvda` |
| IAM 인스턴스 프로파일 | 부착됨 (SSM, S3, Bedrock 접근용) |
| 애플리케이션 경로 | `/opt/ssabi` |
| 실행 사용자 | `deploy` |

동일 AMI로 2대를 서로 다른 AZ에 배치했다. **Auto Scaling Group은 두지 않았다** — 데모
1권 규모에 트래픽이 예측 가능했고, ASG를 붙이면 배포 파이프라인(아래 5장)이 인스턴스
ID를 고정으로 참조할 수 없게 돼 복잡도만 늘어난다. 가용성은 "2대 고정 + ALB 헬스체크"
수준으로 의도적으로 제한했다.

### 3.2 nginx (리버스 프록시)

각 EC2에서 80을 받아 `127.0.0.1:3000`(Node)으로 넘긴다. **SSE 스트리밍이 이 설정에
직접 의존한다.**

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/;   # /api 접두사를 벗겨서 전달

    proxy_buffering off;                  # ← SSE 핵심
    proxy_cache off;
    chunked_transfer_encoding on;
    proxy_read_timeout 300s;              # 긴 스트림 대비

    proxy_set_header X-Accel-Buffering no;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    ...
}

location /health { proxy_pass http://127.0.0.1:3000/health; }  # 접두사 없이 그대로
location /       { return 404; }
```

`proxy_buffering off`가 없으면 첫 토큰이 즉시 나가지 않고 응답이 끝날 때 한꺼번에
전달된다. 리캡·챗봇이 전부 스트리밍이므로 **이전 후 프록시 계층에서 같은 동작을
반드시 재확인해야 한다**(Phase 4 검증 1번).

`/api/` 접두사를 nginx가 벗겨내므로 백엔드 라우트에는 `/api`가 없다. 프록시가 사라지는
구성으로 옮기면 프론트의 API 베이스 URL 처리가 함께 바뀐다.

### 3.3 PM2

```js
// ecosystem.config.js
{ name: 'ssabi-api', script: 'dist/index.js', instances: 2, exec_mode: 'cluster' }
```

인스턴스당 워커 2개, 총 4개 프로세스. 클러스터 모드이므로 **워커 간 메모리를 공유하지
않는다** — 세션 리캡 캐시가 DB(`session_recap_cache` 테이블) 기반인 것이 이 구성에서
필수였다.

---

## 4. 데이터

| 항목 | 값 |
| --- | --- |
| 엔진 | PostgreSQL 16.15 |
| 인스턴스 클래스 | db.t4g.micro |
| 스토리지 | 20 GiB |
| **Multi-AZ** | **활성** |
| 퍼블릭 접근 | 비활성 (프라이빗 서브넷) |
| 확장 | `vector` (pgvector) |

pgvector로 `pages.embedding`에 페이지 임베딩을 저장하고 HNSW 인덱스로 유사도 검색을
한다. 임베딩 모델은 Bedrock의 `amazon.titan-embed-text-v2:0`, 1024차원.

**적재 상태 (2026-08-29 실측)** — 「탁류」 411페이지 전량에 임베딩이 채워져 있고
누락 0건이다. 즉 데모에서 벡터 검색이 실제로 유효하게 동작했다.

Titan은 Bedrock 전용이라 AWS를 닫으면 함께 사라진다. 이전 후 전량 재임베딩이 필요하다.

---

## 5. 배포 파이프라인

**GitHub Actions + S3 + SSM.** SSH 키를 GitHub에 두지 않기 위해 SSM 경유로 설계했다.

```
push to main (backend/**)
   └→ GitHub Actions
        ├ npm ci → npm run build (TypeScript → dist)
        ├ tar (dist, scripts, migrations, package*.json, ecosystem.config.js)
        ├ aws s3 cp → s3://ssabi-assets/deploy/backend-deploy.tar.gz
        └ aws ssm send-command → EC2 2대 동시
             ├ s3 cp 내려받기 → tar 해제
             ├ npm install --production
             ├ pm2 restart ssabi-api (없으면 start)
             └ curl localhost:3000/health
```

프론트도 같은 방식으로 S3에 올리고 CloudFront 무효화를 건다(`deploy-frontend.yml`).

GitHub Secrets로 IAM 액세스 키, 인스턴스 ID, 버킷명을 주입한다. **이 액세스 키는
계정 폐쇄 시 함께 폐기 대상이다**(Phase 5).

`npm install -g npm@11` 단계가 있는데, Node 22 번들 npm 10.x의 `npm ci` +
`optionalDependencies` `EBADPLATFORM` 회귀를 피하기 위한 것이다(2026-08-23 대응).

---

## 6. CDN·정적 호스팅

| 항목 | 값 |
| --- | --- |
| 배포 | CloudFront 1개 |
| Price Class | `PriceClass_200` |
| 뷰어 프로토콜 | `redirect-to-https` |
| 대체 도메인(CNAME) | **없음** — CloudFront 기본 도메인 사용 |

오리진 2개와 경로 기반 분기:

| 동작 | 오리진 | 허용 메서드 | 캐시 |
| --- | --- | --- | --- |
| 기본 `/*` | S3 (`ssabi-web`) | GET/HEAD/OPTIONS | 압축 활성 |
| `/api/*` | ALB | 전체 (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) | **Min/Default/Max TTL = 0**, 헤더 `*`·쿠키 전량·쿼리스트링 전달 |

`/api/*`의 TTL을 전부 0으로 두고 헤더를 전량 전달하는 것이 **SSE가 CloudFront를
통과할 수 있었던 조건**이다. 캐싱이 걸리면 스트림이 끊기거나 응답이 재사용된다.

**Route53 호스팅 존 없음, 등록 도메인 없음** — 계정 폐쇄 시 잃을 도메인 자산이 없다
(2026-08-29 조회 확인).

### S3 버킷

| 버킷 | 내용 |
| --- | --- |
| `ssabi-web-…` | Vite 빌드 산출물, 표지 이미지 5종, 파비콘 |
| `ssabi-assets-…` | 「탁류」 원문 텍스트, 배포 아티팩트, 배포 스크립트 |

**두 버킷의 모든 객체는 저장소에 원본이 있다**(`frontend/public/`, `backend/data/raw/`,
`.github/workflows/`). 계정 폐쇄로 소실되는 고유 자산은 없다(2026-08-29 대조 확인).

---

## 7. 비용

**이 계정은 AWS Organizations 멤버 계정이며, 상위 조직의 서비스 제어 정책(SCP)이
`ce:GetCostAndUsage`를 명시적으로 거부한다.** 따라서 Cost Explorer API로 서비스별
실비용을 조회할 수 없었다.

```
AccessDeniedException: ... not authorized to perform: ce:GetCostAndUsage
... with an explicit deny in a service control policy
```

실비용은 결제 콘솔에서 사람이 직접 확인해야 하며, 그마저 조직 정책으로 막혀 있을 수
있다. **추정치를 실측치처럼 적지 않기 위해 이 문서에는 금액을 쓰지 않는다.** 대신
과금 대상 리소스 목록을 남겨, 확인 가능한 시점에 대조할 수 있게 한다.

| 과금 리소스 | 수량·사양 | 성격 |
| --- | --- | --- |
| EC2 t3.medium | 2대, 상시 가동 | 시간당 |
| RDS db.t4g.micro **Multi-AZ** | 1대(스탠바이 포함 실질 2대분), 상시 | 시간당 |
| RDS 스토리지 | 20 GiB gp | 월 |
| ALB | 1개, 상시 | 시간당 + LCU |
| Elastic IP | 2개 (연결 상태) | 연결 시 시간당 |
| CloudFront | PriceClass_200 | 전송량·요청수 |
| S3 | 약 2.2 MiB, 객체 14개 | 무시 가능 |
| Bedrock | Haiku 4.5 + Titan Embed, 호출당 | 사용량 |
| NAT Gateway | **없음** | — |

**상시 과금 항목이 비용의 대부분이다** — EC2 2대, Multi-AZ RDS, ALB, EIP 2개가 트래픽과
무관하게 매시간 청구된다. 포트폴리오로 유지하려면 방문이 없는 시간에도 이 전부를
계속 낸다. 이것이 이전 결정의 직접적인 동기다([`migration.md`](migration.md) 참조).

---

## 8. 이 구성에서 의도적으로 넣지 않은 것

| 항목 | 이유 |
| --- | --- |
| Auto Scaling Group | 데모 규모에 불필요. 배포가 인스턴스 ID를 고정 참조하는 구조와 충돌 |
| NAT Gateway | EC2를 퍼블릭 서브넷 + EIP로 배치해 회피. 단일 최대 과금 항목을 없앰 |
| ALB HTTPS 리스너 | TLS 종단을 CloudFront가 담당. ALB는 CloudFront에서만 접근 가능하므로 내부 구간은 HTTP |
| 커스텀 도메인·ACM 인증서 | CloudFront 기본 도메인으로 충분. 도메인 비용·관리 대상을 늘리지 않음 |
| RDS 읽기 복제본 | 읽기 부하가 단일 인스턴스로 충분 |
| ElastiCache | 세션 리캡 캐시를 DB 테이블로 처리 |
| WAF | 데모 규모에 과함 |

---

## 9. 이전 시 반드시 재확인할 것

이 구성에 **암묵적으로 의존하던 동작**들이다. 옮기면 조용히 깨질 수 있다.

1. **SSE 무버퍼링** — nginx `proxy_buffering off` + CloudFront TTL 0의 조합에 의존.
   로컬에서는 재현되지 않고 배포 후에야 드러난다.
2. **`/api` 접두사 제거** — nginx가 벗겨내던 것. 프록시가 없어지면 경로가 어긋난다.
3. **Titan 1024차원 임베딩** — Bedrock 전용. 전량 재임베딩 필요하며, 기존 벡터를
   비우지 않으면 서로 다른 벡터 공간이 섞여 **에러 없이** 검색이 무의미해진다.
4. **PM2 클러스터 전제** — 워커 4개가 상태를 공유하지 않는다는 전제로 짜인 코드가
   단일 컨테이너로 가면 전제가 바뀐다(깨지진 않지만 주석이 사실과 어긋나게 된다).
5. **SG 사슬로 확보하던 격리** — 프라이빗 서브넷 RDS가 공개 엔드포인트 + 인증으로
   바뀐다. 격리 수준이 실제로 내려가는 지점이므로 수용 근거를 남겨야 한다.
6. **Bedrock IAM 서명 인증** — API 키 기반으로 바뀐다. 키 관리 책임이 생긴다.
