# 탁류 감사 교정 (2026-10-22)

이 교정은 기존 운영 별칭 100행과 관계 195행을 원문과 대조한 감사에 근거한다.
오류·정리 대상 160행을 수정하거나 중복/잘못된 연결을 삭제하며, 정상 91행과 판단
보류 44행은 원본 값을 그대로 보존한다. 인물 페이지 확정 오류 8행 외에, R129의
사용인 관계를 232쪽으로 바로잡기 위해 식모 인물의 최초 등장도 239→232로
수정한다. 식모/어멈 등의 인물 통합은 하지 않는다.

- `takryu-2026-10-22-scope.json`: 감사 스냅샷 해시, 교정 대상의 원래 값,
  보존 대상 135행, 본문·별칭·관계·인물·노트·장 경계의 교정 전 해시.
- `takryu-2026-10-22.json`: 169개 작업의 전후 값, 이유, 실제 원문 인용.
  `after: null`은 잘못된 연결 또는 이미 보존된 사실과 중복되는 행의 삭제다.

원문 분할 411페이지는 운영 본문과 모두 일치했다. 이 교정은 본문/임베딩/노트/
장 경계를 수정하지 않는다. 추출 과정에서 설명구를 별칭으로 받거나, 주장·계획을
사실로 확정하거나, 동일 관계를 늦은 페이지의 새 이력으로 쌓는 문제가 대상이다.

## 실행

저장소 루트에서 실행한다. 인자가 없으면 DB에 연결하지 않는다. 인증정보는 기존
`backend/.env`에서만 읽으며 로그나 Git에 기록하지 않는다.

```powershell
# 감사 시 저장한 로컬 스냅샷으로 교정안만 검증
node backend/scripts/apply-takryu-full-repair.cjs --check-plan --snapshot docs/reports/takryu-full-audit-2026-10-22/snapshot.json

# 운영 현재값/인용/의존성을 읽기 전용 트랜잭션에서 확인
node backend/scripts/apply-takryu-full-repair.cjs --preflight --output-dir tmp/takryu-repair-production

# 승인된 교정을 한 트랜잭션으로 적용; before.json이 이미 있으면 중단
node backend/scripts/apply-takryu-full-repair.cjs --apply --output-dir tmp/takryu-repair-production

# 별도 연결에서 모든 대상과 비대상 값, 보류 44행을 다시 비교
node backend/scripts/apply-takryu-full-repair.cjs --verify --output-dir tmp/takryu-repair-production

# HTTP 경계 검사, --chat 추가 시 최대 6개의 운영 모델 응답 검사
node backend/scripts/verify-takryu-full-repair.cjs --verify --output tmp/takryu-repair-production/http-verification.json
```

대상 프로젝트, 스냅샷 해시, 변경 전 값, 보호 행, 외부 의존성이 달라지면 적용을
중단한다. 업데이트/삭제는 기존 행의 모든 컬럼을 조건으로 사용하고 각 작업이
정확히 한 행에 적용되는지 확인한다. 짧은 테이블 잠금과 SERIALIZABLE 트랜잭션
안에서 교정 전후 전체 비교를 통과한 경우만 커밋한다. 그 전에 실패하면 롤백한다.

`before.json`은 교정 전 도서 콘텐츠 백업이고 `applied.json` 및
`verification.json`은 적용/별도 연결 검증 증거다. 재실행은 기존 값 불일치로
거절된다. 복원해야 할 경우 백업의 원래 행과 현재 값을 대조한 별도 역교정안을
검토해 적용한다. 현재 DB를 무조건 덮어쓰는 자동 복원은 제공하지 않는다.

보류 44행과 기존 인물 중복 후보는 이번 교정으로 정확성이 확인된 것이 아니다.
앞으로 생성되는 후보도 원문에 근거가 불충분하면 자동 승인하지 않아야 한다.
