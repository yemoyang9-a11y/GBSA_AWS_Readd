# 모바일 실제 연결 확인(스펙 5.3) — 2026-11-06

## 환경

- 로컬 DB: Docker `readd-pg`(PostgreSQL 17, 127.0.0.1:5433)의 `readd_relationship` DB. 「탁류」 411쪽이 이미 들어 있어 데이터를 새로 채우지 않았다. 확인 후 컨테이너는 원래대로 껐다.
- 로컬 백엔드: 이 워크트리 `backend`를 `ts-node src/index.ts`로 3001번에 띄웠다. 의존성은 lockfile이 같은 본 체크아웃 `backend/node_modules`를 디렉터리 링크로 빌려 썼고(설치 없음), 확인 후 링크만 지웠다.
- AI 키는 가짜 값을 넣었다. **리캡·챗봇의 실제 AI 호출은 하지 않았다**(비용 결정은 사용자 몫, 스펙 5.3).
- 프론트: `VITE_USE_MOCK=false VITE_API_URL=http://localhost:3001`, 새 기기 UUID. Playwright WebKit `iphone-pro-max`.
- 운영 서버·운영 DB는 쓰지 않았다.

## 지나간 흐름 — `frontend/e2e/real-backend.spec.ts` (`REAL_API=1`일 때만 실행)

1. 모바일 서재가 실제 카탈로그(탁류·셜록 홈즈·오늘 밤)를 보여 준다.
2. "읽기 시작" → 첫 진입이라 브리핑 → "이어서 읽기" → 읽기 화면 1/411쪽
3. 옆으로 밀기 → 2쪽, `POST /progress` 2 발생
4. 싸비 → 인물 관계도: 2쪽까지의 인물(정주사·애송이)만 보이고 "2p까지 읽음"
5. 로컬 DB `reading_position`에 그 기기의 `current_page = 2` 저장 확인

결과: 통과. 스크린샷 `docs/validation/2026-11-06-mobile-real-backend-screens/`

## 발견한 것

- 브리핑에서 읽기 화면으로 넘어간 직후, 화면 전환 효과가 도는 동안 보낸 합성 스와이프가 무시됐다(새 기기에서 재현, 3회 중 3회). 전환 효과가 끝나기를 기다린 뒤에는 통과했다. 실제 사용에서는 화면이 바뀐 직후 0.2~0.3초 안에 미는 경우에만 해당할 것으로 본다(실기기 미확인, 확신도 중간). 고칠지는 사용자 피드백 후 정한다.

## 하지 않은 것

- 리캡 생성·챗봇 답변의 실제 AI 호출
- 실제 iPhone(스펙 5.4)
