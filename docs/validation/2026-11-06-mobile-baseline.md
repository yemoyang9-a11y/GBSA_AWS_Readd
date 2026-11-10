# 모바일 작업 전 기준선 (2026-11-06)

- 브랜치: `yemoyang9-a11y/selkie`, 기준 커밋 `4187fc5`
- 명령: `cd frontend && npx vitest run`
- 결과: Test Files 61 passed (61), Tests 404 passed (404). 실패 0건.
- PC 회귀 스크린샷 기준선: `npx playwright test --project=desktop --update-snapshots`로 생성
  - `frontend/e2e/pc-regression.spec.ts-snapshots/pc-reader-desktop-win32.png`
  - `frontend/e2e/pc-regression.spec.ts-snapshots/pc-reader-ssabi-desktop-win32.png`
  - 재실행(`--update-snapshots` 없이) 2 passed로 안정성 확인
- 환경: Playwright 1.65.0, WebKit, Windows 11. 스냅샷 파일명에 `win32`가 붙으므로 다른 OS에서는 기준선을 다시 만들어야 한다.
