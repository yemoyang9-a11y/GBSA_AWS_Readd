# ⛔ 종료된 구성 — 실행하지 마세요

**이 Terraform 구성이 정의하는 AWS 인프라는 2026-08-31에 종료됐습니다.**
계정 자격증명도 무효화됐고, 여기 적힌 리소스는 하나도 존재하지 않습니다.

현재 인프라는 AWS가 아닙니다 —
**[`docs/architecture/architecture-current.md`](../../docs/architecture/architecture-current.md)** 를 보세요.

| | |
| --- | --- |
| 현재 프론트 | Cloudflare Pages |
| 현재 백엔드 | Fly.io (도쿄, 스케일-투-제로) |
| 현재 DB | Supabase PostgreSQL + pgvector |

---

## ⚠️ `terraform apply` 를 실행하지 마세요

이 파일들은 지워지지 않았을 뿐 **되살리라고 남긴 것이 아닙니다.** AWS 자격증명이 있는
상태에서 `apply` 를 돌리면 EC2·RDS·ALB·Elastic IP 를 **실제로 생성하고 과금이 시작됩니다.**
이전의 목적 자체가 그 상시 과금을 없애는 것이었습니다.

state 백엔드가 `local` 이고 `terraform.tfstate` 는 저장소에 없습니다(`.gitignore`).
즉 여기엔 **어떤 실제 리소스와도 연결된 상태가 없습니다** — 돌리면 기존 것을 고치는 게
아니라 새로 만듭니다.

## 왜 지우지 않았나

이전 전 인프라를 **코드로 기술한 유일한 산출물**이라 남긴다. 같은 구성을 다루는 문서가
둘 더 있는데 성격이 다르다.

| 문서 | 성격 |
| --- | --- |
| 이 디렉터리 | 인프라를 **코드로** 어떻게 정의했는가 |
| [`architecture-aws.md`](../../docs/architecture/architecture-aws.md) | 실제로 무엇이 떠 있었는가 (CLI 실조회 기록) |
| [`architecture-r2.md`](../../docs/architecture/architecture-r2.md) | 그 구성을 **왜** 그렇게 설계했는가 |

이전 과정과 판단 근거는 [`docs/migration.md`](../../docs/migration.md) 에 있다.

## 무엇을 정의하고 있나

`.tf` 11개, 리소스 42개. 참고용 목록이다.

| 파일 | 내용 |
| --- | --- |
| `vpc.tf` | VPC·서브넷·인터넷 게이트웨이·라우트 테이블·DB 서브넷 그룹 |
| `security-groups.tf` | 보안 그룹 3개 — 3단 사슬(ALB → EC2 → RDS) |
| `ec2.tf` | 애플리케이션 인스턴스 (`count = 2`)·CloudWatch 알람 3·타깃 그룹 연결 |
| `alb.tf` | Application Load Balancer·타깃 그룹·리스너 |
| `rds.tf` | PostgreSQL 인스턴스·파라미터 그룹·모니터링용 IAM 역할 |
| `cloudfront.tf` | 배포·CloudFront Function(`functions/spa-routing.js`)·OAC·SSM 파라미터 |
| `s3.tf` | 버킷 2개(정적 호스팅·에셋) + 퍼블릭 접근 차단·버저닝·수명주기 |
| `iam.tf` | 인스턴스 프로파일·역할·정책 |
| `main.tf` · `variables.tf` · `outputs.tf` | provider·변수·출력 |

**⚠️ Elastic IP 는 이 구성에 없다.** `aws_eip` 리소스가 정의돼 있지 않다 —
`architecture-aws.md` 는 실제 인프라에 Elastic IP 2개가 있었다고 기록하므로,
**Terraform 밖에서 따로 만들어 붙였거나 구성이 도중에 어긋난 것**이다. 계정이 이미
닫혀 확인할 수 없어 사실만 적어 둔다.

**NAT Gateway 도 없다.** 이쪽은 의도된 선택이다 — 프라이빗 서브넷에 EC2 를 두는 대신
퍼블릭 서브넷에 두고 격리는 보안 그룹 3단 사슬로 확보했다. 최대 과금 항목을 없애면서
계층 격리를 유지한 구성이다. 근거는 `migration.md` Phase 0.5 에 있다.
