# 싸비 백엔드 — Fly.io 배포 이미지
#
# @see docs/migration.md — Phase 2 (EC2 + PM2 → Fly.io 컨테이너, 2026-08-29)
#
# 빌드 컨텍스트는 backend/ 다 (모노레포라 저장소 루트가 아니다).
# fly.toml 이 같은 디렉터리에 있으므로 `fly deploy` 를 backend/ 에서 실행한다.

# ---------- 빌드 단계 ----------
FROM node:22-alpine AS builder

WORKDIR /app

# 의존성 먼저 — 소스만 바뀌었을 때 이 레이어를 재사용한다
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- 실행 단계 ----------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# 프로덕션 의존성만 — devDependencies(typescript, jest, eslint 등)를 이미지에 넣지 않는다
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# 마이그레이션 SQL — 컨테이너 안에서 `npm run db:migrate` 를 돌릴 수 있게 남긴다
COPY migrations ./migrations
COPY scripts ./scripts

# 테스트 페이지 (index.ts 가 /test 로 서빙한다). 작아서 넣어 둔다
COPY public ./public

# Supabase 루트 CA — 없으면 프로덕션에서 DB 연결이 통째로 실패한다.
# NODE_ENV=production 이면 database.ts 가 SSL 검증을 켜는데(rejectUnauthorized: true),
# Supabase 는 공인 CA 가 아니라 자체 루트(Supabase Root 2021 CA)로 서명한다.
# 이 파일이 없으면 loadDbCa() 가 undefined 를 돌려 Node 기본 신뢰 저장소로 폴백하고,
# 그 저장소에는 이 CA 가 없으므로 SELF_SIGNED_CERT_IN_CHAIN 으로 거부된다.
# 비밀값이 아니라 공개 루트 인증서이므로 이미지에 구워도 된다.
COPY certs ./certs

# ⚠️ backend/data/ 는 넣지 않는다 (.dockerignore) — 「탁류」 원문 970KB 는 배치
#    파이프라인(장 요약·임베딩 생성)에서만 쓰고 API 서버 런타임에는 필요 없다.
#    배치는 로컬에서 Supabase 를 향해 돌린다.

# 비루트 사용자로 실행 — node 이미지에 이미 있는 계정을 쓴다
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
